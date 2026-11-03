/**
 * Conformité n° 36 : deux preuves de sondage sont « la même URL » après la normalisation fixe de
 * `url-sondage.ts` (décision de l'auteur du 2026-10-02, texte au §3 en 0.15). Un test par cas
 * limite, y compris ce que l'API `URL` fait d'elle-même.
 */

import { describe, expect, it } from "vitest";
import { inclusionAvantListe } from "../../pipeline/questions/perimetre.ts";
import {
  ErreurUrlIllisible,
  normaliserUrlSondage,
  VERSION_NORMALISATION_URL,
} from "../../pipeline/questions/url-sondage.ts";

const BASE = "https://institut.invalid/sondage";

function memeUrl(a: string, b: string): boolean {
  return normaliserUrlSondage(a) === normaliserUrlSondage(b);
}

describe("version", () => {
  it("porte un identifiant de version", () => {
    expect(VERSION_NORMALISATION_URL).toBe("normalisation-url-v1");
  });
});

describe("règles de la décision du 2026-10-02", () => {
  it("assimile http à https", () => {
    expect(memeUrl("http://institut.invalid/sondage", BASE)).toBe(true);
  });
  it("met schéma et hôte en minuscules", () => {
    expect(memeUrl("HTTPS://INSTITUT.Invalid/sondage", BASE)).toBe(true);
  });
  it("retire la barre finale du chemin", () => {
    expect(memeUrl(`${BASE}/`, BASE)).toBe(true);
  });
  it("garde la racine : avec ou sans barre, c'est la même URL", () => {
    expect(normaliserUrlSondage("https://exemple.fr/")).toBe("https://exemple.fr/");
    expect(memeUrl("https://exemple.fr", "https://exemple.fr/")).toBe(true);
  });
  it("retire utm_* et garde les autres paramètres", () => {
    expect(memeUrl(`${BASE}?utm_source=x&id=3`, `${BASE}?id=3`)).toBe(true);
  });
  it("garde l'ordre d'origine des autres paramètres", () => {
    expect(memeUrl(`${BASE}?a=1&b=2`, `${BASE}?b=2&a=1`)).toBe(false);
  });
  it("un utm_ seul disparaît avec son ?", () => {
    expect(memeUrl(`${BASE}?utm_source=x`, BASE)).toBe(true);
    expect(normaliserUrlSondage(`${BASE}?utm_source=x`)).not.toContain("?");
  });
  it("un ? vide disparaît", () => {
    expect(memeUrl(`${BASE}?`, BASE)).toBe(true);
  });
  it("retire le fragment", () => {
    expect(memeUrl(`${BASE}#a`, `${BASE}#b`)).toBe(true);
    expect(memeUrl(`${BASE}#a`, BASE)).toBe(true);
  });
  it("combine les règles : barre finale, utm_, fragment", () => {
    expect(memeUrl(`${BASE}/?utm_medium=y&id=3#haut`, `${BASE}?id=3`)).toBe(true);
  });
});

describe("ce qui reste distinct", () => {
  it("chemin de casse différente : deux URL", () => {
    expect(memeUrl("https://institut.invalid/Sondage", BASE)).toBe(false);
  });
  it("autre paramètre différent : deux URL", () => {
    expect(memeUrl(`${BASE}?id=3`, `${BASE}?id=4`)).toBe(false);
  });
  it("seul le préfixe utm_ en minuscules est retiré", () => {
    expect(memeUrl(`${BASE}?UTM_source=x`, BASE)).toBe(false);
    expect(memeUrl(`${BASE}?xutm_source=x`, BASE)).toBe(false);
  });
});

describe("ce que l'API URL fait d'elle-même (fait partie de la règle publiée)", () => {
  it("efface le port par défaut", () => {
    expect(memeUrl("https://institut.invalid:443/sondage", BASE)).toBe(true);
    expect(memeUrl("http://institut.invalid:80/sondage", BASE)).toBe(true);
  });
  it("garde un port non standard", () => {
    expect(memeUrl("https://institut.invalid:8443/sondage", BASE)).toBe(false);
  });
  it("http sur le port 443 devient https sans port", () => {
    expect(memeUrl("http://institut.invalid:443/sondage", BASE)).toBe(true);
  });
  it("garde le point final de l'hôte : deux URL", () => {
    expect(memeUrl("https://institut.invalid./sondage", BASE)).toBe(false);
  });
  it("résout les segments . et ..", () => {
    expect(memeUrl("https://institut.invalid/a/../sondage", BASE)).toBe(true);
  });
  it("encode é en %C3%A9 : é et %C3%A9 sont la même URL", () => {
    expect(memeUrl("https://institut.invalid/é", "https://institut.invalid/%C3%A9")).toBe(true);
  });
  it("ne change pas la casse d'un %xx existant : %c3%a9 et %C3%A9 restent deux URL", () => {
    expect(memeUrl("https://institut.invalid/%c3%a9", "https://institut.invalid/%C3%A9")).toBe(false);
  });
  it("ne décode pas un %xx ASCII : %41 et A restent deux URL", () => {
    expect(memeUrl("https://institut.invalid/%41", "https://institut.invalid/A")).toBe(false);
  });
});

describe("URL illisible", () => {
  it.each(["", "pas une url", "/chemin/relatif", "https://"])("lève ErreurUrlIllisible pour %j", (brut) => {
    expect(() => normaliserUrlSondage(brut)).toThrow(ErreurUrlIllisible);
  });
  it("nomme l'URL fautive", () => {
    expect(() => normaliserUrlSondage("pas une url")).toThrow(/pas une url/);
  });
});

describe("décompte du §3 avec la normalisation", () => {
  const declaration = { url: "https://candidat.invalid/d", date: "2026-06-02" };
  const gel = "2026-11-20T10:00:00Z";
  // D70 (6) : la notice de l'institut, dans les douze mois du gel, sans quoi le sondage ne compte pas.
  const preuve = (url: string) => ({ date_publication: "2026-10-15", url, notice_institut: { date_publication: "2026-06-15" } });

  it("deux écritures de la même URL ne font qu'un sondage : candidat non inclus", () => {
    const verdict = inclusionAvantListe(
      {
        declaration_candidature: declaration,
        preuves_inclusion: [preuve(BASE), preuve("http://INSTITUT.invalid/sondage/?utm_source=x#a")],
      },
      gel,
    );
    expect(verdict.sondages_dans_la_fenetre).toBe(1);
    expect(verdict.inclus).toBe(false);
  });

  it("deux URL réellement distinctes restent deux sondages : candidat inclus", () => {
    const verdict = inclusionAvantListe(
      { declaration_candidature: declaration, preuves_inclusion: [preuve(`${BASE}?id=3`), preuve(`${BASE}?id=4`)] },
      gel,
    );
    expect(verdict.sondages_dans_la_fenetre).toBe(2);
    expect(verdict.inclus).toBe(true);
  });

  it("une URL illisible fait échouer le décompte au lieu d'être ignorée", () => {
    expect(() =>
      inclusionAvantListe({ declaration_candidature: declaration, preuves_inclusion: [preuve("pas une url")] }, gel),
    ).toThrow(ErreurUrlIllisible);
  });
});
