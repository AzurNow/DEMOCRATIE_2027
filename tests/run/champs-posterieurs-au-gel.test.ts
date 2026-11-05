/**
 * Les champs que `run.json` reçoit après le gel, tenus en un seul module
 * (`analysis/champs-posterieurs-au-gel.ts`, DETTE 2026-11-04 n° 2) et lus par chaque comparaison
 * de `run.json` : la reconnaissance du gel de `pnpm notation:dry` (`GelDivergent`), l'empreinte du
 * run publiée dans `metriques.json` (§9) et la part que le go/no-go compare à son recalcul.
 *
 * Les champs sont énumérés depuis les listes elles-mêmes : un champ ajouté à une liste est testé
 * par chaque comparaison qui la lit, sans retoucher ce fichier.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { empreinteDuRun } from "../../analysis/analyse-du-run.ts";
import { goNoGo } from "../../pipeline/go-no-go/go-no-go.ts";
import { GelDivergent, preparerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import {
  CHAMPS_DE_LA_NOTATION,
  CHAMPS_DU_GO_NO_GO,
  CHAMPS_ECRITS_APRES_LE_GEL,
  CHAMPS_HORS_EMPREINTE_DU_RUN,
  memeGel,
  partDesChamps,
  retirerChamps,
  RunJsonIncomplet,
  type ChampsDeRunJson,
} from "../../analysis/champs-posterieurs-au-gel.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { ecrireObjet, lireObjet, nettoyerReference, nettoyerRepertoires, runSimuleNote } from "../go-no-go/aides.ts";
import { FIXTURES_NOTATION, options } from "../notation/simulation.ts";

type Objet = Record<string, unknown>;
type Emplacement = keyof ChampsDeRunJson;

afterEach(nettoyerRepertoires);
afterAll(nettoyerReference);

const TEMPS = 120_000;

/** `run.json` tel que le gel du run simulé l'écrit (fixture de `pnpm notation:dry`). */
function runAuGel(): Objet {
  return JSON.parse(readFileSync(join(FIXTURES_NOTATION, "run.json"), "utf8")) as Objet;
}

/** Chaque champ d'une liste, avec son emplacement dans `run.json`. */
function champsDe(liste: ChampsDeRunJson): readonly (readonly [Emplacement, string])[] {
  return (Object.keys(liste) as Emplacement[]).flatMap((emplacement) => liste[emplacement].map((nom) => [emplacement, nom] as const));
}

/** `run` où le champ `nom` porte `valeur` à son emplacement (dans chaque juge, chaque outil). */
function avecChamp(run: Objet, emplacement: Emplacement, nom: string, valeur: unknown): Objet {
  const perimetre = run["perimetre"] as Objet;
  const poser = (objet: Objet): Objet => ({ ...objet, [nom]: valeur });
  if (emplacement === "racine") return poser(run);
  if (emplacement === "juges") return { ...run, juges: (run["juges"] as Objet[]).map(poser) };
  if (emplacement === "outils") return { ...run, perimetre: { ...perimetre, outils: (perimetre["outils"] as Objet[]).map(poser) } };
  return { ...run, reponses: poser(run["reponses"] as Objet) };
}

/** Toutes les valeurs de la liste posées à la fois, différentes de tout ce que le gel écrit. */
function avecTousLesChamps(run: Objet, liste: ChampsDeRunJson, valeur: unknown): Objet {
  return champsDe(liste).reduce((courant, [emplacement, nom]) => avecChamp(courant, emplacement, nom, valeur), run);
}

/** Chaque comparaison de `run.json` à sa forme au gel, avec la liste des champs qu'elle ignore. */
const COMPARAISONS: readonly { readonly nom: string; readonly ignore: ChampsDeRunJson; readonly memes: (a: Objet, b: Objet) => boolean }[] = [
  { nom: "reconnaissance du gel (pnpm notation:dry, GelDivergent)", ignore: CHAMPS_ECRITS_APRES_LE_GEL, memes: memeGel },
  { nom: "empreinte du run publiée dans metriques.json (§9)", ignore: CHAMPS_HORS_EMPREINTE_DU_RUN, memes: (a, b) => empreinteDuRun(a) === empreinteDuRun(b) },
];

/** Des champs que le gel écrit et que rien ne réécrit ensuite, à chacun des emplacements. */
const CHAMPS_DU_GEL: readonly (readonly [Emplacement, string])[] = [
  ["racine", "date_gel"],
  ["racine", "graines"],
  ["juges", "modele"],
  ["outils", "modele_demande"],
  ["reponses", "prevues"],
];

describe("une seule liste des champs écrits après le gel", () => {
  it("la liste hors empreinte est contenue dans celle des champs écrits après le gel", () => {
    const apres = new Set(champsDe(CHAMPS_ECRITS_APRES_LE_GEL).map(([e, n]) => `${e}:${n}`));
    for (const [emplacement, nom] of champsDe(CHAMPS_HORS_EMPREINTE_DU_RUN)) expect(apres.has(`${emplacement}:${nom}`), `${emplacement}:${nom}`).toBe(true);
  });

  it("le go/no-go et la notation n'écrivent que des champs de la liste des champs écrits après le gel", () => {
    const apres = new Set(champsDe(CHAMPS_ECRITS_APRES_LE_GEL).map(([e, n]) => `${e}:${n}`));
    for (const [emplacement, nom] of [...champsDe(CHAMPS_DU_GO_NO_GO), ...champsDe(CHAMPS_DE_LA_NOTATION)]) {
      expect(apres.has(`${emplacement}:${nom}`), `${emplacement}:${nom}`).toBe(true);
    }
  });

  it("aucun champ du gel ne figure dans la liste des champs écrits après le gel", () => {
    const apres = new Set(champsDe(CHAMPS_ECRITS_APRES_LE_GEL).map(([e, n]) => `${e}:${n}`));
    for (const [emplacement, nom] of CHAMPS_DU_GEL) expect(apres.has(`${emplacement}:${nom}`), `${emplacement}:${nom}`).toBe(false);
  });
});

describe.each(COMPARAISONS)("$nom", ({ ignore, memes }) => {
  it.each(champsDe(ignore))("un champ de sa liste (%s : %s) est ignoré", (emplacement, nom) => {
    const gel = runAuGel();
    expect(memes(avecChamp(gel, emplacement, nom, { ecrit_apres_le_gel: 1 }), gel)).toBe(true);
    expect(memes(avecChamp(gel, emplacement, nom, { ecrit_apres_le_gel: 1 }), avecChamp(gel, emplacement, nom, { ecrit_apres_le_gel: 2 }))).toBe(true);
  });

  it("tous les champs de sa liste posés à la fois sont ignorés", () => {
    const gel = runAuGel();
    expect(memes(avecTousLesChamps(gel, ignore, "ecrit apres le gel"), gel)).toBe(true);
  });

  it.each(CHAMPS_DU_GEL)("un champ du gel modifié (%s : %s) est une divergence", (emplacement, nom) => {
    const gel = runAuGel();
    expect(memes(avecChamp(gel, emplacement, nom, { modifie_apres_le_gel: true }), gel)).toBe(false);
  });

  it("un champ du gel modifié reste une divergence quand la liste est posée aussi", () => {
    const gel = runAuGel();
    const apres = avecTousLesChamps(gel, ignore, "ecrit apres le gel");
    expect(memes({ ...apres, date_gel: "2026-11-28T10:00:00+01:00" }, gel)).toBe(false);
  });

  it("un run.json sans tableau juges est refusé, jamais comparé à moitié", () => {
    const { juges: _juges, ...sansJuges } = runAuGel();
    expect(() => memes(sansJuges, runAuGel())).toThrow(RunJsonIncomplet);
  });
});

describe("la part que le go/no-go compare à son recalcul", () => {
  it.each(champsDe(CHAMPS_DU_GO_NO_GO))("un champ du go/no-go (%s : %s) change sa part", (emplacement, nom) => {
    const gel = runAuGel();
    expect(canoniser(partDesChamps(avecChamp(gel, emplacement, nom, 1), CHAMPS_DU_GO_NO_GO))).not.toBe(canoniser(partDesChamps(gel, CHAMPS_DU_GO_NO_GO)));
  });

  it.each(CHAMPS_DU_GEL)("un champ du gel (%s : %s) ne change pas sa part", (emplacement, nom) => {
    const gel = runAuGel();
    expect(canoniser(partDesChamps(avecChamp(gel, emplacement, nom, 1), CHAMPS_DU_GO_NO_GO))).toBe(canoniser(partDesChamps(gel, CHAMPS_DU_GO_NO_GO)));
  });

  it("retirer ses champs rend la part d'un run sans go/no-go", () => {
    const apres = avecTousLesChamps(runAuGel(), CHAMPS_DU_GO_NO_GO, 1);
    expect(canoniser(partDesChamps(retirerChamps(apres, CHAMPS_DU_GO_NO_GO), CHAMPS_DU_GO_NO_GO))).toBe(canoniser(partDesChamps(runAuGel(), CHAMPS_DU_GO_NO_GO)));
  });
});

describe("empreinte du run publiée : non-régression (aucune empreinte publiée ne change)", () => {
  // Valeurs relevées avant la centralisation des listes (code de 35ef707) : elles ne bougent pas.
  // Relevées de nouveau au protocole 0.32 (D74 (17)) : le tirage de la fixture porte désormais
  // incompatibles_au_gel, son SHA-256 change, et run.json#/tirage/sha256 avec lui ; c'est le seul
  // champ de run.json modifié (avant : 6e0ef9a5…02234 au gel, aae9edbf…06373 noté).
  // Relevées de nouveau pour D75 (14), (21) et D84 : la fixture porte application_testee,
  // reponses.echantillons_par_question et le libellé et l'éditeur de chaque outil, champs figés au
  // gel ; retirés, la fixture redonne exactement les valeurs précédentes (833c5f2d…cc705 au gel,
  // 35bfc969…c3cc6 noté), recalculées lors de ce relevé.
  const EMPREINTE_AU_GEL = "ea240782cade626e3cddbe417a77bab4994531ffd63661a15d1793ed51c5a15e";
  const EMPREINTE_NOTE = "f55087e7c667c206f432d2a43a9fd814f29db4d591d9f8028f79846ffc7d0284";

  function note(run: Objet): Objet {
    return { ...run, reponses: { ...(run["reponses"] as Objet), obtenues: 50 }, contrefactuel_candidats: { x: 1 } };
  }

  it("le run de fixture au gel garde son empreinte", () => {
    expect(empreinteDuRun(runAuGel())).toBe(EMPREINTE_AU_GEL);
  });

  it("le même run noté garde son empreinte : ce que la notation écrit y entre", () => {
    expect(empreinteDuRun(note(runAuGel()))).toBe(EMPREINTE_NOTE);
  });

  it("le run noté, passé au go/no-go puis publié et déposé, garde l'empreinte du run noté", () => {
    const publie = avecTousLesChamps(note(runAuGel()), CHAMPS_HORS_EMPREINTE_DU_RUN, "apres l'analyse");
    expect(empreinteDuRun(publie)).toBe(EMPREINTE_NOTE);
  });
});

describe("de bout en bout : run simulé noté, passé au go/no-go, puis relancé", () => {
  it(
    "la notation et le go/no-go n'écrivent dans run.json que des champs de leur liste",
    async () => {
      const repertoire = await runSimuleNote();
      const chemin = join(repertoire, "run.json");
      const note = lireObjet(chemin);
      expect(canoniser(retirerChamps(note, CHAMPS_DE_LA_NOTATION))).toBe(canoniser(retirerChamps(runAuGel(), CHAMPS_DE_LA_NOTATION)));
      goNoGo(repertoire);
      const apres = lireObjet(chemin);
      expect(apres["go_no_go"]).toBeDefined();
      expect(canoniser(retirerChamps(apres, CHAMPS_DU_GO_NO_GO))).toBe(canoniser(retirerChamps(note, CHAMPS_DU_GO_NO_GO)));
      expect(empreinteDuRun(apres)).toBe(empreinteDuRun(note));
    },
    TEMPS,
  );

  it(
    "run noté puis relancé après le go/no-go : pas de GelDivergent",
    async () => {
      const repertoire = await runSimuleNote();
      goNoGo(repertoire);
      const avant = readFileSync(join(repertoire, "run.json"), "utf8");
      await expect(preparerNotationSimulee(options(dirname(repertoire)))).resolves.toBeDefined();
      expect(readFileSync(join(repertoire, "run.json"), "utf8")).toBe(avant);
    },
    TEMPS,
  );

  it(
    "un champ du gel modifié dans run.json : GelDivergent, et rien n'est réécrit",
    async () => {
      const repertoire = await runSimuleNote();
      const chemin = join(repertoire, "run.json");
      ecrireObjet(chemin, { ...lireObjet(chemin), date_gel: "2026-11-27T05:00:00+01:00" });
      const avant = readFileSync(chemin, "utf8");
      await expect(preparerNotationSimulee(options(dirname(repertoire)))).rejects.toBeInstanceOf(GelDivergent);
      expect(readFileSync(chemin, "utf8")).toBe(avant);
    },
    TEMPS,
  );
});
