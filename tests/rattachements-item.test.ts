/**
 * Rattachement d'un item de staging à une autre mesure (décision D53 (1) du 2026-10-16) : la
 * logique pure (`validation/domaine/rattachements-item.ts`), le registre publié en ajout seul
 * (`validation/io/rattachements-fichier.ts`), l'extension de `renvoyeDepuis` au rattachement, et
 * l'accord entre le validateur typé et `schema/rattachement-item.schema.json` (cas 19).
 *
 * La commande `pnpm mesures --rattacher` est testée dans `tests/rattacher-item.test.ts`.
 */

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { erreurDeSchema, ErreurSchema } from "../outils/schemas/valider.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import {
  EntreeRattachementInvalide,
  entreeRattachement,
  rattacherItem,
  RattachementRefuse,
  validerEntreeRattachement,
  verifierRattachable,
  type ContexteRattachement,
  type RattachementItem,
} from "../validation/domaine/rattachements-item.ts";
import { lotJugeEncore, repinglerSurMesure, type JugementEnCours } from "../validation/domaine/renvoi-mesure.ts";
import {
  ajouterRattachement,
  cheminRattachements,
  controlerAjoutRattachement,
  lireRattachements,
  RegistreRattachementsIllisible,
} from "../validation/io/rattachements-fichier.ts";
import { poserRegistreAjoutSeul, RegistreModifieDepuisLecture } from "../validation/io/registre-ajout-seul.ts";
import type { Item } from "../validation/domaine/types.ts";
import { decision, itemA, itemF, itemO, itemP, mesure } from "./aides/fabriques.ts";

const RACINE = join(import.meta.dirname, "..");
const DATE = "2026-10-16";

const MESURE_A = mesure({ id: "01JBANCESSA90000000MESVRE1", version: 3 });
const MESURE_B = mesure({ id: "01JBANCESSA90000000MESVRE2", libelle: "TVA à 5,5 % sur l'énergie" });
/** L'item, proposé par l'extraction sur sa propre mesure B, à rattacher à A. */
const ITEM = itemP({ id: "01JBANCESSA1000000000TEMY1", mesure_id: MESURE_B.id, mesure_version: 1 });

/** Une mesure fictive complète, cible des items F. */
const MESURE_FICTIVE = mesure({
  id: "01JBANCESSA90000000MESVRF1",
  libelle: "Prime aux marcheurs",
  fictive: true,
  origine_fictive: "Mesure de test inventée, sans rapport avec aucun candidat.",
  verification_fictivite: {
    date: "2026-10-15T11:00:00+02:00",
    corpus_verifies: ["demo-alpha"],
    operateur: "a2",
    resultat: "aucune_occurrence",
  },
});
/** Un item F sur sa propre mesure B, à rattacher. */
const ITEM_F = itemF({ id: "01JBANCESSA1000000000TEMF1", mesure_id: MESURE_B.id, mesure_version: 1 });

const TRACE = { commit: "c".repeat(40), horodatage: "2026-10-16T21:00:00+02:00", date: DATE };

function contexte(surcharges: Partial<ContexteRattachement> = {}): ContexteRattachement {
  return { item: ITEM, cible: MESURE_A, publie: false, jugement: undefined, ...surcharges };
}

function jugement(annotateurs_ayant_decide: readonly string[]): JugementEnCours {
  return {
    lot_id: "lot-001",
    annotateurs: ["a1", "a2"],
    decisions: annotateurs_ayant_decide.map((annotateur_id) => decision({ annotateur_id, item: ITEM, decision: "accepter" })),
  };
}

function motifDuRefus(ctx: ContexteRattachement): string {
  try {
    verifierRattachable(ctx);
  } catch (erreur) {
    if (erreur instanceof RattachementRefuse) return erreur.motif;
    throw erreur;
  }
  return "accepte";
}

/* ------------------------------------------------------------------ refus */

describe("verifierRattachable : mêmes refus que le renvoi, règle uniforme", () => {
  it("cas 10 : item en attente, dans aucun lot ⇒ rattachable", () => {
    expect(motifDuRefus(contexte())).toBe("accepte");
  });

  it("cas 11 : item dans un lot terminé (chaque annotateur a décidé) ⇒ rattachable", () => {
    expect(motifDuRefus(contexte({ jugement: jugement(["a1", "a2"]) }))).toBe("accepte");
  });

  it("cas 12 : item dans un lot inachevé (un seul annotateur a décidé) ⇒ refus decisions_incompletes", () => {
    expect(motifDuRefus(contexte({ jugement: jugement(["a1"]) }))).toBe("decisions_incompletes");
  });

  it("cas 12 : item dans un lot où personne n'a encore décidé ⇒ refus decisions_incompletes", () => {
    expect(motifDuRefus(contexte({ jugement: jugement([]) }))).toBe("decisions_incompletes");
  });

  it("cas 12 : un lot sans annotateur n'est jamais tenu pour complet", () => {
    expect(motifDuRefus(contexte({ jugement: { lot_id: "lot-001", annotateurs: [], decisions: [] } }))).toBe("decisions_incompletes");
  });

  it("cas 13 : item publié dans data/items ⇒ refus publie", () => {
    expect(motifDuRefus(contexte({ publie: true }))).toBe("publie");
  });

  it("cas 14 : item non en attente ⇒ refus pas_en_attente", () => {
    expect(motifDuRefus(contexte({ item: { ...ITEM, statut_validation: "verifie" } }))).toBe("pas_en_attente");
  });

  it("cas 9 et 18 : la cible est déjà la mesure de l'item ⇒ refus deja_rattache, rien à faire", () => {
    expect(motifDuRefus(contexte({ cible: MESURE_B }))).toBe("deja_rattache");
  });

  it("cas 11 : item F vers une mesure non fictive ⇒ refus type_incompatible", () => {
    expect(motifDuRefus(contexte({ item: ITEM_F, cible: MESURE_A }))).toBe("type_incompatible");
  });

  it.each<readonly [string, Item]>([
    ["P", ITEM],
    ["A", itemA({ id: "01JBANCESSA1000000000TEMA1", mesure_id: MESURE_B.id, mesure_version: 1 })],
    ["O", itemO({ id: "01JBANCESSA1000000000TEMC1", mesure_id: MESURE_B.id, mesure_version: 1 })],
  ])("cas 12 : item %s vers une mesure fictive ⇒ refus type_incompatible", (_type, item) => {
    expect(motifDuRefus(contexte({ item, cible: MESURE_FICTIVE }))).toBe("type_incompatible");
  });

  it("cas 13 : item F vers une mesure fictive ⇒ rattachable", () => {
    expect(motifDuRefus(contexte({ item: ITEM_F, cible: MESURE_FICTIVE }))).toBe("accepte");
  });

  it("type_incompatible : le détail nomme le type de l'item, le caractère fictif de la cible et la règle du §4", () => {
    expect(() => verifierRattachable(contexte({ item: ITEM_F, cible: MESURE_A }))).toThrow(
      /type_incompatible[\s\S]*item de type F[\s\S]*non fictive[\s\S]*§4/,
    );
  });

  it("ordre des refus : deja_rattache passe avant type_incompatible, type_incompatible avant publie", () => {
    const fictiveActuelle = { ...MESURE_FICTIVE, id: MESURE_B.id };
    expect(motifDuRefus(contexte({ cible: fictiveActuelle }))).toBe("deja_rattache");
    expect(motifDuRefus(contexte({ cible: MESURE_FICTIVE, publie: true }))).toBe("type_incompatible");
  });

  it("le refus nomme l'item et la raison", () => {
    expect(() => verifierRattachable(contexte({ jugement: jugement(["a1"]) }))).toThrow(
      new RegExp(`${ITEM.id}[\\s\\S]*lot-001`),
    );
  });
});

/* ---------------------------------------------------------------- réécriture */

describe("rattacherItem : la nouvelle version de l'item, sur le modèle de repinglerSurMesure", () => {
  const rattache = rattacherItem(ITEM, MESURE_A, TRACE);

  it("cas 10 : mesure_id cible, mesure_version = version courante de la cible, version + 1", () => {
    expect([rattache.mesure_id, rattache.mesure_version, rattache.version]).toEqual([MESURE_A.id, 3, ITEM.version + 1]);
  });

  it("cas 10 : empreinte recalculée par empreinteContenuNotant (la mesure et sa version sont du contenu notant)", () => {
    expect(rattache.empreinte).toBe(empreinteContenuNotant(rattache));
    expect(rattache.empreinte).not.toBe(empreinteContenuNotant(ITEM));
  });

  it("reste en attente, rien d'autre ne change que la mesure, sa version, la version, l'empreinte et l'historique", () => {
    const { mesure_id: _i, mesure_version: _m, version: _v, empreinte: _e, historique: _h, ...reste } = rattache;
    const { mesure_id: _i2, mesure_version: _m2, version: _v2, empreinte: _e2, historique: _h2, ...avant } = ITEM;
    expect(rattache.statut_validation).toBe("en_attente");
    expect(reste).toEqual(avant);
  });

  it("cas 10 : ajoute une entrée d'historique avec le commit, qui nomme la mesure d'avant", () => {
    const historique = rattache.historique as readonly Record<string, unknown>[];
    expect(historique.slice(0, -1)).toEqual(ITEM.historique);
    expect(historique.at(-1)).toEqual({
      date: TRACE.horodatage,
      changement: `rattachement à une autre mesure : mesure ${MESURE_A.id} en version 3`,
      motif:
        `rattachement inscrit au registre des rattachements le ${DATE} : l'item citait la mesure ` +
        `${MESURE_B.id} en version 1 (décision D53 (1))`,
      commit: TRACE.commit,
      version_resultante: ITEM.version + 1,
    });
  });

  it("est conforme à item.schema.json", () => {
    expect(erreurDeSchema("item", rattache, "test")).toBeNull();
  });

  it("refuse un item non en attente, ou déjà sur la cible", () => {
    expect(() => rattacherItem({ ...ITEM, statut_validation: "rejete" }, MESURE_A, TRACE)).toThrow(RattachementRefuse);
    expect(() => rattacherItem(ITEM, MESURE_B, TRACE)).toThrow(RattachementRefuse);
  });

  it("cas 14 : appelé directement sur un couple incompatible, lève RattachementRefuse de motif type_incompatible", () => {
    const motifs = [
      [ITEM_F, MESURE_A],
      [ITEM, MESURE_FICTIVE],
    ].map(([item, cible]) => {
      try {
        rattacherItem(item as Item, cible as typeof MESURE_A, TRACE);
      } catch (erreur) {
        if (erreur instanceof RattachementRefuse) return erreur.motif;
        throw erreur;
      }
      return "accepte";
    });
    expect(motifs).toEqual(["type_incompatible", "type_incompatible"]);
  });

  it("cas 13 : un item F rattaché à une mesure fictive est réécrit sur elle", () => {
    const rattacheF = rattacherItem(ITEM_F, MESURE_FICTIVE, TRACE);
    expect([rattacheF.mesure_id, rattacheF.type]).toEqual([MESURE_FICTIVE.id, "F"]);
  });

  it("refuse un item sans historique : le rattachement ne s'y inscrirait pas", () => {
    const { historique: _h, ...sans } = ITEM;
    expect(() => rattacherItem(sans as typeof ITEM, MESURE_A, TRACE)).toThrow(/sans historique/);
  });
});

describe("cas 11 : après rattachement, le lot qui épinglait l'ancienne version ne juge plus l'item", () => {
  const rattache = rattacherItem(ITEM, MESURE_A, TRACE);

  it("lotJugeEncore est faux pour le lot d'avant, vrai pour un lot qui épingle la nouvelle version", () => {
    expect(lotJugeEncore(rattache, { item_version: ITEM.version })).toBe(false);
    expect(lotJugeEncore(rattache, { item_version: rattache.version })).toBe(true);
  });

  it("le renvoi par correction de thème est toujours reconnu (ses tests restent ceux de renvoi-mesure.test.ts)", () => {
    const repingle = repinglerSurMesure(ITEM, { ...MESURE_B, version: 2 }, { commit: TRACE.commit, horodatage: TRACE.horodatage, decision: {
      mesure_id: MESURE_B.id, mesure_version: 1, theme_demande: "sante", decision: "acceptee", date: DATE,
    } });
    expect(lotJugeEncore(repingle, { item_version: ITEM.version })).toBe(false);
  });

  it("un changement d'historique dont le préfixe n'est pas l'un des deux ne renvoie pas", () => {
    const historique = [...(ITEM.historique ?? []), { date: TRACE.horodatage, changement: "rattachement à une autre mesur : x", commit: TRACE.commit, version_resultante: 2 }];
    expect(lotJugeEncore({ ...ITEM, version: 2, historique }, { item_version: 1 })).toBe(true);
  });
});

/* ------------------------------------------------------------- entrée du registre */

describe("entreeRattachement", () => {
  it("porte la version de l'item AVANT, les deux mesures, la version de la cible et la date", () => {
    expect(entreeRattachement(ITEM, MESURE_A, DATE)).toEqual({
      item_id: ITEM.id,
      item_version: ITEM.version,
      mesure_avant: MESURE_B.id,
      mesure_apres: MESURE_A.id,
      mesure_version_apres: 3,
      date: DATE,
    });
  });
});

function entreeValide(): Record<string, unknown> {
  return { ...entreeRattachement(ITEM, MESURE_A, DATE) };
}

describe("validerEntreeRattachement", () => {
  it("rend la valeur typée d'une entrée valide", () => {
    expect(validerEntreeRattachement(entreeValide(), "test")).toEqual(entreeRattachement(ITEM, MESURE_A, DATE));
  });

  it.each([
    ["pas un objet", [] as unknown],
    ["null", null],
    ["champ manquant (mesure_avant)", (({ mesure_avant: _m, ...reste }) => reste)(entreeValide())],
    ["champ en trop", { ...entreeValide(), libelle: "TVA" }],
    ["version d'item nulle", { ...entreeValide(), item_version: 0 }],
    ["version de cible non entière", { ...entreeValide(), mesure_version_apres: 1.5 }],
    ["identifiant non ULID", { ...entreeValide(), mesure_apres: "tva_energie" }],
    ["date avec heure", { ...entreeValide(), date: "2026-10-16T10:00:00+02:00" }],
  ])("%s ⇒ EntreeRattachementInvalide", (_nom, valeur) => {
    expect(() => validerEntreeRattachement(valeur, "test")).toThrow(EntreeRattachementInvalide);
  });
});

/* ------------------------------------------------------------- registre sur disque */

describe("registre des rattachements sur disque", () => {
  let repertoire = "";
  beforeEach(() => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-rattachements-"));
  });
  afterEach(() => rmSync(repertoire, { recursive: true, force: true }));

  const entree: RattachementItem = entreeRattachement(ITEM, MESURE_A, DATE);

  it("le fichier se nomme rattachements.json ; absent, il est un registre vide", () => {
    expect(cheminRattachements(repertoire)).toBe(join(repertoire, "rattachements.json"));
    expect(lireRattachements(repertoire)).toEqual([]);
  });

  it("ajout seul : absent ⇒ créé, puis chaque ajout garde les entrées antérieures dans leur ordre", () => {
    const sous = join(repertoire, "mesures");
    expect(ajouterRattachement(sous, entree)).toEqual([entree]);
    const seconde = { ...entree, item_id: "01JBANCESSA1000000000TEMZ1" };
    expect(ajouterRattachement(sous, seconde)).toEqual([entree, seconde]);
    expect(lireRattachements(sous)).toEqual([entree, seconde]);
  });

  it("un JSON illisible est une erreur bloquante nommée ; rien n'est écrit", () => {
    writeFileSync(cheminRattachements(repertoire), "[{ pas du json", "utf8");
    expect(() => lireRattachements(repertoire)).toThrow(RegistreRattachementsIllisible);
    expect(() => ajouterRattachement(repertoire, entree)).toThrow(RegistreRattachementsIllisible);
    expect(readFileSync(cheminRattachements(repertoire), "utf8")).toBe("[{ pas du json");
  });

  it("une entrée malformée bloque, en nommant l'entrée", () => {
    writeFileSync(cheminRattachements(repertoire), JSON.stringify([entree, { ...entree, item_version: 0 }]), "utf8");
    expect(() => lireRattachements(repertoire)).toThrow(ErreurSchema);
    expect(() => lireRattachements(repertoire)).toThrow(`${cheminRattachements(repertoire)}, entrée 2`);
  });

  it("une entrée à ajouter malformée est refusée avant toute écriture", () => {
    expect(() => ajouterRattachement(repertoire, { ...entree, mesure_version_apres: 0 })).toThrow(ErreurSchema);
    expect(existsSync(cheminRattachements(repertoire))).toBe(false);
  });

  it("la pose refuse un registre changé depuis sa lecture, et n'écrit rien (ni temporaire laissé)", () => {
    const chemin = cheminRattachements(repertoire);
    writeFileSync(chemin, "[]\n", "utf8");
    expect(() => poserRegistreAjoutSeul(chemin, null, [entree])).toThrow(RegistreModifieDepuisLecture);
    expect(readFileSync(chemin, "utf8")).toBe("[]\n");
    expect(readdirSync(repertoire)).toEqual(["rattachements.json"]);
  });

  it("controlerAjoutRattachement lit le registre et valide l'entrée sans rien écrire", () => {
    expect(() => controlerAjoutRattachement(repertoire, entree)).not.toThrow();
    expect(existsSync(cheminRattachements(repertoire))).toBe(false);
    writeFileSync(cheminRattachements(repertoire), "{}", "utf8");
    expect(() => controlerAjoutRattachement(repertoire, entree)).toThrow(RegistreRattachementsIllisible);
  });
});

/* -------------------------------------------------- cas 19 : accord des validateurs */

describe("cas 19 : accord entre validerEntreeRattachement() et le schéma rattachement-item", () => {
  const racineSchema = join(RACINE, "schema");
  const racineExemples = join(racineSchema, "exemples/rattachement-item");

  function validateurSchema() {
    const { ajv } = construireRegistre(racineSchema);
    const validateur = ajv.getSchema(urnSchema("rattachement-item"));
    if (validateur === undefined) throw new Error("schéma rattachement-item non enregistré.");
    return validateur;
  }

  function accepteParValidateur(valeur: unknown): boolean {
    try {
      validerEntreeRattachement(valeur, "test");
      return true;
    } catch (erreur) {
      if (erreur instanceof EntreeRattachementInvalide) return false;
      throw erreur;
    }
  }

  function exemple(nom: string): unknown {
    return JSON.parse(readFileSync(join(racineExemples, nom), "utf8"));
  }

  const cas: readonly (readonly [string, () => unknown, boolean])[] = [
    ["exemple valide-01", () => exemple("valide-01-rattachement.json"), true],
    ["exemple invalide-01 (sans mesure_avant)", () => exemple("invalide-01-sans-mesure-avant.json"), false],
    ["exemple invalide-02 (version de cible nulle)", () => exemple("invalide-02-version-cible-nulle.json"), false],
    ["exemple invalide-03 (champ en trop)", () => exemple("invalide-03-libelle-recopie.json"), false],
    ["entrée fabriquée par entreeRattachement", () => entreeValide(), true],
    ["item_version nulle", () => ({ ...entreeValide(), item_version: 0 }), false],
    ["item_version textuelle", () => ({ ...entreeValide(), item_version: "1" }), false],
    ["mesure_version_apres non entière", () => ({ ...entreeValide(), mesure_version_apres: 2.5 }), false],
    ["identifiant hors Crockford (I et U)", () => ({ ...entreeValide(), item_id: "01JBANCESSAI0000000MESURE1" }), false],
    ["mesure_apres absente", () => (({ mesure_apres: _m, ...reste }) => reste)(entreeValide()), false],
    ["date avec heure", () => ({ ...entreeValide(), date: "2026-10-16T10:00:00Z" }), false],
    ["tableau au lieu d'un objet", () => [entreeValide()], false],
  ];

  it.each(cas)("%s : même verdict", (_nom, fabriquer, attendu) => {
    const valeur = fabriquer();
    expect(validateurSchema()(valeur)).toBe(attendu);
    expect(accepteParValidateur(valeur)).toBe(attendu);
  });
});
