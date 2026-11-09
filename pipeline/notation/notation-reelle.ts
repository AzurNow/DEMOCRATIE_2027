/**
 * `pnpm notation:reelle` — la chaîne de notation du §7 (`chaine.ts`) sur un run gelé et interrogé,
 * avec les juges réels (`juges-reels.ts`) et le fournisseur d'existences des fichiers du test des
 * liens (`fournisseur-fichiers.ts`). C'est la jumelle de `pnpm notation:dry` : même chaîne, même
 * bilan (`bilan-notation.ts`) ; seuls les juges et le fournisseur changent. Composée ici et
 * injectable : `outils/notation-reelle.ts` ne fait que lui passer l'environnement, `fetch`,
 * l'horloge système et la lecture du run.
 *
 *   ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm notation:reelle <runs/AAAA-MM-JJ> [--items=<data/items>]
 *
 * **Refus de partir**, avant toute lecture des réponses et tout appel (`RefusDePartir`) :
 * - aucun répertoire de run, ou plus d'un ;
 * - un run gelé par `pnpm geler --simule` (`simule: true`) : il se note avec `pnpm notation:dry --run`,
 *   jamais avec des appels payants ;
 * - une déclaration d'appel des juges absente (`declarationsDesJuges`, voir ci-dessous) ;
 * - la clé d'API d'un éditeur déclaré absente de l'environnement (`VARIABLES_CLES`).
 * Puis `juges-reels.ts` refuse une déclaration qui ne couvre pas exactement les juges de
 * `run.json#/juges`, un `version_prompt` illisible ou un prompt introuvable ; la chaîne refuse un run
 * invalidé, une réponse en attente de l'opérateur, des juges d'une même famille.
 *
 * **Juges.** Leur identité est celle du run gelé (`run.json#/juges`, recopiée de `config/gel.json`
 * par le gel), jamais une valeur du code. Leurs réglages d'appel ne sont écrits nulle part à ce jour
 * (trou du §7, exigence §7.57) : `declarationsDesJuges` les fournit ; `outils/notation-reelle.ts`
 * refuse tant que l'auteur n'a pas décidé où ils se déclarent et se publient.
 *
 * **Accès refusé.** Un 401 ou un 403 d'un juge (`appel-juge.ts:AccesApiRefuse`) arrête la notation
 * au premier rencontré, sans renvoi écrit pour la réponse en cours ; la relance après correction de
 * la clé reprend sans rien réécrire.
 *
 * **Arbre Git.** Comme `pnpm notation:dry`, la commande n'exige pas d'arbre propre : aucune notation
 * n'inscrit de commit.
 *
 * Codes de sortie (`outils/notation-reelle.ts`) : 0, la chaîne a tourné ; 2, refus de partir ou arrêt
 * sur une erreur nommée.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { lireRunJson, type RunLu } from "../../analysis/lecture-run.ts";
import type { Instant } from "../../analysis/types.ts";
import { analyserArguments, texte } from "../../outils/arguments.ts";
import { VARIABLES_CLES } from "../extraction/commande.ts";
import type { NomEditeur } from "../extraction/editeur.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import { RefusDePartir } from "../reformulation/commande.ts";
import { transportFetch, type Envoi } from "../reformulation/transport-fetch.ts";
import { estRunSimule } from "../run/simulation.ts";
import { bilanNotation, type BilanNotation } from "./bilan-notation.ts";
import { noterRun, type ReponseANoter, type ResultatChaine } from "./chaine.ts";
import type { FournisseurExistences } from "./fournisseur-existences.ts";
import { fournisseurFichiers, repertoireLiens } from "./fournisseur-fichiers.ts";
import { jugesReelsDuRun, type DeclarationAppelJuge, type JugeDeclareAuRun } from "./juges-reels.ts";

export const OPTIONS_NOTATION_REELLE: readonly string[] = ["items"];
export const USAGE_NOTATION_REELLE = "usage : ANTHROPIC_API_KEY=… MISTRAL_API_KEY=… pnpm notation:reelle <runs/AAAA-MM-JJ> [--items=<data/items>]";

export interface DependancesNotationReelle {
  readonly env: Readonly<Record<string, string | undefined>>;
  /** `fetch` en réel ; un double dans les tests, qui n'ouvre aucune socket. */
  readonly envoi: Envoi;
  readonly attendre: Horloge["attendre"];
  /** L'instant posé sur chaque notation et chaque verdict. */
  readonly maintenant: () => Instant;
  /** La racine du dépôt : `prompts/` et `data/items` par défaut. */
  readonly depot: string;
  /** Les réponses obtenues du run, préparées comme pour la notation humaine (`notation-humaine/serveur/chargement.ts`). */
  readonly chargerReponses: (repertoire_run: string, repertoire_items: string) => readonly ReponseANoter[];
  /**
   * L'éditeur, les réglages et la politique de tentatives de chaque juge du run. Le protocole ne les
   * écrit pas encore (§7.57) : en production, refus nommé ; aucune valeur n'est supposée.
   */
  readonly declarationsDesJuges: (run: RunLu) => readonly DeclarationAppelJuge[];
}

export interface NotationReelleFaite {
  readonly repertoire_run: string;
  readonly resultat: ResultatChaine;
  readonly bilan: BilanNotation;
}

/**
 * §7 : « Leurs réglages d'échantillonnage sont fixés et publiés. » Ni le protocole, ni `config/gel.json`,
 * ni `run.json#/juges[]` ne les portent à ce jour (exigence §7.57, « à implémenter ») ; la politique
 * de tentatives qui fait d'un échec une « erreur persistante de son API » n'est écrite nulle part non
 * plus. Tant que l'auteur n'a pas décidé où ils se déclarent, la commande réelle refuse de partir :
 * aucune valeur n'est supposée.
 */
export class ReglagesDesJugesNonDeclares extends RefusDePartir {
  constructor(run_id: string) {
    super(
      `Run ${run_id} : l'éditeur, les réglages d'échantillonnage (§7 : « fixés et publiés ») et la politique de tentatives de chaque juge ne sont déclarés nulle part (exigence §7.57). Aucune valeur n'est supposée : décision de l'auteur attendue (où les déclarer, comment les publier avec le run).`,
    );
    this.name = "ReglagesDesJugesNonDeclares";
  }
}

/** La source de production des déclarations d'appel, tant que §7.57 n'est pas tranché : un refus. */
export function declarationsNonDeclarees(run: Pick<RunLu, "id">): readonly DeclarationAppelJuge[] {
  throw new ReglagesDesJugesNonDeclares(run.id);
}

interface Demande {
  readonly repertoire_run: string;
  readonly repertoire_items: string;
}

function demandeDe(argv: readonly string[], depot: string): Demande {
  const options = analyserArguments(argv, OPTIONS_NOTATION_REELLE);
  const positionnels = argv.filter((argument) => !argument.startsWith("--"));
  const [repertoire_run] = positionnels;
  if (repertoire_run === undefined || positionnels.length > 1) throw new RefusDePartir(`un seul répertoire de run est attendu. ${USAGE_NOTATION_REELLE}`);
  return { repertoire_run: resolve(repertoire_run), repertoire_items: resolve(texte(options, "items", resolve(depot, "data", "items"))) };
}

/** La clé d'un éditeur, lue dans l'environnement ; absente ou vide : refus, jamais un appel sans clé. */
export function cleDansEnvironnement(env: DependancesNotationReelle["env"]): (editeur: NomEditeur) => string {
  return (editeur) => {
    const cle = env[VARIABLES_CLES[editeur]];
    if (cle === undefined || cle.length === 0) throw new RefusDePartir(`${VARIABLES_CLES[editeur]} absente de l'environnement : aucun appel réel sans clé.`);
    return cle;
  };
}

function exigerRunReel(run: RunLu, repertoire_run: string): void {
  if (estRunSimule(run)) {
    throw new RefusDePartir(`${repertoire_run} est un gel simulé (simule: true) : il se note avec pnpm notation:dry --run, jamais avec des juges réels.`);
  }
}

/** Le fournisseur de `volume/liens/` (§7, D20) ; absent, la notation ne part pas : `pnpm liens <run>` d'abord. */
function existencesDuTestDesLiens(repertoire_run: string): FournisseurExistences {
  const repertoire = repertoireLiens(repertoire_run);
  if (!existsSync(repertoire)) throw new RefusDePartir(`${repertoire} absent : le test des liens n'a pas tourné sur ce run (pnpm liens <run>, §7 : « avant la notation »).`);
  return fournisseurFichiers(repertoire_run);
}

export async function notationReelle(argv: readonly string[], dependances: DependancesNotationReelle): Promise<NotationReelleFaite> {
  const demande = demandeDe(argv, dependances.depot);
  const run = lireRunJson(demande.repertoire_run);
  exigerRunReel(run, demande.repertoire_run);
  const declarations = dependances.declarationsDesJuges(run);
  const cle = cleDansEnvironnement(dependances.env);
  // Les clés sont exigées (`exigerCles`) avant la construction du premier juge, et donc avant tout appel.
  // `lireRunJson` a validé run.json contre son schéma, qui exige ces quatre champs de chaque juge.
  const juges = jugesReelsDuRun(run.juges as unknown as readonly JugeDeclareAuRun[], declarations, {
    racine: dependances.depot,
    cle,
    transport: transportFetch(dependances.envoi),
    attendre: dependances.attendre,
  });
  const existences = existencesDuTestDesLiens(demande.repertoire_run);
  const reponses = dependances.chargerReponses(demande.repertoire_run, demande.repertoire_items);
  const resultat = await noterRun(reponses, {
    repertoire_run: demande.repertoire_run,
    juges,
    existences,
    maintenant: dependances.maintenant,
  });
  const bilan = bilanNotation(demande.repertoire_run, resultat, reponses.map((r) => r.reponse.id));
  return { repertoire_run: demande.repertoire_run, resultat, bilan };
}
