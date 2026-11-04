/**
 * `pnpm go-no-go` lit `runs/<date>/metriques/metriques.json` (`pnpm analyze`, sous-lot A) à travers
 * son schéma : les graines publiées pour le critère du §12 « analyses préenregistrées exécutées avec
 * la graine publiée », et les sections de robustesse pour la case 7 de l'annexe F (« robustesse
 * calculée »). Une section de robustesse `sans_objet`, quel qu'en soit le motif, ne rend jamais la
 * case faite : le motif le dit. Et l'enchaînement analyze → go-no-go → analyze ne fait pas
 * refuser la seconde analyse (l'empreinte de `run.json` ignore ce que le go/no-go y écrit).
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { analyserRun, cheminMetriques } from "../../analysis/analyse-du-run.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { constatRobustesseCalculee, construireChecklist, type Constat } from "../../pipeline/go-no-go/checklist.ts";
import { critereAnalysesExecutees } from "../../pipeline/go-no-go/criteres-run.ts";
import { goNoGo } from "../../pipeline/go-no-go/go-no-go.ts";
import { lireMetriques, MetriquesDUnAutreRun, MetriquesSansFichier, type MetriquesLues, type RobustesseLue } from "../../pipeline/go-no-go/metriques.ts";
import { CODES_CRITERES } from "../../pipeline/go-no-go/types.ts";
import { executerOutil } from "../aides/depot.ts";
import { entreesDuRunAnalysable, SPEC_REFERENCE } from "../analysis/run-analysable.ts";
import { ulid } from "../analysis/fabriques.ts";
import { poserLecturesNonAffichees, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";

const PARAMETRES = { reechantillonnages: 20, permutations: 20 };
const TEMPS = 120_000;

const entrees = entreesDuRunAnalysable(SPEC_REFERENCE);
const DOCUMENT = analyserRun(entrees, PARAMETRES, null) as { readonly run_id: string; readonly graines: readonly { cle: string[]; graine: string }[] } & Record<string, unknown>;
const GRAINES_DU_RUN = { bootstrap: entrees.run.graines.bootstrap.valeur, permutation: entrees.run.graines.permutation.valeur };

const temporaires: string[] = [];
const fictifs: RunFictif[] = [];

afterEach(() => {
  for (const chemin of temporaires.splice(0)) rmSync(chemin, { recursive: true, force: true });
  for (const fictif of fictifs.splice(0)) fictif.nettoyer();
});

function repertoireAvec(document: unknown): string {
  const repertoire = mkdtempSync(join(tmpdir(), "banc-go-no-go-metriques-"));
  temporaires.push(repertoire);
  if (document !== undefined) {
    mkdirSync(join(repertoire, "metriques"));
    writeFileSync(cheminMetriques(repertoire), `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
  return repertoire;
}

/** `metriques.json` lu dans un répertoire où il a été écrit : `null` y serait une erreur du test. */
function lirePresentes(repertoire: string): MetriquesLues {
  const lues = lireMetriques(repertoire, DOCUMENT.run_id);
  if (lues === null) throw new Error(`${cheminMetriques(repertoire)} écrit, mais lu comme absent.`);
  return lues;
}

const CALCULEE = { statut: "calcule" } as const;

describe("go/no-go : lecture de metriques.json", () => {
  it("metriques/ absent : aucune lecture (null), le critère des analyses reste rouge comme avant", () => {
    const repertoire = repertoireAvec(undefined);
    expect(lireMetriques(repertoire, DOCUMENT.run_id)).toBeNull();
    expect(critereAnalysesExecutees(null, GRAINES_DU_RUN)).toMatchObject({ statut: "rouge", valeur: "métriques absentes (runs/<date>/metriques/)" });
  });

  it("metriques.json présent et valide : le go/no-go en lit les graines, conformes à la graine publiée (critère vert)", () => {
    const lues = lirePresentes(repertoireAvec(DOCUMENT));
    expect(lues.graines).toEqual(DOCUMENT.graines);
    expect(lues.graines.length).toBeGreaterThan(0);
    expect(critereAnalysesExecutees(lues.graines, GRAINES_DU_RUN)).toMatchObject({ statut: "vert" });
    expect(lues.robustesse).toEqual({ taux: { statut: "calcule" }, differences: { statut: "calcule" } });
  });

  it("une graine altérée dans metriques.json : le critère passe au rouge", () => {
    const [premiere, ...autres] = DOCUMENT.graines;
    if (premiere === undefined) throw new Error("le run analysable publie au moins une graine");
    const altere = { ...DOCUMENT, graines: [{ ...premiere, graine: premiere.graine === "0".repeat(16) ? "1".repeat(16) : "0".repeat(16) }, ...autres] };
    const lues = lirePresentes(repertoireAvec(altere));
    expect(critereAnalysesExecutees(lues.graines, GRAINES_DU_RUN)).toMatchObject({ statut: "rouge", valeur: "1 résultat(s) sans la graine publiée" });
  });

  it("metriques.json non conforme à son schéma : refus ErreurSchema qui nomme le fichier", () => {
    const { graines: _graines, ...sansGraines } = DOCUMENT;
    const repertoire = repertoireAvec(sansGraines);
    expect(() => lireMetriques(repertoire, DOCUMENT.run_id)).toThrow(ErreurSchema);
    expect(() => lireMetriques(repertoire, DOCUMENT.run_id)).toThrow(cheminMetriques(repertoire));
  });

  it("metriques/ présent sans metriques.json : refus MetriquesSansFichier, jamais lu comme « absent »", () => {
    const repertoire = repertoireAvec(undefined);
    mkdirSync(join(repertoire, "metriques"));
    expect(() => lireMetriques(repertoire, DOCUMENT.run_id)).toThrow(MetriquesSansFichier);
  });

  it("metriques.json d'un autre run : refus MetriquesDUnAutreRun", () => {
    const repertoire = repertoireAvec(DOCUMENT);
    expect(() => lireMetriques(repertoire, ulid("un-autre-run"))).toThrow(MetriquesDUnAutreRun);
  });
});

describe("case 7 de l'annexe F : « robustesse calculée »", () => {
  function caseSept(constat: Constat) {
    const criteres = CODES_CRITERES.map((code) => ({ code, statut: "vert" as const, valeur: 0, seuil: 0 }));
    const autres = (["items_absence_reverifies", "graine_du_tirage_enregistree", "interrogation_dans_la_fenetre", "notation_complete"] as const).map((nom) => ({ nom, fait: true, detail: "" }));
    return construireChecklist(ulid("run-robustesse"), criteres, [...autres, constat]).cases.find((c) => c.rang === 7);
  }

  it("robustesse des différences sans objet : non faite, et le motif le dit explicitement", () => {
    const constat = constatRobustesseCalculee({ taux: CALCULEE, differences: { statut: "sans_objet", motif: "aucun_couple_compare" } });
    expect(constat).toEqual({ nom: "robustesse_calculee", fait: false, detail: "robustesse des différences non calculée (aucun_couple_compare)" });
    expect(caseSept(constat)).toMatchObject({ etat: "non_faite", motif: "robustesse des différences non calculée (aucun_couple_compare)." });
  });

  it("taux de robustesse sans objet : non faite, motif nommé ; les deux manques sont dits ensemble", () => {
    const robustesse: RobustesseLue = { taux: { statut: "sans_objet", motif: "aucun_couple_compare" }, differences: { statut: "sans_objet", motif: "aucun_couple_compare" } };
    expect(constatRobustesseCalculee(robustesse)).toEqual({
      nom: "robustesse_calculee",
      fait: false,
      detail: "robustesse des taux non calculée (aucun_couple_compare) ; robustesse des différences non calculée (aucun_couple_compare)",
    });
  });

  it("metriques.json absent : non faite, le motif nomme le fichier absent", () => {
    expect(constatRobustesseCalculee(null)).toEqual({ nom: "robustesse_calculee", fait: false, detail: "robustesse : runs/<date>/metriques/metriques.json absent (pnpm analyze)" });
  });

  it("les deux sections calculées : faite (aucun défaut silencieux dans l'autre sens)", () => {
    expect(constatRobustesseCalculee({ taux: CALCULEE, differences: CALCULEE })).toEqual({ nom: "robustesse_calculee", fait: true, detail: "" });
  });
});

/** Le run fictif de `tests/notation/run-fictif.ts`, ramené à l'état d'avant tout go/no-go : statut en cours, sans rien de ce que le go/no-go ou la publication écrivent. */
function runAvantGoNoGo(): RunFictif {
  const fictif = poserRunNote();
  poserLecturesNonAffichees(fictif);
  fictifs.push(fictif);
  const chemin = join(fictif.repertoire_run, "run.json");
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & {
    juges: Record<string, unknown>[];
    perimetre: { outils: Record<string, unknown>[] };
  };
  const retires = new Set([
    "go_no_go",
    "motif_provisoire",
    "indeterminees_echantillon_humain",
    "non_classees_echantillon_humain",
    "renvois_attribution_indecidable",
    "refus_api_echantillon_humain",
    "accord_humains_echantillon",
    "publication",
    "depot",
    "contestations_posterieures",
  ]);
  const deJuge = new Set(["kappa_echantillon_humain", "motif_indefini_kappa_echantillon_humain", "renvois_ecartes_kappa_echantillon"]);
  const avant = {
    ...Object.fromEntries(Object.entries(brut).filter(([cle]) => !retires.has(cle))),
    statut: "en_cours",
    juges: brut.juges.map((juge) => Object.fromEntries(Object.entries(juge).filter(([cle]) => !deJuge.has(cle)))),
    perimetre: { ...brut.perimetre, outils: brut.perimetre.outils.map((outil) => Object.fromEntries(Object.entries(outil).filter(([cle]) => cle !== "par_mode"))) },
  };
  writeFileSync(chemin, `${JSON.stringify(avant, null, 2)}\n`, "utf8");
  return fictif;
}

describe("analyze → go-no-go → analyze, sur un run écrit sur disque", () => {
  it(
    "la seconde analyse ne refuse pas le run (code 0, inchangé) ; le go/no-go a lu metriques.json et dit la robustesse non calculée",
    () => {
      const fictif = runAvantGoNoGo();
      const run = fictif.repertoire_run;
      const premiere = executerOutil("analyze.ts", [run]);
      expect(premiere.erreur).toBe("");
      expect(premiere.status).toBe(0);
      expect(existsSync(cheminMetriques(run))).toBe(true);
      const octets = readFileSync(cheminMetriques(run), "utf8");

      const resultat = goNoGo(run);
      expect(resultat.run_json).toBe("ecrit");
      const analyses = resultat.go_no_go.criteres.find((c) => c.code === "analyses_preenregistrees_executees");
      // Le seul couple du run fictif est incomplet ; seules les deux graines de son comparateur inclus
      // (couverture et exactitude, §8) sont publiées, et le go/no-go les retrouve depuis la graine du run.
      expect(analyses).toMatchObject({ statut: "vert", valeur: "graine publiée" });
      expect(resultat.checklist.cases.find((c) => c.rang === 7)?.motif).toContain("robustesse des différences non calculée");

      const seconde = executerOutil("analyze.ts", [run]);
      expect(seconde.erreur).toBe("");
      expect(seconde.status).toBe(0);
      expect(seconde.sortie).toContain("inchangé");
      expect(readFileSync(cheminMetriques(run), "utf8")).toBe(octets);
    },
    TEMPS,
  );
});
