/**
 * Le rendu de `docs/APPELS-NOTATION.md` : les appels réseau des juges réels (§7), sur le modèle de
 * `docs/APPELS-INTERROGATION.md` (§9, « Reproductibilité »). Le protocole publie les prompts et les
 * réponses brutes pour que « n'importe qui peut renoter avec le juge de son choix » (§7, « Conflit
 * d'intérêts ») : ce document dit exactement quels appels la notation fait.
 *
 * Rien n'y est recopié à la main : chaque requête est **construite par l'adaptateur lui-même**
 * (`construireRequete`), avec une clé fictive, un modèle, un prompt et des réglages en marque-place ;
 * les statuts de charge trop longue et les motifs viennent du code. Un adaptateur qui change sa
 * requête change le document ; `tests/appels-notation.test.ts` échoue tant que le fichier n'est pas
 * réengendré, et tant qu'un fichier `pipeline/notation/juge-*.ts` réel n'y est pas documenté.
 *
 * Pur : aucune lecture, aucune écriture, aucun appel réseau. `outils/appels-notation.ts` écrit.
 */

import { MOTIFS_RENVOI_DEFAILLANCE } from "../../analysis/types-notation.ts";
import { STATUTS_ACCES_REFUSE, type AdaptateurJuge } from "../../pipeline/notation/appel-juge.ts";
import { adaptateurJugeAnthropic, type ReglagesJugeAnthropic } from "../../pipeline/notation/juge-anthropic.ts";
import { adaptateurJugeMistral, type ReglagesJugeMistral } from "../../pipeline/notation/juge-mistral.ts";
import { VARIABLES_CLES } from "../../pipeline/extraction/commande.ts";
import type { NomEditeur } from "../../pipeline/extraction/editeur.ts";

/** La clé mise à la place de celle de l'éditeur : jamais une vraie clé dans un fichier publié (§9). */
export const CLE_FICTIVE_JUGE = "<CLE_API_DE_L_EDITEUR>";
const MODELE_FICTIF = "<modele de run.json#/juges[]>";
const PROMPT_FICTIF = "<texte du prompt de prompts/judge-*.md, variables remplacées par la charge>";

/** Un réglage en marque-place : le nom de la clé, entre chevrons ; jamais une valeur supposée. */
function marquePlace(cles: readonly string[]): Readonly<Record<string, string>> {
  return Object.fromEntries(cles.map((cle) => [cle, `<${cle} : valeur déclarée>`]));
}

export interface AdaptateurJugeDocumente {
  /** Le nom du fichier sous `pipeline/notation/`, sans `.ts`. */
  readonly nom: string;
  readonly editeur: NomEditeur;
  readonly fabrique: (cle_api: string) => AdaptateurJuge;
}

/**
 * Les adaptateurs de juge réels du code. Un adaptateur s'ajoute ici le jour où il est écrit : c'est
 * ce qui le fait entrer dans le document. Les réglages sont des marque-places, passés tels quels.
 */
export const ADAPTATEURS_JUGES_DOCUMENTES: readonly AdaptateurJugeDocumente[] = [
  {
    nom: "juge-anthropic",
    editeur: "anthropic",
    fabrique: (cle) => adaptateurJugeAnthropic(MODELE_FICTIF, marquePlace(["max_tokens", "effort", "delai_abandon_ms"]) as unknown as ReglagesJugeAnthropic, cle),
  },
  {
    nom: "juge-mistral",
    editeur: "mistral",
    fabrique: (cle) => adaptateurJugeMistral(MODELE_FICTIF, marquePlace(["temperature", "max_tokens", "random_seed", "delai_abandon_ms"]) as unknown as ReglagesJugeMistral, cle),
  },
];

function blocJson(valeur: unknown): string {
  return ["```json", JSON.stringify(valeur, null, 2), "```"].join("\n");
}

function sectionAdaptateur(documente: AdaptateurJugeDocumente): string {
  const adaptateur = documente.fabrique(CLE_FICTIVE_JUGE);
  const requete = adaptateur.construireRequete(PROMPT_FICTIF);
  const statuts = adaptateur.statuts_contexte_depasse;
  return [
    `### \`${documente.nom}\` (éditeur \`${documente.editeur}\`, clé \`${VARIABLES_CLES[documente.editeur]}\`)`,
    "",
    `Point d'accès : \`${requete.endpoint}\``,
    "",
    "En-têtes envoyés :",
    "",
    blocJson(requete.entetes),
    "",
    "Corps :",
    "",
    blocJson(requete.corps),
    "",
    `Statuts lus comme une charge trop longue (\`contexte_depasse\`) : ${statuts.length === 0 ? "aucun" : statuts.map((s) => `\`${s}\``).join(", ")}.`,
    "",
  ].join("\n");
}

function lecture(): string {
  return [
    "## Lecture d'une réponse (`pipeline/notation/appel-juge.ts`)",
    "",
    "Une réponse qu'un juge ne peut pas noter est renvoyée à un humain (§7), sous l'un des motifs " +
      `${MOTIFS_RENVOI_DEFAILLANCE.map((m) => `\`${m}\``).join(", ")}, et la notation du run continue.`,
    "",
    "| Ce qui arrive | Motif |",
    "| --- | --- |",
    "| échec passager à chaque tentative (réseau, délai d'abandon, 408, 429, 5xx) | `erreur_api_persistante` |",
    "| statut que l'adaptateur déclare de charge trop longue | `contexte_depasse` |",
    "| tout autre statut hors 2xx, sauf 401 et 403 | `erreur_api_persistante` |",
    "| refus de modération du fournisseur, dit par l'enveloppe | `sortie_refusee` |",
    "| corps non UTF-8 ; `model` absent ou différent de `run.json#/juges[].modele` ; enveloppe inattendue ; sortie coupée ; texte non JSON ; sortie hors format | `sortie_illisible` |",
    "",
    `Statuts ${STATUTS_ACCES_REFUSE.map((s) => `\`${s}\``).join(", ")} (clé invalide, accès refusé) : défaut du banc, pas du juge. La notation s'arrête au premier rencontré (\`AccesApiRefuse\`), sans écrire de renvoi pour la réponse en cours ; une relance après correction reprend sans rien réécrire.`,
    "",
    "Le texte du modèle doit être un seul objet JSON de la forme que lit `pipeline/notation/juge.ts` ; rien n'est réparé ni complété.",
    "",
  ].join("\n");
}

function archive(): string {
  return [
    "## Réponses brutes gardées (`pipeline/notation/archive-appels-juge.ts`)",
    "",
    "§7, décision D100 : la réponse HTTP brute de chaque appel de juge est stockée telle quelle et publiée dans le volume du run, comme les réponses brutes de l'interrogation (règle 7). Chaque tentative laisse, sous `runs/<date>/volume/appels-juges/`, dès son issue et avant toute lecture du statut ou du corps :",
    "",
    "- `<empreinte>.<appel>.<tentative>.json` (`schema/appel-juge.schema.json`) : juge, objet noté (`reponse_id`), modèle épinglé, versions du prompt et de la charge, rang de l'appel et de la tentative, point d'accès, empreinte canonique du corps envoyé, instants de départ et de fin ; puis le statut HTTP, l'empreinte et la taille des octets reçus, ou la raison d'un échec de transport (réseau, délai d'abandon) ;",
    "- `<empreinte>.<appel>.<tentative>.octets` : les octets du corps, tels que reçus, pour toute réponse HTTP, quel que soit son statut.",
    "",
    "`<empreinte>` est le SHA-256 de la forme canonique de `{juge_id, reponse_id}`. Réponses en erreur (401, 403, 429, 5xx…) et tentatives rejouées comprises ; une relance après un arrêt prend le numéro d'appel suivant, sans rien réécrire. Chaque fichier est écrit une fois et jamais remplacé : une archive qui ne peut pas s'écrire arrête la notation. Ni la requête ni ses en-têtes (la clé) ne sont gardés, ni les en-têtes de la réponse, que le transport ne rend pas.",
    "",
  ].join("\n");
}

function reglages(): string {
  return [
    "## Réglages et tentatives",
    "",
    "Le modèle est celui que déclare `run.json#/juges[].modele`, recopié du gel. Les réglages d'échantillonnage (§7 : « fixés et publiés »), le délai d'abandon et la politique de tentatives ne sont encore déclarés nulle part (exigence §7.57) : ils figurent ci-dessous en marque-place, et `pnpm notation:reelle` refuse de partir tant qu'ils ne le sont pas.",
    "",
  ].join("\n");
}

export function genererAppelsNotation(): string {
  const entete = [
    "# Appels de la notation",
    "",
    "<!-- Fichier engendré par `pnpm appels-notation` depuis le code de `pipeline/notation/`. Ne pas éditer à la main. -->",
    "",
    "§7 du protocole : deux juges automatiques notent chaque réponse obtenue ; leurs prompts et les réponses brutes sont publics, pour que n'importe qui puisse renoter. Ce document dit exactement quels appels font les juges réels. Il est engendré depuis le code, et `tests/appels-notation.test.ts` échoue s'il n'est pas à jour.",
    "",
  ].join("\n");
  const appels = [
    "## Appels, par adaptateur",
    "",
    `Requêtes construites par l'adaptateur lui-même, avec \`${CLE_FICTIVE_JUGE}\` à la place de la clé, \`${MODELE_FICTIF}\` à la place du modèle et \`${PROMPT_FICTIF}\` à la place du prompt rendu. Le prompt rendu est le seul message, sans instruction système.`,
    "",
    ...ADAPTATEURS_JUGES_DOCUMENTES.map(sectionAdaptateur),
  ].join("\n");
  return `${[entete, reglages(), lecture(), archive(), appels].join("\n").trimEnd()}\n`;
}
