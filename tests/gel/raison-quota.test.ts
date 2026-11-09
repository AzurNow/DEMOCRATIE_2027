/**
 * Conformité du 2026-11-09, n° 12 (§5, « son changement est publié avec le run, avec sa raison ») :
 * la raison d'un changement de quota. Partie pure (`exigerRaisonDuChangementDeQuota`), schémas, et
 * deux gels de bout en bout sur un dépôt de fixture jetable (le premier écrit `runs/`, le second
 * lit son tirage). Chaque cas limite du brief a son test nommé « raison de quota, cas n ».
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { geler } from "../../pipeline/gel/geler.ts";
import type { OptionsGel } from "../../pipeline/gel/geler.ts";
import { exigerRaisonDuChangementDeQuota, RaisonQuotaRefusee } from "../../pipeline/gel/raison-quota.ts";
import { ALPHA, CONFIGURATION_GEL, depotDuJeu, optionsGel, perimetreSaisi, recommiter } from "./fixtures.ts";
import { jeuNominal } from "./jeux.ts";

const DATE_2 = "2026-12-02";
const GEL_2 = "2026-12-02T01:00:00+01:00";
const FENETRE_2 = "2026-12-08T06:00:00+01:00";
const MAINTENANT_2 = Date.parse("2026-12-03T00:00:00Z");
const RAISON = "Le panel a réduit le budget d'annotation ; le quota passe de 1 à 2 pour couvrir plus de strates.";

const temporaires: string[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  temporaires.push(chemin);
  return chemin;
}

/* -------------------------------------------------------------- partie pure */

const UN_UN = { questions_par_strate: 1, questions_attribution_par_theme: 1 };

function refusDe(appel: () => void): RaisonQuotaRefusee {
  try {
    appel();
  } catch (erreur) {
    expect(erreur).toBeInstanceOf(RaisonQuotaRefusee);
    return erreur as RaisonQuotaRefusee;
  }
  throw new Error("Aucun refus alors qu'un refus était attendu.");
}

describe("raison de quota, partie pure", () => {
  it("raison de quota, cas 1 : quota par strate changé, raison présente ⇒ accepté", () => {
    expect(() =>
      exigerRaisonDuChangementDeQuota({ ...UN_UN, questions_par_strate: 2, raison_changement_quota: RAISON }, UN_UN),
    ).not.toThrow();
  });

  it("raison de quota, cas 1 : quota d'attribution changé, raison présente ⇒ accepté", () => {
    expect(() =>
      exigerRaisonDuChangementDeQuota({ ...UN_UN, questions_attribution_par_theme: 3, raison_changement_quota: RAISON }, UN_UN),
    ).not.toThrow();
  });

  it("raison de quota, cas 2 : quota changé, raison absente ⇒ refus nommé raison_manquante, quota nommé", () => {
    const refus = refusDe(() => exigerRaisonDuChangementDeQuota({ ...UN_UN, questions_attribution_par_theme: 3 }, UN_UN));
    expect(refus.motif).toBe("raison_manquante");
    expect(refus.message).toContain("questions_attribution_par_theme");
    expect(refus.message).not.toContain("questions_par_strate");
  });

  it("raison de quota, cas 3 : quota inchangé, raison présente ⇒ refus nommé raison_sans_changement", () => {
    const refus = refusDe(() => exigerRaisonDuChangementDeQuota({ ...UN_UN, raison_changement_quota: RAISON }, UN_UN));
    expect(refus.motif).toBe("raison_sans_changement");
  });

  it("raison de quota, cas 3 : quota inchangé, raison absente ⇒ accepté", () => {
    expect(() => exigerRaisonDuChangementDeQuota(UN_UN, UN_UN)).not.toThrow();
  });

  it("raison de quota, cas 4 : premier run (aucun précédent), raison absente ⇒ accepté, rien n'est exigé", () => {
    expect(() => exigerRaisonDuChangementDeQuota(UN_UN, undefined)).not.toThrow();
  });

  it("raison de quota, cas 4 : premier run, raison présente ⇒ refus raison_sans_changement (aucun changement possible)", () => {
    const refus = refusDe(() => exigerRaisonDuChangementDeQuota({ ...UN_UN, raison_changement_quota: RAISON }, undefined));
    expect(refus.motif).toBe("raison_sans_changement");
    expect(refus.message).toContain("aucun run ne précède");
  });
});

/* ------------------------------------------------------------------ schémas */

function perimetreAvecRaison(raison: unknown): Record<string, unknown> {
  const perimetre = perimetreSaisi(GEL_2, [ALPHA]);
  return { ...perimetre, tirage: { ...(perimetre["tirage"] as object), raison_changement_quota: raison } };
}

describe("raison de quota, schémas", () => {
  it("raison de quota, cas 5 : perimetre.schema accepte une raison non vide", () => {
    expect(erreurDeSchema("perimetre", perimetreAvecRaison(RAISON), "périmètre d'essai")).toBeNull();
  });

  it("raison de quota, cas 5 : perimetre.schema refuse une raison chaîne vide", () => {
    expect(erreurDeSchema("perimetre", perimetreAvecRaison(""), "périmètre d'essai")).not.toBeNull();
  });

  it("raison de quota, cas 5 : perimetre.schema refuse une raison blanche", () => {
    expect(erreurDeSchema("perimetre", perimetreAvecRaison(" \t\n"), "périmètre d'essai")).not.toBeNull();
  });

  it("raison de quota, cas 5 : perimetre.schema refuse une raison nulle (absente ou texte, jamais null)", () => {
    expect(erreurDeSchema("perimetre", perimetreAvecRaison(null), "périmètre d'essai")).not.toBeNull();
  });

  it("raison de quota, cas 5 : tirage.schema refuse une raison vide ou blanche dans parametres", () => {
    for (const raison of ["", "   "]) {
      const tirage = { ...tirageNominal(), parametres: { ...UN_UN, raison_changement_quota: raison } };
      expect(erreurDeSchema("tirage", tirage, "tirage d'essai")).not.toBeNull();
    }
  });

  it("raison de quota, cas 1 : tirage.schema accepte une raison non vide dans parametres", () => {
    const tirage = { ...tirageNominal(), parametres: { ...UN_UN, raison_changement_quota: RAISON } };
    expect(erreurDeSchema("tirage", tirage, "tirage d'essai")).toBeNull();
  });
});

function tirageNominal(): Record<string, unknown> {
  const chemin = join(import.meta.dirname, "../../schema/exemples/tirage/valide-01-tirage-nominal.json");
  return JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
}

/* ----------------------------------------------------------- gel, de bout en bout */

async function depotAvecUnRun(): Promise<string> {
  const racine = depotDuJeu(jeuNominal());
  temporaires.push(racine);
  await geler(optionsGel(racine, undefined, { type_run: "mensuel" }));
  const chemin = join(racine, "runs", "2026-12-01", "run.json");
  const run = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  writeFileSync(chemin, `${JSON.stringify({ ...run, statut: "publie" }, null, 2)}\n`, "utf8");
  recommiter(racine, "premier run");
  return racine;
}

/** Avance au second gel avec les quotas et la raison donnés (le premier run a posé 1 et 1). */
function avancerAvec(racine: string, tirage: Record<string, unknown>): void {
  const perimetre = perimetreSaisi(GEL_2, [ALPHA]);
  writeFileSync(join(racine, "config/perimetre.yaml"), stringify({ ...perimetre, tirage }), "utf8");
  writeFileSync(
    join(racine, "config/gel.json"),
    `${JSON.stringify({ ...CONFIGURATION_GEL, fenetre_debut: FENETRE_2 }, null, 2)}\n`,
    "utf8",
  );
  recommiter(racine, "second gel");
}

function optionsDuSecond(racine: string, sortie: string): OptionsGel {
  return optionsGel(racine, sortie, { type_run: "mensuel", maintenant: () => MAINTENANT_2 });
}

async function secondGel(tirage: Record<string, unknown>): Promise<{ sortie: string; refus: unknown }> {
  const racine = await depotAvecUnRun();
  avancerAvec(racine, tirage);
  const sortie = temporaire("banc-gel-raison-quota-");
  try {
    await geler(optionsDuSecond(racine, sortie));
    return { sortie: join(sortie, DATE_2), refus: undefined };
  } catch (refus) {
    return { sortie: join(sortie, DATE_2), refus };
  }
}

function parametresPublies(sortie: string): Record<string, unknown> {
  const tirage = JSON.parse(readFileSync(join(sortie, "tirage.json"), "utf8")) as { parametres: Record<string, unknown> };
  return tirage.parametres;
}

describe("raison de quota, gel de bout en bout", () => {
  it("raison de quota, cas 1 : quota changé, raison présente ⇒ le gel passe et la raison est dans tirage.parametres", async () => {
    const { sortie, refus } = await secondGel({ questions_par_strate: 2, questions_attribution_par_theme: 1, raison_changement_quota: RAISON });
    expect(refus).toBeUndefined();
    expect(parametresPublies(sortie)).toEqual({
      questions_par_strate: 2,
      questions_attribution_par_theme: 1,
      raison_changement_quota: RAISON,
    });
  });

  it("raison de quota, cas 2 : quota changé, raison absente ⇒ refus nommé raison_manquante, rien d'écrit", async () => {
    const { sortie, refus } = await secondGel({ questions_par_strate: 2, questions_attribution_par_theme: 1 });
    expect(refus).toBeInstanceOf(RaisonQuotaRefusee);
    expect((refus as RaisonQuotaRefusee).motif).toBe("raison_manquante");
    expect(() => readFileSync(join(sortie, "tirage.json"))).toThrow();
  });

  it("raison de quota, cas 3 : quota inchangé, raison présente ⇒ refus nommé raison_sans_changement", async () => {
    const { refus } = await secondGel({ ...UN_UN, raison_changement_quota: RAISON });
    expect(refus).toBeInstanceOf(RaisonQuotaRefusee);
    expect((refus as RaisonQuotaRefusee).motif).toBe("raison_sans_changement");
  });

  it("raison de quota, cas 3 : quota inchangé, raison absente ⇒ le gel passe, tirage.parametres sans raison", async () => {
    const { sortie, refus } = await secondGel({ ...UN_UN });
    expect(refus).toBeUndefined();
    expect(parametresPublies(sortie)).toEqual(UN_UN);
  });

  it("raison de quota, cas 4 : premier run, aucune raison exigée ⇒ le gel passe sans raison", async () => {
    const racine = depotDuJeu(jeuNominal());
    temporaires.push(racine);
    const sortie = temporaire("banc-gel-raison-quota-");
    await geler(optionsGel(racine, sortie));
    expect(parametresPublies(join(sortie, "2026-12-01"))).toEqual(UN_UN);
  });
});
