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
const B: CandidatDuRun = { candidat_id: "b", libelle: "Bela B", nom: "B" };
/** « a » interrogé ; « b » est au périmètre mais non interrogé. */
const INTERROGES: readonly CandidatDuRun[] = [A];
const PERIMETRE: readonly CandidatDuRun[] = [A, B];

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
    expect(estEligible(r, INTERROGES, PERIMETRE)).toBe(false);
  });

  it("une réponse qui nomme un candidat interrogé est éligible", () => {
    const r = { reponse: reponseDeTexte("Alix A propose une mesure."), references: [reference("a")] };
    expect(estEligible(r, INTERROGES, PERIMETRE)).toBe(true);
  });

  it("un refus de l'API n'est jamais éligible, même s'il nommait un interrogé", () => {
    const refus = reponseDeTexte("Alix A propose une mesure.");
    const r = { reponse: { ...refus, normalise: { ...refus.normalise, refus_api: true } }, references: [reference("a")] };
    expect(estEligible(r, INTERROGES, PERIMETRE)).toBe(false);
  });
});

/**
 * La recherche lit les formes de tout le périmètre, la plus longue occurrence gagne ; seule une
 * occurrence qui appartient à un interrogé rend la réponse éligible (§7, D55 (4)). Noms fictifs : un
 * non-interrogé « Inès Morel Le Brun » (nom seul « Morel Le Brun ») dont le nom contient le nom seul
 * « Le Brun » d'un interrogé.
 */
describe("estEligible : un nom de non-interrogé qui contient celui d'un interrogé", () => {
  const LE_BRUN: CandidatDuRun = { candidat_id: "le-brun", libelle: "Maxime Le Brun", nom: "Le Brun" };
  const GARNIER: CandidatDuRun = { candidat_id: "garnier", libelle: "Lou Garnier", nom: "Garnier" };
  const MOREL: CandidatDuRun = { candidat_id: "morel", libelle: "Inès Morel Le Brun", nom: "Morel Le Brun" };
  const BRUN: CandidatDuRun = { candidat_id: "brun", libelle: "Jo Brun", nom: "Brun" };
  const interroges = [LE_BRUN, GARNIER];
  const perimetre = [LE_BRUN, GARNIER, MOREL, BRUN];
  const de = (texte: string, candidat_id = "morel") => ({ reponse: reponseDeTexte(texte), references: [reference(candidat_id)] });

  it("le libellé ou le nom seul d'un non-interrogé, seul dans la réponse, ne la rend pas éligible", () => {
    expect(estEligible(de("Selon Inès Morel Le Brun, la TVA baissera."), interroges, perimetre)).toBe(false);
    expect(estEligible(de("Selon Morel Le Brun, la TVA baissera."), interroges, perimetre)).toBe(false);
  });

  it("le même texte qui nomme aussi « Le Brun » seul est éligible", () => {
    expect(estEligible(de("Selon Morel Le Brun, oui ; Le Brun dit non."), interroges, perimetre)).toBe(true);
  });

  it("chevauchement inverse : la forme d'un interrogé, plus longue, contient celle d'un non-interrogé, l'interrogé gagne", () => {
    expect(estEligible(de("Selon Le Brun, oui.", "brun"), interroges, perimetre)).toBe(true);
  });

  it("apostrophe typographique, casse différente : la normalisation de la recherche ne change pas", () => {
    expect(estEligible(de("Le programme d’Inès Morel Le Brun."), interroges, perimetre)).toBe(false);
    expect(estEligible(de("Le programme de MOREL LE BRUN."), interroges, perimetre)).toBe(false);
    expect(estEligible(de("Le programme d’Le Brun."), interroges, perimetre)).toBe(true);
  });

  it("un nom de non-interrogé dans l'item de référence ne rend pas éligible non plus", () => {
    const assertion = itemP().assertion;
    if (assertion === undefined) throw new Error("l'item P de test porte une assertion.");
    const item = itemP({ candidat_id: "morel", assertion: { ...assertion, paraphrase: "Inès Morel Le Brun veut baisser la TVA." } });
    const r = { reponse: reponseDeTexte("Une mesure sur la TVA."), references: [{ item, role: "principal" as const }] };
    expect(estEligible(r, interroges, perimetre)).toBe(false);
  });
});
