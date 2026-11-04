/**
 * Le modèle de chaque outil à un run, publié avec la tendance (§8, 0.31, D73 (17)).
 *
 * « Le modèle de chaque outil à chaque run est publié avec la tendance. C'est le modèle demandé,
 * inscrit au gel, avec les identifiants de modèle renvoyés par l'API et leurs effectifs ; les
 * réponses sans identifiant renvoyé sont comptées à part. »
 *
 * Une ligne par assistant inclus au gel, dans l'ordre du périmètre. Sont comptées les réponses
 * obtenues du canal api et du contexte run, tous modes ensemble : le canal application n'a pas
 * d'API (§6), une réponse manquante n'a rien renvoyé et ne compte nulle part. Chaque identifiant
 * est publié tel que l'API l'a renvoyé (règle 7) : ni casse ramenée, ni suffixe de date retiré, ni
 * rapprochement avec le modèle demandé. Les identifiants sont rangés par ordre des unités de code
 * UTF-16 (`outils/ordre-chaines.ts`), pour une sortie déterministe qui ne dépend pas de la locale.
 */

import { comparerChaines } from "../outils/ordre-chaines.ts";
import { estDuRun } from "./filtre.ts";
import type { IdentifiantCourt, OutilAuGel, Reponse } from "./types.ts";

export interface IdentifiantRenvoye {
  readonly identifiant: string;
  /** Réponses obtenues de l'outil au run qui ont renvoyé exactement cet identifiant. */
  readonly reponses: number;
}

export interface ModeleDUnOutil {
  readonly outil_id: IdentifiantCourt;
  /** Le modèle demandé, inscrit au gel (run.schema.json, `perimetre.outils[].modele_demande`). */
  readonly modele_demande: string;
  readonly identifiants_renvoyes: readonly IdentifiantRenvoye[];
  /** Réponses obtenues dont l'API n'a renvoyé aucun identifiant (`modele_renvoye: null`). */
  readonly reponses_sans_identifiant: number;
}

/** Un assistant inclus sans modèle demandé : run.schema.json l'exige, aucun modèle n'est deviné. */
export class ModeleDemandeAbsent extends Error {
  constructor(outil_id: IdentifiantCourt) {
    super(`Assistant inclus ${outil_id} sans modele_demande au gel (§6, §8, run.schema.json) : le modèle publié avec la tendance est lu, jamais deviné.`);
    this.name = "ModeleDemandeAbsent";
  }
}

/** Une réponse API obtenue sans la clé `modele_renvoye` : reponse.schema.json l'exige ; absente n'est pas null. */
export class ModeleRenvoyeNonEnregistre extends Error {
  constructor(reponse_id: string) {
    super(`Réponse ${reponse_id} du canal api obtenue sans la clé metadonnees.modele_renvoye (§6, reponse.schema.json) : une clé absente n'est pas un null.`);
    this.name = "ModeleRenvoyeNonEnregistre";
  }
}

/** Une réponse API obtenue d'un outil qui n'est pas un assistant inclus au gel : donnée incohérente. */
export class OutilHorsPerimetre extends Error {
  constructor(reponse_id: string, outil_id: IdentifiantCourt) {
    super(`Réponse ${reponse_id} du canal api obtenue de ${outil_id}, qui n'est pas un assistant inclus au gel : ni comptée, ni ignorée.`);
    this.name = "OutilHorsPerimetre";
  }
}

interface Compte {
  readonly par_identifiant: Map<string, number>;
  sans_identifiant: number;
}

export function modelesDuRun(outils: readonly OutilAuGel[], reponses: readonly Reponse[]): readonly ModeleDUnOutil[] {
  const assistants = outils.filter((o) => o.famille === "assistant" && o.inclus);
  const comptes = new Map<IdentifiantCourt, Compte>(assistants.map((o) => [o.outil_id, { par_identifiant: new Map(), sans_identifiant: 0 }]));
  for (const reponse of reponses.filter(estComptee)) compter(comptes, reponse);
  return assistants.map((o) => ligne(o, comptes.get(o.outil_id) as Compte));
}

function estComptee(reponse: Reponse): boolean {
  return estDuRun(reponse) && reponse.canal === "api" && reponse.statut_reponse === "obtenue";
}

function compter(comptes: ReadonlyMap<IdentifiantCourt, Compte>, reponse: Reponse): void {
  const compte = comptes.get(reponse.outil_id);
  if (compte === undefined) throw new OutilHorsPerimetre(reponse.id, reponse.outil_id);
  const renvoye = reponse.metadonnees?.modele_renvoye;
  if (renvoye === undefined) throw new ModeleRenvoyeNonEnregistre(reponse.id);
  if (renvoye === null) {
    compte.sans_identifiant += 1;
    return;
  }
  const deja = compte.par_identifiant.get(renvoye);
  compte.par_identifiant.set(renvoye, deja === undefined ? 1 : deja + 1);
}

function ligne(outil: OutilAuGel, compte: Compte): ModeleDUnOutil {
  if (outil.modele_demande === undefined) throw new ModeleDemandeAbsent(outil.outil_id);
  const identifiants = [...compte.par_identifiant.keys()].sort(comparerChaines);
  return {
    outil_id: outil.outil_id,
    modele_demande: outil.modele_demande,
    identifiants_renvoyes: identifiants.map((identifiant) => ({ identifiant, reponses: compte.par_identifiant.get(identifiant) as number })),
    reponses_sans_identifiant: compte.sans_identifiant,
  };
}
