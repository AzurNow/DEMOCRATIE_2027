/**
 * Remplacement des noms dans un texte, et mentions résiduelles (§7, D14 (2) ; DETTE 2026-10-05,
 * point 3). Cas limites 2 à 6 du brief de la PR B du lot notation.
 */

import { describe, expect, it } from "vitest";
import type { Derangement } from "../../pipeline/notation/derangement.ts";
import { nommeUnInterroge, permuterTexte } from "../../pipeline/notation/permutation.ts";
import type { CandidatDuRun } from "../../analysis/types-notation.ts";
import { CANDIDATS_DU_RUN } from "./fabriques.ts";

function candidat(id: string): CandidatDuRun {
  const trouve = CANDIDATS_DU_RUN.find((c) => c.candidat_id === id);
  if (trouve === undefined) throw new Error(`candidat de test inconnu : ${id}`);
  return trouve;
}

/** Un dérangement posé à la main : source → image. */
function derangement(images: Readonly<Record<string, string>>): Derangement {
  return { paires: Object.entries(images).map(([source, image]) => ({ source: candidat(source), image: candidat(image) })), hors_derangement: [] };
}

/** alpha → beta → gamma → alpha. */
const CYCLE = derangement({ "demo-alpha": "demo-beta", "demo-beta": "demo-gamma", "demo-gamma": "demo-alpha" });
/** alpha ↔ beta : le dérangement d'un run à deux candidats. */
const ECHANGE = derangement({ "demo-alpha": "demo-beta", "demo-beta": "demo-alpha" });

describe("remplacement exact", () => {
  it("libellé puis nom seul chevauchant : chacun remplacé par la bonne forme, sans double remplacement", () => {
    const sortie = permuterTexte("Maxime Le Brun l'a dit. Plus tard, Le Brun a précisé.", CYCLE);
    expect(sortie.texte).toBe("Camille Ollivier l'a dit. Plus tard, Ollivier a précisé.");
    expect(sortie.remplacements).toBe(2);
    expect(sortie.mentions_residuelles).toBe(0);
  });

  it("échange A↔B dans un texte qui nomme A et B : B…A, pas B…B", () => {
    const sortie = permuterTexte("Alix Martinez répond à Maxime Le Brun ; Martinez insiste, Le Brun aussi.", ECHANGE);
    expect(sortie.texte).toBe("Maxime Le Brun répond à Alix Martinez ; Le Brun insiste, Martinez aussi.");
  });

  it("un nom substitué n'est jamais relu : le remplaçant d'un candidat n'est pas remplacé à son tour", () => {
    // Martinez → Le Brun, et Le Brun → Ollivier : « Le Brun » produit par le premier remplacement reste.
    expect(permuterTexte("Martinez, puis Le Brun.", CYCLE).texte).toBe("Le Brun, puis Ollivier.");
  });

  it("apostrophe typographique et droite, tiret, ponctuation : remplacés", () => {
    expect(permuterTexte("Le programme d’Ollivier et celui d'Ollivier.", CYCLE).texte).toBe(
      "Le programme d’Martinez et celui d'Martinez.",
    );
    expect(permuterTexte("Le duo Martinez-Ollivier (Martinez) : « Martinez » !", CYCLE).texte).toBe(
      "Le duo Le Brun-Martinez (Le Brun) : « Le Brun » !",
    );
  });

  it("« Martinezville » n'est pas un nom de candidat : pas remplacé", () => {
    const sortie = permuterTexte("Une réunion à Martinezville.", CYCLE);
    expect(sortie.texte).toBe("Une réunion à Martinezville.");
    expect(sortie.remplacements).toBe(0);
    expect(sortie.mentions_residuelles).toBe(0);
  });

  it("aucune normalisation : espaces, casse et ponctuation hors des noms restent octet pour octet", () => {
    const texte = "  Selon Martinez,\n\tla TVA…  ";
    expect(permuterTexte(texte, CYCLE).texte).toBe("  Selon Le Brun,\n\tla TVA…  ");
  });

  it("un caractère hors du plan multilingue de base (emoji) avant un nom : positions UTF-16 correctes", () => {
    expect(permuterTexte("🗳️ Martinez puis 👍🏽Le Brun.", CYCLE).texte).toBe("🗳️ Le Brun puis 👍🏽Ollivier.");
    expect(permuterTexte("𝒜 Maxime Le Brun 𝒜", CYCLE).texte).toBe("𝒜 Camille Ollivier 𝒜");
  });

  it("un texte vide ou sans nom reste tel quel", () => {
    expect(permuterTexte("", CYCLE)).toEqual({ texte: "", remplacements: 0, mentions_residuelles: 0 });
    expect(permuterTexte("Rien à voir.", CYCLE)).toEqual({ texte: "Rien à voir.", remplacements: 0, mentions_residuelles: 0 });
  });
});

describe("mentions résiduelles", () => {
  it("une casse différente n'est pas remplacée, et elle est comptée", () => {
    const sortie = permuterTexte("LE BRUN a dit non.", CYCLE);
    expect(sortie.texte).toBe("LE BRUN a dit non.");
    expect(sortie.remplacements).toBe(0);
    expect(sortie.mentions_residuelles).toBe(1);
  });

  it("une forme en majuscules compte une mention, pas une par forme qu'elle contient", () => {
    expect(permuterTexte("MAXIME LE BRUN", CYCLE).mentions_residuelles).toBe(1);
  });

  it("un libellé à moitié en majuscules : le nom seul est remplacé, le prénom reste, la mention compte", () => {
    const sortie = permuterTexte("MAXIME Le Brun parle.", CYCLE);
    expect(sortie.texte).toBe("MAXIME Ollivier parle.");
    expect(sortie.mentions_residuelles).toBe(1);
  });

  it("les occurrences remplacées ne sont pas comptées", () => {
    const sortie = permuterTexte("Martinez, MARTINEZ, Alix Martinez, martinez.", CYCLE);
    expect(sortie.texte).toBe("Le Brun, MARTINEZ, Maxime Le Brun, martinez.");
    expect(sortie.remplacements).toBe(2);
    expect(sortie.mentions_residuelles).toBe(2);
  });

  it("les bornes de mot valent aussi sans la casse : « MARTINEZVILLE » n'est pas une mention", () => {
    expect(permuterTexte("MARTINEZVILLE", CYCLE).mentions_residuelles).toBe(0);
  });

  it("un caractère qui s'allonge en minuscule (« İ ») ne décale pas les mentions suivantes", () => {
    const sortie = permuterTexte("İİİ Martinez et LE BRUN.", CYCLE);
    expect(sortie.texte).toBe("İİİ Le Brun et LE BRUN.");
    expect(sortie.mentions_residuelles).toBe(1);
  });
});

/**
 * Le prédicat d'éligibilité « nomme un candidat » (D14 (2), D55 (4)) : libellé ou nom seul déclarés
 * au périmètre, correspondance exacte, mot entier. Cas repris de `candidats.test.ts`, qui les portait
 * sur `nommeUnCandidat`, retiré faute d'appelant (le prédicat de production est celui-ci).
 */
describe("nommeUnInterroge : le prédicat d'éligibilité", () => {
  const MARTINEZ: CandidatDuRun = { candidat_id: "martinez", libelle: "Alix Martinez", nom: "Martinez" };
  const HOLLANDE: CandidatDuRun = { candidat_id: "hollande", libelle: "Bruno Hollande", nom: "Hollande" };
  const TOUS = [MARTINEZ, HOLLANDE];
  const nomme = (textes: readonly string[]): boolean => nommeUnInterroge(textes, TOUS, TOUS);

  it("trouve le nom seul au début de phrase, et le libellé complet", () => {
    expect(nomme(["Martinez propose une réforme."])).toBe(true);
    expect(nomme(["Rien. Martinez propose."])).toBe(true);
    expect(nomme(["Selon Alix Martinez, oui."])).toBe(true);
  });

  it("ne trouve pas le nom à l'intérieur d'un mot plus long (« Martinezville »)", () => {
    expect(nomme(["Une usine à Martinezville."])).toBe(false);
    expect(nomme(["Les Hollandes."])).toBe(false);
    expect(nomme(["NeoMartinez"])).toBe(false);
    expect(nomme(["Martinez2027"])).toBe(false);
  });

  it("respecte la casse : la correspondance est exacte", () => {
    expect(nomme(["MARTINEZ propose."])).toBe(false);
    expect(nomme(["martinez propose."])).toBe(false);
  });

  it("trouve le nom après une apostrophe typographique (« d’Hollande ») comme après une apostrophe droite", () => {
    expect(nomme(["Le programme d’Hollande."])).toBe(true);
    expect(nomme(["Le programme d'Hollande."])).toBe(true);
  });

  it("trouve le nom entre ponctuations, tirets et fin de texte", () => {
    expect(nomme(["(Martinez)"])).toBe(true);
    expect(nomme(["Jean-Martinez"])).toBe(true);
    expect(nomme(["vote Martinez"])).toBe(true);
  });

  it("ne voit pas un nom accolé à une lettre accentuée ou une marque combinante", () => {
    expect(nomme(["Martinezé"])).toBe(false);
    expect(nomme(["Martinez\u0301"])).toBe(false);
  });

  it("lit chacun des textes reçus, et rend faux sans texte, sans candidat ou sans interrogé", () => {
    expect(nomme(["rien", "Hollande"])).toBe(true);
    expect(nomme([])).toBe(false);
    expect(nommeUnInterroge(["Martinez"], [], [])).toBe(false);
    expect(nommeUnInterroge(["Martinez"], [], TOUS)).toBe(false);
  });

  it("refuse un nom vide ou blanc au périmètre : il nommerait tout", () => {
    const blanc: CandidatDuRun = { candidat_id: "blanc", libelle: "A", nom: " " };
    expect(() => nommeUnInterroge(["x"], [blanc], [blanc])).toThrow(/vide ou blanc/);
  });
});
