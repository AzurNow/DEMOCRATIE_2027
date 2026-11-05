/**
 * D80 : les humains de la chaîne simulée, joués par les tests et par eux seuls. Aucun code de
 * production ne fabrique de notation humaine (`pipeline/notation/chaine.ts`, « Humains ») ; sans eux,
 * `pnpm analyze` refuse un run dont une réponse obtenue n'a pas de verdict (`ReponsesNonNotees`).
 *
 * Les tâches sont celles de la vraie file (`pipeline/notation/file-humaine.ts:construireFile`, que
 * l'écran `pnpm notation:humaine` sert), sur le run chargé comme l'écran le charge
 * (`notation-humaine/serveur/chargement.ts:chargerRun`). Chaque place est prise par un annotateur
 * simulé (`humain-simule-<n>`) qui ne l'a pas déjà notée, et sa notation recopie celle du juge
 * désigné sur la même réponse, sous le motif de la tâche ; sur un refus de l'API, que seule la règle
 * a noté, celle de la règle (D32, D33 : non-réponse sur refus). Deux humains qui recopient la même
 * notation s'accordent : aucun arbitrage n'est ouvert. Jamais sous `runs/` (les juges simulés et le
 * stockage le refusent déjà).
 */

import { lireNotationsDuRun } from "../../analysis/lecture-run.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import { chargerRun } from "../../notation-humaine/serveur/chargement.ts";
import { VERSION_CHARGE_JUGE } from "../../pipeline/notation/charge-juge.ts";
import { construireFile, type Tache } from "../../pipeline/notation/file-humaine.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import { ulid } from "../analysis/fabriques.ts";

const ANNOTATEURS = ["humain-simule-1", "humain-simule-2", "humain-simule-3"] as const;
/** Au-delà, la file ne se vide pas : un défaut à montrer, jamais une boucle sans fin. */
const TOURS_MAX = 3;

export interface OptionsHumainsSimules {
  readonly repertoire_run: string;
  /** Le `data/items` du dépôt simulé, que l'écran lit au commit du gel. */
  readonly repertoire_items: string;
  /** Le juge dont chaque humain recopie la notation. */
  readonly juge_recopie: string;
  /** L'instant posé sur chaque notation humaine. */
  readonly date: string;
}

function modeleDe(notations: readonly NotationIndividuelle[], reponse_id: string, juge_recopie: string): NotationIndividuelle {
  const du_run = notations.filter((n) => n.contexte === "run" && n.objet_note.id === reponse_id);
  const juge = du_run.find((n) => n.notateur.type === "juge" && n.notateur.id === juge_recopie);
  if (juge !== undefined) return juge;
  const regle = du_run.find((n) => n.notateur.type === "regle");
  if (regle !== undefined) return { ...regle, version_charge: VERSION_CHARGE_JUGE };
  throw new Error(`réponse ${reponse_id} : ni notation du juge ${juge_recopie} ni notation par règle à recopier.`);
}

function humaine(modele: NotationIndividuelle, annotateur: string, tache: Tache, date: string): NotationIndividuelle {
  return {
    ...modele,
    id: ulid(`humain-simule:${annotateur}:${tache.motif_notation}:${tache.reponse_id}`),
    notateur: { type: "humain", id: annotateur, sensibilite_declaree_famille: "famille-simulee", a_vu_identite_outil: false },
    motif_notation: tache.motif_notation,
    date,
  };
}

/** Un tour : toutes les places ouvertes de la file, prises. Rend le nombre de notations écrites. */
function unTour(options: OptionsHumainsSimules): number {
  const donnees = chargerRun(options.repertoire_run, options.repertoire_items);
  const lues = lireNotationsDuRun(options.repertoire_run, donnees.run.id);
  const file = construireFile({
    run: donnees.run_note,
    reponses: donnees.reponses.map((prep) => ({ reponse_id: prep.reponse.id, textes: prep.textes })),
    notations: lues.notations,
    renvois: lues.renvois,
    jeu_or: donnees.jeu_or,
  });
  const depot = DepotNotation.ouvrir(options.repertoire_run);
  let ecrites = 0;
  for (const tache of file.taches) {
    const modele = modeleDe(lues.notations, tache.reponse_id, options.juge_recopie);
    const libres = ANNOTATEURS.filter((annotateur) => !tache.deja_notee_par.includes(annotateur)).slice(0, tache.places_restantes);
    for (const annotateur of libres) depot.ecrireNotation(humaine(modele, annotateur, tache, options.date));
    ecrites += libres.length;
  }
  return ecrites;
}

/** Vide la file humaine du run ; rend le nombre de notations humaines écrites. */
export function jouerLesHumains(options: OptionsHumainsSimules): number {
  let total = 0;
  for (let tour = 0; tour < TOURS_MAX; tour += 1) {
    const ecrites = unTour(options);
    if (ecrites === 0) return total;
    total += ecrites;
  }
  throw new Error(`file humaine de ${options.repertoire_run} non vidée en ${TOURS_MAX} tours.`);
}
