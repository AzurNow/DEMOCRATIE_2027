/**
 * Renvois de la page pédagogique vers le protocole (`site/src/lib/protocole.ts`).
 *
 * Un renvoi faux envoie le lecteur au mauvais paragraphe de la méthode : la page dirait alors
 * autre chose que le texte qui fait foi. Les ancres sont lues comme GitHub les calcule.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  URL_PROTOCOLE,
  ancreGitHub,
  cheminDuProtocole,
  lienDeSection,
  texteDuRenvoi,
  titreDeSection,
} from "../../site/src/lib/protocole.ts";

const PROTOCOLE_FACTICE = [
  "# Protocole",
  "",
  "## 1. Statut du document",
  "Texte.",
  "## 10. Gouvernance, indépendance et cadre légal",
  "## 11. Limites reconnues a priori",
  "## 4. Vérité de référence : construction et cycle de vie",
  "### 4. Pas un titre de section",
  "Une ligne qui cite ## 5. au milieu.",
  "## 13. Annexes",
].join("\n");

describe("ancreGitHub", () => {
  it("garde les accents, retire la ponctuation, double le tiret autour du deux-points", () => {
    expect(ancreGitHub("4. Vérité de référence : construction et cycle de vie")).toBe(
      "4-vérité-de-référence--construction-et-cycle-de-vie",
    );
  });

  it("conserve les tirets et retire virgules, guillemets et apostrophes", () => {
    expect(ancreGitHub("10. Gouvernance, indépendance et cadre légal")).toBe("10-gouvernance-indépendance-et-cadre-légal");
    expect(ancreGitHub("2. Objet, questions « go/no-go » et l'hypothèse")).toBe("2-objet-questions--gono-go--et-lhypothèse");
  });
});

describe("titreDeSection", () => {
  it("trouve la section demandée", () => {
    expect(titreDeSection(PROTOCOLE_FACTICE, "4")).toBe("4. Vérité de référence : construction et cycle de vie");
  });

  it("« ## 1. » ne prend ni « ## 10. » ni « ## 11. »", () => {
    expect(titreDeSection(PROTOCOLE_FACTICE, "1")).toBe("1. Statut du document");
    expect(titreDeSection(PROTOCOLE_FACTICE, "10")).toBe("10. Gouvernance, indépendance et cadre légal");
    expect(titreDeSection(PROTOCOLE_FACTICE, "11")).toBe("11. Limites reconnues a priori");
  });

  it("section absente : erreur, jamais un lien vide", () => {
    expect(() => titreDeSection(PROTOCOLE_FACTICE, "5")).toThrow(/aucune section « ## 5\. »/);
    expect(() => titreDeSection(PROTOCOLE_FACTICE, "12")).toThrow(/aucune section/);
  });

  it("un titre de niveau 3 ne compte pas", () => {
    expect(() => titreDeSection("### 4. Sous-titre", "4")).toThrow(/aucune section/);
  });

  it("numéro de section mal formé : erreur", () => {
    expect(() => titreDeSection(PROTOCOLE_FACTICE, "")).toThrow(/pas un numéro de section/);
    expect(() => titreDeSection(PROTOCOLE_FACTICE, "4.")).toThrow(/pas un numéro de section/);
    expect(() => titreDeSection(PROTOCOLE_FACTICE, "annexe E")).toThrow(/pas un numéro de section/);
  });

  it("deux sections du même numéro : erreur", () => {
    expect(() => titreDeSection("## 3. Un\n## 3. Deux", "3")).toThrow(/plusieurs sections/);
  });

  it("fins de ligne CRLF lues comme LF", () => {
    expect(titreDeSection("## 2. Objet\r\n## 3. Périmètre\r\n", "2")).toBe("2. Objet");
  });
});

describe("lienDeSection et texteDuRenvoi", () => {
  it("lien complet vers la section", () => {
    expect(lienDeSection(PROTOCOLE_FACTICE, "13")).toBe(`${URL_PROTOCOLE}#13-annexes`);
  });

  it("texte « §n », ou le libellé d'une annexe", () => {
    expect(texteDuRenvoi("4")).toBe("§4");
    expect(texteDuRenvoi("13", "annexe E")).toBe("annexe E");
  });
});

describe("cheminDuProtocole", () => {
  it("remonte jusqu'au dossier qui contient docs/PROTOCOLE.md", () => {
    const attendu = resolve("/depot", "docs", "PROTOCOLE.md");
    expect(cheminDuProtocole("/depot/site/src", (chemin) => chemin === attendu)).toBe(attendu);
  });

  it("introuvable : erreur", () => {
    expect(() => cheminDuProtocole("/nulle/part", () => false)).toThrow(/introuvable/);
  });
});

describe("le protocole du dépôt", () => {
  const protocole = readFileSync(cheminDuProtocole(process.cwd(), existsSync), "utf8");

  it.each(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"])("porte la section %s", (section) => {
    expect(lienDeSection(protocole, section)).toMatch(new RegExp(`^${URL_PROTOCOLE}#${section}-`));
  });

  it("ancre réelle de la section 4", () => {
    expect(lienDeSection(protocole, "4")).toBe(`${URL_PROTOCOLE}#4-vérité-de-référence--construction-et-cycle-de-vie`);
  });
});
