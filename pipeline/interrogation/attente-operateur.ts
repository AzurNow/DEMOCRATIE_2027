/**
 * §6 (protocole 0.22, D57 (2)) : « Tant qu'une réponse attend l'opérateur, le go/no-go du run ne se
 * prononce pas (section 12), et ni le test des liens ni la notation (section 7) ne commencent. »
 * Une seule garde, appelée par le go/no-go (`pipeline/go-no-go/go-no-go.ts`), par la notation
 * (`pipeline/notation/chaine.ts`) et, pour le test des liens (Python), par la commande
 * `pnpm interrogation:attente` (`outils/attente-operateur.ts`) : la lecture du journal n'est pas
 * réécrite ailleurs.
 *
 * Une requête attend l'opérateur quand le banc a reçu sa réponse sans pouvoir la stocker : aucune
 * réponse n'est écrite pour elle, et son journal de tentatives (`pipeline/interrogation/journal.ts`)
 * se relit en `recue_non_stockee` ou en `octets_sans_suite` — la même lecture que celle de
 * l'interrogation à la reprise (`executer.ts:executerRequete`), par la seule API de lecture du
 * journal, `JournalRequete.reprise()`. Rien n'est inscrit ici. Une requête dont la réponse est
 * stockée (par l'opérateur, depuis ses octets gardés) n'attend plus, quel que soit son journal :
 * seules les requêtes du plan sans réponse enregistrée sont relues (`analysis/seuils.ts:requetesSansReponse`).
 */

import { lireReponses, lireRunJson } from "../../analysis/lecture-run.ts";
import { requetesSansReponse, type RequeteDuPlan } from "../../analysis/seuils.ts";
import type { Reponse } from "../../analysis/types.ts";
import { JournalRequete } from "./journal.ts";
import { requetesDuPlanDuRun } from "./plan-du-run.ts";
import { dispositionDuRepertoire } from "./stockage.ts";
import { cleDe, type CleRequete } from "./types.ts";

/** L'étape qui refuse de commencer ; sa phrase est une donnée, pas une branche. */
export type EtapeRefusee = "go-no-go" | "liens" | "notation";

const PHRASE_DE_REFUS: Readonly<Record<EtapeRefusee, string>> = {
  "go-no-go": "le go/no-go du run ne se prononce pas (§12)",
  liens: "le test des liens ne commence pas (§7)",
  notation: "la notation ne commence pas (§7)",
};

export interface RequeteEnAttente {
  readonly requete: CleRequete;
  readonly genre: "recue_non_stockee" | "octets_sans_suite";
  /** La tentative dont la réponse a été reçue. */
  readonly numero: number;
}

export class ReponsesEnAttenteOperateur extends Error {
  readonly requetes: readonly RequeteEnAttente[];

  constructor(requetes: readonly RequeteEnAttente[], etape: EtapeRefusee) {
    const liste = requetes
      .map(({ requete, genre, numero }) =>
        `outil ${requete.outil_id}, question ${requete.question_id}, mode ${requete.mode}, formulation ${requete.formulation_id}, ` +
        `échantillon ${requete.echantillon} (${genre}, tentative ${numero})`,
      )
      .join(" ; ");
    super(
      `${requetes.length} requête(s) en attente de l'opérateur (§6) : ${liste}. Tant qu'une réponse attend l'opérateur ` +
        `(§6, protocole 0.22), ${PHRASE_DE_REFUS[etape]}. Rien n'est écrit.`,
    );
    this.name = "ReponsesEnAttenteOperateur";
    this.requetes = requetes;
  }
}

function enAttente(repertoire_tentatives: string, requete: RequeteDuPlan): RequeteEnAttente | null {
  const cle = cleDe(requete);
  const reprise = new JournalRequete(repertoire_tentatives, cle).reprise();
  if (reprise.genre === "tentatives") return null;
  return { requete: cle, genre: reprise.genre, numero: reprise.numero };
}

/** Parmi les requêtes sans réponse enregistrée, celles dont le journal dit qu'elles attendent l'opérateur, dans l'ordre reçu. */
export function requetesEnAttenteOperateur(repertoire_tentatives: string, sans_reponse: readonly RequeteDuPlan[]): readonly RequeteEnAttente[] {
  return sans_reponse.map((requete) => enAttente(repertoire_tentatives, requete)).filter((r): r is RequeteEnAttente => r !== null);
}

/** Refus nommé, avant toute écriture, tant qu'une requête attend l'opérateur. */
export function exigerAucuneAttenteOperateur(repertoire_tentatives: string, sans_reponse: readonly RequeteDuPlan[], etape: EtapeRefusee): void {
  const attente = requetesEnAttenteOperateur(repertoire_tentatives, sans_reponse);
  if (attente.length > 0) throw new ReponsesEnAttenteOperateur(attente, etape);
}

/**
 * La garde sur un run : `sans_reponse` est calculé comme le go/no-go (`requetesSansReponse`, sur le
 * plan d'interrogation du run), le journal lu sous `volume/tentatives/`. Un répertoire de tentatives
 * absent n'a aucun journal : aucune requête n'y attend (même lecture que `JournalRequete.reprise()`).
 */
export function exigerAucuneAttenteSurPlan(repertoire_run: string, reponses: readonly Reponse[], plan: readonly RequeteDuPlan[], etape: EtapeRefusee): void {
  exigerAucuneAttenteOperateur(dispositionDuRepertoire(repertoire_run).tentatives, requetesSansReponse(reponses, plan), etape);
}

/** Point d'entrée depuis le seul répertoire d'un run : lit `run.json`, les réponses et le plan. */
export function exigerAucuneAttenteDuRun(repertoire_run: string, etape: EtapeRefusee): void {
  const run = lireRunJson(repertoire_run);
  exigerAucuneAttenteSurPlan(repertoire_run, lireReponses(repertoire_run, run.id), requetesDuPlanDuRun(repertoire_run, run), etape);
}
