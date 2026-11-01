/**
 * Le bilan d'interrogation compte la part de manquantes sur le plan d'interrogation du run (§8,
 * protocole 0.21, D56 (2)), comme le go/no-go (`critereReponsesManquantes`, `partsDuRun`) : une
 * requête planifiée jamais tentée, ou tentée sans réponse écrite (en attente de l'opérateur), est
 * manquante. Avant ce lot, le bilan la comptait sur les seules réponses enregistrées et pouvait dire
 * « complet » là où le go/no-go disait « incomplet ».
 *
 * Réponses réelles : celles du run simulé de fixture (54 requêtes, toutes écrites), dont on retire
 * une partie pour figurer des requêtes jamais tentées.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { partsDuRun, ReponseHorsPlan, type RequeteDuPlan } from "../../analysis/seuils.ts";
import { critereReponsesManquantes } from "../../pipeline/go-no-go/criteres-run.ts";
import { bilanParCouple } from "../../pipeline/interrogation/bilan.ts";
import { lancerRunSimule } from "../../pipeline/interrogation/run-simule.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import type { ReponseEcrite } from "../../pipeline/interrogation/types.ts";
import { chargerPerimetre, type OutilDeRun } from "../../pipeline/questions/charger-perimetre.ts";

// Un run simulé réel (~3 s seul) : limite explicite et large, comme `run-dry.test.ts`.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const FIXTURES = join(import.meta.dirname, "fixtures/run-simule");

let racine: string;
let reponses: readonly ReponseEcrite[];
let plan: readonly RequeteDuPlan[];
let outils: readonly OutilDeRun[];

function requeteDe(r: ReponseEcrite): RequeteDuPlan {
  return { outil_id: r.outil_id, mode: r.mode, question_id: r.question_id, formulation_id: r.formulation_id, echantillon: r.echantillon };
}

beforeAll(async () => {
  racine = mkdtempSync(join(tmpdir(), "banc-bilan-test-"));
  const resultat = await lancerRunSimule({ sortie: racine, fixtures: FIXTURES });
  reponses = DepotReponses.ouvrir(resultat.disposition.reponses).toutes();
  // Toutes les requêtes du plan ont été écrites (54/54) : le plan est l'ensemble de leurs clés.
  expect(resultat.execution).toEqual({ ecrites: 54, deja_ecrites: 0, en_attente_operateur: [] });
  plan = reponses.map(requeteDe);
  const simule = JSON.parse(readFileSync(join(FIXTURES, "run-simule.json"), "utf8")) as { alias_aveugles: Record<string, string> };
  outils = chargerPerimetre(join(FIXTURES, "perimetre.yaml"), {
    items: [],
    mesures: [],
    alias_aveugles: new Map(Object.entries(simule.alias_aveugles)),
  }).perimetre.outils;
});

afterAll(() => {
  rmSync(racine, { recursive: true, force: true });
});

/** Retire les `nombre` premières réponses obtenues d'un couple : ses requêtes deviennent jamais tentées. */
function sansObtenues(outil_id: string, mode: string, nombre: number): readonly ReponseEcrite[] {
  const retirees = new Set(
    reponses
      .filter((r) => r.outil_id === outil_id && r.mode === mode && r.statut_reponse === "obtenue")
      .slice(0, nombre)
      .map((r) => r.id),
  );
  expect(retirees.size).toBe(nombre);
  return reponses.filter((r) => !retirees.has(r.id));
}

describe("bilanParCouple : la part de manquantes se compte sur le plan, comme le go/no-go", () => {
  it("des requêtes jamais tentées : le bilan et le go/no-go donnent la même part, couple par couple", () => {
    const enregistrees = sansObtenues("outil-alpha", "web_activee", 4);
    const bilan = bilanParCouple(enregistrees, plan);
    const parts = partsDuRun(outils, enregistrees, plan);
    expect(bilan.map((l) => [`${l.outil_id}/${l.mode}`, l.part_manquantes])).toEqual(
      parts.map(({ couple, part }) => [`${couple.outil_id}/${couple.mode}`, part]),
    );
    const alpha = bilan.find((l) => l.outil_id === "outil-alpha" && l.mode === "web_activee");
    // 4 jamais tentées sur 18 planifiées : 22 % > 20 %, incomplet au bilan comme au go/no-go.
    expect(alpha).toMatchObject({ obtenues: 14, sans_reponse: 4, part_manquantes: { numerateur: 4, denominateur: 18 }, run_incomplet: true });
    expect(critereReponsesManquantes(outils, enregistrees, plan)).toMatchObject({ statut: "rouge", valeur: 4 / 18 });
  });

  it("un couple dont aucune réponse n'est enregistrée garde sa ligne, toute manquante", () => {
    const enregistrees = reponses.filter((r) => r.outil_id !== "outil-beta");
    const beta = bilanParCouple(enregistrees, plan).find((l) => l.outil_id === "outil-beta");
    expect(beta).toMatchObject({ obtenues: 0, sans_reponse: 18, part_manquantes: { numerateur: 18, denominateur: 18 }, run_incomplet: true });
  });

  it("sur un run complet, chaque requête du plan est obtenue, manquante écrite ou sans réponse", () => {
    for (const ligne of bilanParCouple(reponses, plan)) {
      expect(ligne.sans_reponse).toBe(0);
      expect(ligne.obtenues + ligne.manquantes_echecs + ligne.manquantes_hors_fenetre + ligne.sans_reponse).toBe(ligne.part_manquantes.denominateur);
    }
  });

  it("une réponse enregistrée qu'aucune requête du plan n'attend lève ReponseHorsPlan", () => {
    expect(() => bilanParCouple(reponses, plan.slice(1))).toThrow(ReponseHorsPlan);
  });
});
