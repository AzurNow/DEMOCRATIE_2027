/**
 * Constat 10 (revue du 2026-10-17) : la règle « formulation en vigueur » est écrite à la fois dans
 * la reprise de `pnpm reformuler` (`reprise.ts`, par `executer.ts:trier`) et dans la relecture
 * (`relecture.ts:propositionRelisible`, `promotionEnVigueur`). Ce test les confronte sur un même
 * jeu de cas : la reprise ne saute une question (« deja_acceptee » ou « deja_validee ») QUE si la
 * relecture la montre déjà relisible (une proposition acceptée en vigueur) ou déjà en vigueur (une
 * promotion dans `data/formulations/`), et réciproquement.
 *
 * Écrit avant la refonte du constat 10 : il passe sur les quatre copies actuelles de la règle
 * (elles concordent) et n'est pas modifié par la refonte, qui ne change aucun comportement
 * observable. Il passe par `trier` (Tache, `EtatReprise`) plutôt que par `EtatQuestion` : cette
 * frontière ne change pas, que `reprise.ts` réimplémente la règle ou délègue à `relecture.ts`.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import type { EtatReprise } from "../../pipeline/reformulation/executer.ts";
import { trier } from "../../pipeline/reformulation/executer.ts";
import { promotionEnVigueur, propositionRelisible, type ClePromotion } from "../../pipeline/reformulation/relecture.ts";
import { ecrireProposition, type PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { jeu, jeuO, proposition, questionDe, surAutreTexte } from "./fabriques-relecture.ts";

const { taches } = jeu();
const FER = questionDe(taches, "Q-FER");
const FER_CONTRE = questionDe(jeu("contre").taches, "Q-FER");
const ATT = questionDe(taches, "Q-ATT");

const repertoires: string[] = [];
function staging(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-accord-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function ecrire(chemin: string, propositions: readonly PropositionFormulation[]): void {
  for (const une of propositions) ecrireProposition(chemin, une);
}

interface Cas {
  readonly intitule: string;
  readonly tache: Tache;
  readonly validee: ClePromotion | null;
  readonly propositions: readonly PropositionFormulation[];
  readonly refus: ReadonlySet<string>;
}

const AUCUN_REFUS: ReadonlySet<string> = new Set();

function cle(tache: Tache, position = tache.demande.position_affirmee): ClePromotion {
  return { empreinte_texte_neutre: sha256(tache.question.texte_neutre), position };
}

const CAS: readonly Cas[] = [
  { intitule: "aucune proposition, aucune validée", tache: FER, validee: null, propositions: [], refus: AUCUN_REFUS },
  {
    intitule: "acceptée, même texte neutre et même position ⇒ en vigueur",
    tache: FER,
    validee: null,
    propositions: [proposition(FER, { cle: "a" })],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "acceptée sur un autre texte neutre ⇒ périmée",
    tache: FER,
    validee: null,
    propositions: [proposition(FER, { cle: "a", texte_neutre: `${FER.question.texte_neutre} (ancien)` })],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "acceptée sur la même empreinte mais une autre position (item corrigé) ⇒ périmée",
    tache: FER_CONTRE,
    validee: null,
    propositions: [proposition(FER, { cle: "a" })],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "acceptée en vigueur mais refusée à la relecture ⇒ écartée",
    tache: FER,
    validee: null,
    propositions: [proposition(FER, { cle: "a", id: "01JA0000000000000000000001" })],
    refus: new Set(["01JA0000000000000000000001"]),
  },
  {
    intitule: "une refusée et une autre acceptée non refusée ⇒ la seconde reste en vigueur",
    tache: FER,
    validee: null,
    propositions: [
      proposition(FER, { cle: "refusee", id: "01JA0000000000000000000001" }),
      proposition(FER, { cle: "non_refusee", id: "01JA0000000000000000000002" }),
    ],
    refus: new Set(["01JA0000000000000000000001"]),
  },
  {
    intitule: "seulement rejetées ou en échec de transport ⇒ jamais en vigueur",
    tache: FER,
    validee: null,
    propositions: [
      proposition(FER, { cle: "rejetee", statut: "rejetee", id: "01JA0000000000000000000001" }),
      proposition(FER, { cle: "echec", statut: "echec_http", id: "01JA0000000000000000000002" }),
    ],
    refus: AUCUN_REFUS,
  },
  { intitule: "validée sur la même empreinte et la même position ⇒ en vigueur", tache: FER, validee: cle(FER), propositions: [], refus: AUCUN_REFUS },
  {
    intitule: "validée sur une autre empreinte (texte neutre différent) ⇒ périmée",
    tache: FER,
    validee: { empreinte_texte_neutre: "0".repeat(64), position: FER.demande.position_affirmee },
    propositions: [],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "validée sur la même empreinte mais une autre position (item corrigé) ⇒ périmée",
    tache: FER_CONTRE,
    validee: cle(FER),
    propositions: [],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "validée en vigueur ET une acceptée en vigueur : les deux sont visibles de la relecture",
    tache: FER,
    validee: cle(FER),
    propositions: [proposition(FER, { cle: "a" })],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "question d'attribution (AUCUNE) : validée sans position ⇒ en vigueur",
    tache: ATT,
    validee: cle(ATT),
    propositions: [],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "question d'attribution (AUCUNE) : validée avec une position affirmée ⇒ périmée",
    tache: ATT,
    validee: { empreinte_texte_neutre: sha256(ATT.question.texte_neutre), position: "pour" },
    propositions: [],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "item O dont l'état antérieur change : acceptée sur l'ancien état ⇒ périmée",
    tache: questionDe(jeuO("contre", "pour").taches, "Q-FER"),
    validee: null,
    propositions: [proposition(questionDe(jeuO("pour", "contre").taches, "Q-FER"), { cle: "a" })],
    refus: AUCUN_REFUS,
  },
  {
    intitule: "acceptée en vigueur sur un autre texte neutre, par surAutreTexte",
    tache: FER,
    validee: null,
    propositions: [proposition(surAutreTexte(FER), { cle: "a" })],
    refus: AUCUN_REFUS,
  },
];

function visibleDeLaRelecture(cas: Cas): boolean {
  if (promotionEnVigueur(cas.validee ?? undefined, cas.tache)) return true;
  return propositionRelisible(cas.tache, cas.propositions, cas.refus) !== null;
}

describe("accord reprise ↔ relecture (constat 10)", () => {
  it.each(CAS.map((cas) => [cas.intitule, cas] as const))("%s", (_intitule, cas) => {
    const chemin = staging();
    ecrire(chemin, cas.propositions);
    const reprise: EtatReprise = { validee: () => cas.validee, refus: cas.refus };
    const triage = trier([cas.tache], chemin, reprise);
    const sautee = triage.a_appeler.length === 0;
    expect(sautee).toBe(visibleDeLaRelecture(cas));
    if (sautee) {
      expect(triage.deja_validees === 1 ? "deja_validee" : "deja_acceptee").toBe(
        promotionEnVigueur(cas.validee ?? undefined, cas.tache) ? "deja_validee" : "deja_acceptee",
      );
    }
  });

  it("validée en vigueur l'emporte sur une acceptée en vigueur (même ordre que la relecture)", () => {
    const cas = CAS.find((une) => une.intitule.startsWith("validée en vigueur ET"));
    if (cas === undefined) throw new Error("cas introuvable");
    const chemin = staging();
    ecrire(chemin, cas.propositions);
    const reprise: EtatReprise = { validee: () => cas.validee, refus: cas.refus };
    const triage = trier([cas.tache], chemin, reprise);
    expect(triage.deja_validees).toBe(1);
    expect(triage.deja_acceptees).toBe(0);
  });
});
