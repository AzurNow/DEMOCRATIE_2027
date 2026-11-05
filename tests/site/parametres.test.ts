/**
 * Garde des chiffres du protocole affichés par la page pédagogique (`site/src/lib/parametres.ts`).
 *
 * Une valeur de la page qui s'écarte de sa constante, ou du texte de `docs/PROTOCOLE.md`, fait
 * échouer la suite : au prochain amendement d'un seuil, la page publiée ne peut pas dire l'ancien.
 */
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lireSiteConstruit, texteDePage } from "../../outils/site-gardes.ts";
import { REECHANTILLONNAGES_PRODUCTION } from "../../analysis/bootstrap.ts";
import { SEUIL_RUN_INCOMPLET } from "../../analysis/seuils.ts";
import {
  PARAMETRES,
  PARAMETRES_SANS_CONSTANTE,
  entier,
  heures,
  pourcent,
} from "../../site/src/lib/parametres.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const protocole = readFileSync(join(RACINE, "docs/PROTOCOLE.md"), "utf8");
/** Le protocole écrit « 14 jours », le texte de la page peut porter des espaces insécables. */
const espaces = (texte: string): string => texte.replace(/[  ]/g, " ");

describe("formats des paramètres", () => {
  it("écrit les milliers avec une espace", () => {
    expect([entier(2000), entier(300), entier(12), entier(1234567)]).toEqual(["2 000", "300", "12", "1 234 567"]);
  });

  it("écrit une fraction en pourcentage entier", () => {
    expect([pourcent(0.1), pourcent(0.25), pourcent(0.03), pourcent(0.2), pourcent(0.8)]).toEqual([
      "10 %",
      "25 %",
      "3 %",
      "20 %",
      "80 %",
    ]);
  });

  it("refuse une fraction qui n'est pas un pourcentage entier", () => {
    expect(() => pourcent(0.125)).toThrow(/pourcentage entier/);
  });

  it("refuse une durée qui n'est pas un nombre entier d'heures", () => {
    expect(() => heures(90 * 60 * 1000)).toThrow(/entier d'heures/);
    expect(heures(48 * 3_600_000)).toBe("48");
  });
});

describe("paramètres affichés et constantes du code", () => {
  it("garde 2 000 rééchantillonnages et 20 % de réponses manquantes", () => {
    expect(PARAMETRES.reechantillonnages).toBe(entier(REECHANTILLONNAGES_PRODUCTION));
    expect(PARAMETRES.reponsesManquantesMax).toBe(
      pourcent(SEUIL_RUN_INCOMPLET.numerateur / SEUIL_RUN_INCOMPLET.denominateur),
    );
  });
});

describe("paramètres sans constante et protocole", () => {
  for (const [nom, { affiche, citation }] of Object.entries(PARAMETRES_SANS_CONSTANTE)) {
    it(`retrouve « ${citation} » dans docs/PROTOCOLE.md (${nom})`, () => {
      expect(espaces(protocole)).toContain(citation);
    });

    it(`cite la valeur affichée ${affiche} (${nom})`, () => {
      expect(citation).toContain(affiche);
    });
  }
});

describe("la page construite affiche ces paramètres", () => {
  const page = () => espaces(texteDePage(lireSiteConstruit(join(RACINE, "site/dist")).html)).replace(/\s+/g, " ");

  it("porte chaque valeur lue dans le code, dans sa phrase", () => {
    const texte = page();
    expect(texte).toContain(`sur ${PARAMETRES.reechantillonnages} tirages`);
    expect(texte).toContain(`fenêtre de ${PARAMETRES.fenetreHeures} heures`);
    expect(texte).toContain(`plus de ${PARAMETRES.seuilRetraitJuge} des cas`);
    expect(texte).toContain(`passe à ${PARAMETRES.echantillonApresRetrait}`);
    expect(texte).toContain(`jeu de ${PARAMETRES.jeuOr} réponses`);
    expect(texte).toContain(`${PARAMETRES.reponsesManquantesMax} des réponses manquent`);
  });

  it("porte chaque valeur sans constante, dans sa phrase", () => {
    const texte = page();
    expect(texte).toContain(`sous ${PARAMETRES_SANS_CONSTANTE.delaiPanelJours.affiche} jours`);
    expect(texte).toContain(`limite de ${PARAMETRES_SANS_CONSTANTE.longueurContestation.affiche} caractères`);
    expect(texte).toContain(`sous ${PARAMETRES_SANS_CONSTANTE.accuseReceptionHeures.affiche} heures`);
    expect(texte).toContain(`confiance à ${PARAMETRES_SANS_CONSTANTE.niveauConfiance.affiche} %`);
    expect(texte).toContain(`les ${PARAMETRES_SANS_CONSTANTE.rangMagasins.affiche} premières`);
  });
});
