/**
 * La checklist de run de l'annexe F (« exécutée par le pipeline, puis contresignée par l'auteur »),
 * `runs/<date>/checklist.json`, `schema/checklist.schema.json` (D24 (4)).
 *
 * Les dix cases, dans l'ordre et avec le texte exact du protocole, sont des données : chacune est
 * `calculee` (son état découle des critères du §12 qu'elle cite et, pour deux d'entre elles, d'un
 * constat lu sur les fichiers du run) ou `declaree` (rien dans les fichiers ne la rend décidable :
 * l'auteur la déclare au contreseing). Le pipeline écrit la checklist sans contreseing, et sans état
 * pour les cases déclarées : il ne déclare rien à la place de l'auteur.
 *
 * Une case calculée est `faite` si tous ses appuis le sont ; sinon `non_faite`, avec un motif qui
 * nomme chaque appui manquant. D25 (3) : chaque partie du texte d'une case calculée a son appui ;
 * celles qu'aucun fichier ne porte encore (« Items d'absence revérifiés ») ou qu'un fichier ne porte
 * qu'en partie (« robustesse calculée », dont la robustesse des différences est à venir) ont un
 * constat non fait qui le dit, jamais un constat fait par défaut.
 */

import { canoniser } from "../../validation/domaine/empreinte.ts";
import type { Ulid } from "../../analysis/types.ts";
import { FenetreRefusee, ouvrirFenetre, tentativePeutDemarrer, type Fenetre } from "../interrogation/fenetre.ts";
import { lireInstant } from "../interrogation/heure-paris.ts";
import type { RobustesseLue } from "./metriques.ts";
import type { CodeCritere, Critere } from "./types.ts";

export type NatureCase = "calculee" | "declaree";
export type EtatCase = "faite" | "non_faite";

/** Ce qu'une case calculée lit hors des sept critères. */
export type NomConstat =
  | "items_absence_reverifies"
  | "graine_du_tirage_enregistree"
  | "interrogation_dans_la_fenetre"
  | "notation_complete"
  | "robustesse_calculee";
export type Appui = CodeCritere | NomConstat;

export interface Constat {
  readonly nom: NomConstat;
  readonly fait: boolean;
  /** Ce qui manque, quand le constat n'est pas fait. */
  readonly detail: string;
}

export interface CaseChecklist {
  readonly rang: number;
  readonly texte: string;
  readonly nature: NatureCase;
  readonly appuis?: readonly Appui[];
  readonly etat?: EtatCase;
  readonly motif?: string;
}

export interface Contreseing {
  readonly nom: string;
  readonly date: string;
}

export interface Checklist {
  readonly run_id: Ulid;
  readonly cases: readonly CaseChecklist[];
  readonly contreseing?: Contreseing;
}

interface ModeleCase {
  readonly texte: string;
  readonly nature: NatureCase;
  readonly appuis: readonly Appui[];
}

/** Annexe F, mot pour mot, dans l'ordre (tests/go-no-go/checklist.test.ts le relit dans le protocole). */
export const CASES_ANNEXE_F: readonly ModeleCase[] = [
  { texte: "Périmètre candidats et outils conforme aux règles de la section 3 à la date de gel", nature: "declaree", appuis: [] },
  {
    texte: "Items d'absence revérifiés ; aucun item contesté ou en attente dans le tirage",
    nature: "calculee",
    appuis: ["items_absence_reverifies", "aucun_item_conteste_dans_le_tirage"],
  },
  { texte: "Tests de symétrie verts ; graine du tirage enregistrée", nature: "calculee", appuis: ["tests_symetrie", "graine_du_tirage_enregistree"] },
  {
    texte: "Interrogation dans la fenêtre de 48 h ; réponses manquantes ≤ 20 % par outil et par mode, sur le canal API",
    nature: "calculee",
    appuis: ["interrogation_dans_la_fenetre", "reponses_manquantes"],
  },
  {
    texte: "Notation par les deux juges ; désaccords, échantillon de 10 % et erreurs graves notés par des humains",
    nature: "calculee",
    appuis: ["notation_complete", "erreurs_graves_revues"],
  },
  { texte: "Kappa juges-humains ≥ 0,75 ; test contrefactuel ≤ 3 %", nature: "calculee", appuis: ["kappa_juges_humains", "test_contrefactuel"] },
  {
    texte: "Analyses préenregistrées exécutées avec la graine publiée ; robustesse calculée",
    nature: "calculee",
    appuis: ["analyses_preenregistrees_executees", "robustesse_calculee"],
  },
  { texte: "Note éditoriale rédigée ; phrase d'avertissement de la section 8 en tête", nature: "declaree", appuis: [] },
  { texte: "Données, réponses brutes, notations, code et rapport publiés ensemble ; DOI émis", nature: "declaree", appuis: [] },
  { texte: "Éditeurs et campagnes notifiés après publication", nature: "declaree", appuis: [] },
];

/* ------------------------------------------------------------------ constats */

/** « graine du tirage enregistrée » : `tirage.json` porte la graine de `run.json#/graines/tirage`. */
export function constatGraineDuTirage(graine_du_run: unknown, graine_du_fichier: unknown): Constat {
  const nom = "graine_du_tirage_enregistree";
  if (graine_du_fichier === undefined) return { nom, fait: false, detail: "tirage.json absent du répertoire du run" };
  if (canoniser(graine_du_fichier) !== canoniser(graine_du_run)) {
    return { nom, fait: false, detail: "la graine de tirage.json diffère de run.json#/graines/tirage" };
  }
  return { nom, fait: true, detail: "" };
}

/**
 * « Items d'absence revérifiés » (D25 (3)) : aucun fichier du run ne porte encore cette
 * revérification (lot extraction). Non faite, et dite comme telle, tant que rien ne la produit.
 */
export function constatItemsAbsenceReverifies(): Constat {
  return {
    nom: "items_absence_reverifies",
    fait: false,
    detail: "revérification des items d'absence : aucun fichier du run ne la porte encore (lot extraction)",
  };
}

/** Le libellé de chaque section de robustesse de `metriques.json` dans le motif de la case 7. */
const SECTIONS_DE_ROBUSTESSE: readonly { readonly section: keyof RobustesseLue; readonly libelle: string }[] = [
  { section: "taux", libelle: "robustesse des taux" },
  { section: "differences", libelle: "robustesse des différences" },
];

/**
 * « robustesse calculée » (annexe F, D25 (3)) : les deux sections `robustesse` de `metriques.json`
 * (`pipeline/go-no-go/metriques.ts`) sont `calcule`. Une section `sans_objet`, quel qu'en soit le
 * motif (`calcul_a_venir` pour les différences tant que le sous-lot B n'est pas écrit), laisse la
 * case non faite et le motif la nomme ; `null` (`metriques/` absent) aussi. Jamais faite par défaut.
 */
export function constatRobustesseCalculee(robustesse: RobustesseLue | null): Constat {
  const nom = "robustesse_calculee";
  if (robustesse === null) return { nom, fait: false, detail: "robustesse : runs/<date>/metriques/metriques.json absent (pnpm analyze)" };
  const manques = SECTIONS_DE_ROBUSTESSE.flatMap(({ section, libelle }) => {
    const lue = robustesse[section];
    return lue.statut === "calcule" ? [] : [`${libelle} non calculée (${lue.motif})`];
  });
  return { nom, fait: manques.length === 0, detail: manques.join(" ; ") };
}

/** Ce que le constat de la fenêtre lit d'une réponse : où elle a été obtenue, et quand chaque tentative a démarré. */
export interface DemarragesDeReponse {
  readonly contexte: string;
  readonly canal: string;
  readonly statut_reponse: string;
  /** Les tentatives en échec, horodatées à leur démarrage (`pipeline/interrogation/executer.ts`). */
  readonly tentatives?: readonly { readonly horodatage: string }[];
  /** Le démarrage de la tentative qui a abouti, pour une réponse obtenue. */
  readonly metadonnees?: { readonly horodatage_requete: string };
}

/** Le défaut de `run.json#/fenetre` au regard du §6, ou `null` : ouverte un mardi à 6 h, durée 48 h. */
function defautDeFenetre(fenetre: { readonly debut: string; readonly fin: string }): string | null {
  let ouverte: Fenetre;
  try {
    ouverte = ouvrirFenetre(fenetre.debut);
  } catch (erreur) {
    if (erreur instanceof FenetreRefusee) return erreur.message;
    throw erreur;
  }
  if (lireInstant(fenetre.fin, "run.json#/fenetre/fin") !== ouverte.fin_ms) return "run.json#/fenetre/fin n'est pas debut + 48 h (§6)";
  return null;
}

function demarrages(reponse: DemarragesDeReponse): readonly string[] {
  const echecs = reponse.tentatives === undefined ? [] : reponse.tentatives.map((t) => t.horodatage);
  return reponse.metadonnees === undefined ? echecs : [...echecs, reponse.metadonnees.horodatage_requete];
}

/**
 * « Interrogation dans la fenêtre de 48 h » (§6) : la fenêtre du run est celle du §6, et chaque
 * tentative d'une réponse API du run a démarré dans [debut, fin) — bornes de
 * `pipeline/interrogation/fenetre.ts:tentativePeutDemarrer` (décision de l'auteur du 2026-10-02 :
 * aucune tentative ne démarre à fin ou après). Une manquante hors fenêtre sans tentative n'a rien
 * démarré ; une réponse qui arrive après fin, démarrée avant, est dans la fenêtre.
 */
export function constatInterrogationDansLaFenetre(
  fenetre: { readonly debut: string; readonly fin: string },
  reponses: readonly DemarragesDeReponse[],
): Constat {
  const nom = "interrogation_dans_la_fenetre";
  const defaut = defautDeFenetre(fenetre);
  if (defaut !== null) return { nom, fait: false, detail: defaut };
  const ouverte = ouvrirFenetre(fenetre.debut);
  const hors = reponses
    .filter((r) => r.contexte === "run" && r.canal === "api")
    .flatMap(demarrages)
    .filter((horodatage) => !tentativePeutDemarrer(ouverte, lireInstant(horodatage, "démarrage d'une tentative"))).length;
  if (hors > 0) return { nom, fait: false, detail: `${hors} tentative(s) démarrée(s) hors de la fenêtre [debut, fin)` };
  return { nom, fait: true, detail: "" };
}

/** Toute réponse obtenue du run a son verdict : aucune n'attend plus un juge ni un humain (§7). */
export function constatNotationComplete(reponses_obtenues: readonly Ulid[], objets_decides: ReadonlySet<Ulid>): Constat {
  const sans = reponses_obtenues.filter((id) => !objets_decides.has(id)).length;
  if (sans === 0) return { nom: "notation_complete", fait: true, detail: "" };
  return { nom: "notation_complete", fait: false, detail: `${sans} réponse(s) obtenue(s) sans verdict` };
}

/* ------------------------------------------------------------------ construction */

function manquesDe(appuis: readonly Appui[], criteres: readonly Critere[], constats: readonly Constat[]): readonly string[] {
  return appuis.flatMap((appui) => {
    const critere = criteres.find((c) => c.code === appui);
    if (critere !== undefined) return critere.statut === "vert" ? [] : [`critère ${appui} au rouge`];
    const constat = constats.find((c) => c.nom === appui);
    if (constat === undefined) throw new Error(`Appui ${appui} de la checklist sans critère ni constat : la case ne serait pas décidée.`);
    return constat.fait ? [] : [constat.detail];
  });
}

function caseCalculee(rang: number, modele: ModeleCase, criteres: readonly Critere[], constats: readonly Constat[]): CaseChecklist {
  const socle = { rang, texte: modele.texte, nature: modele.nature, appuis: modele.appuis };
  const manques = manquesDe(modele.appuis, criteres, constats);
  if (manques.length === 0) return { ...socle, etat: "faite" };
  return { ...socle, etat: "non_faite", motif: `${manques.join(" ; ")}.` };
}

/** La checklist que le pipeline écrit : sans contreseing, les cases déclarées sans état. */
export function construireChecklist(run_id: Ulid, criteres: readonly Critere[], constats: readonly Constat[]): Checklist {
  const cases = CASES_ANNEXE_F.map((modele, indice) =>
    modele.nature === "declaree" ? { rang: indice + 1, texte: modele.texte, nature: modele.nature } : caseCalculee(indice + 1, modele, criteres, constats),
  );
  return { run_id, cases };
}

/**
 * La part d'une checklist que le pipeline produit : ce que le contreseing ajoute (le contreseing
 * lui-même, l'état et le motif des cases déclarées) en est retiré. Sert à comparer une checklist
 * déjà écrite, éventuellement contresignée, au recalcul.
 */
export function partDuPipeline(checklist: Checklist): Checklist {
  const cases = checklist.cases.map((c) => (c.nature === "declaree" ? { rang: c.rang, texte: c.texte, nature: c.nature } : c));
  return { run_id: checklist.run_id, cases };
}
