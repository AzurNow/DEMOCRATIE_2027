/**
 * `schema/run.schema.json` aligné sur le protocole 0.11 — les reports de l'analyse dans le run.
 *
 * - conformité n° 84 : la part de réponses manquantes et le verdict « run incomplet » vivent par
 *   mode de l'outil (`par_mode`), et ne se contredisent jamais ;
 * - conformité n° 80 : un kappa juge-humain (par juge) ou de la paire indéfini est publié absent
 *   avec son motif, jamais comme une valeur ni comme `null` (§7, « comme au §4 »).
 *
 * Chaque cas part de l'exemple valide réel et n'en change qu'un point ; un cas invalide vérifie
 * que TOUTES les erreurs rapportées portent sur le point changé, pas seulement la première.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLE = resolve(import.meta.dirname, "../../schema/exemples/run/valide-01-mensuel-publie.json");

function runValide(): Objet {
  return JSON.parse(readFileSync(EXEMPLE, "utf8")) as Objet;
}

function juge(run: Objet, indice: number): Objet {
  return (run["juges"] as Objet[])[indice] as Objet;
}

function outilAlpha(run: Objet): Objet {
  return ((run["perimetre"] as Objet)["outils"] as Objet[])[0] as Objet;
}

function parMode(run: Objet): Objet {
  return outilAlpha(run)["par_mode"] as Objet;
}

/** Chemins d'instance de toutes les erreurs ; `[]` quand le run est conforme. */
function chemins(run: Objet): readonly string[] {
  const erreur = erreurDeSchema("run", run, "test");
  return erreur === null ? [] : erreur.chemins;
}

/**
 * Vrai si au moins une erreur porte sur `cible` ou sous elle, et si toutes les autres portent sur
 * elle ou sur un de ses ancêtres : ajv rapporte aussi, au chemin de l'objet qui la porte, la
 * conditionnelle (`if`/`then`/`else`) dont la contrainte visée fait partie. Une erreur sur un
 * chemin étranger (une autre branche du run) fait échouer le prédicat.
 */
function toutesSous(cible: string): (liste: readonly string[]) => boolean {
  const sous = (c: string) => c === cible || c.startsWith(`${cible}/`);
  const ancetre = (c: string) => c === "" || cible.startsWith(`${c}/`);
  return (liste) => liste.some(sous) && liste.every((c) => sous(c) || ancetre(c));
}

describe("kappa juge-humain par juge (conformité n° 80, §7 protocole 0.11)", () => {
  it("accepte un kappa défini sans motif", () => {
    expect(chemins(runValide())).toEqual([]);
  });

  it("accepte un kappa indéfini publié absent avec son motif", () => {
    const run = runValide();
    delete juge(run, 1)["kappa_juge_humain"];
    juge(run, 1)["motif_indefini_kappa_juge_humain"] = "accord_attendu_maximal";

    expect(chemins(run)).toEqual([]);
  });

  it("refuse un kappa et un motif d'indéfinition à la fois", () => {
    const run = runValide();
    juge(run, 1)["motif_indefini_kappa_juge_humain"] = "accord_attendu_maximal";

    expect(chemins(run)).toSatisfy(toutesSous("/juges/1"));
  });

  it("refuse, sur un run publié, un juge qui ne déclare ni kappa ni motif", () => {
    const run = runValide();
    delete juge(run, 1)["kappa_juge_humain"];

    expect(chemins(run)).toSatisfy(toutesSous("/juges/1"));
  });

  it("refuse un kappa indéfini écrit null, et un motif hors de celui que le §7 nomme", () => {
    const enNull = runValide();
    juge(enNull, 1)["kappa_juge_humain"] = null;
    expect(chemins(enNull)).toSatisfy(toutesSous("/juges/1"));

    const autreMotif = runValide();
    delete juge(autreMotif, 1)["kappa_juge_humain"];
    juge(autreMotif, 1)["motif_indefini_kappa_juge_humain"] = "aucun_item_commun";
    expect(chemins(autreMotif)).toSatisfy(toutesSous("/juges/1"));
  });
});

describe("kappa de la paire de juges (conformité n° 80, §7 protocole 0.11)", () => {
  it("accepte un kappa défini sans motif", () => {
    expect(runValide()["kappa_paire_juges"]).toBe(0.81);
    expect(chemins(runValide())).toEqual([]);
  });

  it("accepte un kappa indéfini publié absent avec son motif", () => {
    // Conformité du 2026-11-09, n° 1 : un kappa de la paire indéfini ne satisfait pas le seuil de
    // publication (§7, comme au §12) ; le run qui le porte est donc publié provisoire, critère
    // kappa_paire_jeu_or au rouge. Le point vérifié ici reste la forme : absent, avec son motif.
    const run = runValide();
    delete run["kappa_paire_juges"];
    run["motif_indefini_kappa_paire_juges"] = "accord_attendu_maximal";
    const motif = "Critère(s) go/no-go du §12 au rouge : kappa_paire_jeu_or.";
    const go = run["go_no_go"] as { criteres: Objet[] };
    const criteres = go.criteres.map((c) =>
      c["code"] === "kappa_paire_jeu_or" ? { ...c, statut: "rouge", valeur: "kappa de la paire indéfini : accord_attendu_maximal" } : c,
    );
    run["statut"] = "publie_provisoire";
    run["motif_provisoire"] = motif;
    run["go_no_go"] = { criteres, decision: "publie_provisoire", motif };

    expect(chemins(run)).toEqual([]);
  });

  it("refuse un kappa et un motif d'indéfinition à la fois", () => {
    const run = runValide();
    run["motif_indefini_kappa_paire_juges"] = "accord_attendu_maximal";

    expect(chemins(run)).toEqual([""]);
  });

  it("refuse, sur un run publié, une paire sans kappa ni motif", () => {
    const run = runValide();
    delete run["kappa_paire_juges"];

    expect(chemins(run).length).toBeGreaterThan(0);
    expect(chemins(run).every((c) => c === "")).toBe(true);
  });

  it("refuse le null sans motif qu'admettait le schéma d'avant la 0.11", () => {
    const run = runValide();
    run["kappa_paire_juges"] = null;

    expect(chemins(run)).toSatisfy(toutesSous("/kappa_paire_juges"));
  });
});

describe("seuil de réponses manquantes par mode de l'outil (conformité n° 84, §8 protocole 0.11)", () => {
  it("accepte un mode incomplet à 30 % à côté d'un mode comparable à 5 %", () => {
    const run = runValide();
    parMode(run)["web_activee"] = { reponses_manquantes_part: 0.3, run_incomplet: true };
    parMode(run)["web_desactivee"] = { reponses_manquantes_part: 0.05, run_incomplet: false };

    expect(chemins(run)).toEqual([]);
  });

  it("tient 0,20 exactement pour comparable, jamais pour incomplet", () => {
    const pile = runValide();
    parMode(pile)["web_activee"] = { reponses_manquantes_part: 0.2, run_incomplet: false };
    expect(chemins(pile)).toEqual([]);

    const contradictoire = runValide();
    parMode(contradictoire)["web_activee"] = { reponses_manquantes_part: 0.2, run_incomplet: true };
    expect(chemins(contradictoire)).toSatisfy(toutesSous("/perimetre/outils/0/par_mode/web_activee"));
  });

  it("refuse un mode au-delà du seuil déclaré comparable", () => {
    const run = runValide();
    parMode(run)["web_activee"] = { reponses_manquantes_part: 0.3, run_incomplet: false };

    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/outils/0/par_mode/web_activee"));
  });

  it("refuse un mode déclaré sans son entrée, et une entrée pour un mode non déclaré", () => {
    const sansEntree = runValide();
    delete parMode(sansEntree)["web_desactivee"];
    expect(chemins(sansEntree)).toSatisfy(toutesSous("/perimetre/outils/0/par_mode"));

    const modeNonDeclare = runValide();
    outilAlpha(modeNonDeclare)["modes"] = ["web_activee"];
    expect(chemins(modeNonDeclare)).toSatisfy(toutesSous("/perimetre/outils/0/par_mode"));
  });

  it("refuse la part et le verdict agrégés au niveau de l'outil, règle d'avant la 0.11", () => {
    const run = runValide();
    outilAlpha(run)["reponses_manquantes_part"] = 0.03;
    outilAlpha(run)["run_incomplet"] = false;

    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/outils/0"));
  });
});
