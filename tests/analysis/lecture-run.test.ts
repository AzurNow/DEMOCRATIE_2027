/**
 * Lecture d'un run enregistré (`analysis/lecture-run.ts`, lot notation, PR C), cas limites 4 à 9
 * du brief. Chaque cas part du petit run fictif de `tests/notation/run-fictif.ts`, écrit sous un
 * répertoire temporaire, et n'en change qu'une chose.
 */

import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assembler } from "../../analysis/filtre.ts";
import {
  AccordHumainsDivergent,
  AliasCandidatsDivergent,
  dispositionRunNote,
  EmpreinteDivergente,
  FichierDeRunRefuse,
  ItemEpingleIntrouvable,
  ItemsDuGelIllisibles,
  lireNotationsDuRun,
  lireReponses,
  lireRun,
  lireRunJson,
  lireVerdicts,
  ParModeDivergent,
  ParModeHorsPerimetre,
  runDeNotationDe,
  VolumeAbsent,
} from "../../analysis/lecture-run.ts";
import { GitInaccessible } from "../../outils/executer-git.ts";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { requetesDuPlanDuRun } from "../../pipeline/interrogation/plan-du-run.ts";
import { controleCroise } from "../../pipeline/notation/controle-croise.ts";
import { echantillonHumainDuRun, tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import { commiterTout } from "../aides/depot.ts";
import { ecrireJson, ITEM_P, poserRunNote, type RunFictif } from "../notation/run-fictif.ts";

let courant: RunFictif | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

function runNote(): RunFictif {
  courant = poserRunNote();
  return courant;
}

function premier<T>(liste: readonly T[]): T {
  const [element] = liste;
  if (element === undefined) throw new Error("liste vide");
  return element;
}

/** L'erreur levée par `lire`, pour en examiner le type et le message. */
function erreurDe(lire: () => unknown): Error {
  try {
    lire();
  } catch (erreur) {
    if (erreur instanceof Error) return erreur;
    throw erreur;
  }
  throw new Error("aucune erreur levée");
}

function lire(run: RunFictif, archive?: string) {
  return lireRun(run.repertoire_run, {
    items: run.items,
    plan_du_run: requetesDuPlanDuRun,
    echantillon_humain: echantillonHumainDuRun,
    ...(archive === undefined ? {} : { archive }),
  });
}

describe("4. un fichier illisible, invalide ou mal nommé est une erreur qui cite son chemin", () => {
  it("JSON illisible dans verdicts/", () => {
    const run = runNote();
    const chemin = join(dispositionRunNote(run.repertoire_run).verdicts, `${premier(run.verdicts).id}.json`);
    writeFileSync(chemin, "{ pas du JSON");
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(FichierDeRunRefuse);
    expect((erreur as FichierDeRunRefuse).motif).toBe("json_illisible");
    expect(erreur.message).toContain(chemin);
  });

  it("réponse non conforme à son schéma dans volume/reponses/", () => {
    const run = runNote();
    const reponse = premier(run.reponses);
    const chemin = join(dispositionRunNote(run.repertoire_run).reponses, `${reponse.id}.json`);
    const { statut_reponse: _s, ...sansStatut } = reponse;
    writeFileSync(chemin, JSON.stringify(sansStatut));
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ErreurSchema);
    expect(erreur.message).toContain(chemin);
  });

  it("nom de fichier différent de l'id de l'objet", () => {
    const run = runNote();
    const verdicts = dispositionRunNote(run.repertoire_run).verdicts;
    const verdict = premier(run.verdicts);
    const chemin = join(verdicts, "01ZZZZZZZZZZZZZZZZZZZZZZZZ.json");
    copyFileSync(join(verdicts, `${verdict.id}.json`), chemin);
    rmSync(join(verdicts, `${verdict.id}.json`));
    const erreur = erreurDe(() => lire(run));
    expect((erreur as FichierDeRunRefuse).motif).toBe("nom_different_de_l_id");
    expect(erreur.message).toContain(chemin);
  });

  it("un fichier qui n'est pas un objet du dossier n'est pas ignoré", () => {
    const run = runNote();
    const chemin = join(dispositionRunNote(run.repertoire_run).notations, "LISEZMOI.txt");
    writeFileSync(chemin, "?");
    const erreur = erreurDe(() => lireNotationsDuRun(run.repertoire_run, String(run.run["id"])));
    expect((erreur as FichierDeRunRefuse).motif).toBe("fichier_etranger");
    expect(erreur.message).toContain(chemin);
  });

  it("un .partiel laissé dans volume/reponses/ par un arrêt pendant l'écriture est refusé nommément, jamais un SyntaxError sur un JSON tronqué (Lot 8, constat 30 du 2026-10-12)", () => {
    const run = runNote();
    const reponse = premier(run.reponses);
    const chemin = join(dispositionRunNote(run.repertoire_run).reponses, `${reponse.id}.json`);
    writeFileSync(`${chemin}.partiel`, '{"id": "tronque par un arr', "utf8");
    const erreur = erreurDe(() => lireReponses(run.repertoire_run, String(run.run["id"])));
    expect(erreur).not.toBeInstanceOf(SyntaxError);
    expect(erreur).toBeInstanceOf(FichierDeRunRefuse);
    expect((erreur as FichierDeRunRefuse).motif).toBe("fichier_etranger");
    expect(erreur.message).toContain(`${chemin}.partiel`);
  });

  it("une notation du volume qui appartient à un autre run", () => {
    const run = runNote();
    const notation = premier(run.notations);
    const chemin = join(dispositionRunNote(run.repertoire_run).notations, `${notation.id}.json`);
    rmSync(chemin);
    ecrireJson(chemin, { ...notation, run_id: "01ZZZZZZZZZZZZZZZZZZZZZZZZ" });
    const erreur = erreurDe(() => lireNotationsDuRun(run.repertoire_run, String(run.run["id"])));
    expect((erreur as FichierDeRunRefuse).motif).toBe("autre_run");
    expect(erreur.message).toContain(chemin);
  });

  it("§7 (protocole 0.20), D55 (9) : alias_candidats altéré à la relecture ⇒ AliasCandidatsDivergent", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & { alias_candidats: Record<string, string> };
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, alias_candidats: { ...objet.alias_candidats, C1: "candidat-fantome" } });
    const erreur = erreurDe(() => lireRunJson(run.repertoire_run));
    expect(erreur).toBeInstanceOf(AliasCandidatsDivergent);
    expect(erreur.message).toContain(chemin);
  });
});

describe("5. volume absent, volume vide", () => {
  it("volume/ absent : erreur nommée qui dit de reconstituer le volume", () => {
    const run = runNote();
    rmSync(dispositionRunNote(run.repertoire_run).volume, { recursive: true });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(VolumeAbsent);
    expect(erreur.message).toContain("Reconstituer volume/");
  });

  it("volume/ présent sans reponses/ : même erreur, jamais un run sans réponse", () => {
    const run = runNote();
    rmSync(dispositionRunNote(run.repertoire_run).reponses, { recursive: true });
    expect(() => lire(run)).toThrow(VolumeAbsent);
  });

  it("reponses/ présent mais vide, assistant sans par_mode : lu tel quel, puis assembler() décide", () => {
    // Modifié ouvertement (constat 17 de la revue du 2026-10-12) : ce cas portait par_mode (exigé
    // par le schéma d'un run publié) jusqu'à ce que zéro réponse API le rende indécidable (cas
    // suivant). Il isole ici le comportement « volume vide » d'origine en retirant aussi le
    // par_mode déclaré, pour qu'il n'y ait rien à recouper. Modifié ouvertement (§7.30, constat 8
    // de la conformité du 2026-11-01) : pour la même raison, l'accord des humains de l'échantillon,
    // recoupé lui aussi, est retiré avec le go/no-go qui l'exige.
    const run = runNote();
    const reponses = dispositionRunNote(run.repertoire_run).reponses;
    for (const reponse of run.reponses) rmSync(join(reponses, `${reponse.id}.json`));
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const lu = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & { perimetre: { outils: Record<string, unknown>[] } };
    const { accord_humains_echantillon: _a, go_no_go: _g, ...objet } = lu;
    const outils = lu.perimetre.outils.map((outil) => {
      if (outil["outil_id"] !== "outil-alpha") return outil;
      const { par_mode: _p, ...sansParMode } = outil;
      return sansParMode;
    });
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, statut: "en_cours", perimetre: { ...lu.perimetre, outils } });
    const { entrees } = lire(run);
    expect(entrees.reponses).toEqual([]);
    expect(entrees.verdicts).toHaveLength(2);
    expect(() => assembler(entrees)).toThrow(/réponse notée introuvable/);
  });

  it("reponses/ vide, par_mode toujours déclaré : constat 17, le par_mode écrit ne concorde plus", () => {
    // Un run publié qui déclare par_mode mais dont il ne reste aucune réponse API n'est plus « lu
    // tel quel » : la recoupe de D55 (7) refuse avant d'y arriver. Modifié ouvertement (protocole
    // 0.21, D56 (2)) : ce cas attendait « pas décidable », faute de réponse enregistrée ; la part
    // se compte désormais sur le plan d'interrogation (12 requêtes), elle vaut 12/12 et contredit
    // le 10/12 écrit — refus nommé, plus spécifique que le message d'avant.
    const run = runNote();
    const reponses = dispositionRunNote(run.repertoire_run).reponses;
    for (const reponse of run.reponses) rmSync(join(reponses, `${reponse.id}.json`));
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ParModeDivergent);
    expect(erreur.message).toContain('"reponses_manquantes_part":1');
  });
});

describe("10. par_mode recoupé à la lecture (constat 17, D55 (7))", () => {
  function remplacerParModeAlpha(run: RunFictif, par_mode: Record<string, unknown>): void {
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & { perimetre: { outils: Record<string, unknown>[] } };
    const outils = objet.perimetre.outils.map((outil) => (outil["outil_id"] === "outil-alpha" ? { ...outil, par_mode } : outil));
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, perimetre: { ...objet.perimetre, outils } });
  }

  it("un par_mode concordant avec les réponses passe", () => {
    const run = runNote();
    expect(() => lire(run)).not.toThrow();
  });

  it("protocole 0.21 : un par_mode compté sur les seules réponses enregistrées (0 manquante sur 2) contredit le plan (10 sur 12) : refus nommé", () => {
    const run = runNote();
    remplacerParModeAlpha(run, { web_desactivee: { reponses_manquantes_part: 0, run_incomplet: false } });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ParModeDivergent);
    expect(erreur.message).toContain(JSON.stringify({ reponses_manquantes_part: 10 / 12, run_incomplet: true }));
  });

  it("un par_mode qui contredit les réponses lève une erreur nommée", () => {
    const run = runNote();
    remplacerParModeAlpha(run, { web_desactivee: { reponses_manquantes_part: 0.3, run_incomplet: true } });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ParModeDivergent);
    expect(erreur.message).toContain("outil-alpha");
    expect(erreur.message).toContain("web_desactivee");
  });

  it("un par_mode écrit pour un outil sans couple déclaré (comparateur) : refus nommé, jamais un recalcul vide par défaut", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & { perimetre: { outils: Record<string, unknown>[] } };
    const par_mode = { web_desactivee: { reponses_manquantes_part: 0, run_incomplet: false } };
    const outils = objet.perimetre.outils.map((outil) =>
      outil["famille"] === "comparateur" ? { ...outil, modes: ["web_desactivee"], par_mode } : outil,
    );
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, perimetre: { ...objet.perimetre, outils } });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ParModeHorsPerimetre);
    expect(erreur.message).toContain("comparateur-gamma");
  });

  it("un run sans par_mode (en cours) n'est pas une erreur de lireRun", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown> & { perimetre: { outils: Record<string, unknown>[] } };
    const outils = objet.perimetre.outils.map((outil) => {
      if (outil["outil_id"] !== "outil-alpha") return outil;
      const { par_mode: _p, ...sansParMode } = outil;
      return sansParMode;
    });
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, statut: "en_cours", perimetre: { ...objet.perimetre, outils } });
    expect(() => lire(run)).not.toThrow();
  });
});

describe("§7.30 : accord_humains_echantillon recoupé à la lecture, comme par_mode", () => {
  function poserAccord(run: RunFictif, accord: Record<string, unknown>): void {
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
    rmSync(chemin);
    ecrireJson(chemin, { ...objet, accord_humains_echantillon: accord });
  }

  it("le run fictif a des réponses doublement notées dans son échantillon (le recoupement porte sur quelque chose)", () => {
    const run = runNote();
    const lu = lireRunJson(run.repertoire_run);
    const echantillon = tirerEchantillonHumain(run.reponses.map((r) => r.id), lu.graines.echantillon_humain, lu.taux_echantillon_humain);
    expect(echantillon.length).toBeGreaterThan(0);
  });

  it("un accord concordant avec l'échantillon rejoué et les notations passe", () => {
    const run = runNote();
    // Les deux humains du run fictif notent à l'identique chaque réponse de son échantillon.
    // Une seule réponse doublement notée : une seule catégorie, kappa des deux humains indéfini (D58).
    poserAccord(run, { reponses_doublement_notees: 1, accords: 1, part: 1, motif_indefini_kappa: "accord_attendu_maximal" });
    expect(() => lire(run)).not.toThrow();
  });

  it("D58 : un kappa des deux humains écrit qui contredit le recalcul (1 au lieu d'absent) : AccordHumainsDivergent", () => {
    const run = runNote();
    poserAccord(run, { reponses_doublement_notees: 1, accords: 1, part: 1, kappa: 1 });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(AccordHumainsDivergent);
    expect(erreur.message).toContain('"motif_indefini_kappa":"accord_attendu_maximal"');
  });

  it("un accord qui contredit les notations lève AccordHumainsDivergent, avec l'écrit et le recalcul", () => {
    const run = runNote();
    poserAccord(run, { reponses_doublement_notees: 1, accords: 0, part: 0, kappa: 0 });
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(AccordHumainsDivergent);
    expect(erreur.message).toContain('"accords":0');
    expect(erreur.message).toContain('"accords":1');
  });

  it("une part indéfinie écrite alors que des réponses sont doublement notées : AccordHumainsDivergent", () => {
    const run = runNote();
    poserAccord(run, { reponses_doublement_notees: 0, accords: 0, motif_indefini_kappa: "aucune_reponse_comparable" });
    expect(() => lire(run)).toThrow(AccordHumainsDivergent);
  });

  it("un run sans accord_humains_echantillon (en cours, sans go/no-go) n'est pas recoupé", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).run_json;
    const objet = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
    const { accord_humains_echantillon: _a, go_no_go: _g, ...sansGoNoGo } = objet;
    rmSync(chemin);
    ecrireJson(chemin, { ...sansGoNoGo, statut: "en_cours" });
    expect(() => lire(run)).not.toThrow();
  });
});

describe("6. items à la version épinglée, au commit du gel", () => {
  it("data/items modifié après le gel : la version épinglée est lue, pas la version courante", () => {
    const run = runNote();
    ecrireJson(join(run.items, `${ITEM_P.id}.json`), { ...ITEM_P, version: 2 });
    commiterTout(run.bac, "correction après le gel");
    const { entrees } = lire(run);
    expect(entrees.items.find((i) => i.id === ITEM_P.id)?.version).toBe(1);
  });

  it("une version épinglée absente du commit du gel : erreur, même si la version courante est celle-là", () => {
    const run = runNote();
    ecrireJson(join(run.items, `${ITEM_P.id}.json`), { ...ITEM_P, version: 2 });
    commiterTout(run.bac, "correction après le gel");
    const chemin = dispositionRunNote(run.repertoire_run).questions;
    const questions = JSON.parse(readFileSync(chemin, "utf8")) as { items: { reference: { item_id: string; item_version: number } }[] }[];
    for (const question of questions) {
      for (const entree of question.items) if (entree.reference.item_id === ITEM_P.id) entree.reference.item_version = 2;
    }
    ecrireJson(chemin, questions);
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(ItemEpingleIntrouvable);
    expect(erreur.message).toContain(ITEM_P.id);
    expect(erreur.message).toContain("version 2");
  });

  it("un item épinglé absent du commit du gel : erreur", () => {
    const run = runNote();
    const chemin = dispositionRunNote(run.repertoire_run).questions;
    const questions = JSON.parse(readFileSync(chemin, "utf8")) as { items: { reference: { item_id: string } }[] }[];
    for (const question of questions) {
      for (const entree of question.items) if (entree.reference.item_id === ITEM_P.id) entree.reference.item_id = "01ZZZZZZZZZZZZZZZZZZZZZZZZ";
    }
    ecrireJson(chemin, questions);
    expect(() => lire(run)).toThrow(ItemEpingleIntrouvable);
  });

  it("répertoire d'items inexistant : ItemsDuGelIllisibles nommé, jamais GitInaccessible ni TypeError (constat 37 de la revue du 2026-10-12)", () => {
    const run = runNote();
    const erreur = erreurDe(() => lireRun(run.repertoire_run, { items: "/nulle-part-xyz", plan_du_run: requetesDuPlanDuRun, echantillon_humain: echantillonHumainDuRun }));
    expect(erreur).toBeInstanceOf(ItemsDuGelIllisibles);
    expect(erreur.message).not.toContain("git introuvable");
    expect(erreur.message).toMatch(/inexistant/);
  });

  it("git absent du PATH, répertoire d'items existant : GitInaccessible, pas une TypeError (constat 37 de la revue du 2026-10-12)", () => {
    const run = runNote();
    const avant = process.env["PATH"];
    process.env["PATH"] = "";
    try {
      expect(() => lire(run)).toThrow(GitInaccessible);
    } finally {
      process.env["PATH"] = avant;
    }
  });
});

describe("7. empreinte du tirage", () => {
  it("tirage.json modifié d'un octet : erreur dure", () => {
    const run = runNote();
    appendFileSync(join(run.repertoire_run, "tirage.json"), " ");
    const erreur = erreurDe(() => lire(run));
    expect(erreur).toBeInstanceOf(EmpreinteDivergente);
    expect(erreur.message).toContain("tirage.json");
  });
});

describe("8. archive Zenodo", () => {
  const NOM = "reponses-brutes-2026-12-01.tar.zst";

  function declarerArchive(run: RunFictif, contenu: string): string {
    const chemin = join(run.bac, NOM);
    writeFileSync(chemin, contenu);
    const sha256 = createHash("sha256").update(contenu).digest("hex");
    const depot = run.run["depot"] as { archives: { nom: string; sha256: string }[] };
    const archives = depot.archives.map((a) => (a.nom === NOM ? { ...a, sha256 } : a));
    ecrireJson(dispositionRunNote(run.repertoire_run).run_json, { ...run.run, depot: { ...depot, archives } });
    return chemin;
  }

  it("non fournie : le résultat dit « non_verifiee », explicitement", () => {
    expect(lire(runNote()).archive).toEqual({ statut: "non_verifiee" });
  });

  it("fournie, empreinte conforme : vérifiée", () => {
    const run = runNote();
    const chemin = declarerArchive(run, "archive de test");
    expect(lire(run, chemin).archive).toEqual({ statut: "verifiee", nom: NOM, sha256: createHash("sha256").update("archive de test").digest("hex") });
  });

  it("fournie, empreinte fausse : erreur", () => {
    const run = runNote();
    const chemin = declarerArchive(run, "archive de test");
    writeFileSync(chemin, "archive altérée");
    expect(() => lire(run, chemin)).toThrow(EmpreinteDivergente);
  });
});

describe("9. aller-retour : écrire, relire, assembler", () => {
  it("assembler() rend une unité par réponse obtenue, et le contrôle croisé ne voit rien", () => {
    const run = runNote();
    const { entrees, archive } = lire(run);
    expect(archive.statut).toBe("non_verifiee");
    expect(entrees.questions.length).toBeGreaterThan(2);
    const unites = assembler(entrees);
    expect(unites.map((u) => u.reponse_id).sort()).toEqual(run.reponses.map((r) => r.id).sort());
    expect(unites.map((u) => u.verdict_id).sort()).toEqual(run.verdicts.map((v) => v.id).sort());
    expect(unites.filter((u) => u.dans_echantillon_humain)).toHaveLength(1);

    const runLu = lireRunJson(run.repertoire_run);
    const { notations, reponses_contrefactuelles } = lireNotationsDuRun(run.repertoire_run, runLu.id);
    expect(notations).toHaveLength(run.notations.length);
    expect(reponses_contrefactuelles.map((r) => r.id)).toEqual([run.contrefactuelle.id]);
    const violations = controleCroise({
      run: runDeNotationDe(runLu),
      reponses_obtenues: entrees.reponses.map((r) => r.id),
      refus_api: [],
      // Une réponse sans projection n'a pas de texte : le contrôle lève s'il en a besoin.
      textes: new Map(entrees.reponses.flatMap((r) => (r.normalise === undefined ? [] : [[r.id, r.normalise.texte] as const]))),
      notations,
      verdicts: lireVerdicts(run.repertoire_run, runLu.id),
    });
    expect(violations).toEqual([]);
  });
});
