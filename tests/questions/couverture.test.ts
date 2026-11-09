/**
 * Conformité n° 19 : le comptage des items P qui décide du seuil de couverture du §4.
 *
 * Décision de l'auteur du 2026-09-27 : compte pour le seuil un item P qui pourrait entrer au
 * tirage à l'instant de gel — vérifié, en vigueur au gel (intervalle semi-ouvert, date civile à
 * minuit UTC), et non contesté ou dont la dernière décision du panel est un maintien ou une
 * correction. Chaque cas limite de la liste du brief a son test nommé.
 */

import { describe, expect, it } from "vitest";
import { DecisionPanelPosterieureAuGel } from "../../pipeline/questions/contestation.ts";
import { itemPCompteAuGel } from "../../pipeline/questions/couverture.ts";
import type { Item } from "../../pipeline/questions/types.ts";
import { arbitre, contestation, decidePar, idsPAuGel, itemA, itemF, itemO, itemP, mesure } from "./fabriques.ts";

const GEL = "2026-11-20T10:00:00Z";
const CANDIDAT = "demo-alpha";
const AUTRE = "demo-beta";
/** Les candidats interrogés du run : ceux que la détection des positions incompatibles examine (§5, D74 (14)). */
const INTERROGES: ReadonlySet<string> = new Set([CANDIDAT, AUTRE]);
const MESURE = mesure({ cle: "couverture", theme: "sante" });
const REFERENTIEL = new Map([[MESURE.id, MESURE]]);
/** La mesure de l'item O du test « mélange », hors de MESURE : ses deux états n'y croisent aucun item P. */
const MESURE_O = mesure({ cle: "couverture-o", theme: "sante" });
const AVANT_GEL = "2026-10-01T10:00:00+02:00";

function p(cle: string, options: Partial<Parameters<typeof itemP>[0]> = {}): Item {
  return itemP({ cle: `couverture-${cle}`, candidat_id: CANDIDAT, mesure: MESURE, ...options });
}

function nItems(n: number, prefixe: string): readonly Item[] {
  return Array.from({ length: n }, (_, rang) => p(`${prefixe}-${rang}`));
}

describe("itemPCompteAuGel : un item, les cas limites du brief", () => {
  it("compte un item P vérifié, en vigueur, non contesté", () => {
    expect(itemPCompteAuGel(p("nominal"), CANDIDAT, GEL, REFERENTIEL)).toBe(true);
  });

  it("ne compte pas un item P contesté en attente de décision", () => {
    expect(itemPCompteAuGel(p("conteste", { statut_contestation: "contestee" }), CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("compte un item P arbitré par un maintien", () => {
    const item = arbitre(p("maintien"), [contestation("cv-maintien", "maintien", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(true);
  });

  it("compte un item P arbitré par une correction", () => {
    const item = arbitre(p("correction"), [contestation("cv-correction", "correction", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(true);
  });

  it("ne compte pas un item P retiré par le panel", () => {
    const item = arbitre(p("retrait", { statut_validation: "retire_par_panel" }), [
      contestation("cv-retrait", "retrait", AVANT_GEL),
    ]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("compte de nouveau un item P maintenu après un retrait du panel", () => {
    const retire = decidePar(p("retrait-maintien"), [{ cle: "cv-rm-1", decision: "retrait", date: AVANT_GEL }]);
    expect(itemPCompteAuGel(retire, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
    const maintenu = decidePar(retire, [{ cle: "cv-rm-2", decision: "maintien", date: "2026-10-15T10:00:00+02:00" }]);
    expect(maintenu.statut_validation).toBe("verifie");
    expect(itemPCompteAuGel(maintenu, CANDIDAT, GEL, REFERENTIEL)).toBe(true);
  });

  it("ne compte pas un item P dont la décision de retrait laisse le statut vérifié (la décision fait foi)", () => {
    const item = arbitre(p("retrait-verifie"), [contestation("cv-retrait-v", "retrait", AVANT_GEL)]);
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("ne compte pas un item P dont valide_au tombe exactement sur l'instant de gel (semi-ouvert)", () => {
    const gelMinuit = "2026-11-20T00:00:00Z";
    const item = p("valide-au-gel", { valide_du: "2026-09-01", valide_au: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, gelMinuit, REFERENTIEL)).toBe(false);
  });

  it("ne compte pas un item P dont valide_au est le jour du gel, gel à 10 h UTC", () => {
    const item = p("valide-au-jour-gel", { valide_du: "2026-09-01", valide_au: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("compte un item P dont valide_du tombe exactement sur l'instant de gel", () => {
    const gelMinuit = "2026-11-20T00:00:00Z";
    const item = p("valide-du-gel", { valide_du: "2026-11-20" });
    expect(itemPCompteAuGel(item, CANDIDAT, gelMinuit, REFERENTIEL)).toBe(true);
  });

  it("ne compte pas un item P dont valide_du est le lendemain du gel", () => {
    const item = p("valide-du-lendemain", { valide_du: "2026-11-21" });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("ne compte pas un item P non vérifié", () => {
    expect(itemPCompteAuGel(p("en-attente", { statut_validation: "en_attente" }), CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("ne compte ni un item O, ni un item A, ni un item F, même vérifiés et en vigueur", () => {
    const options = { candidat_id: CANDIDAT, mesure: MESURE };
    expect(itemPCompteAuGel(itemO({ cle: "cv-o", ...options }), CANDIDAT, GEL, REFERENTIEL)).toBe(false);
    expect(itemPCompteAuGel(itemA({ cle: "cv-a", ...options }), CANDIDAT, GEL, REFERENTIEL)).toBe(false);
    expect(itemPCompteAuGel(itemF({ cle: "cv-f", ...options }), CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("ne compte pas l'item P d'un autre candidat", () => {
    const item = itemP({ cle: "cv-autre", candidat_id: AUTRE, mesure: MESURE });
    expect(itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toBe(false);
  });

  it("refuse, comme le tirage, une dernière décision du panel datée après le gel", () => {
    const item = arbitre(p("apres-gel"), [contestation("cv-apres", "maintien", "2026-11-21T10:00:00+01:00")]);
    expect(() => itemPCompteAuGel(item, CANDIDAT, GEL, REFERENTIEL)).toThrow(DecisionPanelPosterieureAuGel);
  });
});

describe("idsPAuGel : le total d'un candidat", () => {
  it("compte exactement 9 items", () => {
    expect(idsPAuGel(nItems(9, "neuf"), CANDIDAT, GEL, [MESURE], INTERROGES).length).toBe(9);
  });

  it("compte exactement 10 items", () => {
    expect(idsPAuGel(nItems(10, "dix"), CANDIDAT, GEL, [MESURE], INTERROGES).length).toBe(10);
  });

  it("n'ajoute au total ni les items exclus ni ceux des autres candidats", () => {
    const options = { candidat_id: CANDIDAT, mesure: MESURE };
    const items = [
      ...nItems(10, "melange"),
      p("m-conteste", { statut_contestation: "contestee" }),
      p("m-expire", { valide_au: "2026-11-20" }),
      itemO({ cle: "m-o", candidat_id: CANDIDAT, mesure: MESURE_O }),
      itemA({ cle: "m-a", ...options }),
      itemF({ cle: "m-f", ...options }),
      itemP({ cle: "m-autre", candidat_id: AUTRE, mesure: MESURE }),
      arbitre(p("m-maintien"), [contestation("m-maintien", "maintien", AVANT_GEL)]),
    ];
    expect(idsPAuGel(items, CANDIDAT, GEL, [MESURE, MESURE_O], INTERROGES).length).toBe(11);
  });

  it("n'ajoute pas au total un item P qui épingle une version dépassée de sa mesure (conformité n° 2)", () => {
    const courante = { ...MESURE, version: 2 };
    const items = [...nItems(9, "version"), itemP({ cle: "version-a-jour", candidat_id: CANDIDAT, mesure: courante })];
    expect(idsPAuGel(items, CANDIDAT, GEL, [courante], INTERROGES).length).toBe(1);
  });

  it("rend 0 pour un candidat sans item, jamais une absence", () => {
    expect(idsPAuGel([], CANDIDAT, GEL, [MESURE], INTERROGES).length).toBe(0);
  });

  it("signale un arbitrage illisible d'un item du candidat au lieu de l'ignorer", () => {
    const illisible = { ...p("illisible"), statut_contestation: "arbitree" as const, contestations: [{}] };
    expect(() => idsPAuGel([illisible], CANDIDAT, GEL, [MESURE], INTERROGES)).toThrow();
  });
});

/**
 * Conformité n° 11, décision de l'auteur du 2026-10-02 (texte à écrire au §8 en 0.15) : les items P
 * de référence des comparateurs sont ceux que compte le seuil. Le run fige leur liste ; le compte
 * en est la longueur, pour qu'une seule définition serve aux deux.
 */
describe("idsPAuGel : la liste que le run fige, dont le compte est la longueur", () => {
  it("rend les identifiants triés des seuls items comptés, et le compte en est la longueur", () => {
    const items = [
      ...nItems(3, "liste"),
      p("l-conteste", { statut_contestation: "contestee" }),
      itemP({ cle: "l-autre", candidat_id: AUTRE, mesure: MESURE }),
    ];
    const liste = idsPAuGel(items, CANDIDAT, GEL, [MESURE], INTERROGES);
    const attendus = nItems(3, "liste").map((item) => item.id).sort();
    expect(liste).toEqual(attendus);
  });

  it("exclut l'item obsolète exactement à l'instant du gel", () => {
    const obsolete = p("l-obsolete-au-gel", { valide_du: "2026-09-01", valide_au: "2026-11-20" });
    expect(idsPAuGel([obsolete], CANDIDAT, "2026-11-20T00:00:00Z", [MESURE], INTERROGES)).toEqual([]);
  });

  it("rend une liste vide pour un candidat sans item, jamais une absence", () => {
    expect(idsPAuGel([], CANDIDAT, GEL, [MESURE], INTERROGES)).toEqual([]);
  });

  it("lève sur deux items comptés de même identifiant, au lieu de les dédoublonner en silence", () => {
    const item = p("l-double");
    expect(() => idsPAuGel([item, { ...item }], CANDIDAT, GEL, [MESURE], INTERROGES)).toThrow(item.id);
  });
});
