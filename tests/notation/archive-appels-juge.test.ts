/**
 * L'archive des réponses HTTP brutes des juges réels (§7, D100 ; `pipeline/notation/archive-appels-juge.ts`),
 * sur des doubles de transport seulement : aucun test ne touche le réseau
 * (`doubles-juges-reels.ts:interdireLeReseau`), aucune clé réelle.
 *
 * Cas limites nommés : 2xx valide ; statuts en erreur 400, 413, 401 et 403 (accès refusé, arrêt) ; 500
 * à chaque tentative ; 429 puis 200 (tentative rejouée) ; corps non UTF-8 ; corps vide ; connexion
 * refusée ; délai d'abandon ; archive qui refuse d'écrire (rien n'est lu) ; relance du même juge sur le
 * même objet (appel 2, appel 1 intact) ; nom déjà pris (jamais remplacé) ; refus avant tout appel (rien
 * n'est créé) ; aucune clé d'API dans l'archive.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { NomEditeur } from "../../pipeline/extraction/editeur.ts";
import { AccesApiRefuse, jugeReel, type AdaptateurJuge, type PolitiqueTentatives } from "../../pipeline/notation/appel-juge.ts";
import {
  AppelJugeDejaArchive,
  archiveAppelsJuge,
  empreinteAppelJuge,
  nomMetadonneesAppel,
  nomOctetsAppel,
  repertoireAppelsJuges,
  type ArchiveAppelsJuge,
  type MetadonneesAppelJuge,
} from "../../pipeline/notation/archive-appels-juge.ts";
import { construireCharge, type ChargeJuge, type PromptDeJuge } from "../../pipeline/notation/charge-juge.ts";
import { adaptateurJugeAnthropic } from "../../pipeline/notation/juge-anthropic.ts";
import { adaptateurJugeMistral } from "../../pipeline/notation/juge-mistral.ts";
import { jugesSimules } from "../../pipeline/notation/juge-simule.ts";
import { JugeDefaillant, type Juge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import { lireSourcePromptJuge, RenduPromptJugeRefuse } from "../../pipeline/notation/rendu-prompt-juge.ts";
import { transportFetch } from "../../pipeline/reformulation/transport-fetch.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import {
  attenteDeTest,
  CLE_DE_TEST,
  connexionRefusee,
  DELAI_ABANDON_MS,
  enveloppeAnthropic,
  enveloppeMistral,
  envoiDouble,
  http,
  interdireLeReseau,
  json,
  sansReponse,
  type ReponseDoublee,
} from "./doubles-juges-reels.ts";
import { ALIAS_CANDIDATS_TEST, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";
import { ITEM_P } from "./run-fictif.ts";
import { parametresDeReference } from "./simulation.ts";

interdireLeReseau();

const temporaires: string[] = [];
afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function temporaire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-archive-juge-test-"));
  temporaires.push(chemin);
  return chemin;
}

/* ------------------------------------------------------------------ charge et juge */

const SOURCE = lireSourcePromptJuge(join(RACINE_PROJET, "prompts", "judge-1.0.0.md"));
const PROMPT: PromptDeJuge = { chemin: "prompts/judge-1.0.0", version: "1.0.0" };
const EXEMPLE = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-01-api-obtenue.json"), "utf8")) as ReponseObtenue;
const LIEN = "https://source-simulee.invalid/page";
const MODELES: Readonly<Record<NomEditeur, string>> = { anthropic: "modele-anthropic-epingle", mistral: "modele-mistral-epingle" };
const POLITIQUE: PolitiqueTentatives = { tentatives_max: 3, attentes_avant_reprise_ms: [1_000, 5_000] };

const ADAPTATEURS: Readonly<Record<NomEditeur, () => AdaptateurJuge>> = {
  anthropic: () => adaptateurJugeAnthropic(MODELES.anthropic, { max_tokens: 4_096, effort: "high", delai_abandon_ms: DELAI_ABANDON_MS }, CLE_DE_TEST),
  mistral: () => adaptateurJugeMistral(MODELES.mistral, { temperature: 0, max_tokens: 4_096, random_seed: 7, delai_abandon_ms: DELAI_ABANDON_MS }, CLE_DE_TEST),
};

function charge(prompt: PromptDeJuge = PROMPT): ChargeJuge {
  const r: ReponseObtenue = { ...EXEMPLE, normalise: { ...EXEMPLE.normalise, texte: "Réponse simulée, sans contenu réel.", liens: [LIEN], citations: [{ url: LIEN }] } };
  return construireCharge({
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Question simulée, sans contenu réel." },
    references: [{ item: ITEM_P, role: "principal" }],
    date_run: GEL_DES_TESTS,
    prompt,
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(r.normalise.liens),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  });
}

async function sortieSimulee(editeur: NomEditeur, c: ChargeJuge): Promise<SortieJuge> {
  const juge = jugesSimules(parametresDeReference().juge_simule, temporaire())[editeur === "anthropic" ? 0 : 1];
  if (juge === undefined) throw new Error("juge simulé absent des paramètres de référence");
  return juge.noter(c);
}

/** Une horloge qui avance de 10 ms à chaque lecture : les instants gardés sont distincts et croissants. */
function horlogeDeTest(): () => number {
  let instant = 1_765_000_000_000;
  return () => (instant += 10);
}

interface OptionsBanc {
  readonly delai_ecoule?: boolean;
  readonly repertoire_run?: string;
  readonly archive?: ArchiveAppelsJuge;
}

interface Banc {
  readonly juge: Juge;
  readonly repertoire_run: string;
  readonly envois: () => number;
}

function banc(editeur: NomEditeur, reponses: readonly ReponseDoublee[], options: OptionsBanc = {}): Banc {
  const { envoi, envois } = envoiDouble(reponses);
  const repertoire_run = options.repertoire_run ?? temporaire();
  const juge = jugeReel({
    identite: { juge_id: `juge-${editeur}`, famille_modele: `famille-${editeur}`, modele: MODELES[editeur], prompt: PROMPT },
    source_prompt: SOURCE,
    adaptateur: ADAPTATEURS[editeur](),
    transport: transportFetch(envoi),
    politique: POLITIQUE,
    delai_abandon_ms: DELAI_ABANDON_MS,
    attendre: attenteDeTest({ delai_ecoule: options.delai_ecoule ?? false }).attendre,
    archive: options.archive ?? archiveAppelsJuge(repertoire_run, horlogeDeTest()),
  });
  return { juge, repertoire_run, envois: () => envois.length };
}

function succes(editeur: NomEditeur, texte: string): ReponseDoublee {
  const enveloppe = editeur === "anthropic" ? enveloppeAnthropic(texte, MODELES[editeur]) : enveloppeMistral(texte, MODELES[editeur]);
  return json(200, enveloppe);
}

/* ------------------------------------------------------------------ lecture de l'archive */

function cleDe(editeur: NomEditeur, c: ChargeJuge = charge()): { readonly juge_id: string; readonly reponse_id: string } {
  return { juge_id: `juge-${editeur}`, reponse_id: c.reponse_id };
}

function fichiersArchives(repertoire_run: string): readonly string[] {
  const dossier = repertoireAppelsJuges(repertoire_run);
  return existsSync(dossier) ? readdirSync(dossier).sort() : [];
}

/** Les métadonnées gardées, validées contre `schema/appel-juge.schema.json`. */
function metadonnees(repertoire_run: string, nom: string): MetadonneesAppelJuge {
  return valider<MetadonneesAppelJuge>("appel-juge", JSON.parse(readFileSync(join(repertoireAppelsJuges(repertoire_run), nom), "utf8")), nom);
}

function octets(repertoire_run: string, nom: string): Buffer {
  return readFileSync(join(repertoireAppelsJuges(repertoire_run), nom));
}

function sha256Octets(contenu: Uint8Array): string {
  return createHash("sha256").update(contenu).digest("hex");
}

/** L'issue de `noter`, sans exiger son genre : la sortie, ou l'erreur levée. */
async function issueDe(juge: Juge, c: ChargeJuge = charge()): Promise<unknown> {
  return juge.noter(c).then(
    (sortie) => sortie,
    (erreur: unknown) => erreur,
  );
}

/* ------------------------------------------------------------------ tests */

describe("archive des appels de juge (D100) : une réponse HTTP reçue", () => {
  it.each(["anthropic", "mistral"] as const)("2xx valide (%s) : métadonnées conformes au schéma puis octets exacts ; empreinte, taille et identifiants vérifiables ; aucune clé", async (editeur) => {
    const c = charge();
    const attendue = await sortieSimulee(editeur, c);
    const corps = JSON.stringify(editeur === "anthropic" ? enveloppeAnthropic(JSON.stringify(attendue), MODELES[editeur]) : enveloppeMistral(JSON.stringify(attendue), MODELES[editeur]));
    const { juge, repertoire_run } = banc(editeur, [http(200, corps)]);

    expect(await juge.noter(c)).toEqual(attendue);

    const cle = cleDe(editeur, c);
    expect(fichiersArchives(repertoire_run)).toEqual([nomMetadonneesAppel(cle, 1, 1), nomOctetsAppel(cle, 1, 1)]);
    const meta = metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, 1));
    const recus = octets(repertoire_run, nomOctetsAppel(cle, 1, 1));
    expect(recus.toString("utf8")).toBe(corps);
    expect(meta).toMatchObject({
      juge_id: `juge-${editeur}`,
      reponse_id: c.reponse_id,
      modele: MODELES[editeur],
      version_prompt: "prompts/judge-1.0.0@1.0.0",
      version_charge: c.version_charge,
      appel: 1,
      tentative: 1,
      endpoint: ADAPTATEURS[editeur]().construireRequete("x").endpoint,
      issue: "reponse_http",
      statut_http: 200,
      octets_sha256: sha256Octets(recus),
      taille_octets: recus.length,
    });
    expect(meta.fin_ms).toBeGreaterThan(meta.debut_ms);
    expect(empreinteAppelJuge(cle)).toBe(createHash("sha256").update(canoniser(cle), "utf8").digest("hex"));
    for (const nom of fichiersArchives(repertoire_run)) expect(octets(repertoire_run, nom).toString("utf8")).not.toContain(CLE_DE_TEST);
  });

  it.each([
    { statut: 400, attendu: JugeDefaillant },
    { statut: 413, attendu: JugeDefaillant },
    { statut: 401, attendu: AccesApiRefuse },
    { statut: 403, attendu: AccesApiRefuse },
  ])("statut $statut : la réponse en erreur est gardée telle quelle avant d'être lue, puis l'erreur attendue", async ({ statut, attendu }) => {
    const corps = JSON.stringify({ type: "error", error: { type: "x", message: `refus ${statut}` } });
    const { juge, repertoire_run } = banc("anthropic", [http(statut, corps)]);

    expect(await issueDe(juge)).toBeInstanceOf(attendu);

    const cle = cleDe("anthropic");
    expect(fichiersArchives(repertoire_run)).toEqual([nomMetadonneesAppel(cle, 1, 1), nomOctetsAppel(cle, 1, 1)]);
    expect(metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, 1))).toMatchObject({ issue: "reponse_http", statut_http: statut, tentative: 1 });
    expect(octets(repertoire_run, nomOctetsAppel(cle, 1, 1)).toString("utf8")).toBe(corps);
  });

  it("corps non UTF-8 et corps vide : les octets gardés sont ceux reçus, à l'octet près, puis sortie_illisible", async () => {
    for (const corps of [new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]), new Uint8Array([])]) {
      const { juge, repertoire_run } = banc("mistral", [http(200, corps)]);
      expect(await issueDe(juge)).toMatchObject({ motif: "sortie_illisible" });
      const cle = cleDe("mistral");
      expect([...octets(repertoire_run, nomOctetsAppel(cle, 1, 1))]).toEqual([...corps]);
      expect(metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, 1))).toMatchObject({ taille_octets: corps.length, octets_sha256: sha256Octets(corps) });
    }
  });
});

describe("archive des appels de juge (D100) : tentatives rejouées et échecs de transport", () => {
  it("500 à chaque tentative : un couple par tentative, même appel, tentatives 1 à tentatives_max, instants croissants", async () => {
    const { juge, repertoire_run, envois } = banc("anthropic", [http(500, "surchargé")]);
    expect(await issueDe(juge)).toMatchObject({ motif: "erreur_api_persistante" });

    const cle = cleDe("anthropic");
    expect(envois()).toBe(POLITIQUE.tentatives_max);
    const rangs = [1, 2, 3];
    expect(fichiersArchives(repertoire_run)).toEqual(rangs.flatMap((t) => [nomMetadonneesAppel(cle, 1, t), nomOctetsAppel(cle, 1, t)]).sort());
    const metas = rangs.map((t) => metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, t)));
    expect(metas.map((m) => [m.appel, m.tentative, m.issue === "reponse_http" ? m.statut_http : null])).toEqual(rangs.map((t) => [1, t, 500]));
    for (let rang = 1; rang < metas.length; rang += 1) expect((metas[rang] as MetadonneesAppelJuge).debut_ms).toBeGreaterThan((metas[rang - 1] as MetadonneesAppelJuge).fin_ms);
    for (const t of rangs) expect(octets(repertoire_run, nomOctetsAppel(cle, 1, t)).toString("utf8")).toBe("surchargé");
  });

  it("429 puis 200 : la tentative rejetée et la tentative rejouée sont gardées toutes les deux", async () => {
    const c = charge();
    const attendue = await sortieSimulee("mistral", c);
    const { juge, repertoire_run } = banc("mistral", [http(429, "trop de requêtes"), succes("mistral", JSON.stringify(attendue))]);
    expect(await juge.noter(c)).toEqual(attendue);

    const cle = cleDe("mistral", c);
    expect(metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, 1))).toMatchObject({ statut_http: 429, tentative: 1 });
    expect(metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, 2))).toMatchObject({ statut_http: 200, tentative: 2 });
    expect(octets(repertoire_run, nomOctetsAppel(cle, 1, 1)).toString("utf8")).toBe("trop de requêtes");
  });

  it("connexion refusée, délai d'abandon : sans_reponse avec sa raison, aucun octet, une entrée par tentative", async () => {
    const cas = [
      { editeur: "mistral" as const, reponses: [connexionRefusee()], delai_ecoule: false, raison: "ECONNREFUSED" },
      { editeur: "anthropic" as const, reponses: [sansReponse()], delai_ecoule: true, raison: `${DELAI_ABANDON_MS} ms` },
    ];
    for (const { editeur, reponses, delai_ecoule, raison } of cas) {
      const { juge, repertoire_run } = banc(editeur, reponses, { delai_ecoule });
      expect(await issueDe(juge)).toMatchObject({ motif: "erreur_api_persistante" });
      const cle = cleDe(editeur);
      expect(fichiersArchives(repertoire_run)).toEqual([1, 2, 3].map((t) => nomMetadonneesAppel(cle, 1, t)));
      for (const t of [1, 2, 3]) {
        const meta = metadonnees(repertoire_run, nomMetadonneesAppel(cle, 1, t));
        expect(meta.issue).toBe("sans_reponse");
        expect(meta.issue === "sans_reponse" ? meta.raison : "").toContain(raison);
        expect(JSON.stringify(meta)).not.toContain(CLE_DE_TEST);
      }
    }
  });

  it("relance du même juge sur le même objet (après un 401) : appel 2, l'appel 1 gardé intact à l'octet près", async () => {
    const repertoire_run = temporaire();
    const c = charge();
    const refuse = banc("anthropic", [json(401, { error: { message: "clé invalide" } })], { repertoire_run });
    expect(await issueDe(refuse.juge, c)).toBeInstanceOf(AccesApiRefuse);
    const cle = cleDe("anthropic", c);
    const avant = fichiersArchives(repertoire_run).map((nom) => [nom, octets(repertoire_run, nom).toString("hex")]);

    const attendue = await sortieSimulee("anthropic", c);
    const corrige = banc("anthropic", [succes("anthropic", JSON.stringify(attendue))], { repertoire_run });
    expect(await corrige.juge.noter(c)).toEqual(attendue);

    expect(metadonnees(repertoire_run, nomMetadonneesAppel(cle, 2, 1))).toMatchObject({ appel: 2, tentative: 1, statut_http: 200 });
    for (const [nom, hex] of avant) expect(octets(repertoire_run, nom as string).toString("hex")).toBe(hex);
    expect(fichiersArchives(repertoire_run)).toHaveLength(4);
  });
});

describe("archive des appels de juge (D100) : écrite avant toute lecture, jamais remplacée", () => {
  it("une archive qui refuse d'écrire arrête la notation avec son erreur : ni sortie, ni JugeDefaillant, aucune lecture", async () => {
    const c = charge();
    const valide = succes("anthropic", JSON.stringify(await sortieSimulee("anthropic", c)));
    const recus: Uint8Array[] = [];
    const refus = new Error("disque plein (double)");
    const archive: ArchiveAppelsJuge = {
      ouvrir: () => ({
        numero: 1,
        partir: () => ({
          recue: (reponse) => {
            recus.push(reponse.corps);
            throw refus;
          },
          sansReponse: () => {
            throw refus;
          },
        }),
      }),
    };
    for (const reponses of [[valide], [http(200, "pas du json")], [http(500, "")]]) {
      recus.length = 0;
      const { juge, envois } = banc("anthropic", reponses, { archive });
      expect(await issueDe(juge, c)).toBe(refus);
      expect(envois()).toBe(1);
      expect(recus).toHaveLength(1);
    }
  });

  it("un nom déjà pris n'est jamais remplacé : AppelJugeDejaArchive, le fichier en place intact, la notation s'arrête", async () => {
    const repertoire_run = temporaire();
    const cle = cleDe("anthropic");
    mkdirSync(repertoireAppelsJuges(repertoire_run), { recursive: true });
    const chemin = join(repertoireAppelsJuges(repertoire_run), nomOctetsAppel(cle, 1, 1));
    writeFileSync(chemin, "octets d'un autre écrivain");

    const { juge } = banc("anthropic", [http(500, "surchargé")], { repertoire_run });
    expect(await issueDe(juge)).toBeInstanceOf(AppelJugeDejaArchive);
    expect(readFileSync(chemin, "utf8")).toBe("octets d'un autre écrivain");
  });

  it("refus avant tout appel (prompt discordant) : aucun dossier d'archive n'est créé", async () => {
    const { juge, repertoire_run, envois } = banc("anthropic", [http(500, "")]);
    expect(await issueDe(juge, charge({ chemin: "prompts/judge-9.9.9", version: "9.9.9" }))).toBeInstanceOf(RenduPromptJugeRefuse);
    expect(envois()).toBe(0);
    expect(existsSync(repertoireAppelsJuges(repertoire_run))).toBe(false);
  });
});
