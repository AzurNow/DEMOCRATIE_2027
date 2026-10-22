/**
 * Constat 7 de la revue du 2026-09-23 : le gabarit d'attribution se reconnaît à sa donnée
 * `nomme_candidat`, jamais à son code.
 *
 * Deux garanties :
 *
 * - **Aucun changement de comportement.** La sortie de l'engendrement et le rapport de symétrie
 *   sont épinglés par leur empreinte SHA-256 sur un jeu fixe, construit avec les fabriques
 *   existantes (`fabriques.ts`). Les empreintes ont été relevées sur le code d'avant la
 *   correction, qui décidait sur `gabarit.code === "Q-ATT"` ; elles doivent rester identiques
 *   après. Une empreinte qui change ici est un changement de comportement, à expliquer — pas une
 *   valeur à recopier.
 * - **Aucun code de décision ne cite le code du gabarit.** Test structurel sur les sources de
 *   `pipeline/questions/`, commentaires retirés : la seule occurrence admise de la chaîne `"Q-ATT"`
 *   est l'énumération de l'annexe B dans `types.ts`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { engendrer } from "../../pipeline/questions/engendrement.ts";
import { verifierSymetrie } from "../../pipeline/questions/symetrie.ts";
import { entreesPour } from "../../pipeline/questions/entrees-tirage.ts";
import { questionsTirables } from "../../pipeline/questions/tirabilite.ts";
import type { Item, Question, Symetrie } from "../../pipeline/questions/types.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import {
  candidat,
  completerSur,
  graine,
  itemA,
  itemF,
  itemO,
  itemP,
  mesure,
  perimetre,
  question,
  quotas,
  run,
} from "./fabriques.ts";

/*
 * Relevées le 2026-09-24 sur le code d'avant la correction (décision sur `gabarit.code`), puis
 * relevées à nouveau le même jour pour les constats 2 et 3 de la conformité (protocole 0.6), après
 * comparaison champ à champ des deux sorties :
 * - engendrement : seul `texte_neutre` des 20 questions nominatives change, « Candidat demo-x »
 *   (ancien `item.libelle_lisible` des fabriques) devenant « Libellé demo-x » (`libelle` du
 *   périmètre du run) ; aucune autre différence, Q-ATT comprises ;
 * - symétrie verte et rouge : les deux Q-ATT de la mesure conditionnelle ne sont plus tirables, le
 *   tirage perd ces deux entrées et `part_items_a_f_minimale.mesure` passe de 8/26 à 8/24 (vert)
 *   et de 8/27 à 8/25 (rouge) ; statuts et autres conditions inchangés.
 *
 * Relevées à nouveau le 2026-09-25 pour le protocole 0.9 (§5, constats n° 36 et 39), changement de
 * comportement voulu :
 * - engendrement : 24 questions au lieu de 26. Les 20 nominatives sont inchangées, sauf les deux
 *   engendrées par les items F, dont la mesure fictive est désormais propre à chaque candidat (le
 *   jeu en partageait une, ce que `AttributionFictiveAmbigue` refuse) ; les Q-ATT passent de 6 (une
 *   par item P ou F) à 4 (une par mesure : partagée, conditionnelle, deux fictives), sans principal
 *   sur les mesures réelles et de grappe la mesure ;
 * - symétrie verte et rouge : la mesure conditionnelle n'a plus qu'une Q-ATT non tirable, le
 *   tirage compte 23 entrées (24 avec la Q-ATT qui nomme) ; `part_items_a_f_minimale.mesure` passe
 *   de 8/24 à 8/23 (vert) et de 8/25 à 8/24 (rouge) ; statuts et autres conditions inchangés.
 *
 * Relevées à nouveau le 2026-10-01 (décision de l'auteur : condition `quota_par_strate_respecte`) :
 * la symétrie verte et la rouge gagnent une septième condition, verte, `mesure` 1, `seuil` 1, en
 * dernière position. Privées de cette condition, elles rendent exactement les empreintes d'avant
 * (34df74ba… et 61b020d1…) ; statuts globaux inchangés.
 */
const EMPREINTE_ENGENDREMENT = "e733879188b6426ea13df7df3119ae7ea10e15a8722ea7bd118f130ee67c6c36";
const EMPREINTE_SYMETRIE_VERTE = "f2763161262552332bea27b51eab87e4c93ccc041cd35c30226b199c7d68098c";
const EMPREINTE_SYMETRIE_ROUGE = "bb0874ddd4a9542d6874ba18cc4ae22a2c855442c8bc2655aea74ff258a85767";

const GEL = "2026-12-01T06:00:00+01:00";
const CANDIDATS = ["demo-alpha", "demo-beta"];
const PERIMETRE = perimetre(CANDIDATS);

const PARTAGEE = mesure({ cle: "attr-partagee", theme: "fiscalite_pouvoir_achat" });
const CONDITIONNELLE = mesure({ cle: "attr-conditionnelle", theme: "retraites" });
const ABSENTE = mesure({ cle: "attr-absente", theme: "sante" });
const CHANGEANTE = mesure({ cle: "attr-changeante", theme: "education" });
/*
 * Une mesure fictive par candidat depuis le protocole 0.9 (§5, constat n° 39) : la Q-ATT d'une
 * mesure est unique et son item F principal ; deux items F sur une même mesure fictive sont refusés
 * (`AttributionFictiveAmbigue`, question ouverte du rapport du 2026-09-25).
 */
const FICTIVES: Readonly<Record<string, ReturnType<typeof mesure>>> = Object.fromEntries(
  // La clé ne porte pas l'identifiant du candidat : le libellé de la mesure en dérive, et la barrière
  // « aucun nom de candidat dans les Q-ATT » le trouverait.
  CANDIDATS.map((candidat_id, rang) => [
    candidat_id,
    mesure({ cle: `attr-fictive-${rang}`, theme: "immigration", fictive: true }),
  ]),
);
const MESURES = [PARTAGEE, CONDITIONNELLE, ABSENTE, CHANGEANTE, ...Object.values(FICTIVES)];

/**
 * Les quatre types d'item et les six gabarits : une mesure portée par les deux candidats (liste
 * attendue non vide pour Q-ATT), une position conditionnelle (exclusions), une mesure fictive
 * (liste attendue vide).
 */
const ITEMS: readonly Item[] = CANDIDATS.flatMap((candidat_id) => [
  itemP({ cle: `attr-${candidat_id}-p`, candidat_id, mesure: PARTAGEE }),
  itemP({
    cle: `attr-${candidat_id}-cond`,
    candidat_id,
    mesure: CONDITIONNELLE,
    position: "conditionnel",
  }),
  itemA({ cle: `attr-${candidat_id}-a`, candidat_id, mesure: ABSENTE }),
  itemO({ cle: `attr-${candidat_id}-o`, candidat_id, mesure: CHANGEANTE }),
  itemF({ cle: `attr-${candidat_id}-f`, candidat_id, mesure: FICTIVES[candidat_id] as ReturnType<typeof mesure> }),
]);

const ENGENDREES = engendrer(ITEMS, MESURES, PERIMETRE);
// Protocole 0.11 (constat n° 37) : la formulation orientée d'une question sur un item O porte la
// position affirmée, sans quoi sa prémisse est indécidable au gel et le tirage refuse la question.
const QUESTIONS: readonly Question[] = ENGENDREES.map(completerSur(ITEMS));
const RUN = run(CANDIDATS.map((candidat_id) => candidat({ candidat_id })), GEL);

/**
 * Le tirage de toutes les questions que la règle de tirabilité admet au gel : un tirage ne contient
 * jamais de question non tirable. Depuis le protocole 0.6, les deux Q-ATT de la mesure
 * conditionnelle ne le sont plus (constat 2 de la conformité du 2026-09-24).
 */
function symetrieDe(questions: readonly Question[]): Symetrie {
  const tirage = {
    run_id: RUN.id,
    date_gel: GEL,
    graine_tirage: graine(),
    // Conformité n° 59 : un tirage porte ses quotas.
    parametres: quotas(),
    entrees: entreesPour(questionsTirables(questions, ITEMS, MESURES, RUN), ITEMS, MESURES, RUN),
    exclusions: [],
    contestes_au_gel: [],
    bilan_reprise: [],
    compensations: [],
  };
  return verifierSymetrie(tirage, questions, ITEMS, MESURES, RUN);
}

function empreinte(valeur: unknown): string {
  return sha256(JSON.stringify(valeur));
}

/** Une Q-ATT dont le texte nomme un candidat : ce que la symétrie doit refuser. */
function attributionQuiNomme(): Question {
  const principal = ITEMS.find((item) => item.type === "P") as Item;
  return question({
    id: "q_attribution_qui_nomme",
    gabarit: "Q-ATT",
    items: [
      {
        reference: {
          item_id: principal.id,
          item_version: principal.version,
          item_empreinte: principal.empreinte,
        },
        role: "principal",
      },
    ],
    grappe_id: principal.id,
    texte_neutre: "Candidat demo-alpha propose-t-il ou elle cette mesure ?",
  });
}

describe("constat 7 : comportement inchangé avec la table de gabarits actuelle", () => {
  it("engendre exactement la même sortie qu'avant la correction", () => {
    expect(ENGENDREES.map((engendree) => engendree.gabarit)).toContain("Q-ATT");
    expect(empreinte(ENGENDREES)).toBe(EMPREINTE_ENGENDREMENT);
  });

  it("rend exactement la même symétrie qu'avant sur le tirage de toutes les questions engendrées", () => {
    const symetrie = symetrieDe(QUESTIONS);
    const condition = symetrie.conditions.find((c) => c.code === "aucun_nom_candidat_dans_q_att");
    // Les cinq autres gabarits nomment le candidat : les inspecter rendrait la condition rouge.
    expect(condition?.statut).toBe("vert");
    expect(empreinte(symetrie)).toBe(EMPREINTE_SYMETRIE_VERTE);
  });

  it("rend exactement la même symétrie qu'avant quand une Q-ATT nomme un candidat", () => {
    const symetrie = symetrieDe([...QUESTIONS, attributionQuiNomme()]);
    const condition = symetrie.conditions.find((c) => c.code === "aucun_nom_candidat_dans_q_att");
    expect(condition?.statut).toBe("rouge");
    expect(condition?.commentaire).toContain("q_attribution_qui_nomme");
    expect(empreinte(symetrie)).toBe(EMPREINTE_SYMETRIE_ROUGE);
  });
});

/* ------------------------------------------------------ test structurel */

const DOSSIER_QUESTIONS = join(import.meta.dirname, "..", "..", "pipeline", "questions");

/** Retire les commentaires de bloc et de ligne ; les chaînes du code de décision restent. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/.*$/gm, "");
}

function fichiersCitant(chaine: string): readonly string[] {
  return readdirSync(DOSSIER_QUESTIONS)
    .filter((nom) => nom.endsWith(".ts"))
    .filter((nom) => sansCommentaires(readFileSync(join(DOSSIER_QUESTIONS, nom), "utf8")).includes(chaine))
    .sort();
}

describe("constat 7 : aucun code de décision ne cite le code du gabarit d'attribution", () => {
  it("ne laisse la chaîne \"Q-ATT\" que dans l'énumération de l'annexe B (types.ts)", () => {
    expect(fichiersCitant('"Q-ATT"')).toEqual(["types.ts"]);
  });

  it("n'y laisse qu'une seule occurrence, celle de CODES_GABARIT", () => {
    const source = sansCommentaires(readFileSync(join(DOSSIER_QUESTIONS, "types.ts"), "utf8"));
    const lignes = source.split("\n").filter((ligne) => ligne.includes('"Q-ATT"'));
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatch(/^export const CODES_GABARIT = \[/);
  });

  it("détecte bien une occurrence dans du code, et ignore celle d'un commentaire", () => {
    expect(sansCommentaires('if (gabarit.code !== "Q-ATT") return;')).toContain('"Q-ATT"');
    expect(sansCommentaires('/** « "Q-ATT" » */\n// "Q-ATT"\nconst x = 1; // "Q-ATT"')).not.toContain(
      '"Q-ATT"',
    );
  });
});
