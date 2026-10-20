/**
 * Éligibilité au sous-ensemble du test contrefactuel (D55 (4), §7 (0.19)) : `estEligible`
 * (`chaine.ts`) ne considère que les candidats interrogés au run, ceux que le dérangement permute.
 * Une réponse qui ne nomme qu'un candidat au périmètre mais non interrogé n'est pas éligible.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { estEligible } from "../../pipeline/notation/chaine.ts";
import type { ReferenceSoumise } from "../../pipeline/notation/charge-juge.ts";
import type { CandidatDuRun } from "../../pipeline/notation/types.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { itemP } from "../aides/fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

const A: CandidatDuRun = { candidat_id: "a", libelle: "Alix A", nom: "A" };
/** « a » interrogé ; « b » (ci-dessous, dans les textes et les items) est au périmètre mais non interrogé. */
const INTERROGES: readonly CandidatDuRun[] = [A];

function reponseDeTexte(texte: string): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>("reponse", { ...lue, normalise: { ...lue.normalise, texte } }, "réponse de test (éligibilité D55 (4))");
}

function reference(candidat_id: string): ReferenceSoumise {
  return { item: itemP({ candidat_id }), role: "principal" };
}

describe("estEligible (D55 (4))", () => {
  it("une réponse et son item qui ne nomment qu'un candidat au périmètre mais non interrogé ne sont pas éligibles", () => {
    const r = { reponse: reponseDeTexte("Bela B propose une mesure."), references: [reference("b")] };
    expect(estEligible(r, INTERROGES)).toBe(false);
  });

  it("une réponse qui nomme un candidat interrogé est éligible", () => {
    const r = { reponse: reponseDeTexte("Alix A propose une mesure."), references: [reference("a")] };
    expect(estEligible(r, INTERROGES)).toBe(true);
  });

  it("un refus de l'API n'est jamais éligible, même s'il nommait un interrogé", () => {
    const refus = reponseDeTexte("Alix A propose une mesure.");
    const r = { reponse: { ...refus, normalise: { ...refus.normalise, refus_api: true } }, references: [reference("a")] };
    expect(estEligible(r, INTERROGES)).toBe(false);
  });
});
