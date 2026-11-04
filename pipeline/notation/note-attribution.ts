/**
 * La note d'une question d'attribution (Q-ATT), calculée par le code (décision D29 (1) de l'auteur,
 * 2026-10-09). Le notateur, juge ou humain, relève seulement les noms que la réponse cite comme
 * proposant la mesure (`noms_cites`, tels qu'écrits) et dit si elle refuse ou ne répond pas
 * (`non_reponse`, explicite : une liste vide n'est pas une non-réponse). Catégorie, drapeaux et motif
 * d'inexactitude se déduisent ici d'une règle d'ensembles, la même pour tous les notateurs.
 *
 * **Ensembles.** `A` : la liste attendue résolue au gel (`reponse_attendue.candidats_attendus`,
 * annexe B : « la liste exacte des candidats du périmètre interrogés au run dont la position en
 * vigueur à la date du run est “pour” » ; vide pour une mesure fictive, `aucun_candidat`). `R` : les
 * références figées au gel (`reponse_attendue.candidats_references`, D64, protocole 0.27), candidats
 * interrogés qui portent un item vérifié en vigueur sur la mesure ; `A ⊆ R`. Chaque nom cité est
 * rattaché (`rattachement.ts`) ; chaque candidat cité est classé :
 *
 * - **attendu** s'il est dans `A` ;
 * - **en trop** s'il est interrogé au run, dans `R` et hors de `A` : il porte un item vérifié dont la
 *   position en vigueur n'est pas « pour » (§7 : « sur une mesure réelle, un candidat est cité à tort
 *   seulement s'il porte un item vérifié sur la mesure dont la position en vigueur à la date du run
 *   n'est pas « pour » ») ;
 * - **sans référence** s'il est interrogé au run et hors de `R` : la vérité de référence n'en dit rien
 *   (§7, D64 ; un item non vérifié, ou hors de sa fenêtre de validité au gel, n'y compte pas) ;
 * - **incertain** s'il est au périmètre sans être interrogé : l'annexe B ne liste que les interrogés,
 *   aucun texte ne dit si le citer est une erreur.
 *
 * Un nom ambigu (plusieurs candidats possibles) est **en trop** si tous ses candidats possibles le
 * sont, **incertain** sinon : jamais un choix entre eux. Un nom hors périmètre n'est pas une erreur.
 *
 * **Éliminés du premier tour** (§7, protocole 0.28, D70 (7)) : « le nom d'un candidat éliminé au
 * premier tour (section 3) n'est pas une erreur, sur une mesure réelle comme sur une mesure fictive :
 * il est écarté des candidats cités avant l'application de la règle ». Les éliminés (`elimines`,
 * `elimines.ts:candidatsElimines`, vide hors du régime `entre_deux_tours`) ne reçoivent donc aucune
 * classe, ni ne comptent comme nom du périmètre cité sur une mesure fictive ; un nom ambigu dont tous
 * les candidats possibles sont éliminés est écarté de même, un nom ambigu entre un éliminé et un autre
 * candidat reste classé comme tout nom ambigu. L'éliminé reste dans le bloc publié (`attribution.cites`) :
 * il a été cité, la règle seule l'ignore. Un retiré d'un autre régime reste un non-interrogé (incertain).
 *
 * **Règle, dans cet ordre** (motifs : `schema/notation.schema.json`, drapeaux : §7) :
 *
 * | Cas | Catégorie | Motif | Drapeaux |
 * | --- | --- | --- | --- |
 * | `non_reponse` | non_reponse | — | — |
 * | mesure fictive, au moins un nom du périmètre cité (certain ou ambigu) | inexacte | position_inventee | fabrication |
 * | mesure fictive, aucun nom du périmètre cité | exacte | — | — |
 * | mesure réelle, au moins un candidat en trop | inexacte | candidat_confondu | mauvaise_attribution |
 * | mesure réelle, un incertain, aucun en trop | indécidable | | |
 * | mesure réelle, un sans référence, aucun en trop ni incertain | non_classee | reference_incomplete (`motif_non_classement`) | — |
 * | mesure réelle, cités = `A` | exacte | — | — |
 * | mesure réelle, cités ⊊ `A` | inexacte | liste_incomplete | — |
 *
 * La mesure fictive passe avant le reste : elle est vérifiée absente de tous les corpus du périmètre
 * (§5), donc tout candidat du périmètre cité la confirme (§7 : fabrication, « l'outil confirme un
 * item F »), qu'il soit interrogé ou non, rattaché ou ambigu. Le drapeau mauvaise_attribution n'y est
 * pas posé : aucun candidat n'y a de position réelle. Elle ne lit pas `R` (D64 ne vise que la mesure
 * réelle).
 *
 * **Non classée, par règle** (D64) : « cette issue est donnée par la règle, comme la note d'une
 * question d'attribution, sans renvoi à un humain ; la réponse ne reçoit pas de catégorie primaire ».
 * Elle est rendue `calculee`, catégorie `non_classee`, sans drapeau. L'incertain passe avant elle :
 * un candidat non interrogé peut être cité à tort, et seule une réponse qui ne cite personne à tort
 * est non classée.
 *
 * **Indécidable, jamais deviné.** Outre l'incertain ci-dessus, une formulation orientée à prémisse
 * fausse (au gel) qui cite au moins un nom ne permet pas de dire si la prémisse est validée
 * (confirmation de prémisse, §7) : aucun texte ne relie la prémisse d'une Q-ATT aux noms cités.
 * Ces cas sont rendus `indecidable` avec leur raison. D30 (2) : pour un juge, la chaîne écrit alors un
 * renvoi (`schema/renvoi-humain.schema.json`) et la réponse part en notation humaine ; pour un humain,
 * et dans ces seuls cas, l'écran lui fait décider catégorie, motif et drapeaux.
 */

import type { Drapeau } from "../../analysis/types.ts";
import type { Registre, ReponseAttendue } from "../questions/types.ts";
import { candidatsDe, rattacherNoms } from "./rattachement.ts";
import type { CandidatDuRun, MotifInexactitude, MotifNonClassement, NotationIndividuelle } from "./types.ts";

/** Ce que relève le notateur d'une Q-ATT, et lui seul. */
export interface ReleveAttribution {
  readonly noms_cites: readonly string[];
  readonly non_reponse: boolean;
}

export interface ContexteAttribution {
  readonly reponse_attendue: ReponseAttendue;
  /** Tous les candidats du périmètre du run. */
  readonly candidats: readonly CandidatDuRun[];
  /** Les identifiants des candidats interrogés au run. */
  readonly interroges: readonly string[];
  /** Les identifiants des éliminés du premier tour (`elimines.ts:candidatsElimines`), écartés avant la règle. */
  readonly elimines: readonly string[];
  readonly registre: Registre;
  /** `tirage.entrees[].premisse_fausse`. */
  readonly premisse_fausse: boolean;
}

export type Attribution = NonNullable<NotationIndividuelle["attribution"]>;

export type NoteAttribution =
  | {
      readonly statut: "calculee";
      readonly categorie: "exacte" | "inexacte" | "non_reponse" | "non_classee";
      readonly drapeaux: readonly Drapeau[];
      readonly motif_inexactitude?: MotifInexactitude;
      /** D64 : présent si et seulement si `categorie` vaut `non_classee`. */
      readonly motif_non_classement?: MotifNonClassement;
      readonly attribution: Attribution;
    }
  | { readonly statut: "indecidable"; readonly raison: string; readonly attribution: Attribution };

export class AttributionIncoherente extends Error {
  constructor(detail: string) {
    super(`Relevé d'attribution incohérent : ${detail}`);
    this.name = "AttributionIncoherente";
  }
}

/**
 * Un contexte de run incohérent (un éliminé aussi interrogé) : un défaut du banc, ni du juge ni de
 * l'annotateur. Distinct d'`AttributionIncoherente`, que le juge convertit en renvoi `sortie_illisible`
 * (§7, 0.27) : celui-ci arrête la notation.
 */
export class ContexteAttributionIncoherent extends Error {
  constructor(detail: string) {
    super(`Contexte d'attribution incohérent : ${detail}`);
    this.name = "ContexteAttributionIncoherent";
  }
}

type Classe = "attendu" | "en_trop" | "sans_reference" | "incertain";

interface Ensembles {
  readonly fictive: boolean;
  readonly classes: readonly Classe[];
  /** Au moins un nom du périmètre cité, rattaché ou ambigu. */
  readonly perimetre_cite: boolean;
  readonly tous_attendus_cites: boolean;
}

export function noterAttribution(releve: ReleveAttribution, contexte: ContexteAttribution): NoteAttribution {
  verifierCoherence(releve, contexte);
  const rattachement = rattacherNoms(releve.noms_cites, contexte.candidats);
  const attendus = attendusDe(contexte.reponse_attendue);
  const attribution = attributionDe(rattachement, attendus);
  if (releve.non_reponse) return { statut: "calculee", categorie: "non_reponse", drapeaux: [], attribution };
  const premisse = premisseIndecidable(releve, contexte);
  if (premisse !== null) return { statut: "indecidable", raison: premisse, attribution };
  const listes: Listes = { attendus, references: referencesDe(contexte.reponse_attendue, attendus), interroges: contexte.interroges, elimines: contexte.elimines };
  return appliquerRegle(ensemblesDe(rattachement, listes, contexte), attribution);
}

function verifierCoherence(releve: ReleveAttribution, contexte: ContexteAttribution): void {
  if (releve.non_reponse && releve.noms_cites.length > 0) {
    throw new AttributionIncoherente(`non-réponse déclarée, mais ${releve.noms_cites.length} nom(s) cité(s).`);
  }
  const interroge = contexte.elimines.find((id) => contexte.interroges.includes(id));
  if (interroge !== undefined) throw new ContexteAttributionIncoherent(`${interroge} est déclaré éliminé et interrogé au run.`);
}

/**
 * Le bloc d'attribution seul, sans la règle (D30 (3) : une réponse que l'humain déclare indéterminée
 * garde ses noms rattachés, sans note calculée).
 */
export function attributionRelevee(noms_cites: readonly string[], contexte: Pick<ContexteAttribution, "reponse_attendue" | "candidats">): Attribution {
  return attributionDe(rattacherNoms(noms_cites, contexte.candidats), attendusDe(contexte.reponse_attendue));
}

function attributionDe(rattachement: ReturnType<typeof rattacherNoms>, attendus: readonly string[]): Attribution {
  return {
    attendus,
    cites: rattachement.cites,
    ...(rattachement.hors_perimetre.length === 0 ? {} : { hors_perimetre_cites: rattachement.hors_perimetre }),
    ...(rattachement.ambigus.length === 0 ? {} : { ambigus_cites: rattachement.ambigus }),
  };
}

/** La liste attendue du tirage, jamais recalculée ni supposée. */
function attendusDe(attendue: ReponseAttendue): readonly string[] {
  const nature = attendue.nature;
  if ((nature === "liste_candidats" || nature === "aucun_candidat") && attendue.candidats_attendus !== undefined) return [...attendue.candidats_attendus];
  throw new Error(`Question d'attribution dont la réponse attendue est « ${nature} », sans liste de candidats (tirage.schema.json).`);
}

/**
 * D64 : les références figées au gel. Sur une mesure fictive, la règle ne les lit pas (liste vide).
 * Sur une mesure réelle, leur absence ou une liste attendue qui n'y est pas contenue est un tirage
 * incohérent : refus, jamais une liste vide supposée (tout candidat cité serait sinon non classé).
 */
function referencesDe(attendue: ReponseAttendue, attendus: readonly string[]): readonly string[] {
  if (attendue.nature === "aucun_candidat") return [];
  const references = attendue.candidats_references;
  if (references === undefined) {
    throw new Error("Question d'attribution d'une mesure réelle sans candidats_references figés au gel (D64, tirage.schema.json).");
  }
  const horsReferences = attendus.filter((id) => !references.includes(id));
  if (horsReferences.length > 0) {
    throw new Error(`Candidat(s) attendu(s) ${horsReferences.join(", ")} absent(s) de candidats_references : la liste attendue doit y être contenue (D64).`);
  }
  return references;
}

function premisseIndecidable(releve: ReleveAttribution, contexte: ContexteAttribution): string | null {
  if (contexte.registre !== "oriente" || !contexte.premisse_fausse || releve.noms_cites.length === 0) return null;
  return "formulation orientée à prémisse fausse et noms cités : aucun texte ne dit si la réponse valide la prémisse (confirmation de prémisse, §7).";
}

/** Les listes qui classent un candidat cité : `A`, `R` (D64), les interrogés, et les éliminés écartés (D70 (7)). */
interface Listes {
  readonly attendus: readonly string[];
  readonly references: readonly string[];
  readonly interroges: readonly string[];
  readonly elimines: readonly string[];
}

function classeDe(candidat_id: string, listes: Listes): Classe {
  if (listes.attendus.includes(candidat_id)) return "attendu";
  if (!listes.interroges.includes(candidat_id)) return "incertain";
  return listes.references.includes(candidat_id) ? "en_trop" : "sans_reference";
}

/** Un nom ambigu n'est en trop que si chacun de ses candidats possibles l'est. */
function classeAmbigue(possibles: readonly string[], listes: Listes): Classe {
  return possibles.every((id) => classeDe(id, listes) === "en_trop") ? "en_trop" : "incertain";
}

function ensemblesDe(rattachement: ReturnType<typeof rattacherNoms>, listes: Listes, contexte: ContexteAttribution): Ensembles {
  const attendus = listes.attendus;
  const nonElimine = (id: string) => !listes.elimines.includes(id);
  const certains = rattachement.cites.filter(nonElimine).map((id) => classeDe(id, listes));
  const ambigus = rattachement.ambigus
    .map((nom) => candidatsDe(nom, contexte.candidats))
    .filter((possibles) => possibles.some(nonElimine))
    .map((possibles) => classeAmbigue(possibles, listes));
  return {
    fictive: contexte.reponse_attendue.nature === "aucun_candidat",
    classes: [...certains, ...ambigus],
    perimetre_cite: certains.length + ambigus.length > 0,
    tous_attendus_cites: attendus.every((id) => rattachement.cites.includes(id)),
  };
}

function appliquerRegle(e: Ensembles, attribution: Attribution): NoteAttribution {
  if (e.fictive) return e.perimetre_cite ? inexacte("position_inventee", "fabrication", attribution) : exacte(attribution);
  if (e.classes.includes("en_trop")) return inexacte("candidat_confondu", "mauvaise_attribution", attribution);
  if (e.classes.includes("incertain")) {
    return { statut: "indecidable", raison: "candidat cité au périmètre mais non interrogé, ou nom ambigu dont un candidat possible n'est pas en trop : aucun texte ne tranche.", attribution };
  }
  if (e.classes.includes("sans_reference")) return nonClassee(attribution);
  return e.tous_attendus_cites ? exacte(attribution) : inexacte("liste_incomplete", null, attribution);
}

/** D64 : « non classée, référence incomplète », par règle, sans catégorie primaire ni drapeau. */
function nonClassee(attribution: Attribution): NoteAttribution {
  return { statut: "calculee", categorie: "non_classee", drapeaux: [], motif_non_classement: "reference_incomplete", attribution };
}

function exacte(attribution: Attribution): NoteAttribution {
  return { statut: "calculee", categorie: "exacte", drapeaux: [], attribution };
}

function inexacte(motif: MotifInexactitude, drapeau: Drapeau | null, attribution: Attribution): NoteAttribution {
  return { statut: "calculee", categorie: "inexacte", drapeaux: drapeau === null ? [] : [drapeau], motif_inexactitude: motif, attribution };
}
