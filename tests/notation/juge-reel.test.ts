/**
 * Les juges réels (§7 ; D26 (3), D67) : `pipeline/notation/appel-juge.ts` et ses deux adaptateurs
 * (`juge-anthropic.ts`, `juge-mistral.ts`), sur des doubles de transport seulement. Aucun test ne
 * touche le réseau : `fetch` global est remplacé par un espion qui échoue, l'ouverture de socket est
 * espionnée, et chaque test exige qu'aucun des deux n'ait servi (`doubles-juges-reels.ts`).
 *
 * La charge est construite comme la chaîne la construit, sur le vrai prompt `prompts/judge-1.0.0.md`,
 * lu en mémoire et jamais modifié. La sortie que le double fait rendre au modèle est celle du juge
 * simulé pour cette charge : la même sortie, par le même port, que la chaîne simulée.
 *
 * Cas limites nommés : 2xx valide (deux éditeurs) ; 400, 404 ; 408, 429, 500, 529 à chaque
 * tentative ; 401 et 403 (arrêt, `AccesApiRefuse`) ; 429 puis 200 ; délai d'abandon ; connexion refusée ; 413 ; `model` absent ou différent ;
 * corps non JSON ou non UTF-8 ; texte non JSON, hors format ; sortie coupée ; refus du fournisseur ;
 * refus rédigé par le modèle ; prompt discordant ; politique de tentatives invalide ; modèle discordant.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CATEGORIES_RETENUES } from "../../analysis/types.ts";
import type { MotifRenvoiDefaillance, RenvoiHumain } from "../../analysis/types-notation.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { NomEditeur } from "../../pipeline/extraction/editeur.ts";
import { AccesApiRefuse, AdaptateurDeJugeDiscordant, jugeReel, PolitiqueTentativesInvalide, type AdaptateurJuge, type PolitiqueTentatives } from "../../pipeline/notation/appel-juge.ts";
import { archiveAppelsJuge } from "../../pipeline/notation/archive-appels-juge.ts";
import { construireCharge, type ChargeJuge, type PromptDeJuge } from "../../pipeline/notation/charge-juge.ts";
import { citationsDeReference } from "../../pipeline/notation/extrait.ts";
import { adaptateurJugeAnthropic, ARRET_REFUS_ANTHROPIC } from "../../pipeline/notation/juge-anthropic.ts";
import { adaptateurJugeMistral } from "../../pipeline/notation/juge-mistral.ts";
import { jugesSimules } from "../../pipeline/notation/juge-simule.ts";
import { JugeDefaillant, notationDeJuge, noterOuRenvoyer, type CadreNotationJuge, type IdentiteJuge, type Juge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import { CHAMPS_CONNUS_SORTIE_JUGE, CONTROLES_SORTIE_JUGE, lireSortieJuge } from "../../pipeline/notation/lecture-sortie-juge.ts";
import { lireSourcePromptJuge, rendrePromptJuge, RenduPromptJugeRefuse } from "../../pipeline/notation/rendu-prompt-juge.ts";
import { transportFetch } from "../../pipeline/reformulation/transport-fetch.ts";
import { valider } from "../../outils/schemas/valider.ts";
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
  type EnvoiEnregistre,
  type ReponseDoublee,
} from "./doubles-juges-reels.ts";
import { ALIAS_CANDIDATS_TEST, CADRE_V3, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";
import { ITEM_P } from "./run-fictif.ts";
import { parametresDeReference } from "./simulation.ts";

const garde = interdireLeReseau();

const temporaires: string[] = [];
afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

/* ------------------------------------------------------------------ charge */

const SOURCE = lireSourcePromptJuge(join(RACINE_PROJET, "prompts", "judge-1.0.0.md"));
const PROMPT: PromptDeJuge = { chemin: "prompts/judge-1.0.0", version: "1.0.0" };
const EXEMPLE = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-01-api-obtenue.json"), "utf8")) as ReponseObtenue;
const LIEN = "https://source-simulee.invalid/page";

function reponse(): ReponseObtenue {
  return { ...EXEMPLE, normalise: { ...EXEMPLE.normalise, texte: "Réponse simulée, sans contenu réel.", liens: [LIEN], citations: [{ url: LIEN }] } };
}

function charge(prompt: PromptDeJuge = PROMPT): ChargeJuge {
  const r = reponse();
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

/** La sortie du juge simulé de même rôle (a pour Anthropic, b pour Mistral), pour cette charge. */
async function sortieSimulee(editeur: NomEditeur, c: ChargeJuge): Promise<SortieJuge> {
  const juges = jugesSimules(parametresDeReference().juge_simule, temporaire());
  const juge = juges[editeur === "anthropic" ? 0 : 1];
  if (juge === undefined) throw new Error("juge simulé absent des paramètres de référence");
  return juge.noter(c);
}

function temporaire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-juge-reel-test-"));
  temporaires.push(chemin);
  return chemin;
}

function cadre(c: ChargeJuge, surcharges: Partial<CadreNotationJuge> = {}): CadreNotationJuge {
  return {
    id: "01KBCS0G00SM0R0N0S1M01E001",
    run_id: "01KBCS0G00SM0R0N0S1M01E000",
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: EXEMPLE.id,
    gabarit: c.question.gabarit,
    references_item: [{ item_id: ITEM_P.id, item_version: ITEM_P.version, item_empreinte: ITEM_P.empreinte }],
    date: "2026-12-04T10:00:00+01:00",
    liens: c.reponse.liens,
    existences: new Map([[LIEN, { url_citee: LIEN, verdict_existence: "mort" as const, date_test: "2026-12-04T09:00:00+01:00" }]]),
    textes: { reponse: c.reponse.texte, citations_reference: citationsDeReference([ITEM_P]) },
    ...CADRE_V3,
    ...surcharges,
  };
}

/* ------------------------------------------------------------------ juges */

const EDITEURS: readonly NomEditeur[] = ["anthropic", "mistral"];
const MODELES: Readonly<Record<NomEditeur, string>> = { anthropic: "modele-anthropic-epingle", mistral: "modele-mistral-epingle" };
const ENDPOINTS: Readonly<Record<NomEditeur, string>> = { anthropic: "https://api.anthropic.com/v1/messages", mistral: "https://api.mistral.ai/v1/chat/completions" };
const POLITIQUE: PolitiqueTentatives = { tentatives_max: 3, attentes_avant_reprise_ms: [1_000, 5_000] };

/** Des réglages de test : aucune valeur de production n'est supposée (§7.57). */
const ADAPTATEURS: Readonly<Record<NomEditeur, (modele: string) => AdaptateurJuge>> = {
  anthropic: (modele) => adaptateurJugeAnthropic(modele, { max_tokens: 4_096, effort: "high", delai_abandon_ms: DELAI_ABANDON_MS }, CLE_DE_TEST),
  mistral: (modele) => adaptateurJugeMistral(modele, { temperature: 0, max_tokens: 4_096, random_seed: 7, delai_abandon_ms: DELAI_ABANDON_MS }, CLE_DE_TEST),
};

const ENVELOPPES: Readonly<Record<NomEditeur, (texte: string, modele: string, surcharges?: Readonly<Record<string, unknown>>) => Readonly<Record<string, unknown>>>> = {
  anthropic: enveloppeAnthropic,
  mistral: enveloppeMistral,
};

function identite(editeur: NomEditeur): IdentiteJuge {
  return { juge_id: `juge-${editeur}`, famille_modele: `famille-${editeur}`, modele: MODELES[editeur], prompt: PROMPT };
}

interface Banc {
  readonly juge: Juge;
  readonly envois: EnvoiEnregistre[];
  readonly reprises: number[];
}

function banc(editeur: NomEditeur, reponses: readonly ReponseDoublee[], options = { delai_ecoule: false }): Banc {
  const { envoi, envois } = envoiDouble(reponses);
  const { attendre, reprises } = attenteDeTest(options);
  const juge = jugeReel({
    identite: identite(editeur),
    source_prompt: SOURCE,
    adaptateur: ADAPTATEURS[editeur](MODELES[editeur]),
    transport: transportFetch(envoi),
    politique: POLITIQUE,
    delai_abandon_ms: DELAI_ABANDON_MS,
    attendre,
    archive: archiveAppelsJuge(temporaire(), () => 0),
  });
  return { juge, envois, reprises };
}

/** La réponse 2xx de l'éditeur dont le texte est `texte`, servie par le modèle épinglé. */
function succes(editeur: NomEditeur, texte: string, surcharges: Readonly<Record<string, unknown>> = {}): ReponseDoublee {
  return json(200, ENVELOPPES[editeur](texte, MODELES[editeur], surcharges));
}

/** Le `JugeDefaillant` levé par `noter`, ou un échec du test s'il n'y en a pas. */
async function defaillance(juge: Juge, c: ChargeJuge = charge()): Promise<JugeDefaillant> {
  const leve: unknown = await juge.noter(c).then(
    () => new Error("le juge aurait dû être défaillant"),
    (erreur: unknown) => erreur,
  );
  if (leve instanceof JugeDefaillant) return leve;
  throw leve;
}

async function attendreDefaillance(juge: Juge, motif: MotifRenvoiDefaillance): Promise<JugeDefaillant> {
  const leve = await defaillance(juge);
  expect(leve.motif).toBe(motif);
  expect(leve.message).not.toContain(CLE_DE_TEST);
  return leve;
}

/* ------------------------------------------------------------------ tests */

describe("juge réel : une réponse 2xx valide", () => {
  it.each(EDITEURS)("2xx valide (%s) : la sortie est le texte du modèle, lu tel quel ; sa notation est conforme au schéma", async (editeur) => {
    const c = charge();
    const attendue = await sortieSimulee(editeur, c);
    const { juge, envois } = banc(editeur, [succes(editeur, JSON.stringify(attendue))]);

    const sortie = await juge.noter(c);

    expect(sortie).toEqual(attendue);
    expect(envois).toHaveLength(1);
    valider("notation", notationDeJuge(juge.identite, sortie, cadre(c)), `notation du juge réel ${editeur}`);
  });

  it.each(EDITEURS)("la requête (%s) : le prompt rendu depuis prompts/judge-1.0.0 est le seul message, le modèle est l'épinglé, rien de l'outil noté", async (editeur) => {
    const c = charge();
    const { juge, envois } = banc(editeur, [succes(editeur, JSON.stringify(await sortieSimulee(editeur, c)))]);

    await juge.noter(c);

    const [envoi] = envois;
    expect(envoi?.url).toBe(ENDPOINTS[editeur]);
    expect(envoi?.corps["model"]).toBe(MODELES[editeur]);
    expect(envoi?.corps["messages"]).toEqual([{ role: "user", content: rendrePromptJuge(SOURCE, c) }]);
    expect(envoi?.corps).not.toHaveProperty("system");
    const corps = JSON.stringify(envoi?.corps);
    for (const identifiant of [EXEMPLE.outil_id, EXEMPLE.requete.endpoint, CLE_DE_TEST]) expect(corps).not.toContain(identifiant);
    expect(JSON.stringify(envoi?.entetes)).toContain(CLE_DE_TEST);
  });

  it("garde réseau : fetch global et l'ouverture de socket sont espionnés, et un juge réel ne s'en sert pas", async () => {
    expect(globalThis.fetch).toBe(garde.fetch_global());
    const c = charge();
    await banc("anthropic", [succes("anthropic", JSON.stringify(await sortieSimulee("anthropic", c)))]).juge.noter(c);
    expect(garde.fetch_global()).not.toHaveBeenCalled();
    expect(garde.connexions()).not.toHaveBeenCalled();
  });
});

describe("juge réel : statuts HTTP et transport", () => {
  it.each([401, 403])("statut %i : AccesApiRefuse, défaut du banc et non JugeDefaillant ; un seul appel ; noterOuRenvoyer ne le convertit pas en renvoi", async (statut) => {
    for (const editeur of EDITEURS) {
      const corps = { type: "error", error: { type: "authentication_error", message: `accès refusé ${statut}` } };
      const { juge, envois, reprises } = banc(editeur, [json(statut, corps)]);
      const c = charge();
      const leve: unknown = await noterOuRenvoyer(juge, c, cadre(c)).then(
        () => new Error("la notation aurait dû s'arrêter"),
        (erreur: unknown) => erreur,
      );
      expect(leve).toBeInstanceOf(AccesApiRefuse);
      expect(leve).not.toBeInstanceOf(JugeDefaillant);
      expect((leve as AccesApiRefuse).statut).toBe(statut);
      expect((leve as Error).message).toContain(`accès refusé ${statut}`);
      expect((leve as Error).message).not.toContain(CLE_DE_TEST);
      expect(envois).toHaveLength(1);
      expect(reprises).toEqual([]);
    }
  });

  it.each([400, 404])("statut %i : un seul appel, erreur_api_persistante, le message de l'API en détail", async (statut) => {
    for (const editeur of EDITEURS) {
      const { juge, envois, reprises } = banc(editeur, [json(statut, { type: "error", error: { type: "x", message: `refus ${statut} de l'API` } })]);
      const leve = await attendreDefaillance(juge, "erreur_api_persistante");
      expect(leve.message).toContain(`refus ${statut} de l'API`);
      expect(envois).toHaveLength(1);
      expect(reprises).toEqual([]);
    }
  });

  it.each([408, 429, 500, 529])("statut %i à chaque tentative : tentatives_max appels, les attentes déclarées, puis erreur_api_persistante", async (statut) => {
    for (const editeur of EDITEURS) {
      const { juge, envois, reprises } = banc(editeur, [http(statut, "surchargé")]);
      const leve = await attendreDefaillance(juge, "erreur_api_persistante");
      expect(envois).toHaveLength(POLITIQUE.tentatives_max);
      expect(reprises).toEqual(POLITIQUE.attentes_avant_reprise_ms);
      expect(leve.message).toContain(`tentative ${POLITIQUE.tentatives_max} : réponse HTTP ${statut}`);
    }
  });

  it("429 puis 200 : la reprise aboutit, après une seule attente", async () => {
    const c = charge();
    const attendue = await sortieSimulee("mistral", c);
    const { juge, envois, reprises } = banc("mistral", [http(429, ""), succes("mistral", JSON.stringify(attendue))]);
    expect(await juge.noter(c)).toEqual(attendue);
    expect(envois).toHaveLength(2);
    expect(reprises).toEqual([1_000]);
  });

  it("délai d'abandon écoulé à chaque tentative : erreur_api_persistante", async () => {
    const { juge, envois } = banc("anthropic", [sansReponse()], { delai_ecoule: true });
    const leve = await attendreDefaillance(juge, "erreur_api_persistante");
    expect(envois).toHaveLength(POLITIQUE.tentatives_max);
    expect(leve.message).toContain(`${DELAI_ABANDON_MS} ms`);
  });

  it("connexion refusée à chaque tentative : erreur_api_persistante, la cause en détail", async () => {
    const { juge, envois } = banc("mistral", [connexionRefusee()]);
    const leve = await attendreDefaillance(juge, "erreur_api_persistante");
    expect(envois).toHaveLength(POLITIQUE.tentatives_max);
    expect(leve.message).toContain("ECONNREFUSED");
  });

  it("413 : contexte_depasse chez Anthropic (request_too_large) ; chez Mistral, qui n'en documente aucun, erreur_api_persistante", async () => {
    const corps = { type: "error", error: { type: "request_too_large", message: "trop long" } };
    await attendreDefaillance(banc("anthropic", [json(413, corps)]).juge, "contexte_depasse");
    await attendreDefaillance(banc("mistral", [json(413, corps)]).juge, "erreur_api_persistante");
  });
});

describe("juge réel : lecture de la réponse 2xx", () => {
  async function sortieValide(editeur: NomEditeur): Promise<string> {
    return JSON.stringify(await sortieSimulee(editeur, charge()));
  }

  it.each(EDITEURS)("model absent (%s) : sortie_illisible, rien n'atteste le modèle épinglé", async (editeur) => {
    const sansModele = { ...ENVELOPPES[editeur](await sortieValide(editeur), MODELES[editeur]) };
    delete sansModele["model"];
    const leve = await attendreDefaillance(banc(editeur, [json(200, sansModele)]).juge, "sortie_illisible");
    expect(leve.message).toContain("sans champ model");
  });

  it.each(EDITEURS)("model différent de l'épinglé (%s) : sortie_illisible", async (editeur) => {
    const autre = json(200, ENVELOPPES[editeur](await sortieValide(editeur), `${MODELES[editeur]}-repli`));
    const leve = await attendreDefaillance(banc(editeur, [autre]).juge, "sortie_illisible");
    expect(leve.message).toContain("-repli");
  });

  it.each(EDITEURS)("corps non JSON, corps non UTF-8 (%s) : sortie_illisible", async (editeur) => {
    await attendreDefaillance(banc(editeur, [http(200, "<html>passerelle</html>")]).juge, "sortie_illisible");
    await attendreDefaillance(banc(editeur, [http(200, new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]))]).juge, "sortie_illisible");
  });

  it.each(EDITEURS)("texte du modèle non JSON, en bloc de code, ou JSON qui n'est pas un objet (%s) : sortie_illisible", async (editeur) => {
    const valide = await sortieValide(editeur);
    for (const texte of ["Voici ma note : exacte.", `\`\`\`json\n${valide}\n\`\`\``, "[]"]) {
      await attendreDefaillance(banc(editeur, [succes(editeur, texte)]).juge, "sortie_illisible");
    }
  });

  it.each(EDITEURS)("sortie hors format (%s) : champ inconnu, catégorie inconnue, sourcage absent : sortie_illisible", async (editeur) => {
    const valide = JSON.parse(await sortieValide(editeur)) as Record<string, unknown>;
    const { sourcage: _retire, ...sansSourcage } = valide;
    for (const objet of [{ ...valide, confiance: 0.9 }, { ...valide, categorie: "plutot_exacte" }, sansSourcage]) {
      await attendreDefaillance(banc(editeur, [succes(editeur, JSON.stringify(objet))]).juge, "sortie_illisible");
    }
  });

  it("sortie coupée : stop_reason max_tokens (Anthropic), finish_reason length (Mistral) : sortie_illisible", async () => {
    await attendreDefaillance(banc("anthropic", [succes("anthropic", "{\"categorie\":", { stop_reason: "max_tokens" })]).juge, "sortie_illisible");
    const coupee = enveloppeMistral("{\"categorie\":", MODELES.mistral, {});
    const choix = { ...(coupee["choices"] as Record<string, unknown>[])[0], finish_reason: "length" };
    await attendreDefaillance(banc("mistral", [json(200, { ...coupee, choices: [choix] })]).juge, "sortie_illisible");
  });

  it("refus du fournisseur (Anthropic, stop_reason refusal) : sortie_refusee ; noterOuRenvoyer en fait un renvoi humain motivé, la notation continue", async () => {
    const refus = succes("anthropic", "", { stop_reason: ARRET_REFUS_ANTHROPIC, stop_details: { type: "refusal" } });
    await attendreDefaillance(banc("anthropic", [refus]).juge, "sortie_refusee");

    const c = charge();
    const issue = await noterOuRenvoyer(banc("anthropic", [refus]).juge, c, cadre(c));
    if (issue.type !== "renvoi") throw new Error(`renvoi attendu, reçu ${issue.type}`);
    const renvoi = valider<RenvoiHumain>("renvoi-humain", issue.renvoi, "renvoi du juge réel");
    expect(renvoi).toMatchObject({ motif: "sortie_refusee" });
  });

  it("un refus rédigé par le modèle Mistral (texte libre, sans signal d'enveloppe) : sortie_illisible, rien n'est deviné du texte", async () => {
    await attendreDefaillance(banc("mistral", [succes("mistral", "Je ne peux pas évaluer cette réponse.")]).juge, "sortie_illisible");
  });

  it.each(EDITEURS)("chaque défaillance, convertie par noterOuRenvoyer, donne un renvoi conforme au schéma (%s)", async (editeur) => {
    for (const reponses of [[http(500, "")], [http(400, "")], [succes(editeur, "pas du json")]]) {
      const c = charge();
      const issue = await noterOuRenvoyer(banc(editeur, reponses).juge, c, cadre(c));
      if (issue.type !== "renvoi") throw new Error(`renvoi attendu, reçu ${issue.type}`);
      valider<RenvoiHumain>("renvoi-humain", issue.renvoi, `renvoi du juge réel ${editeur}`);
    }
  });
});

describe("juge réel : ce qui n'est pas une défaillance du juge", () => {
  it("prompt discordant : RenduPromptJugeRefuse remonte, avant tout appel, et noterOuRenvoyer ne le convertit pas", async () => {
    const discordante = charge({ chemin: "prompts/judge-9.9.9", version: "9.9.9" });
    const { juge, envois } = banc("anthropic", [http(500, "")]);
    await expect(juge.noter(discordante)).rejects.toBeInstanceOf(RenduPromptJugeRefuse);
    await expect(noterOuRenvoyer(juge, discordante, cadre(discordante))).rejects.toBeInstanceOf(RenduPromptJugeRefuse);
    expect(envois).toEqual([]);
  });

  it("politique de tentatives invalide : refusée à la construction, aucun appel", () => {
    const declaration = {
      identite: identite("mistral"),
      source_prompt: SOURCE,
      adaptateur: ADAPTATEURS.mistral(MODELES.mistral),
      transport: transportFetch(envoiDouble([http(200, "")]).envoi),
      delai_abandon_ms: DELAI_ABANDON_MS,
      attendre: attenteDeTest().attendre,
      archive: archiveAppelsJuge(temporaire(), () => 0),
    };
    for (const politique of [
      { tentatives_max: 0, attentes_avant_reprise_ms: [] },
      { tentatives_max: 1.5, attentes_avant_reprise_ms: [] },
      { tentatives_max: 3, attentes_avant_reprise_ms: [1_000] },
      { tentatives_max: 2, attentes_avant_reprise_ms: [-1] },
    ]) {
      expect(() => jugeReel({ ...declaration, politique })).toThrow(PolitiqueTentativesInvalide);
    }
    expect(() => jugeReel({ ...declaration, politique: POLITIQUE, delai_abandon_ms: 0 })).toThrow(PolitiqueTentativesInvalide);
  });

  it("modèle de l'adaptateur discordant avec l'identité du run : refusé à la construction", () => {
    expect(() =>
      jugeReel({
        identite: identite("anthropic"),
        source_prompt: SOURCE,
        adaptateur: ADAPTATEURS.anthropic("un-autre-modele"),
        transport: transportFetch(envoiDouble([http(200, "")]).envoi),
        politique: POLITIQUE,
        delai_abandon_ms: DELAI_ABANDON_MS,
        attendre: attenteDeTest().attendre,
        archive: archiveAppelsJuge(temporaire(), () => 0),
      }),
    ).toThrow(AdaptateurDeJugeDiscordant);
  });
});

describe("lecture de la sortie d'un juge", () => {
  it("chaque champ connu a son contrôle, et rien d'autre n'en a", () => {
    expect(Object.keys(CONTROLES_SORTIE_JUGE).sort()).toEqual([...CHAMPS_CONNUS_SORTIE_JUGE].sort());
  });

  it("lit la forme ordinaire et la forme d'attribution, telles quelles", () => {
    const ordinaire = { categorie: CATEGORIES_RETENUES[0], drapeaux: [], sourcage: { cite: false, soutiens: [] } };
    const attribution = { noms_cites: ["a"], non_reponse: false, sourcage: { cite: true, soutiens: [{ url_citee: LIEN, verdict_soutien: "ne_soutient_pas" }] } };
    expect(lireSortieJuge(JSON.stringify(ordinaire))).toEqual({ lisible: true, sortie: ordinaire });
    expect(lireSortieJuge(JSON.stringify(attribution))).toEqual({ lisible: true, sortie: attribution });
  });

  it("refuse, avec sa raison, un objet sans aucune des deux formes, un soutien mal formé, un extrait à la provenance inconnue", () => {
    const sourcage = { cite: false, soutiens: [] };
    expect(lireSortieJuge(JSON.stringify({ sourcage }))).toMatchObject({ lisible: false, raison: expect.stringContaining("aucune des deux formes") });
    expect(lireSortieJuge(JSON.stringify({ categorie: "exacte", drapeaux: [], sourcage: { cite: true, soutiens: [{ url_citee: LIEN }] } }))).toMatchObject({ lisible: false });
    expect(lireSortieJuge(JSON.stringify({ categorie: "exacte", drapeaux: [], sourcage, extrait_justificatif: { provenance: "ailleurs", texte: "x" } }))).toMatchObject({ lisible: false });
  });
});
