/**
 * Le port d'un juge automatique (§7) : une charge entre, une sortie structurée sort.
 *
 * « Il rend une sortie structurée : catégorie, drapeaux, verdict de sourçage, extrait justificatif. »
 * Le juge ne reçoit que la `ChargeJuge` (`charge-juge.ts`), construite champ par champ et aveugle à
 * l'outil : le type de `noter` est la garantie que rien d'autre ne lui parvient, ni la réponse
 * brute, ni l'outil, ni le mode, ni l'alias aveugle. Un vrai juge (prompt de `prompts/judge-*`, à
 * l'auteur) et le juge simulé de `pnpm notation:dry` (`juge-simule.ts`) implémentent ce même port ;
 * la chaîne de notation (`chaine.ts`) ne sait pas lequel elle appelle.
 *
 * **Ce que le juge rend, et ce qu'il ne rend pas.** Il rend la note (catégorie, drapeaux, motif),
 * sur une question d'attribution les noms qu'il lit cités dans la réponse, son avis de soutien sur
 * chaque lien et son extrait justificatif. Il ne rend ni l'existence d'un lien, qui vient du test
 * HTTP déterministe (`fournisseur-existences.ts`), ni le contrôle de son extrait, que fait le test
 * verbatim (`extrait.ts`), ni l'identifiant, le contexte, la date ou le motif de la notation, que
 * pose la chaîne. `notationDeJuge` assemble la notation individuelle de `schema/notation.schema.json`
 * à partir de ces trois sources ; la validation de schéma a lieu à l'écriture (`stockage.ts`).
 *
 * **Calculé, jamais lu du juge (D27, charge-juge-v3).**
 *
 * - (C) `obsolescence_fraiche` : quand le juge pose le drapeau `obsolescence`, la fraîcheur se
 *   calcule depuis la date de gel et la date du changement de l'item O soumis
 *   (`fraicheur.ts:fraicheurDesItems`, règle du §11), exactement comme pour un humain. Sans item O,
 *   la sortie est incohérente (`SortieJugeIncoherente`) : le schéma exige la fraîcheur avec le
 *   drapeau. Avec des items de plusieurs dates de changement, la fraîcheur n'est pas définie : ce
 *   n'est pas une sortie illisible mais un défaut du banc, qui arrête la notation
 *   (`FraicheurIndefinie` ; §7, protocole 0.32, D74 (25)). Aucune date n'est jamais choisie.
 * - (D), D29 (1) : sur une Q-ATT, toute la note — catégorie, drapeaux, motif et bloc d'attribution —
 *   se calcule (`note-attribution.ts:noterAttribution`) depuis la liste attendue du tirage et les
 *   noms que le juge relève (`noms_cites`, rattachés par `rattachement.ts`), avec sa déclaration
 *   explicite de non-réponse (`non_reponse`). Un cas qu'aucun texte ne tranche lève
 *   `AttributionIndecidable` : aucune notation n'est écrite.
 *
 * **Sortie contrôlée.** Hors Q-ATT, une sortie qui porte un champ hors de `CHAMPS_SORTIE_JUGE` est
 * refusée (`SortieJugeIncoherente`) ; sur une Q-ATT, hors de `CHAMPS_SORTIE_JUGE_ATTRIBUTION`. Un juge
 * qui rend encore `obsolescence_fraiche`, `attribution`, ou une catégorie sur une Q-ATT, suit un
 * prompt d'une autre version de la charge : sa valeur, qui pourrait diverger du calcul, n'entre
 * jamais, ni en silence ni à côté.
 *
 * **Juge défaillant (§7, protocole 0.27, D67).** « Une réponse qu'un juge ne peut pas noter (erreur
 * persistante de son API, charge qui dépasse sa fenêtre de contexte, sortie refusée ou illisible) est
 * renvoyée à un humain ». Une sortie incohérente devient, dans `issueDeJuge`, un renvoi
 * `sortie_illisible` ; un rejet `JugeDefaillant` de `noter`, dans `noterOuRenvoyer`, un renvoi sous
 * son motif. Le renvoi s'écrit à la place de la notation, comme celui d'une Q-ATT indécidable, et la
 * notation du run continue. Aucun juge n'est appelé sur un refus de l'API (D32) : un renvoi sur un
 * refus reste incohérent en aval (`decision.ts`, `go-no-go/kappa-echantillon.ts`).
 *
 * **Réponse au texte vide (annexe C, 0.27).** Le code pose `sur_texte_vide` d'après le texte noté,
 * et n'exige pas d'extrait d'une note non exacte sur un tel texte (`extrait.ts:reponseAuTexteVide`).
 *
 * **Le soutien d'un lien mort (D19) ou sans copie archivée (D21).** Le juge ne connaît pas
 * l'existence des liens : il peut déclarer « soutient » un lien que le test HTTP dit mort. §7 : « Un
 * lien mort ne soutient jamais rien. » La notation porte alors `non_applicable` pour ce lien, quoi
 * que le juge ait répondu (`soutienApresTestHttp`). D21 : un lien inaccessible ou non testable peut
 * être noté soutenant d'après une copie archivée, et seulement s'il la porte (`archive_url` ET
 * `sha256_contenu`) ; sans elle, « soutient » devient `non_applicable` de même. Le forçage couvre
 * exactement les combinaisons que le schéma refuse. Le sourçage valide du §8
 * (`analysis/note-lue.ts`) n'en change pas : seul un lien qui existe et soutient y compte.
 *
 * **Identité.** `identite` porte ce que le run déclare de chaque juge (`run.schema.json#/properties/
 * juges`) ; `version_prompt` du run et de la notation est `versionPromptDe(prompt)`, le chemin du
 * prompt et sa version joints par `@`. La chaîne refuse un juge dont l'identité ne correspond pas à
 * celle que déclare `run.json`.
 */

import type { CategorieRetenue, Drapeau, Gabarit, Instant, ReferenceItem, Ulid, VerdictExistence, VerdictSoutien } from "../../analysis/types.ts";
import type { Registre, ReponseAttendue } from "../questions/types.ts";
import type { ChargeJuge, PromptDeJuge } from "./charge-juge.ts";
import { controlerExtrait, reponseAuTexteVide, type TextesDeVerification } from "./extrait.ts";
import { fraicheurDesItems } from "./fraicheur.ts";
import { AttributionIncoherente, noterAttribution, type NoteAttribution } from "./note-attribution.ts";
import { NomCiteSansMot } from "./rattachement.ts";
import { LienSansVerdictExistence, type ExistenceEtablie } from "./vue-annotateur.ts";
import type {
  CandidatDuRun,
  LienNotation,
  MotifInexactitude,
  MotifNonClassement,
  MotifRenvoiDefaillance,
  NotationIndividuelle,
  RenvoiDefaillance,
  RenvoiHumain,
} from "./types.ts";

export interface IdentiteJuge {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly prompt: PromptDeJuge;
}

export interface SoutienDeLien {
  readonly url_citee: string;
  readonly verdict_soutien: VerdictSoutien;
}

interface SortieCommune {
  /** `soutiens` : un avis par lien de `charge.reponse.liens`, dans le même ordre, si `cite` ; aucun sinon. */
  readonly sourcage: { readonly cite: boolean; readonly soutiens: readonly SoutienDeLien[] };
  readonly extrait_justificatif?: { readonly provenance: "reponse" | "reference"; readonly texte: string };
}

/** La sortie structurée du §7 hors Q-ATT. `categorie` reste large : `indeterminee` est refusée en aval, pas tue ici. */
export interface SortieJugeOrdinaire extends SortieCommune {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
}

/**
 * La sortie d'un juge sur une Q-ATT (D27 (D), D29 (1)) : il relève les noms que la réponse cite comme
 * proposant la mesure, tels qu'écrits, et dit explicitement si elle refuse ou ne répond pas. La note
 * se calcule (`note-attribution.ts`) ; il ne la rend pas.
 */
export interface SortieJugeAttribution extends SortieCommune {
  readonly noms_cites: readonly string[];
  readonly non_reponse: boolean;
}

export type SortieJuge = SortieJugeOrdinaire | SortieJugeAttribution;

/** Les seuls champs d'une sortie de juge hors Q-ATT (charge-juge-v3). Tout autre est refusé. */
export const CHAMPS_SORTIE_JUGE = ["categorie", "drapeaux", "motif_inexactitude", "sourcage", "extrait_justificatif"] as const satisfies readonly (keyof SortieJugeOrdinaire)[];

/** Les seuls champs d'une sortie de juge sur une Q-ATT (D29 (1)). Une catégorie rendue est refusée. */
export const CHAMPS_SORTIE_JUGE_ATTRIBUTION = ["noms_cites", "non_reponse", "sourcage", "extrait_justificatif"] as const satisfies readonly (keyof SortieJugeAttribution)[];

/**
 * Une Q-ATT dont la note n'est déterminée par aucun texte (`note-attribution.ts`, cas indécidables) :
 * aucune notation n'est écrite, et la chaîne s'arrête sur cette erreur nommée. Jamais une note devinée.
 */
export class AttributionIndecidable extends Error {
  constructor(juge_id: string, objet_id: string, raison: string) {
    super(`Juge ${juge_id}, objet ${objet_id} : note de la question d'attribution indécidable — ${raison}`);
    this.name = "AttributionIndecidable";
  }
}

/**
 * Le port d'un juge. `noter` rend la sortie structurée, ou rejette par `JugeDefaillant` quand le juge
 * ne peut pas noter la réponse (§7, 0.27) : la chaîne en fait un renvoi humain motivé
 * (`noterOuRenvoyer`). Toute autre erreur est un défaut du banc, pas du juge : elle remonte et
 * arrête la notation, jamais convertie en renvoi.
 */
export interface Juge {
  readonly identite: IdentiteJuge;
  noter(charge: ChargeJuge): Promise<SortieJuge>;
}

/**
 * §7 (protocole 0.27, D67) : « Une réponse qu'un juge ne peut pas noter (erreur persistante de son
 * API, charge qui dépasse sa fenêtre de contexte, sortie refusée ou illisible) est renvoyée à un
 * humain ». Levée par l'implémentation d'un juge, après ses propres tentatives, avec l'un des motifs
 * de `MOTIFS_RENVOI_DEFAILLANCE`.
 */
export class JugeDefaillant extends Error {
  readonly motif: MotifRenvoiDefaillance;

  constructor(juge_id: string, motif: MotifRenvoiDefaillance, detail: string) {
    super(`Juge ${juge_id} défaillant (${motif}) : ${detail}`);
    this.name = "JugeDefaillant";
    this.motif = motif;
  }
}

/**
 * Une sortie qui ne se lit pas dans le format de la charge, ou s'y lit de façon incohérente.
 * `issueDeJuge` la convertit en renvoi `sortie_illisible` (§7, 0.27) ; `notationDeJuge` la laisse
 * remonter.
 */
export class SortieJugeIncoherente extends Error {
  constructor(juge_id: string, objet_id: string, detail: string) {
    super(`Juge ${juge_id}, objet ${objet_id} : ${detail}`);
    this.name = "SortieJugeIncoherente";
  }
}

/**
 * §7 (protocole 0.32, D74 (25)) : « Quand un juge pose le drapeau obsolescence alors que les items qui
 * lui sont soumis portent plusieurs dates de changement, la fraîcheur n'est pas définie : ce n'est pas
 * une sortie illisible, renvoyée à un humain, mais un défaut du banc, qui arrête la notation. »
 * `issueDeJuge` ne la convertit jamais : elle remonte de la chaîne, qui s'arrête avant d'écrire quoi
 * que ce soit pour ce juge et cette réponse. Aucune invalidation n'est enregistrée (D75 (3)) : on
 * corrige, puis la relance reprend sans rien réécrire.
 */
export class FraicheurIndefinie extends Error {
  readonly juge_id: string;
  readonly objet_id: string;
  readonly contexte: CadreNotationJuge["contexte"];
  readonly dates: readonly string[];

  constructor(juge_id: string, cadre: Pick<CadreNotationJuge, "objet_id" | "contexte">, dates: readonly string[]) {
    super(
      `Défaut du banc (§7, D74 (25)) : le juge ${juge_id} pose le drapeau obsolescence sur la réponse ${cadre.objet_id} (contexte ${cadre.contexte}), dont les items soumis portent plusieurs dates de changement (${dates.join(", ")}) : la fraîcheur n'est pas définie (§11). La notation s'arrête, sans renvoi ni notation pour cette réponse et ce juge, et sans invalidation du run : corriger, puis relancer.`,
    );
    this.name = "FraicheurIndefinie";
    this.juge_id = juge_id;
    this.objet_id = cadre.objet_id;
    this.contexte = cadre.contexte;
    this.dates = [...dates];
  }
}

/** `run.schema.json#/properties/juges/items/properties/version_prompt` et `notateur.version_prompt`. */
export function versionPromptDe(prompt: PromptDeJuge): string {
  return `${prompt.chemin}@${prompt.version}`;
}

/** Ce que la chaîne pose autour de la sortie du juge. */
export interface CadreNotationJuge {
  readonly id: Ulid;
  readonly run_id: Ulid;
  readonly contexte: "run" | "contrefactuel_candidat";
  readonly motif_notation: "notation_juge" | "contrefactuel";
  readonly objet_id: Ulid;
  readonly gabarit: Gabarit;
  readonly references_item: readonly ReferenceItem[];
  readonly date: Instant;
  /** `charge.reponse.liens`, dans l'ordre. */
  readonly liens: readonly string[];
  /** Le verdict d'existence de chaque lien, établi par le test HTTP (§7). */
  readonly existences: ReadonlyMap<string, ExistenceEtablie>;
  /** Les textes contre lesquels l'extrait est contrôlé, du côté noté (origine ou permuté). */
  readonly textes: TextesDeVerification;
  /** `run.date_gel` : l'instant de la fraîcheur (§11). */
  readonly date_gel: Instant;
  /** Les items soumis, du côté noté : la date du changement d'un item O (D27 (C)). */
  readonly items: readonly { readonly obsolescence?: { readonly date_changement: string } | undefined }[];
  /** La réponse attendue résolue au gel, du côté noté : la liste attendue d'une Q-ATT (D27 (D)). */
  readonly reponse_attendue: ReponseAttendue;
  /** Les candidats du périmètre du run, auxquels les noms cités se rattachent (D27 (D)). */
  readonly candidats: readonly CandidatDuRun[];
  /** Les identifiants des candidats interrogés au run (D29 (1)). */
  readonly interroges: readonly string[];
  /** Les éliminés du premier tour, écartés des noms cités d'une Q-ATT (§7, D70 (7) ; `elimines.ts`). */
  readonly elimines: readonly string[];
  /** Le registre de la formulation et la prémisse résolue au gel (D29 (1) : confirmation de prémisse). */
  readonly registre: Registre;
  readonly premisse_fausse: boolean;
  /** `charge.version_charge`, enregistrée dans la notation (D29 (4)). */
  readonly version_charge: string;
}

/** Une Q-ATT indécidable (D30 (2)) : la raison, les noms relevés et le bloc d'attribution rattaché. */
interface Renvoye {
  readonly raison: string;
  readonly noms_cites: readonly string[];
  readonly attribution: NonNullable<NotationIndividuelle["attribution"]>;
}

/** Ce que la note retient de la sortie, ou calcule à sa place sur une Q-ATT. */
interface NoteDeJuge {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  /** D64 : sur une Q-ATT non classée, calculé par la règle d'ensembles. */
  readonly motif_non_classement?: MotifNonClassement;
  readonly attribution?: NonNullable<NotationIndividuelle["attribution"]>;
}

/**
 * Ce qu'un juge rend, une fois sa sortie contrôlée : une notation, ou un renvoi vers la notation
 * humaine, écrit à la place de la notation — sur une Q-ATT qu'aucun texte ne permet de noter
 * (D30 (2)), ou sur une réponse que le juge ne peut pas noter (§7, 0.27).
 */
export type IssueDeJuge = { readonly type: "notation"; readonly notation: NotationIndividuelle } | { readonly type: "renvoi"; readonly renvoi: RenvoiHumain };

/**
 * L'issue d'une sortie de juge. Une sortie incohérente (`SortieJugeIncoherente`) n'arrête pas la
 * notation : la réponse est renvoyée à un humain sous `sortie_illisible`, le détail en raison (§7,
 * 0.27). Toute autre erreur (lien sans verdict d'existence, fraîcheur indéfinie de D74 (25)…) est un
 * défaut du banc et remonte.
 */
export function issueDeJuge(identite: IdentiteJuge, sortie: SortieJuge, cadre: CadreNotationJuge): IssueDeJuge {
  try {
    return issueStricte(identite, sortie, cadre);
  } catch (erreur) {
    if (erreur instanceof SortieJugeIncoherente) return { type: "renvoi", renvoi: renvoiDefaillance(identite, cadre, "sortie_illisible", erreur.message) };
    throw erreur;
  }
}

/**
 * La chaîne appelle le juge par ici : un rejet `JugeDefaillant` devient le renvoi de son motif, une
 * sortie rendue passe par `issueDeJuge`. Un autre rejet remonte tel quel.
 */
export async function noterOuRenvoyer(juge: Juge, charge: ChargeJuge, cadre: CadreNotationJuge): Promise<IssueDeJuge> {
  let sortie: SortieJuge;
  try {
    sortie = await juge.noter(charge);
  } catch (erreur) {
    if (erreur instanceof JugeDefaillant) return { type: "renvoi", renvoi: renvoiDefaillance(juge.identite, cadre, erreur.motif, erreur.message) };
    throw erreur;
  }
  return issueDeJuge(juge.identite, sortie, cadre);
}

/**
 * La notation d'un juge, sans conversion : un renvoi d'attribution lève `AttributionIndecidable`, une
 * sortie incohérente `SortieJugeIncoherente` (la chaîne lit `issueDeJuge`).
 */
export function notationDeJuge(identite: IdentiteJuge, sortie: SortieJuge, cadre: CadreNotationJuge): NotationIndividuelle {
  const issue = issueStricte(identite, sortie, cadre);
  if (issue.type === "renvoi") throw new AttributionIndecidable(identite.juge_id, cadre.objet_id, issue.renvoi.raison);
  return issue.notation;
}

function issueStricte(identite: IdentiteJuge, sortie: SortieJuge, cadre: CadreNotationJuge): IssueDeJuge {
  const note = cadre.gabarit === "Q-ATT" ? noteAttributionDe(identite.juge_id, sortie, cadre) : noteOrdinaireDe(identite.juge_id, sortie, cadre);
  if ("raison" in note) return { type: "renvoi", renvoi: renvoiDe(identite, note, cadre) };
  return { type: "notation", notation: notationDe(identite, sortie, cadre, note) };
}

function notateurDe(identite: IdentiteJuge): NotationIndividuelle["notateur"] {
  return {
    type: "juge",
    id: identite.juge_id,
    famille_modele: identite.famille_modele,
    modele: identite.modele,
    version_prompt: versionPromptDe(identite.prompt),
    a_vu_identite_outil: false,
  };
}

function referencesDe(cadre: CadreNotationJuge): NotationIndividuelle["references_item"] {
  return cadre.references_item.map((r) => ({ item_id: r.item_id, item_version: r.item_version, item_empreinte: r.item_empreinte }));
}

/** Le renvoi porte l'identifiant que la notation aurait porté (dans son propre dossier) : une relance le retrouve. */
function renvoiDe(identite: IdentiteJuge, renvoye: Renvoye, cadre: CadreNotationJuge): RenvoiHumain {
  return {
    id: cadre.id,
    run_id: cadre.run_id,
    contexte: cadre.contexte,
    objet_note: { type: "reponse", id: cadre.objet_id },
    notateur: notateurDe(identite),
    version_charge: cadre.version_charge,
    gabarit: "Q-ATT",
    references_item: referencesDe(cadre),
    motif: "attribution_indecidable",
    raison: renvoye.raison,
    noms_cites: [...renvoye.noms_cites],
    attribution: renvoye.attribution,
    date: cadre.date,
  };
}

/** §7 (0.27) : le renvoi d'un juge qui ne peut pas noter, sous le même identifiant ; il n'a relevé aucun nom. */
function renvoiDefaillance(identite: IdentiteJuge, cadre: CadreNotationJuge, motif: MotifRenvoiDefaillance, raison: string): RenvoiDefaillance {
  return {
    id: cadre.id,
    run_id: cadre.run_id,
    contexte: cadre.contexte,
    objet_note: { type: "reponse", id: cadre.objet_id },
    notateur: notateurDe(identite),
    version_charge: cadre.version_charge,
    gabarit: cadre.gabarit,
    references_item: referencesDe(cadre),
    motif,
    raison,
    date: cadre.date,
  };
}

function notationDe(identite: IdentiteJuge, sortie: SortieJuge, cadre: CadreNotationJuge, note: NoteDeJuge): NotationIndividuelle {
  const fraiche = fraicheurCalculee(identite.juge_id, note.drapeaux, cadre);
  const brouillon: NotationIndividuelle = {
    id: cadre.id,
    run_id: cadre.run_id,
    contexte: cadre.contexte,
    objet_note: { type: "reponse", id: cadre.objet_id },
    notateur: notateurDe(identite),
    version_charge: cadre.version_charge,
    // Annexe C (0.27) : le marqueur vient du texte noté, jamais de la sortie du juge.
    ...(reponseAuTexteVide(cadre.textes.reponse) ? { sur_texte_vide: true as const } : {}),
    gabarit: cadre.gabarit,
    references_item: referencesDe(cadre),
    categorie: note.categorie,
    drapeaux: [...note.drapeaux],
    ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude: note.motif_inexactitude }),
    ...(note.motif_non_classement === undefined ? {} : { motif_non_classement: note.motif_non_classement }),
    ...(fraiche === undefined ? {} : { obsolescence_fraiche: fraiche }),
    ...(note.attribution === undefined ? {} : { attribution: note.attribution }),
    sourcage: { cite: sortie.sourcage.cite, liens: liensNotes(identite.juge_id, sortie, cadre) },
    ...(sortie.extrait_justificatif === undefined
      ? {}
      : { extrait_justificatif: { provenance: sortie.extrait_justificatif.provenance, texte: sortie.extrait_justificatif.texte, verifie_deterministe: false } }),
    date: cadre.date,
    motif_notation: cadre.motif_notation,
  };
  return avecExtraitControle(brouillon, cadre.textes);
}

/** Une sortie qui porte un champ hors du format attendu est refusée, jamais lue en partie. */
function exigerChampsConnus(juge_id: string, objet_id: Ulid, sortie: SortieJuge, connus: readonly string[]): void {
  const inconnus = Object.keys(sortie).filter((cle) => !connus.includes(cle));
  if (inconnus.length > 0) {
    throw new SortieJugeIncoherente(
      juge_id,
      objet_id,
      `champ(s) ${inconnus.join(", ")} hors de la sortie charge-juge-v3 (${connus.join(", ")}). La fraîcheur, et toute la note d'une question d'attribution, se calculent (D27, D29) : une valeur rendue par le juge n'est jamais retenue.`,
    );
  }
}

function noteOrdinaireDe(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): NoteDeJuge {
  exigerChampsConnus(juge_id, cadre.objet_id, sortie, CHAMPS_SORTIE_JUGE);
  if (!("categorie" in sortie)) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "sortie sans catégorie sur une question qui n'est pas d'attribution.");
  if (sortie.categorie === "non_classee") {
    throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "« non_classee » rendue par le juge : elle n'est donnée que par la règle d'une question d'attribution (D64).");
  }
  return { categorie: sortie.categorie, drapeaux: sortie.drapeaux, ...(sortie.motif_inexactitude === undefined ? {} : { motif_inexactitude: sortie.motif_inexactitude }) };
}

/** D29 (1) : sur une Q-ATT, la note se calcule depuis les noms relevés et la liste attendue du tirage. */
function noteAttributionDe(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): NoteDeJuge | Renvoye {
  exigerChampsConnus(juge_id, cadre.objet_id, sortie, CHAMPS_SORTIE_JUGE_ATTRIBUTION);
  if (!("noms_cites" in sortie) || typeof sortie.non_reponse !== "boolean") {
    throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "question d'attribution sans noms_cites ou sans non_reponse : les deux sont exigés.");
  }
  const note = noterOuRefuser(juge_id, cadre, sortie);
  if (note.statut === "indecidable") return { raison: note.raison, noms_cites: sortie.noms_cites, attribution: note.attribution };
  if (note.categorie !== "exacte" && sortie.extrait_justificatif === undefined && !reponseAuTexteVide(cadre.textes.reponse)) {
    throw new SortieJugeIncoherente(juge_id, cadre.objet_id, `note calculée « ${note.categorie} » sans extrait justificatif : sur une question d'attribution, l'extrait est exigé dès qu'un nom est cité ou que la liste attendue n'est pas vide (annexe C : sauf sur une réponse au texte vide).`);
  }
  return { ...noteCalculee(note), attribution: note.attribution };
}

/** Catégorie, drapeaux et motifs d'une note d'attribution calculée, recopiés champ par champ. */
function noteCalculee(note: Extract<NoteAttribution, { readonly statut: "calculee" }>): NoteDeJuge {
  return {
    categorie: note.categorie,
    drapeaux: note.drapeaux,
    ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude: note.motif_inexactitude }),
    ...(note.motif_non_classement === undefined ? {} : { motif_non_classement: note.motif_non_classement }),
  };
}

function noterOuRefuser(juge_id: string, cadre: CadreNotationJuge, sortie: SortieJugeAttribution): NoteAttribution {
  try {
    return noterAttribution(
      { noms_cites: sortie.noms_cites, non_reponse: sortie.non_reponse },
      { reponse_attendue: cadre.reponse_attendue, candidats: cadre.candidats, interroges: cadre.interroges, elimines: cadre.elimines, registre: cadre.registre, premisse_fausse: cadre.premisse_fausse },
    );
  } catch (erreur) {
    if (erreur instanceof NomCiteSansMot || erreur instanceof AttributionIncoherente) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, erreur.message);
    throw erreur;
  }
}

/**
 * D27 (C) : la fraîcheur se calcule. Le drapeau sans item O est une sortie incohérente ; sur des items
 * de plusieurs dates de changement, un défaut du banc (D74 (25)).
 */
function fraicheurCalculee(juge_id: string, drapeaux: readonly Drapeau[], cadre: CadreNotationJuge): boolean | undefined {
  const fraicheur = fraicheurDesItems(drapeaux, cadre.items, cadre.date_gel);
  switch (fraicheur.statut) {
    case "sans_objet":
      return undefined;
    case "calculee":
      return fraicheur.fraiche;
    case "sans_item_o":
      throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "drapeau obsolescence sans item O parmi les items soumis : la date du changement manque (§11).");
    case "ambigue":
      throw new FraicheurIndefinie(juge_id, cadre, fraicheur.dates);
  }
}

/** `verifie_deterministe` est le résultat du test verbatim (`extrait.ts`), jamais la parole du juge. */
function avecExtraitControle(notation: NotationIndividuelle, textes: TextesDeVerification): NotationIndividuelle {
  const extrait = notation.extrait_justificatif;
  if (extrait === undefined) return notation;
  return { ...notation, extrait_justificatif: { ...extrait, verifie_deterministe: controlerExtrait(notation, textes).valide } };
}

/** Chaque avis de soutien, joint au verdict d'existence de son lien ; l'ordre est celui de la charge. */
function liensNotes(juge_id: string, sortie: SortieJuge, cadre: CadreNotationJuge): readonly LienNotation[] {
  const { cite, soutiens } = sortie.sourcage;
  if (!cite) {
    if (soutiens.length > 0) throw new SortieJugeIncoherente(juge_id, cadre.objet_id, "avis de soutien sur des liens alors que la réponse est notée sans source citée.");
    return [];
  }
  exigerAlignes(juge_id, cadre, soutiens);
  return soutiens.map((soutien) => lienNote(soutien, existenceDe(cadre, soutien.url_citee)));
}

function exigerAlignes(juge_id: string, cadre: CadreNotationJuge, soutiens: readonly SoutienDeLien[]): void {
  const alignes = soutiens.length === cadre.liens.length && soutiens.every((soutien, rang) => soutien.url_citee === cadre.liens[rang]);
  if (!alignes) {
    throw new SortieJugeIncoherente(juge_id, cadre.objet_id, `${soutiens.length} avis de soutien pour ${cadre.liens.length} lien(s) de la charge, ou dans un autre ordre.`);
  }
}

function existenceDe(cadre: CadreNotationJuge, url: string): ExistenceEtablie {
  const existence = cadre.existences.get(url);
  if (existence === undefined) throw new LienSansVerdictExistence(cadre.objet_id, url);
  return existence;
}

/** Verdicts d'existence dont le soutien ne peut être jugé que sur une copie archivée (§7, D21). */
const SOUTIEN_SUR_COPIE_ARCHIVEE: ReadonlySet<VerdictExistence> = new Set<VerdictExistence>(["inaccessible", "non_testable"]);

/** Un lien peut-il soutenir, d'après le test HTTP ? Jamais s'il est mort ; sur copie archivée tenue s'il est inaccessible ou non testable. */
function peutSoutenir(e: ExistenceEtablie): boolean {
  if (e.verdict_existence === "mort") return false;
  if (!SOUTIEN_SUR_COPIE_ARCHIVEE.has(e.verdict_existence)) return true;
  return e.archive_url !== undefined && e.sha256_contenu !== undefined;
}

/**
 * Le soutien noté pour un lien, d'après l'avis du juge et le résultat entier du test HTTP.
 *
 * D19, §7 : « Un lien mort ne soutient jamais rien. » Quand le test HTTP dit un lien mort, un avis
 * « soutient » est noté `non_applicable`.
 *
 * D21, §7 : « un lien inaccessible ou non testable peut être noté soutenant d'après une copie
 * archivée ». Sans copie archivée tenue — `archive_url` ET `sha256_contenu` —, rien ne dit sur quoi
 * le soutien a été jugé : un avis « soutient » sur un tel lien est noté `non_applicable`.
 *
 * Tout autre avis, et tout avis sur un lien qui peut soutenir, est rendu tel quel. Le forçage couvre
 * exactement ce que `schema/notation.schema.json` refuse (mort × soutient ; inaccessible ou non
 * testable × soutient sans la copie).
 */
export function soutienApresTestHttp(soutien: VerdictSoutien, existence: ExistenceEtablie): VerdictSoutien {
  return soutien === "soutient" && !peutSoutenir(existence) ? "non_applicable" : soutien;
}

/** Recopie champ par champ du résultat du test HTTP, plus l'avis de soutien du juge, après D19 et D21. */
function lienNote(soutien: SoutienDeLien, e: ExistenceEtablie): LienNotation {
  return {
    url_citee: e.url_citee,
    ...(e.url_finale === undefined ? {} : { url_finale: e.url_finale }),
    ...(e.code_http === undefined ? {} : { code_http: e.code_http }),
    date_test: e.date_test,
    verdict_existence: e.verdict_existence,
    verdict_soutien: soutienApresTestHttp(soutien.verdict_soutien, e),
    ...(e.sha256_contenu === undefined ? {} : { sha256_contenu: e.sha256_contenu }),
    ...(e.archive_url === undefined ? {} : { archive_url: e.archive_url }),
  };
}
