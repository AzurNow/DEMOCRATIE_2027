/**
 * Les dépôts des testeurs de l'application grand public (§6, QR8 ; D59 (12), protocole 0.24).
 *
 * §6 : « Chacun des deux testeurs saisit tout le sous-échantillon. La réponse brute est le texte que
 * copie le bouton de copie de l'application, stocké tel quel ; la capture d'écran en est la preuve,
 * et son empreinte est publiée. » Un dépôt (`schema/depot-application.schema.json`) est ce qu'un
 * testeur rapporte d'une saisie : le texte copié, l'empreinte de chaque capture, son pseudonyme, le
 * compte employé (aucun, ou le compte dédié au banc).
 *
 * `bilanDesDepots` contrôle les dépôts d'un run contre son sous-échantillon
 * (`sous-echantillon-application.ts`) et dit ce qui manque, sans rien compléter :
 *
 * - chaque dépôt est validé contre son schéma (frontière d'entrée) ;
 * - un dépôt d'un autre run, d'un outil non attendu, d'une question hors du sous-échantillon ou sur
 *   une autre formulation que la neutre désignée lève `DepotHorsSousEchantillon` ;
 * - deux dépôts du même testeur pour le même outil et la même question lèvent `DepotEnDouble` :
 *   lequel compte n'est pas à deviner ;
 * - plus de deux testeurs sur le run lèvent `TesteursEnTrop` ;
 * - une saisie (outil × question) qui n'a pas ses deux testeurs est **incomplète** et nommée, avec
 *   les testeurs présents : un seul testeur, ou aucun. Elle n'est ni écartée ni dupliquée.
 *
 * Le texte copié n'est jamais lu ni modifié ici (règle 7). Les outils attendus sont donnés par
 * l'appelant : le §6 parle de « l'application grand public de chaque éditeur », et ce module ne
 * décide pas lesquels en ont une.
 */

import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { TESTEURS_APPLICATION, type SousEchantillonApplication } from "./sous-echantillon-application.ts";

/** `schema/depot-application.schema.json`. */
export interface DepotApplication {
  readonly run_id: string;
  readonly outil_id: string;
  readonly question_id: string;
  readonly formulation_id: string;
  readonly echantillon: 1;
  readonly testeur_id: string;
  readonly compte: "aucun" | "dedie";
  readonly horodatage_saisie: string;
  readonly texte_copie: string;
  readonly captures: readonly { readonly sha256: string; readonly chemin_local: string }[];
}

export interface SaisieIncomplete {
  readonly outil_id: string;
  readonly question_id: string;
  /** Les testeurs qui ont déposé cette saisie, triés : un, ou aucun. */
  readonly testeurs: readonly string[];
}

export interface BilanDepots {
  readonly run_id: string;
  /** Outils attendus × questions du sous-échantillon. */
  readonly saisies_attendues: number;
  /** Saisies déposées par les deux testeurs. */
  readonly saisies_completes: number;
  /** Triées par outil puis par question. */
  readonly incompletes: readonly SaisieIncomplete[];
}

export class DepotHorsSousEchantillon extends Error {
  constructor(depot: DepotApplication, raison: string) {
    super(
      `Dépôt de ${depot.testeur_id} (outil ${depot.outil_id}, question ${depot.question_id}) hors du ` +
        `sous-échantillon de l'application : ${raison} (§6).`,
    );
    this.name = "DepotHorsSousEchantillon";
  }
}

export class DepotEnDouble extends Error {
  constructor(depot: DepotApplication) {
    super(
      `Deux dépôts de ${depot.testeur_id} pour l'outil ${depot.outil_id} et la question ${depot.question_id} : ` +
        `lequel compte n'est pas à deviner (§6, un seul échantillon).`,
    );
    this.name = "DepotEnDouble";
  }
}

export class TesteursEnTrop extends Error {
  constructor(testeurs: readonly string[]) {
    super(`${testeurs.length} testeurs dans les dépôts (${testeurs.join(", ")}) : le §6 en prévoit ${TESTEURS_APPLICATION}.`);
    this.name = "TesteursEnTrop";
  }
}

export function bilanDesDepots(
  sousEchantillon: SousEchantillonApplication,
  depots: readonly DepotApplication[],
  outils_attendus: readonly string[],
): BilanDepots {
  const formulations = formulationsDesignees(sousEchantillon);
  const outils = new Set(outils_attendus);
  const testeursParSaisie = new Map<string, Set<string>>();
  for (const [rang, brut] of depots.entries()) {
    const depot = valider<DepotApplication>("depot-application", brut, `dépôt n° ${rang + 1} de l'application`);
    exigerDansSousEchantillon(depot, sousEchantillon.run_id, outils, formulations);
    ajouterTesteur(testeursParSaisie, depot);
  }
  exigerDeuxTesteursAuPlus(testeursParSaisie);
  return bilan(sousEchantillon.run_id, [...outils].sort(comparerChaines), [...formulations.keys()].sort(comparerChaines), testeursParSaisie);
}

/** La formulation neutre désignée de chaque question du sous-échantillon. */
function formulationsDesignees(sousEchantillon: SousEchantillonApplication): ReadonlyMap<string, string> {
  return new Map(sousEchantillon.candidats.flatMap((c) => c.questions.map((q) => [q.question_id, q.formulation_id] as const)));
}

function exigerDansSousEchantillon(
  depot: DepotApplication,
  run_id: string,
  outils: ReadonlySet<string>,
  formulations: ReadonlyMap<string, string>,
): void {
  if (depot.run_id !== run_id) throw new DepotHorsSousEchantillon(depot, `run ${depot.run_id}, attendu ${run_id}`);
  if (!outils.has(depot.outil_id)) throw new DepotHorsSousEchantillon(depot, "outil non attendu");
  const designee = formulations.get(depot.question_id);
  if (designee === undefined) throw new DepotHorsSousEchantillon(depot, "question non tirée au sous-échantillon");
  if (designee !== depot.formulation_id) {
    throw new DepotHorsSousEchantillon(depot, `formulation ${depot.formulation_id}, la neutre désignée est ${designee}`);
  }
}

function cleSaisie(outil_id: string, question_id: string): string {
  return `${outil_id}\0${question_id}`;
}

function ajouterTesteur(testeursParSaisie: Map<string, Set<string>>, depot: DepotApplication): void {
  const cle = cleSaisie(depot.outil_id, depot.question_id);
  const testeurs = testeursParSaisie.get(cle);
  if (testeurs === undefined) {
    testeursParSaisie.set(cle, new Set([depot.testeur_id]));
    return;
  }
  if (testeurs.has(depot.testeur_id)) throw new DepotEnDouble(depot);
  testeurs.add(depot.testeur_id);
}

function exigerDeuxTesteursAuPlus(testeursParSaisie: ReadonlyMap<string, ReadonlySet<string>>): void {
  const tous = new Set([...testeursParSaisie.values()].flatMap((testeurs) => [...testeurs]));
  if (tous.size > TESTEURS_APPLICATION) throw new TesteursEnTrop([...tous].sort(comparerChaines));
}

function bilan(
  run_id: string,
  outils: readonly string[],
  questions: readonly string[],
  testeursParSaisie: ReadonlyMap<string, ReadonlySet<string>>,
): BilanDepots {
  const incompletes: SaisieIncomplete[] = [];
  for (const outil_id of outils) {
    for (const question_id of questions) {
      const presents = testeursParSaisie.get(cleSaisie(outil_id, question_id));
      const testeurs = presents === undefined ? [] : [...presents].sort(comparerChaines);
      if (testeurs.length < TESTEURS_APPLICATION) incompletes.push({ outil_id, question_id, testeurs });
    }
  }
  const saisies_attendues = outils.length * questions.length;
  return { run_id, saisies_attendues, saisies_completes: saisies_attendues - incompletes.length, incompletes };
}
