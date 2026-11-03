/**
 * Un run complet en mémoire pour `analysis/analyse-du-run.ts` : périmètre, questions, tirage, items
 * datés, réponses, verdicts, notations humaines de l'échantillon et plan d'interrogation, cohérents
 * entre eux comme `lecture-run.ts:lireRun` les rendrait. Aucun contenu réel.
 *
 * Chaque candidat porte `items_p` items P et `items_f` items F, une question Q-DIR par item, trois
 * formulations ; chaque outil répond à chaque question dans chacun de ses modes, aux trois
 * formulations, échantillon 1. Les items P de rang pair datent de moins de 60 jours au gel, les
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

function contextesDe(spec: SpecRun, items: readonly ItemDuRun[], questions: readonly Question[]): { contexte: ContexteReponse; question: Question; formulation_id: string }[] {
  return spec.outils.flatMap((o) =>
    o.modes.flatMap((mode) =>
      items.flatMap((it, i) => {
        const question = questions[i] as Question;
        return question.formulations.map((formulation) => ({
          contexte: { outil_id: o.outil_id, mode, candidat_id: it.item.candidat_id, type: it.item.type as "P" | "F", rang: it.rang, registre: formulation.registre },
          question,
          formulation_id: formulation.id,
        }));
      }),
    ),
  );
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
  for (const { contexte, question, formulation_id } of contextesDe(spec, items, questions)) {
    const id = ulid(`r-${contexte.outil_id}-${contexte.mode}-${question.id}-${contexte.registre}`);
    const manquante = spec.manquante?.(contexte) === true;
    volume.reponses.push(
      reponse({
        id,
        outil_id: contexte.outil_id,
        mode: contexte.mode,
        question_id: question.id,
        formulation_id,
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

export function entreesDuRunAnalysable(spec: SpecRun): EntreesDuRun {
  const items = spec.candidats.flatMap(itemsDe);
  const questions = items.map(({ item }) => questionDe(item));
  const entrees_tirage = items.map((item, i) => entreeDe(questions[i] as Question, item));
  const { reponses, verdicts, notations } = volumeDe(spec, items, questions);
  const base = run({
    ...(spec.run?.cle === undefined ? {} : { id: ulid(spec.run.cle) }),
    date_gel: spec.run?.date_gel ?? GEL,
    perimetre: {
      candidats: spec.candidats.map((c) =>
        candidat({ candidat_id: c.id, sous_seuil: c.sous_seuil, items_p_verifies: c.sous_seuil ? 2 : 20, items_p_au_gel: itemsPAuGel(`p-${c.id}`, c.sous_seuil ? 2 : 20) }),
      ),
      outils: spec.outils.map((o) => outil({ outil_id: o.outil_id, modes: o.modes, mode_de_tete: o.modes[0] })),
    },
  });
  const leRun: RunAnalyse = {
    ...base,
    perimetre: { ...base.perimetre, regime_inclusion: spec.run?.regime_inclusion ?? "liste_officielle" },
    versions: { donnees_commit: "c".repeat(40) },
    tirage: { sha256: empreinte("tirage") },
    juges: [{ juge_id: "juge-1" }, { juge_id: "juge-2" }],
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
