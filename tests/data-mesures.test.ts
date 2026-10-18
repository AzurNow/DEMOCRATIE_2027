/**
 * `validation/io/data-mesures.ts` (lot mesures-validees, décision D38, option (a)) : un fichier par
 * mesure dans sa version courante, lu sous schéma et sous la règle « nom de fichier = id », créé
 * sans écrasement, réécrit seulement vers une version supérieure et seulement si le fichier n'a pas
 * changé depuis sa lecture ; et le plan que `pnpm promote` en tire avant toute écriture.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurSchema, JsonIllisible, valider } from "../outils/schemas/valider.ts";
import { empreinteMesure } from "../validation/domaine/empreinte.ts";
import type { Item, Mesure } from "../validation/domaine/types.ts";
import { FichierModifieDepuisLecture } from "../validation/io/data-items.ts";
import {
  cheminMesure,
  creerMesure,
  FichierMesureMalNomme,
  lireMesuresData,
  MesureDejaDansData,
  planifierMesures,
  reecrireMesure,
  ReecritureMesureSansVersionSuperieure,
} from "../validation/io/data-mesures.ts";
import { relectureDe, type RegistreRelecturesMesure } from "../validation/domaine/relectures-mesure.ts";
import { itemP, mesure } from "./aides/fabriques.ts";

let repertoire = "";
beforeEach(() => {
  repertoire = mkdtempSync(join(tmpdir(), "banc-data-mesures-"));
});
afterEach(() => rmSync(repertoire, { recursive: true, force: true }));

function fichiers(): readonly string[] {
  return readdirSync(repertoire).sort();
}

function versionDeux(base: Mesure): Mesure {
  const historique = [
    ...(base as unknown as { historique: readonly unknown[] }).historique,
    { date: "2026-10-01T10:00:00+02:00", changement: "thème corrigé", commit: "c".repeat(40), version_resultante: 2 },
  ];
  const corrigee = { ...base, version: 2, theme: "sante", historique } as Mesure;
  return { ...corrigee, empreinte: empreinteMesure(corrigee) };
}

describe("creerMesure", () => {
  it("cas 1 : écrit une mesure conforme au schéma, relue telle quelle, sans temporaire", () => {
    const valeur = mesure();
    creerMesure(repertoire, valeur);
    expect(fichiers()).toEqual([`${valeur.id}.json`]);
    const relue = JSON.parse(readFileSync(cheminMesure(repertoire, valeur.id), "utf8")) as unknown;
    expect(() => valider("mesure", relue, "relue")).not.toThrow();
    expect(lireMesuresData(repertoire).get(valeur.id)?.mesure).toEqual(valeur);
  });

  it("refuse une mesure déjà présente, sans toucher au fichier", () => {
    const valeur = mesure();
    creerMesure(repertoire, valeur);
    const avant = readFileSync(cheminMesure(repertoire, valeur.id));
    expect(() => creerMesure(repertoire, valeur)).toThrow(MesureDejaDansData);
    expect(readFileSync(cheminMesure(repertoire, valeur.id))).toEqual(avant);
  });

  it("cas 7 : refuse une mesure non conforme au schéma, sans rien écrire", () => {
    expect(() => creerMesure(repertoire, mesure({ libelle: "x" }))).toThrow(ErreurSchema);
    expect(fichiers()).toEqual([]);
  });
});

describe("lireMesuresData", () => {
  it("un répertoire absent est un data/ sans mesure", () => {
    expect(lireMesuresData(join(repertoire, "absent")).size).toBe(0);
  });

  it("cas 9 : un fichier non conforme arrête la lecture en nommant le fichier", () => {
    const valeur = mesure();
    const chemin = cheminMesure(repertoire, valeur.id);
    writeFileSync(chemin, JSON.stringify({ ...valeur, version: 0 }), "utf8");
    expect(() => lireMesuresData(repertoire)).toThrow(ErreurSchema);
    expect(() => lireMesuresData(repertoire)).toThrow(chemin);
  });

  it("constat 26 : un JSON illisible arrête la lecture par une erreur nommée qui nomme le fichier", () => {
    const chemin = cheminMesure(repertoire, "01JBANCESSA90000000MESURE1");
    writeFileSync(chemin, "{ ceci n'est pas du JSON", "utf8");
    expect(() => lireMesuresData(repertoire)).toThrow(JsonIllisible);
    expect(() => lireMesuresData(repertoire)).toThrow(chemin);
  });

  it("cas 9 : un fichier dont le nom n'est pas l'id de sa mesure est refusé", () => {
    const valeur = mesure();
    const chemin = join(repertoire, "01JBANCESSA90000000AUTRE01.json");
    writeFileSync(chemin, JSON.stringify(valeur), "utf8");
    expect(() => lireMesuresData(repertoire)).toThrow(FichierMesureMalNomme);
    expect(() => lireMesuresData(repertoire)).toThrow(chemin);
  });
});

describe("reecrireMesure", () => {
  it("cas 5 : réécrit vers une version supérieure, sans temporaire", () => {
    const v1 = mesure();
    creerMesure(repertoire, v1);
    const lu = lireMesuresData(repertoire).get(v1.id);
    if (lu === undefined) throw new Error("mesure non relue");
    reecrireMesure(repertoire, lu, versionDeux(v1));
    expect(lireMesuresData(repertoire).get(v1.id)?.mesure.version).toBe(2);
    expect(fichiers()).toEqual([`${v1.id}.json`]);
  });

  it("refuse si le fichier a changé depuis sa lecture", () => {
    const v1 = mesure();
    creerMesure(repertoire, v1);
    const lu = lireMesuresData(repertoire).get(v1.id);
    if (lu === undefined) throw new Error("mesure non relue");
    const chemin = cheminMesure(repertoire, v1.id);
    writeFileSync(chemin, `${readFileSync(chemin, "utf8")}\n`, "utf8");
    const modifie = readFileSync(chemin);
    expect(() => reecrireMesure(repertoire, lu, versionDeux(v1))).toThrow(FichierModifieDepuisLecture);
    expect(readFileSync(chemin)).toEqual(modifie);
  });

  it("cas 6 : refuse une réécriture qui ne monte pas de version", () => {
    const v2 = versionDeux(mesure());
    creerMesure(repertoire, v2);
    const lu = lireMesuresData(repertoire).get(v2.id);
    if (lu === undefined) throw new Error("mesure non relue");
    const avant = readFileSync(cheminMesure(repertoire, v2.id));
    expect(() => reecrireMesure(repertoire, lu, mesure())).toThrow(ReecritureMesureSansVersionSuperieure);
    expect(readFileSync(cheminMesure(repertoire, v2.id))).toEqual(avant);
  });

  it("cas 7 : refuse une mesure à réécrire non conforme au schéma", () => {
    const v1 = mesure();
    creerMesure(repertoire, v1);
    const lu = lireMesuresData(repertoire).get(v1.id);
    if (lu === undefined) throw new Error("mesure non relue");
    const avant = readFileSync(cheminMesure(repertoire, v1.id));
    expect(() => reecrireMesure(repertoire, lu, { ...versionDeux(v1), libelle: "x" })).toThrow(ErreurSchema);
    expect(readFileSync(cheminMesure(repertoire, v1.id))).toEqual(avant);
  });
});

describe("planifierMesures", () => {
  const ITEM: Item = itemP();

  function plan(items: readonly Item[], staging: readonly Mesure[], relectures: RegistreRelecturesMesure) {
    const table = new Map(staging.map((valeur) => [valeur.id, valeur]));
    return planifierMesures(items, table, lireMesuresData(repertoire), repertoire, relectures);
  }

  /** Chaque mesure donnée, relue dans son contenu exact (décision D53 (1)). */
  function relues(...mesures: readonly Mesure[]): RegistreRelecturesMesure {
    return mesures.map((valeur) => relectureDe(valeur, "2026-10-16"));
  }

  it("cas 1 : une mesure absente de data/ est à créer", () => {
    const resultat = plan([ITEM], [mesure()], relues(mesure()));
    expect(resultat.creer.map((valeur) => valeur.id)).toEqual([ITEM.mesure_id]);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 2 : deux items qui citent la même mesure donnent une seule création", () => {
    const second = itemP({ id: "01JBANCESSA1000000001TEM02" });
    const resultat = plan([ITEM, second], [mesure()], relues(mesure()));
    expect(resultat.creer).toHaveLength(1);
  });

  it("cas 3 : une mesure identique, à l'ordre des clés près, n'est ni créée ni réécrite", () => {
    const valeur = mesure();
    const inverse = Object.fromEntries(Object.entries(valeur).reverse());
    writeFileSync(cheminMesure(repertoire, valeur.id), JSON.stringify(inverse), "utf8");
    const resultat = plan([ITEM], [valeur], []);
    expect(resultat.identiques.map((identique) => identique.id)).toEqual([valeur.id]);
    expect(resultat.creer).toEqual([]);
    expect(resultat.reecrire).toEqual([]);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 4 : même version, contenu différent : refus nommé", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([ITEM], [mesure({ libelle: "TVA réduite sur le gaz" })], relues(mesure({ libelle: "TVA réduite sur le gaz" })));
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "meme_version_contenu_different" })]);
  });

  it("cas 5 : version du staging supérieure : à réécrire", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([ITEM], [versionDeux(mesure())], relues(versionDeux(mesure())));
    expect(resultat.reecrire.map((entree) => [entree.lu.mesure.version, entree.apres.version])).toEqual([[1, 2]]);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 6 : version du staging inférieure à data/ : refus nommé", () => {
    creerMesure(repertoire, versionDeux(mesure()));
    const resultat = plan([ITEM], [mesure()], relues(mesure()));
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "regression_de_version" })]);
  });

  it("cas 7 : une mesure à écrire non conforme au schéma : refus nommé avec le schéma", () => {
    const resultat = plan([ITEM], [mesure({ libelle: "x" })], relues(mesure({ libelle: "x" })));
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "non_conforme" })]);
    expect(resultat.refus[0]?.detail).toContain("« mesure »");
    expect(resultat.creer).toEqual([]);
  });

  it("une mesure citée absente de staging/ : refus nommé, jamais ignorée", () => {
    const resultat = plan([ITEM], [], []);
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "absente_du_staging" })]);
  });
});

/**
 * Verrou de relecture (décision D53 (1)) : toute mesure que la promotion créerait ou réécrirait
 * exige une relecture couvrant son `(id, version, empreinte)`. Une mesure publiée identique passe
 * sans relecture, et les refus antérieurs priment.
 */
describe("planifierMesures : verrou de relecture", () => {
  const ITEM: Item = itemP();
  const DATE = "2026-10-16";

  function plan(items: readonly Item[], staging: readonly Mesure[], relectures: RegistreRelecturesMesure) {
    const table = new Map(staging.map((valeur) => [valeur.id, valeur]));
    return planifierMesures(items, table, lireMesuresData(repertoire), repertoire, relectures);
  }

  function motifs(resultat: ReturnType<typeof plan>): readonly string[] {
    return resultat.refus.map((refus) => refus.motif);
  }

  it("cas 1 et 2 : mesure nouvelle, registre vide : refus sans_relecture, rien à créer", () => {
    const resultat = plan([ITEM], [mesure()], []);
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "sans_relecture" })]);
    expect(resultat.creer).toEqual([]);
  });

  it("le détail du refus nomme l'id, la version et l'empreinte attendus", () => {
    const valeur = mesure();
    const attendue = relectureDe(valeur, DATE);
    const [refus] = plan([ITEM], [valeur], []).refus;
    expect(refus?.detail).toContain(`mesure_id ${attendue.mesure_id}`);
    expect(refus?.detail).toContain(`mesure_version ${attendue.mesure_version}`);
    expect(refus?.detail).toContain(`empreinte ${attendue.empreinte}`);
  });

  it("cas 3 : relecture de la bonne mesure dans une autre version : refus", () => {
    const relecture = { ...relectureDe(mesure(), DATE), mesure_version: 2 };
    const resultat = plan([ITEM], [mesure()], [relecture]);
    expect(motifs(resultat)).toEqual(["sans_relecture"]);
    expect(resultat.creer).toEqual([]);
  });

  it("cas 4 : relecture de la bonne version, formulation modifiée depuis : refus", () => {
    const modifiee = mesure({ formulation_canonique: "ramener la TVA sur le gaz à 5,5 %" });
    const resultat = plan([ITEM], [modifiee], [relectureDe(mesure(), DATE)]);
    expect(motifs(resultat)).toEqual(["sans_relecture"]);
    expect(resultat.creer).toEqual([]);
  });

  it("cas 5 : relecture exacte : création permise", () => {
    const resultat = plan([ITEM], [mesure()], [relectureDe(mesure(), DATE)]);
    expect(resultat.creer.map((valeur) => valeur.id)).toEqual([ITEM.mesure_id]);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 6 : réécriture sans relecture de la nouvelle version, l'ancienne relue : refus", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([ITEM], [versionDeux(mesure())], [relectureDe(mesure(), DATE)]);
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "sans_relecture" })]);
    expect(resultat.reecrire).toEqual([]);
  });

  it("cas 6 : réécriture dont la nouvelle version est relue : permise", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([ITEM], [versionDeux(mesure())], [relectureDe(versionDeux(mesure()), DATE)]);
    expect(resultat.reecrire).toHaveLength(1);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 7 : mesure publiée identique : passe sans relecture", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([ITEM], [mesure()], []);
    expect(resultat.identiques.map((valeur) => valeur.id)).toEqual([ITEM.mesure_id]);
    expect(resultat.refus).toEqual([]);
  });

  it("cas 8 : plusieurs items citant la même mesure non relue : un seul refus", () => {
    const second = itemP({ id: "01JBANCESSA1000000001TEM02" });
    const resultat = plan([ITEM, second], [mesure()], []);
    expect(motifs(resultat)).toEqual(["sans_relecture"]);
    expect(resultat.creer).toEqual([]);
  });

  it("cas 12 : deux relectures identiques : création permise", () => {
    const relecture = relectureDe(mesure(), DATE);
    expect(plan([ITEM], [mesure()], [relecture, relecture]).creer).toHaveLength(1);
  });

  describe("cas 13 : les refus antérieurs priment, inchangés", () => {
    it("absente_du_staging, sans relecture", () => {
      expect(motifs(plan([ITEM], [], []))).toEqual(["absente_du_staging"]);
    });

    it("non_conforme, sans relecture", () => {
      expect(motifs(plan([ITEM], [mesure({ libelle: "x" })], []))).toEqual(["non_conforme"]);
    });

    it("regression_de_version, sans relecture", () => {
      creerMesure(repertoire, versionDeux(mesure()));
      expect(motifs(plan([ITEM], [mesure()], []))).toEqual(["regression_de_version"]);
    });

    it("meme_version_contenu_different, sans relecture", () => {
      creerMesure(repertoire, mesure());
      expect(motifs(plan([ITEM], [mesure({ libelle: "TVA réduite sur le gaz" })], []))).toEqual(["meme_version_contenu_different"]);
    });
  });
});

/**
 * Le champ `empreinte` d'une mesure est défini par son contenu (`mesure.schema.json`) : une mesure à
 * écrire dont l'empreinte ne suit pas son contenu est refusée, avec la valeur attendue, et jamais
 * recalculée par la promotion.
 */
describe("planifierMesures : empreinte incohérente", () => {
  const ITEM: Item = itemP();
  const DATE = "2026-10-16";
  const FAUSSE = "3".repeat(64);

  function plan(staging: readonly Mesure[], relectures: RegistreRelecturesMesure) {
    const table = new Map(staging.map((valeur) => [valeur.id, valeur]));
    return planifierMesures([ITEM], table, lireMesuresData(repertoire), repertoire, relectures);
  }

  /** Thème corrigé à la main en version 2, empreinte laissée à celle de la version 1. */
  function themeCorrigeSansEmpreinte(): Mesure {
    const v2 = versionDeux(mesure());
    return { ...v2, empreinte: mesure().empreinte };
  }

  it("création d'une mesure à l'empreinte fausse, pourtant relue : refus, rien à créer", () => {
    const fausse = { ...mesure(), empreinte: FAUSSE };
    const resultat = plan([fausse], [relectureDe(fausse, DATE)]);
    expect(resultat.refus).toEqual([expect.objectContaining({ mesure_id: ITEM.mesure_id, motif: "empreinte_incoherente" })]);
    expect(resultat.creer).toEqual([]);
  });

  it("le détail nomme l'empreinte portée et l'empreinte attendue", () => {
    const [refus] = plan([{ ...mesure(), empreinte: FAUSSE }], []).refus;
    expect(refus?.detail).toContain(FAUSSE);
    expect(refus?.detail).toContain(mesure().empreinte);
  });

  it("thème corrigé à la main sans mettre l'empreinte à jour : réécriture refusée", () => {
    creerMesure(repertoire, mesure());
    const corrigee = themeCorrigeSansEmpreinte();
    const resultat = plan([corrigee], [relectureDe(corrigee, DATE)]);
    expect(resultat.refus).toEqual([expect.objectContaining({ motif: "empreinte_incoherente" })]);
    expect(resultat.reecrire).toEqual([]);
  });

  it("le même thème corrigé, empreinte mise à jour : réécriture permise", () => {
    creerMesure(repertoire, mesure());
    const resultat = plan([versionDeux(mesure())], [relectureDe(versionDeux(mesure()), DATE)]);
    expect(resultat.reecrire).toHaveLength(1);
    expect(resultat.refus).toEqual([]);
  });

  it("la mesure staging identique à sa version publiée passe, l'empreinte étant cohérente", () => {
    creerMesure(repertoire, mesure());
    expect(plan([mesure()], []).identiques).toHaveLength(1);
  });

  it("l'incohérence prime sur l'absence de relecture : un seul refus, le plus précis", () => {
    expect(plan([{ ...mesure(), empreinte: FAUSSE }], []).refus.map((refus) => refus.motif)).toEqual(["empreinte_incoherente"]);
  });

  it("la non-conformité au schéma prime sur l'incohérence", () => {
    const resultat = plan([{ ...mesure({ libelle: "x" }), empreinte: FAUSSE }], []);
    expect(resultat.refus.map((refus) => refus.motif)).toEqual(["non_conforme"]);
  });
});
