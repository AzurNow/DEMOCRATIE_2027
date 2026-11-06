// Le minificateur de la construction fusionne `animation-timeline` dans le raccourci `animation:`
// quand les deux vivent dans la même règle (« animation: linear both x view() »). Les navigateurs
// rejettent alors la déclaration entière et l'animation ne tourne jamais, sans aucun message.
// Ce test lit le CSS tel que le site construit le sert.
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { lireSiteConstruit } from "../../outils/site-gardes.ts";

const DIST = join(resolve(import.meta.dirname, "../.."), "site/dist");

/** Raccourcis `animation:` qui embarquent une timeline view() ou scroll(). */
function raccourcisAvecTimeline(css: string): string[] {
  return [...css.matchAll(/(?<![-\w])animation\s*:[^;}]*\b(?:view|scroll)\s*\(/g)].map((m) => m[0]);
}

describe("raccourcisAvecTimeline", () => {
  it("attrape un raccourci fusionné par le minificateur", () => {
    expect(raccourcisAvecTimeline(".a{animation:linear both x view()}")).toHaveLength(1);
    expect(raccourcisAvecTimeline(".a{animation: x linear both scroll(root block)}")).toHaveLength(1);
  });

  it("laisse passer une timeline déclarée à part et les longhands", () => {
    expect(raccourcisAvecTimeline(".a{animation:x linear both}.b .a{animation-timeline:view()}")).toEqual([]);
    expect(raccourcisAvecTimeline(".a{animation-name:x;animation-timeline:scroll(root)}")).toEqual([]);
  });
});

describe("site construit : aucune timeline perdue dans un raccourci animation", () => {
  it("ne sert aucun `animation:` qui embarque view() ou scroll()", () => {
    expect(raccourcisAvecTimeline(lireSiteConstruit(DIST).html)).toEqual([]);
  });

  it("garde les timelines de l'apparition des sections et du retour en haut", () => {
    const { html } = lireSiteConstruit(DIST);
    expect(html).toMatch(/animation-timeline:\s*view\(\)/);
    expect(html).toMatch(/animation-timeline:\s*scroll\(root(?: block)?\)/);
  });
});
