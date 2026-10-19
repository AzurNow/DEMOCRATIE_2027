/**
 * L'éditeur appelé pour extraire (décision D52 (1)) : un adaptateur et un transport injectables, sur
 * le modèle de `pipeline/reformulation/editeur.ts`, dont le transport (`Transport`), la requête
 * (`RequeteHttp`), la lecture du corps (`lireContenu`) et la lecture du texte du modèle
 * (`LectureTexteModele`) sont repris par import.
 *
 * Ce qui distingue un éditeur d'un autre — adresse, en-têtes, forme du corps envoyé, enveloppe qui
 * porte le texte du modèle — vit dans son adaptateur (`editeur-anthropic.ts`, `editeur-mistral.ts`).
 * Le choix d'un adaptateur se fait par une table (`configuration-editeurs.ts:FABRIQUES`), jamais par
 * un `if` sur un éditeur ou un modèle.
 *
 * Le texte rendu par `texteDuModele` est exactement la chaîne de l'enveloppe (règle 7) : aucun bloc
 * Markdown ni aucune espace n'en est retiré. Sa validation comme sortie d'extraction appartient au
 * cœur (`lecture-sortie.ts:lireSortie`), jamais à l'adaptateur.
 *
 * `modeleServiPar` (`modeleDuCorps`, la même lecture chez les deux éditeurs) dit quel `model`
 * l'enveloppe rapporte avoir servi ; `executer.ts` le compare à l'épinglé avant de lire le texte.
 */

import { lireContenu, type Contenu, type ReponseHttp, type RequeteHttp, type Transport } from "../interrogation/editeur.ts";
import type { LectureTexteModele } from "../reformulation/editeur.ts";

export type { LectureTexteModele } from "../reformulation/editeur.ts";

/** Les éditeurs dont un adaptateur existe ; `config/extraction.json` n'en admet pas d'autre. */
export const EDITEURS = ["anthropic", "mistral"] as const;
export type NomEditeur = (typeof EDITEURS)[number];

export interface AdaptateurExtraction {
  /** Identifiant du modèle appelé, tel que la configuration l'épingle : la donnée mesurée (D52). */
  readonly modele: string;
  /** La requête prête à partir, authentification comprise : elle n'est jamais enregistrée telle quelle. */
  construireRequete(prompt: string): RequeteHttp;
  /** Le texte du modèle dans le corps d'une réponse 2xx, sans rien en retirer ni y ajouter. */
  texteDuModele(contenu: Contenu): LectureTexteModele;
  /**
   * Le `model` que l'enveloppe de la réponse dit avoir servi, tel quel ; `null` si le corps ne
   * permet pas de le lire (corps non JSON, champ absent). `executer.ts` le compare à `modele`
   * (constat 17 de la revue du 2026-10-17, D54 (7)) : une réponse d'un autre modèle est refusée
   * comme une sortie illisible, jamais notée comme si elle venait du modèle épinglé.
   */
  modeleServiPar(contenu: Contenu): string | null;
}

/** Le `model` d'une enveloppe JSON, tel quel : la même clé chez Anthropic et chez Mistral. */
export function modeleDuCorps(contenu: Contenu): string | null {
  if (contenu.forme !== "objet") return null;
  const valeur = contenu.brut["model"];
  return typeof valeur === "string" ? valeur : null;
}

export interface EditeurExtraction {
  readonly adaptateur: AdaptateurExtraction;
  readonly transport: Transport;
}

/** Un appel : la réponse brute telle que reçue, son contenu stockable, et ce qu'on a pu y lire. */
export interface AppelExtracteur {
  /** Statut et octets du corps, tels que reçus : la réponse brute (règle 7). */
  readonly reponse: ReponseHttp;
  /** Le corps lu sans transformation : objet JSON (`brut`) ou texte UTF-8 exact (`brut_texte`). */
  readonly contenu: Contenu;
  /** Le texte du modèle, ou la raison pour laquelle la réponse n'en donne pas. */
  readonly lecture: LectureTexteModele;
}

function estSucces(statut: number): boolean {
  return statut >= 200 && statut < 300;
}

/**
 * Ce qu'une réponse permet de lire : le texte du modèle d'une réponse 2xx, ou la raison qui l'en
 * empêche. Exporté pour `pnpm extraire`, qui relit ainsi une réponse gardée sur le disque comme une
 * réponse fraîche (`executer.ts`).
 */
export function lectureDe(adaptateur: AdaptateurExtraction, statut: number, contenu: Contenu): LectureTexteModele {
  if (!estSucces(statut)) return { lisible: false, raison: `réponse HTTP ${statut} : aucun texte du modèle n'est lu hors 2xx.` };
  return adaptateur.texteDuModele(contenu);
}

/**
 * Un appel à un extracteur, pur et sans disque : envoie le prompt rendu, lit le corps reçu.
 *
 * Aucune reprise, aucun délai d'abandon appliqué ici : le `signal` vient de l'appelant. Un échec de
 * transport rejette `ErreurReseau` (transport) ; un corps qui n'est pas de l'UTF-8 valide lève
 * `CorpsNonUtf8` (`lireContenu`). Ni l'un ni l'autre n'est converti en lecture illisible : ils ne
 * portent aucune réponse à garder.
 */
export async function appelerExtracteur(editeur: EditeurExtraction, prompt: string, signal: AbortSignal): Promise<AppelExtracteur> {
  const reponse = await editeur.transport.envoyer(editeur.adaptateur.construireRequete(prompt), signal);
  const contenu = lireContenu(reponse);
  return { reponse, contenu, lecture: lectureDe(editeur.adaptateur, reponse.statut, contenu) };
}
