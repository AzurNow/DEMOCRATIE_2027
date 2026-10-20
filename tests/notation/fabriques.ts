/**
 * Fabriques des tests du noyau de notation. Notations conformes à `schema/notation.schema.json`
 * par défaut (juge exacte, sans lien) : chaque test pose ce qui compte. Aucun contenu réel.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { empreinte, ulid } from "../analysis/fabriques.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { tableAliasCandidats } from "../../pipeline/notation/alias-candidats.ts";
import { notationParRegle } from "../../pipeline/notation/regle-refus.ts";
import { GENERATEUR_DU_TIRAGE } from "../../pipeline/questions/tirage.ts";
import type { MotifNotation } from "../../analysis/types.ts";
import type { CandidatDuRun, LienNotation, NotationIndividuelle, RenvoiHumain, RunDeNotation } from "../../pipeline/notation/types.ts";
import { VERSION_CHARGE_JUGE, type ResoluAuGel } from "../../pipeline/notation/charge-juge.ts";
import type { PageCitee } from "../../pipeline/notation/pages-citees.ts";

export const RUN_ID = ulid("run-notation");
export const REPONSE_ID = ulid("reponse-notation");
export const ITEM_REF = { item_id: ulid("item-notation"), item_version: 1, item_empreinte: empreinte("item-notation") };

type Surcharges = { -readonly [K in keyof NotationIndividuelle]?: NotationIndividuelle[K] };

/** L'objet noté que posent les surcharges, sinon la réponse de test : il entre dans l'identifiant. */
function objetDe(surcharges: Surcharges): string {
  return surcharges.objet_note === undefined ? REPONSE_ID : surcharges.objet_note.id;
}

export function notationJuge(juge_id: string, surcharges: Surcharges = {}): NotationIndividuelle {
  return {
    id: ulid(`notation-${juge_id}-${objetDe(surcharges)}`),
    run_id: RUN_ID,
    contexte: "run",
    objet_note: { type: "reponse", id: REPONSE_ID },
    notateur: {
      type: "juge",
      id: juge_id,
      famille_modele: `famille-${juge_id}`,
      modele: `famille-${juge_id}/modele`,
      version_prompt: "prompts/judge-primaire-1.0.0",
      a_vu_identite_outil: false,
    },
    version_charge: VERSION_CHARGE_JUGE,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: false, liens: [] },
    date: "2026-12-03T11:00:00+01:00",
    motif_notation: "notation_juge",
    ...surcharges,
  };
}

/** Un refus de l'API (D12), d'après l'exemple valide du schéma de réponse, sous l'identifiant voulu. */
export function refusApi(id: string = REPONSE_ID): ReponseObtenue {
  const exemple = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-03-api-obtenue-refus-api.json"), "utf8")) as ReponseObtenue;
  return { ...exemple, id };
}

/** La notation par règle d'un refus de l'API (D32), sur la réponse de test ou sur l'objet surchargé. */
export function notationRegle(surcharges: Surcharges = {}): NotationIndividuelle {
  const objet = objetDe(surcharges);
  const regle = notationParRegle({
    id: ulid(`notation-regle-${objet}`),
    run_id: RUN_ID,
    reponse: refusApi(objet),
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    attribution: null,
    date: "2026-12-03T11:00:00+01:00",
  });
  return { ...regle, ...surcharges };
}

/** Un renvoi de juge vers l'humain (D30 (2)), conforme à `schema/renvoi-humain.schema.json`. */
export function renvoiJuge(juge_id: string, surcharges: Partial<RenvoiHumain> = {}): RenvoiHumain {
  return {
    id: ulid(`renvoi-${juge_id}-${surcharges.objet_note === undefined ? REPONSE_ID : surcharges.objet_note.id}`),
    run_id: RUN_ID,
    contexte: "run",
    objet_note: { type: "reponse", id: REPONSE_ID },
    notateur: { type: "juge", id: juge_id, famille_modele: `famille-${juge_id}`, modele: `famille-${juge_id}/modele`, version_prompt: "prompts/judge-primaire-1.0.0", a_vu_identite_outil: false },
    version_charge: VERSION_CHARGE_JUGE,
    gabarit: "Q-ATT",
    references_item: [ITEM_REF],
    motif: "attribution_indecidable",
    raison: "candidat cité au périmètre mais non interrogé.",
    noms_cites: ["Martinez"],
    attribution: { attendus: ["demo-alpha"], cites: ["demo-alpha"] },
    date: "2026-12-03T11:00:00+01:00",
    ...surcharges,
  };
}

export function notationHumaine(
  annotateur: string,
  motif: MotifNotation,
  surcharges: Surcharges = {},
): NotationIndividuelle {
  return {
    id: ulid(`notation-${annotateur}-${motif}-${objetDe(surcharges)}`),
    run_id: RUN_ID,
    contexte: "run",
    objet_note: { type: "reponse", id: REPONSE_ID },
    notateur: { type: "humain", id: annotateur, sensibilite_declaree_famille: "famille-1", a_vu_identite_outil: false },
    version_charge: VERSION_CHARGE_JUGE,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: false, liens: [] },
    date: "2026-12-05T09:30:00+01:00",
    motif_notation: motif,
    ...surcharges,
  };
}

/** Inexacte, avec un extrait qui figure dans `REPONSE_PROJETEE`. */
export function inexacte(drapeaux: NotationIndividuelle["drapeaux"] = []): Surcharges {
  return {
    categorie: "inexacte",
    drapeaux,
    motif_inexactitude: "position_inventee",
    extrait_justificatif: { provenance: "reponse", texte: "supprimer la taxe", verifie_deterministe: true },
  };
}

export const REPONSE_PROJETEE = "Le candidat veut supprimer la taxe foncière, selon la presse.";

export function lien(existence: LienNotation["verdict_existence"], soutien: LienNotation["verdict_soutien"], url = "https://exemple.invalid/a"): LienNotation {
  return { url_citee: url, date_test: "2026-12-03T11:05:00+01:00", verdict_existence: existence, verdict_soutien: soutien };
}

/**
 * Trois candidats fictifs. Le nom seul du deuxième est contenu dans son libellé (chevauchement), et
 * celui du troisième commence par une voyelle (élision « d’Ollivier »).
 */
export const CANDIDATS_DU_RUN: readonly CandidatDuRun[] = [
  { candidat_id: "demo-alpha", libelle: "Alix Martinez", nom: "Martinez" },
  { candidat_id: "demo-beta", libelle: "Maxime Le Brun", nom: "Le Brun" },
  { candidat_id: "demo-gamma", libelle: "Camille Ollivier", nom: "Ollivier" },
];

/** Graine de test de l'alias des candidats (D55 (9)) : les trois candidats sont interrogés. */
export const GRAINE_ALIAS_CANDIDATS_TEST = { valeur: 20261203, ...GENERATEUR_DU_TIRAGE };

/** La table alias → candidat_id des tests, recalculée comme au gel : jamais une valeur en dur. */
export const ALIAS_CANDIDATS_TEST = tableAliasCandidats(CANDIDATS_DU_RUN, GRAINE_ALIAS_CANDIDATS_TEST);

const CANDIDAT_VERS_ALIAS_TEST = new Map(Object.entries(ALIAS_CANDIDATS_TEST).map(([alias, candidat_id]) => [candidat_id, alias]));

/** L'alias de test d'un candidat de `CANDIDATS_DU_RUN`, pour écrire les attentes sans deviner la table. */
export function aliasDeTest(candidat_id: string): string {
  const alias = CANDIDAT_VERS_ALIAS_TEST.get(candidat_id);
  if (alias === undefined) throw new Error(`${candidat_id} n'est pas un candidat de test interrogé (ALIAS_CANDIDATS_TEST).`);
  return alias;
}

/** Le gel des tests de charge : `run.date_gel` de `run-fictif.ts`. */
export const GEL_DES_TESTS = "2026-12-01T06:00:00+01:00";

/** Ce que le tirage a résolu au gel pour une Q-DIR sur un item P « pour » (D27 (F), (G)). */
export const RESOLU_POSITION_POUR: ResoluAuGel = {
  reponse_attendue: { nature: "position", position: "pour", resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" } },
  premisse_fausse: false,
};

/** Une page « sans texte » par lien distinct, dans l'ordre de première citation (D27 (E)). */
export function pagesSansTexte(liens: readonly string[], raison: "lien_mort" | "sans_copie" | "extraction_refusee" = "lien_mort"): readonly PageCitee[] {
  return [...new Set(liens)].map((url_citee) => ({ url_citee, texte_disponible: false, raison }));
}

/** Ce que la chaîne pose dans le cadre d'une notation de juge pour la charge v3 (D27 (C), (D)). */
export const CADRE_V3 = {
  date_gel: GEL_DES_TESTS,
  items: [],
  reponse_attendue: RESOLU_POSITION_POUR.reponse_attendue,
  candidats: CANDIDATS_DU_RUN,
  interroges: CANDIDATS_DU_RUN.map((c) => c.candidat_id),
  registre: "neutre",
  premisse_fausse: false,
  version_charge: VERSION_CHARGE_JUGE,
} as const;

export function runDeNotation(retires: readonly string[] = [], surcharges: Partial<RunDeNotation> = {}): RunDeNotation {
  return {
    id: RUN_ID,
    candidats: CANDIDATS_DU_RUN,
    juges: ["j1", "j2"].map((juge_id) => ({ juge_id, retire: retires.includes(juge_id) })),
    taux_echantillon_humain: retires.length > 0 ? 0.25 : 0.1,
    graines: {
      echantillon_humain: { valeur: 20261201, ...GENERATEUR_DU_TIRAGE },
      contrefactuel: { valeur: 20261202, ...GENERATEUR_DU_TIRAGE },
      alias_candidats: GRAINE_ALIAS_CANDIDATS_TEST,
    },
    alias_candidats: ALIAS_CANDIDATS_TEST,
    ...surcharges,
  };
}
