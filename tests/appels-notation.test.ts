/**
 * `docs/APPELS-NOTATION.md` : les appels réseau des juges réels (§7), engendrés depuis le code de
 * `pipeline/notation/`, sur le modèle de `docs/APPELS-INTERROGATION.md` (§9, « Reproductibilité »).
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MOTIFS_RENVOI_DEFAILLANCE } from "../analysis/types-notation.ts";
import { ADAPTATEURS_JUGES_DOCUMENTES, CLE_FICTIVE_JUGE, genererAppelsNotation } from "../outils/appels-notation/rendu.ts";
import { VARIABLES_CLES } from "../pipeline/extraction/commande.ts";
import { FABRIQUES_ADAPTATEURS_JUGES } from "../pipeline/notation/juges-reels.ts";

const CHEMIN = resolve(import.meta.dirname, "../docs/APPELS-NOTATION.md");
const NOTATION = resolve(import.meta.dirname, "../pipeline/notation");

describe("docs/APPELS-NOTATION.md", () => {
  it("est à jour avec le code des juges réels (sinon : pnpm appels-notation)", () => {
    expect(readFileSync(CHEMIN, "utf8")).toBe(genererAppelsNotation());
  });

  it("est déterministe : deux rendus donnent les mêmes octets", () => {
    expect(genererAppelsNotation()).toBe(genererAppelsNotation());
  });

  it("documente chaque adaptateur de juge réel du code, et chaque éditeur de la table des juges", () => {
    const reels = readdirSync(NOTATION)
      .filter((nom) => /^juge-.+\.ts$/u.test(nom) && nom !== "juge-simule.ts")
      .map((nom) => nom.replace(/\.ts$/u, ""))
      .sort();
    expect(ADAPTATEURS_JUGES_DOCUMENTES.map((a) => a.nom).sort()).toEqual(reels);
    expect(ADAPTATEURS_JUGES_DOCUMENTES.map((a) => a.editeur).sort()).toEqual(Object.keys(FABRIQUES_ADAPTATEURS_JUGES).sort());
  });

  it("porte, pour chaque adaptateur, son point d'accès, la variable de sa clé et les motifs de renvoi du code", () => {
    const texte = genererAppelsNotation();
    for (const documente of ADAPTATEURS_JUGES_DOCUMENTES) {
      expect(texte).toContain(documente.fabrique(CLE_FICTIVE_JUGE).construireRequete("x").endpoint);
      expect(texte).toContain(VARIABLES_CLES[documente.editeur]);
    }
    for (const motif of MOTIFS_RENVOI_DEFAILLANCE) expect(texte).toContain(`\`${motif}\``);
  });

  it("ne porte aucune clé ni aucun réglage supposé : la clé fictive, et des marque-places", () => {
    const texte = genererAppelsNotation();
    expect(texte).toContain(CLE_FICTIVE_JUGE);
    expect(texte).not.toMatch(/sk-[A-Za-z0-9]{8,}/u);
    expect(texte).not.toMatch(/"(?:max_tokens|temperature|random_seed|effort)": (?!"<)/u);
    expect(texte).toContain("§7.57");
  });
});
