/**
 * `pnpm symmetry` en ligne de commande (revue du 2026-09-23, constats 2 et 9), cas limite 7 du
 * brief : la barrière bloquante ne sort plus en succès sans avoir contrôlé l'invariant « item F ⇒
 * mesure fictive », lit `--items` comme un répertoire (la disposition de `data/items/`), et
 * confronte chaque fichier lu à son schéma. Lot mesures-validees (décision D38) : `--mesures` est lu
 * de même, comme un répertoire, la disposition de `data/mesures/`.
 *
 * Le jeu nominal est le plus petit qui rende la symétrie verte : un candidat comparé, une
 * question sur un item P et une sur un item F. Chaque objet est complété jusqu'à la conformité à
 * son schéma ; le run part de l'exemple valide de `schema/exemples/`, seul son périmètre change.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { engendrer } from "../pipeline/questions/engendrement.ts";
import { entreesPour } from "../pipeline/questions/entrees-tirage.ts";
import type { CandidatNomme, Item, Mesure, Question, RunAuGel, Tirage } from "../pipeline/questions/types.ts";
import { valider } from "../outils/schemas/valider.ts";
import { GRILLE_TOUT_VRAI } from "./aides/fabriques.ts";
import { commiterTout, head, initialiserDepot } from "./aides/depot.ts";
import { completer, graine, identifiant, itemF, itemP, mesure, quotas } from "./questions/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");
const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDAT = "demo-alpha";

const HISTORIQUE = [
  { date: "2026-09-03T10:00:00+02:00", changement: "création", commit: "a".repeat(40), version_resultante: 1 },
];

const FICTIVITE = {
  origine_fictive: "Mesure inventée pour les tests, sans auteur réel.",
  verification_fictivite: {
    date: "2026-11-15T11:00:00+01:00",
    corpus_verifies: [CANDIDAT],
    operateur: "a2",
    resultat: "aucune_occurrence",
  },
};

function validation(annotateur_id: string) {
  return {
    annotateur_id,
    decision: "accepter",
    date: "2026-09-20T10:00:00+02:00",
    lot_id: "lot-003",
    reponses_grille: GRILLE_TOUT_VRAI,
  };
}

/** Un item des fabriques de questions, complété de ce que `item.schema.json` exige d'un item vérifié. */
function conforme(item: Item): Item {
  return { ...item, validations: [validation("a1"), validation("a2")], historique: HISTORIQUE };
}

const MESURE_P = { ...mesure({ cle: "cli-p", libelle: "tarif de base" }), historique: HISTORIQUE };
const MESURE_F = {
  ...mesure({ cle: "cli-f", libelle: "prime aux marcheurs", fictive: true }),
  ...FICTIVITE,
  historique: HISTORIQUE,
};

const ITEM_P = conforme(itemP({ cle: "cli-p", candidat_id: CANDIDAT, mesure: MESURE_P }));
const ITEM_F = conforme(itemF({ cle: "cli-f", candidat_id: CANDIDAT, mesure: MESURE_F }));

function choisir(questions: readonly Question[], item: Item, gabarit: string): Question {
  const trouvee = questions.find((question) => question.grappe_id === item.id && question.gabarit === gabarit);
  if (trouvee === undefined) throw new Error(`Question ${gabarit} absente pour l'item ${item.id}.`);
  return trouvee;
}

interface Jeu {
  readonly tirage: Tirage;
  readonly questions: readonly Question[];
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  readonly run: Record<string, unknown>;
}

function jeuNominal(): Jeu {
  const items = [ITEM_P, ITEM_F];
  const mesures = [MESURE_P, MESURE_F];
  const exempleRun = JSON.parse(
    readFileSync(join(RACINE, "schema/exemples/run/valide-01-mensuel-publie.json"), "utf8"),
  ) as Record<string, unknown> & { perimetre: { candidats: Record<string, unknown>[] } };
  const candidatExemple = exempleRun.perimetre.candidats[0] as Record<string, unknown>;
  const candidatDuRun = { ...candidatExemple, candidat_id: CANDIDAT };
  const run = {
    ...exempleRun,
    id: identifiant("run:cli"),
    date_gel: GEL,
    perimetre: { ...exempleRun.perimetre, candidats: [candidatDuRun] },
  };
  // Le libellé qui remplit [candidat] est celui du périmètre du run écrit sur disque.
  const engendrees = engendrer(items, mesures, [candidatDuRun as unknown as CandidatNomme]).map(completer);
  const tirees = [choisir(engendrees, ITEM_P, "Q-DIR"), choisir(engendrees, ITEM_F, "Q-ORI")];
  return {
    tirage: {
      run_id: identifiant("run:cli"),
      date_gel: GEL,
      graine_tirage: graine(),
      // Conformité n° 59 : un tirage porte ses quotas.
      parametres: quotas(),
      entrees: entreesPour(tirees, items, mesures, run as unknown as RunAuGel),
      exclusions: [],
      contestes_au_gel: [],
      bilan_reprise: [],
      compensations: [],
    },
    // Modifié ouvertement (protocole 0.13, §5) : `--questions` reçoit le jeu complet des questions
    // engendrées au gel, et non plus les seules questions tirées, que la barrière refuse désormais.
    questions: engendrees,
    items,
    mesures,
    run,
  };
}

let racine: string;

beforeEach(() => {
  racine = mkdtempSync(join(tmpdir(), "banc-essai-symmetry-"));
});

afterEach(() => {
  rmSync(racine, { recursive: true, force: true });
});

function ecrireJson(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`, "utf8");
}

type Options = Readonly<Record<"tirage" | "questions" | "items" | "mesures" | "run", string>>;

/**
 * Écrit le jeu sur disque, un fichier par item dans `items/` et par mesure dans `mesures/`, et rend
 * les cinq options. Conformité
 * n° 9 : le bac est un dépôt Git, les items y sont commités, et le run inscrit ce commit comme
 * `versions.donnees_commit`, le commit des données lu au gel. `gel` remplace ce commit.
 */
function poser(jeu: Jeu, gel?: (commit: string) => string | undefined): Options {
  const repertoireItems = join(racine, "items");
  mkdirSync(repertoireItems, { recursive: true });
  for (const item of jeu.items) ecrireJson(join(repertoireItems, `${item.id}.json`), item);
  const repertoireMesures = join(racine, "mesures");
  mkdirSync(repertoireMesures, { recursive: true });
  for (const referent of jeu.mesures) ecrireJson(join(repertoireMesures, `${referent.id}.json`), referent);
  initialiserDepot(racine);
  const commit = head(racine);
  const donnees_commit = gel === undefined ? commit : gel(commit);
  const versions = { ...(jeu.run["versions"] as Record<string, unknown>) };
  if (donnees_commit === undefined) delete versions["donnees_commit"];
  else versions["donnees_commit"] = donnees_commit;
  ecrireJson(join(racine, "tirage.json"), jeu.tirage);
  ecrireJson(join(racine, "questions.json"), jeu.questions);
  ecrireJson(join(racine, "run.json"), { ...jeu.run, versions });
  return {
    tirage: join(racine, "tirage.json"),
    questions: join(racine, "questions.json"),
    items: repertoireItems,
    mesures: repertoireMesures,
    run: join(racine, "run.json"),
  };
}

function symmetry(options: Partial<Options>) {
  const arguments_ = Object.entries(options).map(([cle, valeur]) => `--${cle}=${valeur}`);
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(RACINE, "outils/symmetry.ts"), ...arguments_],
    { encoding: "utf8" },
  );
  return { status: resultat.status, sortie: resultat.stdout, erreur: resultat.stderr };
}

function sans(options: Options, cle: keyof Options): Partial<Options> {
  const { [cle]: _retiree, ...reste } = options;
  return reste;
}

describe("7. pnpm symmetry", () => {
  it("le jeu nominal est conforme à ses schémas (sinon les cas ci-dessous ne prouveraient rien)", () => {
    const jeu = jeuNominal();
    expect(() => valider("tirage", jeu.tirage, "tirage")).not.toThrow();
    expect(() => valider("run", jeu.run, "run")).not.toThrow();
    for (const question of jeu.questions) expect(() => valider("question", question, question.id)).not.toThrow();
    for (const item of jeu.items) expect(() => valider("item", item, item.id)).not.toThrow();
    for (const referent of jeu.mesures) expect(() => valider("mesure", referent, referent.id)).not.toThrow();
  });

  it("un fichier d'entrée illisible est nommé dans l'erreur (revue du 2026-10-12, constat 33)", () => {
    const chemins = poser(jeuNominal());
    writeFileSync(chemins.tirage, "{ pas du JSON", "utf8");
    const resultat = symmetry(chemins);
    expect(resultat.status).not.toBe(0);
    expect(resultat.erreur).toContain(`${chemins.tirage} : JSON illisible`);
  });

  it("cas nominal : contrôles verts, code 0", () => {
    const resultat = symmetry(poser(jeuNominal()));
    expect(resultat.status).toBe(0);
    expect(resultat.erreur).not.toContain("Le run ne peut pas être lancé");
    expect(resultat.sortie).toContain("statut global : vert");
    expect(resultat.sortie).toContain("aucune violation");
    expect(resultat.sortie).not.toContain("non contrôlé");
  });

  it("protocole 0.13, §5 : --questions réduit aux questions tirées : code 1, refus nommé", () => {
    const jeu = jeuNominal();
    const tirees = jeu.questions.filter((question) =>
      jeu.tirage.entrees.some((entree) => entree.question_id === question.id),
    );
    expect(tirees.length).toBeLessThan(jeu.questions.length);
    const resultat = symmetry(poser({ ...jeu, questions: tirees }));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("JeuDeQuestionsIncomplet");
    for (const question of jeu.questions.filter((candidate) => !tirees.includes(candidate))) {
      expect(resultat.erreur).toContain(question.id);
    }
    expect(resultat.sortie).not.toContain("Contrôles verts");
    expect(resultat.sortie).not.toContain("statut global");
  });

  it("sans --mesures : code 1, et le message nomme l'invariant qui ne serait pas contrôlé", () => {
    const resultat = symmetry(sans(poser(jeuNominal()), "mesures"));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("--mesures est obligatoire");
    expect(resultat.erreur).toContain("item F ⇒ mesure fictive");
  });

  it("--items vers un répertoire vide : code 1", () => {
    const options = poser(jeuNominal());
    const vide = join(racine, "vide");
    mkdirSync(vide);
    const resultat = symmetry({ ...options, items: vide });
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${vide} : aucun fichier d'item`);
  });

  it("cas 10 : --mesures vers un répertoire vide : code 1", () => {
    const options = poser(jeuNominal());
    const vide = join(racine, "mesures-vides");
    mkdirSync(vide);
    const resultat = symmetry({ ...options, mesures: vide });
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${vide} : aucun fichier de mesure`);
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("cas 10 : --mesures vers un répertoire absent : code 1", () => {
    const options = poser(jeuNominal());
    const absent = join(racine, "mesures-absentes");
    const resultat = symmetry({ ...options, mesures: absent });
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${absent} : répertoire absent`);
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("cas 10 : --mesures vers un tableau JSON (l'ancien format) : code 1, un seul chemin d'entrée", () => {
    const jeu = jeuNominal();
    const options = poser(jeu);
    const tableau = join(racine, "mesures.json");
    ecrireJson(tableau, jeu.mesures);
    const resultat = symmetry({ ...options, mesures: tableau });
    expect(resultat.status).toBe(1);
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("un fichier de mesure non conforme à son schéma : code 1, fichier nommé", () => {
    const options = poser(jeuNominal());
    const fichier = join(options.mesures, `${MESURE_P.id}.json`);
    ecrireJson(fichier, { ...MESURE_P, version: 0 });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(fichier);
    expect(resultat.erreur).toContain("« mesure »");
  });

  it("cas 10 : un item F dont la mesure n'est pas fictive : code 1, violation nommée", () => {
    const jeu = jeuNominal();
    const { origine_fictive: _o, verification_fictivite: _v, ...socle } = MESURE_F;
    const nonFictive = { ...socle, fictive: false };
    const resultat = symmetry(poser({ ...jeu, mesures: [MESURE_P, nonFictive] }));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(ITEM_F.id);
    expect(resultat.erreur).toContain("fictive=false");
  });

  it("§5 (0.9) : un second item F vérifié sur la mesure fictive : code 1, mesure et items nommés", () => {
    const jeu = jeuNominal();
    const second = conforme(itemF({ cle: "cli-f2", candidat_id: CANDIDAT, mesure: MESURE_F }));
    const resultat = symmetry(poser({ ...jeu, items: [...jeu.items, second] }));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("une mesure fictive porte un seul item fictif");
    expect(resultat.erreur).toContain(MESURE_F.id);
    expect(resultat.erreur).toContain(second.id);
  });

  it("un fichier d'item non conforme à son schéma : code 1, fichier nommé", () => {
    const options = poser(jeuNominal());
    const fichier = join(options.items, `${ITEM_P.id}.json`);
    ecrireJson(fichier, { ...ITEM_P, statut_validation: "valide_a_moitie" });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(fichier);
    expect(resultat.erreur).toContain("« item »");
  });

  it.each(["libelle", "nom"])(
    "un candidat du périmètre sans « %s » : run refusé par son schéma, code 1",
    (champ) => {
      const jeu = jeuNominal();
      const perimetre = jeu.run["perimetre"] as { candidats: Record<string, unknown>[] };
      const candidats = perimetre.candidats.map((candidat) => {
        const { [champ]: _retire, ...reste } = candidat;
        return reste;
      });
      const resultat = symmetry(poser({ ...jeu, run: { ...jeu.run, perimetre: { ...perimetre, candidats } } }));
      expect(resultat.status).toBe(1);
      expect(resultat.erreur).toContain("« run »");
      expect(resultat.erreur).toContain(champ);
      expect(resultat.sortie).not.toContain("Contrôles verts");
    },
  );

  it("lit le répertoire d'items en ordre de nom : le premier fichier fautif signalé est le premier par nom", () => {
    const options = poser(jeuNominal());
    const repertoire = options.items;
    // Écrits dans l'ordre inverse de leur nom : seul un tri explicite désigne « 00 » en premier.
    ecrireJson(join(repertoire, "zz-fautif.json"), { id: "fautif-z" });
    ecrireJson(join(repertoire, "00-fautif.json"), { id: "fautif-0" });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(join(repertoire, "00-fautif.json"));
    expect(resultat.erreur).not.toContain("zz-fautif.json");
  });
});

/**
 * Conformité du 2026-09-29, n° 9 (`docs/DETTE.md`, 2026-09-28, point 2) : la référence des questions
 * engendrées au gel se recalcule sur les items reçus. Décision de l'auteur du 2026-10-01 : `--items`
 * est recoupé avec lui-même au commit `versions.donnees_commit` du run.
 */
describe("7 bis. pnpm symmetry : items et tirage du gel (conformité n° 9)", () => {
  it("--items réduit à un sous-ensemble des items du gel : code 1, refus nommé", () => {
    const options = poser(jeuNominal());
    rmSync(join(options.items, `${ITEM_F.id}.json`));
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("ItemsHorsDuGel");
    expect(resultat.erreur).toContain(`${ITEM_F.id}.json absent des items reçus`);
    expect(resultat.sortie).not.toContain("Contrôles verts");
    expect(resultat.sortie).not.toContain("statut global");
  });

  it("un item ajouté après le gel : code 1, nommé", () => {
    const options = poser(jeuNominal());
    const tardif = conforme(itemP({ cle: "cli-tardif", candidat_id: CANDIDAT, mesure: MESURE_P }));
    ecrireJson(join(options.items, `${tardif.id}.json`), tardif);
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${tardif.id}.json absent du gel`);
  });

  it("un item modifié depuis le gel, même conforme à son schéma : code 1, nommé", () => {
    const options = poser(jeuNominal());
    ecrireJson(join(options.items, `${ITEM_P.id}.json`), { ...ITEM_P, libelle_lisible: "retouché après le gel" });
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${ITEM_P.id}.json modifié depuis le gel`);
  });

  it("des items commités après le gel ne passent pas pour ceux du gel", () => {
    const options = poser(jeuNominal());
    rmSync(join(options.items, `${ITEM_F.id}.json`));
    commiterTout(racine, "retrait après le gel");
    const resultat = symmetry(options);
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`${ITEM_F.id}.json absent des items reçus`);
  });

  it("un run planifié sans versions.donnees_commit : refusé par son schéma, code 1", () => {
    // Modifié ouvertement (décision de l'auteur du 2026-10-01) : le schéma exige désormais ce commit
    // de tout run, planifié compris ; le refus vient de la lecture du run, avant la barrière.
    const jeu = jeuNominal();
    const resultat = symmetry(poser({ ...jeu, run: { ...jeu.run, statut: "planifie" } }, () => undefined));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("« run »");
    expect(resultat.erreur).toContain("donnees_commit");
    expect(resultat.sortie).not.toContain("Contrôles verts");
  });

  it("un commit du gel introuvable dans le dépôt : code 1", () => {
    const inconnu = "0".repeat(40);
    const resultat = symmetry(poser(jeuNominal(), () => inconnu));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain(`le commit ${inconnu} inscrit au gel est introuvable`);
  });

  it("un tirage d'un autre run : code 1, refus nommé", () => {
    const jeu = jeuNominal();
    const autre = identifiant("run:autre");
    const resultat = symmetry(poser({ ...jeu, tirage: { ...jeu.tirage, run_id: autre } }));
    expect(resultat.status).toBe(1);
    expect(resultat.erreur).toContain("TirageDUnAutreRun");
    expect(resultat.erreur).toContain(`run_id ${autre}`);
  });
});
