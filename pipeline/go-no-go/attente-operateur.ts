/**
 * §6 et §12 (protocole 0.21) : « Tant qu'une réponse attend l'opérateur, le go/no-go du run ne se
 * prononce pas. »
 *
 * Une requête attend l'opérateur quand le banc a reçu sa réponse sans pouvoir la stocker : aucune
 * réponse n'est écrite pour elle, et son journal de tentatives (`pipeline/interrogation/journal.ts`)
 * se relit en `recue_non_stockee` ou en `octets_sans_suite` — la même lecture que celle de
 * l'interrogation à la reprise (`executer.ts:executerRequete`), par la seule API de lecture du
 * journal, `JournalRequete.reprise()`. Rien n'est inscrit ici. Une requête dont la réponse est
 * stockée (par l'opérateur, depuis ses octets gardés) n'attend plus, quel que soit son journal :
 * seules les requêtes du plan sans réponse enregistrée sont relues (`analysis/seuils.ts:requetesSansReponse`).
 */

import type { RequeteDuPlan } from "../../analysis/seuils.ts";
import { JournalRequete } from "../interrogation/journal.ts";
import { cleDe, type CleRequete } from "../interrogation/types.ts";

export interface RequeteEnAttente {
  readonly requete: CleRequete;
  readonly genre: "recue_non_stockee" | "octets_sans_suite";
  /** La tentative dont la réponse a été reçue. */
  readonly numero: number;
}

export class ReponsesEnAttenteOperateur extends Error {
  readonly requetes: readonly RequeteEnAttente[];

  constructor(requetes: readonly RequeteEnAttente[]) {
    const liste = requetes
      .map(({ requete, genre, numero }) =>
        `outil ${requete.outil_id}, question ${requete.question_id}, mode ${requete.mode}, formulation ${requete.formulation_id}, ` +
        `échantillon ${requete.echantillon} (${genre}, tentative ${numero})`,
      )
      .join(" ; ");
    super(
      `${requetes.length} requête(s) en attente de l'opérateur (§6) : ${liste}. Tant qu'une réponse attend l'opérateur, le ` +
        `go/no-go du run ne se prononce pas (§12). Rien n'est écrit.`,
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
export function exigerAucuneAttenteOperateur(repertoire_tentatives: string, sans_reponse: readonly RequeteDuPlan[]): void {
  const attente = requetesEnAttenteOperateur(repertoire_tentatives, sans_reponse);
  if (attente.length > 0) throw new ReponsesEnAttenteOperateur(attente);
}
