/**
 * Le run simulé de `pnpm run:dry` : un run d'interrogation complet contre l'éditeur simulé, sans
 * réseau ni SDK, dans une fenêtre de 48 heures parcourue en temps virtuel. Deux modes, une seule
 * exécution (`executerSimulation`) :
 *
 * **Fixtures** (`lancerRunSimule`, sans `--run`). Entrées, toutes validées à la frontière :
 *   - `perimetre.yaml`, chargé par `pipeline/questions/charger-perimetre.ts` (même chargeur que
 *     `config/perimetre.yaml`) ;
 *   - `questions.json`, chaque question validée contre `schema/question.schema.json` ;
 *   - `run-simule.json` : identifiant du run, type du run, début de fenêtre, clé d'API fictive, alias aveugles,
 *     profil d'éditeur simulé de chaque outil interrogé.
 * Sortie : la disposition de `runs/README.md` sous la racine donnée — jamais `runs/` par défaut.
 *
 * **Run gelé** (`lancerRunGeleSimule`, `--run <répertoire>`, lot gel, PR 4). Périmètre, fenêtre,
 * identifiant et questions tirées sont lus du gel et vérifiés (`run-gele.ts`) ; seuls la clé d'API
 * fictive et les profils de l'éditeur simulé, qu'un run réel ne porte pas, viennent d'un fichier de
 * fixture. `statut: en_cours` est écrit avant la première tentative (D51 (1)) ; un run déjà
 * `en_cours` reprend sans réécrire `run.json`. Sortie : `<répertoire>/volume/…`.
 *
 * Dans les deux modes, un outil interrogé sans profil simulé est refusé (`ProfilSimuleAbsent`) avant
 * toute écriture, et chaque réponse est validée contre `schema/reponse.schema.json` au moment de son
 * écriture.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { valider } from "../../outils/schemas/valider.ts";
import { lireRunsDuDepot } from "../gel/precedent.ts";
import { exigerGelSimule } from "../run/simulation.ts";
import { chargerPerimetre } from "../questions/charger-perimetre.ts";
import type { Question } from "../questions/types.ts";
import { bilanParCouple, type LigneBilan } from "./bilan.ts";
import type { Editeur } from "./editeur.ts";
import { adaptateurSimule, scenarioParEmpreinte, TransportSimule } from "./editeur-simule.ts";
import { estObjetJson } from "./editeur.ts";
import { executerRun, type BilanExecution } from "./executer.ts";
import { ouvrirFenetre, type Fenetre } from "./fenetre.ts";
import { ECHANTILLONS } from "./conditions.ts";
import { horlogeSysteme, HorlogeVirtuelle } from "./horloge.ts";
import { planifier, type PlanInterrogation } from "./plan.ts";
import { inscrireDemarrage, lireRunGele } from "./run-gele.ts";
import { DepotReponses, dispositionDuRepertoire, dispositionRun, type DispositionRun } from "./stockage.ts";
import { stockerEnAttente, type BilanStockage } from "./stocker.ts";

/** Ce que l'éditeur simulé exige et qu'aucun run réel ne porte. */
interface Simulation {
  readonly cle_api: string;
  readonly profils: ReadonlyMap<string, readonly string[]>;
}

interface ParametresSimulation extends Simulation {
  readonly run_id: string;
  /** §6 (0.27) : règle l'ouverture de la fenêtre, avec `date_gel` du périmètre ; exigé, jamais supposé. */
  readonly type_run: string;
  readonly fenetre_debut: string;
  readonly alias_aveugles: ReadonlyMap<string, string>;
}

export interface ResultatRunSimule {
  readonly disposition: DispositionRun;
  readonly execution: BilanExecution;
  readonly bilan: readonly LigneBilan[];
}

/** Un outil du plan sans profil d'éditeur simulé : il n'est jamais simulé par défaut. */
export class ProfilSimuleAbsent extends Error {
  constructor(outil_id: string) {
    super(`Aucun profil d'éditeur simulé pour ${outil_id} : il ne sera pas simulé par défaut. Rien n'est écrit.`);
    this.name = "ProfilSimuleAbsent";
  }
}

function exigerTexte(objet: Readonly<Record<string, unknown>>, cle: string, provenance: string): string {
  const valeur = objet[cle];
  if (typeof valeur !== "string" || valeur.length === 0) throw new Error(`${provenance} : « ${cle} » absent ou vide.`);
  return valeur;
}

function exigerTable<T>(objet: Readonly<Record<string, unknown>>, cle: string, provenance: string, lire: (v: unknown) => T | null): ReadonlyMap<string, T> {
  const table = objet[cle];
  if (!estObjetJson(table)) throw new Error(`${provenance} : « ${cle} » n'est pas un objet.`);
  return new Map(
    Object.entries(table).map(([outil, valeur]) => {
      const lue = lire(valeur);
      if (lue === null) throw new Error(`${provenance} : « ${cle}.${outil} » mal formé.`);
      return [outil, lue] as const;
    }),
  );
}

function texteOuNull(valeur: unknown): string | null {
  return typeof valeur === "string" ? valeur : null;
}

function listeDeTextesOuNull(valeur: unknown): readonly string[] | null {
  return Array.isArray(valeur) && valeur.every((v) => typeof v === "string") ? valeur : null;
}

function lireObjet(chemin: string): Readonly<Record<string, unknown>> {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!estObjetJson(brut)) throw new Error(`${chemin} : pas un objet JSON.`);
  return brut;
}

function simulationDe(brut: Readonly<Record<string, unknown>>, chemin: string): Simulation {
  return {
    cle_api: exigerTexte(brut, "cle_api", chemin),
    profils: exigerTable(brut, "profils", chemin, listeDeTextesOuNull),
  };
}

function lireParametres(chemin: string): ParametresSimulation {
  const brut = lireObjet(chemin);
  return {
    ...simulationDe(brut, chemin),
    run_id: exigerTexte(brut, "run_id", chemin),
    type_run: exigerTexte(brut, "type_run", chemin),
    fenetre_debut: exigerTexte(brut, "fenetre_debut", chemin),
    alias_aveugles: exigerTable(brut, "alias_aveugles", chemin, texteOuNull),
  };
}

function lireQuestions(chemin: string): readonly Question[] {
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (!Array.isArray(brut)) throw new Error(`${chemin} : une liste de questions est attendue.`);
  return brut.map((question, rang) => valider<Question>("question", question, `${chemin}[${rang}]`));
}

function editeursSimules(outils: readonly string[], simulation: Simulation, horloge: HorlogeVirtuelle): ReadonlyMap<string, Editeur> {
  return new Map(
    outils.map((outil_id) => {
      const profil = simulation.profils.get(outil_id);
      if (profil === undefined) throw new ProfilSimuleAbsent(outil_id);
      const editeur: Editeur = {
        adaptateur: adaptateurSimule(simulation.cle_api),
        transport: new TransportSimule(horloge, scenarioParEmpreinte(profil)),
      };
      return [outil_id, editeur] as const;
    }),
  );
}

/** Ce que les deux modes donnent à l'exécution. */
interface Simulee {
  readonly plan: PlanInterrogation;
  readonly run_id: string;
  readonly fenetre: Fenetre;
  readonly disposition: DispositionRun;
  readonly simulation: Simulation;
  /** Appelé une fois les éditeurs construits, avant toute écriture du volume et toute tentative. */
  readonly avant_premiere_tentative: () => void;
}

async function executerSimulation(simulee: Simulee): Promise<ResultatRunSimule> {
  const { plan, disposition } = simulee;
  const horloge = new HorlogeVirtuelle(simulee.fenetre.debut_ms);
  const editeurs = editeursSimules([...plan.keys()], simulee.simulation, horloge);
  simulee.avant_premiere_tentative();
  const depot = DepotReponses.ouvrir(disposition.reponses);
  const execution = await executerRun(plan, {
    run_id: simulee.run_id,
    fenetre: simulee.fenetre,
    horloge,
    depot,
    repertoire_tentatives: disposition.tentatives,
    editeurs,
  });
  return { disposition, execution, bilan: bilanParCouple(depot.toutes(), [...plan.values()].flat()) };
}

export interface OptionsRunSimule {
  /** Racine sous laquelle le run est disposé (`<racine>/<date>/volume/…`). */
  readonly sortie: string;
  /** Répertoire des fixtures : `perimetre.yaml`, `questions.json`, `run-simule.json`. */
  readonly fixtures: string;
}

export async function lancerRunSimule(options: OptionsRunSimule): Promise<ResultatRunSimule> {
  const { fixtures } = options;
  const parametres = lireParametres(join(fixtures, "run-simule.json"));
  const perimetre = chargerPerimetre(join(fixtures, "perimetre.yaml"), {
    items: [],
    mesures: [],
    alias_aveugles: parametres.alias_aveugles,
  });
  return executerSimulation({
    // Sans gel, aucun run.json ne porte encore le nombre d'échantillons : celui du §6, comme le gel l'inscrirait.
    plan: planifier(perimetre.perimetre.outils, lireQuestions(join(fixtures, "questions.json")), ECHANTILLONS),
    run_id: parametres.run_id,
    // Un run simulé sur fixtures n'a pas de dépôt de runs : une réexécution y est refusée (run remplacé introuvable).
    fenetre: ouvrirFenetre(parametres.fenetre_debut, { type_run: parametres.type_run, date_gel: perimetre.date_gel }, () => []),
    disposition: dispositionRun(options.sortie, perimetre.date_gel),
    simulation: parametres,
    avant_premiere_tentative: () => undefined,
  });
}

export interface OptionsRunGeleSimule {
  /** Le répertoire du run gelé, `<sortie>/<date>/` tel que `pnpm geler --sortie` l'écrit. */
  readonly repertoire: string;
  /** Le fichier de la clé d'API fictive et des profils simulés, indexés par `outil_id`. */
  readonly profils: string;
  /** `runs/` du dépôt : le run que remplace une réexécution y est lu pour régler sa fenêtre (D74 (19)). */
  readonly runs: string;
}

export interface ResultatRunGeleSimule extends ResultatRunSimule {
  /** `demarre` : `en_cours` écrit avant la première tentative ; `reprend` : `run.json` non réécrit. */
  readonly demarrage: "demarre" | "reprend";
}

export async function lancerRunGeleSimule(options: OptionsRunGeleSimule): Promise<ResultatRunGeleSimule> {
  const gele = lireRunGele(options.repertoire, () => lireRunsDuDepot(options.runs));
  exigerGelSimule(options.repertoire, "pnpm run:dry --run");
  const simulation = simulationDe(lireObjet(options.profils), options.profils);
  const resultat = await executerSimulation({
    plan: planifier(gele.outils, gele.questions_tirees, gele.echantillons),
    run_id: gele.run_id,
    fenetre: gele.fenetre,
    disposition: dispositionDuRepertoire(gele.repertoire),
    simulation,
    avant_premiere_tentative: () => inscrireDemarrage(gele),
  });
  return { ...resultat, demarrage: gele.demarrage.issue };
}

export interface OptionsStockageGeleSimule extends OptionsRunGeleSimule {
  /** `--requete=<clé>` : l'empreinte de la clé canonique (`stocker.ts:cleDeRequete`) ; absente, tout le plan. */
  readonly requete?: string;
}

export interface ResultatStockageGeleSimule {
  readonly disposition: DispositionRun;
  readonly run_id: string;
  readonly stockage: BilanStockage;
}

/**
 * `pnpm interrogation:stocker --run` (§6, 0.21) : les réponses en attente d'un run gelé, stockées
 * depuis leurs octets gardés avec l'adaptateur de l'éditeur simulé qui a interrogé ce run. Rien
 * n'est envoyé, `run.json` n'est pas réécrit ; un outil du plan sans profil simulé est refusé
 * (`ProfilSimuleAbsent`) avant toute écriture. L'identifiant opaque d'une réponse stockée est tiré
 * à l'heure du système ; ses horodatages sont ceux de la réception d'origine.
 */
export function stockerRunGeleSimule(options: OptionsStockageGeleSimule): ResultatStockageGeleSimule {
  const gele = lireRunGele(options.repertoire, () => lireRunsDuDepot(options.runs));
  exigerGelSimule(options.repertoire, "pnpm interrogation:stocker");
  const simulation = simulationDe(lireObjet(options.profils), options.profils);
  const plan = planifier(gele.outils, gele.questions_tirees, gele.echantillons);
  const adaptateurs = new Map(
    [...plan.keys()].map((outil_id) => {
      if (!simulation.profils.has(outil_id)) throw new ProfilSimuleAbsent(outil_id);
      return [outil_id, adaptateurSimule(simulation.cle_api)] as const;
    }),
  );
  const disposition = dispositionDuRepertoire(gele.repertoire);
  const contexte = {
    run_id: gele.run_id,
    horloge: horlogeSysteme,
    depot: DepotReponses.ouvrir(disposition.reponses),
    repertoire_tentatives: disposition.tentatives,
    adaptateurs,
  };
  return { disposition, run_id: gele.run_id, stockage: stockerEnAttente(plan, contexte, options.requete) };
}
