/**
 * Revue du 2026-11-05, constat 1 : `metriques.json` et le recalcul (b) daté se publient par lien dur
 * exclusif (`analysis/ecriture-une-fois.ts`), jamais par renommage. Une analyse concurrente qui
 * publie son fichier entre la vérification et l'écriture n'est plus écrasée : elle est comparée à
 * l'octet (`metriques.json`) ou refusée (recalcul (b), comportement d'avant conservé).
 *
 * La concurrence est simulée sans second processus : `linkSync` est enveloppé pour qu'un écrivain
 * concurrent pose la cible juste avant le lien, au dernier instant de la course. L'échec d'écriture
 * est simulé par un `fsyncSync` qui échoue. Les deux crochets sont nuls hors du test qui les pose.
 */

import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { analyserRun, cheminMetriques, lireEntreesDuRun, MetriquesDivergentes, validerEtEcrire } from "../../analysis/analyse-du-run.ts";
import { ecrireUneFoisOuComparer } from "../../analysis/ecriture-une-fois.ts";
import { cheminRecalculB, recalculB, recalculerEtEcrireB, RecalculBDejaPublie } from "../../analysis/recalcul-b.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { questionsDuSousEchantillonDuRun } from "../../pipeline/interrogation/sous-echantillon-application.ts";
import { echantillonHumainDuRun } from "../../pipeline/notation/echantillons.ts";
import { etatsDesLectures } from "../../pipeline/notation/lectures-comparateur.ts";
import { poserLecturesNonAffichees, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "./run-analysable.ts";

const crochets = vi.hoisted(() => ({
  /** Appelé avec la cible juste avant le vrai `linkSync` : l'écrivain concurrent. */
  avantLien: null as ((cible: string) => void) | null,
  /** Vrai : `fsyncSync` échoue, comme un disque plein ou une écriture interrompue. */
  fsyncEchoue: false,
}));

vi.mock("node:fs", async (importOriginal) => {
  const reel = await importOriginal<typeof import("node:fs")>();
  return {
    ...reel,
    linkSync: (existant: string, cible: string): void => {
      crochets.avantLien?.(cible);
      reel.linkSync(existant, cible);
    },
    fsyncSync: (descripteur: number): void => {
      if (crochets.fsyncEchoue) throw Object.assign(new Error("ENOSPC simulé : fsync"), { code: "ENOSPC" });
      reel.fsyncSync(descripteur);
    },
  };
});

afterEach(() => {
  crochets.avantLien = null;
  crochets.fsyncEchoue = false;
});

/** L'écrivain concurrent : pose `contenu` sous la cible, une seule fois. */
function concurrent(contenu: string): void {
  crochets.avantLien = (cible) => {
    crochets.avantLien = null;
    writeFileSync(cible, contenu, "utf8");
  };
}

/** Les temporaires (cachés) laissés dans un répertoire : toujours aucun. */
const temporaires = (repertoire: string): readonly string[] => readdirSync(repertoire).filter((nom) => nom.startsWith("."));

class Divergent extends Error {
  constructor(chemin: string) {
    super(`divergent : ${chemin}`);
    this.name = "Divergent";
  }
}

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };
const JOUR = "2027-01-15";

describe("ecrireUneFoisOuComparer : la primitive partagée", () => {
  let repertoire = "";
  beforeAll(() => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-une-fois-comparer-"));
  });
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  it("cible absente : écrite, issue « ecrit », aucun temporaire", () => {
    expect(ecrireUneFoisOuComparer(repertoire, "a.json", "« un »\n", (c) => new Divergent(c))).toBe("ecrit");
    expect(readFileSync(join(repertoire, "a.json"), "utf8")).toBe("« un »\n");
    expect(temporaires(repertoire)).toEqual([]);
  });

  it("cible identique à l'octet : issue « inchange », octets inchangés", () => {
    expect(ecrireUneFoisOuComparer(repertoire, "a.json", "« un »\n", (c) => new Divergent(c))).toBe("inchange");
    expect(readFileSync(join(repertoire, "a.json"), "utf8")).toBe("« un »\n");
    expect(temporaires(repertoire)).toEqual([]);
  });

  it("cible différente : le refus de l'appelant, fichier en place intact, aucun temporaire", () => {
    expect(() => ecrireUneFoisOuComparer(repertoire, "a.json", "« deux »\n", (c) => new Divergent(c))).toThrow(Divergent);
    expect(readFileSync(join(repertoire, "a.json"), "utf8")).toBe("« un »\n");
    expect(temporaires(repertoire)).toEqual([]);
  });
});

describe("validerEtEcrire : metriques.json publié par une analyse concurrente pendant celle-ci", () => {
  const document = analyserRun(entreesDuRunAnalysable(SPEC_REFERENCE), PARAMETRES, null);
  const texte = `${JSON.stringify(document, null, 2)}\n`;
  let repertoire = "";
  let chemin = "";
  beforeAll(() => {
    repertoire = mkdtempSync(join(tmpdir(), "banc-metriques-concurrentes-"));
  });
  afterAll(() => rmSync(repertoire, { recursive: true, force: true }));

  function nouveauChemin(nom: string): string {
    chemin = join(repertoire, nom, "metriques", "metriques.json");
    return chemin;
  }

  it("contenu concurrent différent, apparu entre la vérification et l'écriture : MetriquesDivergentes, fichier concurrent intact", () => {
    nouveauChemin("divergent");
    const autre = texte.replace('"permutations": 20', '"permutations": 21');
    expect(autre).not.toBe(texte);
    concurrent(autre);
    expect(() => validerEtEcrire(chemin, document)).toThrow(MetriquesDivergentes);
    expect(readFileSync(chemin, "utf8")).toBe(autre);
    expect(temporaires(dirname(chemin))).toEqual([]);
  });

  it("contenu concurrent identique : succès « inchange », octets inchangés", () => {
    nouveauChemin("identique");
    concurrent(texte);
    expect(validerEtEcrire(chemin, document)).toBe("inchange");
    expect(readFileSync(chemin, "utf8")).toBe(texte);
    expect(temporaires(dirname(chemin))).toEqual([]);
  });

  it("écriture qui échoue avant le lien : l'erreur remonte, ni metriques.json ni temporaire", () => {
    nouveauChemin("echec");
    crochets.fsyncEchoue = true;
    expect(() => validerEtEcrire(chemin, document)).toThrow(/ENOSPC simulé/);
    expect(readdirSync(dirname(chemin))).toEqual([]);
  });
});

describe("recalculerEtEcrireB : fichier daté publié par un recalcul concurrent pendant celui-ci", () => {
  let fictif: RunFictif;
  const options = () => ({ items: fictif.items, plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun, sous_echantillon_application: questionsDuSousEchantillonDuRun, etats_des_lectures: etatsDesLectures });

  beforeAll(() => {
    fictif = poserRunNote();
    poserLecturesNonAffichees(fictif);
    validerEtEcrire(cheminMetriques(fictif.repertoire_run), analyserRun(lireEntreesDuRun(fictif.repertoire_run, options()), PARAMETRES, null));
  });
  afterAll(() => fictif.nettoyer());

  const cheminDuJour = (): string => cheminRecalculB(fictif.repertoire_run, JOUR);

  /** Le texte exact que `recalculerEtEcrireB` publierait pour ce jour. */
  function texteDuJour(): string {
    const reference = { chemin: cheminMetriques(fictif.repertoire_run), texte: readFileSync(cheminMetriques(fictif.repertoire_run), "utf8") };
    return `${JSON.stringify(recalculB(lireEntreesDuRun(fictif.repertoire_run, options()), reference, JOUR), null, 2)}\n`;
  }

  it("écriture qui échoue avant le lien : l'erreur remonte, ni fichier daté ni temporaire", () => {
    crochets.fsyncEchoue = true;
    expect(() => recalculerEtEcrireB(fictif.repertoire_run, options(), JOUR)).toThrow(/ENOSPC simulé/);
    expect(readdirSync(dirname(cheminDuJour())).sort()).toEqual(["metriques.json"]);
  });

  it("contenu concurrent différent, apparu entre la vérification et l'écriture : RecalculBDejaPublie, fichier concurrent intact", () => {
    concurrent("concurrent\n");
    expect(() => recalculerEtEcrireB(fictif.repertoire_run, options(), JOUR)).toThrow(RecalculBDejaPublie);
    expect(readFileSync(cheminDuJour(), "utf8")).toBe("concurrent\n");
    expect(temporaires(dirname(cheminDuJour()))).toEqual([]);
    rmSync(cheminDuJour());
  });

  it("contenu concurrent identique : RecalculBDejaPublie comme avant (un recalcul daté n'est jamais réécrit), octets inchangés", () => {
    const texte = texteDuJour();
    concurrent(texte);
    expect(() => recalculerEtEcrireB(fictif.repertoire_run, options(), JOUR)).toThrow(RecalculBDejaPublie);
    expect(readFileSync(cheminDuJour(), "utf8")).toBe(texte);
    expect(temporaires(dirname(cheminDuJour()))).toEqual([]);
  });
});
