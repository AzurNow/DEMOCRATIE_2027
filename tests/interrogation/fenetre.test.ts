/**
 * Cas limite 5 du brief (partie pure) : la fenêtre du run, [debut, fin), fin = debut + 48 h
 * absolues. §6 (0.27) : un run régulier l'ouvre le mardi à 6 h, heure de Paris ; un run
 * supplémentaire l'ouvre à 6 h, heure de Paris, le premier jour qui suit son gel (constat 5 de la
 * conformité du 2026-11-03).
 */

import { describe, expect, it } from "vitest";
import { DUREE_FENETRE_MS } from "../../pipeline/interrogation/conditions.ts";
import { FenetreRefusee, ouvrirFenetre, tentativePeutDemarrer, TypeRunInconnu } from "../../pipeline/interrogation/fenetre.ts";
import { dateParis, instantParis } from "../../pipeline/interrogation/heure-paris.ts";

/** Un run régulier : sa date de gel ne règle pas l'ouverture, seul le mardi 6 h compte. */
const MENSUEL = { type_run: "mensuel", date_gel: "2026-11-27T09:00:00+01:00" } as const;

function supplementaire(date_gel: string, type_run = "supplementaire_debat") {
  return { type_run, date_gel };
}

describe("cas 5 : run régulier, un début de fenêtre qui n'est pas un mardi 06:00 heure de Paris est refusé", () => {
  it("accepte le mardi 1er décembre 2026 à 06:00 (+01:00), et la même heure écrite en UTC", () => {
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", MENSUEL).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(() => ouvrirFenetre("2026-12-01T05:00:00Z", MENSUEL)).not.toThrow();
  });

  it.each([
    ["un lundi", "2026-11-30T06:00:00+01:00"],
    ["un mardi à 07:00", "2026-12-01T07:00:00+01:00"],
    ["06:00 UTC, soit 07:00 à Paris", "2026-12-01T06:00:00Z"],
    ["une seconde après 06:00", "2026-12-01T06:00:01+01:00"],
    ["une milliseconde après 06:00", "2026-12-01T06:00:00.001+01:00"],
    ["06:00 en heure d'été un mardi d'hiver (05:00 à Paris)", "2026-10-27T06:00:00+02:00"],
  ])("refuse %s", (_libelle, debut) => {
    expect(() => ouvrirFenetre(debut, MENSUEL)).toThrow(FenetreRefusee);
  });

  it("refuse un instant sans décalage", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00", MENSUEL)).toThrow(/décalage explicite/);
  });

  it.each(["pilote", "mensuel", "hebdomadaire", "reexecution"])(
    "%s : mardi 06:00 exigé, quel que soit le jour du gel ; le lendemain d'un gel du samedi, un dimanche, est refusé",
    (type_run) => {
      const run = { type_run, date_gel: "2027-03-13T10:00:00+01:00" };
      expect(ouvrirFenetre("2027-03-16T06:00:00+01:00", run).debut_ms).toBe(Date.parse("2027-03-16T05:00:00Z"));
      expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", run)).toThrow(FenetreRefusee);
      expect(() => ouvrirFenetre("2027-03-15T06:00:00+01:00", run)).toThrow(/mardi/);
    },
  );
});

describe("cas 5 : run supplémentaire, ouverture à 06:00 heure de Paris le premier jour civil de Paris qui suit son gel", () => {
  it.each(["supplementaire_liste_officielle", "supplementaire_debat"])("%s gelé un samedi : ouvre le dimanche à 06:00", (type_run) => {
    const fenetre = ouvrirFenetre("2027-03-14T06:00:00+01:00", supplementaire("2027-03-13T10:00:00+01:00", type_run));
    expect(fenetre.debut_ms).toBe(Date.parse("2027-03-14T05:00:00Z"));
    expect(fenetre.fin).toBe("2027-03-16T06:00:00.000+01:00");
  });

  it("gelé un samedi : un mardi qui n'est pas le lendemain du gel est refusé, le lundi aussi", () => {
    const run = supplementaire("2027-03-13T10:00:00+01:00");
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run)).toThrow(FenetreRefusee);
    expect(() => ouvrirFenetre("2027-03-15T06:00:00+01:00", run)).toThrow(/2027-03-14/);
  });

  it("gelé le jour même de l'ouverture proposée : refusé (le premier jour qui suit, pas le jour du gel)", () => {
    expect(() => ouvrirFenetre("2027-03-13T06:00:00+01:00", supplementaire("2027-03-13T05:00:00+01:00"))).toThrow(FenetreRefusee);
  });

  it("gelé un lundi à 23:30 Paris (22:30 UTC, encore lundi) : ouvre le mardi à 06:00", () => {
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T23:30:00+01:00")).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T22:30:00Z")).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
  });

  it("le jour du gel se lit à Paris, pas en UTC : gelé le mardi 00:30 Paris d'été (lundi 22:30 UTC), ouvre le mercredi", () => {
    const run = supplementaire("2027-06-28T22:30:00Z");
    expect(ouvrirFenetre("2027-06-30T06:00:00+02:00", run).debut_ms).toBe(Date.parse("2027-06-30T04:00:00Z"));
    expect(() => ouvrirFenetre("2027-06-29T06:00:00+02:00", run)).toThrow(FenetreRefusee);
  });

  it("gel à minuit moins une milliseconde, heure de Paris : ouvre le lendemain ; à minuit pile : le surlendemain", () => {
    const avant = supplementaire("2026-11-30T23:59:59.999+01:00");
    const apres = supplementaire("2026-12-01T00:00:00+01:00");
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", avant)).not.toThrow();
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", apres)).toThrow(FenetreRefusee);
    expect(() => ouvrirFenetre("2026-12-02T06:00:00+01:00", apres)).not.toThrow();
  });

  it.each([
    ["à 07:00", "2027-03-14T07:00:00+01:00"],
    ["une seconde après 06:00", "2027-03-14T06:00:01+01:00"],
    ["une milliseconde après 06:00", "2027-03-14T06:00:00.001+01:00"],
    ["06:00 UTC, soit 07:00 à Paris", "2027-03-14T06:00:00Z"],
  ])("le bon jour mais %s : refusé", (_libelle, debut) => {
    expect(() => ouvrirFenetre(debut, supplementaire("2027-03-13T10:00:00+01:00"))).toThrow(FenetreRefusee);
  });

  it("gelé la veille du passage à l'heure d'été (samedi 27 mars 2027) : ouvre le dimanche à 06:00 +02:00", () => {
    const run = supplementaire("2027-03-27T12:00:00+01:00");
    const fenetre = ouvrirFenetre("2027-03-28T06:00:00+02:00", run);
    expect(fenetre.debut_ms).toBe(Date.parse("2027-03-28T04:00:00Z"));
    expect(fenetre.fin).toBe("2027-03-30T06:00:00.000+02:00");
    expect(() => ouvrirFenetre("2027-03-28T06:00:00+01:00", run)).toThrow(FenetreRefusee);
  });

  it("gelé la veille du passage à l'heure d'hiver (samedi 30 octobre 2027) : ouvre le dimanche à 06:00 +01:00", () => {
    const run = supplementaire("2027-10-30T20:00:00+02:00");
    const fenetre = ouvrirFenetre("2027-10-31T06:00:00+01:00", run);
    expect(fenetre.debut_ms).toBe(Date.parse("2027-10-31T05:00:00Z"));
    expect(fenetre.fin).toBe("2027-11-02T06:00:00.000+01:00");
    expect(() => ouvrirFenetre("2027-10-31T06:00:00+02:00", run)).toThrow(FenetreRefusee);
  });

  it("gelé un vendredi, la fenêtre du samedi contient le passage à l'heure d'été : 48 h absolues, fin à 07:00 +02:00", () => {
    const fenetre = ouvrirFenetre("2027-03-27T06:00:00+01:00", supplementaire("2027-03-26T18:00:00+01:00"));
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(DUREE_FENETRE_MS);
    expect(fenetre.fin).toBe("2027-03-29T07:00:00.000+02:00");
  });

  it("gelé un lundi : le lendemain est un mardi, les deux règles s'accordent", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T09:00:00+01:00"))).not.toThrow();
  });
});

describe("cas 5 : ce que la fenêtre lit du run", () => {
  it("un type de run hors de run.schema.json est refusé, jamais traité comme régulier par défaut", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", { type_run: "special", date_gel: MENSUEL.date_gel })).toThrow(TypeRunInconnu);
  });

  it("une date de gel sans décalage est refusée, même pour un run régulier", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", { type_run: "mensuel", date_gel: "2026-11-27T09:00:00" })).toThrow(
      /décalage explicite/,
    );
  });
});

describe("cas 5 : 48 heures absolues, de part et d'autre du passage à l'heure d'hiver du 25 octobre 2026", () => {
  // Le changement d'heure français tombe un dimanche : aucune fenêtre ouverte un mardi à 6 h ne le
  // contient (mardi 6 h + 48 h = jeudi 6 h). On vérifie donc les deux fenêtres qui l'encadrent :
  // l'une à l'heure d'été, l'autre à l'heure d'hiver, toutes deux de 48 heures absolues.
  it("mardi 20 octobre (heure d'été) : fin jeudi 22 à 06:00 +02:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-20T06:00:00+02:00", MENSUEL);
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(48 * 3_600_000);
    expect(fenetre.fin).toBe("2026-10-22T06:00:00.000+02:00");
  });

  it("mardi 27 octobre (heure d'hiver) : fin jeudi 29 à 06:00 +01:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-27T06:00:00+01:00", MENSUEL);
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(DUREE_FENETRE_MS);
    expect(fenetre.fin).toBe("2026-10-29T06:00:00.000+01:00");
  });

  it("l'heure de Paris suit le changement d'heure : 00:59:59 UTC le 25 = 02:59:59 +02:00, 01:00 UTC = 02:00 +01:00", () => {
    expect(instantParis(Date.parse("2026-10-25T00:59:59Z"))).toBe("2026-10-25T02:59:59.000+02:00");
    expect(instantParis(Date.parse("2026-10-25T01:00:00Z"))).toBe("2026-10-25T02:00:00.000+01:00");
  });
});

describe("cas 5 : la fenêtre est semi-ouverte", () => {
  const fenetre = ouvrirFenetre("2026-12-01T06:00:00+01:00", MENSUEL);

  it("une tentative à fin − 1 ms peut démarrer", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.fin_ms - 1)).toBe(true);
  });

  it("une tentative à fin exactement ne démarre pas", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.fin_ms)).toBe(false);
  });

  it("une tentative au début exactement démarre ; une milliseconde avant, non", () => {
    expect(tentativePeutDemarrer(fenetre, fenetre.debut_ms)).toBe(true);
    expect(tentativePeutDemarrer(fenetre, fenetre.debut_ms - 1)).toBe(false);
  });
});

describe("date du répertoire d'un run", () => {
  it("est la date à Paris, pas la date UTC", () => {
    expect(dateParis(Date.parse("2026-11-26T23:30:00Z"))).toBe("2026-11-27");
  });
});
