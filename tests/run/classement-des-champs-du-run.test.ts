/**
 * Chaque propriété de `schema/run.schema.json` est classée une fois et une seule (DETTE 2026-11-04
 * après-midi n° 4) : figée au gel (`CHAMPS_FIGES_AU_GEL`), ou rangée dans exactement un groupe de
 * champs écrits après le gel (`analysis/champs-posterieurs-au-gel.ts`). Le groupe décide si le champ
 * entre dans l'empreinte du run publiée dans `metriques.json` (§9) : un champ ajouté au schéma sans
 * classement fait échouer ce test en le nommant, au lieu d'entrer ou de sortir de l'empreinte sans
 * que personne l'ait décidé.
 *
 * Les quatre emplacements sont ceux que le module classe par chemin : la racine de `run.json`, chaque
 * élément de `juges`, chaque élément de `perimetre.outils` et le bloc `reponses`. Ce test fige le
 * classement actuel ; il n'en décide aucun (D96 attend l'auteur pour les champs du jeu d'or).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHAMPS_DE_LA_NOTATION,
  CHAMPS_DES_INCIDENTS_ET_CONTESTATIONS,
  CHAMPS_DU_GO_NO_GO,
  CHAMPS_DU_JEU_D_OR,
  CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION,
  CHAMPS_ECRITS_APRES_LE_GEL,
  CHAMPS_FIGES_AU_GEL,
  CHAMPS_HORS_EMPREINTE_DU_RUN,
  type ChampsDeRunJson,
} from "../../analysis/champs-posterieurs-au-gel.ts";

type Objet = Record<string, unknown>;
type Emplacement = keyof ChampsDeRunJson;

/** Une classe du classement : son nom, cité par les messages, et ses champs. */
interface Classe {
  readonly nom: string;
  readonly champs: ChampsDeRunJson;
}

const EMPLACEMENTS: readonly Emplacement[] = ["racine", "juges", "outils", "reponses"];

/** Le chemin, dans `schema/run.schema.json`, du sous-schéma de chaque emplacement. */
const SOUS_SCHEMAS: Readonly<Record<Emplacement, readonly string[]>> = {
  racine: [],
  juges: ["properties", "juges", "items"],
  outils: ["properties", "perimetre", "properties", "outils", "items"],
  reponses: ["properties", "reponses"],
};

/** Le préfixe d'un champ de chaque emplacement dans `run.json`, pour les messages. */
const PREFIXES: Readonly<Record<Emplacement, string>> = {
  racine: "",
  juges: "juges[].",
  outils: "perimetre.outils[].",
  reponses: "reponses.",
};

const VIDE: ChampsDeRunJson = { racine: [], juges: [], outils: [], reponses: [] };

/** Les groupes de champs écrits après le gel, par auteur. */
const GROUPES_POSTERIEURS: readonly Classe[] = [
  { nom: "CHAMPS_DE_LA_NOTATION", champs: CHAMPS_DE_LA_NOTATION },
  { nom: "CHAMPS_DU_JEU_D_OR", champs: CHAMPS_DU_JEU_D_OR },
  { nom: "CHAMPS_DES_INCIDENTS_ET_CONTESTATIONS", champs: CHAMPS_DES_INCIDENTS_ET_CONTESTATIONS },
  { nom: "CHAMPS_DU_GO_NO_GO", champs: CHAMPS_DU_GO_NO_GO },
  { nom: "CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION", champs: CHAMPS_DU_STATUT_ET_DE_LA_PUBLICATION },
];

/** Le classement réel : les champs figés au gel, puis chaque groupe postérieur. */
const CLASSEMENT: readonly Classe[] = [{ nom: "CHAMPS_FIGES_AU_GEL", champs: CHAMPS_FIGES_AU_GEL }, ...GROUPES_POSTERIEURS];

/* ------------------------------------------------------------------ la vérification (pure) */

/** Les classes qui rangent `nom` à cet emplacement, une fois par occurrence. */
function rangsDe(nom: string, emplacement: Emplacement, classement: readonly Classe[]): readonly string[] {
  return classement.flatMap((classe) => classe.champs[emplacement].filter((champ) => champ === nom).map(() => classe.nom));
}

function defautDuChamp(chemin: string, dansLeSchema: boolean, rangs: readonly string[]): readonly string[] {
  if (!dansLeSchema) return [`${chemin} : classé (${rangs.join(", ")}) mais absent de schema/run.schema.json ; classement mort`];
  if (rangs.length === 0) return [`${chemin} : ni figé au gel ni rangé dans un groupe de champs postérieurs au gel`];
  if (rangs.length > 1) return [`${chemin} : classé ${rangs.length} fois (${rangs.join(", ")}) ; un champ est figé au gel ou rangé dans un seul groupe`];
  return [];
}

function defautsA(emplacement: Emplacement, proprietes: readonly string[], classement: readonly Classe[]): readonly string[] {
  const noms = new Set([...proprietes, ...classement.flatMap((classe) => classe.champs[emplacement])]);
  return [...noms].flatMap((nom) => defautDuChamp(`${PREFIXES[emplacement]}${nom}`, proprietes.includes(nom), rangsDe(nom, emplacement, classement)));
}

/**
 * Les défauts du classement au regard des propriétés du schéma : un message par champ non classé,
 * classé plusieurs fois ou classé sans exister dans le schéma. Aucun défaut : liste vide.
 */
function defautsDeClassement(proprietes: ChampsDeRunJson, classement: readonly Classe[]): readonly string[] {
  return EMPLACEMENTS.flatMap((emplacement) => defautsA(emplacement, proprietes[emplacement], classement));
}

/* ------------------------------------------------------------------ lecture du schéma */

function exigerObjet(valeur: unknown, chemin: string): Objet {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) throw new Error(`schema/run.schema.json : ${chemin} n'est pas un objet.`);
  return valeur as Objet;
}

/** Le sous-schéma d'un emplacement ; un chemin absent est une erreur, jamais une liste vide. */
function sousSchema(schema: unknown, emplacement: Emplacement): Objet {
  return SOUS_SCHEMAS[emplacement].reduce<Objet>((noeud, cle) => exigerObjet(noeud[cle], `${emplacement} (${SOUS_SCHEMAS[emplacement].join("/")})`), exigerObjet(schema, "la racine"));
}

function proprietesDuSchema(schema: unknown): ChampsDeRunJson {
  const lire = (emplacement: Emplacement): readonly string[] => Object.keys(exigerObjet(sousSchema(schema, emplacement)["properties"], `${emplacement}.properties`));
  return { racine: lire("racine"), juges: lire("juges"), outils: lire("outils"), reponses: lire("reponses") };
}

function schemaReel(): Objet {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, "../../schema/run.schema.json"), "utf8")) as Objet;
}

/** Une copie du schéma réel où `modifier` change les propriétés d'un emplacement. */
function schemaModifie(emplacement: Emplacement, modifier: (proprietes: Objet) => void): Objet {
  const copie = structuredClone(schemaReel());
  modifier(exigerObjet(sousSchema(copie, emplacement)["properties"], emplacement));
  return copie;
}

function champsDe(liste: ChampsDeRunJson): readonly string[] {
  return EMPLACEMENTS.flatMap((emplacement) => liste[emplacement].map((nom) => `${emplacement}:${nom}`));
}

/* ------------------------------------------------------------------ tests */

describe("chaque propriété de run.schema.json est figée au gel ou rangée dans un seul groupe postérieur", () => {
  it("cas 4 : le schéma réel et le classement actuel passent", () => {
    expect(defautsDeClassement(proprietesDuSchema(schemaReel()), CLASSEMENT)).toEqual([]);
  });

  it.each(EMPLACEMENTS)("cas 1 : une propriété fictive non classée (%s) fait échouer, nommée", (emplacement) => {
    const schema = schemaModifie(emplacement, (proprietes) => {
      proprietes["champ_fictif_non_classe"] = { type: "string" };
    });
    expect(defautsDeClassement(proprietesDuSchema(schema), CLASSEMENT)).toEqual([
      `${PREFIXES[emplacement]}champ_fictif_non_classe : ni figé au gel ni rangé dans un groupe de champs postérieurs au gel`,
    ]);
  });

  it("cas 2 : une propriété rangée dans deux groupes postérieurs fait échouer, nommée avec ses deux groupes", () => {
    const doublon: Classe = { nom: "CHAMPS_DU_GO_NO_GO (copie fautive)", champs: { ...VIDE, racine: ["kappa_paire_juges"] } };
    expect(defautsDeClassement(proprietesDuSchema(schemaReel()), [...CLASSEMENT, doublon])).toEqual([
      "kappa_paire_juges : classé 2 fois (CHAMPS_DU_JEU_D_OR, CHAMPS_DU_GO_NO_GO (copie fautive)) ; un champ est figé au gel ou rangé dans un seul groupe",
    ]);
  });

  it("cas 2 : une propriété figée au gel et rangée aussi dans un groupe postérieur fait échouer", () => {
    const doublon: Classe = { nom: "groupe fictif", champs: { ...VIDE, juges: ["modele"] } };
    expect(defautsDeClassement(proprietesDuSchema(schemaReel()), [...CLASSEMENT, doublon])).toEqual([
      "juges[].modele : classé 2 fois (CHAMPS_FIGES_AU_GEL, groupe fictif) ; un champ est figé au gel ou rangé dans un seul groupe",
    ]);
  });

  it("cas 2 : une propriété répétée dans un même groupe fait échouer", () => {
    const classement = CLASSEMENT.map((classe) => (classe.nom === "CHAMPS_DU_GO_NO_GO" ? { nom: classe.nom, champs: { ...classe.champs, outils: ["par_mode", "par_mode"] } } : classe));
    expect(defautsDeClassement(proprietesDuSchema(schemaReel()), classement)).toEqual([
      "perimetre.outils[].par_mode : classé 2 fois (CHAMPS_DU_GO_NO_GO, CHAMPS_DU_GO_NO_GO) ; un champ est figé au gel ou rangé dans un seul groupe",
    ]);
  });

  it("cas 3 : une propriété classée retirée du schéma est un classement mort, nommé", () => {
    const schema = schemaModifie("reponses", (proprietes) => {
      delete proprietes["obtenues"];
    });
    expect(defautsDeClassement(proprietesDuSchema(schema), CLASSEMENT)).toEqual([
      "reponses.obtenues : classé (CHAMPS_DE_LA_NOTATION) mais absent de schema/run.schema.json ; classement mort",
    ]);
  });

  it("cas 3 : un champ figé au gel qui n'existe pas dans le schéma est un classement mort", () => {
    const mort: Classe = { nom: "CHAMPS_FIGES_AU_GEL", champs: { ...CHAMPS_FIGES_AU_GEL, racine: [...CHAMPS_FIGES_AU_GEL.racine, "champ_disparu"] } };
    const classement = [mort, ...GROUPES_POSTERIEURS];
    expect(defautsDeClassement(proprietesDuSchema(schemaReel()), classement)).toEqual(["champ_disparu : classé (CHAMPS_FIGES_AU_GEL) mais absent de schema/run.schema.json ; classement mort"]);
  });
});

describe("ce que la vérification suppose", () => {
  it("les groupes énumérés ici sont exactement ceux de CHAMPS_ECRITS_APRES_LE_GEL : un groupe nouveau y est vu", () => {
    const enumeres = GROUPES_POSTERIEURS.flatMap((groupe) => champsDe(groupe.champs));
    expect([...enumeres].sort()).toEqual([...champsDe(CHAMPS_ECRITS_APRES_LE_GEL)].sort());
  });

  it.each(EMPLACEMENTS)("le sous-schéma %s refuse toute propriété non déclarée : ses propriétés sont toutes celles de run.json", (emplacement) => {
    expect(sousSchema(schemaReel(), emplacement)["additionalProperties"]).toBe(false);
  });

  it("un emplacement absent du schéma est une erreur, jamais une liste vide", () => {
    const copie = structuredClone(schemaReel());
    delete exigerObjet(copie["properties"], "properties")["reponses"];
    expect(() => proprietesDuSchema(copie)).toThrow(/reponses/);
  });
});

describe("ce qui sort de l'empreinte du run (§9) ne change jamais en silence", () => {
  // Liste figée à la main : ranger un champ dans un groupe hors empreinte (go/no-go, statut,
  // publication) le retire de l'empreinte publiée. Modifier cette liste est une décision de
  // l'auteur (D96 pour les champs du jeu d'or), jamais un effet de bord d'un classement.
  it("CHAMPS_HORS_EMPREINTE_DU_RUN est exactement la liste relue", () => {
    expect(CHAMPS_HORS_EMPREINTE_DU_RUN).toEqual({
      racine: [
        "statut",
        "publication",
        "depot",
        "go_no_go",
        "motif_provisoire",
        "indeterminees_echantillon_humain",
        "non_classees_echantillon_humain",
        "renvois_attribution_indecidable",
        "refus_api_echantillon_humain",
        "accord_humains_echantillon",
      ],
      juges: ["kappa_echantillon_humain", "motif_indefini_kappa_echantillon_humain", "renvois_ecartes_kappa_echantillon"],
      outils: ["par_mode"],
      reponses: [],
    });
  });
});
