/**
 * Localisation d'une citation proposée par un modèle : test verbatim déterministe (règle 5,
 * `validation/domaine/verbatim.ts:testerVerbatim`, réutilisé tel quel), refus du saut de page,
 * page d'un PDF (docs/CONTRATS.md §1.1), extrait minuté d'un enregistrement (§2).
 * Cas limites 5 à 11 du brief.
 */

import { describe, expect, it } from "vitest";
import { extraitDe, localiser, pageDe } from "../../pipeline/extraction/localisation.ts";
import { trancherPointsDeCode } from "../../validation/domaine/normalisation.ts";
import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import { analyserVtt, horodatageDebut, secondesDeHorodatage } from "../../validation/domaine/webvtt.ts";
import { pagesDe, vttDe } from "./aides.ts";

const SANS_REPERES = { pages: null, vtt: null } as const;

function reussie(citation: string, texte: string, reperes: Parameters<typeof localiser>[2] = SANS_REPERES) {
  const resultat = localiser(citation, texte, reperes);
  if (!resultat.ok) throw new Error(`citation rejetée à tort : ${resultat.motif}`);
  return resultat.localisation;
}

function motif(citation: string, texte: string, reperes: Parameters<typeof localiser>[2] = SANS_REPERES): string {
  const resultat = localiser(citation, texte, reperes);
  if (resultat.ok) throw new Error("citation acceptée à tort");
  return resultat.motif;
}

describe("cas 5 : guillemets, apostrophes et tirets typographiques", () => {
  const TEXTE = "Préambule. Nous dirons « non » à l’âge pivot – sans exception. Fin.";
  const SOURCE_ASCII = "Préambule. Nous dirons \"non\" a l'age pivot - sans exception. Fin.";

  it("typographiques dans la source, ASCII dans la sortie ⇒ passe, offsets sur le texte brut", () => {
    const localisation = reussie("Nous dirons \" non \" à l'âge pivot - sans exception.", TEXTE);
    expect(trancherPointsDeCode(TEXTE, localisation.offset_debut, localisation.offset_fin)).toBe(
      "Nous dirons « non » à l’âge pivot – sans exception.",
    );
  });

  it("ASCII dans la source, typographiques dans la sortie ⇒ passe", () => {
    const localisation = reussie("Nous dirons «non» a l’age pivot – sans exception.", SOURCE_ASCII);
    expect(trancherPointsDeCode(SOURCE_ASCII, localisation.offset_debut, localisation.offset_fin)).toBe(
      "Nous dirons \"non\" a l'age pivot - sans exception.",
    );
  });

  it("les espaces de part et d'autre d'un guillemet français comptent comme dans le texte brut", () => {
    const localisation = reussie("« non »", TEXTE);
    expect(localisation.offset_fin - localisation.offset_debut).toBe(7);
  });
});

describe("cas 6 : caractère hors du plan de base avant la citation", () => {
  it("offsets en points de code, pas en unités UTF-16", () => {
    const texte = "🇫🇷 😀 Nous recruterons des infirmiers.";
    const localisation = reussie("Nous recruterons des infirmiers.", texte);
    // Deux indicateurs régionaux (2 points de code), une espace, un emoji, une espace : 5.
    expect(localisation.offset_debut).toBe(5);
    expect(texte.indexOf("Nous")).toBe(8);
    expect(trancherPointsDeCode(texte, localisation.offset_debut, localisation.offset_fin)).toBe(
      "Nous recruterons des infirmiers.",
    );
  });
});

describe("cas 7 : coquille corrigée par le modèle", () => {
  it("la citation « corrigée » ne figure pas dans la source ⇒ introuvable, jamais rapprochée", () => {
    const texte = "Nous créeront une prime de 150 euros pour chaque apprenti.";
    const resultat = localiser("Nous créerons une prime de 150 euros pour chaque apprenti.", texte, SANS_REPERES);
    if (resultat.ok) throw new Error("citation acceptée à tort");
    expect(resultat.motif).toBe("introuvable");
    expect(resultat.detail).toContain("ne figure pas dans le texte");
  });

  it("la coquille recopiée telle quelle passe", () => {
    const texte = "Nous créeront une prime de 150 euros pour chaque apprenti.";
    expect(reussie("Nous créeront une prime de 150 euros pour chaque apprenti.", texte).offset_debut).toBe(0);
  });
});

describe("cas 8 : saut de page dans la citation, citation vide", () => {
  const PAGES = ["Nous fermerons la centrale.", "Nous ouvrirons des écoles."];
  const TEXTE = PAGES.join("\f");

  it("citation contenant U+000C ⇒ saut_de_page, alors que la normalisation seule la laisserait passer", () => {
    const citation = "Nous fermerons la centrale.\fNous ouvrirons des écoles.";
    expect(testerVerbatim(citation, TEXTE).passe).toBe(true);
    expect(motif(citation, TEXTE, { pages: pagesDe(PAGES), vtt: null })).toBe("saut_de_page");
  });

  it("citation faite d'espaces ⇒ citation_vide, détail propre au motif", () => {
    const resultat = localiser("   \n ", TEXTE, SANS_REPERES);
    if (resultat.ok) throw new Error("citation acceptée à tort");
    expect(resultat.motif).toBe("citation_vide");
    expect(resultat.detail).toContain("vide");
  });

  it("U+000C refusé aussi pour une source sans pages", () => {
    expect(motif("centrale.\fNous", TEXTE)).toBe("saut_de_page");
  });
});

describe("cas 9 : citation présente deux fois dans le texte (décision D53 (3))", () => {
  const PAGES = ["Nous baisserons la TVA.", "Rappel : Nous baisserons la TVA."];

  it("testerVerbatim rend la première occurrence et compte les autres", () => {
    const resultat = testerVerbatim("Nous baisserons la TVA.", PAGES.join("\f"));
    expect(resultat.offset_debut).toBe(0);
    expect(resultat.occurrences).toBe(2);
  });

  it("citation présente deux fois ⇒ citation_ambigue, aucune localisation", () => {
    expect(motif("Nous baisserons la TVA.", PAGES.join("\f"), { pages: pagesDe(PAGES), vtt: null })).toBe("citation_ambigue");
  });

  it("deux occurrences identiques après normalisation seulement ⇒ citation_ambigue", () => {
    expect(motif("l'âge", "Il dit « l’âge » puis l'âge.")).toBe("citation_ambigue");
  });

  it("la même citation élargie jusqu'à être unique ⇒ localisée, avec sa page", () => {
    const localisation = reussie("Rappel : Nous baisserons la TVA.", PAGES.join("\f"), { pages: pagesDe(PAGES), vtt: null });
    expect(localisation).toEqual({
      offset_debut: 24,
      offset_fin: 56,
      version_normalisation: "normalisation-v1",
      page: 2,
      extrait: null,
    });
  });
});

describe("cas 10 : page d'une citation", () => {
  const PAGES = ["Constat : les hôpitaux ferment.", "Nous ouvrirons des hôpitaux.", "Nous recruterons des infirmiers."];
  const TEXTE = PAGES.join("\f");
  const REPERES = { pages: pagesDe(PAGES), vtt: null };

  it("citation sur la première page ⇒ page 1", () => {
    expect(reussie("les hôpitaux ferment.", TEXTE, REPERES).page).toBe(1);
  });

  it("citation qui commence juste après un U+000C ⇒ page 2", () => {
    const localisation = reussie("Nous ouvrirons", TEXTE, REPERES);
    expect(localisation.offset_debut).toBe("Constat : les hôpitaux ferment.".length + 1);
    expect(localisation.page).toBe(2);
  });

  it("citation qui finit sur le dernier caractère de la dernière page ⇒ page 3", () => {
    const localisation = reussie("des infirmiers.", TEXTE, REPERES);
    expect(localisation.offset_fin).toBe(TEXTE.length);
    expect(localisation.page).toBe(3);
  });

  it("citation à cheval sur deux pages, sans U+000C écrit, ⇒ citation_sans_page_unique", () => {
    expect(motif("hôpitaux. Nous recruterons", TEXTE, REPERES)).toBe("citation_sans_page_unique");
  });

  it("source sans pages (HTML) ⇒ aucune page", () => {
    expect(reussie("Nous ouvrirons des hôpitaux.", "Nous ouvrirons des hôpitaux.").page).toBeNull();
  });

  it("pageDe suit pipeline/collecte/textes/pages.py:page_de : intervalle contenu, non vide", () => {
    const pages = pagesDe(["abc", "de"]);
    expect(pageDe(pages, 0, 3)).toBe(1);
    expect(pageDe(pages, 4, 6)).toBe(2);
    expect(pageDe(pages, 2, 5)).toBeNull();
    expect(pageDe(pages, 3, 4)).toBeNull();
    expect(pageDe(pages, 1, 1)).toBeNull();
    expect(pageDe(pages, 4, 7)).toBeNull();
  });
});

describe("cas 11 : extrait minuté d'un enregistrement (décision D53 (4))", () => {
  const CUES = [
    { debut: "00:42:10.000", fin: "00:42:14.500", texte: "Bonjour à tous." },
    { debut: "00:42:14.500", fin: "00:42:19.000", texte: "Nous recruterons des infirmiers," },
    { debut: "00:42:19.000", fin: "00:42:21.250", texte: "partout en France." },
  ];
  const DOCUMENT = analyserVtt(vttDe(CUES));
  const REPERES = { pages: null, vtt: DOCUMENT };

  it("citation dans un seul cue ⇒ début du cue arrondi à la seconde inférieure, fin à la supérieure", () => {
    const localisation = reussie("Nous recruterons des infirmiers,", DOCUMENT.texte, REPERES);
    expect(localisation.extrait).toEqual({ debut: "00:42:14", fin: "00:42:19" });
  });

  it("citation à cheval sur deux cues ⇒ du début du premier à la fin du dernier", () => {
    const localisation = reussie("Nous recruterons des infirmiers, partout en France.", DOCUMENT.texte, REPERES);
    expect(localisation.extrait).toEqual({ debut: "00:42:14", fin: "00:42:22" });
  });

  it("le début suit la règle de docs/CONTRATS.md §2, la même que horodatageDebut", () => {
    for (const offset of [0, 14, 15, 16, 48, 49]) {
      const extrait = extraitDe(DOCUMENT, offset, offset + 1);
      expect(secondesDeHorodatage(extrait.debut)).toBe(Math.floor(horodatageDebut(DOCUMENT, offset)));
    }
  });

  it("le saut de ligne qui joint deux cues appartient au premier", () => {
    const fin = "Bonjour à tous.".length;
    expect(extraitDe(DOCUMENT, fin, fin + 1)).toEqual({ debut: "00:42:10", fin: "00:42:15" });
  });
});
