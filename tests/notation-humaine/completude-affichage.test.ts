/**
 * Complétude de l'affichage de la notation humaine (D18 : « un humain reçoit exactement ce que reçoit
 * un juge »). Le client recopie la vue dans ses propres types (`client/types.ts`) et l'affiche champ
 * par champ ; rien ne détectait un champ ajouté à la `VueAnnotateur` et non affiché. Cette garde le
 * détecte : elle énumère les feuilles d'une vue réelle (`construireVue`), puis exige de chacune, hors
 * `CHAMPS_NON_AFFICHES`, qu'elle se lise dans le contenu (`contenuVue`, pure, sans DOM) et que sa
 * modification change ce contenu. Pas de jsdom : le DOM n'est qu'une projection de ce contenu.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aplatir, CHAMPS_NON_AFFICHES, contenuVue, type Bloc } from "../../notation-humaine/client/contenu-vue.ts";
import type { Vue } from "../../notation-humaine/client/types.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { tableAliasCandidats } from "../../pipeline/notation/alias-candidats.ts";
import { construireVue, type ExistenceEtablie, type VueAnnotateur } from "../../pipeline/notation/vue-annotateur.ts";
import { GENERATEUR_DU_TIRAGE } from "../../pipeline/questions/tirage.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { itemO, itemP } from "../aides/fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const LIEN_A = "https://exemple.invalid/sentinelle-lien-a";
const LIEN_B = "https://exemple.invalid/sentinelle-lien-b";

/** D18 : l'humain reçoit la même charge aliasée que le juge (§7, D55 (9)) ; graine de test locale. */
const ALIAS_CANDIDATS = tableAliasCandidats(
  [{ candidat_id: "demo-alpha" }, { candidat_id: "sentinelle-candidat-a" }, { candidat_id: "sentinelle-candidat-b" }],
  { valeur: 20261299, ...GENERATEUR_DU_TIRAGE },
);

function reponse(normalise: Record<string, unknown>): ReponseObtenue {
  // Non revalidée : le schéma lie la projection au brut stocké, et la vue ne lit que la projection.
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return { ...lue, normalise: { ...lue.normalise, ...normalise } };
}

function quantification(valeur: number): unknown {
  return { dimensions: [{ type: "taux", valeur, unite: "%", operateur: "exact" }] };
}

/** Une vue où tout champ optionnel est présent, chaque feuille avec sa valeur sentinelle. */
function vueComplete(): VueAnnotateur {
  const r = reponse({
    texte: "SENTINELLE-TEXTE-REPONSE",
    liens: [LIEN_A, LIEN_B, LIEN_A],
    citations: [{ url: "https://exemple.invalid/sentinelle-citation", texte: "SENTINELLE-TEXTE-CITATION" }],
    troncature: true,
    refus_api: true,
  });
  const existences: ExistenceEtablie[] = [
    {
      url_citee: LIEN_A,
      verdict_existence: "existe",
      date_test: "2026-12-03T11:05:01+01:00",
      url_finale: "https://exemple.invalid/sentinelle-finale",
      code_http: 203,
      sha256_contenu: "ab".repeat(32),
      archive_url: "https://archive.invalid/sentinelle-archive",
    },
    { url_citee: LIEN_B, verdict_existence: "mort", date_test: "2026-12-03T11:05:02+01:00", code_http: null },
  ];
  const obsolete = itemO();
  const o = obsolete.obsolescence;
  if (o === undefined) throw new Error("itemO sans obsolescence.");
  return construireVue({
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "oriente", texte: "SENTINELLE-TEXTE-QUESTION" },
    references: [
      { item: itemP({ valide_au: "2027-03-15" }), role: "principal" },
      { item: itemO({ obsolescence: { ...o, etat_anterieur: { ...o.etat_anterieur, quantification: quantification(60) }, etat_posterieur: { ...o.etat_posterieur, quantification: quantification(62) } } }), role: "contexte" },
    ],
    date_run: "2026-12-01T06:00:00+01:00",
    // Une réponse attendue où chaque champ optionnel est présent : aucune nature n'en porte autant,
    // mais la garde porte sur l'affichage de chaque champ, pas sur une réponse attendue réelle.
    resolu_au_gel: {
      reponse_attendue: {
        nature: "position_anterieure",
        position: "conditionnel",
        etat_attendu: "anterieur",
        candidats_attendus: ["sentinelle-candidat-a", "sentinelle-candidat-b"],
        resolution_temporelle: { date_gel: "2026-12-01T06:00:00+01:00", date_changement: "2026-11-03", regle: "semi_ouvert" },
      },
      premisse_fausse: true,
    },
    pages_citees: [
      {
        url_citee: LIEN_A,
        texte_disponible: true,
        origine: "copie_archivee",
        texte: "SENTINELLE-TEXTE-PAGE",
        texte_sha256: "cd".repeat(32),
        tronque: true,
        longueur_totale: 54321,
      },
      { url_citee: LIEN_B, texte_disponible: false, raison: "lien_mort" },
    ],
    existences,
    alias_candidats: ALIAS_CANDIDATS,
  });
}

/** Une vue réduite à l'obligatoire : ni citations, ni obsolescence, ni détail d'existence. */
function vueMinimale(): VueAnnotateur {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  const { citations: _citations, ...sansCitations } = lue.normalise;
  const r = { ...lue, normalise: { ...sansCitations, liens: [LIEN_A], troncature: false, refus_api: false } } as ReponseObtenue;
  return construireVue({
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Question ?" },
    references: [{ item: itemP(), role: "principal" }],
    date_run: "2026-12-01T06:00:00+01:00",
    resolu_au_gel: { reponse_attendue: { nature: "oui", resolution_temporelle: { date_gel: "2026-12-01T06:00:00+01:00", regle: "semi_ouvert" } }, premisse_fausse: false },
    pages_citees: [{ url_citee: LIEN_A, texte_disponible: false, raison: "sans_copie" }],
    existences: [{ url_citee: LIEN_A, verdict_existence: "existe", date_test: "2026-12-03T11:05:00+01:00" }],
    alias_candidats: ALIAS_CANDIDATS,
  });
}

/** Assignabilité à la compilation : un champ du pipeline que le type du client interdit casse `tsc`. */
function commeVueDuClient(vue: VueAnnotateur): Vue {
  return vue;
}

type Segment = string | number;
interface Feuille {
  readonly segments: readonly Segment[];
  readonly chemin: string;
  readonly valeur: unknown;
}

const cheminDe = (segments: readonly Segment[]): string => segments.map((s) => (typeof s === "number" ? "[]" : `.${s}`)).join("").replace(/^\./, "").replaceAll(".[", "[");

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `quantification` est une feuille : sa structure est libre, sa sérialisation fait foi. */
function descendants(valeur: unknown, segments: readonly Segment[]): readonly (readonly [Segment, unknown])[] {
  if (segments.at(-1) === "quantification") return [];
  if (Array.isArray(valeur)) return valeur.map((v, i) => [i, v] as const);
  return estObjet(valeur) ? Object.entries(valeur) : [];
}

function feuillesDe(valeur: unknown, segments: readonly Segment[] = []): readonly Feuille[] {
  const enfants = descendants(valeur, segments);
  if (enfants.length === 0 && segments.length > 0) return [{ segments, chemin: cheminDe(segments), valeur }];
  return enfants.flatMap(([cle, v]) => feuillesDe(v, [...segments, cle]));
}

function muter(valeur: unknown): unknown {
  if (typeof valeur === "boolean") return !valeur;
  if (typeof valeur === "number") return valeur + 1;
  if (typeof valeur === "string") return `MUTE-${valeur}`;
  return { mute: true };
}

function avecFeuilleMutee(vue: Vue, feuille: Feuille): Vue {
  const copie = structuredClone(vue) as unknown as Record<string, unknown>;
  let parent: unknown = copie;
  for (const s of feuille.segments.slice(0, -1)) parent = (parent as Record<Segment, unknown>)[s];
  const dernier = feuille.segments.at(-1) as Segment;
  (parent as Record<Segment, unknown>)[dernier] = muter(feuille.valeur);
  return copie as unknown as Vue;
}

type Contenu = (vue: Vue) => readonly Bloc[];

function sePresente(feuille: Feuille, texte: string): boolean {
  const v = feuille.valeur;
  if (v === null || typeof v === "boolean") return true;
  const attendu = typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
  return texte.includes(attendu);
}

/** Les chemins des feuilles hors liste d'exclusion qui ne se lisent pas, ou dont le changement ne change rien. */
function feuillesManquantes(vue: Vue, contenu: Contenu): readonly string[] {
  const base = aplatir(contenu(vue));
  const manquantes = feuillesDe(vue)
    .filter((f) => !(f.chemin in CHAMPS_NON_AFFICHES))
    .filter((f) => !sePresente(f, base) || aplatir(contenu(avecFeuilleMutee(vue, f))) === base)
    .map((f) => f.chemin);
  return [...new Set(manquantes)];
}

describe("complétude de l'affichage de la notation humaine", () => {
  it("la fixture exerce chaque champ optionnel de la vue", () => {
    const chemins = new Set(feuillesDe(vueComplete()).map((f) => f.chemin));
    for (const attendu of [
      "reponse.liens[].url_finale",
      "reponse.liens[].code_http",
      "reponse.liens[].sha256_contenu",
      "reponse.liens[].archive_url",
      "reponse.citations[].url",
      "reponse.citations[].texte",
      "references[].assertion.quantification",
      "references[].obsolescence.etat_anterieur.quantification",
      "references[].obsolescence.etat_posterieur.quantification",
      "references[].obsolescence.date_changement",
      "references[].item_version",
      "references[].item_empreinte",
      "references[].valide_au",
      // D27, charge-juge-v3 : registre, prémisse, réponse attendue, pages citées et leur borne.
      "question.registre",
      "question.premisse_fausse",
      "reponse_attendue.nature",
      "reponse_attendue.position",
      "reponse_attendue.etat_attendu",
      "reponse_attendue.candidats_attendus[]",
      "reponse_attendue.resolution_temporelle.date_gel",
      "reponse_attendue.resolution_temporelle.date_changement",
      "reponse_attendue.resolution_temporelle.regle",
      "pages_citees[].url_citee",
      "pages_citees[].texte_disponible",
      "pages_citees[].origine",
      "pages_citees[].texte",
      "pages_citees[].texte_sha256",
      "pages_citees[].tronque",
      "pages_citees[].longueur_totale",
      "pages_citees[].raison",
      "longueur_max_texte_page",
    ]) {
      expect(chemins, attendu).toContain(attendu);
    }
  });

  it("la VueAnnotateur du pipeline est assignable au type Vue du client (vérifié par tsc)", () => {
    expect(commeVueDuClient(vueComplete()).reponse_id).toBe(vueComplete().reponse_id);
  });

  it("chaque feuille de la vue hors CHAMPS_NON_AFFICHES se lit dans le contenu et le fait varier", () => {
    expect(feuillesManquantes(commeVueDuClient(vueComplete()), contenuVue)).toEqual([]);
  });

  it("2. chaque entrée de CHAMPS_NON_AFFICHES correspond à une feuille existante", () => {
    const chemins = new Set(feuillesDe(vueComplete()).map((f) => f.chemin));
    for (const chemin of Object.keys(CHAMPS_NON_AFFICHES)) expect(chemins, chemin).toContain(chemin);
  });

  it("chaque champ non affiché porte une raison", () => {
    for (const [chemin, raison] of Object.entries(CHAMPS_NON_AFFICHES)) expect(raison.trim().length, chemin).toBeGreaterThan(0);
  });

  it("1. témoin : une feuille retirée du contenu fait échouer la garde", () => {
    const sansArchive: Contenu = (vue) =>
      contenuVue(vue).map((b) => (b.genre === "liste" && b.classe === "liens" ? { ...b, lignes: b.lignes.map((l) => l.replace(/ · archive : .*$/, "")) } : b));
    expect(feuillesManquantes(commeVueDuClient(vueComplete()), sansArchive)).toEqual(["reponse.liens[].archive_url"]);
  });

  it("1. témoin : un champ inconnu ajouté à la vue fait échouer la garde", () => {
    const enrichie = { ...commeVueDuClient(vueComplete()), champ_ajoute_au_pipeline: "SENTINELLE-CHAMP-AJOUTE" };
    expect(feuillesManquantes(enrichie, contenuVue)).toEqual(["champ_ajoute_au_pipeline"]);
  });

  it("1. témoin : un booléen ignoré par le contenu fait échouer la garde", () => {
    const sansAvertissements: Contenu = (vue) => contenuVue(vue).filter((b) => !(b.genre === "paragraphe" && b.classe === "alerte"));
    expect(feuillesManquantes(commeVueDuClient(vueComplete()), sansAvertissements)).toEqual(["reponse.troncature", "reponse.refus_api"]);
  });
});

describe("cas limites du contenu", () => {
  const texteDe = (vue: Vue): string => aplatir(contenuVue(vue));

  it("3. code_http null : « pas de réponse HTTP », jamais 0, et distinct de l'absence du champ", () => {
    const vue = commeVueDuClient(vueComplete());
    const ligneB = texteDe(vue).split("\n").find((l) => l.startsWith(LIEN_B));
    expect(ligneB).toContain("pas de réponse HTTP");
    expect(ligneB).not.toContain("code HTTP");
    const ligneMinimale = texteDe(commeVueDuClient(vueMinimale())).split("\n").find((l) => l.startsWith(LIEN_A));
    expect(ligneMinimale).not.toContain("HTTP");
  });

  it("3. code_http numérique : affiché avec son code", () => {
    expect(texteDe(commeVueDuClient(vueComplete()))).toContain("code HTTP 203");
  });

  it("4. champs optionnels absents : rien d'inventé, ni « undefined » ni « null »", () => {
    const texte = texteDe(commeVueDuClient(vueMinimale()));
    expect(texte).not.toMatch(/undefined|null/);
    expect(texte).not.toContain("URL finale");
    expect(texte).not.toContain("empreinte du contenu");
    expect(texte).not.toContain("archive :");
    expect(texte).not.toContain("Citations de la réponse");
    expect(texte).not.toContain("Changement de position");
  });

  it("4. la vue complète ne contient pas non plus « undefined » ni « null »", () => {
    expect(texteDe(commeVueDuClient(vueComplete()))).not.toMatch(/undefined|null/);
  });

  it("5. valide_au null : « sans fin » ; une date : la date", () => {
    const texte = texteDe(commeVueDuClient(vueComplete()));
    expect(texte).toContain("au sans fin");
    expect(texte).toContain("au 2027-03-15");
  });

  it("6. un lien cité deux fois : deux lignes, avec son unique verdict", () => {
    const lignes = texteDe(commeVueDuClient(vueComplete())).split("\n").filter((l) => l.startsWith(LIEN_A));
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toBe(lignes[1]);
  });

  it("7. troncature et refus_api : la sortie diffère entre vrai et faux", () => {
    const vue = commeVueDuClient(vueComplete());
    const avec = (champ: "troncature" | "refus_api", valeur: boolean): string => texteDe({ ...vue, reponse: { ...vue.reponse, [champ]: valeur } });
    expect(avec("troncature", true)).not.toBe(avec("troncature", false));
    expect(avec("refus_api", true)).not.toBe(avec("refus_api", false));
    expect(avec("troncature", true)).toContain("Réponse tronquée par l'outil.");
    expect(avec("refus_api", true)).toContain("Refus de modération de l'API.");
  });
});
