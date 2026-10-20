/**
 * Conformité 2026-09-29, n° 23 et 25 : le chargeur de `config/perimetre.yaml`.
 *
 * Il valide le fichier contre `schema/perimetre.schema.json`, refuse un brouillon pour un run,
 * applique la règle d'inclusion du §3 (`inclusionAvantListe`), compte les items P au gel
 * (`itemsPAuGel`), puis rend l'instantané `run.perimetre`, validé contre `run.schema.json`, et les
 * `ParametresTirage`. Chaque cas limite du brief a son test nommé « cas n ».
 *
 * Aucun candidat, outil, sondage ni URL réel : tout est ouvertement fictif (`*.invalid`, `demo-*`).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import {
  chargerPerimetre,
  construirePerimetre,
  LETTRES_MOT_SIGNIFICATIF,
  normaliserAlias,
  PerimetreIncomplet,
  PerimetreRefuse,
  revelationsDansAlias,
  SEUIL_COUVERTURE_ITEMS_P,
} from "../../pipeline/questions/charger-perimetre.ts";
import type { ContexteDuGel } from "../../pipeline/questions/charger-perimetre.ts";
import { itemsPAuGel } from "../../pipeline/questions/couverture.ts";
import { THEMES } from "../../pipeline/questions/types.ts";
import type { Item } from "../../pipeline/questions/types.ts";
import { ErreurSchema, erreurDeSchema, validerFragment } from "../../outils/schemas/valider.ts";
import { itemP, mesure } from "./fabriques.ts";

type Objet = Record<string, unknown>;

const MODELE = resolve(import.meta.dirname, "fixtures/perimetre-modele.yaml");

/** 2026-11-20T00:00:00Z : le gel tombe à minuit UTC, la borne J−60 se lit sans décalage. */
const GEL = "2026-11-20T01:00:00+01:00";
const J_MOINS_60 = "2026-09-21";
const J_MOINS_61 = "2026-09-20";

const MESURE = mesure({ cle: "charger-perimetre", theme: "sante" });

function itemsDe(candidat_id: string, n: number): readonly Item[] {
  return Array.from({ length: n }, (_, rang) =>
    itemP({ cle: `charger-${candidat_id}-${rang}`, candidat_id, mesure: MESURE }),
  );
}

function sha(cle: string): string {
  return cle.repeat(64).slice(0, 64);
}

function sondage(cle: string, date_publication: string, url = `https://institut-${cle}.invalid/vague`): Objet {
  return {
    institut: `Institut ${cle}`,
    date_publication,
    url,
    sha256: sha("a"),
    archive_url: `https://web.archive.invalid/${cle}`,
  };
}

function declaration(date = "2026-06-02"): Objet {
  return {
    url: "https://candidat.invalid/declaration",
    date,
    par: "interesse",
    sha256: sha("b"),
    archive_url: "https://web.archive.invalid/declaration",
  };
}

function candidatActif(candidat_id: string, statut = "actif"): Objet {
  return {
    candidat_id,
    libelle: `Prénom ${candidat_id}`,
    nom: `Nom-${candidat_id}`,
    statut_au_gel: statut,
    interroge: true,
    declaration_candidature: declaration(),
    preuves_inclusion: [sondage("x", "2026-10-05"), sondage("y", "2026-11-01")],
    contact_notification: null,
  };
}

const PREUVE_STORE = {
  url: "https://classement-stores.invalid/fr",
  date_publication: "2026-11-19",
  sha256: sha("c"),
  archive_url: "https://web.archive.invalid/stores",
};

function assistantInclus(): Objet {
  return {
    outil_id: "outil-alpha",
    libelle: "Outil Alpha",
    editeur: "Éditeur Alpha",
    famille: "assistant",
    inclus: true,
    modele_demande: "modele-grand-public",
    modes: ["web_activee", "web_desactivee"],
    mode_de_tete: "web_activee",
    cgu_relues_le: "2026-11-10",
    clause_restrictive_signalee: false,
    preuve_inclusion: PREUVE_STORE,
    sdk: { paquet: "sdk-alpha", version: "1.2.3" },
  };
}

function perimetreComplet(): Objet {
  return {
    version: "0.2.0-essai",
    date_gel: GEL,
    regime_inclusion: "avant_liste_officielle",
    liste_officielle: null,
    themes: [...THEMES],
    tirage: { questions_par_strate: 3, questions_attribution_par_theme: 2 },
    candidats: [
      candidatActif("demo-alpha"),
      candidatActif("demo-beta", "nouveau"),
      { candidat_id: "demo-gamma", libelle: "Prénom demo-gamma", nom: "Nom-demo-gamma", statut_au_gel: "retire", interroge: false, contact_notification: null },
    ],
    outils: [
      assistantInclus(),
      { outil_id: "comparateur-gamma", libelle: "Comparateur Gamma", editeur: "Association Gamma", famille: "comparateur", inclus: true },
      {
        outil_id: "outil-beta",
        libelle: "Outil Beta",
        editeur: "Éditeur Beta",
        famille: "assistant",
        inclus: false,
        motif_exclusion: "Absent du top des applications à la date de gel.",
      },
    ],
  };
}

const ITEMS: readonly Item[] = [...itemsDe("demo-alpha", 10), ...itemsDe("demo-beta", 9), ...itemsDe("demo-gamma", 2)];

function contexte(alias: readonly (readonly [string, string])[] = [["outil-alpha", "O07"]]): ContexteDuGel {
  return { items: ITEMS, mesures: [MESURE], alias_aveugles: new Map(alias) };
}

function charger(perimetre: Objet, ctx: ContexteDuGel = contexte()) {
  return construirePerimetre(perimetre, ctx, "essai");
}

/** L’élément de ce rang, ou une erreur : un test ne lit jamais un rang absent en silence. */
function rang<T>(liste: readonly T[], indice: number): T {
  const valeur = liste[indice];
  if (valeur === undefined) throw new Error(`rang ${indice} absent`);
  return valeur;
}

function candidats(perimetre: Objet): Objet[] {
  return perimetre["candidats"] as Objet[];
}

function outils(perimetre: Objet): Objet[] {
  return perimetre["outils"] as Objet[];
}

function erreurDe(action: () => unknown): Error {
  try {
    action();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw new Error(`valeur levée qui n'est pas une Error : ${String(erreur)}`);
  }
  throw new Error("aucune erreur levée");
}

function refus(perimetre: Objet, ctx: ContexteDuGel = contexte()): PerimetreRefuse {
  const erreur = erreurDe(() => charger(perimetre, ctx));
  expect(erreur).toBeInstanceOf(PerimetreRefuse);
  return erreur as PerimetreRefuse;
}

function refusDeSchema(perimetre: Objet): ErreurSchema {
  const erreur = erreurDe(() => charger(perimetre));
  expect(erreur).toBeInstanceOf(ErreurSchema);
  return erreur as ErreurSchema;
}

describe("le périmètre complet de référence", () => {
  it("se charge, et rend un instantané et des paramètres de tirage", () => {
    const charge = charger(perimetreComplet());
    expect(charge.date_gel).toBe(GEL);
    expect(charge.perimetre.regime_inclusion).toBe("avant_liste_officielle");
    expect(charge.perimetre.candidats.map((c) => c.candidat_id)).toEqual(["demo-alpha", "demo-beta", "demo-gamma"]);
  });
});

describe("cas 1 : le modèle (nulls, listes vides) est un brouillon valide, jamais un run", () => {
  const brut: unknown = parse(readFileSync(MODELE, "utf8"));

  it("est valide contre perimetre.schema", () => {
    expect(erreurDeSchema("perimetre", brut, MODELE)).toBeNull();
  });

  it("est refusé au chargement, l'erreur nommant chaque clé fautive", () => {
    const erreur = erreurDe(() => chargerPerimetre(MODELE, contexte()));
    expect(erreur).toBeInstanceOf(PerimetreIncomplet);
    expect((erreur as PerimetreIncomplet).cles).toEqual([
      "date_gel",
      "regime_inclusion",
      "tirage.questions_par_strate",
      "tirage.questions_attribution_par_theme",
      "candidats",
      "outils",
    ]);
    for (const cle of (erreur as PerimetreIncomplet).cles) expect(erreur.message).toContain(cle);
    expect(erreur.message).toContain(MODELE);
  });

  it("nomme seule la clé restée nulle quand le reste est rempli", () => {
    const perimetre = perimetreComplet();
    (perimetre["tirage"] as Objet)["questions_attribution_par_theme"] = null;
    const erreur = erreurDe(() => charger(perimetre));
    expect((erreur as PerimetreIncomplet).cles).toEqual(["tirage.questions_attribution_par_theme"]);
  });
});

describe("cas 2 : la fenêtre de 60 jours, bornes comprises", () => {
  it("compte un sondage publié exactement à J−60 du gel", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["preuves_inclusion"] = [sondage("x", J_MOINS_60), sondage("y", "2026-11-01")];
    expect(() => charger(perimetre)).not.toThrow();
  });

  it("ne compte pas un sondage publié à J−61 : le candidat n'a plus qu'un sondage et est refusé", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["preuves_inclusion"] = [sondage("x", J_MOINS_61), sondage("y", "2026-11-01")];
    const erreur = refus(perimetre);
    expect(erreur.motifs).toHaveLength(1);
    expect(erreur.motifs[0]).toContain("demo-alpha");
    expect(erreur.motifs[0]).toContain("1 sondage");
  });

  it("ne compte pas J−60 quand le gel est à 09:00 heure de Paris (date de publication lue à minuit UTC, §3)", () => {
    const perimetre = perimetreComplet();
    perimetre["date_gel"] = "2026-11-20T09:00:00+01:00";
    rang(candidats(perimetre), 0)["preuves_inclusion"] = [sondage("x", J_MOINS_60), sondage("y", "2026-11-01")];
    expect(refus(perimetre).motifs[0]).toContain("demo-alpha");
  });
});

describe("cas 3 : deux preuves de la même URL ne font qu'un sondage", () => {
  const MEME_A = "http://Institut-X.invalid/vague/#resultats";
  const MEME_B = "https://institut-x.invalid/vague?utm_source=lettre";

  it("refuse un candidat dont les deux preuves ne diffèrent que par ce que normalisation-url-v1 normalise", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["preuves_inclusion"] = [sondage("x", "2026-10-05", MEME_A), sondage("y", "2026-11-01", MEME_B)];
    const erreur = refus(perimetre);
    expect(erreur.motifs[0]).toContain("demo-alpha");
    expect(erreur.motifs[0]).toContain("1 sondage");
  });

  it("accepte le même candidat dès qu'un second sondage distinct s'ajoute", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["preuves_inclusion"] = [
      sondage("x", "2026-10-05", MEME_A),
      sondage("y", "2026-11-01", MEME_B),
      sondage("z", "2026-11-02"),
    ];
    expect(() => charger(perimetre)).not.toThrow();
  });
});

describe("cas 4 : déclaration de candidature", () => {
  it("refuse une déclaration postérieure à date_gel", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 1)["declaration_candidature"] = declaration("2026-11-21");
    const erreur = refus(perimetre);
    expect(erreur.motifs).toHaveLength(1);
    expect(erreur.motifs[0]).toContain("demo-beta");
    expect(erreur.motifs[0]).toContain("déclaration");
  });

  it("accepte une déclaration datée du jour du gel quand le gel est à minuit UTC (borne comprise)", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 1)["declaration_candidature"] = declaration("2026-11-20");
    expect(() => charger(perimetre)).not.toThrow();
  });

  it("refuse un candidat non retiré sans déclaration dans le régime avant la liste", () => {
    const perimetre = perimetreComplet();
    delete rang(candidats(perimetre), 1)["declaration_candidature"];
    expect(refus(perimetre).motifs[0]).toContain("demo-beta");
  });
});

describe("cas 5 : candidat retiré", () => {
  it("n'exige aucune preuve d'un candidat retiré", () => {
    const charge = charger(perimetreComplet());
    const retire = rang(charge.perimetre.candidats, 2);
    expect(retire.statut_au_gel).toBe("retire");
    expect(retire.interroge).toBe(false);
    expect(retire).not.toHaveProperty("preuves_inclusion");
  });

  it("refuse un candidat retiré marqué interroge: true", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 2)["interroge"] = true;
    const erreur = refus(perimetre);
    expect(erreur.motifs).toHaveLength(1);
    expect(erreur.motifs[0]).toContain("demo-gamma");
    expect(erreur.motifs[0]).toContain("interroge");
  });
});

describe("cas 6 : régime et liste officielle", () => {
  const LISTE = {
    url: "https://conseil.invalid/liste-officielle",
    date_publication: "2027-03-10",
    sha256: sha("d"),
    archive_url: "https://web.archive.invalid/liste-officielle",
  };

  it("refuse le régime avant_liste_officielle avec une liste officielle renseignée", () => {
    const perimetre = perimetreComplet();
    perimetre["liste_officielle"] = LISTE;
    expect(refus(perimetre).motifs).toEqual([expect.stringContaining("liste_officielle")]);
  });

  it("refuse le régime liste_officielle sans liste", () => {
    const perimetre = perimetreComplet();
    perimetre["regime_inclusion"] = "liste_officielle";
    expect(refus(perimetre).motifs).toEqual([expect.stringContaining("liste_officielle")]);
  });

  it("accepte le régime liste_officielle avec la liste, sans sondage ni déclaration, et garde la liste", () => {
    const perimetre = perimetreComplet();
    perimetre["regime_inclusion"] = "liste_officielle";
    perimetre["liste_officielle"] = LISTE;
    for (const candidat of candidats(perimetre)) {
      delete candidat["preuves_inclusion"];
      delete candidat["declaration_candidature"];
    }
    expect(charger(perimetre).perimetre.liste_officielle).toEqual(LISTE);
  });
});

describe("cas 7 : quotas du tirage", () => {
  for (const [libelle, valeur] of [
    ["0", 0],
    ["négatif", -1],
    ["non entier", 2.5],
    ["textuel", "3"],
  ] as const) {
    it(`refuse un quota ${libelle}`, () => {
      for (const cle of ["questions_par_strate", "questions_attribution_par_theme"]) {
        const perimetre = perimetreComplet();
        (perimetre["tirage"] as Objet)[cle] = valeur;
        expect(refusDeSchema(perimetre).chemins).toContain(`/tirage/${cle}`);
      }
    });
  }

  it("refuse un quota absent", () => {
    for (const cle of ["questions_par_strate", "questions_attribution_par_theme"]) {
      const perimetre = perimetreComplet();
      delete (perimetre["tirage"] as Objet)[cle];
      expect(refusDeSchema(perimetre).message).toContain(cle);
    }
  });

  it("porte chaque quota à sa place dans ParametresTirage (inversion détectable)", () => {
    expect(charger(perimetreComplet()).parametres_tirage).toEqual({
      questions_par_strate: 3,
      questions_attribution_par_theme: 2,
    });
  });
});

describe("cas 8 : date_gel sans décalage horaire", () => {
  it("refuse un instant sans décalage", () => {
    const perimetre = perimetreComplet();
    perimetre["date_gel"] = "2026-11-20T09:00:00";
    expect(refusDeSchema(perimetre).chemins).toContain("/date_gel");
  });
});

describe("cas 9 : les thèmes sont exactement les dix du §3", () => {
  it("refuse un thème manquant", () => {
    const perimetre = perimetreComplet();
    perimetre["themes"] = THEMES.slice(1);
    expect(refus(perimetre).motifs).toEqual([expect.stringContaining(THEMES[0])]);
  });

  it("refuse un thème en trop", () => {
    const perimetre = perimetreComplet();
    perimetre["themes"] = [...THEMES, "agriculture"];
    expect(refusDeSchema(perimetre).chemins).toContain(`/themes/${THEMES.length}`);
  });

  it("refuse un thème en double", () => {
    const perimetre = perimetreComplet();
    perimetre["themes"] = [...THEMES, THEMES[3]];
    expect(refusDeSchema(perimetre).chemins).toContain("/themes");
  });
});

describe("cas 10 : seuil de couverture du §4 et items P au gel", () => {
  it("le seuil est 10", () => {
    expect(SEUIL_COUVERTURE_ITEMS_P).toBe(10);
  });

  it("met sous_seuil à vrai pour 9 items P comptés, à faux pour 10", () => {
    const [alpha, beta] = charger(perimetreComplet()).perimetre.candidats;
    expect(alpha).toMatchObject({ candidat_id: "demo-alpha", items_p_verifies: 10, sous_seuil: false });
    expect(beta).toMatchObject({ candidat_id: "demo-beta", items_p_verifies: 9, sous_seuil: true });
  });

  it("items_p_au_gel est trié et égal à itemsPAuGel, pour chaque candidat, retiré compris", () => {
    for (const candidat of charger(perimetreComplet()).perimetre.candidats) {
      const attendus = itemsPAuGel(ITEMS, candidat.candidat_id, GEL, [MESURE]);
      expect(candidat.items_p_au_gel).toEqual(attendus);
      expect(candidat.items_p_au_gel).toEqual([...attendus].sort());
      expect(candidat.items_p_verifies).toBe(attendus.length);
    }
  });

  it("compte zéro item pour un candidat qui n'en a aucun, sans valeur supposée", () => {
    const charge = construirePerimetre(perimetreComplet(), { ...contexte(), items: [] }, "essai");
    for (const candidat of charge.perimetre.candidats) {
      expect(candidat).toMatchObject({ items_p_verifies: 0, items_p_au_gel: [], sous_seuil: true });
    }
  });
});

describe("cas 11 : alias aveugle et motif d'exclusion", () => {
  it("refuse un assistant inclus sans alias fourni", () => {
    const erreur = refus(perimetreComplet(), contexte([]));
    expect(erreur.motifs).toEqual([expect.stringContaining("outil-alpha")]);
  });

  it("refuse un alias fourni pour un outil absent du périmètre", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "O07"], ["outil-fantome", "O08"]]));
    expect(erreur.motifs).toEqual([expect.stringContaining("outil-fantome")]);
  });

  it("refuse un outil exclu sans motif_exclusion", () => {
    const perimetre = perimetreComplet();
    delete rang(outils(perimetre), 2)["motif_exclusion"];
    expect(refusDeSchema(perimetre).chemins).toContain("/outils/2");
  });

  it("refuse un motif_exclusion sur un outil inclus", () => {
    const perimetre = perimetreComplet();
    rang(outils(perimetre), 0)["motif_exclusion"] = "sans objet";
    expect(refusDeSchema(perimetre).chemins).toContain("/outils/0");
  });

  it("refuse un même alias attribué à deux outils (§7)", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "O07"], ["outil-beta", "O07"]]));
    expect(erreur.motifs).toEqual([expect.stringContaining("« O07 » attribué à plusieurs outils")]);
  });

  it("porte l'alias fourni sur l'assistant inclus", () => {
    expect(charger(perimetreComplet()).perimetre.outils[0]).toMatchObject({ outil_id: "outil-alpha", alias_aveugle: "O07" });
  });
});

describe("§7 (protocole 0.20) : un alias d'outil confondable avec un alias aveugle de candidat est refusé", () => {
  it.each(["C12", "C1234"])("refuse « %s » : la lettre C suivie uniquement de chiffres", (alias) => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", alias]]));
    expect(erreur.motifs).toEqual([expect.stringContaining("confondable avec un alias aveugle de candidat")]);
  });

  it.each(["CA12", "XC12", "B12"])("accepte « %s » : pas la lettre C seule suivie de chiffres", (alias) => {
    expect(charger(perimetreComplet(), contexte([["outil-alpha", alias]])).perimetre.outils[0]).toMatchObject({ alias_aveugle: alias });
  });
});

describe("gel, PR 2b, cas 8 : alias aveugle qui trahit un outil (D45 (2))", () => {
  it("normalisation fixe : NFKD, diacritiques retirés, minuscules, espaces repliés", () => {
    expect(normaliserAlias("  Éditeur \t  ALPHA\n")).toBe("editeur alpha");
    expect(normaliserAlias("Outil Bêta")).toBe("outil beta");
    // NFKD replie aussi les formes de compatibilité : ligature et chiffre en exposant.
    expect(normaliserAlias("ﬁable²")).toBe("fiable2");
    expect(normaliserAlias("O07")).toBe("o07");
  });

  // PR 2c (D48 (2) et (3)) : les quatre cas suivants refusaient l'alias sur une seule inclusion de
  // chaîne entière. Le mot significatif et `outil_id` font désormais trahir aussi d'autres champs
  // (« outil » est un mot du libellé et de l'`outil_id` des deux assistants) : chaque attendu liste
  // exactement tous les motifs, dans l'ordre des outils puis des champs. Attendus changés ouvertement.
  it("cas 8 : alias contenant le libellé d'un autre outil, en casse et accents différents ⇒ refus", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "Juge OUTIL   BÊTA n° 7"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining("contient le mot « outil » du libelle « Outil Alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « outil » du outil_id « outil-alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « outil », le mot « beta », la forme collée « outilbeta » du libelle « Outil Beta » de l'outil outil-beta"),
      expect.stringContaining("contient le mot « beta » du editeur « Éditeur Beta » de l'outil outil-beta"),
      expect.stringContaining("contient le mot « outil », le mot « beta », la forme collée « outilbeta » du outil_id « outil-beta » de l'outil outil-beta"),
    ]);
  });

  it("cas 8 : alias contenant le libellé de son propre outil ⇒ refus", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "outil alpha"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining("la forme collée « outilalpha » du libelle « Outil Alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « alpha » du editeur « Éditeur Alpha » de l'outil outil-alpha"),
      expect.stringContaining("la forme collée « outilalpha » du outil_id « outil-alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « outil » du libelle « Outil Beta » de l'outil outil-beta"),
      expect.stringContaining("contient le mot « outil » du outil_id « outil-beta » de l'outil outil-beta"),
    ]);
  });

  it("cas 8 : alias contenant un éditeur ⇒ refus", () => {
    const editeur = refus(perimetreComplet(), contexte([["outil-alpha", "par EDITEUR ALPHA"]]));
    expect(editeur.motifs).toEqual([
      expect.stringContaining("contient le mot « alpha » du libelle « Outil Alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « editeur », le mot « alpha », la forme collée « editeuralpha » du editeur « Éditeur Alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « alpha » du outil_id « outil-alpha » de l'outil outil-alpha"),
      expect.stringContaining("contient le mot « editeur » du editeur « Éditeur Beta » de l'outil outil-beta"),
    ]);
  });

  it("cas 8 : l'éditeur d'un comparateur du périmètre trahit aussi ⇒ refus", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "association  gamma"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining("contient le mot « gamma » du libelle « Comparateur Gamma » de l'outil comparateur-gamma"),
      expect.stringContaining("la forme collée « associationgamma » du editeur « Association Gamma » de l'outil comparateur-gamma"),
      expect.stringContaining("contient le mot « gamma » du outil_id « comparateur-gamma » de l'outil comparateur-gamma"),
    ]);
  });

  it("cas 8 : même alias pour deux outils, après normalisation ⇒ refus", () => {
    const erreur = refus(perimetreComplet(), contexte([["outil-alpha", "O07"], ["outil-beta", " o07 "]]));
    expect(erreur.motifs).toEqual([expect.stringContaining("« O07 », «  o07  » attribué à plusieurs outils")]);
  });

  it("cas 8 : un alias neutre, distinct des autres, passe", () => {
    expect(charger(perimetreComplet(), contexte([["outil-alpha", "O07"], ["outil-beta", "O08"]])).perimetre.outils[0]).toMatchObject({ alias_aveugle: "O07" });
  });
});

describe("gel, PR 2c : mots significatifs, formes collées et outil_id (D48 (2) et (3))", () => {
  const mot = (trouve: string) => ({ nature: "mot", trouve });
  const collee = (trouve: string) => ({ nature: "forme_collee", trouve });

  it("D48 (3), cas 3 : « Mistral » contre l'éditeur « Mistral AI » ⇒ le mot « mistral » (« ai » ignoré)", () => {
    expect(revelationsDansAlias("Mistral", "Mistral AI")).toEqual([mot("mistral")]);
  });

  it("D48 (3), cas 3 : « LeChat » contre « Le Chat » ⇒ le mot « chat » et la forme collée « lechat »", () => {
    expect(revelationsDansAlias("LeChat", "Le Chat")).toEqual([mot("chat"), collee("lechat")]);
  });

  it("D48 (3), cas 3 : casse et accents différents ⇒ même résultat", () => {
    expect(revelationsDansAlias("MÎSTRAL", "mistral ai")).toEqual(revelationsDansAlias("Mistral", "Mistral AI"));
    expect(revelationsDansAlias("LÈCHAT", "le chât")).toEqual(revelationsDansAlias("LeChat", "Le Chat"));
  });

  it("D48 (3) : la forme collée seule, sans aucun mot significatif, suffit", () => {
    expect(revelationsDansAlias("Juge ABCD", "Ab Cd")).toEqual([collee("abcd")]);
  });

  it("D48 (3), cas 4 : un mot de 2 lettres (« ai », « le ») ne suffit pas à refuser", () => {
    expect(revelationsDansAlias("AI le juge", "Le Ai Studio")).toEqual([]);
    expect(revelationsDansAlias("Juge AI", "Mistral AI")).toEqual([]);
  });

  it("D48 (3), cas 4 : un mot d'exactement 3 lettres suffit", () => {
    expect(LETTRES_MOT_SIGNIFICATIF).toBe(3);
    expect(revelationsDansAlias("Zyxo", "Zyx Lb")).toEqual([mot("zyx")]);
  });

  it("D50 : une forme collée de moins de 3 lettres ne suffit pas (« X », « A B ») ; d'exactement 3, elle suffit", () => {
    expect(revelationsDansAlias("XO7", "X")).toEqual([]);
    expect(revelationsDansAlias("AB12", "A B")).toEqual([]);
    expect(revelationsDansAlias("XAB12", "A-B")).toEqual([]);
    expect(revelationsDansAlias("ABC12", "A B C")).toEqual([collee("abc")]);
  });

  it("D48 (2) : tirets et soulignés d'un outil_id découpent des mots comme les espaces", () => {
    expect(revelationsDansAlias("Juge Kappa", "kappa_zeta-outil")).toEqual([mot("kappa")]);
    expect(revelationsDansAlias("KappaZeta", "kappa_zeta")).toEqual([mot("kappa"), mot("zeta"), collee("kappazeta")]);
    expect(revelationsDansAlias("Juge AbCd", "ab_cd")).toEqual([collee("abcd")]);
  });

  it("D48 (3), cas 5 : un alias sans mot significatif ni forme collée d'un texte ⇒ rien trouvé", () => {
    expect(revelationsDansAlias("O07", "Mistral AI")).toEqual([]);
    expect(revelationsDansAlias("O07", "outil-alpha")).toEqual([]);
  });

  function avecOutil(outil: Objet): Objet {
    const perimetre = perimetreComplet();
    outils(perimetre).push(outil);
    return perimetre;
  }

  const KAPPA = {
    outil_id: "kappa_zeta",
    libelle: "Assistant Kz",
    editeur: "Société Kz",
    famille: "assistant",
    inclus: false,
    motif_exclusion: "Absent du top des applications à la date de gel.",
  };

  it("D48 (2), cas 2 : alias contenant l'outil_id d'un autre outil, avec séparateurs ⇒ refus nommant le champ outil_id", () => {
    const erreur = refus(avecOutil(KAPPA), contexte([["outil-alpha", "Juge Kappa-Zeta"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining(
        "alias_aveugle « Juge Kappa-Zeta » de outil-alpha contient le mot « kappa », le mot « zeta », la forme collée « kappazeta » " +
          "du outil_id « kappa_zeta » de l'outil kappa_zeta",
      ),
    ]);
  });

  const LE_CHAT = { ...KAPPA, outil_id: "assistant-k", libelle: "Le Chat", editeur: "Mistral AI" };

  it("D48 (3), cas 3 : « Mistral » contre l'éditeur « Mistral AI » d'un outil du périmètre ⇒ refus (mot)", () => {
    const erreur = refus(avecOutil(LE_CHAT), contexte([["outil-alpha", "Mistral"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining("alias_aveugle « Mistral » de outil-alpha contient le mot « mistral » du editeur « Mistral AI » de l'outil assistant-k"),
    ]);
  });

  it("D48 (3), cas 3 : « LeChat » contre le libellé « Le Chat » ⇒ refus (forme collée)", () => {
    const erreur = refus(avecOutil(LE_CHAT), contexte([["outil-alpha", "LeChat"]]));
    expect(erreur.motifs).toEqual([
      expect.stringContaining("alias_aveugle « LeChat » de outil-alpha contient le mot « chat », la forme collée « lechat » du libelle « Le Chat » de l'outil assistant-k"),
    ]);
  });

  it("D48 (3), cas 3 : « lèCHAT » ⇒ le même refus, casse et accents ignorés", () => {
    const erreur = refus(avecOutil(LE_CHAT), contexte([["outil-alpha", "lèCHAT"]]));
    expect(erreur.motifs).toEqual([expect.stringContaining("contient le mot « chat », la forme collée « lechat » du libelle « Le Chat » de l'outil assistant-k")]);
  });

  // `run.schema.json` borne l'alias à `^[A-Z]{1,3}[0-9]{2,4}$` : les cas acceptés suivent cette forme.
  it("D48 (3), cas 4 : un alias dont le seul mot commun a 2 lettres (« AI », « LE ») passe", () => {
    for (const alias of ["AI07", "LE07"]) {
      expect(charger(avecOutil(LE_CHAT), contexte([["outil-alpha", alias]])).perimetre.outils[0]).toMatchObject({ alias_aveugle: alias });
    }
  });

  it("D48 (3), cas 5 : un alias légitime passe contre tous les champs de tous les outils", () => {
    expect(charger(avecOutil(LE_CHAT), contexte([["outil-alpha", "O07"]])).perimetre.outils[0]).toMatchObject({ alias_aveugle: "O07" });
  });
});

describe("contact_notification : obligatoire, null explicite permis (décision du 2026-10-02)", () => {
  it("refuse un candidat sans la clé", () => {
    const perimetre = perimetreComplet();
    delete rang(candidats(perimetre), 0)["contact_notification"];
    expect(refusDeSchema(perimetre).chemins).toContain("/candidats/0");
  });

  it("accepte un contact archivé et le laisse hors de l'instantané", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["contact_notification"] = {
      adresse: "contact@campagne.invalid",
      preuve: { url: "https://campagne.invalid/contact", date: "2026-09-01", sha256: sha("d"), archive_url: "https://web.archive.invalid/contact" },
    };
    expect(rang(charger(perimetre).perimetre.candidats, 0)).not.toHaveProperty("contact_notification");
  });
});

describe("cas 12 : clé inconnue (faute de frappe, ancien nom)", () => {
  /** Le seul refus est « additionalProperties », et il porte sur l’objet qui reçoit la clé. */
  function seulementClesEnTrop(perimetre: Objet): readonly string[] {
    const erreur = refusDeSchema(perimetre);
    const lignes = erreur.message.split("\n").slice(1);
    expect(lignes.length).toBeGreaterThan(0);
    for (const ligne of lignes) expect(ligne).toContain("must NOT have additional properties");
    return erreur.chemins;
  }

  it("refuse l'ancien nom quota_par_strate dans tirage", () => {
    const perimetre = perimetreComplet();
    (perimetre["tirage"] as Objet)["quota_par_strate"] = 3;
    expect(seulementClesEnTrop(perimetre)).toEqual(["/tirage"]);
  });

  it("refuse l'ancienne part de reprise, constante du code et non du fichier", () => {
    const perimetre = perimetreComplet();
    (perimetre["tirage"] as Objet)["part_reprise"] = 0.8;
    expect(seulementClesEnTrop(perimetre)).toEqual(["/tirage"]);
  });

  it("refuse une valeur calculée au gel saisie à la main (items_p_verifies)", () => {
    const perimetre = perimetreComplet();
    rang(candidats(perimetre), 0)["items_p_verifies"] = 31;
    expect(seulementClesEnTrop(perimetre)).toEqual(["/candidats/0"]);
  });

  it("refuse une clé inconnue au premier niveau", () => {
    const perimetre = perimetreComplet();
    perimetre["date_de_gel"] = GEL;
    expect(seulementClesEnTrop(perimetre)).toEqual([""]);
  });
});

describe("cas 13 : identifiants en double", () => {
  it("refuse un candidat_id en double", () => {
    const perimetre = perimetreComplet();
    candidats(perimetre).push(candidatActif("demo-alpha"));
    expect(refus(perimetre).motifs).toEqual([expect.stringContaining("demo-alpha")]);
  });

  it("refuse un outil_id en double", () => {
    const perimetre = perimetreComplet();
    outils(perimetre).push({ ...rang(outils(perimetre), 1) });
    expect(refus(perimetre).motifs).toEqual([expect.stringContaining("comparateur-gamma")]);
  });
});

describe("cas 14 : l'instantané est conforme à run.schema.json et garde les preuves", () => {
  it("valide contre run#/properties/perimetre", () => {
    const { perimetre } = charger(perimetreComplet());
    expect(() => validerFragment("run", "#/properties/perimetre", perimetre, "essai")).not.toThrow();
  });

  it("garde la preuve archivée de la déclaration et la preuve d'inclusion de l'assistant", () => {
    const { perimetre } = charger(perimetreComplet());
    expect(rang(perimetre.candidats, 0).declaration_candidature).toEqual(declaration());
    expect(rang(perimetre.candidats, 0).preuves_inclusion).toEqual(candidatActif("demo-alpha")["preuves_inclusion"]);
    expect(rang(perimetre.outils, 0).preuve_inclusion).toEqual(PREUVE_STORE);
  });

  it("projette libelle, editeur et sdk hors de l'instantané, et n'y met pas par_mode", () => {
    const { perimetre } = charger(perimetreComplet());
    for (const outil of perimetre.outils) {
      expect(outil).not.toHaveProperty("libelle");
      expect(outil).not.toHaveProperty("editeur");
      expect(outil).not.toHaveProperty("sdk");
      expect(outil).not.toHaveProperty("par_mode");
    }
  });

  it("run.schema refuse désormais une déclaration sans sha256 ni archive_url", () => {
    const { perimetre } = charger(perimetreComplet());
    const sansPreuve = structuredClone(perimetre) as unknown as Objet;
    const candidat = rang(candidats(sansPreuve), 0);
    const { sha256: _s, archive_url: _a, ...reste } = candidat["declaration_candidature"] as Objet;
    candidat["declaration_candidature"] = reste;
    const erreur = erreurDe(() => validerFragment("run", "#/properties/perimetre", sansPreuve, "essai"));
    expect((erreur as ErreurSchema).chemins).toContain("/candidats/0/declaration_candidature");
  });

  it("run.schema refuse désormais un assistant inclus sans preuve_inclusion", () => {
    const { perimetre } = charger(perimetreComplet());
    const sansPreuve = structuredClone(perimetre) as unknown as Objet;
    delete rang(outils(sansPreuve), 0)["preuve_inclusion"];
    const erreur = erreurDe(() => validerFragment("run", "#/properties/perimetre", sansPreuve, "essai"));
    expect((erreur as ErreurSchema).chemins).toContain("/outils/0");
  });
});

describe("lecture du fichier", () => {
  let dossiers: string[] = [];

  afterEach(() => {
    for (const dossier of dossiers) rmSync(dossier, { recursive: true, force: true });
    dossiers = [];
  });

  it("lit un YAML complet et rend le même résultat que la fonction pure", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-essai-perimetre-"));
    dossiers.push(dossier);
    const chemin = join(dossier, "perimetre.yaml");
    writeFileSync(chemin, stringify(perimetreComplet()), "utf8");
    expect(chargerPerimetre(chemin, contexte())).toEqual(charger(perimetreComplet()));
  });

  it("nomme le fichier dans une erreur de schéma", () => {
    const dossier = mkdtempSync(join(tmpdir(), "banc-essai-perimetre-"));
    dossiers.push(dossier);
    const chemin = join(dossier, "perimetre.yaml");
    writeFileSync(chemin, stringify({ ...perimetreComplet(), inconnue: 1 }), "utf8");
    const erreur = erreurDe(() => chargerPerimetre(chemin, contexte()));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(chemin);
  });
});
