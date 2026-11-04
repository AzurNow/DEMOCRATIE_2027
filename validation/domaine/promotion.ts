/**
 * Règle de promotion : quand deux décisions font-elles un item vérifié ?
 *
 * C'est la seule porte entre `staging/` et `data/`, et elle ne s'ouvre pas toute seule : ce
 * module ne décide que du **sort** d'un item ; l'écriture est le fait de `pnpm promote
 * --ecrire`, lancé à la main. Aucune fonction d'ici n'écrit quoi que ce soit.
 *
 * Deux asymétries voulues, qui viennent du protocole et non du confort :
 *
 * - **Non-évaluable l'emporte sur retenu.** Si l'un dit « non évaluable » et l'autre « accepter »
 *   ou « corriger », l'item est non évaluable, sans arbitrage (§4). Le coût des deux erreurs
 *   n'est pas le même : inclure une position floue fabrique de fausses erreurs d'outils, tandis
 *   qu'exclure une vraie position ne coûte qu'un item.
 * - **Rejeter contre non-évaluable reste un désaccord.** L'un dit que l'extraction est fausse,
 *   l'autre que le candidat est flou : le statut final diffère, l'arbitre tranche.
 */

import {
  ancienneteEnJours,
  CorrectionMesureIncoherente,
  decisionApplicable,
  type DecisionCorrectionMesure,
  type RegistreCorrectionsMesure,
  type ResultatCorrectionMesure,
} from "./corrections-mesure.ts";
import { attesterTranscriptions, porteUneSourceT2, transcriptionEcouteeParLesDeux } from "./ecoute-t2.ts";
import { empreinteContenuNotant } from "./empreinte.ts";
import { reduireEtats } from "./grille.ts";
import type {
  BlocArbitrage,
  CleSpecifique,
  Correction,
  Decision,
  EntreeDecision,
  Grille,
  Item,
  Mesure,
  NatureLot,
} from "./types.ts";

export type MotifAttente =
  | "lot_entrainement"
  | "item_conteste"
  | "decisions_insuffisantes"
  | "correction_mesure_en_attente";

/** Confrontée à `decision-arbitrage.schema.json` par `tests/enumerations-schemas.test.ts`. */
export const MOTIFS_ARBITRAGE = [
  "versions_differentes",
  "desaccord",
  "corrections_divergentes",
  "paraphrase_seule",
  "confirmation_absence_manquante",
  "correction_mesure_refusee",
  // Conformité n° 12 : item à source T2 que les deux annotateurs n'ont pas tous deux déclaré
  // avoir écouté, transcription fidèle. Même mécanique que `confirmation_absence_manquante`.
  "transcription_non_verifiee",
  // Conformité 2026-11-03 n° 2 (§4) : item F dont les deux annotateurs n'ont pas tous deux confirmé
  // la fictivité. Même mécanique que `confirmation_absence_manquante`.
  "confirmation_fictivite_manquante",
] as const;
export type MotifArbitrage = (typeof MOTIFS_ARBITRAGE)[number];

export type StatutPromu = "verifie" | "rejete" | "non_evaluable";

export interface IssuePromouvoir {
  readonly sort: "promouvoir";
  readonly statut: StatutPromu;
  readonly item: Item;
  readonly corrections_appliquees: boolean;
}

export interface IssueArbitrage {
  readonly sort: "arbitrage";
  readonly motif: MotifArbitrage;
  /** Motif du refus, sur `correction_mesure_refusee` seulement : §4 l'exige dans l'arbitrage. */
  readonly motif_refus?: string;
  /**
   * Décision du registre d'arbitrage qui vise l'item mais ne s'applique pas (version dépassée,
   * autre désaccord, contenu retenu disparu) : l'item reste en arbitrage, et le rapport dit pourquoi.
   */
  readonly decision_inapplicable?: { readonly decision_id: string; readonly motifs: readonly string[] };
}

/** Ce qu'il faut pour rapporter une demande de correction de thème restée sans décision. */
export interface DemandeEnAttente {
  readonly mesure_id: string;
  readonly chemin: string;
  readonly valeur_demandee: string;
  /** Horodatage de la décision d'annotation qui porte la demande. */
  readonly depuis: string;
  readonly anciennete_jours: number;
}

export interface IssueAttente {
  readonly sort: "attente";
  readonly motif: MotifAttente;
  /** Présent sur `correction_mesure_en_attente` seulement. */
  readonly demande?: DemandeEnAttente;
}

export type Issue = IssuePromouvoir | IssueArbitrage | IssueAttente;

export interface Dossier {
  readonly item: Item;
  readonly mesure: Mesure;
  readonly lot_id: string;
  readonly lot_nature: NatureLot;
  /** Décisions actives, une par annotateur. */
  readonly decisions: readonly EntreeDecision[];
  /**
   * Registre des corrections de thème, **lu par l'appelant**. Il est passé et non chargé :
   * `evaluerPromotion` n'accède jamais au disque. Un registre vide est un registre sans
   * décision, donc des demandes en attente — jamais des demandes refusées.
   */
  readonly registre_corrections_mesure: RegistreCorrectionsMesure;
}

export interface OptionsPromotion {
  /** Commit du dépôt au moment de la promotion. L'arbre doit être propre : c'est lui qui décrit l'état d'où sort la promotion. */
  readonly commit: string;
  readonly horodatage: string;
}

export function evaluerPromotion(dossier: Dossier, options: OptionsPromotion): Issue {
  const barrage = controlerPrealables(dossier, options);
  if (barrage !== null) return barrage;

  const [premiere, seconde] = dossier.decisions as [EntreeDecision, EntreeDecision];
  if (!memeVersionJugee(premiere, seconde)) {
    return { sort: "arbitrage", motif: "versions_differentes" };
  }

  return resoudre(dossier, premiere, seconde, options);
}

function controlerPrealables(dossier: Dossier, options: OptionsPromotion): Issue | null {
  if (dossier.lot_nature === "entrainement") return { sort: "attente", motif: "lot_entrainement" };
  if (dossier.item.statut_contestation !== "aucune") {
    return { sort: "attente", motif: "item_conteste" };
  }
  if (!deuxAnnotateursDistincts(dossier.decisions)) {
    return { sort: "attente", motif: "decisions_insuffisantes" };
  }
  return issueDesCorrectionsDeMesure(dossier, options);
}

function deuxAnnotateursDistincts(decisions: readonly EntreeDecision[]): boolean {
  if (decisions.length !== 2) return false;
  const [premiere, seconde] = decisions as [EntreeDecision, EntreeDecision];
  return premiere.annotateur_id !== seconde.annotateur_id;
}

function memeVersionJugee(premiere: EntreeDecision, seconde: EntreeDecision): boolean {
  return (
    premiere.item_version === seconde.item_version &&
    premiere.item_empreinte === seconde.item_empreinte
  );
}

/**
 * Le thème appartient à la mesure, référent partagé par plusieurs candidats. Une correction de
 * thème est donc une demande adressée au référentiel, pas une modification de l'item : elle est
 * tranchée par l'auteur, dans un registre publié, et c'est cette décision — ou son absence —
 * qui dit le sort de l'item (§4, « Correction de thème »).
 *
 * L'ordre des issues est celui de la gravité : une incohérence du registre arrête tout, un refus
 * l'emporte sur une attente, et une demande sans décision laisse l'item en attente aussi
 * longtemps qu'il le faut — l'écoulement du temps ne vaut jamais refus.
 */
function issueDesCorrectionsDeMesure(dossier: Dossier, options: OptionsPromotion): Issue | null {
  const examens = examinerCorrectionsDeMesure(dossier);

  const incoherente = examens.find((examen) => examen.verdict === "acceptee_sans_mesure_modifiee");
  if (incoherente !== undefined) {
    throw new CorrectionMesureIncoherente(dossier.mesure, incoherente.entree as DecisionCorrectionMesure);
  }

  const refusee = examens.find((examen) => examen.verdict === "refusee");
  if (refusee !== undefined) return arbitrageDeRefus(refusee);

  const absente = examens.find((examen) => examen.verdict === "absente");
  if (absente !== undefined) return attenteDeDemande(absente, dossier.mesure, options);

  return null;
}

interface ExamenMesure extends ResultatCorrectionMesure {
  readonly correction: Correction;
  readonly decision: EntreeDecision;
}

function examinerCorrectionsDeMesure(dossier: Dossier): readonly ExamenMesure[] {
  const examens: ExamenMesure[] = [];
  for (const decision of dossier.decisions) {
    for (const correction of decision.corrections) {
      if (correction.cible !== "mesure") continue;
      const resultat = decisionApplicable(dossier.registre_corrections_mesure, correction, dossier.mesure);
      examens.push({ ...resultat, correction, decision });
    }
  }
  return examens;
}

function arbitrageDeRefus(examen: ExamenMesure): IssueArbitrage {
  const entree = examen.entree as DecisionCorrectionMesure;
  return {
    sort: "arbitrage",
    motif: "correction_mesure_refusee",
    motif_refus: entree.motif as string,
  };
}

function attenteDeDemande(
  examen: ExamenMesure,
  mesure: Mesure,
  options: OptionsPromotion,
): IssueAttente {
  return {
    sort: "attente",
    motif: "correction_mesure_en_attente",
    demande: {
      mesure_id: mesure.id,
      chemin: examen.correction.chemin,
      valeur_demandee: pourAffichage(examen.correction.nouvelle_valeur),
      depuis: examen.decision.horodatage,
      anciennete_jours: ancienneteEnJours(examen.decision.horodatage, options.horodatage),
    },
  };
}

function pourAffichage(valeur: unknown): string {
  if (typeof valeur === "string") return valeur;
  return JSON.stringify(valeur);
}

/* ----------------------------------------------- résolution des deux décisions */

function resoudre(
  dossier: Dossier,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
  options: OptionsPromotion,
): Issue {
  const paire = new Set<Decision>([premiere.decision, seconde.decision]);

  if (estNonEvaluableEmportant(paire)) return terminal(dossier, "non_evaluable", options);
  if (paire.size === 1 && paire.has("rejeter")) return terminal(dossier, "rejete", options);
  if (paire.size === 1 && paire.has("accepter")) return verifier(dossier, premiere, seconde, options);
  if (paire.size === 1 && paire.has("corriger")) return verifier(dossier, premiere, seconde, options);
  return { sort: "arbitrage", motif: "desaccord" };
}

/**
 * « non évaluable » face à « accepter » ou « corriger » : exception du §4, sans arbitrage.
 * Face à « rejeter », c'est un désaccord ordinaire — les deux statuts finaux diffèrent.
 */
function estNonEvaluableEmportant(paire: ReadonlySet<Decision>): boolean {
  if (!paire.has("non_evaluable")) return false;
  if (paire.size === 1) return true;
  return paire.has("accepter") || paire.has("corriger");
}

function terminal(dossier: Dossier, statut: StatutPromu, options: OptionsPromotion): Issue {
  return {
    sort: "promouvoir",
    statut,
    item: appliquerValidations(dossier, dossier.item, statut, options, false, traceConcordance(dossier)),
    corrections_appliquees: false,
  };
}

function verifier(
  dossier: Dossier,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
  options: OptionsPromotion,
): Issue {
  const manquante = confirmationManquante(dossier.item, premiere, seconde);
  if (manquante !== null) return { sort: "arbitrage", motif: manquante };

  const corrige = fusionnerCorrections(dossier.item, premiere, seconde);
  if (corrige.sort === "arbitrage") return corrige;

  return {
    sort: "promouvoir",
    statut: "verifie",
    item: appliquerValidations(dossier, corrige.item, "verifie", options, corrige.modifie, traceConcordance(dossier)),
    corrections_appliquees: corrige.modifie,
  };
}

/**
 * Ce que les deux annotateurs doivent avoir confirmé, par la grille du type, pour que deux décisions
 * concordantes vérifient l'item ; null si rien ne manque. Une réponse absente ne vaut jamais oui.
 */
function confirmationManquante(item: Item, premiere: EntreeDecision, seconde: EntreeDecision): MotifArbitrage | null {
  if (item.type === "A" && !confirmeeParLesDeux("confirmation_absence", premiere, seconde)) {
    return "confirmation_absence_manquante";
  }
  // §4 (conformité 2026-11-03 n° 2) : « Il n'est vérifié que si deux annotateurs confirment, par la
  // grille de son type, que la mesure est absente des corpus balayés. »
  if (item.type === "F" && !confirmeeParLesDeux("fictivite_verifiee", premiere, seconde)) {
    return "confirmation_fictivite_manquante";
  }
  // §4, §9 (conformité n° 12) : une transcription T2 est vérifiée à l'oreille, par les deux.
  if (porteUneSourceT2(item) && !transcriptionEcouteeParLesDeux([premiere, seconde])) {
    return "transcription_non_verifiee";
  }
  return null;
}

function confirmeeParLesDeux(cle: CleSpecifique, premiere: EntreeDecision, seconde: EntreeDecision): boolean {
  return premiere.questions_specifiques?.[cle] === true && seconde.questions_specifiques?.[cle] === true;
}

interface FusionReussie {
  readonly sort: "fusion";
  readonly item: Item;
  readonly modifie: boolean;
}

/**
 * Deux corrections sont concordantes si elles aboutissent au **même contenu notant**, ce qui
 * exclut la paraphrase : deux humains qui réécrivent une phrase divergent toujours d'un mot.
 * Contenu notant identique et paraphrases divergentes part en arbitrage marqué
 * « paraphrase seule », traité en lot ; jamais de choix silencieux entre deux paraphrases.
 */
function fusionnerCorrections(
  item: Item,
  premiere: EntreeDecision,
  seconde: EntreeDecision,
): FusionReussie | IssueArbitrage {
  if (premiere.decision === "accepter") return { sort: "fusion", item, modifie: false };

  const itemA = appliquerCorrections(item, premiere.corrections);
  const itemB = appliquerCorrections(item, seconde.corrections);

  if (empreinteContenuNotant(itemA) !== empreinteContenuNotant(itemB)) {
    return { sort: "arbitrage", motif: "corrections_divergentes" };
  }
  if (!memesParaphrases(itemA, itemB)) {
    return { sort: "arbitrage", motif: "paraphrase_seule" };
  }
  return { sort: "fusion", item: itemA, modifie: true };
}

function memesParaphrases(a: Item, b: Item): boolean {
  return JSON.stringify(paraphrases(a)) === JSON.stringify(paraphrases(b));
}

function paraphrases(item: Item): readonly (string | null)[] {
  return [
    item.assertion?.paraphrase ?? null,
    item.obsolescence?.etat_anterieur.paraphrase ?? null,
    item.obsolescence?.etat_posterieur.paraphrase ?? null,
  ];
}

/* ------------------------------------------- projection vers item.validations */

/** Ce que l'entrée d'historique de la promotion dit de son origine, et le bloc d'arbitrage éventuel. */
export interface TracePromotion {
  readonly changement: string;
  readonly motif: string;
  readonly arbitrage?: BlocArbitrage;
}

function traceConcordance(dossier: Dossier): TracePromotion {
  return { changement: "promotion vers data/", motif: `lot ${dossier.lot_id}, deux décisions concordantes` };
}

/**
 * Projection d'un item promu : validations, version, empreinte, confirmation d'absence, historique.
 * Exportée pour la promotion par arbitrage (`arbitrage.ts`), qui passe sa propre trace.
 */
export function appliquerValidations(
  dossier: Dossier,
  item: Item,
  statut: StatutPromu,
  options: OptionsPromotion,
  modifie: boolean,
  trace: TracePromotion,
): Item {
  const validations = dossier.decisions.map((decision) => projeterValidation(decision, item));
  const epingle: Item = { ...item, mesure_version: versionMesurePromue(dossier, item, statut) };
  // La version de la mesure fait partie du contenu notant (§4) : la déplacer est une modification.
  const contenuModifie = modifie || epingle.mesure_version !== item.mesure_version;
  const versionResultante = contenuModifie ? item.version + 1 : item.version;

  return {
    ...epingle,
    version: versionResultante,
    // L'empreinte n'est recalculée que si le contenu notant a changé. La recalculer sur un item
    // intact remplacerait l'empreinte contre laquelle les deux annotateurs ont jugé par une
    // autre, calculée ici : l'épinglage des décisions ne pointerait plus sur rien.
    empreinte: contenuModifie ? empreinteContenuNotant(epingle) : item.empreinte,
    statut_validation: statut,
    validations,
    ...(statut === "verifie" ? attestationsDuVerifie(dossier, item, options) : {}),
    ...(trace.arbitrage === undefined ? {} : { arbitrage: trace.arbitrage }),
    historique: [
      ...(item.historique ?? []),
      {
        date: options.horodatage,
        changement: `${trace.changement} : ${statut}`,
        motif: trace.motif,
        commit: options.commit,
        version_resultante: versionResultante,
      },
    ],
  };
}

/**
 * Conformité n° 69 (§4, « Contenu notant » et « Correction de thème ») : un item vérifié épingle la
 * version de la mesure qui porte le thème en vigueur. Après une correction de thème acceptée et
 * appliquée (`acceptee_et_appliquee` : la mesure porte le thème demandé), c'est la version courante
 * de la mesure. Sans correction, l'item doit déjà l'épingler ; sinon l'écart est une erreur
 * bloquante, nommée, et rien n'est promu : l'item a été jugé contre une autre version de la mesure
 * que celle qui entrerait au tirage. Un item rejeté ou non évaluable n'engendre aucune question :
 * son épinglage est laissé tel quel.
 */
function versionMesurePromue(dossier: Dossier, item: Item, statut: StatutPromu): number {
  if (statut !== "verifie") return item.mesure_version;
  const themeCorrige = examinerCorrectionsDeMesure(dossier).some(
    (examen) => examen.verdict === "acceptee_et_appliquee",
  );
  if (themeCorrige) return dossier.mesure.version;
  if (item.mesure_version !== dossier.mesure.version) throw new VersionMesureEcart(item, dossier.mesure);
  return item.mesure_version;
}

/** Un item vérifié épinglerait une version de sa mesure qui n'est pas la version courante. */
export class VersionMesureEcart extends Error {
  readonly item_id: string;
  readonly mesure_id: string;

  constructor(item: Item, mesure: Mesure) {
    super(
      `Item ${item.id} : il épingle la mesure ${mesure.id} en version ${item.mesure_version}, alors que ` +
        `la mesure est en version ${mesure.version}, sans correction de thème acceptée dans ce dossier. ` +
        `L'item a été jugé contre une autre version de la mesure que celle qui entrerait au tirage ` +
        `(§4, contenu notant) : rien n'est promu.`,
    );
    this.name = "VersionMesureEcart";
    this.item_id = item.id;
    this.mesure_id = mesure.id;
  }
}

/**
 * Ce que la promotion d'un item vérifié écrit à partir des deux décisions : la confirmation
 * d'absence d'un item A, et l'attestation d'écoute de chaque source T2 (conformité n° 12). Ni l'une
 * ni l'autre n'est du contenu notant (l'empreinte ne lit des sources que leur sha256) : elles ne
 * changent ni la version ni l'empreinte.
 */
function attestationsDuVerifie(dossier: Dossier, item: Item, options: OptionsPromotion): Partial<Item> {
  const atteste = attesterTranscriptions(item, dossier.decisions);
  return {
    ...(atteste.assertion === undefined ? {} : { assertion: atteste.assertion }),
    ...(atteste.obsolescence === undefined ? {} : { obsolescence: atteste.obsolescence }),
    ...(item.type === "A" ? { absence: ajouterConfirmation(dossier, atteste, options) } : {}),
  };
}

function ajouterConfirmation(dossier: Dossier, item: Item, options: OptionsPromotion) {
  const bloc = item.absence;
  if (bloc === undefined) throw new Error(`Item A sans bloc absence : ${item.id}`);
  return {
    ...bloc,
    confirmation_initiale: {
      lot_id: dossier.lot_id,
      date: options.horodatage,
      annotateurs: dossier.decisions.map((decision) => decision.annotateur_id).sort(),
    },
  };
}

/** `item.validations[]` n'est qu'une projection appauvrie du journal, qui reste la trace primaire. */
function projeterValidation(decision: EntreeDecision, item: Item) {
  return {
    annotateur_id: decision.annotateur_id,
    decision: decision.decision,
    date: decision.horodatage,
    lot_id: decision.lot_id,
    reponses_grille: grillePourItem(decision, item),
    ...(decision.commentaire === null || decision.commentaire === undefined
      ? {}
      : { commentaire: decision.commentaire }),
  };
}

/** Un item O porte deux grilles ; `item.schema.json` en attend une. La réduction est ici. */
function grillePourItem(decision: EntreeDecision, item: Item): Grille {
  if (item.type !== "O") {
    const grille = decision.reponses_grille;
    if (grille === undefined) throw new Error(`Décision sans grille sur ${decision.item_id}`);
    return grille;
  }
  const parEtat = decision.reponses_par_etat;
  if (parEtat === undefined) throw new Error(`Décision d'item O sans grille par état : ${decision.item_id}`);
  return reduireEtats(parEtat.anterieur, parEtat.posterieur);
}

/* ------------------------------------------------- application des corrections */

/**
 * Champs qu'une correction peut atteindre. Liste blanche : ce qui n'y figure pas est
 * inatteignable depuis l'interface, identifiants, empreintes, statuts et sources compris.
 * Une source ne se corrige pas — un texte extrait faux se solde par un rejet et un renvoi au
 * pipeline (docs/CONTRATS.md §1).
 */
const CHEMINS_MODIFIABLES: readonly RegExp[] = [
  /^\/valide_du$/,
  /^\/valide_au$/,
  /^\/assertion\/(position|paraphrase|citation_verbatim|quantification)$/,
  /^\/obsolescence\/date_changement$/,
  /^\/obsolescence\/etat_(anterieur|posterieur)\/(position|paraphrase|citation_verbatim|quantification)$/,
];

export function cheminModifiable(chemin: string): boolean {
  return CHEMINS_MODIFIABLES.some((motif) => motif.test(chemin));
}

export function appliquerCorrections(item: Item, corrections: readonly Correction[]): Item {
  let resultat: unknown = structuredClone(item);
  for (const correction of corrections) {
    if (correction.cible !== "item") continue;
    if (!cheminModifiable(correction.chemin)) {
      throw new Error(`Chemin non modifiable depuis l'interface de validation : ${correction.chemin}`);
    }
    resultat = ecrireChemin(resultat, correction.chemin, correction.nouvelle_valeur);
  }
  return resultat as Item;
}

/** Écriture par pointeur JSON (RFC 6901), restreinte aux chemins de la liste blanche. */
function ecrireChemin(racine: unknown, chemin: string, valeur: unknown): unknown {
  const segments = chemin.split("/").slice(1);
  let noeud = racine as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const suivant = noeud[segment];
    if (suivant === null || typeof suivant !== "object") {
      throw new Error(`Chemin absent de l'item : ${chemin}`);
    }
    noeud = suivant as Record<string, unknown>;
  }
  const dernier = segments[segments.length - 1] as string;
  noeud[dernier] = valeur;
  return racine;
}
