/**
 * Construction et contrôle d'une notation humaine (§7 ; D17, D18 du 2026-10-06).
 *
 * `construireNotationHumaine(saisie, contexte)` rend une `NotationIndividuelle` conforme à
 * `schema/notation.schema.json`, ou un refus qui liste **tous** ses motifs. Rien n'est enregistré
 * ici : l'appelant écrit la notation acceptée (`stockage.ts:DepotNotation.ecrireNotation`, qui la
 * revalide).
 *
 * **Deux sortes d'échec.** Une saisie fautive est un refus (`statut: "refusee"`), que l'écran montre
 * à l'annotateur pour qu'il corrige. Un contexte incohérent (pseudonyme vide, motif qu'un humain ne
 * porte pas, objet noté ou items qui ne sont pas ceux de la vue) est une erreur de programmation :
 * il lève (`PseudonymeVide`, `ContexteNotationInvalide`).
 *
 * Les règles propres à ce module, dans l'ordre où leurs motifs sont rendus :
 *
 * 0. **Question d'attribution (D29 (1)).** Sur une Q-ATT, l'annotateur saisit les noms cités et la
 *    non-réponse, comme le juge ; la note se calcule par la même règle (`note-attribution.ts`). Une
 *    saisie de catégorie sur une Q-ATT (`saisie_attribution_attendue`), des noms saisis hors Q-ATT
 *    (`saisie_attribution_hors_qatt`), un relevé incohérent (`attribution_incoherente`) ou un cas
 *    qu'aucun texte ne tranche (`attribution_indecidable`) refusent avant toute autre règle.
 *
 * 1. **Soutien des liens.** La saisie donne un soutien par lien de la vue, dans l'ordre de la vue
 *    (`vue.reponse.liens`), chacun nommant son URL. Un lien sans soutien (`soutien_manquant`), un
 *    soutien en trop ou pour une autre URL (`soutien_hors_vue`) refusent. L'existence vient de la
 *    vue, jamais de la saisie : l'humain juge le soutien, le test HTTP l'existence (§7).
 * 2. **Extrait** contrôlé par `extrait.ts:controlerExtrait`, contre les mêmes textes que pour un
 *    juge : la réponse projetée de la vue et les citations verbatim des items soumis
 *    (`citationsDeReference`). Un extrait invalide refuse (`extrait_vide`, `extrait_introuvable`) :
 *    une notation humaine à extrait invalide n'est jamais enregistrée. La provenance déclarée doit
 *    contenir l'extrait (`provenance_inexacte`), vérifiée par `testerVerbatim` seul (règle 5) ; un
 *    extrait accepté porte `verifie_deterministe: true`. Sans extrait, rien n'est contrôlé ici : le
 *    schéma exige l'extrait hors d'une note exacte, sauf sur un refus de l'API (D33) : la notation
 *    porte alors `sur_refus_api`, posé d'après la vue (`normalise.refus_api`), jamais d'après la saisie.
 * 3. **Fraîcheur de l'obsolescence**, calculée, jamais saisie, et seulement si le drapeau
 *    `obsolescence` est posé (D17) : `fraicheur.ts:obsolescenceFraiche`, sur la date du changement
 *    de l'item O soumis et la date de gel. Sans item O parmi les items soumis, la date du changement
 *    manque (`obsolescence_sans_item_o`) ; avec plusieurs items O de dates différentes, la fraîcheur
 *    est ambiguë (`obsolescence_ambigue`). Dans les deux cas : refus, jamais une date choisie.
 * 4. **Schéma.** L'objet construit est validé par ajv. Les règles que le schéma porte (drapeaux
 *    seulement sur une note inexacte, motif d'inexactitude, extrait hors exacte, attribution pour
 *    Q-ATT et seulement pour elle, lien mort jamais soutenant, copie archivée…) ne sont pas réécrites
 *    ici : chaque erreur ajv devient un motif `non_conforme_au_schema`, avec son chemin et son
 *    message.
 *
 * **Champs posés par ce module.** `contexte` vaut `run`, celui des réponses obtenues que note un
 * humain (le schéma : « doit valoir celui de l'objet noté »). `notateur` est `{ type: "humain", id:
 * pseudonyme, a_vu_identite_outil: false }` : rien d'autre sur la personne (pas de sensibilité
 * déclarée ici). `gabarit` et `references_item` viennent de la vue, c'est-à-dire de ce que
 * l'annotateur a vu. L'identifiant et la date sont fournis par l'appelant : aucune horloge.
 */

import type { CategorieRetenue, Drapeau, Instant, MotifNotation, ObjetNote, Ulid, VerdictSoutien } from "../../analysis/types.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { citationsDeReference, controlerExtrait, type MotifExtraitInvalide, type TextesDeVerification } from "./extrait.ts";
import { VERSION_CHARGE_JUGE, type ResoluAuGel } from "./charge-juge.ts";
import { fraicheurDesItems } from "./fraicheur.ts";
import { attributionRelevee, AttributionIncoherente, noterAttribution, type ContexteAttribution } from "./note-attribution.ts";
import { NomCiteSansMot } from "./rattachement.ts";
import type { CandidatDuRun, ExtraitJustificatif, LienNotation, MotifInexactitude, NotationIndividuelle } from "./types.ts";
import type { ExistenceEtablie, VueAnnotateur } from "./vue-annotateur.ts";

/**
 * Les motifs sous lesquels un humain note une réponse du run (`notation.schema.json`,
 * `motif_notation`). `notation_juge` et `contrefactuel` sont des motifs de juge ; `arbitrage_panel`
 * relève du panel des contestations, hors de ce domaine.
 */
export const MOTIFS_HUMAINS = [
  "echantillon_aleatoire_10",
  "arbitrage_echantillon_10",
  "desaccord_juges",
  "erreur_grave",
  "extrait_invalide",
  "accord_partiel_juges",
  "attribution_indecidable",
  "calibration_jeu_or",
] as const satisfies readonly MotifNotation[];
export type MotifHumain = (typeof MOTIFS_HUMAINS)[number];

export interface SoutienSaisi {
  readonly url_citee: string;
  readonly verdict_soutien: VerdictSoutien;
}

interface SaisieCommune {
  readonly cite: boolean;
  /** Un soutien par lien de la vue, dans l'ordre de `vue.reponse.liens`. */
  readonly soutiens: readonly SoutienSaisi[];
  readonly extrait?: { readonly texte: string; readonly provenance: ExtraitJustificatif["provenance"] };
}

/** Ce que l'annotateur saisit hors Q-ATT : la grille du §7 (`VERSION_GRILLE_HUMAINE`). */
export interface SaisieOrdinaire extends SaisieCommune {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
}

/**
 * Ce que l'annotateur saisit sur une Q-ATT (D29 (1) et (4)) : comme le juge, les noms cités tels
 * qu'écrits et la non-réponse explicite ; la note se calcule (`note-attribution.ts`).
 */
export interface SaisieAttribution extends SaisieCommune {
  readonly noms_cites: readonly string[];
  readonly non_reponse: boolean;
  /** D30 (3) : réponse contradictoire, déclarée indéterminée ; exclusive de la non-réponse, noms facultatifs. */
  readonly indeterminee: boolean;
  /**
   * D30 (2) : la note que l'humain décide lui-même, admise dans les seuls cas que la règle d'ensembles
   * rend indécidables (`note-attribution.ts`), et exigée alors.
   */
  readonly note_decidee?: NoteDecidee;
}

/** Ce que l'humain décide sur une Q-ATT indécidable : la grille du §7, sans « indéterminée » (D30 (3) a sa case). */
export interface NoteDecidee {
  readonly categorie: "exacte" | "inexacte";
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
}

export type SaisieHumaine = SaisieOrdinaire | SaisieAttribution;

/** Le périmètre du run, auquel se rattachent les noms cités sur une Q-ATT (D29 (1)). */
export interface PerimetreDeNotation {
  readonly candidats: readonly CandidatDuRun[];
  readonly interroges: readonly string[];
}

export interface ContexteNotationHumaine {
  readonly notation_id: Ulid;
  readonly run_id: Ulid;
  readonly objet_note: ObjetNote;
  readonly motif_notation: MotifHumain;
  /** Le pseudonyme de l'annotateur, et rien d'autre sur lui. */
  readonly annotateur_id: string;
  readonly date: Instant;
  readonly vue: VueAnnotateur;
  /** Les items soumis, ceux dont la vue porte les références, dans le même ordre. */
  readonly items: readonly Item[];
  /** `run.date_gel`. */
  readonly date_gel: Instant;
  readonly perimetre: PerimetreDeNotation;
  /**
   * D55 (9), §7 (protocole 0.20) : la réponse attendue résolue au gel, en vrais identifiants —
   * jamais ceux, aliasés, de `vue.reponse_attendue` (D18 : la vue est aveugle comme le juge). Sur
   * une Q-ATT, le rattachement des noms cités au périmètre (`perimetre.candidats`, en clair) exige
   * les vrais identifiants de `candidats_attendus`.
   */
  readonly resolu_au_gel: ResoluAuGel;
}

export const CODES_REFUS = [
  "saisie_attribution_attendue",
  "saisie_attribution_hors_qatt",
  "attribution_incoherente",
  "attribution_indecidable",
  "note_decidee_hors_cas_indecidable",
  "soutien_manquant",
  "soutien_hors_vue",
  "extrait_vide",
  "extrait_introuvable",
  "extrait_manquant",
  "provenance_inexacte",
  "obsolescence_sans_item_o",
  "obsolescence_ambigue",
  "non_conforme_au_schema",
] as const;
export type CodeRefus = (typeof CODES_REFUS)[number];

export interface MotifRefus {
  readonly code: CodeRefus;
  readonly detail: string;
  /** Pour un refus du schéma : le chemin JSON de la valeur fautive (`""` pour la racine). */
  readonly chemin?: string;
}

export type ResultatNotationHumaine =
  | { readonly statut: "acceptee"; readonly notation: NotationIndividuelle }
  | { readonly statut: "refusee"; readonly motifs: readonly MotifRefus[] };

export class PseudonymeVide extends Error {
  constructor() {
    super("Pseudonyme d'annotateur vide : une notation humaine porte toujours le pseudonyme de son auteur (§9).");
    this.name = "PseudonymeVide";
  }
}

export class ContexteNotationInvalide extends Error {
  constructor(detail: string) {
    super(`Contexte de notation humaine invalide : ${detail}`);
    this.name = "ContexteNotationInvalide";
  }
}

/** Refuse un pseudonyme vide ou fait d'espaces. Exporté pour la file de travail. */
export function exigerPseudonyme(annotateur_id: string): void {
  if (annotateur_id.trim().length === 0) throw new PseudonymeVide();
}

export function construireNotationHumaine(saisie: SaisieHumaine, contexte: ContexteNotationHumaine): ResultatNotationHumaine {
  verifierContexte(contexte);
  const note = noteDeSaisie(saisie, contexte);
  if ("motifs" in note) return { statut: "refusee", motifs: note.motifs };
  const liens = liensNotes(contexte.vue.reponse.liens, saisie.soutiens);
  const fraicheur = fraicheurCalculee(note.drapeaux, contexte);
  const notation = assembler(saisie, note, contexte, { liens: liens.liens, fraiche: fraicheur.fraiche });
  const motifs = [...liens.motifs, ...motifsDeLExtrait(notation, contexte), ...fraicheur.motifs, ...motifsDuSchema(notation)];
  return motifs.length === 0 ? { statut: "acceptee", notation } : { statut: "refusee", motifs };
}

/* ------------------------------------------------------------------ note (D29 (1)) */

/** Ce que la note retient de la saisie, ou calcule à sa place sur une Q-ATT. */
interface NoteSaisie {
  readonly categorie: CategorieRetenue;
  readonly drapeaux: readonly Drapeau[];
  readonly motif_inexactitude?: MotifInexactitude;
  readonly attribution?: NonNullable<NotationIndividuelle["attribution"]>;
}

type NoteOuRefus = NoteSaisie | { readonly motifs: readonly MotifRefus[] };

function noteDeSaisie(saisie: SaisieHumaine, contexte: ContexteNotationHumaine): NoteOuRefus {
  const qatt = contexte.vue.question.gabarit === "Q-ATT";
  if ("noms_cites" in saisie) {
    return qatt ? noteAttribution(saisie, contexte) : refus("saisie_attribution_hors_qatt", `noms cités saisis sur une question ${contexte.vue.question.gabarit}, qui n'est pas d'attribution.`);
  }
  if (qatt) return refus("saisie_attribution_attendue", "question d'attribution : saisir les noms cités et la non-réponse ; la catégorie se calcule (D29).");
  return { categorie: saisie.categorie, drapeaux: saisie.drapeaux, ...(saisie.motif_inexactitude === undefined ? {} : { motif_inexactitude: saisie.motif_inexactitude }) };
}

function refus(code: CodeRefus, detail: string): NoteOuRefus {
  return { motifs: [{ code, detail }] };
}

/** La même règle que pour un juge (`note-attribution.ts`) ; la prémisse n'existe que sur la formulation orientée. */
function noteAttribution(saisie: SaisieAttribution, contexte: ContexteNotationHumaine): NoteOuRefus {
  try {
    return saisie.indeterminee ? noteIndeterminee(saisie, contexte) : noteCalculeeOuDecidee(saisie, contexte);
  } catch (erreur) {
    if (erreur instanceof NomCiteSansMot || erreur instanceof AttributionIncoherente) return refus("attribution_incoherente", erreur.message);
    throw erreur;
  }
}

/** D30 (3) : la réponse contradictoire est indéterminée ; les noms éventuels restent rattachés, sans règle. */
function noteIndeterminee(saisie: SaisieAttribution, contexte: ContexteNotationHumaine): NoteOuRefus {
  if (saisie.non_reponse) throw new AttributionIncoherente("réponse déclarée à la fois indéterminée et non-réponse : les deux cases s'excluent.");
  if (saisie.note_decidee !== undefined) throw new AttributionIncoherente("réponse déclarée indéterminée avec une note décidée : la case indéterminée est la note.");
  return { categorie: "indeterminee", drapeaux: [], attribution: attributionRelevee(saisie.noms_cites, { reponse_attendue: contexte.resolu_au_gel.reponse_attendue, candidats: contexte.perimetre.candidats }) };
}

/** La règle d'ensembles, comme pour un juge ; dans ses seuls cas indécidables, la note que l'humain décide (D30 (2)). */
function noteCalculeeOuDecidee(saisie: SaisieAttribution, contexte: ContexteNotationHumaine): NoteOuRefus {
  const note = noterAttribution({ noms_cites: saisie.noms_cites, non_reponse: saisie.non_reponse }, contexteAttribution(contexte));
  const decidee = saisie.note_decidee;
  if (note.statut === "calculee") {
    if (decidee !== undefined) return refus("note_decidee_hors_cas_indecidable", "la règle d'ensembles calcule la note de cette question d'attribution : une note décidée n'y est pas admise (D30 (2)).");
    return { categorie: note.categorie, drapeaux: note.drapeaux, ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude: note.motif_inexactitude }), attribution: note.attribution };
  }
  if (decidee === undefined) return refus("attribution_indecidable", `${note.raison} Décidez la catégorie, le motif et les drapeaux (D30 (2)).`);
  if (!CATEGORIES_DECIDABLES.includes(decidee.categorie)) {
    throw new AttributionIncoherente(`catégorie décidée « ${String(decidee.categorie)} » : exacte ou inexacte (la non-réponse et l'indéterminée ont leur case).`);
  }
  return { categorie: decidee.categorie, drapeaux: decidee.drapeaux, ...(decidee.motif_inexactitude === undefined ? {} : { motif_inexactitude: decidee.motif_inexactitude }), attribution: note.attribution };
}

const CATEGORIES_DECIDABLES: readonly string[] = ["exacte", "inexacte"];

/** La prémisse n'existe que sur la formulation orientée, où la vue la porte toujours. */
function contexteAttribution(contexte: ContexteNotationHumaine): ContexteAttribution {
  const question = contexte.vue.question;
  if (question.registre === "oriente" && question.premisse_fausse === undefined) {
    throw new ContexteNotationInvalide(`la vue de la réponse ${contexte.vue.reponse_id} porte une formulation orientée sans sa prémisse résolue au gel.`);
  }
  return { reponse_attendue: contexte.resolu_au_gel.reponse_attendue, ...contexte.perimetre, registre: question.registre, premisse_fausse: question.premisse_fausse === true };
}

/* ------------------------------------------------------------------ contexte */

function verifierContexte(contexte: ContexteNotationHumaine): void {
  exigerPseudonyme(contexte.annotateur_id);
  if (!(MOTIFS_HUMAINS as readonly string[]).includes(contexte.motif_notation)) {
    throw new ContexteNotationInvalide(`le motif ${String(contexte.motif_notation)} n'est pas un motif de notation humaine.`);
  }
  if (contexte.objet_note.type !== "reponse" || contexte.objet_note.id !== contexte.vue.reponse_id) {
    throw new ContexteNotationInvalide(`l'objet noté ${contexte.objet_note.type} ${contexte.objet_note.id} n'est pas la réponse ${contexte.vue.reponse_id} de la vue.`);
  }
  if (!memesItems(contexte.items, contexte.vue)) {
    throw new ContexteNotationInvalide(`les items soumis ne sont pas ceux que porte la vue de la réponse ${contexte.vue.reponse_id}.`);
  }
}

function memesItems(items: readonly Item[], vue: VueAnnotateur): boolean {
  return (
    items.length === vue.references.length &&
    items.every((item, rang) => {
      const reference = vue.references[rang];
      return reference !== undefined && reference.item_id === item.id && reference.item_version === item.version && reference.item_empreinte === item.empreinte;
    })
  );
}

/* ------------------------------------------------------------------ liens */

function liensNotes(
  existences: readonly ExistenceEtablie[],
  soutiens: readonly SoutienSaisi[],
): { readonly liens: readonly LienNotation[]; readonly motifs: readonly MotifRefus[] } {
  const motifs: MotifRefus[] = [];
  const liens: LienNotation[] = [];
  existences.forEach((existence, rang) => {
    const soutien = soutiens[rang];
    if (soutien === undefined) motifs.push({ code: "soutien_manquant", detail: `le lien ${existence.url_citee} (rang ${rang + 1}) n'a pas de soutien saisi.` });
    else if (soutien.url_citee !== existence.url_citee) motifs.push(soutienHorsVue(soutien, rang));
    else liens.push({ ...existence, verdict_soutien: soutien.verdict_soutien });
  });
  soutiens.slice(existences.length).forEach((soutien, decalage) => motifs.push(soutienHorsVue(soutien, existences.length + decalage)));
  return { liens, motifs };
}

function soutienHorsVue(soutien: SoutienSaisi, rang: number): MotifRefus {
  return { code: "soutien_hors_vue", detail: `le soutien saisi au rang ${rang + 1} porte sur ${soutien.url_citee}, que la vue ne place pas à ce rang.` };
}

/* ------------------------------------------------------------------ extrait */

const CODE_EXTRAIT_INVALIDE: Readonly<Record<MotifExtraitInvalide, CodeRefus>> = {
  citation_vide: "extrait_vide",
  introuvable: "extrait_introuvable",
  extrait_manquant: "extrait_manquant",
};

/** Le contrôle de l'extrait que porte la notation assemblée ; sans extrait, le schéma décide seul. */
function motifsDeLExtrait(notation: NotationIndividuelle, contexte: ContexteNotationHumaine): readonly MotifRefus[] {
  const extrait = notation.extrait_justificatif;
  if (extrait === undefined) return [];
  const textes: TextesDeVerification = { reponse: contexte.vue.reponse.texte, citations_reference: citationsDeReference(contexte.items) };
  const controle = controlerExtrait(notation, textes);
  if (!controle.valide) {
    return [{ code: CODE_EXTRAIT_INVALIDE[controle.motif], detail: `l'extrait « ${extrait.texte} » échoue au test verbatim (${controle.motif}).` }];
  }
  return figureDansSaProvenance(extrait, textes) ? [] : [provenanceInexacte(extrait)];
}

function figureDansSaProvenance(extrait: ExtraitJustificatif, textes: TextesDeVerification): boolean {
  const sources = extrait.provenance === "reponse" ? [textes.reponse] : textes.citations_reference;
  return sources.some((source) => testerVerbatim(extrait.texte, source).passe);
}

function provenanceInexacte(extrait: ExtraitJustificatif): MotifRefus {
  const ou = extrait.provenance === "reponse" ? "la réponse" : "la citation d'un item de référence";
  return { code: "provenance_inexacte", detail: `l'extrait « ${extrait.texte} » est déclaré tiré de ${ou}, où il ne figure pas.` };
}

/* ------------------------------------------------------------------ fraîcheur */

function fraicheurCalculee(
  drapeaux: readonly Drapeau[],
  contexte: ContexteNotationHumaine,
): { readonly fraiche: boolean | undefined; readonly motifs: readonly MotifRefus[] } {
  const fraicheur = fraicheurDesItems(drapeaux, contexte.items, contexte.date_gel);
  switch (fraicheur.statut) {
    case "sans_objet":
      return { fraiche: undefined, motifs: [] };
    case "calculee":
      return { fraiche: fraicheur.fraiche, motifs: [] };
    case "sans_item_o":
      return { fraiche: undefined, motifs: [{ code: "obsolescence_sans_item_o", detail: "drapeau obsolescence sans item O parmi les items soumis : la date du changement manque (§11)." }] };
    case "ambigue":
      return { fraiche: undefined, motifs: [{ code: "obsolescence_ambigue", detail: `drapeau obsolescence avec plusieurs dates de changement (${fraicheur.dates.join(", ")}) : la fraîcheur est ambiguë (§11).` }] };
  }
}

/* ------------------------------------------------------------------ assemblage et schéma */

interface Calcule {
  readonly liens: readonly LienNotation[];
  readonly fraiche: boolean | undefined;
}

function assembler(saisie: SaisieHumaine, note: NoteSaisie, contexte: ContexteNotationHumaine, calcule: Calcule): NotationIndividuelle {
  return {
    id: contexte.notation_id,
    run_id: contexte.run_id,
    contexte: "run",
    objet_note: { type: contexte.objet_note.type, id: contexte.objet_note.id },
    notateur: { type: "humain", id: contexte.annotateur_id, a_vu_identite_outil: false },
    // D29 (4) : l'humain a vu le contenu de la charge de cette version (D18).
    version_charge: VERSION_CHARGE_JUGE,
    // D33 : le marqueur vient de la réponse (la vue recopie normalise.refus_api), jamais de la saisie.
    ...(contexte.vue.reponse.refus_api ? { sur_refus_api: true as const } : {}),
    gabarit: contexte.vue.question.gabarit,
    references_item: contexte.vue.references.map((r) => ({ item_id: r.item_id, item_version: r.item_version, item_empreinte: r.item_empreinte })),
    categorie: note.categorie,
    drapeaux: [...note.drapeaux],
    ...(note.motif_inexactitude === undefined ? {} : { motif_inexactitude: note.motif_inexactitude }),
    ...(calcule.fraiche === undefined ? {} : { obsolescence_fraiche: calcule.fraiche }),
    ...(note.attribution === undefined ? {} : { attribution: note.attribution }),
    sourcage: { cite: saisie.cite, liens: calcule.liens },
    ...(saisie.extrait === undefined ? {} : { extrait_justificatif: extraitVerifie(saisie.extrait) }),
    date: contexte.date,
    motif_notation: contexte.motif_notation,
  };
}

/**
 * `verifie_deterministe: true` n'est vrai que si la notation est acceptée : une notation dont
 * l'extrait échoue est refusée par `motifsDeLExtrait`, jamais rendue ni enregistrée.
 */
function extraitVerifie(extrait: NonNullable<SaisieHumaine["extrait"]>): ExtraitJustificatif {
  return { provenance: extrait.provenance, texte: extrait.texte, verifie_deterministe: true };
}

/**
 * Les erreurs ajv, une par motif : `ErreurSchema` porte, dans le même ordre, les chemins et les
 * lignes formatées (`outils/schemas/erreurs.ts:formaterErreur`, « chemin : message ») sous la ligne
 * d'en-tête de son message.
 */
function motifsDuSchema(notation: NotationIndividuelle): readonly MotifRefus[] {
  const erreur = erreurDeSchema("notation", notation, `notation humaine ${notation.id}`);
  if (erreur === null) return [];
  const lignes = erreur.message.split("\n").slice(1).map((ligne) => ligne.trim());
  if (lignes.length !== erreur.chemins.length) throw new Error(`Notation ${notation.id} : erreurs de schéma illisibles.\n${erreur.message}`);
  return lignes.map((detail, rang) => ({ code: "non_conforme_au_schema", chemin: String(erreur.chemins[rang]), detail }));
}
