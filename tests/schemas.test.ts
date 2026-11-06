/**
 * Cas limites du validateur des exemples, un test par cas listé dans le brief. Les cas 1 et 2
 * tournent sur les vrais fichiers de `schema/` : ce sont eux la garantie que `pnpm check` couvre
 * réellement le manifeste. Les cas 3 à 7 construisent un répertoire d'exemples jetable, pour
 * isoler chaque désaccord entre le manifeste et le schéma sans dépendre du contenu réel de
 * `schema/exemples/`.
 */

import { mkdtempSync, readdirSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listerFichiersExemplesSurDisque } from "../outils/schemas/disque.ts";
import { tenterValidationIsolee } from "../outils/schemas/isole.ts";
import type { Manifeste } from "../outils/schemas/manifeste.ts";
import { chargerManifeste, ErreurManifeste } from "../outils/schemas/manifeste.ts";
import { verifierConformiteMetaSchema } from "../outils/schemas/meta.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { validerContreManifeste } from "../outils/schemas/validation.ts";

const racineSchema = resolve(import.meta.dirname, "../schema");
const racineExemplesReels = resolve(racineSchema, "exemples");
const manifesteReel = resolve(racineExemplesReels, "manifeste.json");

// --- Fabriques pour les cas 3 à 7 : une mesure valide et une mesure à deux violations. ---

function mesureValideBrute(): Record<string, unknown> {
  return {
    id: "JE6Y9CC6TBCK6K7H6WNNZ7353S",
    version: 1,
    empreinte: "4b502fd1225fcfe3e99e3466bea4f871aba6bee8acd0896a1844868bd1552d8a",
    libelle: "TVA réduite sur les produits énergétiques",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "ramener la TVA sur les produits énergétiques à 5,5 %",
    fictive: false,
    historique: [
      {
        date: "2026-09-20T10:05:00+02:00",
        changement: "création",
        commit: "2f22765d04931a078909145ca628d2264c852d7d",
        version_resultante: 1,
      },
    ],
  };
}

/** Deux violations distinctes et indépendantes : `libelle` manquant, `theme` hors de l'énumération. */
function mesureDoubleViolationBrute(): Record<string, unknown> {
  const { libelle: _sansLibelle, ...reste } = mesureValideBrute();
  return { ...reste, theme: "hors_liste" };
}

interface RepertoireJetable {
  readonly racine: string;
  ecrire(cheminRelatif: string, contenu: unknown): void;
}

function repertoireJetable(): RepertoireJetable {
  const racine = mkdtempSync(join(tmpdir(), "banc-essai-schemas-"));
  return {
    racine,
    ecrire(cheminRelatif, contenu) {
      const chemin = join(racine, cheminRelatif);
      mkdirSync(join(chemin, ".."), { recursive: true });
      writeFileSync(chemin, JSON.stringify(contenu, null, 2), "utf8");
    },
  };
}

function manifesteDe(exemples: Manifeste["exemples"]): Manifeste {
  return { description: "manifeste de test", exemples };
}

let dossiersACreer: string[] = [];

afterEach(() => {
  for (const dossier of dossiersACreer) rmSync(dossier, { recursive: true, force: true });
  dossiersACreer = [];
});

function nouveauRepertoire(): RepertoireJetable {
  const repertoire = repertoireJetable();
  dossiersACreer.push(repertoire.racine);
  return repertoire;
}

describe("schémas réels : manifeste et méta-schéma", () => {
  // 284, inchangé : D47 (2), le valide pilote sans balise est remplacé par un invalide équivalent (invalide-46-pilote-sans-balise).
  it("1. les exemples du manifeste réel donnent tous le résultat attendu, chacun validé une fois", () => {
    const manifeste = chargerManifeste(manifesteReel);
    const { ajv } = construireRegistre(racineSchema);
    const rapport = validerContreManifeste(ajv, racineExemplesReels, manifeste);

    expect(manifeste.exemples.length).toBeGreaterThan(0);
    expect(rapport.resultats.map((resultat) => resultat.chemin)).toEqual(
      manifeste.exemples.map((entree) => entree.fichier),
    );
    const echecs = rapport.resultats.filter((resultat) => !resultat.reussi);
    expect(echecs).toEqual([]);
    expect(rapport.fichiersOrphelins).toEqual([]);
  });

  it("2. les schémas réels de schema/ sont conformes au méta-schéma draft 2020-12", () => {
    const conformites = verifierConformiteMetaSchema(racineSchema);
    // Le compte vient du répertoire : chaque *.schema.json présent est vérifié, et réciproquement.
    const surDisque = readdirSync(racineSchema)
      .filter((fichier) => fichier.endsWith(".schema.json"))
      .map((fichier) => fichier.slice(0, -".schema.json".length))
      .sort();
    expect(surDisque.length).toBeGreaterThan(0);
    expect(conformites.map((conformite) => conformite.nom).sort()).toEqual(surDisque);
    for (const conformite of conformites) {
      expect(conformite.erreurs, `schéma "${conformite.nom}"`).toEqual([]);
      expect(conformite.conforme, `schéma "${conformite.nom}"`).toBe(true);
    }
  });
});

describe("désaccords entre manifeste et disque", () => {
  it("3. un exemple listé au manifeste mais absent du disque nomme le chemin", () => {
    const repertoire = nouveauRepertoire();
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/absente.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats).toHaveLength(1);
    expect(rapport.resultats[0]).toMatchObject({
      chemin: "mesure/absente.json",
      obtenu: "absent",
      reussi: false,
    });
  });

  it("4. un fichier du disque absent du manifeste nomme le chemin (le manifeste est exclu)", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/valide-01.json", mesureValideBrute());
    repertoire.ecrire("mesure/orpheline.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/valide-01.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.fichiersOrphelins).toEqual(["mesure/orpheline.json"]);
  });
});

describe("désaccords entre attendu et verdict ajv", () => {
  it("5. un exemple valide attendu que le schéma rejette est signalé en échec avec ses erreurs", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/rejetee.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/rejetee.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "invalide", reussi: false });
    expect(rapport.resultats[0]?.erreurs.length).toBeGreaterThan(0);
  });

  it("6. un exemple invalide attendu que le schéma accepte est signalé en échec", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/acceptee.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      {
        objet: "mesure",
        fichier: "mesure/acceptee.json",
        attendu: "invalide",
        motif: "test",
        erreur_visee: { keyword: "required", instance_path: "" },
      },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "valide", reussi: false });
  });

  it("7. les deux violations d'un même objet sont toutes les deux rapportées, pas seulement la première", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/deux-violations.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/deux-violations.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);
    const erreurs = rapport.resultats[0]?.erreurs ?? [];

    expect(erreurs.length).toBeGreaterThanOrEqual(2);
    expect(erreurs.some((erreur) => erreur.instancePath === "" && erreur.keyword === "required")).toBe(true);
    expect(erreurs.some((erreur) => erreur.instancePath === "/theme")).toBe(true);
  });
});

describe("la règle visée d'un exemple invalide (revue du 2026-10-12, constat 22)", () => {
  const visee = (keyword: string, instancePath: string) => ({ keyword, instance_path: instancePath });
  const entreeInvalide = (erreurVisee: ReturnType<typeof visee>): Manifeste["exemples"] => [
    {
      objet: "mesure",
      fichier: "mesure/double.json",
      attendu: "invalide",
      motif: "test",
      erreur_visee: erreurVisee,
    },
  ];

  it("9. un exemple invalide rejeté pour une autre raison que celle déclarée échoue, règle visée nommée", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/double.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    // Deux violations réelles (required à la racine, enum sur /theme) ; la règle déclarée n'est pas l'une d'elles.
    const manifeste = manifesteDe(entreeInvalide(visee("minItems", "/historique")));

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({
      obtenu: "invalide",
      reussi: false,
      regleVisee: { keyword: "minItems", instancePath: "/historique" },
      regleVueParmiLesErreurs: false,
    });
  });

  it("10. un exemple invalide rejeté pour la règle déclarée réussit, même avec d'autres erreurs", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/double.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);

    for (const erreurVisee of [visee("required", ""), visee("enum", "/theme")]) {
      const rapport = validerContreManifeste(ajv, repertoire.racine, manifesteDe(entreeInvalide(erreurVisee)));
      expect(rapport.resultats[0]).toMatchObject({ obtenu: "invalide", reussi: true, regleVueParmiLesErreurs: true });
    }
  });

  it("11. un exemple invalide dont la règle visée n'est pas déclarée est une erreur du manifeste", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/double.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const sansRegle: Manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/double.json", attendu: "invalide", motif: "test" },
    ]);

    expect(() => validerContreManifeste(ajv, repertoire.racine, sansRegle)).toThrow(ErreurManifeste);
    expect(() => validerContreManifeste(ajv, repertoire.racine, sansRegle)).toThrow(/mesure\/double\.json/);
  });

  it("12. le chargeur refuse un invalide sans erreur_visee et un valide qui en porte une, en nommant le fichier", () => {
    const repertoire = nouveauRepertoire();
    const base = { objet: "mesure", motif: "test" };
    repertoire.ecrire("m1.json", { description: "d", exemples: [{ ...base, fichier: "a.json", attendu: "invalide" }] });
    repertoire.ecrire("m2.json", {
      description: "d",
      exemples: [{ ...base, fichier: "b.json", attendu: "valide", erreur_visee: visee("required", "") }],
    });
    repertoire.ecrire("m3.json", {
      description: "d",
      exemples: [{ ...base, fichier: "c.json", attendu: "invalide", erreur_visee: { keyword: "required" } }],
    });

    expect(() => chargerManifeste(join(repertoire.racine, "m1.json"))).toThrow(/a\.json.*erreur_visee/s);
    expect(() => chargerManifeste(join(repertoire.racine, "m2.json"))).toThrow(/b\.json.*erreur_visee/s);
    expect(() => chargerManifeste(join(repertoire.racine, "m3.json"))).toThrow(/c\.json.*instance_path/s);
  });

  it("13. dans le manifeste réel, chaque exemple invalide déclare sa règle visée et aucun valide n'en déclare", () => {
    const manifeste = chargerManifeste(manifesteReel);
    for (const entree of manifeste.exemples) {
      expect(entree.erreur_visee !== undefined, entree.fichier).toBe(entree.attendu === "invalide");
    }
  });
});

describe("couplage du registre commun", () => {
  it("8. un schéma pris isolément sans le registre commun échoue en nommant la référence non résolue", () => {
    expect(() => tenterValidationIsolee("item", racineSchema)).toThrow(
      /urn:banc-essai-2027:schema:commun/,
    );
  });
});

describe("aucun fichier du disque n'est ignoré", () => {
  // 284, inchangé : D47 (2), le valide pilote sans balise est remplacé par un invalide équivalent (invalide-46-pilote-sans-balise).
  // Seule garde de l'égalité entre le disque et le manifeste : aucun nombre en dur, donc plus de
  // conflit à chaque exemple ajouté. Un fichier non déclaré, une entrée sans fichier ou une entrée
  // en double fait échouer ce test.
  it("les fichiers d'exemples du disque sont exactement ceux que déclare le manifeste réel", () => {
    const manifeste = chargerManifeste(manifesteReel);
    const declares = manifeste.exemples.map((entree) => entree.fichier);
    expect(new Set(declares).size).toBe(declares.length);
    expect(listerFichiersExemplesSurDisque(racineExemplesReels)).toEqual([...declares].sort());
  });
});
