/**
 * Aides des tests du lot « interrogation » : un run minuscule, en temps virtuel, contre l'éditeur
 * simulé piloté par un scénario écrit à la main.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Editeur, ReponseHttp, RequeteHttp, Transport } from "../../pipeline/interrogation/editeur.ts";
import { adaptateurSimule, ISSUES_NOMMEES, TransportSimule, type IssueSimulee, type Scenario } from "../../pipeline/interrogation/editeur-simule.ts";
import { executerRun, type BilanExecution } from "../../pipeline/interrogation/executer.ts";
import { ouvrirFenetre, type Fenetre } from "../../pipeline/interrogation/fenetre.ts";
import { HorlogeVirtuelle } from "../../pipeline/interrogation/horloge.ts";
import type { PlanInterrogation } from "../../pipeline/interrogation/plan.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import type { ReponseEcrite, RequetePlanifiee } from "../../pipeline/interrogation/types.ts";

export const DEBUT = "2026-12-01T06:00:00+01:00";
export const RUN_ID = "01KBCS0G00TE5T0R0N0000000A";
export const CLE_API = "cle-api-de-test-a-ne-jamais-ecrire";
export const FENETRE: Fenetre = ouvrirFenetre(DEBUT);

export function issue(nom: string): IssueSimulee {
  const trouvee = ISSUES_NOMMEES[nom];
  if (trouvee === undefined) throw new Error(`issue inconnue : ${nom}`);
  return trouvee;
}

/** Le `rang`-ième envoi d'un même corps reçoit l'issue de rang `rang` ; au-delà, le test échoue. */
export function scenarioScripte(noms: readonly string[]): Scenario {
  return (_corps, rang) => {
    const nom = noms[rang - 1];
    if (nom === undefined) throw new Error(`envoi n° ${rang} non prévu par le scénario`);
    return issue(nom);
  };
}

/** Enveloppe un transport et garde chaque réponse HTTP rendue, telle quelle. */
export class TransportEnregistreur implements Transport {
  readonly rendues: ReponseHttp[] = [];
  readonly interne: TransportSimule;

  constructor(interne: TransportSimule) {
    this.interne = interne;
  }

  async envoyer(requete: RequeteHttp, signal: AbortSignal): Promise<ReponseHttp> {
    const reponse = await this.interne.envoyer(requete, signal);
    this.rendues.push(reponse);
    return reponse;
  }
}

export function requete(surcharges: Partial<RequetePlanifiee> = {}): RequetePlanifiee {
  return {
    outil_id: "outil-alpha",
    alias_aveugle: "A01",
    modele_demande: "modele-simule",
    mode: "web_desactivee",
    question_id: "q_0a1b2c3d4e5f60718293a4b5c6d7e8f9",
    formulation_id: "3J6F1Q4R5S7T8V9W0X1Y2Z3A4B",
    texte: "Question de test, sans contenu réel.",
    echantillon: 1,
    ...surcharges,
  };
}

/** Options d'un appel à `Banc.executer` : seul le cas « écriture de la réponse structurée qui lève » en a besoin. */
export interface OptionsExecuter {
  /** Appelé sur le dépôt juste avant l'exécution, pour lui faire lever au moment d'écrire. */
  readonly depotPatch?: (depot: DepotReponses) => void;
}

export interface Banc {
  readonly racine: string;
  readonly fenetre: Fenetre;
  readonly horloge: HorlogeVirtuelle;
  readonly reponses: string;
  readonly tentatives: string;
  /** Un transport par outil, à créer avant `executer`. */
  readonly transports: Map<string, TransportEnregistreur>;
  editeur(outil_id: string, scenario: Scenario): void;
  executer(plan: PlanInterrogation, options?: OptionsExecuter): Promise<BilanExecution>;
  /** Les réponses écrites, relues du disque et validées. */
  lues(): readonly ReponseEcrite[];
  nettoyer(): void;
}

/** Un banc dont l'horloge part de `depart_ms` (le début de la fenêtre par défaut). */
export function banc(depart_ms?: number, racine = mkdtempSync(join(tmpdir(), "banc-interrogation-"))): Banc {
  const fenetre = FENETRE;
  const horloge = new HorlogeVirtuelle(depart_ms === undefined ? fenetre.debut_ms : depart_ms);
  const transports = new Map<string, TransportEnregistreur>();
  const reponses = join(racine, "volume", "reponses");
  const tentatives = join(racine, "volume", "tentatives");
  return {
    racine,
    fenetre,
    horloge,
    reponses,
    tentatives,
    transports,
    editeur(outil_id, scenario) {
      transports.set(outil_id, new TransportEnregistreur(new TransportSimule(horloge, scenario)));
    },
    executer(plan, options) {
      const editeurs = new Map<string, Editeur>(
        [...transports].map(([outil_id, transport]) => [outil_id, { adaptateur: adaptateurSimule(CLE_API), transport }]),
      );
      const depot = DepotReponses.ouvrir(reponses);
      options?.depotPatch?.(depot);
      return executerRun(plan, {
        run_id: RUN_ID,
        fenetre,
        horloge,
        depot,
        repertoire_tentatives: tentatives,
        editeurs,
      });
    },
    lues: () => DepotReponses.ouvrir(reponses).toutes(),
    nettoyer: () => rmSync(racine, { recursive: true, force: true }),
  };
}

export function plan(...requetes: readonly RequetePlanifiee[]): PlanInterrogation {
  const files = new Map<string, RequetePlanifiee[]>();
  for (const r of requetes) {
    const file = files.get(r.outil_id);
    if (file === undefined) files.set(r.outil_id, [r]);
    else file.push(r);
  }
  return files;
}

export function seule<T>(liste: readonly T[]): T {
  if (liste.length !== 1) throw new Error(`un seul élément attendu, ${liste.length} trouvés`);
  return liste[0] as T;
}

export function transportDe(b: Banc, outil_id = "outil-alpha"): TransportEnregistreur {
  const transport = b.transports.get(outil_id);
  if (transport === undefined) throw new Error(`pas de transport pour ${outil_id}`);
  return transport;
}

/** Instants (ms depuis le début de la fenêtre) où le serveur simulé a reçu chaque envoi. */
export function instantsRelatifs(b: Banc, outil_id = "outil-alpha"): readonly number[] {
  return transportDe(b, outil_id).interne.recues.map((r) => r.instant - b.fenetre.debut_ms);
}
