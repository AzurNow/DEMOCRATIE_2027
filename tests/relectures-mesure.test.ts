/**
 * Registre des relectures de mesure (décision D53 (1) du 2026-10-16) : la logique pure
 * (`validation/domaine/relectures-mesure.ts`), la lecture du fichier publié en ajout seul
 * (`validation/io/relectures-fichier.ts`), et l'accord entre le validateur typé et
 * `schema/relecture-mesure.schema.json`.
 *
 * Le verrou lui-même, dans le plan de promotion et dans `pnpm promote`, est testé dans
 * `tests/data-mesures.test.ts` et `tests/promote-mesures.test.ts`.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { ErreurSchema } from "../outils/schemas/valider.ts";
import { empreinteDe } from "../validation/domaine/empreinte.ts";
import {
  EntreeRelectureInvalide,
  empreinteRelecture,
  mesureRelue,
  relectureDe,
  validerEntreeRelecture,
  type RelectureMesure,
} from "../validation/domaine/relectures-mesure.ts";
import { cheminRelectures, lireRelectures, RegistreRelecturesIllisible } from "../validation/io/relectures-fichier.ts";
import type { Mesure } from "../validation/domaine/types.ts";
import { mesure } from "./aides/fabriques.ts";

const RACINE = join(import.meta.dirname, "..");
const DATE = "2026-10-16";

/* ------------------------------------------------------------------- empreinte */

/** Une mesure fictive complète : alias, origine et vérification de fictivité présents. */
const FICTIVE: Mesure = mesure({
  id: "01JBANCESSA90000000MESVRF1",
  libelle: "Prime aux marcheurs",
  formulation_canonique: "verser une prime annuelle aux personnes qui vont au travail à pied",
  fictive: true,
  alias: ["prime marche", "indemnité piéton"],
  origine_fictive: "Mesure de test inventée, sans rapport avec aucun candidat.",
  verification_fictivite: {
    date: "2026-10-15T11:00:00+02:00",
    corpus_verifies: ["demo-alpha", "demo-beta"],
    niveaux_balayes: ["T1", "T2", "items_T3"],
    operateur: "a2",
    resultat: "aucune_occurrence",
  },
});

describe("empreinteRelecture", () => {
  // Protocole 0.17, §4 : la relecture porte sur le libellé, le thème, la formulation canonique, le
  // caractère fictif, les alias, et pour une mesure fictive son origine et la vérification de sa
  // fictivité. Ce test figeait auparavant quatre champs ({libelle, theme, formulation_canonique,
  // fictive}) ; il suit la nouvelle définition, distincte de celle de `mesure.empreinte`.
  it("est le sha256 de la forme canonique des sept champs relus, champs absents omis", () => {
    expect(empreinteRelecture(FICTIVE)).toBe(
      empreinteDe({
        libelle: FICTIVE.libelle,
        theme: FICTIVE.theme,
        formulation_canonique: FICTIVE.formulation_canonique,
        fictive: FICTIVE.fictive,
        alias: FICTIVE.alias,
        origine_fictive: FICTIVE.origine_fictive,
        verification_fictivite: FICTIVE.verification_fictivite,
      }),
    );
    const valeur = mesure();
    expect(empreinteRelecture(valeur)).toBe(
      empreinteDe({
        libelle: valeur.libelle,
        theme: valeur.theme,
        formulation_canonique: valeur.formulation_canonique,
        fictive: valeur.fictive,
      }),
    );
  });

  it("est recalculée depuis le contenu, jamais recopiée du champ empreinte de la mesure", () => {
    // Une formulation changée sans que le champ empreinte suive ne doit pas garder la même
    // empreinte de relecture.
    const avant = mesure();
    const apres = { ...mesure({ formulation_canonique: "ramener la TVA sur l'électricité à 5,5 %" }), empreinte: avant.empreinte };
    expect(apres.empreinte).toBe(avant.empreinte);
    expect(empreinteRelecture(apres)).not.toBe(empreinteRelecture(avant));
  });

  it("ne dépend ni de la version ni de l'historique", () => {
    const valeur = mesure();
    expect(empreinteRelecture({ ...valeur, version: 7 })).toBe(empreinteRelecture(valeur));
  });

  it("cas 1 : ajouter seulement un alias change l'empreinte", () => {
    const sans = mesure({ alias: ["TVA énergie"] });
    const avec = mesure({ alias: ["TVA énergie", "TVA à 5,5 %"] });
    expect(empreinteRelecture(avec)).not.toBe(empreinteRelecture(sans));
  });

  it("cas 2 : alias absent et alias vide ont des empreintes différentes (absent ≠ vide)", () => {
    const absent = mesure();
    const vide = mesure({ alias: [] });
    expect("alias" in absent).toBe(false);
    expect(empreinteRelecture(vide)).not.toBe(empreinteRelecture(absent));
  });

  it("cas 3 : modifier seulement origine_fictive change l'empreinte", () => {
    const modifiee: Mesure = { ...FICTIVE, origine_fictive: "Mesure de test inventée, autre origine." };
    expect(empreinteRelecture(modifiee)).not.toBe(empreinteRelecture(FICTIVE));
  });

  it("cas 4 : modifier seulement un champ de verification_fictivite (corpus_verifies) change l'empreinte", () => {
    const verification = FICTIVE.verification_fictivite;
    if (verification === undefined) throw new Error("fixture sans vérification de fictivité");
    const modifiee: Mesure = { ...FICTIVE, verification_fictivite: { ...verification, corpus_verifies: ["demo-alpha"] } };
    expect(empreinteRelecture(modifiee)).not.toBe(empreinteRelecture(FICTIVE));
  });

  it("cas 5 : l'ordre des clés de l'objet mesure ne change pas l'empreinte (canonisation)", () => {
    const inversee = Object.fromEntries(Object.entries(FICTIVE).reverse()) as unknown as Mesure;
    expect(Object.keys(inversee)).not.toEqual(Object.keys(FICTIVE));
    expect(empreinteRelecture(inversee)).toBe(empreinteRelecture(FICTIVE));
  });

  it("cas 6 : le champ empreinte porté par la mesure n'influe pas sur l'empreinte de relecture", () => {
    expect(empreinteRelecture({ ...FICTIVE, empreinte: "4".repeat(64) })).toBe(empreinteRelecture(FICTIVE));
  });
});

/* ------------------------------------------------------------------- mesureRelue */

describe("mesureRelue", () => {
  const valeur = mesure();

  it("cas 5 : une relecture exacte (id, version, empreinte) couvre la mesure", () => {
    expect(mesureRelue([relectureDe(valeur, DATE)], valeur)).toBe(true);
  });

  it("cas 1 et 2 : un registre vide ne couvre aucune mesure", () => {
    expect(mesureRelue([], valeur)).toBe(false);
  });

  it("cas 3 : la bonne mesure relue dans une autre version ne la couvre pas", () => {
    const relecture: RelectureMesure = { ...relectureDe(valeur, DATE), mesure_version: 2 };
    expect(mesureRelue([relecture], valeur)).toBe(false);
  });

  it("cas 4 : la bonne version relue avec une autre empreinte (formulation modifiée après relecture) ne la couvre pas", () => {
    const relecture = relectureDe(valeur, DATE);
    const modifiee = mesure({ formulation_canonique: "ramener la TVA sur le gaz à 5,5 %" });
    expect(modifiee.version).toBe(valeur.version);
    expect(mesureRelue([relecture], modifiee)).toBe(false);
  });

  it("une relecture d'une autre mesure, de même contenu, ne la couvre pas", () => {
    const relecture: RelectureMesure = { ...relectureDe(valeur, DATE), mesure_id: "01JBANCESSA90000000AVTRE01" };
    expect(mesureRelue([relecture], valeur)).toBe(false);
  });

  it("cas 12 : deux entrées identiques sont inoffensives", () => {
    const relecture = relectureDe(valeur, DATE);
    expect(mesureRelue([relecture, relecture], valeur)).toBe(true);
  });

  it("la date n'entre pas dans l'appariement", () => {
    expect(mesureRelue([relectureDe(valeur, "2027-01-01")], valeur)).toBe(true);
  });
});

/* --------------------------------------------------------- validerEntreeRelecture */

function entreeValide(): Record<string, unknown> {
  return { ...relectureDe(mesure(), DATE) };
}

describe("validerEntreeRelecture", () => {
  it("rend la valeur typée d'une entrée valide", () => {
    expect(validerEntreeRelecture(entreeValide(), "test")).toEqual(relectureDe(mesure(), DATE));
  });

  it.each([
    ["pas un objet", [] as unknown],
    ["null", null],
    ["champ manquant (empreinte)", (({ empreinte: _e, ...reste }) => reste)(entreeValide())],
    ["champ manquant (date)", (({ date: _d, ...reste }) => reste)(entreeValide())],
    ["champ en trop", { ...entreeValide(), formulation_canonique: "ramener la TVA à 5,5 %" }],
    ["empreinte non hexadécimale", { ...entreeValide(), empreinte: `${"a".repeat(63)}z` }],
    ["empreinte en majuscules", { ...entreeValide(), empreinte: "A".repeat(64) }],
    ["empreinte trop courte", { ...entreeValide(), empreinte: "a".repeat(63) }],
    ["version nulle", { ...entreeValide(), mesure_version: 0 }],
    ["version non entière", { ...entreeValide(), mesure_version: 1.5 }],
    ["version textuelle", { ...entreeValide(), mesure_version: "1" }],
    ["identifiant non ULID", { ...entreeValide(), mesure_id: "tva_energie_5_5" }],
    ["date avec heure", { ...entreeValide(), date: "2026-10-16T10:00:00+02:00" }],
  ])("cas 10 : %s ⇒ EntreeRelectureInvalide", (_nom, valeur) => {
    expect(() => validerEntreeRelecture(valeur, "test")).toThrow(EntreeRelectureInvalide);
  });
});

/* ------------------------------------------------------------- lecture du fichier */

describe("lireRelectures", () => {
  let repertoire = "";
  beforeEach(() => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-relectures-"));
  });
  afterEach(() => rmSync(repertoire, { recursive: true, force: true }));

  function poser(contenu: string): void {
    writeFileSync(cheminRelectures(repertoire), contenu, "utf8");
  }

  it("cas 2 : un fichier absent est un registre vide", () => {
    expect(lireRelectures(repertoire)).toEqual([]);
    expect(lireRelectures(join(repertoire, "absent"))).toEqual([]);
  });

  it("le fichier se nomme relectures.json, dans le répertoire des registres de mesure", () => {
    expect(cheminRelectures(repertoire)).toBe(join(repertoire, "relectures.json"));
  });

  it("rend les entrées dans leur ordre, doublons compris (cas 12)", () => {
    const relecture = relectureDe(mesure(), DATE);
    poser(JSON.stringify([relecture, relecture]));
    expect(lireRelectures(repertoire)).toEqual([relecture, relecture]);
  });

  it("cas 9 : un JSON illisible est une erreur bloquante nommée, qui nomme le fichier", () => {
    poser("[{ pas du json");
    expect(() => lireRelectures(repertoire)).toThrow(RegistreRelecturesIllisible);
    expect(() => lireRelectures(repertoire)).toThrow(cheminRelectures(repertoire));
  });

  it("cas 9 : un JSON qui n'est pas un tableau est une erreur bloquante nommée", () => {
    poser(JSON.stringify(relectureDe(mesure(), DATE)));
    expect(() => lireRelectures(repertoire)).toThrow(RegistreRelecturesIllisible);
  });

  it("cas 10 : une entrée à champ manquant bloque toute la lecture, en nommant l'entrée", () => {
    const { date: _date, ...sansDate } = relectureDe(mesure(), DATE);
    poser(JSON.stringify([relectureDe(mesure(), DATE), sansDate]));
    expect(() => lireRelectures(repertoire)).toThrow(ErreurSchema);
    expect(() => lireRelectures(repertoire)).toThrow(`${cheminRelectures(repertoire)}, entrée 2`);
  });

  it("cas 10 : une entrée à champ en trop bloque, jamais ignorée", () => {
    poser(JSON.stringify([{ ...relectureDe(mesure(), DATE), commentaire: "relu" }]));
    expect(() => lireRelectures(repertoire)).toThrow(ErreurSchema);
  });

  it("cas 10 : une empreinte non hexadécimale bloque", () => {
    poser(JSON.stringify([{ ...relectureDe(mesure(), DATE), empreinte: "z".repeat(64) }]));
    expect(() => lireRelectures(repertoire)).toThrow(ErreurSchema);
  });

  it("n'écrit rien : le fichier lu est laissé tel quel", () => {
    const texte = JSON.stringify([relectureDe(mesure(), DATE)]);
    poser(texte);
    lireRelectures(repertoire);
    expect(readFileSync(cheminRelectures(repertoire), "utf8")).toBe(texte);
  });
});

/* -------------------------------------------------- accord entre les deux validateurs */

/**
 * `validerEntreeRelecture()` est la frontière d'exécution ; `schema/relecture-mesure.schema.json`
 * est le contrat publié. Contrairement au registre des corrections, aucune asymétrie n'est
 * assumée ici : les deux doivent rendre le même verdict sur chaque cas.
 */
describe("cas 11 : accord entre validerEntreeRelecture() et le schéma relecture-mesure", () => {
  const racineSchema = join(RACINE, "schema");
  const racineExemples = join(racineSchema, "exemples/relecture-mesure");

  function validateurSchema() {
    const { ajv } = construireRegistre(racineSchema);
    const validateur = ajv.getSchema(urnSchema("relecture-mesure"));
    if (validateur === undefined) throw new Error("schéma relecture-mesure non enregistré.");
    return validateur;
  }

  function accepteParValidateur(valeur: unknown): boolean {
    try {
      validerEntreeRelecture(valeur, "test");
      return true;
    } catch (erreur) {
      if (erreur instanceof EntreeRelectureInvalide) return false;
      throw erreur;
    }
  }

  function exemple(nom: string): unknown {
    return JSON.parse(readFileSync(join(racineExemples, nom), "utf8"));
  }

  const cas: readonly (readonly [string, () => unknown, boolean])[] = [
    ["exemple valide-01", () => exemple("valide-01-relecture.json"), true],
    ["exemple invalide-01 (empreinte non hexadécimale)", () => exemple("invalide-01-empreinte-non-hexadecimale.json"), false],
    ["exemple invalide-02 (champ en trop)", () => exemple("invalide-02-formulation-recopiee.json"), false],
    ["entrée fabriquée par relectureDe", () => entreeValide(), true],
    ["champ manquant", () => (({ mesure_version: _v, ...reste }) => reste)(entreeValide()), false],
    ["version nulle", () => ({ ...entreeValide(), mesure_version: 0 }), false],
    ["version non entière", () => ({ ...entreeValide(), mesure_version: 1.5 }), false],
    ["identifiant hors Crockford (I et U)", () => ({ ...entreeValide(), mesure_id: "01JBANCESSAI0000000MESURE1" }), false],
    ["empreinte en majuscules", () => ({ ...entreeValide(), empreinte: "A".repeat(64) }), false],
    ["date avec heure", () => ({ ...entreeValide(), date: "2026-10-16T10:00:00Z" }), false],
    ["tableau au lieu d'un objet", () => [entreeValide()], false],
  ];

  it.each(cas)("%s : même verdict", (_nom, fabriquer, attendu) => {
    const valeur = fabriquer();
    expect(validateurSchema()(valeur)).toBe(attendu);
    expect(accepteParValidateur(valeur)).toBe(attendu);
  });
});
