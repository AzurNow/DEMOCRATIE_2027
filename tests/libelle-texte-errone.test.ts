/**
 * Le libellé `CHANGEMENT_TEXTE_ERRONE` est la seule mémoire d'un retour en attente après un texte
 * extrait erroné : `renvoi-texte-errone.ts` reconnaît un retour déjà fait à ce texte exact dans
 * l'historique de l'item (docs/DETTE.md, 2026-09-24 n° 4). Le changer, même d'une virgule, ferait
 * repartir en attente tous les items déjà retournés. Ce test le fige.
 */

import { describe, expect, it } from "vitest";
import { lotJugeEncore, type JugementEnCours } from "../validation/domaine/renvoi-mesure.ts";
import type { SourceRenvoyee } from "../validation/domaine/renvoi-reextraction.ts";
import {
  CHANGEMENT_TEXTE_ERRONE,
  planifierTexteErrone,
  renvoyerEnAttente,
} from "../validation/domaine/renvoi-texte-errone.ts";
import type { EntreeDecision, Item } from "../validation/domaine/types.ts";
import { decision, itemP, source } from "./aides/fabriques.ts";

const DOCUMENT = "1".repeat(64);
const TEXTE_FAUX = "2".repeat(64);
const TRACE = { commit: "c".repeat(40), horodatage: "2026-11-02T10:00:00+01:00" };
const RENVOI: SourceRenvoyee = { sha256: DOCUMENT, texte_sha256: TEXTE_FAUX, url: "https://demo.invalid/p.pdf", items: ["rejete"] };

function item(): Item {
  const base = itemP().assertion as NonNullable<Item["assertion"]>;
  return itemP({ id: "01JBANCESSA1000000000LIBL1", assertion: { ...base, source: source() } });
}

function jugementComplet(i: Item): ReadonlyMap<string, JugementEnCours> {
  const decisions: readonly EntreeDecision[] = ["a1", "a2"].map((annotateur_id) =>
    decision({ annotateur_id, item: i, decision: "accepter" }),
  );
  return new Map([[i.id, { lot_id: "lot-009", annotateurs: ["a1", "a2"], decisions }]]);
}

function retoursPour(i: Item): number {
  const plan = planifierTexteErrone({ renvois: [RENVOI], items: [i], publies: new Map(), jugements: jugementComplet(i) });
  return plan.retours.length;
}

/** Le même item, retourné en attente, dont l'entrée d'historique porte `libelle` à la place du libellé. */
function retourneSousLibelle(libelle: string): Item {
  const retourne = renvoyerEnAttente(item(), [RENVOI], TRACE);
  const historique = (retourne.historique ?? []).map((entree) => {
    const { changement } = entree as { changement: string };
    return { ...(entree as object), changement: changement.replace(CHANGEMENT_TEXTE_ERRONE, libelle) };
  });
  return { ...retourne, historique };
}

describe("libellé CHANGEMENT_TEXTE_ERRONE", () => {
  it("sa valeur exacte est figée", () => {
    expect(CHANGEMENT_TEXTE_ERRONE).toBe("retour en attente, texte extrait erroné");
  });

  it("un historique portant ce libellé n'est pas renvoyé une seconde fois", () => {
    const retourne = renvoyerEnAttente(item(), [RENVOI], TRACE);
    const dernier = retourne.historique?.at(-1) as { changement: string };
    expect(dernier.changement.startsWith(`${CHANGEMENT_TEXTE_ERRONE} :`)).toBe(true);
    expect(retoursPour(item())).toBe(1);
    expect(retoursPour(retourne)).toBe(0);
    expect(lotJugeEncore(retourne, { item_version: retourne.version })).toBe(true);
  });

  it("un libellé voisin (casse) n'est pas reconnu : l'item repart en attente", () => {
    expect(retoursPour(retourneSousLibelle("Retour en attente, texte extrait erroné"))).toBe(1);
  });

  it("un libellé voisin (espace en trop ou en moins) n'est pas reconnu", () => {
    expect(retoursPour(retourneSousLibelle("retour en attente,  texte extrait erroné"))).toBe(1);
    expect(retoursPour(retourneSousLibelle("retour en attente,texte extrait erroné"))).toBe(1);
    expect(retoursPour(retourneSousLibelle(` ${CHANGEMENT_TEXTE_ERRONE}`))).toBe(1);
  });
});
