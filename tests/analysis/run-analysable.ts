/**
 * Un run complet en mémoire pour `analysis/analyse-du-run.ts` : périmètre, questions, tirage, items
 * datés, réponses, verdicts, notations humaines de l'échantillon et plan d'interrogation, cohérents
 * entre eux comme `lecture-run.ts:lireRun` les rendrait. Aucun contenu réel.
 *
 * Chaque candidat porte `items_p` items P et `items_f` items F, une question Q-DIR par item, trois
 * formulations ; chaque outil répond à chaque question dans chacun de ses modes, aux trois
 * formulations, échantillons 1 et 2 (§6), notés à l'identique. Les items P de rang pair datent de moins de 60 jours au gel, les
 * autres non. Une réponse sur sept est dans l'échantillon humain, notée à l'identique par deux humains.
 */

import type { EntreesDuRun, RunAnalyse } from "../../analysis/analyse-du-run.ts";
import type { ItemDate } from "../../analysis/strate-recente.ts";
import type { CategorieRetenue, Drapeau, EntreeTirage, Item, Mode, Notation, Question, Registre, Reponse, Verdict } from "../../analysis/types.ts";
import { candidat, empreinte, idQuestion, itemsPAuGel, notation, outil, planCouvrant, reponse, run, ulid, verdict } from "./fabriques.ts";

export const GEL = "2026-12-01T06:00:00+01:00";
const RECENT = "2026-11-15";
const ANCIEN = "2025-01-10";

export interface SpecCandidat {
  readonly id: string;
  readonly sous_seuil: boolean;
  readonly items_p: number;
  readonly items_f: number;
  /** Le nombre d'items P vérifiés lu au gel (§4) ; sans lui, 2 sous le seuil et 20 au-dessus. */
  readonly items_p_verifies?: number;
}

export interface SpecOutil {
  readonly outil_id: string;
  readonly modes: readonly Mode[];
}

export interface ContexteReponse {
  readonly outil_id: string;
  readonly mode: Mode;
  readonly candidat_id: string;
  readonly type: "P" | "F";
  readonly rang: number;
  readonly registre: Registre;
}

export interface SpecRun {
  readonly candidats: readonly SpecCandidat[];
  readonly outils: readonly SpecOutil[];
  /** La catégorie retenue de chaque réponse obtenue. */
  readonly categorie: (contexte: ContexteReponse) => CategorieRetenue;
  /** Les réponses manquantes : vrai pour une requête du plan sans réponse obtenue. */
  readonly manquante?: (contexte: ContexteReponse) => boolean;
  readonly tronquee?: (contexte: ContexteReponse) => boolean;
  /** Le run lui-même, pour poser deux runs (tendance, H5) ou un autre régime (§3). */
  readonly run?: SpecDuRun;
  /** Le canal application (§6, QR8) ; sans lui, le run n'a aucune réponse de l'application. */
  readonly application?: SpecApplication;
}

/** Une question du run, désignée par son item principal. */
export interface QuestionDuRun {
  readonly candidat_id: string;
  readonly type: "P" | "F";
  readonly rang: number;
}

export interface SaisieApplication extends QuestionDuRun {
  readonly outil_id: string;
  readonly testeur: string;
}

/**
 * §6 : le sous-échantillon de l'application et les saisies des testeurs, à la formulation neutre,
 * échantillon 1. Le sous-échantillon est posé ici, comme `pnpm analyze` le reçoit injecté.
 */
export interface SpecApplication {
  readonly dans_sous_echantillon: (question: QuestionDuRun) => boolean;
  /** Les testeurs qui ont saisi la question dans l'application de l'outil ; vide, aucune saisie. */
  readonly testeurs: (question: QuestionDuRun & { readonly outil_id: string }) => readonly string[];
  readonly categorie: (saisie: SaisieApplication) => CategorieRetenue;
}

export type RegimeInclusion = RunAnalyse["perimetre"]["regime_inclusion"];

export interface SpecDuRun {
  /** La clé de l'identifiant du run (`ulid`) ; sans elle, celle de la fabrique. */
  readonly cle?: string;
  readonly date_gel?: string;
  readonly regime_inclusion?: RegimeInclusion;
}

const REGISTRES: readonly Registre[] = ["neutre", "familier", "oriente"];

interface ItemDuRun {
  readonly item: Item & ItemDate;
  readonly rang: number;
}

function itemsDe(spec: SpecCandidat): ItemDuRun[] {
  const p = Array.from({ length: spec.items_p }, (_, rang) => ({
    item: { id: ulid(`item-${spec.id}-P-${rang}`), version: 1, type: "P" as const, candidat_id: spec.id, valide_du: rang % 2 === 0 ? RECENT : ANCIEN },
    rang,
  }));
  const f = Array.from({ length: spec.items_f }, (_, rang) => ({
    item: { id: ulid(`item-${spec.id}-F-${rang}`), version: 1, type: "F" as const, candidat_id: spec.id, valide_du: RECENT },
    rang,
  }));
  return [...p, ...f];
}

function questionDe(item: Item): Question {
  return {
    id: idQuestion(`q-${item.id}`),
    gabarit: "Q-DIR",
    candidat_id: item.candidat_id,
    items: [{ reference: { item_id: item.id, item_version: 1, item_empreinte: empreinte(item.id) }, role: "principal" }],
    grappe_id: item.id,
    formulations: REGISTRES.map((registre) => ({ id: ulid(`f-${item.id}-${registre}`), registre, empreinte_texte: empreinte(`${item.id}-${registre}`) })),
  };
}

function entreeDe(question: Question, item: ItemDuRun): EntreeTirage {
  return {
    question_id: question.id,
    candidat_id: item.item.candidat_id,
    theme: item.rang % 2 === 0 ? "retraites" : "sante",
    gabarit: "Q-DIR",
    premisse_fausse: item.item.type === "F",
  };
}

function drapeauxDe(categorie: CategorieRetenue, type: "P" | "F"): Drapeau[] {
  return categorie === "inexacte" && type === "F" ? ["fabrication"] : [];
}

interface Volume {
  readonly reponses: Reponse[];
  readonly verdicts: Verdict[];
  readonly notations: Notation[];
}

/** §6 : deux échantillons par question, par formulation et par mode. */
const ECHANTILLONS = [1, 2] as const;

interface RequeteDuRun {
  readonly contexte: ContexteReponse;
  readonly question: Question;
  readonly formulation_id: string;
  readonly echantillon: (typeof ECHANTILLONS)[number];
}

function contextesDe(spec: SpecRun, items: readonly ItemDuRun[], questions: readonly Question[]): RequeteDuRun[] {
  return spec.outils.flatMap((o) =>
    o.modes.flatMap((mode) =>
      items.flatMap((it, i) => {
        const question = questions[i] as Question;
        return question.formulations.flatMap((formulation) =>
          ECHANTILLONS.map((echantillon) => ({
            contexte: { outil_id: o.outil_id, mode, candidat_id: it.item.candidat_id, type: it.item.type as "P" | "F", rang: it.rang, registre: formulation.registre },
            question,
            formulation_id: formulation.id,
            echantillon,
          })),
        );
      }),
    ),
  );
}

/** L'identifiant d'une réponse : celui de l'échantillon 1 est resté celui du run à un échantillon. */
function idReponse(requete: RequeteDuRun): string {
  const { contexte, question, echantillon } = requete;
  const base = `r-${contexte.outil_id}-${contexte.mode}-${question.id}-${contexte.registre}`;
  return ulid(echantillon === 1 ? base : `${base}-e${echantillon}`);
}

function noter(spec: SpecRun, contexte: ContexteReponse, id: string, dans: boolean, volume: Volume): void {
  const categorie = spec.categorie(contexte);
  const drapeaux = drapeauxDe(categorie, contexte.type);
  volume.verdicts.push(verdict({ id: ulid(`v-${id}`), objet_note: { type: "reponse", id }, categorie_retenue: categorie, drapeaux_retenus: drapeaux, dans_echantillon_humain: dans }));
  if (!dans) return;
  for (const a of ["a1", "a2"]) {
    volume.notations.push(notation({ id: ulid(`n-${id}-${a}`), objet_note: { type: "reponse", id }, notateur: { type: "humain", id: a }, categorie, drapeaux }));
  }
}

function volumeDe(spec: SpecRun, items: readonly ItemDuRun[], questions: readonly Question[]): Volume {
  const volume: Volume = { reponses: [], verdicts: [], notations: [] };
  let rang = 0;
  for (const requete of contextesDe(spec, items, questions)) {
    const { contexte, question, formulation_id, echantillon } = requete;
    const id = idReponse(requete);
    const manquante = spec.manquante?.(contexte) === true;
    volume.reponses.push(
      reponse({
        id,
        outil_id: contexte.outil_id,
        mode: contexte.mode,
        question_id: question.id,
        formulation_id,
        echantillon,
        statut_reponse: manquante ? "manquante" : "obtenue",
        normalise: manquante ? undefined : { texte: "texte", liens: [], troncature: spec.tronquee?.(contexte) === true },
      }),
    );
    if (manquante) continue;
    rang += 1;
    noter(spec, contexte, id, rang % 7 === 0, volume);
  }
  return volume;
}

function candidatDe(c: SpecCandidat): ReturnType<typeof candidat> {
  const verifies = c.items_p_verifies ?? (c.sous_seuil ? 2 : 20);
  return candidat({ candidat_id: c.id, sous_seuil: c.sous_seuil, items_p_verifies: verifies, items_p_au_gel: itemsPAuGel(`p-${c.id}`, verifies) });
}

function questionDuRun(item: ItemDuRun): QuestionDuRun {
  return { candidat_id: item.item.candidat_id, type: item.item.type as "P" | "F", rang: item.rang };
}

function formulationNeutre(question: Question): string {
  const neutre = question.formulations.find((f) => f.registre === "neutre");
  if (neutre === undefined) throw new Error(`question ${question.id} sans formulation neutre`);
  return neutre.id;
}

/** §6 : chaque saisie d'un testeur est une réponse du canal application, sans mode, notée hors échantillon humain. */
function saisiesApplication(spec: SpecRun, items: readonly ItemDuRun[], questions: readonly Question[], volume: Volume): void {
  const application = spec.application;
  if (application === undefined) return;
  for (const o of spec.outils) {
    items.forEach((it, i) => {
      const question = questions[i] as Question;
      for (const testeur of application.testeurs({ ...questionDuRun(it), outil_id: o.outil_id })) {
        const id = ulid(`app-${o.outil_id}-${question.id}-${testeur}`);
        volume.reponses.push(
          reponse({ id, canal: "application", mode: undefined, outil_id: o.outil_id, question_id: question.id, formulation_id: formulationNeutre(question), echantillon: 1 }),
        );
        const categorie = application.categorie({ ...questionDuRun(it), outil_id: o.outil_id, testeur });
        volume.verdicts.push(verdict({ id: ulid(`v-${id}`), objet_note: { type: "reponse", id }, categorie_retenue: categorie, drapeaux_retenus: [], dans_echantillon_humain: false }));
      }
    });
  }
}

function sousEchantillonDe(spec: SpecRun, items: readonly ItemDuRun[], questions: readonly Question[]): readonly string[] | null {
  const application = spec.application;
  if (application === undefined) return null;
  return items.flatMap((it, i) => (application.dans_sous_echantillon(questionDuRun(it)) ? [(questions[i] as Question).id] : []));
}

export function entreesDuRunAnalysable(spec: SpecRun): EntreesDuRun {
  const items = spec.candidats.flatMap(itemsDe);
  const questions = items.map(({ item }) => questionDe(item));
  const entrees_tirage = items.map((item, i) => entreeDe(questions[i] as Question, item));
  const volume = volumeDe(spec, items, questions);
  saisiesApplication(spec, items, questions, volume);
  const { reponses, verdicts, notations } = volume;
  const base = run({
    ...(spec.run?.cle === undefined ? {} : { id: ulid(spec.run.cle) }),
    date_gel: spec.run?.date_gel ?? GEL,
    perimetre: {
      candidats: spec.candidats.map((c) =>
        candidatDe(c),
      ),
      outils: spec.outils.map((o) => outil({ outil_id: o.outil_id, modes: o.modes, mode_de_tete: o.modes[0] })),
    },
  });
  const leRun: RunAnalyse = {
    ...base,
    perimetre: { ...base.perimetre, regime_inclusion: spec.run?.regime_inclusion ?? "liste_officielle" },
    versions: { donnees_commit: "c".repeat(40) },
    tirage: { sha256: empreinte("tirage") },
    juges: [{ juge_id: "juge-1", retire: false }, { juge_id: "juge-2", retire: false }],
    graines: { bootstrap: { valeur: 20261203 }, permutation: { valeur: 20261204 } },
  };
  return {
    run: leRun,
    entrees_tirage,
    questions,
    items: items.map((i) => i.item),
    reponses,
    verdicts,
    notations,
    plan: planCouvrant(reponses),
    questions_sous_echantillon: sousEchantillonDe(spec, items, questions),
    // Aucun comparateur inclus : aucune lecture (tests/analysis/analyse-du-run-comparateurs.test.ts les pose).
    lectures: [],
    etats_des_lectures: [],
  };
}

function estIncompleteGamma(c: ContexteReponse): boolean {
  return c.outil_id === "outil-gamma" && c.mode === "web_activee" && c.registre !== "neutre";
}

function estManquanteAlpha(c: ContexteReponse): boolean {
  return c.outil_id === "outil-alpha" && c.mode === "web_desactivee" && c.candidat_id === "candidat-a" && c.type === "P" && c.rang === 0 && c.registre === "neutre";
}

/** Le run de référence des tests : trois outils, trois candidats dont un sous le seuil. */
export const SPEC_REFERENCE: SpecRun = {
  candidats: [
    { id: "candidat-a", sous_seuil: false, items_p: 4, items_f: 1 },
    { id: "candidat-b", sous_seuil: false, items_p: 4, items_f: 1 },
    { id: "candidat-bas", sous_seuil: true, items_p: 2, items_f: 0 },
  ],
  outils: [
    { outil_id: "outil-alpha", modes: ["web_desactivee", "web_activee"] },
    { outil_id: "outil-beta", modes: ["web_desactivee"] },
    { outil_id: "outil-gamma", modes: ["web_desactivee", "web_activee"] },
  ],
  // candidat-b se trompe plus souvent ; les items F sont niés (exacte), sauf chez outil-beta.
  categorie: (c) => {
    if (c.type === "F") return c.outil_id === "outil-beta" && c.registre === "oriente" ? "inexacte" : "exacte";
    if (c.registre === "familier" && c.rang === 3) return "non_reponse";
    return c.candidat_id === "candidat-b" && c.rang % 2 === 1 ? "inexacte" : "exacte";
  },
  // outil-gamma / web_activee : deux réponses sur trois manquent (hors neutre), run incomplet ;
  // outil-alpha / web_desactivee : une seule, sous le seuil de 20 %.
  manquante: (c) => estIncompleteGamma(c) || estManquanteAlpha(c),
  tronquee: (c) => c.registre === "familier" && c.rang === 1,
};

function saisieParAlpha(q: QuestionDuRun & { readonly outil_id: string }): boolean {
  return q.outil_id === "outil-alpha" && q.type === "P" && q.rang <= 1 && q.candidat_id !== "candidat-bas";
}

/**
 * Un run avec le canal application (§6, QR8). Deux outils ; seul outil-alpha est saisi dans
 * l'application. Sous-échantillon : les items P de rang 0 et 1 de candidat-a et de candidat-b. Le
 * testeur t2 n'a pas saisi la question de candidat-b, rang 1. L'API (mode de tête web_desactivee,
 * neutre, échantillon 1) est exacte partout sauf sur candidat-b rang 1 ; l'application est inexacte
 * sur candidat-a rang 0, pour les deux testeurs. Écart attendu : 3/4 moins 5/7.
 */
export const SPEC_APPLICATION: SpecRun = {
  candidats: SPEC_REFERENCE.candidats,
  outils: [
    { outil_id: "outil-alpha", modes: ["web_desactivee", "web_activee"] },
    { outil_id: "outil-beta", modes: ["web_desactivee"] },
  ],
  categorie: (c) => (c.candidat_id === "candidat-b" && c.rang === 1 ? "inexacte" : "exacte"),
  application: {
    dans_sous_echantillon: (q) => q.type === "P" && q.rang <= 1 && q.candidat_id !== "candidat-bas",
    testeurs: (q) => {
      if (!saisieParAlpha(q)) return [];
      return q.candidat_id === "candidat-b" && q.rang === 1 ? ["t1"] : ["t1", "t2"];
    },
    categorie: (s) => (s.candidat_id === "candidat-a" && s.rang === 0 ? "inexacte" : "exacte"),
  },
};

/** D73 (7) : un juge du run, tel que run.json le publie, avec ou sans la liste déclarée au gel. */
export interface JugeDuRunAnalysable {
  readonly juge_id: string;
  readonly retire: boolean;
  readonly outils_de_son_editeur?: readonly string[];
}

/**
 * Le run `entrees` noté par deux juges (§7) : `juges` remplace les juges du run, et chaque réponse
 * obtenue du canal API reçoit une notation de chaque juge, de catégorie `note(retenue, outil, juge)`.
 * Les refus de l'API, notés par règle, ne reçoivent rien (aucun ici).
 */
export function avecNotesDeJuges(
  entrees: EntreesDuRun,
  juges: readonly JugeDuRunAnalysable[],
  note: (categorie_retenue: CategorieRetenue, outil_id: string, juge_id: string) => CategorieRetenue,
): EntreesDuRun {
  const verdicts = new Map(entrees.verdicts.map((v) => [v.objet_note.id, v.categorie_retenue]));
  const notees = entrees.reponses.filter((r) => r.canal === "api" && r.statut_reponse === "obtenue");
  const deJuges = notees.flatMap((r) =>
    juges.map((juge) => {
      const retenue = verdicts.get(r.id);
      if (retenue === undefined) throw new Error(`réponse ${r.id} sans verdict`);
      return notation({
        id: ulid(`nj-${r.id}-${juge.juge_id}`),
        objet_note: { type: "reponse", id: r.id },
        notateur: { type: "juge", id: juge.juge_id },
        categorie: note(retenue, r.outil_id, juge.juge_id),
        motif_notation: "notation_juge",
      });
    }),
  );
  return { ...entrees, run: { ...entrees.run, juges }, notations: [...entrees.notations, ...deJuges] };
}
