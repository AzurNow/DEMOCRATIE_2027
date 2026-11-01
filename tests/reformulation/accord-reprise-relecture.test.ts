/**
 * Constat 10 (revue du 2026-10-17) : la règle « formulation en vigueur » est écrite à la fois dans
 * la reprise de `pnpm reformuler` (`reprise.ts`, par `executer.ts:trier`) et dans la relecture
 * (`relecture.ts:questionsARelire`, ce que l'écran de relecture montre). Ce test les confronte sur
 * un même jeu de cas : la reprise ne saute une question (« deja_acceptee » ou « deja_validee ») QUE
 * si la relecture la montre déjà relisible (une proposition acceptée en vigueur) ou la tient déjà
 * pour promue en vigueur (une promotion dans `data/formulations/`), et réciproquement.
 *
 * Lot 10 (c) : l'oracle était `promotionEnVigueur` et `propositionRelisible`, exactement le code
 * qu'appelle `deciderReprise` — le test était tautologique. Il passe désormais, des deux côtés, par
 * les vrais points d'entrée : `trier` pour la reprise (Tache, `EtatReprise`), `questionsARelire`
 * pour la relecture (ce que `validation/serveur/formulations.ts` sert à l'écran). Une divergence
 * introduite dans `questionsARelire` (refus ignorés, promotion non filtrée…) le fait échouer.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import type { Tache } from "../../pipeline/reformulation/entrees.ts";
import type { EtatReprise } from "../../pipeline/reformulation/executer.ts";
import { trier } from "../../pipeline/reformulation/executer.ts";
import { questionsARelire, type ClePromotion } from "../../pipeline/reformulation/relecture.ts";
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
/** Identifiant de la proposition sonde : jamais celui d'une proposition du jeu de cas. */
const SONDE = "01JA0000000000000000000099";

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

/** Ce que l'écran de relecture montre pour cette question, par son seul point d'entrée. */
function montreeParLaRelecture(cas: Cas, propositions: readonly PropositionFormulation[]): boolean {
  const promues = new Map<string, ClePromotion>(cas.validee === null ? [] : [[cas.tache.question.id, cas.validee]]);
  const refus = [...cas.refus].map((proposition_id) => ({ proposition_id }));
  return questionsARelire([cas.tache], propositions, refus, promues).length > 0;
}

/**
 * La relecture tient la validée pour promue en vigueur : une proposition sonde, acceptée sur le
 * texte neutre et la position courants (donc relisible), n'est pas montrée — `questionsARelire`
 * ne retient plus une question dont la promotion est en vigueur.
 */
function promueSelonLaRelecture(cas: Cas): boolean {
  if (cas.validee === null) return false;
  const sonde = proposition(cas.tache, { cle: "sonde", id: SONDE });
  return !montreeParLaRelecture(cas, [sonde]);
}

type Issue = "a_appeler" | "deja_validee" | "deja_acceptee";

/** La règle : promue en vigueur ⇒ déjà validée ; sinon montrée ⇒ déjà acceptée ; sinon à appeler. */
function issueSelonLaRelecture(cas: Cas): Issue {
  if (promueSelonLaRelecture(cas)) return "deja_validee";
  return montreeParLaRelecture(cas, cas.propositions) ? "deja_acceptee" : "a_appeler";
}

function issueDeLaReprise(cas: Cas): Issue {
  const chemin = staging();
  ecrire(chemin, cas.propositions);
  const reprise: EtatReprise = { validee: () => cas.validee, refus: cas.refus };
  const triage = trier([cas.tache], chemin, reprise);
  if (triage.a_appeler.length === 1) return "a_appeler";
  return triage.deja_validees === 1 ? "deja_validee" : "deja_acceptee";
}

describe("accord reprise ↔ relecture (constat 10)", () => {
  it.each(CAS.map((cas) => [cas.intitule, cas] as const))("%s", (_intitule, cas) => {
    expect(issueDeLaReprise(cas)).toBe(issueSelonLaRelecture(cas));
  });

  it("le jeu de cas couvre les trois issues (sinon l'accord serait vide)", () => {
    const issues = new Set(CAS.map(issueSelonLaRelecture));
    expect([...issues].sort()).toEqual(["a_appeler", "deja_acceptee", "deja_validee"]);
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
