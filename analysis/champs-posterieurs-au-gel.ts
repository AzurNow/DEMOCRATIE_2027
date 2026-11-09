/**
 * Les champs que `run.json` reçoit, ou dont la valeur change, après le gel : la seule liste, lue
 * par chaque comparaison de `run.json` (DETTE 2026-11-04 n° 2). Une commande qui se met à écrire un
 * champ de plus dans `run.json` après le gel l'ajoute ici, au groupe de la commande qui l'écrit, et
 * nulle part ailleurs ; `tests/run/champs-posterieurs-au-gel.test.ts` le fait alors passer par
 * chaque comparaison.
 *
 * Les champs sont rangés par auteur. Deux listes en sont tirées, une par rôle, qu'il ne faut pas
 * confondre :
 *
 * - `CHAMPS_ECRITS_APRES_LE_GEL` : tout ce que le gel n'a pas fixé. Une comparaison qui reconnaît le
 *   même gel les ignore tous (`memeGel`, lu par `pipeline/notation/notation-simulee.ts` avant de
 *   lever `GelDivergent`).
 * - `CHAMPS_HORS_EMPREINTE_DU_RUN` : ce que `run.json` reçoit après l'analyse, hors de l'empreinte
 *   `entrees.run_json_sha256` de `metriques.json` (`analysis/analyse-du-run.ts:empreinteDuRun`).
 *   Ce que la notation, une invalidation ou une contestation postérieure écrivent avant l'analyse
 *   reste dans l'empreinte : c'est ce que l'analyse a lu.
 *
 * Le go/no-go compare à son recalcul la seule part qu'il écrit (`partDesChamps` sur
 * `CHAMPS_DU_GO_NO_GO`, `pipeline/go-no-go/go-no-go.ts`).
 */

import { canoniser } from "../validation/domaine/empreinte.ts";

/** Les quatre emplacements de `run.json` où un champ est écrit après le gel. */
export interface ChampsDeRunJson {
  /** À la racine de `run.json`. */
  readonly racine: readonly string[];
  /** Dans chaque élément de `juges`. */
  readonly juges: readonly string[];
  /** Dans chaque élément de `perimetre.outils`. */
  readonly outils: readonly string[];
  /** Dans le bloc `reponses`. */
  readonly reponses: readonly string[];
}

const AUCUN: ChampsDeRunJson = { racine: [], juges: [], outils: [], reponses: [] };

/* ------------------------------------------------------------------ par auteur */

/**
 * Les champs d'un juge que le test contrefactuel fixe (§7, `pipeline/notation/inscription-contrefactuel.ts`).
 * `retire` est déjà écrit au gel ; la notation le réécrit.
 */
export const CHAMPS_DU_TEST = ["retire", "motif_retrait", "taux_changement_contrefactuel", "changements_contrefactuel", "paires_ecartees_contrefactuel", "motif_indefini_contrefactuel"] as const;

/**
 * Ce que la chaîne de notation écrit (`pipeline/notation/chaine.ts`) : le test contrefactuel et le
 * taux de l'échantillon humain qui en découle (§7 : 10 %, 25 % après retrait d'un juge ; écrit au
 * gel, réécrit ici), et le nombre de réponses obtenues, inscrit en tête de la notation (§5
 * « Tailles », `pipeline/notation/inscription-reponses.ts`), et le bloc du contrefactuel d'outil :
 * son absence motivée, ou le test joué avec ses taux (`pipeline/notation/inscription-contrefactuel-outils.ts`,
 * D75 (7), D90). Avant l'analyse : dans l'empreinte.
 */
export const CHAMPS_DE_LA_NOTATION: ChampsDeRunJson = {
  ...AUCUN,
  racine: ["contrefactuel_candidats", "taux_echantillon_humain", "contrefactuel_outils"],
  juges: CHAMPS_DU_TEST,
  reponses: ["obtenues"],
};

/**
 * L'invalidation d'un run (D51 (2) : `pnpm run:invalider`, ou la notation en D16 (3)) et les
 * contestations postérieures (`pipeline/run/contestations-posterieures.ts`, D72 (2)). Dans
 * l'empreinte, même inscrites après l'analyse (§9, protocole 0.30, D72 (3) : « une invalidation
 * enregistrée après l'analyse restant dans l'empreinte »).
 */
export const CHAMPS_DES_INCIDENTS_ET_CONTESTATIONS: ChampsDeRunJson = {
  ...AUCUN,
  racine: ["invalidation", "contestations_posterieures"],
};

/**
 * Ce que `pnpm kappa:jeu-or` écrit (`pipeline/notation/inscription-jeu-or.ts`, D89, D93) : pour chaque
 * juge retenu, le kappa juge-humain du jeu d'or ou le motif de son indéfinition, et les comptes qui le
 * fondent ; à la racine, le kappa de la paire de juges ou le motif de son indéfinition ; le tout d'un
 * seul appel à `analysis/kappa-jeu-or.ts:inscriptionsJeuOr` (§7 ; D73 (8), D75 (27)). Le §9 ne les
 * nomme pas parmi les champs que l'empreinte du fichier du run laisse de côté (ceux du go/no-go,
 * « les comptes et les kappas de l'échantillon humain ») : ils restent dans l'empreinte, et la
 * commande refuse donc d'écrire après `pnpm analyze` (DETTE 2026-11-04 après-midi n° 4).
 */
export const CHAMPS_DU_JEU_D_OR: ChampsDeRunJson = {
  ...AUCUN,
  racine: ["kappa_paire_juges", "motif_indefini_kappa_paire_juges"],
  juges: ["kappa_juge_humain", "motif_indefini_kappa_juge_humain", "comptes_jeu_or"],
};

/**
 * Ce que `pnpm go-no-go` écrit (`pipeline/go-no-go/go-no-go.ts:fusionner`, §12, D24, D55 (7)). Il
 * se lance après l'analyse et lit `metriques.json` : hors de l'empreinte, pour qu'une analyse
 * relancée ensuite reste identique. Le §9 les nomme depuis la 0.33 (D75 (17) ; conformité
 * 2026-11-03, constat 16) : l'empreinte du fichier du run est calculée « hors de ceux qu'y inscrit
 * le go/no-go (section 12), sa décision, le motif d'une publication provisoire, les comptes et les
 * kappas de l'échantillon humain et les réponses manquantes de chaque outil par mode, champs que ce
 * fichier reçoit après l'analyse et dont la liste exacte est publiée avec le code ». Cette liste
 * exacte est celle-ci.
 */
export const CHAMPS_DU_GO_NO_GO: ChampsDeRunJson = {
  ...AUCUN,
  racine: [
    "go_no_go",
    "motif_provisoire",
    "indeterminees_echantillon_humain",
    "non_classees_echantillon_humain",
    "renvois_attribution_indecidable",
    "refus_api_echantillon_humain",
    "accord_humains_echantillon",
  ],
  juges: ["kappa_echantillon_humain", "motif_indefini_kappa_echantillon_humain", "renvois_ecartes_kappa_echantillon"],
  outils: ["par_mode"],
};

/**
 * §9 (protocole 0.34, révisé en 0.33 par D75 (17)) : l'empreinte du fichier du run est « calculée hors
 * des champs de statut, de publication et de dépôt, et hors de ceux qu'y inscrit le go/no-go » ;
 * ces derniers sont `CHAMPS_DU_GO_NO_GO`, et l'ensemble est `CHAMPS_HORS_EMPREINTE_DU_RUN`. Ce
 * groupe-ci porte les trois premiers. Le statut est écrit au gel (`planifie`) et change ensuite
 * (`en_cours` à l'interrogation, D51 ; puis à la publication).
 */
export const CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION: ChampsDeRunJson = {
  ...AUCUN,
  racine: ["statut", "publication", "depot"],
};

/**
 * Le complément des groupes ci-dessus : ce que le gel écrit dans `run.json`
 * (`pipeline/gel/assemblage.ts:runDuGel`) et que rien ne réécrit ensuite, dans l'empreinte du run
 * (§9). `simule` et `run_remplace_id` sont écrits au gel ou jamais. À la racine, `perimetre`, `juges`
 * et `reponses` sont des conteneurs écrits au gel ; leurs champs sont classés à leur propre
 * emplacement. `tests/run/classement-des-champs-du-run.test.ts` exige que chaque propriété de
 * `schema/run.schema.json`, à chacun des quatre emplacements, soit ici ou dans un seul groupe.
 */
export const CHAMPS_FIGES_AU_GEL: ChampsDeRunJson = {
  racine: [
    "id",
    "date_gel",
    "fenetre",
    "type_run",
    "simule",
    "run_remplace_id",
    "annotateur_auteur",
    "versions",
    "graines",
    "alias_candidats",
    "balise",
    "engagement",
    "run_precedent",
    "application_testee",
    "perimetre",
    "juges",
    "symetrie",
    "tirage",
    "questions",
    "reponses",
  ],
  juges: ["juge_id", "famille_modele", "modele", "version_prompt", "outils_de_son_editeur"],
  outils: [
    "outil_id",
    "libelle",
    "editeur",
    "famille",
    "inclus",
    "motif_exclusion",
    "modele_demande",
    "modes",
    "mode_de_tete",
    "alias_aveugle",
    "cgu_relues_le",
    "clause_restrictive_signalee",
    "preuve_inclusion",
  ],
  reponses: ["echantillons_par_question", "prevues"],
};

/* ------------------------------------------------------------------ par rôle */

function reunir(...groupes: readonly ChampsDeRunJson[]): ChampsDeRunJson {
  return {
    racine: groupes.flatMap((g) => g.racine),
    juges: groupes.flatMap((g) => g.juges),
    outils: groupes.flatMap((g) => g.outils),
    reponses: groupes.flatMap((g) => g.reponses),
  };
}

/** Tout ce que le gel n'a pas fixé : ignoré pour reconnaître le même gel. */
export const CHAMPS_ECRITS_APRES_LE_GEL: ChampsDeRunJson = reunir(
  CHAMPS_DE_LA_NOTATION,
  CHAMPS_DU_JEU_D_OR,
  CHAMPS_DES_INCIDENTS_ET_CONTESTATIONS,
  CHAMPS_DU_GO_NO_GO,
  CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION,
);

/** Ce que `run.json` reçoit après l'analyse : hors de l'empreinte publiée dans `metriques.json` (§9). */
export const CHAMPS_HORS_EMPREINTE_DU_RUN: ChampsDeRunJson = reunir(CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION, CHAMPS_DU_GO_NO_GO);

/* ------------------------------------------------------------------ opérations */

export class RunJsonIncomplet extends Error {
  constructor(emplacement: string, attendu: string) {
    super(`run.json : ${emplacement} n'est pas ${attendu} ; aucune comparaison au gel sur un fichier incomplet.`);
    this.name = "RunJsonIncomplet";
  }
}

type Objet = Readonly<Record<string, unknown>>;

function exigerObjet(valeur: unknown, emplacement: string): Objet {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) throw new RunJsonIncomplet(emplacement, "un objet");
  return valeur as Objet;
}

function exigerListe(valeur: unknown, emplacement: string): readonly Objet[] {
  if (!Array.isArray(valeur)) throw new RunJsonIncomplet(emplacement, "une liste");
  return valeur.map((element: unknown, rang) => exigerObjet(element, `${emplacement}[${rang}]`));
}

function sans(objet: Objet, champs: readonly string[]): Objet {
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => !champs.includes(cle)));
}

function seulement(objet: Objet, champs: readonly string[]): Objet {
  return Object.fromEntries(Object.entries(objet).filter(([cle]) => champs.includes(cle)));
}

/** Les quatre emplacements lus d'un `run.json` : `juges` et `perimetre.outils` exigés, `reponses` absent laissé absent. */
function emplacements(run: object): { readonly brut: Objet; readonly perimetre: Objet; readonly juges: readonly Objet[]; readonly outils: readonly Objet[]; readonly reponses: Objet | undefined } {
  const brut = exigerObjet(run, "la racine");
  const perimetre = exigerObjet(brut["perimetre"], "perimetre");
  const reponses = brut["reponses"] === undefined ? undefined : exigerObjet(brut["reponses"], "reponses");
  return { brut, perimetre, juges: exigerListe(brut["juges"], "juges"), outils: exigerListe(perimetre["outils"], "perimetre.outils"), reponses };
}

/** `run.json` sans ces champs, à chacun de leurs emplacements ; tout le reste tel quel. */
export function retirerChamps(run: object, champs: ChampsDeRunJson): Objet {
  const lu = emplacements(run);
  return {
    ...sans(lu.brut, champs.racine),
    juges: lu.juges.map((juge) => sans(juge, champs.juges)),
    perimetre: { ...lu.perimetre, outils: lu.outils.map((outil) => sans(outil, champs.outils)) },
    ...(lu.reponses === undefined ? {} : { reponses: sans(lu.reponses, champs.reponses) }),
  };
}

/** La seule part de `run.json` que portent ces champs, juge par juge et outil par outil. */
export function partDesChamps(run: object, champs: ChampsDeRunJson): Objet {
  const lu = emplacements(run);
  return {
    racine: seulement(lu.brut, champs.racine),
    juges: lu.juges.map((juge) => seulement(juge, champs.juges)),
    outils: lu.outils.map((outil) => seulement(outil, champs.outils)),
    ...(lu.reponses === undefined ? {} : { reponses: seulement(lu.reponses, champs.reponses) }),
  };
}

/** Deux `run.json` du même gel : identiques hors de tout ce qui s'écrit après le gel (forme canonique). */
export function memeGel(a: object, b: object): boolean {
  return canoniser(retirerChamps(a, CHAMPS_ECRITS_APRES_LE_GEL)) === canoniser(retirerChamps(b, CHAMPS_ECRITS_APRES_LE_GEL));
}
