/**
 * Reprise : lecture des deux fichiers de la PR C (`data/formulations/<id>.json` et
 * `validation/formulations/refus.jsonl`) par leurs seuls lecteurs, validés contre leurs schémas, et
 * décision par question. Fichier absent ⇒ vide ; fichier
 * présent mais illisible ou non conforme ⇒ erreur nommée.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  deciderReprise,
  validee,
  FormulationValideeIllisible,
  JournalRefusIllisible,
  lireRefus,
} from "../../pipeline/reformulation/reprise.ts";
import type { EtatQuestion } from "../../pipeline/reformulation/reprise.ts";
import type { PositionDemandee } from "../../pipeline/reformulation/position-affirmee.ts";
import type { QuestionCourante } from "../../pipeline/reformulation/relecture.ts";
import type { QuestionEngendree } from "../../pipeline/questions/types.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { formulationsValideesDeTest, ligneRefusDeTest } from "./aides.ts";

const QUESTION = "q_0123456789abcdef0123456789abcdef";
const TEXTE_NEUTRE = "Texte neutre de test pour la reprise.";
const EMPREINTE = sha256(TEXTE_NEUTRE);
const AUTRE = "b".repeat(64);
const ID_1 = "01JA0000000000000000000001";
const ID_2 = "01JA0000000000000000000002";

/** La question et la position demandée courantes, telles que `executer.ts` les construit (`Tache`). */
function courante(position_affirmee: PositionDemandee, texte_neutre = TEXTE_NEUTRE): QuestionCourante {
  const question: QuestionEngendree = {
    id: QUESTION,
    gabarit: "Q-FER",
    items: [],
    grappe_id: "g1",
    theme: "education",
    texte_neutre,
    version_gabarits: "0.1.0",
  };
  return { question, demande: { position_affirmee } };
}

const repertoires: string[] = [];
function repertoire(): string {
  const chemin = mkdtempSync(join(tmpdir(), "banc-reprise-"));
  repertoires.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function proposition(
  id: string,
  statut: "acceptee" | "rejetee" | "echec_http",
  empreinte = EMPREINTE,
  position: PositionDemandee = "pour",
): PropositionFormulation {
  const issues = {
    acceptee: { statut: "acceptee", familier: { texte: "f" }, oriente: { texte: "o" } },
    rejetee: { statut: "rejetee", motif: "json_invalide", detail: "d" },
    echec_http: { statut: "echec_http" },
  } as const;
  return {
    id,
    question_id: QUESTION,
    empreinte_texte_neutre: empreinte,
    demande: { position_affirmee: position },
    issue: issues[statut],
  } as unknown as PropositionFormulation;
}

function etat(partiel: Partial<EtatQuestion>): EtatQuestion {
  return { courante: courante("pour"), validee: null, propositions: [], refus: new Set(), ...partiel };
}

describe("data/formulations/<question_id>.json", () => {
  it("absent ⇒ null", () => {
    expect(validee(repertoire(), QUESTION)).toBeNull();
  });

  it("présent ⇒ son empreinte du texte neutre", () => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), JSON.stringify(formulationsValideesDeTest(QUESTION, EMPREINTE)));
    expect(validee(dossier, QUESTION)?.empreinte_texte_neutre).toBe(EMPREINTE);
  });

  it("Q1 (a) : présent ⇒ aussi la position affirmée par l'orientée, AUCUNE quand elle n'en porte pas", () => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), JSON.stringify(formulationsValideesDeTest(QUESTION, EMPREINTE, "contre")));
    expect(validee(dossier, QUESTION)).toEqual({ empreinte_texte_neutre: EMPREINTE, position: "contre" });
    writeFileSync(join(dossier, `${QUESTION}.json`), JSON.stringify(formulationsValideesDeTest(QUESTION, EMPREINTE, "AUCUNE")));
    expect(validee(dossier, QUESTION)).toEqual({ empreinte_texte_neutre: EMPREINTE, position: "AUCUNE" });
  });

  it("objet partiel, non conforme au schéma formulations-validees ⇒ FormulationValideeIllisible", () => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), JSON.stringify({ question_id: QUESTION, empreinte_texte_neutre: EMPREINTE, autre: 1 }));
    expect(() => validee(dossier, QUESTION)).toThrow(FormulationValideeIllisible);
  });

  it.each([
    ["JSON illisible", "{"],
    ["un tableau", "[]"],
    ["question_id d'une autre question", JSON.stringify({ question_id: "q_autre", empreinte_texte_neutre: EMPREINTE })],
    ["empreinte absente", JSON.stringify({ question_id: QUESTION })],
    ["empreinte qui n'est pas un sha256", JSON.stringify({ question_id: QUESTION, empreinte_texte_neutre: "ABC" })],
  ])("%s ⇒ FormulationValideeIllisible", (_cas, contenu) => {
    const dossier = repertoire();
    writeFileSync(join(dossier, `${QUESTION}.json`), contenu);
    expect(() => validee(dossier, QUESTION)).toThrow(FormulationValideeIllisible);
  });
});

describe("validation/formulations/refus.jsonl", () => {
  it("absent ⇒ aucun refus", () => {
    expect(lireRefus(join(repertoire(), "refus.jsonl"))).toEqual(new Set());
  });

  it("une ligne par refus, fin de fichier permise", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${ligneRefusDeTest(ID_1)}\n${ligneRefusDeTest(ID_2)}\n`);
    expect(lireRefus(chemin)).toEqual(new Set([ID_1, ID_2]));
  });

  it("ligne partielle, non conforme au schéma refus-formulation ⇒ JournalRefusIllisible", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: ID_1, motif: "sens" })}\n`);
    expect(() => lireRefus(chemin)).toThrow(JournalRefusIllisible);
  });

  it("fichier vide ⇒ aucun refus", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, "");
    expect(lireRefus(chemin)).toEqual(new Set());
  });

  it("cas limite 17 : une ligne illisible ⇒ JournalRefusIllisible qui nomme la ligne", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${ligneRefusDeTest(ID_1)}\n{pas du json\n`);
    expect(() => lireRefus(chemin)).toThrow(JournalRefusIllisible);
    expect(() => lireRefus(chemin)).toThrow(/ligne 2/u);
  });

  it("ligne vide au milieu ⇒ JournalRefusIllisible", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${ligneRefusDeTest(ID_1)}\n\n${ligneRefusDeTest(ID_2)}\n`);
    expect(() => lireRefus(chemin)).toThrow(/ligne 2/u);
  });

  it("proposition_id absent ou qui n'est pas un ULID ⇒ JournalRefusIllisible", () => {
    const chemin = join(repertoire(), "refus.jsonl");
    writeFileSync(chemin, `${JSON.stringify({ id: ID_1 })}\n`);
    expect(() => lireRefus(chemin)).toThrow(/proposition_id/u);
    writeFileSync(chemin, `${JSON.stringify({ proposition_id: "abc" })}\n`);
    expect(() => lireRefus(chemin)).toThrow(/proposition_id/u);
  });
});

describe("décision de reprise", () => {
  it("cas limite 7 : acceptée sur le même texte neutre ⇒ déjà acceptée, pas d'appel", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee")] }))).toBe("deja_acceptee");
  });

  it("cas limite 7 : acceptée sur un autre texte neutre ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee", AUTRE)] }))).toBe("a_appeler");
  });

  it("cas limite 7 : seulement des rejets et des échecs ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "rejetee"), proposition(ID_2, "echec_http")] }))).toBe("a_appeler");
  });

  it("aucune proposition ⇒ à appeler", () => {
    expect(deciderReprise(etat({}))).toBe("a_appeler");
  });

  it("cas limite 15 : validée sur la même empreinte ⇒ déjà validée ; sur une autre ⇒ à appeler", () => {
    expect(deciderReprise(etat({ validee: { empreinte_texte_neutre: EMPREINTE, position: "pour" } }))).toBe("deja_validee");
    expect(deciderReprise(etat({ validee: { empreinte_texte_neutre: AUTRE, position: "pour" } }))).toBe("a_appeler");
  });

  it("cas limite 16 : acceptée puis refusée à la relecture ⇒ à appeler", () => {
    expect(deciderReprise(etat({ propositions: [proposition(ID_1, "acceptee")], refus: new Set([ID_1]) }))).toBe("a_appeler");
  });

  it("une acceptée refusée et une autre acceptée non refusée ⇒ déjà acceptée", () => {
    const propositions = [proposition(ID_1, "acceptee"), proposition(ID_2, "acceptee")];
    expect(deciderReprise(etat({ propositions, refus: new Set([ID_1]) }))).toBe("deja_acceptee");
  });
});

describe("Q1, option (a) : position demandée recalculée sur l'item courant", () => {
  it("item corrigé (« pour » → « contre »), validée sur l'ancienne position, même empreinte ⇒ à appeler", () => {
    const corrige = etat({ courante: courante("contre"), validee: { empreinte_texte_neutre: EMPREINTE, position: "pour" } });
    expect(deciderReprise(corrige)).toBe("a_appeler");
  });

  it("item corrigé, acceptée sur l'ancienne position, même empreinte ⇒ à appeler", () => {
    expect(deciderReprise(etat({ courante: courante("contre"), propositions: [proposition(ID_1, "acceptee")] }))).toBe("a_appeler");
  });

  it("validée ou acceptée sur la position courante ⇒ inchangé", () => {
    expect(
      deciderReprise(etat({ courante: courante("contre"), validee: { empreinte_texte_neutre: EMPREINTE, position: "contre" } })),
    ).toBe("deja_validee");
    expect(
      deciderReprise(etat({ courante: courante("contre"), propositions: [proposition(ID_1, "acceptee", EMPREINTE, "contre")] })),
    ).toBe("deja_acceptee");
  });

  it("AUCUNE : validée sans position ⇒ déjà validée ; validée avec une position ⇒ à appeler", () => {
    expect(
      deciderReprise(etat({ courante: courante("AUCUNE"), validee: { empreinte_texte_neutre: EMPREINTE, position: "AUCUNE" } })),
    ).toBe("deja_validee");
    expect(
      deciderReprise(etat({ courante: courante("AUCUNE"), validee: { empreinte_texte_neutre: EMPREINTE, position: "pour" } })),
    ).toBe("a_appeler");
  });
});
