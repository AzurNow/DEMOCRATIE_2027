/**
 * Effets de condition (§8, protocole 0.3, QR6/H2/H3).
 *
 * « Différences appariées par item entre modes et entre formulations, intervalle par bootstrap en
 * grappes. La famille des formulations compte trois paires : neutre contre familière, neutre
 * contre orientée, familière contre orientée. Aucune valeur p n'est définie pour cette famille :
 * la conclusion s'y lit sur l'intervalle de la différence et sur le qualificatif « établie » ou
 * « non établie » défini plus haut. La correction de Holm ne s'y applique donc pas — elle ne vaut
 * que pour le test d'asymétrie, seul endroit du protocole où une valeur p est calculée. »
 *
 * **Aucune valeur p, dans aucune des deux familles.** Puisque le test d'asymétrie est « le seul
 * endroit du protocole où une valeur p est calculée », la famille des modes n'en porte pas plus que
 * celle des formulations. Une comparaison publie sa différence, son intervalle et son qualificatif
 * — rien d'autre. Holm vit dans `holm.ts` et ne sert qu'à `permutation.ts`.
 *
 * **Appariement par item.** Un item absent de l'un des deux bras sort de la comparaison et est
 * nommé dans `grappes_exclues`. Il n'est jamais remplacé par une moyenne, un zéro ou un report :
 * comparer deux modes sur des items différents ne mesure plus le mode.
 */

import { apparier } from "./appariement.ts";
import { differenceAppariee, type DifferenceTaux, type OptionsBootstrap, type Statistique } from "./bootstrap.ts";
import type { UniteAnalyse } from "./filtre.ts";
import { cleCouple, etatDesCouples, type EtatCouple, type PartageCouples } from "./seuils.ts";
import { MODES, type CoupleOutilMode, type Mode, type Registre, type TypeItem, type Ulid } from "./types.ts";

export interface PaireCondition {
  readonly cle: string;
  readonly a: readonly UniteAnalyse[];
  readonly b: readonly UniteAnalyse[];
}

export interface ComparaisonCondition {
  readonly cle: string;
  readonly difference: DifferenceTaux;
  readonly grappes_appariees: number;
  /** Items présents dans un seul bras : nommés, jamais complétés. */
  readonly grappes_exclues: readonly Ulid[];
}

/** Ordre figé des comparaisons de formulation : les trois paires des trois registres du §5. */
const PAIRES_REGISTRES: readonly (readonly [Registre, Registre])[] = [
  ["neutre", "familier"],
  ["neutre", "oriente"],
  ["familier", "oriente"],
];

/** Chaque paire est comparée seule : aucune correction de famille ne s'applique (§8 0.3). */
export function comparerConditions(
  paires: readonly PaireCondition[],
  statistique: Statistique,
  options: OptionsBootstrap,
): ComparaisonCondition[] {
  return paires.map((paire) => comparerUnePaire(paire, statistique, options));
}

function comparerUnePaire(
  paire: PaireCondition,
  statistique: Statistique,
  options: OptionsBootstrap,
): ComparaisonCondition {
  const appariement = apparier(paire.a, paire.b, (u) => u.grappe_id);
  // Graine propre à la paire (`graines.ts`) : la clé de l'appelant, suivie de celle de la paire.
  const optionsDeLaPaire = { ...options, cle: [...options.cle, paire.cle] };
  return {
    cle: paire.cle,
    difference: differenceAppariee(appariement.a, appariement.b, statistique, optionsDeLaPaire),
    grappes_appariees: appariement.communes.length,
    grappes_exclues: appariement.exclues,
  };
}

/** Une paire que le §8 aurait formée, retirée parce qu'un de ses couples est « run incomplet ». */
export interface PaireExclue {
  readonly cle: string;
  /** Clés `cleCouple` des couples incomplets de la paire. */
  readonly couples_incomplets: readonly string[];
}

export interface PairesDeCondition {
  readonly paires: readonly PaireCondition[];
  /**
   * §8 : un couple marqué « run incomplet » est « exclu des comparaisons de ce run »
   * (conformité 2026-09-29, n° 12). Nommées, jamais comparées.
   */
  readonly paires_exclues: readonly PaireExclue[];
}

/**
 * Famille des modes : une comparaison par outil, sur toutes ses formulations. Les réponses sans
 * mode (canal application, §6) n'y figurent pas — elles n'ont pas de mode à comparer. Un outil
 * dont l'un des deux modes est incomplet n'a pas de comparaison de modes ; l'autre mode reste
 * publié dans les métriques primaires (§8).
 */
/** Clé de la comparaison des deux modes d'un outil (§8, « Graines de l'analyse ») : `<outil>:web_activee-web_desactivee`. */
export function cleComparaisonModes(outil_id: string): string {
  const [premier, second] = MODES;
  return `${outil_id}:${premier}-${second}`;
}

export function pairesParMode(unites: readonly UniteAnalyse[], couples: PartageCouples): PairesDeCondition {
  const etat = etatDesUnites(unites, couples);
  const formees: PaireFormee[] = [];
  const [premier, second] = MODES;
  for (const [outil_id, membres] of grouperPar(avecMode(unites), (u) => u.outil_id)) {
    const a = membres.filter((u) => u.mode === premier);
    const b = membres.filter((u) => u.mode === second);
    if (a.length === 0 || b.length === 0) continue;
    const incomplets = [premier, second]
      .filter((mode) => etat({ outil_id, mode }) === "incomplet")
      .map((mode) => cleCouple({ outil_id, mode }));
    formees.push({ paire: { cle: cleComparaisonModes(outil_id), a, b }, incomplets });
  }
  return repartirPaires(formees);
}

/**
 * Famille des formulations : les trois paires de registres, à outil ET mode constants — comparer
 * deux registres à travers deux modes mélangerait les deux effets que le §8 sépare. Les trois
 * paires d'un couple incomplet sont exclues.
 */
export function pairesParFormulation(unites: readonly UniteAnalyse[], couples: PartageCouples): PairesDeCondition {
  const etat = etatDesUnites(unites, couples);
  const formees: PaireFormee[] = [];
  for (const membres of grouperPar(avecMode(unites), (u) => `${u.outil_id}:${u.mode as Mode}`).values()) {
    const premiere = membres[0] as UniteAnalyse;
    const couple = { outil_id: premiere.outil_id, mode: premiere.mode as Mode };
    const incomplets = etat(couple) === "incomplet" ? [cleCouple(couple)] : [];
    for (const [r1, r2] of PAIRES_REGISTRES) {
      const a = membres.filter((u) => u.registre === r1);
      const b = membres.filter((u) => u.registre === r2);
      if (a.length > 0 && b.length > 0) {
        formees.push({ paire: { cle: cleComparaisonFormulations(couple, r1, r2), a, b }, incomplets });
      }
    }
  }
  return repartirPaires(formees);
}

/** Clé d'une paire de formulations (§8, « Graines de l'analyse ») : `<outil>:<mode>:<registre>-<registre>`. */
export function cleComparaisonFormulations(couple: CoupleOutilMode, r1: Registre, r2: Registre): string {
  return `${couple.outil_id}:${couple.mode}:${r1}-${r2}`;
}

/**
 * §8 (0.27, D69) : les clés des paires de formulations d'un couple qui comprennent l'orientée. Elles
 * comparent le registre orienté lui-même : le recalcul (c), qui l'exclut, y est « sans objet ». La
 * paire de H3, neutre − orientée (`cleComparaisonH3`), en est.
 */
export function clesComparantLeRegistreOriente(couple: CoupleOutilMode): string[] {
  return PAIRES_REGISTRES.filter((paire) => paire.includes("oriente")).map(([r1, r2]) => cleComparaisonFormulations(couple, r1, r2));
}

/**
 * §2 (0.27, D63) : H3 lit « la différence appariée de son exactitude, formulation neutre moins
 * formulation orientée, restreinte aux questions dont l'item principal est un item F ou O ».
 */
export const TYPES_ITEM_H3: readonly TypeItem[] = ["F", "O"];

export function cleComparaisonH3(couple: CoupleOutilMode): string {
  return cleComparaisonFormulations(couple, "neutre", "oriente");
}

/**
 * Les paires de H3 : la famille des formulations (`pairesParFormulation`, mêmes règles
 * d'appariement et d'exclusion des couples incomplets) sur les seules unités dont l'item principal
 * est F ou O, réduite à la paire neutre − orientée de chaque couple. Un couple sans réponse F ou O
 * dans l'un des deux registres n'a pas de paire : il n'est ni comparé, ni exclu.
 */
export function pairesDeH3(unites: readonly UniteAnalyse[], couples: PartageCouples): PairesDeCondition {
  const restreintes = unites.filter((u) => u.type_item_principal !== null && TYPES_ITEM_H3.includes(u.type_item_principal));
  const formulations = pairesParFormulation(restreintes, couples);
  const cles = new Set([...couples.compares, ...couples.incomplets].map(cleComparaisonH3));
  return {
    paires: formulations.paires.filter((p) => cles.has(p.cle)),
    paires_exclues: formulations.paires_exclues.filter((p) => cles.has(p.cle)),
  };
}

interface PaireFormee {
  readonly paire: PaireCondition;
  readonly incomplets: readonly string[];
}

function repartirPaires(formees: readonly PaireFormee[]): PairesDeCondition {
  const paires: PaireCondition[] = [];
  const paires_exclues: PaireExclue[] = [];
  for (const { paire, incomplets } of formees) {
    if (incomplets.length === 0) paires.push(paire);
    else paires_exclues.push({ cle: paire.cle, couples_incomplets: incomplets });
  }
  return { paires, paires_exclues };
}

/**
 * Le partage lu pour toutes les unités à mode, pas seulement celles d'une paire formée : une unité
 * d'un couple inconnu du partage lève, même si elle ne serait comparée à rien.
 */
function etatDesUnites(unites: readonly UniteAnalyse[], couples: PartageCouples): (couple: CoupleOutilMode) => EtatCouple {
  const etat = etatDesCouples(couples);
  for (const unite of avecMode(unites)) etat({ outil_id: unite.outil_id, mode: unite.mode as Mode });
  return etat;
}

function avecMode(unites: readonly UniteAnalyse[]): UniteAnalyse[] {
  return unites.filter((u) => u.mode !== null);
}

function grouperPar(
  unites: readonly UniteAnalyse[],
  cle: (unite: UniteAnalyse) => string,
): Map<string, UniteAnalyse[]> {
  const groupes = new Map<string, UniteAnalyse[]>();
  for (const unite of unites) {
    const k = cle(unite);
    const existant = groupes.get(k);
    if (existant === undefined) groupes.set(k, [unite]);
    else existant.push(unite);
  }
  return groupes;
}
