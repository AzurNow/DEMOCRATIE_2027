/**
 * Complétude du jeu de questions reçu par la barrière de symétrie (§5, protocole 0.13).
 *
 * « La condition se juge […] sur le jeu complet des questions engendrées au gel, publié avec le
 * run ; un jeu incomplet est refusé. » La répartition par thème cherche les questions tirables du
 * candidat en retard parmi les questions qu'elle reçoit (constat n° 23) : réduit aux questions
 * tirées, le jeu n'offre jamais de réserve, et un tirage fautif passerait `ecart_tolere` en silence
 * (dette du 2026-09-27, point 1).
 *
 * La référence est la plus stricte que les fichiers de la barrière permettent de recalculer :
 *
 * - toute question citée par `tirage.entrees[]` ou `tirage.exclusions[]` : le tirage publié les a
 *   vues, elles appartiennent au jeu ;
 * - toute question que l'engendrement produit sur les items reçus — les items au gel — et que le
 *   tirage examine (`concerneLeRun` : une question d'attribution, ou une question qui nomme un
 *   candidat interrogé). Les questions d'un candidat non interrogé ne sont pas réclamées : le tirage
 *   ne les lit pas, la symétrie non plus.
 *
 * `items_au_gel` du tirage ne cite que les items des questions tirées ; il ne suffit pas à retrouver
 * une question tirable non tirée, qui est précisément ce que la barrière doit voir. La référence
 * s'engendre donc sur tous les items reçus, qui doivent être ceux du gel (`versions.donnees_commit`
 * du run) : des items postérieurs au gel feraient réclamer des questions qui n'existaient pas.
 *
 * Une question reçue hors de la référence est tolérée : elle ne peut qu'ajouter des questions
 * tirables à une strate, donc rendre la répartition par thème plus sévère, jamais la verdir.
 */

import { identitesEngendrees } from "./engendrement.ts";
import { concerneLeRun } from "./tirabilite.ts";
import type { Item, Question, RunAuGel, Tirage } from "./types.ts";

/** Le jeu reçu ne contient pas toutes les questions engendrées au gel : la barrière ne juge pas. */
export class JeuDeQuestionsIncomplet extends Error {
  readonly manquantes: readonly string[];

  constructor(manquantes: readonly string[]) {
    super(
      `Jeu de questions incomplet : ${manquantes.length} question(s) engendrée(s) au gel ou citée(s) par ` +
        `le tirage absente(s) du jeu reçu (${manquantes.join(", ")}). La symétrie se juge sur le jeu ` +
        `complet des questions engendrées au gel, publié avec le run ; un jeu incomplet est refusé ` +
        `(§5, protocole 0.13).`,
    );
    this.name = "JeuDeQuestionsIncomplet";
    this.manquantes = manquantes;
  }
}

/**
 * Le tirage reçu n'est pas celui du run reçu (conformité du 2026-09-29, n° 9). La barrière juge les
 * décisions du panel à la date du tirage, la tirabilité et la complétude à celle du run : deux dates
 * différentes feraient juger un même item contre deux instants. `tirage.date_gel` est « recopié depuis
 * le run » et « doit lui être identique » (`schema/tirage.schema.json`) : la comparaison porte sur la
 * chaîne, pas sur l'instant.
 */
export class TirageDUnAutreRun extends Error {
  constructor(ecarts: readonly string[]) {
    super(
      `Le tirage reçu n'est pas celui du run reçu : ${ecarts.join(" ; ")}. La symétrie ne se juge que ` +
        `sur le tirage du run, gelé à sa date (§5).`,
    );
    this.name = "TirageDUnAutreRun";
  }
}

/** Lève `TirageDUnAutreRun` si `run_id` ou `date_gel` du tirage diffère du run. */
export function exigerTirageDuRun(tirage: Pick<Tirage, "run_id" | "date_gel">, run: Pick<RunAuGel, "id" | "date_gel">): void {
  const ecarts = [
    ...(tirage.run_id === run.id ? [] : [`run_id ${tirage.run_id} contre ${run.id}`]),
    ...(tirage.date_gel === run.date_gel ? [] : [`date_gel ${tirage.date_gel} contre ${run.date_gel}`]),
  ];
  if (ecarts.length > 0) throw new TirageDUnAutreRun(ecarts);
}

/** Les identifiants que le jeu doit contenir, triés. */
export function questionsExigees(tirage: Tirage, items: readonly Item[], run: RunAuGel): readonly string[] {
  const interroges = new Set(
    run.perimetre.candidats.filter((candidat) => candidat.interroge).map((candidat) => candidat.candidat_id),
  );
  const engendrees = identitesEngendrees(items).filter((identite) => concerneLeRun(identite, interroges));
  const exigees = new Set([
    ...tirage.entrees.map((entree) => entree.question_id),
    ...tirage.exclusions.map((exclusion) => exclusion.question_id),
    ...engendrees.map((identite) => identite.id),
  ]);
  return [...exigees].sort();
}

/** Lève `JeuDeQuestionsIncomplet` si une question exigée manque au jeu reçu. */
export function exigerJeuComplet(
  tirage: Tirage,
  questions: readonly Question[],
  items: readonly Item[],
  run: RunAuGel,
): void {
  const recues = new Set(questions.map((question) => question.id));
  const manquantes = questionsExigees(tirage, items, run).filter((id) => !recues.has(id));
  if (manquantes.length > 0) throw new JeuDeQuestionsIncomplet(manquantes);
}
