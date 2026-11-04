/**
 * La fenêtre d'un run (§6) : semi-ouverte [debut, fin), fin = debut + 48 h en heures absolues.
 *
 * Le début dépend du type du run (§6, protocole 0.27, D67) : « ouverte le mardi à 6 h, heure de
 * Paris, pour un run régulier ; un run supplémentaire ouvre sa fenêtre à 6 h, heure de Paris, le
 * premier jour qui suit son gel ». Le run régulier (pilote, mensuel, hebdomadaire, réexécution)
 * ouvre un mardi à 06:00:00.000 heure de Paris (décision de l'auteur du 2026-10-02). Le run
 * supplémentaire (`supplementaire_*`) ouvre à 06:00:00.000 heure de Paris le jour civil de Paris
 * qui suit celui de son instant de gel (`run.json#/date_gel`), et aucun autre : le jour du gel se
 * lit à Paris, jamais en UTC. La règle de chaque type est une donnée (`REGLE_PAR_TYPE`), pas une
 * branche par type ; un type hors de `run.schema.json` est refusé, jamais traité par défaut.
 *
 * « Heures absolues » : la fin se calcule en millisecondes, jamais en heure civile. Une fenêtre
 * de mardi 6 h ne peut pas contenir un changement d'heure français (toujours un dimanche), mais
 * celle d'un run supplémentaire ouverte un samedi le contient : elle dure 48 heures réelles.
 */

import { TYPES_RUN, type TypeRun } from "../run/types.ts";
import {
  DUREE_FENETRE_MS,
  HEURE_OUVERTURE_FENETRE,
  JOUR_OUVERTURE_FENETRE,
} from "./conditions.ts";
import { dateParis, heureParis, instantParis, lireInstant } from "./heure-paris.ts";

export interface Fenetre {
  readonly debut: string;
  readonly fin: string;
  readonly debut_ms: number;
  readonly fin_ms: number;
}

/** Ce que l'ouverture lit du run : son type et son instant de gel (`run.json`). */
export interface RunDeLaFenetre {
  readonly type_run: string;
  readonly date_gel: string;
}

/** Un début de fenêtre qui ne respecte pas la règle d'ouverture du §6 pour son type de run. */
export class FenetreRefusee extends Error {
  constructor(debut: string, raison: string) {
    super(`Fenêtre refusée : « ${debut} » ${raison}.`);
    this.name = "FenetreRefusee";
  }
}

/** Un `type_run` hors de `run.schema.json#/properties/type_run` : aucune règle d'ouverture. */
export class TypeRunInconnu extends Error {
  constructor(type_run: string) {
    super(`Type de run « ${type_run} » inconnu (run.schema.json#/properties/type_run) : aucune règle d'ouverture de fenêtre (§6).`);
    this.name = "TypeRunInconnu";
  }
}

type RegleOuverture = "mardi" | "lendemain_du_gel";

/** §6 (0.27) : la règle d'ouverture de chaque type de run. */
const REGLE_PAR_TYPE: Readonly<Record<TypeRun, RegleOuverture>> = {
  pilote: "mardi",
  mensuel: "mardi",
  hebdomadaire: "mardi",
  reexecution: "mardi",
  supplementaire_liste_officielle: "lendemain_du_gel",
  supplementaire_debat: "lendemain_du_gel",
};

function estTypeRun(type_run: string): type_run is TypeRun {
  return (TYPES_RUN as readonly string[]).includes(type_run);
}

function regleDe(type_run: string): RegleOuverture {
  if (!estTypeRun(type_run)) throw new TypeRunInconnu(type_run);
  return REGLE_PAR_TYPE[type_run];
}

/** 06:00:00.000 pile, heure de Paris. */
function estSixHeuresPile(ms: number): boolean {
  const civile = heureParis(ms);
  return civile.heure === HEURE_OUVERTURE_FENETRE && civile.minute === 0 && civile.seconde === 0 && ms % 1000 === 0;
}

/** `AAAA-MM-JJ` du jour civil de Paris qui suit celui de l'instant `ms`. */
function lendemainParis(ms: number): string {
  const civile = heureParis(ms);
  const lendemain = new Date(Date.UTC(civile.annee, civile.mois - 1, civile.jour + 1));
  return lendemain.toISOString().slice(0, 10);
}

/** La raison du refus d'un début `debut_ms` selon la règle, ou `null` s'il est conforme. */
function defautDOuverture(regle: RegleOuverture, debut_ms: number, date_gel_ms: number): string | null {
  const constate = `tombe le ${instantParis(debut_ms)} à Paris`;
  if (regle === "mardi") {
    const conforme = heureParis(debut_ms).jour_semaine === JOUR_OUVERTURE_FENETRE && estSixHeuresPile(debut_ms);
    return conforme ? null : `${constate}, pas un mardi à 06:00:00 (§6 : un run régulier ouvre le mardi à 6 h, heure de Paris)`;
  }
  const attendu = lendemainParis(date_gel_ms);
  const conforme = dateParis(debut_ms) === attendu && estSixHeuresPile(debut_ms);
  return conforme
    ? null
    : `${constate}, pas le ${attendu} à 06:00:00, premier jour qui suit le gel du ${instantParis(date_gel_ms)} ` +
        `(§6 : un run supplémentaire ouvre à 6 h, heure de Paris, le premier jour qui suit son gel)`;
}

export function ouvrirFenetre(debut: string, run: RunDeLaFenetre): Fenetre {
  const regle = regleDe(run.type_run);
  const date_gel_ms = lireInstant(run.date_gel, "date_gel");
  const debut_ms = lireInstant(debut, "fenetre.debut");
  const defaut = defautDOuverture(regle, debut_ms, date_gel_ms);
  if (defaut !== null) throw new FenetreRefusee(debut, defaut);
  const fin_ms = debut_ms + DUREE_FENETRE_MS;
  return { debut, fin: instantParis(fin_ms), debut_ms, fin_ms };
}

/** Une tentative peut démarrer à `ms` si et seulement si debut ≤ ms < fin. */
export function tentativePeutDemarrer(fenetre: Fenetre, ms: number): boolean {
  return fenetre.debut_ms <= ms && ms < fenetre.fin_ms;
}
