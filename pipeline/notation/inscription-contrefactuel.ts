/**
 * L'inscription du test contrefactuel dans `run.json` (§7 ; `publication-contrefactuel.ts` rend les
 * champs, « l'appelant les écrit dans le run »).
 *
 * Ce qui est écrit : le bloc `contrefactuel_candidats`, le taux de l'échantillon humain, et, pour
 * chaque juge, les six champs de `CHAMPS_DU_TEST` (`retire`, `motif_retrait`,
 * `taux_changement_contrefactuel`, `changements_contrefactuel`, `paires_ecartees_contrefactuel`,
 * `motif_indefini_contrefactuel`) ; tout autre champ du run et de ses juges est recopié tel quel. Le
 * run fusionné est validé contre `schema/run.schema.json` avant d'être écrit, par un fichier
 * temporaire synchronisé puis renommé : `run.json` n'est jamais à moitié écrit.
 *
 * **Une seule fois.** Un `run.json` qui porte déjà `contrefactuel_candidats` n'est jamais réécrit :
 * si la fusion recalculée lui est identique (forme canonique), c'est une reprise, et rien n'est
 * écrit ; sinon, `ContrefactuelDejaInscrit` lève, et rien n'est écrit non plus. Un résultat de test
 * ne se corrige pas en silence.
 *
 * **Run invalide** (D16 (3), les deux juges retirés ; D51 (2)) : le test est inscrit avec
 * `invalidation { motif: <la raison>, date }`, posée par la transition pure
 * (`pipeline/run/statut.ts:invalider`), en une seule écriture validée. Le statut n'est pas
 * touché : `invalide` s'écrit avec le dépôt (§12). Une reprise retrouve le test et l'invalidation
 * déjà inscrits : la fusion recalculée est comparée à `run.json` avec la date déjà écrite, et rien
 * n'est réécrit ; un motif différent lève `ContrefactuelDejaInscrit`.
 */

import { readFileSync } from "node:fs";
import { dispositionRunNote } from "../../analysis/lecture-run.ts";
import type { Instant } from "../../analysis/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ecrireParRenommage } from "../run/ecriture.ts";
import { invalider } from "../run/statut.ts";
import type { RunAvecStatut } from "../run/statut.ts";
import type { JugePublie, PublicationContrefactuel } from "./publication-contrefactuel.ts";

export type IssueInscription = "inscrit" | "deja_inscrit";

export class ContrefactuelDejaInscrit extends Error {
  constructor(chemin: string) {
    super(`${chemin} porte déjà un test contrefactuel différent de celui que la notation recalcule : rien n'est réécrit (règle 7).`);
    this.name = "ContrefactuelDejaInscrit";
  }
}

export class InscriptionImpossible extends Error {
  constructor(detail: string) {
    super(`Test contrefactuel non inscrit dans run.json : ${detail}`);
    this.name = "InscriptionImpossible";
  }
}

type Objet = Readonly<Record<string, unknown>>;

/** Les champs d'un juge que le test fixe : retirés de l'ancien juge avant la fusion. */
export const CHAMPS_DU_TEST = ["retire", "motif_retrait", "taux_changement_contrefactuel", "changements_contrefactuel", "paires_ecartees_contrefactuel", "motif_indefini_contrefactuel"] as const;

/**
 * `maintenant` date l'invalidation d'un run invalide (D16 (3)) ; l'horloge n'est pas lue sinon, ni à
 * la reprise, où la date déjà écrite fait foi.
 */
export function inscrireContrefactuel(repertoire_run: string, publication: PublicationContrefactuel, maintenant: () => Instant): IssueInscription {
  const chemin = dispositionRunNote(repertoire_run).run_json;
  const actuel = JSON.parse(readFileSync(chemin, "utf8")) as Objet;
  if (actuel["contrefactuel_candidats"] !== undefined) return reprise(chemin, actuel, publication);
  const fusionne = avecInvalidation(fusionner(actuel, publication), publication, maintenant);
  valider("run", fusionne, `${chemin} après inscription du test contrefactuel`);
  ecrireParRenommage(chemin, fusionne, "inscription");
  return "inscrit";
}

/** Une reprise : la fusion recalculée, avec l'invalidation attendue datée comme celle déjà écrite. */
function reprise(chemin: string, actuel: Objet, publication: PublicationContrefactuel): IssueInscription {
  const recalcule = { ...fusionner(actuel, publication), ...invalidationAttendue(actuel, publication) };
  if (canoniser(recalcule) !== canoniser(actuel)) throw new ContrefactuelDejaInscrit(chemin);
  return "deja_inscrit";
}

/**
 * Sans invalidation recalculée, aucune n'est attendue : une invalidation écrite ferait diverger la
 * reprise (la chaîne refuse en amont un run invalidé par `pnpm run:invalider`).
 */
function invalidationAttendue(actuel: Objet, publication: PublicationContrefactuel): Objet {
  if (publication.invalidation === undefined) return { invalidation: undefined };
  const ecrite = actuel["invalidation"] as { readonly date?: unknown } | undefined;
  return { invalidation: { motif: publication.invalidation.motif, date: ecrite?.date } };
}

/** D16 (3), D51 (2) : la raison du test devient l'invalidation du run, statut inchangé. */
function avecInvalidation(run: Objet, publication: PublicationContrefactuel, maintenant: () => Instant): Objet {
  if (publication.invalidation === undefined) return run;
  const issue = invalider(run as Objet & RunAvecStatut, publication.invalidation.motif, maintenant());
  if (issue.issue === "deja_inscrite") throw new InscriptionImpossible("une invalidation identique est déjà inscrite sans test contrefactuel.");
  return issue.run;
}

function fusionner(run: Objet, publication: PublicationContrefactuel): Objet {
  const juges = run["juges"];
  if (!Array.isArray(juges)) throw new InscriptionImpossible("run.json sans tableau juges.");
  return {
    ...run,
    juges: juges.map((juge: Objet) => jugeFusionne(juge, publication.juges)),
    taux_echantillon_humain: publication.taux_echantillon_humain,
    contrefactuel_candidats: publication.contrefactuel_candidats,
  };
}

function jugeFusionne(juge: Objet, publies: readonly JugePublie[]): Objet {
  const publie = publies.find((p) => p.juge_id === juge["juge_id"]);
  if (publie === undefined) throw new InscriptionImpossible(`le juge ${String(juge["juge_id"])} du run n'a pas de résultat publié.`);
  const conserve = Object.fromEntries(Object.entries(juge).filter(([cle]) => !(CHAMPS_DU_TEST as readonly string[]).includes(cle)));
  return { ...conserve, ...publie };
}
