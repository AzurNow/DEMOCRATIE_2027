/**
 * La charge remise à un juge automatique (§7).
 *
 * « Chaque juge reçoit la question, la réponse telle que projetée par la fonction de normalisation
 * publiée et versionnée (texte, liens, citations), la réponse brute restant stockée intacte et
 * publiée, l'item de référence avec sa citation et ses dates de validité, la date du run, et la
 * grille. Il ne reçoit jamais l'identité de l'outil noté. »
 *
 * La charge est une donnée structurée, pas un prompt (règle 6) : le texte du prompt et la grille
 * vivent dans un fichier versionné de `prompts/`, que la charge désigne par le chemin et la version
 * reçus de l'appelant. Ce module n'écrit aucun texte destiné au modèle.
 *
 * **Aveuglement.** La charge est construite champ par champ, jamais par recopie d'un objet : aucun
 * champ de la réponse qui ne figure pas ci-dessous ne peut y passer. En sont exclus, et le type
 * `ChargeJuge` ne les a pas : `outil_id`, `alias_aveugle`, `mode`, `canal`, `metadonnees` (modèle
 * demandé et renvoyé, paramètres), `requete` (corps, en-têtes, point d'accès), et tout le brut
 * (`brut`, `brut_texte` et leurs empreintes, règle 7). L'alias aveugle n'est pas transmis non
 * plus : le juge n'en a pas besoin pour noter, et le plus restrictif est de ne rien lui donner qui
 * distingue deux outils. Les citations sont projetées sur `{ url, texte }` (D15) : aucun autre
 * champ de l'objet de l'éditeur ne passe. `appels_outils` de la projection, que le §7 ne cite pas, n'est pas
 * transmis. Le nom du candidat arrive par la question et par les textes de l'item, qui le portent ;
 * l'identifiant du candidat de chaque item est transmis, l'item le portant.
 *
 * **Normalisation.** La charge porte `reponse.normalisation` (la fonction de projection de
 * l'adaptateur et sa version) et la version de la normalisation du test verbatim
 * (`validation/domaine/normalisation.ts`, `VERSION_NORMALISATION`), contre laquelle son extrait
 * justificatif sera contrôlé (`extrait.ts`).
 *
 * **Ce qu'un fichier du run sait déjà (D27, 2026-10-09).** La charge v3 transmet au juge ce que le
 * tirage et le test des liens ont établi, pour qu'il n'ait rien à deviner :
 *
 * - (F) le registre de la formulation interrogée (`question.registre`) et, sur la formulation
 *   orientée seulement, la prémisse résolue au gel (`question.premisse_fausse`, recopiée de
 *   `tirage.entrees[].premisse_fausse`, que seul `reponse-attendue.ts:premisseFausseAuGel` résout).
 *   Sur une formulation neutre ou familière, qui n'affiche aucune prémisse (§5), le champ est absent :
 *   la valeur du tirage porte sur la formulation orientée de la question, pas sur celle-ci ;
 * - (G) la réponse attendue résolue au gel (`reponse_attendue`, recopiée champ par champ de
 *   `tirage.entrees[].reponse_attendue`) : sur une Q-ATT, `candidats_attendus` n'y porte que des
 *   identifiants opaques, comme les items ;
 * - (E) le texte de chaque page citée (`pages_citees`, `pages-citees.ts`), conservée ou copie
 *   archivée, borné à `longueur_max_texte_page` points de code, la troncature dite page par page.
 *
 * Ce que le juge ne rend plus, le code le calcule (`juge.ts`) : (C) la fraîcheur de l'obsolescence,
 * et (D) sur une Q-ATT, le rattachement des noms cités aux candidats (`rattachement.ts`). La charge
 * ne transmet toujours aucun nom de candidat qui ne figure pas déjà dans la question ou les textes de
 * l'item : une question d'attribution n'en nomme aucun (§5), et le juge relève les noms dans la
 * réponse.
 *
 * **Alias aveugle de candidat (charge-juge-v4, §7, protocole 0.20, D55 (9)).** Tout identifiant de
 * candidat qui atteindrait la charge est remplacé par son alias du run (`alias-candidats.ts`) :
 * `ItemSoumis.candidat_id` et `reponse_attendue.candidats_attendus`. La table (alias → candidat_id,
 * publiée avec le run) est reçue de l'appelant dans `DemandeCharge.alias_candidats`, inversée une
 * fois (`inverserTable`), puis consultée pour chaque champ. Un candidat sans alias — hors des
 * candidats interrogés au run — fait refuser la charge (`CandidatSansAlias`), jamais transmettre
 * son vrai identifiant.
 */

import type { Gabarit, Instant, RoleItem } from "../../analysis/types.ts";
import type { ObjetJson, ReponseObtenue } from "../interrogation/types.ts";
import type { EntreeTirage, Registre, ReponseAttendue } from "../questions/types.ts";
import { aliasDeCandidat, inverserTable, type TableAliasCandidats } from "./alias-candidats.ts";
import { LONGUEUR_MAX_TEXTE_PAGE, type PageCitee } from "./pages-citees.ts";
import type { ReponseContrefactuelle } from "./reponse-contrefactuelle.ts";
import { VERSION_NORMALISATION } from "../../validation/domaine/normalisation.ts";
import type { EtatPositionnel, Item } from "../../validation/domaine/types.ts";

/**
 * Version du format de la charge : un champ ajouté ou retiré la change. v2 (décision D15 de
 * l'auteur) : les citations sont projetées sur `{ url, texte }`. v3 (décision D27) : registre et
 * prémisse de la formulation, réponse attendue, texte des pages citées et sa borne ; le juge ne rend
 * plus ni la fraîcheur ni le bloc d'attribution (`juge.ts`). v4 (D55 (9), protocole 0.20) :
 * `candidat_id` et `candidats_attendus` portent l'alias aveugle du candidat, jamais son identifiant.
 */
export const VERSION_CHARGE_JUGE = "charge-juge-v4";

export interface PromptDeJuge {
  /** Chemin d'un fichier de `prompts/`, fourni par l'appelant. */
  readonly chemin: string;
  readonly version: string;
}

export interface QuestionPosee {
  readonly gabarit: Gabarit;
  /** Le registre de la formulation interrogée (§5 : neutre, familier, oriente). */
  readonly registre: Registre;
  /** Le texte de la formulation interrogée, tel qu'envoyé à l'outil. */
  readonly texte: string;
}

/** Ce que le tirage a résolu au gel pour la question (`tirage.entrees[]`), et que la charge recopie. */
export interface ResoluAuGel {
  readonly reponse_attendue: ReponseAttendue;
  /** `tirage.entrees[].premisse_fausse` : porte sur la formulation orientée de la question. */
  readonly premisse_fausse: boolean;
}

/**
 * Les entrées du tirage, par question : `tirage.json` validé contre son schéma à la lecture
 * (`analysis/lecture-run.ts:lireTirage`), qui exige `reponse_attendue` et `premisse_fausse` de chaque
 * entrée. Une question tirée deux fois est une incohérence, jamais départagée.
 */
export function resolusAuGel(entrees: readonly Pick<EntreeTirage, "question_id" | "reponse_attendue" | "premisse_fausse">[]): ReadonlyMap<string, ResoluAuGel> {
  const index = new Map<string, ResoluAuGel>();
  for (const entree of entrees) {
    if (index.has(entree.question_id)) throw new Error(`Tirage : la question ${entree.question_id} y figure deux fois.`);
    index.set(entree.question_id, { reponse_attendue: entree.reponse_attendue, premisse_fausse: entree.premisse_fausse });
  }
  return index;
}

export interface ReferenceSoumise {
  readonly item: Item;
  readonly role: RoleItem;
}

export interface DemandeCharge {
  /** Une réponse du run, ou sa copie permutée du test contrefactuel (`reponse-contrefactuelle.ts`). */
  readonly reponse: ReponseObtenue | ReponseContrefactuelle;
  readonly question: QuestionPosee;
  readonly references: readonly ReferenceSoumise[];
  /** `run.date_gel` : l'instant de référence unique du run. */
  readonly date_run: Instant;
  readonly prompt: PromptDeJuge;
  readonly resolu_au_gel: ResoluAuGel;
  /** Une page par lien distinct de la réponse (`pages-citees.ts:pagesCitees`). */
  readonly pages_citees: readonly PageCitee[];
  /** `run.alias_candidats` (§7, protocole 0.20, D55 (9)) : alias → candidat_id, publiée avec le run. */
  readonly alias_candidats: TableAliasCandidats;
}

export interface EtatSoumis {
  readonly position: string;
  readonly paraphrase: string;
  readonly citation_verbatim: string;
  /** Montant, taux, date ou périmètre de la position : ce qu'une déformation (§7) fausse. */
  readonly quantification?: unknown;
}

export interface ItemSoumis {
  readonly item_id: string;
  readonly item_version: number;
  readonly item_empreinte: string;
  readonly role: RoleItem;
  readonly type: Item["type"];
  /** L'alias aveugle du candidat (§7, protocole 0.20), jamais son identifiant : `candidat_id` reste le nom du champ. */
  readonly candidat_id: string;
  readonly valide_du: string;
  readonly valide_au: string | null;
  readonly assertion?: EtatSoumis;
  readonly obsolescence?: {
    readonly date_changement: string;
    readonly etat_anterieur: EtatSoumis;
    readonly etat_posterieur: EtatSoumis;
  };
}

/**
 * Une citation, dans la forme commune à tous les éditeurs (D15). Un champ absent de l'objet reçu,
 * ou qui n'y est pas une chaîne, est absent ici : jamais remplacé par une valeur par défaut.
 */
export interface CitationSoumise {
  readonly url?: string;
  readonly texte?: string;
}

export interface ReponseSoumise {
  readonly texte: string;
  readonly liens: readonly string[];
  readonly citations?: readonly CitationSoumise[];
  readonly troncature: boolean;
  readonly refus_api: boolean;
  readonly normalisation: { readonly fonction: string; readonly version: string };
}

/** La question telle que la charge la transmet : la prémisse n'existe que sur la formulation orientée. */
export interface QuestionSoumise extends QuestionPosee {
  readonly premisse_fausse?: boolean;
}

export interface ChargeJuge {
  readonly version_charge: string;
  readonly prompt: PromptDeJuge;
  readonly date_run: Instant;
  /** Identifiant opaque (ULID) : il ne dit rien de l'outil (`reponse.schema.json`, `id`). */
  readonly reponse_id: string;
  readonly question: QuestionSoumise;
  /** `tirage.schema.json#/$defs/reponse_attendue`, recopiée champ par champ. */
  readonly reponse_attendue: ReponseAttendue;
  readonly reponse: ReponseSoumise;
  readonly pages_citees: readonly PageCitee[];
  /** `pages-citees.ts:LONGUEUR_MAX_TEXTE_PAGE` : la borne, en points de code, du texte de chaque page. */
  readonly longueur_max_texte_page: number;
  readonly references: readonly ItemSoumis[];
  /** Version de la normalisation du test verbatim qui contrôlera l'extrait justificatif. */
  readonly version_normalisation_verbatim: string;
}

/** La charge sans ce qui ne regarde que le juge automatique (version du format, prompt) : D18, la vue humaine en part. */
export type ContenuSoumis = Omit<ChargeJuge, "version_charge" | "prompt">;

export function construireCharge(demande: DemandeCharge): ChargeJuge {
  return {
    version_charge: VERSION_CHARGE_JUGE,
    prompt: { chemin: demande.prompt.chemin, version: demande.prompt.version },
    ...contenuSoumis(demande),
  };
}

/** Tout ce que voit un juge, hors prompt : partagé par la charge et la vue annotateur (D18). */
export function contenuSoumis(demande: Omit<DemandeCharge, "prompt">): ContenuSoumis {
  if (demande.references.length === 0) {
    throw new Error(`Réponse ${demande.reponse.id} : aucun item de référence, rien contre quoi noter (notation.schema.json, references_item).`);
  }
  exigerUnePageParLien(demande.reponse, demande.pages_citees);
  const alias = inverserTable(demande.alias_candidats);
  return {
    date_run: demande.date_run,
    reponse_id: demande.reponse.id,
    question: questionSoumise(demande.question, demande.resolu_au_gel.premisse_fausse),
    reponse_attendue: reponseAttendueSoumise(demande.resolu_au_gel.reponse_attendue, alias),
    reponse: reponseSoumise(demande.reponse),
    pages_citees: demande.pages_citees.map(pageSoumise),
    longueur_max_texte_page: LONGUEUR_MAX_TEXTE_PAGE,
    references: demande.references.map((reference) => itemSoumis(reference, alias)),
    version_normalisation_verbatim: VERSION_NORMALISATION,
  };
}

/** Une page par lien distinct de la réponse, dans l'ordre de première citation : ni plus, ni moins. */
function exigerUnePageParLien(reponse: ReponseObtenue | ReponseContrefactuelle, pages: readonly PageCitee[]): void {
  const attendues = [...new Set(reponse.normalise.liens)];
  const recues = pages.map((page) => page.url_citee);
  if (attendues.length !== recues.length || attendues.some((url, rang) => url !== recues[rang])) {
    throw new Error(`Réponse ${reponse.id} : les pages citées (${recues.join(", ")}) ne sont pas celles des liens de la réponse (${attendues.join(", ")}).`);
  }
}

/** D27 (F) : la prémisse résolue au gel accompagne la seule formulation qui en affiche une. */
function questionSoumise(question: QuestionPosee, premisse_fausse: boolean): QuestionSoumise {
  return {
    gabarit: question.gabarit,
    registre: question.registre,
    texte: question.texte,
    ...(question.registre === "oriente" ? { premisse_fausse } : {}),
  };
}

/** D27 (G) : recopie champ par champ ; aucun champ ajouté au tirage ne passe. D55 (9) : candidats_attendus aliasé. */
function reponseAttendueSoumise(attendue: ReponseAttendue, alias: ReadonlyMap<string, string>): ReponseAttendue {
  const temporelle = attendue.resolution_temporelle;
  return {
    nature: attendue.nature,
    ...(attendue.position === undefined ? {} : { position: attendue.position }),
    ...(attendue.etat_attendu === undefined ? {} : { etat_attendu: attendue.etat_attendu }),
    ...(attendue.candidats_attendus === undefined ? {} : { candidats_attendus: attendue.candidats_attendus.map((id) => aliasDeCandidat(alias, id)) }),
    resolution_temporelle: {
      date_gel: temporelle.date_gel,
      ...(temporelle.date_changement === undefined ? {} : { date_changement: temporelle.date_changement }),
      regle: temporelle.regle,
    },
  };
}

/** D27 (E) : recopie champ par champ de la page bornée (`pages-citees.ts`). */
function pageSoumise(page: PageCitee): PageCitee {
  if (!page.texte_disponible) return { url_citee: page.url_citee, texte_disponible: false, raison: page.raison };
  return {
    url_citee: page.url_citee,
    texte_disponible: true,
    origine: page.origine,
    texte: page.texte,
    texte_sha256: page.texte_sha256,
    tronque: page.tronque,
    longueur_totale: page.longueur_totale,
  };
}

export function reponseSoumise(reponse: ReponseObtenue | ReponseContrefactuelle): ReponseSoumise {
  const projection = reponse.normalise;
  return {
    texte: projection.texte,
    liens: [...projection.liens],
    ...(projection.citations === undefined ? {} : { citations: projection.citations.map(citationSoumise) }),
    troncature: projection.troncature,
    refus_api: projection.refus_api,
    normalisation: { fonction: reponse.normalisation.fonction, version: reponse.normalisation.version },
  };
}

/**
 * Seules les clés `url` et `texte` de l'objet sont lues ; tout autre champ (type, indices, clés
 * propres à l'éditeur, en snake_case ou en camelCase) reste hors de la charge, car sa forme seule
 * peut désigner l'éditeur. Ramener les champs d'un éditeur vers `url` et `texte` est le travail de
 * la normalisation de son adaptateur (`reponse.normalisation`), pas de la notation.
 */
function citationSoumise(citation: ObjetJson): CitationSoumise {
  const url = citation["url"];
  const texte = citation["texte"];
  return {
    ...(typeof url === "string" ? { url } : {}),
    ...(typeof texte === "string" ? { texte } : {}),
  };
}

/** D55 (9) : `candidat_id` porte l'alias aveugle du candidat (`alias`, candidat_id → alias), jamais son identifiant. */
export function itemSoumis({ item, role }: ReferenceSoumise, alias: ReadonlyMap<string, string>): ItemSoumis {
  return {
    item_id: item.id,
    item_version: item.version,
    item_empreinte: item.empreinte,
    role,
    type: item.type,
    candidat_id: aliasDeCandidat(alias, item.candidat_id),
    valide_du: item.valide_du,
    valide_au: item.valide_au,
    ...(item.assertion === undefined ? {} : { assertion: etatSoumis(item.assertion) }),
    ...(item.obsolescence === undefined
      ? {}
      : {
          obsolescence: {
            date_changement: item.obsolescence.date_changement,
            etat_anterieur: etatSoumis(item.obsolescence.etat_anterieur),
            etat_posterieur: etatSoumis(item.obsolescence.etat_posterieur),
          },
        }),
  };
}

function etatSoumis(etat: EtatPositionnel): EtatSoumis {
  return {
    position: etat.position,
    paraphrase: etat.paraphrase,
    citation_verbatim: etat.citation_verbatim,
    ...(etat.quantification === undefined ? {} : { quantification: etat.quantification }),
  };
}
