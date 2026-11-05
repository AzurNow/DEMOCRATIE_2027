/**
 * Cas limite 5 du brief (partie pure) : la fenêtre du run, [debut, fin), fin = debut + 48 h
 * absolues. §6 (0.27) : un run régulier l'ouvre le mardi à 6 h, heure de Paris ; un run
 * supplémentaire l'ouvre à 6 h, heure de Paris, le premier jour qui suit son gel (constat 5 de la
 * conformité du 2026-11-03).
 */

import { describe, expect, it } from "vitest";
import { DUREE_FENETRE_MS } from "../../pipeline/interrogation/conditions.ts";
import {
  FenetreRefusee,
  ouvrirFenetre,
  RemplacementIntrouvable,
  RemplacementsEnCycle,
  tentativePeutDemarrer,
  typeDOrigine,
  TypeRunInconnu,
  type MaillonDeRemplacement,
} from "../../pipeline/interrogation/fenetre.ts";
import { dateParis, instantParis } from "../../pipeline/interrogation/heure-paris.ts";

/** Aucun run du dépôt : un run qui n'est pas une réexécution n'en lit aucun. */
function AUCUN_RUN(): readonly MaillonDeRemplacement[] {
  throw new Error("les runs du dépôt ne devaient pas être lus pour ce run");
}

/** Un run régulier : sa date de gel ne règle pas l'ouverture, seul le mardi 6 h compte. */
const MENSUEL = { type_run: "mensuel", date_gel: "2026-11-27T09:00:00+01:00" } as const;

function supplementaire(date_gel: string, type_run = "supplementaire_debat") {
  return { type_run, date_gel };
}

describe("cas 5 : run régulier, un début de fenêtre qui n'est pas un mardi 06:00 heure de Paris est refusé", () => {
  it("accepte le mardi 1er décembre 2026 à 06:00 (+01:00), et la même heure écrite en UTC", () => {
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", MENSUEL, AUCUN_RUN).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(() => ouvrirFenetre("2026-12-01T05:00:00Z", MENSUEL, AUCUN_RUN)).not.toThrow();
  });

  it.each([
    ["un lundi", "2026-11-30T06:00:00+01:00"],
    ["un mardi à 07:00", "2026-12-01T07:00:00+01:00"],
    ["06:00 UTC, soit 07:00 à Paris", "2026-12-01T06:00:00Z"],
    ["une seconde après 06:00", "2026-12-01T06:00:01+01:00"],
    ["une milliseconde après 06:00", "2026-12-01T06:00:00.001+01:00"],
    ["06:00 en heure d'été un mardi d'hiver (05:00 à Paris)", "2026-10-27T06:00:00+02:00"],
  ])("refuse %s", (_libelle, debut) => {
    expect(() => ouvrirFenetre(debut, MENSUEL, AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("refuse un instant sans décalage", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00", MENSUEL, AUCUN_RUN)).toThrow(/décalage explicite/);
  });

  it.each(["pilote", "mensuel", "hebdomadaire"])(
    "%s : mardi 06:00 exigé, quel que soit le jour du gel ; le lendemain d'un gel du samedi, un dimanche, est refusé",
    (type_run) => {
      const run = { type_run, date_gel: "2027-03-13T10:00:00+01:00" };
      expect(ouvrirFenetre("2027-03-16T06:00:00+01:00", run, AUCUN_RUN).debut_ms).toBe(Date.parse("2027-03-16T05:00:00Z"));
      expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", run, AUCUN_RUN)).toThrow(FenetreRefusee);
      expect(() => ouvrirFenetre("2027-03-15T06:00:00+01:00", run, AUCUN_RUN)).toThrow(/mardi/);
    },
  );
});

describe("cas 5 : run supplémentaire, ouverture à 06:00 heure de Paris le premier jour civil de Paris qui suit son gel", () => {
  it.each(["supplementaire_liste_officielle", "supplementaire_debat"])("%s gelé un samedi : ouvre le dimanche à 06:00", (type_run) => {
    const fenetre = ouvrirFenetre("2027-03-14T06:00:00+01:00", supplementaire("2027-03-13T10:00:00+01:00", type_run), AUCUN_RUN);
    expect(fenetre.debut_ms).toBe(Date.parse("2027-03-14T05:00:00Z"));
    expect(fenetre.fin).toBe("2027-03-16T06:00:00.000+01:00");
  });

  it("gelé un samedi : un mardi qui n'est pas le lendemain du gel est refusé, le lundi aussi", () => {
    const run = supplementaire("2027-03-13T10:00:00+01:00");
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run, AUCUN_RUN)).toThrow(FenetreRefusee);
    expect(() => ouvrirFenetre("2027-03-15T06:00:00+01:00", run, AUCUN_RUN)).toThrow(/2027-03-14/);
  });

  it("gelé le jour même de l'ouverture proposée : refusé (le premier jour qui suit, pas le jour du gel)", () => {
    expect(() => ouvrirFenetre("2027-03-13T06:00:00+01:00", supplementaire("2027-03-13T05:00:00+01:00"), AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("gelé un lundi à 23:30 Paris (22:30 UTC, encore lundi) : ouvre le mardi à 06:00", () => {
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T23:30:00+01:00"), AUCUN_RUN).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
    expect(ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T22:30:00Z"), AUCUN_RUN).debut_ms).toBe(Date.parse("2026-12-01T05:00:00Z"));
  });

  it("le jour du gel se lit à Paris, pas en UTC : gelé le mardi 00:30 Paris d'été (lundi 22:30 UTC), ouvre le mercredi", () => {
    const run = supplementaire("2027-06-28T22:30:00Z");
    expect(ouvrirFenetre("2027-06-30T06:00:00+02:00", run, AUCUN_RUN).debut_ms).toBe(Date.parse("2027-06-30T04:00:00Z"));
    expect(() => ouvrirFenetre("2027-06-29T06:00:00+02:00", run, AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("gel à minuit moins une milliseconde, heure de Paris : ouvre le lendemain ; à minuit pile : le surlendemain", () => {
    const avant = supplementaire("2026-11-30T23:59:59.999+01:00");
    const apres = supplementaire("2026-12-01T00:00:00+01:00");
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", avant, AUCUN_RUN)).not.toThrow();
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", apres, AUCUN_RUN)).toThrow(FenetreRefusee);
    expect(() => ouvrirFenetre("2026-12-02T06:00:00+01:00", apres, AUCUN_RUN)).not.toThrow();
  });

  it.each([
    ["à 07:00", "2027-03-14T07:00:00+01:00"],
    ["une seconde après 06:00", "2027-03-14T06:00:01+01:00"],
    ["une milliseconde après 06:00", "2027-03-14T06:00:00.001+01:00"],
    ["06:00 UTC, soit 07:00 à Paris", "2027-03-14T06:00:00Z"],
  ])("le bon jour mais %s : refusé", (_libelle, debut) => {
    expect(() => ouvrirFenetre(debut, supplementaire("2027-03-13T10:00:00+01:00"), AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("gelé la veille du passage à l'heure d'été (samedi 27 mars 2027) : ouvre le dimanche à 06:00 +02:00", () => {
    const run = supplementaire("2027-03-27T12:00:00+01:00");
    const fenetre = ouvrirFenetre("2027-03-28T06:00:00+02:00", run, AUCUN_RUN);
    expect(fenetre.debut_ms).toBe(Date.parse("2027-03-28T04:00:00Z"));
    expect(fenetre.fin).toBe("2027-03-30T06:00:00.000+02:00");
    expect(() => ouvrirFenetre("2027-03-28T06:00:00+01:00", run, AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("gelé la veille du passage à l'heure d'hiver (samedi 30 octobre 2027) : ouvre le dimanche à 06:00 +01:00", () => {
    const run = supplementaire("2027-10-30T20:00:00+02:00");
    const fenetre = ouvrirFenetre("2027-10-31T06:00:00+01:00", run, AUCUN_RUN);
    expect(fenetre.debut_ms).toBe(Date.parse("2027-10-31T05:00:00Z"));
    expect(fenetre.fin).toBe("2027-11-02T06:00:00.000+01:00");
    expect(() => ouvrirFenetre("2027-10-31T06:00:00+02:00", run, AUCUN_RUN)).toThrow(FenetreRefusee);
  });

  it("gelé un vendredi, la fenêtre du samedi contient le passage à l'heure d'été : 48 h absolues, fin à 07:00 +02:00", () => {
    const fenetre = ouvrirFenetre("2027-03-27T06:00:00+01:00", supplementaire("2027-03-26T18:00:00+01:00"), AUCUN_RUN);
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(DUREE_FENETRE_MS);
    expect(fenetre.fin).toBe("2027-03-29T07:00:00.000+02:00");
  });

  it("gelé un lundi : le lendemain est un mardi, les deux règles s'accordent", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", supplementaire("2026-11-30T09:00:00+01:00"), AUCUN_RUN)).not.toThrow();
  });
});

describe("cas 5 : ce que la fenêtre lit du run", () => {
  it("un type de run hors de run.schema.json est refusé, jamais traité comme régulier par défaut", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", { type_run: "special", date_gel: MENSUEL.date_gel }, AUCUN_RUN)).toThrow(TypeRunInconnu);
  });

  it("une date de gel sans décalage est refusée, même pour un run régulier", () => {
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", { type_run: "mensuel", date_gel: "2026-11-27T09:00:00" }, AUCUN_RUN)).toThrow(
      /décalage explicite/,
    );
  });
});

describe("cas 5 : 48 heures absolues, de part et d'autre du passage à l'heure d'hiver du 25 octobre 2026", () => {
  // Le changement d'heure français tombe un dimanche : aucune fenêtre ouverte un mardi à 6 h ne le
  // contient (mardi 6 h + 48 h = jeudi 6 h). On vérifie donc les deux fenêtres qui l'encadrent :
  // l'une à l'heure d'été, l'autre à l'heure d'hiver, toutes deux de 48 heures absolues.
  it("mardi 20 octobre (heure d'été) : fin jeudi 22 à 06:00 +02:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-20T06:00:00+02:00", MENSUEL, AUCUN_RUN);
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(48 * 3_600_000);
    expect(fenetre.fin).toBe("2026-10-22T06:00:00.000+02:00");
  });

  it("mardi 27 octobre (heure d'hiver) : fin jeudi 29 à 06:00 +01:00, 48 h exactes", () => {
    const fenetre = ouvrirFenetre("2026-10-27T06:00:00+01:00", MENSUEL, AUCUN_RUN);
    expect(fenetre.fin_ms - fenetre.debut_ms).toBe(DUREE_FENETRE_MS);
    expect(fenetre.fin).toBe("2026-10-29T06:00:00.000+01:00");
  });

  it("l'heure de Paris suit le changement d'heure : 00:59:59 UTC le 25 = 02:59:59 +02:00, 01:00 UTC = 02:00 +01:00", () => {
    expect(instantParis(Date.parse("2026-10-25T00:59:59Z"))).toBe("2026-10-25T02:59:59.000+02:00");
    expect(instantParis(Date.parse("2026-10-25T01:00:00Z"))).toBe("2026-10-25T02:00:00.000+01:00");
  });
});

describe("cas 5 : la fenêtre est semi-ouverte", () => {
  const fenetre = ouvrirFenetre("2026-12-01T06:00:00+01:00", MENSUEL, AUCUN_RUN);

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

describe("D74 (19) : une réexécution ouvre sa fenêtre selon la règle du run qu'elle remplace", () => {
  // Les identifiants sont fictifs ; seule compte la chaîne des remplacements.
  const REGULIER = { id: "01KBCS0G00REGVL1ER00000000", type_run: "mensuel" };
  const SUPPLEMENTAIRE = { id: "01KBCS0G00SVPP1EMENTA1RE00", type_run: "supplementaire_debat" };
  const REEXEC_DU_SUPPLEMENTAIRE = { id: "01KBCS0G00REEXEC0000000001", type_run: "reexecution", run_remplace_id: SUPPLEMENTAIRE.id };
  const DEPOT: readonly MaillonDeRemplacement[] = [REGULIER, SUPPLEMENTAIRE, REEXEC_DU_SUPPLEMENTAIRE];
  const depot = (): readonly MaillonDeRemplacement[] => DEPOT;
  /** Gel d'une réexécution un samedi : le mardi et le lendemain du gel diffèrent. */
  const GEL_SAMEDI = "2027-03-13T10:00:00+01:00";

  function reexecution(run_remplace_id: string, date_gel = GEL_SAMEDI) {
    return { type_run: "reexecution", date_gel, run_remplace_id };
  }

  it("réexécution d'un run régulier : mardi 06:00 exigé, le lendemain du gel refusé", () => {
    const run = reexecution(REGULIER.id);
    expect(ouvrirFenetre("2027-03-16T06:00:00+01:00", run, depot).debut_ms).toBe(Date.parse("2027-03-16T05:00:00Z"));
    expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", run, depot)).toThrow(/mardi/);
  });

  it("réexécution d'un run supplémentaire : 06:00 le lendemain de son propre instant de gel, le mardi refusé", () => {
    const run = reexecution(SUPPLEMENTAIRE.id);
    expect(ouvrirFenetre("2027-03-14T06:00:00+01:00", run, depot).debut_ms).toBe(Date.parse("2027-03-14T05:00:00Z"));
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run, depot)).toThrow(FenetreRefusee);
  });

  it("réexécution d'une réexécution (deux niveaux) : la règle du run d'origine, lue de proche en proche (D75 (1))", () => {
    const run = reexecution(REEXEC_DU_SUPPLEMENTAIRE.id);
    expect(typeDOrigine(run, depot)).toBe("supplementaire_debat");
    expect(ouvrirFenetre("2027-03-14T06:00:00+01:00", run, depot).debut_ms).toBe(Date.parse("2027-03-14T05:00:00Z"));
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run, depot)).toThrow(FenetreRefusee);
  });

  it("run remplacé introuvable : erreur nommée, jamais de repli sur le mardi", () => {
    const run = reexecution("01KBCS0G00NTR0VVAB1E000000");
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run, depot)).toThrow(RemplacementIntrouvable);
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", run, () => [])).toThrow(/introuvable/);
  });

  it("maillon intermédiaire introuvable : erreur nommée", () => {
    const orphelin = { id: "01KBCS0G00RPHE1N0000000000", type_run: "reexecution", run_remplace_id: "01KBCS0G00D1SPARV000000000" };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(orphelin.id), () => [orphelin])).toThrow(RemplacementIntrouvable);
  });

  it("deux runs du dépôt portent l'id remplacé : erreur nommée, aucun n'est choisi", () => {
    const doublon = { ...REGULIER, type_run: "supplementaire_debat" };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(REGULIER.id), () => [REGULIER, doublon])).toThrow(/plusieurs runs/);
  });

  it("une réexécution sans run_remplace_id, ou un maillon réexécution sans lui : erreur nommée", () => {
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", { type_run: "reexecution", date_gel: GEL_SAMEDI }, depot)).toThrow(RemplacementIntrouvable);
    const sans = { id: "01KBCS0G00SANSREMP1ACE00000", type_run: "reexecution" };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(sans.id), () => [sans])).toThrow(/sans run_remplace_id/);
  });

  it("cycle dans la chaîne des remplacements : erreur nommée", () => {
    const a = { id: "01KBCS0G00CYC1EA0000000000", type_run: "reexecution", run_remplace_id: "01KBCS0G00CYC1EB0000000000" };
    const b = { id: "01KBCS0G00CYC1EB0000000000", type_run: "reexecution", run_remplace_id: a.id };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(a.id), () => [a, b])).toThrow(RemplacementsEnCycle);
    const soi = { id: "01KBCS0G00S01MEME000000000", type_run: "reexecution", run_remplace_id: "01KBCS0G00S01MEME000000000" };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(soi.id), () => [soi])).toThrow(/boucle/);
  });

  it("run d'origine d'un type hors de run.schema.json : refusé, jamais traité comme régulier", () => {
    const special = { id: "01KBCS0G00SPEC1A1000000000", type_run: "special" };
    expect(() => ouvrirFenetre("2027-03-16T06:00:00+01:00", reexecution(special.id), () => [special])).toThrow(TypeRunInconnu);
  });

  it("un run qui n'est pas une réexécution garde sa règle et ne lit pas les runs du dépôt", () => {
    expect(typeDOrigine(MENSUEL, AUCUN_RUN)).toBe("mensuel");
    expect(() => ouvrirFenetre("2026-12-01T06:00:00+01:00", MENSUEL, AUCUN_RUN)).not.toThrow();
    expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", supplementaire(GEL_SAMEDI), AUCUN_RUN)).not.toThrow();
  });

  it("bord exact : réexécution d'un supplémentaire gelée à minuit UTC, le jour du gel se lit à Paris", () => {
    // 2027-03-13T00:00:00Z = samedi 01:00 à Paris : ouvre le dimanche 14, pas le samedi 13.
    const minuit_utc = reexecution(SUPPLEMENTAIRE.id, "2027-03-13T00:00:00Z");
    expect(ouvrirFenetre("2027-03-14T06:00:00+01:00", minuit_utc, depot).debut_ms).toBe(Date.parse("2027-03-14T05:00:00Z"));
    expect(() => ouvrirFenetre("2027-03-13T06:00:00+01:00", minuit_utc, depot)).toThrow(FenetreRefusee);
    // 2027-03-12T23:00:00Z = samedi 00:00 pile à Paris : ouvre le dimanche ; une milliseconde avant (vendredi à Paris) : le samedi.
    expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", reexecution(SUPPLEMENTAIRE.id, "2027-03-12T23:00:00Z"), depot)).not.toThrow();
    const veille = reexecution(SUPPLEMENTAIRE.id, "2027-03-12T22:59:59.999Z");
    expect(() => ouvrirFenetre("2027-03-13T06:00:00+01:00", veille, depot)).not.toThrow();
    expect(() => ouvrirFenetre("2027-03-14T06:00:00+01:00", veille, depot)).toThrow(FenetreRefusee);
  });
});
