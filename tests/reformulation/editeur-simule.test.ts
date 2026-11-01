/**
 * Éditeur simulé : quatre issues déterministes, choisies par question, qui passent par la même
 * exécution que l'éditeur réel. Aucun réseau, aucun contenu réel.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { choixParEmpreinte, editeurSimule, ISSUES_SIMULEES, MODELE_SIMULE } from "../../pipeline/reformulation/editeur-simule.ts";
import type { IssueSimulee } from "../../pipeline/reformulation/editeur-simule.ts";
import { tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { executer } from "../../pipeline/reformulation/executer.ts";
import { chargerPromptReformulation } from "../../pipeline/reformulation/prompt.ts";
import { lirePropositions } from "../../pipeline/reformulation/staging.ts";
import type { PropositionFormulation } from "../../pipeline/reformulation/staging.ts";
import { CANDIDATS, ITEMS, jamaisEcoulee, MESURE_BUDGET, MESURE_JARDIN } from "./aides.ts";

const TACHES = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
const TEXTE_PROMPT = chargerPromptReformulation();

const repertoires: string[] = [];
afterEach(() => {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

async function avecIssue(issue: IssueSimulee): Promise<readonly PropositionFormulation[]> {
  const staging = mkdtempSync(join(tmpdir(), "banc-reformuler-simule-"));
  repertoires.push(staging);
  const editeur = editeurSimule(TEXTE_PROMPT, TACHES.map((tache) => tache.demande), () => issue);
  await executer(
    { a_appeler: TACHES, deja_acceptees: 0, deja_validees: 0, en_attente_operateur: [] },
    {
      editeur,
      texte_prompt: TEXTE_PROMPT,
      perimetre: CANDIDATS,
      staging,
      plafond: null,
      maintenant: () => Date.parse("2026-11-02T09:15:00Z"),
      delai_abandon_ms: null,
      attendre: jamaisEcoulee,
      signaler: () => undefined,
    },
  );
  expect(editeur.transport.recues).toHaveLength(TACHES.length);
  return TACHES.flatMap((tache) => lirePropositions(staging, tache.question.id));
}

describe("éditeur simulé", () => {
  it("sortie acceptée : toutes les questions passent le contrôle, modèle simulé déclaré", async () => {
    const propositions = await avecIssue("acceptee");
    expect(propositions.map((proposition) => proposition.issue.statut)).toEqual(TACHES.map(() => "acceptee"));
    expect(new Set(propositions.map((proposition) => proposition.production.modele))).toEqual(new Set([MODELE_SIMULE]));
  });

  it("sortie rejetée : bloc de code ⇒ rejetee bloc_de_code", async () => {
    for (const proposition of await avecIssue("rejetee")) expect(proposition.issue).toMatchObject({ statut: "rejetee", motif: "bloc_de_code" });
  });

  it("500 ⇒ echec_http, corps JSON dans brut", async () => {
    for (const proposition of await avecIssue("http_500")) {
      expect(proposition.issue).toEqual({ statut: "echec_http" });
      expect(proposition.appel).toHaveProperty("brut");
    }
  });

  it("corps non JSON ⇒ rejetee corps_illisible, brut_texte", async () => {
    for (const proposition of await avecIssue("non_json")) {
      expect(proposition.issue).toMatchObject({ statut: "rejetee", motif: "corps_illisible" });
      expect(proposition.appel).toHaveProperty("brut_texte");
    }
  });

  it("le choix par empreinte est déterministe et reste parmi les quatre issues", () => {
    for (const tache of TACHES) {
      expect(ISSUES_SIMULEES).toContain(choixParEmpreinte(tache.demande));
      expect(choixParEmpreinte(tache.demande)).toBe(choixParEmpreinte(tache.demande));
    }
  });

  it("un prompt pour aucune demande connue ⇒ erreur, jamais une réponse inventée", async () => {
    const editeur = editeurSimule(TEXTE_PROMPT, [], () => "acceptee");
    const requete = editeur.adaptateur.construireRequete("prompt inconnu");
    expect(() => editeur.transport.envoyer(requete)).toThrow(/aucune demande connue/u);
  });
});
