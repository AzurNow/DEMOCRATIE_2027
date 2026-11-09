/**
 * Un juge réel (§7) : le port `juge.ts:Juge` adossé à l'API d'un éditeur, par un adaptateur
 * (`juge-anthropic.ts`, `juge-mistral.ts`) et un transport injectés. Aucun SDK, aucune dépendance :
 * le transport est celui des appels réels du dépôt (`pipeline/reformulation/transport-fetch.ts`), le
 * délai d'abandon celui de l'extraction (`pipeline/extraction/delai.ts`). Les tests n'injectent que
 * des doubles de transport : aucun ne touche le réseau.
 *
 * **Ce que fait `noter`.**
 * 1. Le prompt est rendu depuis le fichier versionné de `prompts/` (règle 6), par
 *    `rendu-prompt-juge.ts:rendrePromptJuge`, sur la charge seule : rien d'autre que la charge
 *    aveuglée n'entre dans le texte envoyé. Un refus de rendu (`RenduPromptJugeRefuse`) n'est pas une
 *    défaillance du juge mais un défaut du banc (prompt et code désaccordés) : il remonte et arrête la
 *    notation, avant tout appel.
 * 2. L'appel part, sous le délai d'abandon des réglages ; un échec passager (rejet du transport,
 *    délai dépassé, statut 408, 429 ou 5xx : `extraction/editeur.ts:estEchecTransportHttp`) est
 *    retenté selon la politique de tentatives déclarée, jamais au-delà.
 * 3. La réponse est lue : statut, corps, `model` servi, refus du fournisseur, enveloppe, texte du
 *    modèle, puis la sortie (`lecture-sortie-juge.ts`).
 *
 * **Juge défaillant, et rien d'autre (§7, D67 ; DETTE 2026-11-03, « Un adaptateur de juge réel doit
 * lever `JugeDefaillant`, et rien d'autre »).** Tout ce qui vient de l'API devient `JugeDefaillant`,
 * avec l'un des motifs de `MOTIFS_RENVOI_DEFAILLANCE` ; la chaîne en fait un renvoi humain motivé
 * (`juge.ts:noterOuRenvoyer`) et continue :
 *
 * | Ce qui arrive | Motif |
 * | --- | --- |
 * | échec passager à chaque tentative (réseau, délai, 408, 429, 5xx) | `erreur_api_persistante` |
 * | statut que l'adaptateur déclare de charge trop longue | `contexte_depasse` |
 * | tout autre statut hors 2xx (400, 404…) | `erreur_api_persistante` |
 * | refus de modération du fournisseur, dit par l'enveloppe | `sortie_refusee` |
 * | corps non UTF-8 ; `model` absent ou différent de l'épinglé ; enveloppe inattendue ; sortie coupée (longueur) ; texte non JSON ; sortie hors format | `sortie_illisible` |
 *
 * Le `model` absent est refusé (DETTE 2026-10-17, « Une réponse 2xx sans champ `model` échappe au
 * contrôle de l'épinglage ») : sans lui, rien n'atteste que la note vient du modèle épinglé, qui est
 * la donnée publiée (`notateur.modele`).
 *
 * **Exception : 401 et 403** (`STATUTS_ACCES_REFUSE`) lèvent `AccesApiRefuse`, défaut du banc qui
 * arrête la notation : une clé invalide n'écrit pas un renvoi définitif par réponse du run.
 *
 * Une erreur qui ne vient pas de l'API — refus de rendu, bogue — n'est pas convertie : elle remonte
 * (`juge.ts` : « Toute autre erreur est un défaut du banc »). Le message d'un `JugeDefaillant` ne
 * reprend ni la requête ni ses en-têtes : la clé n'y figure jamais.
 */

import { CorpsNonUtf8, ErreurReseau, estObjetJson, lireContenu, lireJson, texteIndicatif, type Contenu, type ReponseHttp, type RequeteHttp, type Transport } from "../interrogation/editeur.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import type { MotifRenvoiDefaillance } from "../../analysis/types-notation.ts";
import { transportSousDelai } from "../extraction/delai.ts";
import { estEchecTransportHttp, type AdaptateurExtraction } from "../extraction/editeur.ts";
import type { ChargeJuge } from "./charge-juge.ts";
import { JugeDefaillant, type IdentiteJuge, type Juge, type SortieJuge } from "./juge.ts";
import { lireSortieJuge } from "./lecture-sortie-juge.ts";
import { rendrePromptJuge } from "./rendu-prompt-juge.ts";

/**
 * Ce qu'un juge réel demande à l'adaptateur de son éditeur : la requête, l'enveloppe et le `model`
 * servi (repris de l'extraction, `AdaptateurExtraction`), plus ce qui est propre à la notation.
 */
export interface AdaptateurJuge extends AdaptateurExtraction {
  /** Vrai si l'enveloppe d'une réponse 2xx dit un refus de modération du fournisseur. */
  estRefus(contenu: Contenu): boolean;
  /** Les statuts HTTP que l'éditeur documente comme « charge trop longue » (`contexte_depasse`). */
  readonly statuts_contexte_depasse: readonly number[];
}

/**
 * Combien de fois un appel est tenté, et combien de temps attendre avant chaque reprise. Aucune
 * valeur par défaut : le protocole n'en fixe aucune (voir le rapport du lot, trou du §7), elle est
 * déclarée avec les réglages du juge.
 */
export interface PolitiqueTentatives {
  /** Entier >= 1. */
  readonly tentatives_max: number;
  /** Une attente par reprise : exactement `tentatives_max - 1` valeurs, en millisecondes. */
  readonly attentes_avant_reprise_ms: readonly number[];
}

export interface DeclarationJugeReel {
  /** Ce que `run.json#/juges` déclare du juge ; `identite.modele` est le modèle épinglé. */
  readonly identite: IdentiteJuge;
  /** Le contenu du fichier de `prompts/` que désigne `identite.prompt`, tel quel. */
  readonly source_prompt: string;
  readonly adaptateur: AdaptateurJuge;
  /** Le transport brut ; le délai d'abandon est posé ici. */
  readonly transport: Transport;
  readonly politique: PolitiqueTentatives;
  /** Délai au-delà duquel une tentative sans réponse est abandonnée (`delai_abandon_ms` des réglages) ; jamais envoyé. */
  readonly delai_abandon_ms: number;
  readonly attendre: Horloge["attendre"];
}

export class PolitiqueTentativesInvalide extends Error {
  constructor(juge_id: string, detail: string) {
    super(`Juge ${juge_id} : politique de tentatives invalide (${detail}). Aucun appel n'est construit.`);
    this.name = "PolitiqueTentativesInvalide";
  }
}

export class AdaptateurDeJugeDiscordant extends Error {
  constructor(juge_id: string, modele_adaptateur: string, modele_declare: string) {
    super(`Juge ${juge_id} : l'adaptateur appelle ${JSON.stringify(modele_adaptateur)}, le run déclare ${JSON.stringify(modele_declare)}. Aucun appel n'est construit.`);
    this.name = "AdaptateurDeJugeDiscordant";
  }
}

/**
 * 401, 403 : la clé est invalide ou l'accès est refusé. C'est un défaut du banc, pas du juge
 * (décision du coordinateur du 2026-11-09, question Q2 du lot) : ce n'est pas un `JugeDefaillant`,
 * `noterOuRenvoyer` le laisse remonter et la chaîne s'arrête au premier rencontré, sans écrire de
 * renvoi pour la réponse en cours. Ce qui est déjà écrit le reste ; une relance après correction
 * reprend sans rien réécrire.
 */
export const STATUTS_ACCES_REFUSE: readonly number[] = [401, 403];

export class AccesApiRefuse extends Error {
  readonly statut: number;

  constructor(juge_id: string, statut: number, detail: string) {
    super(`Juge ${juge_id} : accès à l'API refusé (HTTP ${statut} : ${detail}). Clé ou droits d'accès à corriger ; la notation s'arrête, aucun renvoi n'est écrit pour cette réponse.`);
    this.name = "AccesApiRefuse";
    this.statut = statut;
  }
}

function estEntierPositif(valeur: number): boolean {
  return Number.isSafeInteger(valeur) && valeur >= 1;
}

function exigerPolitique(juge_id: string, politique: PolitiqueTentatives, delai_abandon_ms: number): void {
  if (!estEntierPositif(politique.tentatives_max)) throw new PolitiqueTentativesInvalide(juge_id, `tentatives_max ${politique.tentatives_max} : un entier >= 1 est attendu`);
  if (!estEntierPositif(delai_abandon_ms)) throw new PolitiqueTentativesInvalide(juge_id, `delai_abandon_ms ${delai_abandon_ms} : un entier >= 1 est attendu`);
  const attentes = politique.attentes_avant_reprise_ms;
  if (attentes.length !== politique.tentatives_max - 1) {
    throw new PolitiqueTentativesInvalide(juge_id, `${attentes.length} attente(s) pour ${politique.tentatives_max} tentative(s) : exactement une par reprise`);
  }
  if (!attentes.every((ms) => Number.isSafeInteger(ms) && ms >= 0)) throw new PolitiqueTentativesInvalide(juge_id, "attentes non entières ou négatives");
}

/** Le juge réel : il implémente le port `Juge`, et ne lève vers la chaîne que `JugeDefaillant`. */
export function jugeReel(declaration: DeclarationJugeReel): Juge {
  const { identite, adaptateur, politique } = declaration;
  exigerPolitique(identite.juge_id, politique, declaration.delai_abandon_ms);
  if (adaptateur.modele !== identite.modele) throw new AdaptateurDeJugeDiscordant(identite.juge_id, adaptateur.modele, identite.modele);
  const transport = transportSousDelai(declaration.transport, declaration.delai_abandon_ms, declaration.attendre);
  return {
    identite,
    noter: async (charge: ChargeJuge): Promise<SortieJuge> => {
      const prompt = rendrePromptJuge(declaration.source_prompt, charge);
      const reponse = await envoyerAvecTentatives(declaration, transport, adaptateur.construireRequete(prompt));
      return sortieDe(identite.juge_id, adaptateur, reponse);
    },
  };
}

/* ------------------------------------------------------------------ appel */

type Tentative = { readonly genre: "reponse"; readonly reponse: ReponseHttp } | { readonly genre: "passager"; readonly raison: string };

async function tenter(transport: Transport, requete: RequeteHttp): Promise<Tentative> {
  try {
    const reponse = await transport.envoyer(requete, new AbortController().signal);
    if (estEchecTransportHttp(reponse.statut)) return { genre: "passager", raison: `réponse HTTP ${reponse.statut} (${resumeDuCorps(reponse)})` };
    return { genre: "reponse", reponse };
  } catch (erreur) {
    if (erreur instanceof ErreurReseau) return { genre: "passager", raison: erreur.message };
    throw erreur;
  }
}

/** Tente jusqu'à `tentatives_max` fois ; un échec passager à chaque fois est une erreur persistante de l'API (§7). */
async function envoyerAvecTentatives(declaration: DeclarationJugeReel, transport: Transport, requete: RequeteHttp): Promise<ReponseHttp> {
  const { politique, identite } = declaration;
  const echecs: string[] = [];
  for (let rang = 0; rang < politique.tentatives_max; rang += 1) {
    if (rang > 0) await declaration.attendre(politique.attentes_avant_reprise_ms[rang - 1] as number, new AbortController().signal);
    const tentative = await tenter(transport, requete);
    if (tentative.genre === "reponse") return tentative.reponse;
    echecs.push(`tentative ${rang + 1} : ${tentative.raison}`);
  }
  throw new JugeDefaillant(identite.juge_id, "erreur_api_persistante", `échec passager à chacune des ${politique.tentatives_max} tentative(s) — ${echecs.join(" ; ")}`);
}

/* ------------------------------------------------------------------ lecture */

/** Le message d'erreur que porte un corps JSON (`error.message` ou `message`), sinon sa longueur : jamais une valeur inventée. */
function resumeDuCorps(reponse: ReponseHttp): string {
  const lu = lireJson(texteIndicatif(reponse));
  const message = lu.lisible ? messageDe(lu.valeur) : null;
  return message === null ? `corps de ${reponse.corps.length} octet(s)` : `message de l'API : ${JSON.stringify(message)}`;
}

function messageDe(valeur: unknown): string | null {
  if (!estObjetJson(valeur)) return null;
  const erreur = valeur["error"];
  const imbrique = estObjetJson(erreur) ? erreur["message"] : undefined;
  if (typeof imbrique === "string") return imbrique;
  const direct = valeur["message"];
  return typeof direct === "string" ? direct : null;
}

function defaillant(juge_id: string, motif: MotifRenvoiDefaillance, detail: string): JugeDefaillant {
  return new JugeDefaillant(juge_id, motif, detail);
}

function exigerSucces(juge_id: string, adaptateur: AdaptateurJuge, reponse: ReponseHttp): void {
  if (reponse.statut >= 200 && reponse.statut < 300) return;
  if (STATUTS_ACCES_REFUSE.includes(reponse.statut)) throw new AccesApiRefuse(juge_id, reponse.statut, resumeDuCorps(reponse));
  const motif = adaptateur.statuts_contexte_depasse.includes(reponse.statut) ? "contexte_depasse" : "erreur_api_persistante";
  throw defaillant(juge_id, motif, `réponse HTTP ${reponse.statut} de ${adaptateur.modele}, non reprise (${resumeDuCorps(reponse)}).`);
}

function contenuDe(juge_id: string, reponse: ReponseHttp): Contenu {
  try {
    return lireContenu(reponse);
  } catch (erreur) {
    if (erreur instanceof CorpsNonUtf8) throw defaillant(juge_id, "sortie_illisible", erreur.message);
    throw erreur;
  }
}

/** Le `model` servi doit être lisible et égal à l'épinglé : sinon la note ne serait pas celle du juge déclaré. */
function exigerModeleEpingle(juge_id: string, adaptateur: AdaptateurJuge, contenu: Contenu): void {
  const servi = adaptateur.modeleServiPar(contenu);
  if (servi === null) throw defaillant(juge_id, "sortie_illisible", `réponse 2xx sans champ model lisible : rien n'atteste qu'elle vient de ${JSON.stringify(adaptateur.modele)}, le modèle épinglé.`);
  if (servi !== adaptateur.modele) throw defaillant(juge_id, "sortie_illisible", `model servi ${JSON.stringify(servi)}, épinglé ${JSON.stringify(adaptateur.modele)}.`);
}

function sortieDe(juge_id: string, adaptateur: AdaptateurJuge, reponse: ReponseHttp): SortieJuge {
  exigerSucces(juge_id, adaptateur, reponse);
  const contenu = contenuDe(juge_id, reponse);
  exigerModeleEpingle(juge_id, adaptateur, contenu);
  if (adaptateur.estRefus(contenu)) throw defaillant(juge_id, "sortie_refusee", "le fournisseur a refusé de produire la sortie (refus de modération dit par l'enveloppe).");
  const texte = adaptateur.texteDuModele(contenu);
  if (!texte.lisible) throw defaillant(juge_id, "sortie_illisible", texte.raison);
  const lecture = lireSortieJuge(texte.texte);
  if (!lecture.lisible) throw defaillant(juge_id, "sortie_illisible", lecture.raison);
  return lecture.sortie;
}
