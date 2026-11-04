/**
 * Les liens d'une saisie de l'application (§6, protocole 0.31, D73 (12)) : « ses liens sont les
 * adresses http ou https qui figurent dans ce texte ». La règle d'extraction est celle de
 * `pipeline/interrogation/liens-du-texte.ts` ; chaque cas limite du brief a son test.
 */

import { describe, expect, it } from "vitest";
import { liensDuTexte } from "../../pipeline/interrogation/liens-du-texte.ts";

describe("liens du texte copié : ce qui est retenu", () => {
  it("une adresse http et une adresse https, dans l'ordre d'apparition", () => {
    expect(liensDuTexte("Voir https://b.example/x puis http://a.example/y fin")).toEqual(["https://b.example/x", "http://a.example/y"]);
  });

  it("aucune adresse : liste vide", () => {
    expect(liensDuTexte("Pas de lien ici.")).toEqual([]);
  });

  it("texte vide : liste vide", () => {
    expect(liensDuTexte("")).toEqual([]);
  });

  it("requête et fragment gardés tels quels", () => {
    expect(liensDuTexte("https://a.example/p?x=1&y=2#ancre")).toEqual(["https://a.example/p?x=1&y=2#ancre"]);
  });

  it("une adresse collée à une lettre n'en est pas une (xhttps://…)", () => {
    expect(liensDuTexte("xhttps://a.example/p")).toEqual([]);
  });
});

describe("liens du texte copié : ponctuation finale", () => {
  it.each([
    ["point final", "Source : https://a.example/p.", "https://a.example/p"],
    ["virgule", "https://a.example/p, puis", "https://a.example/p"],
    ["points de suspension", "https://a.example/p...", "https://a.example/p"],
    ["deux-points, point-virgule, ! et ?", "https://a.example/p;:!?", "https://a.example/p"],
    ["apostrophe typographique", "https://a.example/p’", "https://a.example/p"],
    ["astérisques du gras Markdown", "**https://a.example/p**", "https://a.example/p"],
    ["parenthèse fermante non ouverte", "(voir https://a.example/p)", "https://a.example/p"],
    ["parenthèse puis point", "(voir https://a.example/p).", "https://a.example/p"],
    ["lien Markdown", "[la page](https://a.example/p)", "https://a.example/p"],
  ])("%s", (_cas, texte, attendu) => {
    expect(liensDuTexte(texte)).toEqual([attendu]);
  });

  it("une parenthèse équilibrée dans l'adresse est gardée", () => {
    expect(liensDuTexte("https://fr.wikipedia.org/wiki/Exemple_(homonymie)")).toEqual(["https://fr.wikipedia.org/wiki/Exemple_(homonymie)"]);
  });

  it("parenthèse équilibrée dans l'adresse, puis parenthèse fermante du texte", () => {
    expect(liensDuTexte("(cf. https://fr.wikipedia.org/wiki/Exemple_(homonymie))")).toEqual(["https://fr.wikipedia.org/wiki/Exemple_(homonymie)"]);
  });

  it("le point intérieur est gardé, seul le point final tombe", () => {
    expect(liensDuTexte("https://a.example/rapport.pdf.")).toEqual(["https://a.example/rapport.pdf"]);
  });
});

describe("liens du texte copié : délimiteurs", () => {
  it.each([
    ["guillemet droit", '"https://a.example/p"'],
    ["guillemets français", "«https://a.example/p»"],
    ["guillemets français avec espaces insécables", "« https://a.example/p »"],
    ["guillemets anglais typographiques", "“https://a.example/p”"],
    ["chevrons", "<https://a.example/p>"],
    ["accent grave du code Markdown", "`https://a.example/p`"],
    ["espace fine insécable", "https://a.example/p :"],
    ["retour à la ligne", "https://a.example/p\nsuite"],
  ])("%s", (_cas, texte) => {
    expect(liensDuTexte(texte)).toEqual(["https://a.example/p"]);
  });

  it("lien Markdown dont le libellé est l'adresse : deux occurrences, chacune propre", () => {
    expect(liensDuTexte("[https://a.example/p](https://a.example/p)")).toEqual(["https://a.example/p", "https://a.example/p"]);
  });
});

describe("liens du texte copié : ce qui n'est pas retenu", () => {
  it("ftp:// n'est pas une adresse http ou https", () => {
    expect(liensDuTexte("ftp://a.example/fichier")).toEqual([]);
  });

  it("www. sans schéma n'est pas retenu", () => {
    expect(liensDuTexte("Voir www.a.example/p.")).toEqual([]);
  });

  it("domaine nu sans schéma n'est pas retenu", () => {
    expect(liensDuTexte("Voir a.example/p.")).toEqual([]);
  });

  it("schéma seul, sans hôte, n'est pas retenu", () => {
    expect(liensDuTexte("https:// et http://.")).toEqual([]);
  });

  it("schéma en majuscules non retenu (le schéma reponse exige ^https?://, et le texte n'est jamais réécrit)", () => {
    expect(liensDuTexte("HTTPS://a.example/p")).toEqual([]);
  });
});

describe("liens du texte copié : doublons", () => {
  it("la même adresse deux fois est retenue deux fois, comme côté API (ordre d'apparition, aucune déduplication)", () => {
    expect(liensDuTexte("https://a.example/p et encore https://a.example/p.")).toEqual(["https://a.example/p", "https://a.example/p"]);
  });
});
