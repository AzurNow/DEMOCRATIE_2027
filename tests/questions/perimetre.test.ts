/**
 * Conformité n° 10 : inclusion d'un candidat dans le régime « avant la liste officielle » (§3).
 *
 * Texte 0.11, confirmé par l'auteur le 2026-09-27 : « la fenêtre va de 60 jours avant l'instant de
 * gel jusqu'à cet instant, bornes comprises, une date de publication se lisant à minuit UTC ». Le
 * JSON Schema ne sait pas comparer des dates : cette fonction pure le fait, et chaque cas limite
 * du brief a son test nommé. Les instants attendus sont écrits en clair à côté de chaque cas.
 */

import { describe, expect, it } from "vitest";
import {
  debutFenetreNotices,
  FENETRE_NOTICES_MOIS,
  FENETRE_SONDAGES_JOURS,
  inclusionAvantListe,
  noticeDansLaFenetre,
  SONDAGES_MINIMUM,
  sondageDansLaFenetre,
} from "../../pipeline/questions/perimetre.ts";
import type { CandidatAvantListe, PreuveSondage } from "../../pipeline/questions/perimetre.ts";

const GEL_DIX_HEURES = "2026-11-20T10:00:00Z";
const GEL_MINUIT = "2026-11-20T00:00:00Z";

/** Une notice de l'institut dans la fenêtre de douze mois de chacun des gels de 2026-11-20 (D70 (6)). */
const NOTICE = { date_publication: "2026-06-15" };

function sondage(date_publication: string, cle: string, notice_date = NOTICE.date_publication): PreuveSondage {
  return { date_publication, url: `https://institut.invalid/${cle}`, notice_institut: { date_publication: notice_date } };
}

function sondageSansNotice(date_publication: string, cle: string): PreuveSondage {
  return { date_publication, url: `https://institut.invalid/${cle}` };
}

const DECLARATION = { url: "https://candidat.invalid/declaration", date: "2026-06-02" };

function candidat(preuves: readonly PreuveSondage[], declaration = true): CandidatAvantListe {
  return declaration ? { preuves_inclusion: preuves, declaration_candidature: DECLARATION } : { preuves_inclusion: preuves };
}

describe("constantes du §3", () => {
  it("60 jours, deux sondages", () => {
    expect(FENETRE_SONDAGES_JOURS).toBe(60);
    expect(SONDAGES_MINIMUM).toBe(2);
  });
});

describe("sondageDansLaFenetre : bornes de la fenêtre de 60 jours", () => {
  it("exclut un sondage daté 2026-09-21 pour un gel à 2026-11-20T10:00Z (minuit UTC = gel − 60 j − 10 h)", () => {
    // Borne basse : 2026-11-20T10:00Z − 60 j = 2026-09-21T10:00Z ; le sondage se lit 2026-09-21T00:00Z,
    // dix heures avant cette borne.
    expect(sondageDansLaFenetre("2026-09-21", GEL_DIX_HEURES)).toBe(false);
  });

  it("retient un sondage daté 2026-09-22 pour le même gel (premier jour entièrement dans la fenêtre)", () => {
    expect(sondageDansLaFenetre("2026-09-22", GEL_DIX_HEURES)).toBe(true);
  });

  it("retient un sondage daté exactement de gel − 60 jours quand le gel est à 00:00:00Z (borne comprise)", () => {
    // 2026-11-20T00:00Z − 60 j = 2026-09-21T00:00Z, instant du sondage lui-même.
    expect(sondageDansLaFenetre("2026-09-21", GEL_MINUIT)).toBe(true);
  });

  it("exclut la veille de cette borne avec un gel à minuit", () => {
    expect(sondageDansLaFenetre("2026-09-20", GEL_MINUIT)).toBe(false);
  });

  it("retient un sondage daté du jour du gel avec un gel à 10:00Z", () => {
    expect(sondageDansLaFenetre("2026-11-20", GEL_DIX_HEURES)).toBe(true);
  });

  it("retient un sondage daté du jour du gel avec un gel à minuit (borne haute comprise)", () => {
    expect(sondageDansLaFenetre("2026-11-20", GEL_MINUIT)).toBe(true);
  });

  it("exclut un sondage daté du lendemain du gel", () => {
    expect(sondageDansLaFenetre("2026-11-21", GEL_DIX_HEURES)).toBe(false);
  });

  it("lit un gel à décalage non nul sur l'instant, pas sur la date affichée", () => {
    // 2026-11-20T00:30:00+01:00 = 2026-11-19T23:30Z : le sondage du 20 (00:00Z) est postérieur.
    expect(sondageDansLaFenetre("2026-11-20", "2026-11-20T00:30:00+01:00")).toBe(false);
  });

  it("refuse une date de publication illisible au lieu de l'exclure en silence", () => {
    expect(() => sondageDansLaFenetre("2026-13-45", GEL_DIX_HEURES)).toThrow();
  });

  it("refuse un gel sans décalage horaire", () => {
    expect(() => sondageDansLaFenetre("2026-11-01", "2026-11-20T10:00:00")).toThrow();
  });
});

describe("inclusionAvantListe : les deux conditions du §3", () => {
  it("inclut un candidat déclaré avec deux sondages dans la fenêtre", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-10-01", "a"), sondage("2026-11-20", "b")]),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: true, declaration_au_gel: true, sondages_dans_la_fenetre: 2 });
  });

  it("n'inclut pas un candidat dont un seul des deux sondages déclarés est dans la fenêtre", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-09-21", "hors"), sondage("2026-11-01", "dans")]),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });

  it("n'inclut pas un candidat dont le second sondage est daté du lendemain du gel", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-11-01", "dans"), sondage("2026-11-21", "lendemain")]),
      GEL_DIX_HEURES,
    );
    expect(verdict.inclus).toBe(false);
    expect(verdict.sondages_dans_la_fenetre).toBe(1);
  });

  it("n'inclut pas un candidat sans déclaration de candidature, même avec deux sondages", () => {
    const verdict = inclusionAvantListe(
      candidat([sondage("2026-10-01", "a"), sondage("2026-11-01", "b")], false),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: false, sondages_dans_la_fenetre: 2 });
  });

  it("n'inclut pas un candidat dont la déclaration est postérieure au gel", () => {
    const verdict = inclusionAvantListe(
      {
        preuves_inclusion: [sondage("2026-10-01", "a"), sondage("2026-11-01", "b")],
        declaration_candidature: { url: DECLARATION.url, date: "2026-11-21" },
      },
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: false, sondages_dans_la_fenetre: 2 });
  });

  it("retient une déclaration datée du jour du gel (minuit UTC ≤ gel)", () => {
    const verdict = inclusionAvantListe(
      {
        preuves_inclusion: [sondage("2026-10-01", "a"), sondage("2026-11-01", "b")],
        declaration_candidature: { url: DECLARATION.url, date: "2026-11-20" },
      },
      GEL_DIX_HEURES,
    );
    expect(verdict.inclus).toBe(true);
  });

  it("n'inclut pas un candidat sans aucune preuve de sondage", () => {
    const verdict = inclusionAvantListe({ declaration_candidature: DECLARATION }, GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 0 });
  });

  it("compte une seule fois le même sondage déclaré deux fois (même URL)", () => {
    const doublon = sondage("2026-11-01", "meme");
    const verdict = inclusionAvantListe(candidat([doublon, { ...doublon }]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });
});

/*
 * D70 (6), protocole 0.28 (§3) : « un sondage compte s'il est publié par un institut dont au moins une
 * notice figure sur le site de la Commission des sondages au cours des douze mois précédant l'instant
 * de gel […] ; toute notice de l'institut compte, quel que soit le sondage qu'elle accompagne ; les
 * douze mois sont des mois civils, de la même date douze mois avant l'instant de gel jusqu'à cet
 * instant, bornes comprises, la date d'une notice se lisant à minuit UTC comme celle d'un sondage ».
 *
 * Lecture retenue, à confirmer par l'auteur (le protocole ne tranche pas) : « la même date » est la
 * date civile UTC de l'instant de gel, douze mois plus tôt ; quand ce jour n'existe pas (29 février,
 * l'année précédente n'étant jamais bissextile), la borne est le dernier jour du mois, le 28 février.
 */
describe("constante de D70 (6)", () => {
  it("douze mois", () => {
    expect(FENETRE_NOTICES_MOIS).toBe(12);
  });
});

describe("debutFenetreNotices : la même date douze mois avant l'instant de gel", () => {
  it("rend la même date un an avant pour un gel ordinaire", () => {
    expect(debutFenetreNotices(GEL_DIX_HEURES)).toBe("2025-11-20");
  });

  it("gel un 31 du mois : le 31 du même mois douze mois avant, qui existe toujours", () => {
    expect(debutFenetreNotices("2027-03-31T10:00:00Z")).toBe("2026-03-31");
    expect(debutFenetreNotices("2026-12-31T23:00:00Z")).toBe("2025-12-31");
  });

  it("gel un 29 février : lecture retenue, le 28 février de l'année précédente, jamais le 1er mars", () => {
    expect(debutFenetreNotices("2028-02-29T10:00:00Z")).toBe("2027-02-28");
  });

  it("gel un 28 février d'une année bissextile : le 28 février de l'année précédente", () => {
    expect(debutFenetreNotices("2028-02-28T10:00:00Z")).toBe("2027-02-28");
  });

  it("gel un 1er mars : le 1er mars de l'année précédente", () => {
    expect(debutFenetreNotices("2028-03-01T10:00:00Z")).toBe("2027-03-01");
  });

  it("lit la date du gel en UTC, pas dans le décalage affiché", () => {
    // 2026-11-20T00:30:00+01:00 = 2026-11-19T23:30Z : la date civile UTC du gel est le 19.
    expect(debutFenetreNotices("2026-11-20T00:30:00+01:00")).toBe("2025-11-19");
  });

  it("refuse un gel sans décalage horaire", () => {
    expect(() => debutFenetreNotices("2026-11-20T10:00:00")).toThrow();
  });
});

describe("noticeDansLaFenetre : bornes de la fenêtre de douze mois", () => {
  it("compte une notice datée exactement douze mois civils avant l'instant de gel (borne comprise)", () => {
    expect(noticeDansLaFenetre("2025-11-20", GEL_DIX_HEURES)).toBe(true);
  });

  it("refuse une notice datée de la veille de cette date", () => {
    expect(noticeDansLaFenetre("2025-11-19", GEL_DIX_HEURES)).toBe(false);
  });

  it("compte une notice datée du jour du gel, gel à 23:59 UTC", () => {
    expect(noticeDansLaFenetre("2026-11-20", "2026-11-20T23:59:00Z")).toBe(true);
  });

  it("compte une notice datée du jour du gel, gel à minuit UTC (borne haute comprise)", () => {
    expect(noticeDansLaFenetre("2026-11-20", GEL_MINUIT)).toBe(true);
  });

  it("refuse une notice datée du lendemain du gel", () => {
    expect(noticeDansLaFenetre("2026-11-21", "2026-11-20T23:59:00Z")).toBe(false);
  });

  it("lit l'instant de gel, pas la date affichée : notice du 20 refusée pour un gel à 2026-11-20T00:30:00+01:00", () => {
    expect(noticeDansLaFenetre("2026-11-20", "2026-11-20T00:30:00+01:00")).toBe(false);
  });

  it("gel un 29 février : compte la notice du 28 février de l'année précédente, refuse celle du 27", () => {
    expect(noticeDansLaFenetre("2027-02-28", "2028-02-29T10:00:00Z")).toBe(true);
    expect(noticeDansLaFenetre("2027-02-27", "2028-02-29T10:00:00Z")).toBe(false);
  });

  it("gel un 31 du mois : compte la notice du 31 du même mois douze mois avant, refuse celle du 30", () => {
    expect(noticeDansLaFenetre("2026-03-31", "2027-03-31T10:00:00Z")).toBe(true);
    expect(noticeDansLaFenetre("2026-03-30", "2027-03-31T10:00:00Z")).toBe(false);
  });

  it("refuse une date de notice impossible au lieu de l'exclure en silence", () => {
    expect(() => noticeDansLaFenetre("2026-02-30", GEL_DIX_HEURES)).toThrow();
  });
});

describe("inclusionAvantListe : un sondage ne compte que si la notice de son institut est dans la fenêtre", () => {
  it("ne compte pas un sondage dont la notice est datée de la veille de la borne des douze mois", () => {
    const verdict = inclusionAvantListe(candidat([sondage("2026-10-01", "a", "2025-11-19"), sondage("2026-11-01", "b")]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });

  it("compte un sondage dont la notice est datée exactement de la borne des douze mois", () => {
    const verdict = inclusionAvantListe(candidat([sondage("2026-10-01", "a", "2025-11-20"), sondage("2026-11-01", "b")]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: true, declaration_au_gel: true, sondages_dans_la_fenetre: 2 });
  });

  it("ne compte pas un sondage dont la notice est datée du lendemain du gel", () => {
    const verdict = inclusionAvantListe(candidat([sondage("2026-10-01", "a", "2026-11-21"), sondage("2026-11-01", "b")]), GEL_DIX_HEURES);
    expect(verdict.sondages_dans_la_fenetre).toBe(1);
  });

  it("ne compte pas un sondage sans notice : l'absence de notice est l'absence de preuve", () => {
    const verdict = inclusionAvantListe(candidat([sondageSansNotice("2026-10-01", "a"), sondage("2026-11-01", "b")]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });

  it("compte une notice qui accompagne un autre sondage du même institut, déclarée pour deux preuves", () => {
    // La notice n'est rapprochée d'aucun sondage : seule sa date compte (« quel que soit le sondage qu'elle accompagne »).
    const verdict = inclusionAvantListe(candidat([sondage("2026-10-01", "a", "2026-03-02"), sondage("2026-11-01", "b", "2026-03-02")]), GEL_DIX_HEURES);
    expect(verdict).toEqual({ inclus: true, declaration_au_gel: true, sondages_dans_la_fenetre: 2 });
  });

  it("deux preuves de la même URL normalisée, chacune avec une notice valide : toujours un seul sondage", () => {
    const verdict = inclusionAvantListe(
      candidat([
        { date_publication: "2026-11-01", url: "http://Institut.invalid/meme/#a", notice_institut: { date_publication: "2026-01-10" } },
        { date_publication: "2026-11-01", url: "https://institut.invalid/meme?utm_source=x", notice_institut: { date_publication: "2026-09-10" } },
      ]),
      GEL_DIX_HEURES,
    );
    expect(verdict).toEqual({ inclus: false, declaration_au_gel: true, sondages_dans_la_fenetre: 1 });
  });
});
