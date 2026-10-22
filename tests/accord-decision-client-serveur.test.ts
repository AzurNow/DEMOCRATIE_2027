/**
 * Accord entre ce qu'envoie `app.ts:soumettre()` (`RequeteDecision`, `validation/client/api.ts`)
 * et ce que `lireRequeteDecision` connaît (`CHAMPS_DECISION`, `validation/serveur/lecture-requetes.ts`),
 * sur le modèle de `tests/grille-client.test.ts` pour `CLES_GRILLE`.
 *
 * Le constat de la relecture du Lot 8d : `api.decider(charge: unknown)` n'était pas typé, donc
 * rien ne garantissait que la forme de `charge` (côté client) reste alignée avec `CHAMPS_DECISION`
 * (côté serveur). Une clé ajoutée d'un seul côté ferait refuser chaque décision en 400. `toutesLesCles`
 * ci-dessous n'existe que pour forcer, par construction, un objet qui porte exactement les clés de
 * `RequeteDecision` ; `Record<keyof RequeteDecision, true>` fait échouer `pnpm check` si une clé
 * manque ou est en trop par rapport au type. Le test compare ensuite cet ensemble à `CHAMPS_DECISION`.
 */

import { describe, expect, it } from "vitest";
import type { RequeteDecision } from "../validation/client/api.ts";
import { CHAMPS_DECISION } from "../validation/serveur/lecture-requetes.ts";

describe("accord des champs de /api/decisions entre client et serveur (relecture Lot 8d)", () => {
  it("les clés de RequeteDecision (client) sont exactement celles de CHAMPS_DECISION (serveur)", () => {
    const toutesLesClesDeRequeteDecision: Record<keyof RequeteDecision, true> = {
      lot_id: true,
      item_id: true,
      decision: true,
      reponses_grille: true,
      reponses_par_etat: true,
      questions_specifiques: true,
      corrections: true,
      commentaire: true,
      duree_affichage_ms: true,
      duree_active_ms: true,
    };

    expect(Object.keys(toutesLesClesDeRequeteDecision).sort()).toEqual([...CHAMPS_DECISION].sort());
  });
});
