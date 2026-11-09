/**
 * Les juges réels d'un run gelé (§7) : leur identité vient de `run.json#/juges` — `juge_id`,
 * `famille_modele`, `modele` épinglé, `version_prompt` —, jamais d'une valeur du code ; leur appel
 * (éditeur, réglages, tentatives) d'une déclaration fournie par l'appelant.
 *
 * **Le prompt.** `version_prompt` est `<chemin>@<version>` (`juge.ts:versionPromptDe`) ; le fichier
 * lu est `<racine>/<chemin>.md`, tel quel, et `rendu-prompt-juge.ts` vérifie à chaque rendu qu'il est
 * bien ce prompt (titre versionné, ligne `Version`). Un `version_prompt` sans `@`, ou un fichier
 * absent, est refusé avant tout appel.
 *
 * **L'éditeur.** Choisi par une table (`FABRIQUES_ADAPTATEURS_JUGES`), d'après le champ `editeur` de la
 * déclaration : jamais d'après `famille_modele` ni un nom de modèle (`familles-juges.ts` : aucune
 * famille n'est nommée dans le code). Les clés d'API sont lues par l'appelant
 * (`VARIABLES_CLES` de l'extraction, la même table) ; une clé absente refuse avant tout appel.
 *
 * **D'où vient la déclaration d'appel.** Le protocole (§7 : « Leurs réglages d'échantillonnage sont
 * fixés et publiés ») n'écrit ni ces réglages ni l'endroit où ils se déclarent et se publient avec le
 * run (`run.json#/juges[]` n'en porte aucun, exigence §7.57 « à implémenter »). Ce module ne les
 * invente pas : il les reçoit, entiers, et refuse une déclaration qui ne couvre pas exactement les
 * juges du run.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Transport } from "../interrogation/editeur.ts";
import type { Horloge } from "../interrogation/horloge.ts";
import type { NomEditeur } from "../extraction/editeur.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { jugeReel, type AdaptateurJuge, type PolitiqueTentatives } from "./appel-juge.ts";
import type { ArchiveAppelsJuge } from "./archive-appels-juge.ts";
import type { PromptDeJuge } from "./charge-juge.ts";
import type { IdentiteJuge, Juge } from "./juge.ts";
import { adaptateurJugeAnthropic, type ReglagesJugeAnthropic } from "./juge-anthropic.ts";
import { adaptateurJugeMistral, type ReglagesJugeMistral } from "./juge-mistral.ts";

/** Ce que `run.json#/juges[]` déclare de chaque juge (le schéma exige ces champs). */
export interface JugeDeclareAuRun {
  readonly juge_id: string;
  readonly famille_modele: string;
  readonly modele: string;
  readonly version_prompt: string;
}

interface ReglagesParEditeur {
  readonly anthropic: ReglagesJugeAnthropic;
  readonly mistral: ReglagesJugeMistral;
}

/** L'appel d'un juge : l'éditeur, ses réglages (délai d'abandon compris) et la politique de tentatives. */
export type AppelDeJuge = {
  readonly [E in NomEditeur]: { readonly editeur: E; readonly reglages: ReglagesParEditeur[E]; readonly tentatives: PolitiqueTentatives };
}[NomEditeur];

export interface DeclarationAppelJuge {
  readonly juge_id: string;
  readonly appel: AppelDeJuge;
}

type Fabrique<E extends NomEditeur> = (modele: string, reglages: ReglagesParEditeur[E], cle_api: string) => AdaptateurJuge;

/** L'adaptateur de chaque éditeur : une table, aucun `if` sur un éditeur. */
export const FABRIQUES_ADAPTATEURS_JUGES: { readonly [E in NomEditeur]: Fabrique<E> } = {
  anthropic: adaptateurJugeAnthropic,
  mistral: adaptateurJugeMistral,
};

export interface MoyensDesJuges {
  /** Racine sous laquelle se lit `<chemin>.md` du prompt. */
  readonly racine: string;
  /** La clé d'API d'un éditeur ; refuse (sans rien appeler) si elle manque. */
  readonly cle: (editeur: NomEditeur) => string;
  readonly transport: Transport;
  readonly attendre: Horloge["attendre"];
  /** L'archive des appels du run (§7, D100), partagée par tous les juges. */
  readonly archive: ArchiveAppelsJuge;
}

export class JugesReelsRefuses extends Error {
  constructor(detail: string) {
    super(`Juges réels refusés : ${detail} Aucun appel n'est fait.`);
    this.name = "JugesReelsRefuses";
  }
}

/** `chemin@version` → `{chemin, version}` ; le dernier `@` sépare, une partie vide est refusée. */
export function promptDeVersion(juge_id: string, version_prompt: string): PromptDeJuge {
  const rang = version_prompt.lastIndexOf("@");
  const chemin = rang === -1 ? "" : version_prompt.slice(0, rang);
  const version = rang === -1 ? "" : version_prompt.slice(rang + 1);
  if (chemin === "" || version === "") throw new JugesReelsRefuses(`le juge ${juge_id} déclare version_prompt ${JSON.stringify(version_prompt)}, attendu <chemin>@<version>.`);
  return { chemin, version };
}

export function identiteDuRun(juge: JugeDeclareAuRun): IdentiteJuge {
  return { juge_id: juge.juge_id, famille_modele: juge.famille_modele, modele: juge.modele, prompt: promptDeVersion(juge.juge_id, juge.version_prompt) };
}

function sourceDuPrompt(racine: string, identite: IdentiteJuge): string {
  const chemin = join(racine, `${identite.prompt.chemin}.md`);
  if (!existsSync(chemin)) throw new JugesReelsRefuses(`le prompt ${identite.prompt.chemin}@${identite.prompt.version} du juge ${identite.juge_id} est introuvable (${chemin}).`);
  return readFileSync(chemin, "utf8");
}

/** Une déclaration par juge du run, ni plus ni moins. */
function exigerCouverture(juges: readonly JugeDeclareAuRun[], declarations: readonly DeclarationAppelJuge[]): void {
  const duRun = juges.map((j) => j.juge_id).sort(comparerChaines);
  const declares = declarations.map((d) => d.juge_id).sort(comparerChaines);
  if (duRun.join("\u0000") !== declares.join("\u0000")) {
    const couverts = declares.length === 0 ? "aucun juge" : declares.join(", ");
    throw new JugesReelsRefuses(`le run déclare les juges ${duRun.join(", ")}, la déclaration d'appel couvre ${couverts} : une déclaration par juge du run, ni plus ni moins.`);
  }
}

function adaptateurDe(appel: AppelDeJuge, modele: string, cle_api: string): AdaptateurJuge {
  // Union corrélée : la table garantit que la fabrique de `appel.editeur` reçoit les réglages de cet éditeur.
  const fabrique = FABRIQUES_ADAPTATEURS_JUGES[appel.editeur] as (modele: string, reglages: AppelDeJuge["reglages"], cle_api: string) => AdaptateurJuge;
  return fabrique(modele, appel.reglages, cle_api);
}

function declarationDe(juge_id: string, declarations: readonly DeclarationAppelJuge[]): DeclarationAppelJuge {
  const trouvee = declarations.find((d) => d.juge_id === juge_id);
  if (trouvee === undefined) throw new JugesReelsRefuses(`aucune déclaration d'appel pour le juge ${juge_id}.`);
  return trouvee;
}

/** Les clés que la déclaration exige, lues avant de construire quoi que ce soit. */
export function exigerCles(declarations: readonly DeclarationAppelJuge[], cle: MoyensDesJuges["cle"]): void {
  for (const declaration of declarations) cle(declaration.appel.editeur);
}

/** Les juges réels du run, dans l'ordre de `run.json#/juges`, retirés compris (la chaîne les veut tous). */
export function jugesReelsDuRun(juges: readonly JugeDeclareAuRun[], declarations: readonly DeclarationAppelJuge[], moyens: MoyensDesJuges): readonly Juge[] {
  exigerCouverture(juges, declarations);
  exigerCles(declarations, moyens.cle);
  return juges.map((juge) => {
    const identite = identiteDuRun(juge);
    const { appel } = declarationDe(juge.juge_id, declarations);
    return jugeReel({
      identite,
      source_prompt: sourceDuPrompt(moyens.racine, identite),
      adaptateur: adaptateurDe(appel, identite.modele, moyens.cle(appel.editeur)),
      transport: moyens.transport,
      politique: appel.tentatives,
      delai_abandon_ms: appel.reglages.delai_abandon_ms,
      attendre: moyens.attendre,
      archive: moyens.archive,
    });
  });
}
