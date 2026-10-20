/**
 * La réponse contrefactuelle et la demande de charge permutée du test contrefactuel des noms de
 * candidats (§7 : « un sous-ensemble de 200 réponses est renoté après permutation des noms de
 * candidats dans la réponse et dans l'item de référence » ; D16 (1) : la question transmise au juge
 * est permutée avec eux).
 *
 * **Réponse contrefactuelle** (`schema/reponse.schema.json`). Une copie de la réponse d'origine,
 * sous un nouvel identifiant fourni par l'appelant, de contexte `contrefactuel_candidat`, qui dit
 * de quoi elle dérive (`derive_de_reponse_id`) et par quelle permutation (`permutation`, dont les
 * correspondances sont celles du dérangement des candidats interrogés au run, D55 (4)). Seule la
 * projection que lit le juge est permutée : `normalise.texte`, et la clé `texte` de chaque citation
 * de `normalise.citations` quand c'en est une chaîne (sinon la citation est recopiée telle quelle).
 * Le brut (`brut`, `brut_texte`, leurs empreintes, `brut_octets_sha256`) et la requête sont recopiés
 * à l'identique, jamais modifiés (règle 7) : ils restent ce que l'outil a reçu et renvoyé. Les liens
 * ne sont pas permutés. Une réponse manquante ou un refus de l'API n'a rien à permuter : erreur.
 *
 * **Demande permutée.** La demande de charge d'origine (`charge-juge.ts:DemandeCharge`), avec la
 * réponse contrefactuelle, le texte de la question permuté, et chaque item de référence dont
 * `candidat_id` devient celui de son image s'il est interrogé, et reste inchangé sinon (D55 (4) : un
 * candidat non interrogé n'a pas d'image) ; la position, la paraphrase et la citation de chaque état
 * positionnel sont permutées de même. La quantification d'un état est recopiée sans changement :
 * c'est un montant, un taux, une date ou un périmètre, pas un nom. L'identifiant, la version et
 * l'empreinte de l'item restent ceux de l'item d'origine : la charge renvoie à l'item réellement
 * noté, dont seuls les noms ont été permutés pour le juge. La charge se construit ensuite par
 * `construireCharge`, inchangée ; l'extrait justificatif de la notation permutée se contrôle contre
 * les textes permutés (`textes`).
 *
 * **Charge v3 (D27).** Le registre et la prémisse de la formulation sont recopiés. La liste attendue
 * d'une Q-ATT (`resolu_au_gel.reponse_attendue.candidats_attendus`) suit les items : chaque
 * identifiant devient celui de son image (toujours un candidat interrogé, par construction de
 * l'annexe B). Le texte des pages citées (`pages_citees`) n'est PAS permuté : le §7 ne permute les
 * noms que « dans la réponse et dans l'item de référence », et une page conservée est une copie
 * publiée, pas un texte du projet. Le juge voit donc, côté permuté, une réponse qui nomme l'image et
 * une page qui nomme la source : trou du protocole signalé à l'auteur (lot charge-juge-v3), aucune
 * règle n'est inventée ici.
 */

import type { ObjetJson, ReponseEcrite, ReponseObtenue } from "../interrogation/types.ts";
import type { EtatPositionnel, Item } from "../../validation/domaine/types.ts";
import type { DemandeCharge, ReferenceSoumise, ResoluAuGel } from "./charge-juge.ts";
import { correspondancesDe, type Derangement } from "./derangement.ts";
import { comparerChaines } from "./echantillons.ts";
import { citationsDeReference, type TextesDeVerification } from "./extrait.ts";
import { permuterTexte } from "./permutation.ts";

/** `Omit` appliqué à chaque membre de l'union (brut objet ou brut texte), qui reste discriminée. */
type SansContexte<T> = T extends unknown ? Omit<T, "contexte"> : never;

/** Une réponse permutée, conforme à `schema/reponse.schema.json` (contexte `contrefactuel_candidat`). */
export type ReponseContrefactuelle = SansContexte<ReponseObtenue> & {
  readonly contexte: "contrefactuel_candidat";
  readonly derive_de_reponse_id: string;
  readonly permutation: {
    readonly type: "noms_candidats";
    readonly correspondances: Readonly<Record<string, string>>;
  };
};

export interface ReponsePermutee {
  readonly reponse: ReponseContrefactuelle;
  /** Somme des mentions résiduelles du texte et des citations (`permutation.ts`). */
  readonly mentions_residuelles: number;
}

export interface DemandePermutee {
  readonly demande: DemandeCharge;
  readonly reponse: ReponseContrefactuelle;
  /** Les textes contre lesquels l'extrait de la notation permutée est contrôlé. */
  readonly textes: TextesDeVerification;
  /** Réponse, citations, question et états des items. */
  readonly mentions_residuelles: number;
}

/** Compteur des mentions résiduelles d'une suite de textes permutés. */
interface Compteur {
  mentions: number;
}

export function reponseContrefactuelle(reponse: ReponseEcrite | ReponseContrefactuelle, nouvel_id: string, derangement: Derangement): ReponsePermutee {
  const obtenue = permutable(reponse);
  const compteur: Compteur = { mentions: 0 };
  const permuter = (texte: string): string => permuterCompte(texte, derangement, compteur);
  const { contexte: _origine, ...sansContexte } = obtenue;
  const contrefactuelle: ReponseContrefactuelle = {
    ...sansContexte,
    id: nouvel_id,
    contexte: "contrefactuel_candidat",
    derive_de_reponse_id: obtenue.id,
    permutation: { type: "noms_candidats", correspondances: correspondancesDe(derangement) },
    normalise: {
      ...obtenue.normalise,
      texte: permuter(obtenue.normalise.texte),
      ...(obtenue.normalise.citations === undefined ? {} : { citations: obtenue.normalise.citations.map((c) => citationPermutee(c, permuter)) }),
    },
  };
  return { reponse: contrefactuelle, mentions_residuelles: compteur.mentions };
}

export function demandePermutee(demande: DemandeCharge, nouvel_id: string, derangement: Derangement): DemandePermutee {
  const { reponse, mentions_residuelles } = reponseContrefactuelle(demande.reponse, nouvel_id, derangement);
  const compteur: Compteur = { mentions: mentions_residuelles };
  const permuter = (texte: string): string => permuterCompte(texte, derangement, compteur);
  const references = demande.references.map((reference) => referencePermutee(reference, derangement, permuter));
  const permutee: DemandeCharge = {
    ...demande,
    reponse,
    question: { gabarit: demande.question.gabarit, registre: demande.question.registre, texte: permuter(demande.question.texte) },
    references,
    resolu_au_gel: resoluPermute(demande.resolu_au_gel, derangement),
  };
  return {
    demande: permutee,
    reponse,
    textes: { reponse: reponse.normalise.texte, citations_reference: citationsDeReference(references.map((r) => r.item)) },
    mentions_residuelles: compteur.mentions,
  };
}

/** Seule une réponse obtenue du run, qui n'est pas un refus de l'API, porte un texte à permuter. */
function permutable(reponse: ReponseEcrite | ReponseContrefactuelle): ReponseObtenue {
  if (reponse.statut_reponse !== "obtenue") {
    throw new Error(`Réponse ${reponse.id} manquante : elle n'a pas de texte, rien à permuter (§6, §7).`);
  }
  if (reponse.contexte !== "run") {
    throw new Error(`Réponse ${reponse.id} de contexte ${reponse.contexte} : seule une réponse du run se permute.`);
  }
  if (reponse.normalise.refus_api) {
    throw new Error(`Réponse ${reponse.id} : refus de l'API, sans texte ni lien (décision du 2026-10-02) ; rien à permuter.`);
  }
  return reponse;
}

function permuterCompte(texte: string, derangement: Derangement, compteur: Compteur): string {
  const sortie = permuterTexte(texte, derangement);
  compteur.mentions += sortie.mentions_residuelles;
  return sortie.texte;
}

/** La clé `texte`, si c'est une chaîne ; toute autre clé, et une citation sans texte, à l'identique. */
function citationPermutee(citation: ObjetJson, permuter: (texte: string) => string): ObjetJson {
  const texte = citation["texte"];
  return typeof texte === "string" ? { ...citation, texte: permuter(texte) } : citation;
}

function referencePermutee(reference: ReferenceSoumise, derangement: Derangement, permuter: (texte: string) => string): ReferenceSoumise {
  const { item } = reference;
  const permute: Item = {
    ...item,
    candidat_id: imageDeItem(item.candidat_id, derangement, item.id),
    ...(item.assertion === undefined ? {} : { assertion: etatPermute(item.assertion, permuter) }),
    ...(item.obsolescence === undefined
      ? {}
      : {
          obsolescence: {
            ...item.obsolescence,
            etat_anterieur: etatPermute(item.obsolescence.etat_anterieur, permuter),
            etat_posterieur: etatPermute(item.obsolescence.etat_posterieur, permuter),
          },
        }),
  };
  return { item: permute, role: reference.role };
}

/** Position, paraphrase et citation permutées ; la quantification et la source, recopiées sans changement. */
function etatPermute(etat: EtatPositionnel, permuter: (texte: string) => string): EtatPositionnel {
  return {
    ...etat,
    position: permuter(etat.position),
    paraphrase: permuter(etat.paraphrase),
    citation_verbatim: permuter(etat.citation_verbatim),
  };
}

/**
 * D27 (G) : la liste attendue d'une Q-ATT désigne des candidats interrogés (annexe B) ; elle suit
 * leurs items, dont le `candidat_id` devient celui de leur image. Triée comme le tirage la trie. La
 * prémisse, la nature et les dates ne nomment personne : recopiées. Un candidat non interrogé n'a
 * rien à y faire (annexe B) : lève plutôt que de le recopier (D55 (4)).
 */
function resoluPermute(resolu: ResoluAuGel, derangement: Derangement): ResoluAuGel {
  const candidats = resolu.reponse_attendue.candidats_attendus;
  if (candidats === undefined) return resolu;
  const images = candidats.map((candidat_id) => imageDeAttendu(candidat_id, derangement)).sort(comparerChaines);
  return { ...resolu, reponse_attendue: { ...resolu.reponse_attendue, candidats_attendus: images } };
}

/**
 * D55 (4) : un candidat au périmètre mais non interrogé n'a pas d'image, son identifiant est
 * inchangé (`derangement.hors_derangement`) ; un candidat hors périmètre lève, comme avant D55 (4).
 */
function imageDeItem(candidat_id: string, derangement: Derangement, item_id: string): string {
  const paire = derangement.paires.find((p) => p.source.candidat_id === candidat_id);
  if (paire !== undefined) return paire.image.candidat_id;
  if (derangement.hors_derangement.includes(candidat_id)) return candidat_id;
  throw new Error(`Item ${item_id} : le candidat ${candidat_id} n'est pas un candidat du périmètre du run.`);
}

/** D55 (4), annexe B : la liste attendue ne désigne que des candidats interrogés ; aucun autre n'y a d'image. */
function imageDeAttendu(candidat_id: string, derangement: Derangement): string {
  const paire = derangement.paires.find((p) => p.source.candidat_id === candidat_id);
  if (paire !== undefined) return paire.image.candidat_id;
  throw new Error(`La liste attendue : le candidat ${candidat_id} n'est pas un candidat interrogé du dérangement du run (annexe B).`);
}
