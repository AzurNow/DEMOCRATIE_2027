/**
 * Constat 5 de la revue du 2026-09-23 : chaque liste fermée du protocole recopiée en TypeScript
 * est confrontée à l'énumération de son schéma.
 *
 * Pas de génération de code : les listes TypeScript restent écrites à la main, et ce test les
 * compare aux `enum` de `schema/*.schema.json`. L'égalité exigée est ensembliste ET de cardinal :
 * un doublon, une valeur en trop ou une valeur manquante échoue, et le message nomme la liste,
 * son fichier, le schéma et la valeur divergente. Un amendement qui ajoute un thème ou un gabarit
 * au schéma fait donc échouer `pnpm test` tant que le code ne le connaît pas.
 *
 * Deux sortes de listes :
 *
 * - les constantes exportées (`THEMES`, `CODES_GABARIT`…), dont l'union du même nom est dérivée
 *   (`(typeof X)[number]`) : la constante EST l'union, la comparer suffit ;
 * - les unions écrites en ligne dans une interface (`Source["tier"]`…) : le test en porte une
 *   liste de pont, dont `expectTypeOf` vérifie à la compilation (`pnpm check`) qu'elle est
 *   exactement l'union, avant de la comparer au schéma à l'exécution.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import * as analyse from "../analysis/types.ts";
import * as questions from "../pipeline/questions/types.ts";
import * as run from "../pipeline/run/types.ts";
import * as client from "../validation/client/types.ts";
import * as domaine from "../validation/domaine/types.ts";
import * as promotion from "../validation/domaine/promotion.ts";
import * as contestation from "../validation/domaine/contestation-item.ts";
import * as dues from "../validation/io/notifications-dues.ts";

const RACINE_SCHEMAS = join(import.meta.dirname, "..", "schema");

/* ---------------------------------------------------------- comparaison */

/** Lit l'`enum` au pointeur JSON donné (`#/$defs/theme`). Un pointeur qui ne mène à rien échoue. */
function enumDuSchema(fichier: string, pointeur: string): readonly string[] {
  const racine: unknown = JSON.parse(readFileSync(join(RACINE_SCHEMAS, fichier), "utf8"));
  const noeud = pointeur
    .replace(/^#\//, "")
    .split("/")
    .reduce<unknown>((courant, segment) => enfant(courant, segment, `${fichier}${pointeur}`), racine);
  const valeurs = enfant(noeud, "enum", `${fichier}${pointeur}`);
  if (!Array.isArray(valeurs) || !valeurs.every((valeur) => typeof valeur === "string")) {
    throw new Error(`${fichier}${pointeur} ne porte pas un enum de chaînes.`);
  }
  return valeurs;
}

function enfant(noeud: unknown, cle: string, contexte: string): unknown {
  if (typeof noeud !== "object" || noeud === null || !Object.hasOwn(noeud, cle)) {
    throw new Error(`Pointeur ${contexte} : « ${cle} » introuvable.`);
  }
  return (noeud as Record<string, unknown>)[cle];
}

function doublons(valeurs: readonly string[]): readonly string[] {
  return valeurs.filter((valeur, rang) => valeurs.indexOf(valeur) !== rang);
}

/**
 * Les divergences entre une liste TypeScript et l'enum d'un schéma, une phrase par divergence.
 * Vide si et seulement si les deux portent les mêmes valeurs, chacune exactement une fois.
 */
function divergences(
  liste: string,
  valeurs: readonly string[],
  schema: string,
  attendues: readonly string[],
): readonly string[] {
  return [
    ...doublons(valeurs).map((v) => `${liste} : « ${v} » en double (face à ${schema})`),
    ...doublons(attendues).map((v) => `${schema} : « ${v} » en double (face à ${liste})`),
    ...valeurs
      .filter((v) => !attendues.includes(v))
      .map((v) => `${liste} : « ${v} » absente de ${schema}`),
    ...attendues
      .filter((v) => !valeurs.includes(v))
      .map((v) => `${liste} : « ${v} » de ${schema} manquante`),
    ...(valeurs.length === attendues.length
      ? []
      : [`${liste} : ${valeurs.length} valeurs, ${schema} en porte ${attendues.length}`]),
  ];
}

interface Confrontation {
  /** `NOM (fichier.ts)`, tel qu'il apparaîtra dans le message d'échec. */
  readonly liste: string;
  readonly valeurs: readonly string[];
  readonly fichier: string;
  readonly pointeur: string;
}

function confronter(confrontation: Confrontation): readonly string[] {
  const schema = `schema/${confrontation.fichier}${confrontation.pointeur}`;
  const attendues = enumDuSchema(confrontation.fichier, confrontation.pointeur);
  return divergences(confrontation.liste, confrontation.valeurs, schema, attendues);
}

/* --------------------------------------------------------- listes de pont */

/*
 * Unions écrites en ligne dans une interface, sans constante à l'exécution. Chacune est vérifiée
 * égale à son union par `expectTypeOf` (test « listes de pont » ci-dessous), puis confrontée.
 */
const PONT_OBJET_NOTE = ["reponse", "lecture_comparateur"] as const;
const PONT_STATUT_AU_GEL = ["actif", "nouveau", "retire"] as const;
const PONT_FAMILLE_OUTIL = ["assistant", "comparateur"] as const;
const PONT_ETAT_ATTENDU = ["anterieur", "posterieur"] as const;
const PONT_TYPE_ENTREE = ["decision", "annulation", "retrait_item"] as const;
const PONT_CIBLE_CORRECTION = ["item", "mesure"] as const;
const PONT_TIER = ["T1", "T2", "T3"] as const;
const PONT_PUBLICATION = ["publique", "interne"] as const;
const PONT_STATUT_CONTESTATION = ["aucune", "contestee", "arbitree"] as const;
const PONT_NATURE_LOT_CLIENT = ["entrainement", "reel", "reannotation"] as const;

type Element<T extends readonly unknown[]> = T[number];

/* ------------------------------------------------------ table des listes */

const ANALYSE = "analysis/types.ts";
const QUESTIONS = "pipeline/questions/types.ts";
const RUN_TYPES = "pipeline/run/types.ts";
const DOMAINE = "validation/domaine/types.ts";
const CLIENT = "validation/client/types.ts";

const COMMUN = "commun.schema.json";
const REPONSE = "reponse.schema.json";
const VERDICT = "verdict.schema.json";
const NOTATION = "notation.schema.json";
const RUN = "run.schema.json";
const ITEM = "item.schema.json";
const TIRAGE = "tirage.schema.json";
const QUESTION = "question.schema.json";
const DECISION = "decision.schema.json";
const PERIMETRE = "perimetre.schema.json";

const MODE_DE_TETE = "#/properties/perimetre/properties/outils/items/properties/mode_de_tete";
const STATUT_AU_GEL = "#/properties/perimetre/properties/candidats/items/properties/statut_au_gel";
const FAMILLE = "#/properties/perimetre/properties/outils/items/properties/famille";
const ITEMS_AU_GEL = "#/$defs/entree_tirage/properties/items_au_gel/items/properties";
const CONDITIONS = "#/properties/symetrie/properties/conditions/items/properties";
const LIENS_NOTATION = "#/properties/sourcage/properties/liens/items/properties";

function en(fichierTs: string, nom: string): string {
  return `${nom} (${fichierTs})`;
}

const CONFRONTATIONS: readonly Confrontation[] = [
  // analysis/types.ts
  { liste: en(ANALYSE, "CONTEXTES_MESURE"), valeurs: analyse.CONTEXTES_MESURE, fichier: COMMUN, pointeur: "#/$defs/contexte_mesure" },
  { liste: en(ANALYSE, "TYPES_ITEM"), valeurs: analyse.TYPES_ITEM, fichier: COMMUN, pointeur: "#/$defs/type_item" },
  { liste: en(ANALYSE, "CODES_GABARIT"), valeurs: analyse.CODES_GABARIT, fichier: COMMUN, pointeur: "#/$defs/gabarit" },
  { liste: en(ANALYSE, "REGISTRES"), valeurs: analyse.REGISTRES, fichier: COMMUN, pointeur: "#/$defs/registre" },
  { liste: en(ANALYSE, "THEMES"), valeurs: analyse.THEMES, fichier: COMMUN, pointeur: "#/$defs/theme" },
  { liste: en(ANALYSE, "MODES"), valeurs: analyse.MODES, fichier: REPONSE, pointeur: "#/properties/mode" },
  { liste: en(ANALYSE, "MODES"), valeurs: analyse.MODES, fichier: RUN, pointeur: MODE_DE_TETE },
  { liste: en(ANALYSE, "CANAUX"), valeurs: analyse.CANAUX, fichier: REPONSE, pointeur: "#/properties/canal" },
  { liste: en(ANALYSE, "CATEGORIES_RETENUES"), valeurs: analyse.CATEGORIES_RETENUES, fichier: VERDICT, pointeur: "#/properties/categorie_retenue" },
  { liste: en(ANALYSE, "DRAPEAUX"), valeurs: analyse.DRAPEAUX, fichier: VERDICT, pointeur: "#/properties/drapeaux_retenus/items" },
  { liste: en(ANALYSE, "STATUTS_REPONSE"), valeurs: analyse.STATUTS_REPONSE, fichier: REPONSE, pointeur: "#/properties/statut_reponse" },
  { liste: en(ANALYSE, "ROLES_ITEM"), valeurs: analyse.ROLES_ITEM, fichier: QUESTION, pointeur: "#/properties/items/items/properties/role" },
  { liste: en(ANALYSE, "ObjetNote.type"), valeurs: PONT_OBJET_NOTE, fichier: VERDICT, pointeur: "#/properties/objet_note/properties/type" },
  { liste: en(ANALYSE, "CandidatAuGel.statut_au_gel"), valeurs: PONT_STATUT_AU_GEL, fichier: RUN, pointeur: STATUT_AU_GEL },
  { liste: en(ANALYSE, "OutilAuGel.famille"), valeurs: PONT_FAMILLE_OUTIL, fichier: RUN, pointeur: FAMILLE },
  { liste: en(ANALYSE, "CATEGORIES_RETENUES"), valeurs: analyse.CATEGORIES_RETENUES, fichier: NOTATION, pointeur: "#/properties/categorie" },
  { liste: en(ANALYSE, "DRAPEAUX"), valeurs: analyse.DRAPEAUX, fichier: NOTATION, pointeur: "#/properties/drapeaux/items" },
  { liste: en(ANALYSE, "MOTIFS_NOTATION"), valeurs: analyse.MOTIFS_NOTATION, fichier: NOTATION, pointeur: "#/properties/motif_notation" },
  { liste: en(ANALYSE, "TYPES_NOTATEUR"), valeurs: analyse.TYPES_NOTATEUR, fichier: NOTATION, pointeur: "#/properties/notateur/properties/type" },
  { liste: en(ANALYSE, "VERDICTS_EXISTENCE"), valeurs: analyse.VERDICTS_EXISTENCE, fichier: NOTATION, pointeur: `${LIENS_NOTATION}/verdict_existence` },
  { liste: en(ANALYSE, "VERDICTS_SOUTIEN"), valeurs: analyse.VERDICTS_SOUTIEN, fichier: NOTATION, pointeur: `${LIENS_NOTATION}/verdict_soutien` },
  { liste: en(ANALYSE, "Notation.objet_note.type"), valeurs: PONT_OBJET_NOTE, fichier: NOTATION, pointeur: "#/properties/objet_note/properties/type" },

  // pipeline/questions/types.ts
  { liste: en(QUESTIONS, "THEMES"), valeurs: questions.THEMES, fichier: COMMUN, pointeur: "#/$defs/theme" },
  { liste: en(QUESTIONS, "CODES_GABARIT"), valeurs: questions.CODES_GABARIT, fichier: COMMUN, pointeur: "#/$defs/gabarit" },
  { liste: en(QUESTIONS, "REGISTRES"), valeurs: questions.REGISTRES, fichier: COMMUN, pointeur: "#/$defs/registre" },
  { liste: en(QUESTIONS, "POSITIONS"), valeurs: questions.POSITIONS, fichier: COMMUN, pointeur: "#/$defs/position" },
  { liste: en(QUESTIONS, "STATUTS_VALIDATION"), valeurs: questions.STATUTS_VALIDATION, fichier: ITEM, pointeur: "#/properties/statut_validation" },
  { liste: en(QUESTIONS, "STATUTS_VALIDATION"), valeurs: questions.STATUTS_VALIDATION, fichier: TIRAGE, pointeur: `${ITEMS_AU_GEL}/statut_validation_au_gel` },
  { liste: en(QUESTIONS, "STATUTS_CONTESTATION"), valeurs: questions.STATUTS_CONTESTATION, fichier: ITEM, pointeur: "#/properties/statut_contestation" },
  { liste: en(QUESTIONS, "STATUTS_CONTESTATION"), valeurs: questions.STATUTS_CONTESTATION, fichier: TIRAGE, pointeur: `${ITEMS_AU_GEL}/statut_contestation_au_gel` },
  { liste: en(QUESTIONS, "ROLES_ITEM"), valeurs: questions.ROLES_ITEM, fichier: QUESTION, pointeur: "#/properties/items/items/properties/role" },
  { liste: en(QUESTIONS, "ROLES_ITEM"), valeurs: questions.ROLES_ITEM, fichier: TIRAGE, pointeur: `${ITEMS_AU_GEL}/role` },
  { liste: en(QUESTIONS, "NATURES_REPONSE"), valeurs: questions.NATURES_REPONSE, fichier: TIRAGE, pointeur: "#/$defs/reponse_attendue/properties/nature" },
  { liste: en(QUESTIONS, "MOTIFS_EXCLUSION"), valeurs: questions.MOTIFS_EXCLUSION, fichier: TIRAGE, pointeur: "#/properties/exclusions/items/properties/motif" },
  { liste: en(QUESTIONS, "CODES_CONDITION"), valeurs: questions.CODES_CONDITION, fichier: RUN, pointeur: `${CONDITIONS}/code` },
  { liste: en(QUESTIONS, "STATUTS_SYMETRIE"), valeurs: questions.STATUTS_SYMETRIE, fichier: RUN, pointeur: "#/properties/symetrie/properties/statut_global" },
  { liste: en(QUESTIONS, "STATUTS_SYMETRIE"), valeurs: questions.STATUTS_SYMETRIE, fichier: RUN, pointeur: `${CONDITIONS}/statut` },
  { liste: en(QUESTIONS, "ReponseAttendue.etat_attendu"), valeurs: PONT_ETAT_ATTENDU, fichier: TIRAGE, pointeur: "#/$defs/reponse_attendue/properties/etat_attendu" },
  { liste: en(QUESTIONS, "CandidatAuGel.statut_au_gel"), valeurs: questions.STATUTS_AU_GEL, fichier: RUN, pointeur: STATUT_AU_GEL },
  // Constat 30 (avec le constat 38 du 2026-10-12) : les listes de pipeline/questions/charger-perimetre.ts,
  // recopiées dans pipeline/questions/types.ts plutôt que laissées en unions locales sans accord.
  { liste: en(QUESTIONS, "STATUTS_AU_GEL"), valeurs: questions.STATUTS_AU_GEL, fichier: PERIMETRE, pointeur: "#/$defs/candidat/properties/statut_au_gel" },
  { liste: en(QUESTIONS, "REGIMES_INCLUSION"), valeurs: questions.REGIMES_INCLUSION, fichier: PERIMETRE, pointeur: "#/properties/regime_inclusion/anyOf/1" },
  { liste: en(QUESTIONS, "REGIMES_INCLUSION"), valeurs: questions.REGIMES_INCLUSION, fichier: RUN, pointeur: "#/properties/perimetre/properties/regime_inclusion" },

  // pipeline/run/types.ts (constat 30, revue du 2026-10-17)
  { liste: en(RUN_TYPES, "STATUTS_RUN"), valeurs: run.STATUTS_RUN, fichier: RUN, pointeur: "#/properties/statut" },
  { liste: en(RUN_TYPES, "TYPES_RUN"), valeurs: run.TYPES_RUN, fichier: RUN, pointeur: "#/properties/type_run" },

  // validation/domaine/types.ts
  { liste: en(DOMAINE, "TYPES_ITEM"), valeurs: domaine.TYPES_ITEM, fichier: COMMUN, pointeur: "#/$defs/type_item" },
  { liste: en(DOMAINE, "DECISIONS"), valeurs: domaine.DECISIONS, fichier: DECISION, pointeur: "#/properties/decision" },
  { liste: en(DOMAINE, "DECISIONS"), valeurs: domaine.DECISIONS, fichier: ITEM, pointeur: "#/properties/validations/items/properties/decision" },
  { liste: en(DOMAINE, "NATURES_LOT"), valeurs: domaine.NATURES_LOT, fichier: DECISION, pointeur: "#/properties/lot_nature" },
  { liste: en(DOMAINE, "EntreeJournal.type_entree"), valeurs: PONT_TYPE_ENTREE, fichier: DECISION, pointeur: "#/properties/type_entree" },
  { liste: en(DOMAINE, "Correction.cible"), valeurs: PONT_CIBLE_CORRECTION, fichier: DECISION, pointeur: "#/$defs/correction/properties/cible" },
  { liste: en(DOMAINE, "Source.tier"), valeurs: PONT_TIER, fichier: COMMUN, pointeur: "#/$defs/tier" },
  { liste: en(DOMAINE, "Source.publication"), valeurs: PONT_PUBLICATION, fichier: COMMUN, pointeur: "#/$defs/source/properties/publication" },
  { liste: en(DOMAINE, "Item.statut_contestation"), valeurs: PONT_STATUT_CONTESTATION, fichier: ITEM, pointeur: "#/properties/statut_contestation" },
  // Lot contestation-notification (protocole 0.10, §4) : arbitrage des désaccords.
  { liste: en(DOMAINE, "ISSUES_ARBITRAGE"), valeurs: domaine.ISSUES_ARBITRAGE, fichier: "decision-arbitrage.schema.json", pointeur: "#/properties/issue" },
  { liste: en(DOMAINE, "ISSUES_ARBITRAGE"), valeurs: domaine.ISSUES_ARBITRAGE, fichier: ITEM, pointeur: "#/properties/arbitrage/properties/issue" },
  { liste: en(DOMAINE, "ARBITRES"), valeurs: domaine.ARBITRES, fichier: "decision-arbitrage.schema.json", pointeur: "#/properties/arbitre" },
  { liste: en(DOMAINE, "ARBITRES"), valeurs: domaine.ARBITRES, fichier: ITEM, pointeur: "#/properties/arbitrage/properties/arbitre" },
  { liste: en("validation/domaine/promotion.ts", "MOTIFS_ARBITRAGE"), valeurs: promotion.MOTIFS_ARBITRAGE, fichier: "decision-arbitrage.schema.json", pointeur: "#/properties/motif" },
  { liste: en("validation/domaine/promotion.ts", "MOTIFS_ARBITRAGE"), valeurs: promotion.MOTIFS_ARBITRAGE, fichier: ITEM, pointeur: "#/properties/arbitrage/properties/motif" },
  // Lot contestation-notification (protocole 0.10, §4 et annexe E) : contestation et panel.
  { liste: en("validation/domaine/contestation-item.ts", "TYPES_CONTESTATAIRE"), valeurs: contestation.TYPES_CONTESTATAIRE, fichier: ITEM, pointeur: "#/properties/contestations/items/properties/contestataire_type" },
  { liste: en("validation/io/notifications-dues.ts", "EVENEMENTS_NOTIFICATION"), valeurs: dues.EVENEMENTS_NOTIFICATION, fichier: "notification-due.schema.json", pointeur: "#/properties/evenement" },
  { liste: en("validation/domaine/contestation-item.ts", "DECISIONS_PANEL"), valeurs: contestation.DECISIONS_PANEL, fichier: ITEM, pointeur: "#/properties/contestations/items/properties/decision_panel/properties/decision" },

  // validation/client/types.ts
  { liste: en(CLIENT, "TYPES_ITEM"), valeurs: client.TYPES_ITEM, fichier: COMMUN, pointeur: "#/$defs/type_item" },
  { liste: en(CLIENT, "DECISIONS"), valeurs: client.DECISIONS, fichier: DECISION, pointeur: "#/properties/decision" },
  { liste: en(CLIENT, "LotResume.nature"), valeurs: PONT_NATURE_LOT_CLIENT, fichier: DECISION, pointeur: "#/properties/lot_nature" },
  { liste: en(CLIENT, "Correction.cible"), valeurs: PONT_CIBLE_CORRECTION, fichier: DECISION, pointeur: "#/$defs/correction/properties/cible" },
];

/* ------------------------------------------------------------------ tests */

describe("constat 5 : chaque liste recopiée est égale à l'enum de son schéma", () => {
  for (const confrontation of CONFRONTATIONS) {
    it(`${confrontation.liste} = schema/${confrontation.fichier}${confrontation.pointeur}`, () => {
      expect(confronter(confrontation)).toEqual([]);
    });
  }
});

describe("constat 5 : les listes de pont sont exactement les unions en ligne", () => {
  it("vérifie à la compilation chaque liste de pont contre son union", () => {
    expectTypeOf<Element<typeof PONT_OBJET_NOTE>>().toEqualTypeOf<analyse.ObjetNote["type"]>();
    expectTypeOf<Element<typeof PONT_STATUT_AU_GEL>>().toEqualTypeOf<analyse.CandidatAuGel["statut_au_gel"]>();
    expectTypeOf<Element<typeof PONT_STATUT_AU_GEL>>().toEqualTypeOf<questions.CandidatAuGel["statut_au_gel"]>();
    expectTypeOf<analyse.CandidatAuGel["statut_au_gel"]>().toEqualTypeOf<questions.StatutAuGel>();
    expectTypeOf<Element<typeof PONT_FAMILLE_OUTIL>>().toEqualTypeOf<analyse.OutilAuGel["famille"]>();
    expectTypeOf<Element<typeof PONT_ETAT_ATTENDU>>().toEqualTypeOf<
      NonNullable<questions.ReponseAttendue["etat_attendu"]>
    >();
    expectTypeOf<Element<typeof PONT_TYPE_ENTREE>>().toEqualTypeOf<domaine.EntreeJournal["type_entree"]>();
    expectTypeOf<Element<typeof PONT_CIBLE_CORRECTION>>().toEqualTypeOf<domaine.Correction["cible"]>();
    expectTypeOf<Element<typeof PONT_CIBLE_CORRECTION>>().toEqualTypeOf<client.Correction["cible"]>();
    expectTypeOf<Element<typeof PONT_TIER>>().toEqualTypeOf<domaine.Source["tier"]>();
    expectTypeOf<Element<typeof PONT_TIER>>().toEqualTypeOf<domaine.BlocAbsence["corpus_examine"][number]["tier"]>();
    expectTypeOf<Element<typeof PONT_PUBLICATION>>().toEqualTypeOf<domaine.Source["publication"]>();
    expectTypeOf<Element<typeof PONT_STATUT_CONTESTATION>>().toEqualTypeOf<domaine.Item["statut_contestation"]>();
    expectTypeOf<Element<typeof PONT_NATURE_LOT_CLIENT>>().toEqualTypeOf<client.LotResume["nature"]>();
  });

  it("vérifie à la compilation que les unions exportées sont dérivées de leur constante", () => {
    expectTypeOf<Element<typeof analyse.DRAPEAUX>>().toEqualTypeOf<analyse.Drapeau>();
    expectTypeOf<Element<typeof analyse.THEMES>>().toEqualTypeOf<analyse.Theme>();
    expectTypeOf<Element<typeof analyse.MOTIFS_NOTATION>>().toEqualTypeOf<analyse.MotifNotation>();
    expectTypeOf<Element<typeof analyse.TYPES_NOTATEUR>>().toEqualTypeOf<analyse.Notation["notateur"]["type"]>();
    expectTypeOf<Element<typeof analyse.VERDICTS_EXISTENCE>>().toEqualTypeOf<analyse.LienNote["verdict_existence"]>();
    expectTypeOf<Element<typeof analyse.VERDICTS_SOUTIEN>>().toEqualTypeOf<analyse.LienNote["verdict_soutien"]>();
    expectTypeOf<Element<typeof questions.ROLES_ITEM>>().toEqualTypeOf<questions.RoleItem>();
    expectTypeOf<Element<typeof domaine.TYPES_ITEM>>().toEqualTypeOf<questions.TypeItem>();
    expectTypeOf<Element<typeof client.DECISIONS>>().toEqualTypeOf<client.Decision>();
  });
});

describe("constat 5 : la comparaison échoue réellement quand une liste diverge", () => {
  const SCHEMA = "schema/commun.schema.json#/$defs/theme";
  const attendues = enumDuSchema(COMMUN, "#/$defs/theme");

  it("signale une valeur manquante (liste amputée) en nommant liste, schéma et valeur", () => {
    const amputee = questions.THEMES.filter((theme) => theme !== "sante");
    expect(divergences("THEMES (amputée)", amputee, SCHEMA, attendues)).toEqual([
      `THEMES (amputée) : « sante » de ${SCHEMA} manquante`,
      `THEMES (amputée) : 9 valeurs, ${SCHEMA} en porte 10`,
    ]);
  });

  it("signale une valeur en trop", () => {
    const enTrop = [...questions.THEMES, "culture"];
    expect(divergences("THEMES (en trop)", enTrop, SCHEMA, attendues)).toEqual([
      `THEMES (en trop) : « culture » absente de ${SCHEMA}`,
      `THEMES (en trop) : 11 valeurs, ${SCHEMA} en porte 10`,
    ]);
  });

  it("signale un doublon, même quand l'ensemble des valeurs est identique", () => {
    const doublee = [...questions.THEMES, "retraites"];
    expect(divergences("THEMES (doublée)", doublee, SCHEMA, attendues)).toEqual([
      `THEMES (doublée) : « retraites » en double (face à ${SCHEMA})`,
      `THEMES (doublée) : 11 valeurs, ${SCHEMA} en porte 10`,
    ]);
  });

  it("refuse un pointeur qui ne mène à aucun enum, plutôt que de comparer à une liste vide", () => {
    expect(() => enumDuSchema(COMMUN, "#/$defs/theme_inexistant")).toThrow(/introuvable/);
    expect(() => enumDuSchema(COMMUN, "#/$defs")).toThrow(/introuvable/);
  });
});
