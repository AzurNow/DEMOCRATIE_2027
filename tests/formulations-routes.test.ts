/**
 * Les routes de la relecture des formulations (décisions D39 et D42), exécutées sur un bac d'essai
 * sans ouvrir de port : le serveur revérifie tout ce que le client envoie.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErreurSchema, valider } from "../outils/schemas/valider.ts";
import { THEMES } from "../pipeline/questions/types.ts";
import type { PropositionFormulation } from "../pipeline/reformulation/staging.ts";
import { tachesDe } from "../pipeline/reformulation/entrees.ts";
import type { Reponse } from "../validation/serveur/routes.ts";
import { ROUTES } from "../validation/serveur/routes.ts";
import { lireFormulationsData } from "../validation/io/data-formulations.ts";
import { lireRefusFormulations } from "../validation/io/refus-formulations.ts";
import { creerBac, type Bac } from "./aides/bac.ts";
import { itemPromu } from "./aides/data.ts";
import { mesure as mesurePubliee } from "./aides/fabriques.ts";
import { perimetre as perimetreDeTest } from "./questions/fabriques.ts";
import {
  CANDIDAT,
  FORMULATION_MESURE,
  LIBELLE,
  proposition,
  questionDe,
  type Jeu,
} from "./reformulation/fabriques-relecture.ts";

let bac: Bac;
let donnees: Jeu;

function ecrireJson(relatif: string, valeur: unknown): void {
  const chemin = join(bac.racine, relatif);
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, JSON.stringify(valeur), "utf8");
}

function perimetre(): unknown {
  return {
    version: "0.0.0-essai",
    date_gel: null,
    regime_inclusion: null,
    liste_officielle: null,
    themes: [...THEMES],
    tirage: { questions_par_strate: null, questions_attribution_par_theme: null },
    candidats: [
      { candidat_id: CANDIDAT, libelle: LIBELLE, nom: `Nom-${CANDIDAT}`, statut_au_gel: "actif", interroge: true, contact_notification: null },
    ],
    outils: [],
  };
}

function poserProposition(valeur: PropositionFormulation): void {
  ecrireJson(`staging/formulations/${valeur.question_id}/${valeur.id}.json`, valeur);
}

/**
 * Le jeu tel que `data/` le contient : un item promu par la vraie règle de promotion
 * (`tests/aides/data.ts`) et sa mesure publiée, et les questions que `engendrer` en tire.
 */
function jeuPublie(position: "pour" | "contre" = "pour"): Jeu {
  const m = mesurePubliee({ formulation_canonique: FORMULATION_MESURE, theme: "education" });
  const socle = itemPromu({ candidat_id: CANDIDAT, mesure_id: m.id, mesure_version: m.version });
  const assertion = socle.assertion;
  if (assertion === undefined) throw new Error("item P sans assertion");
  // Une correction de position, même identifiant : le texte neutre de Q-FER ne dépend pas de la position.
  const item = { ...socle, assertion: { ...assertion, position } };
  const taches = tachesDe({ items: [item], mesures: [m], candidats: perimetreDeTest([CANDIDAT]) });
  return { mesure: m, item, taches, questions: taches.map((tache) => tache.question) };
}

beforeEach(() => {
  bac = creerBac();
  donnees = jeuPublie();
  ecrireJson(`data/items/${donnees.item.id}.json`, donnees.item);
  ecrireJson(`data/mesures/${donnees.mesure.id}.json`, donnees.mesure);
  // Du JSON est du YAML : le périmètre de test s'écrit sans dépendance de plus.
  ecrireJson("config/perimetre.yaml", perimetre());
});

afterEach(() => {
  bac.detruire();
});

function appeler(nom: string, params: readonly string[], corps: unknown = null): Reponse {
  const route = ROUTES.find((candidate) => candidate.nom === nom);
  if (route === undefined) throw new Error(`Route inconnue : ${nom}`);
  return route.gestionnaire(bac.contexte("a1"), params, corps);
}

const FER = (): ReturnType<typeof questionDe> => questionDe(donnees.taches, "Q-FER");

function requete(prop: PropositionFormulation, cases: Partial<Record<string, boolean>> = {}, commentaire = "") {
  return {
    question_id: prop.question_id,
    proposition_id: prop.id,
    sens_preserve: { neutre: true, familier: true, oriente: true, ...cases },
    premisse_conforme: cases["premisse"] ?? true,
    commentaire,
  };
}

function corps(reponse: Reponse): Record<string, unknown> {
  return reponse.corps as Record<string, unknown>;
}

describe("liste et détail", () => {
  it("liste les seules questions qui ont une proposition relisible, sans nommer le modèle", () => {
    const acceptee = proposition(FER(), { cle: "acceptee" });
    poserProposition(acceptee);
    poserProposition(proposition(questionDe(donnees.taches, "Q-DIR"), { cle: "rejetee", statut: "rejetee" }));
    const reponse = appeler("formulations", []);
    expect(reponse.statut).toBe(200);
    expect(corps(reponse)["questions"]).toEqual([
      { question_id: FER().question.id, gabarit: "Q-FER", candidat: LIBELLE, mesure: acceptee.demande.formulation_mesure },
    ]);
    expect(JSON.stringify(reponse)).not.toContain("famille-x/modele-1");
  });

  it("le détail montre gabarit, candidat, mesure, position demandée et les trois textes tels quels", () => {
    const acceptee = proposition(FER(), { cle: "detail" });
    poserProposition(acceptee);
    const vue = corps(appeler("formulation", [FER().question.id]));
    expect(vue).toMatchObject({
      question_id: FER().question.id,
      proposition_id: acceptee.id,
      gabarit: "Q-FER",
      candidat: LIBELLE,
      position_demandee: "pour",
      textes: [
        { registre: "neutre", texte: FER().question.texte_neutre },
        { registre: "familier", texte: acceptee.issue.statut === "acceptee" ? acceptee.issue.familier.texte : null },
        { registre: "oriente", texte: acceptee.issue.statut === "acceptee" ? acceptee.issue.oriente.texte : null },
      ],
    });
  });

  it("une question d'attribution ne montre aucun candidat, et demande « AUCUNE »", () => {
    const att = questionDe(donnees.taches, "Q-ATT");
    poserProposition(proposition(att, { cle: "att" }));
    const vue = corps(appeler("formulation", [att.question.id]));
    expect(vue["candidat"]).toBeNull();
    expect(vue["position_demandee"]).toBe("AUCUNE");
  });

  it("périmètre absent ⇒ l'écran dit qu'il est indisponible, rien n'est inventé", () => {
    poserProposition(proposition(FER(), { cle: "sans-perimetre" }));
    const chemin = join(bac.racine, "config/perimetre.yaml");
    rmSync(chemin);
    const reponse = appeler("formulations", []);
    expect(reponse.statut).toBe(409);
    expect(corps(reponse)).toMatchObject({ disponible: false, nature: "EntreeAbsente" });
    expect(String(corps(reponse)["erreur"])).toContain("périmètre introuvable");
  });

  it("constat 25 : un périmètre vide (schéma refusé) est un bogue d'assemblage, pas une donnée indisponible ⇒ 500, pas 409", () => {
    poserProposition(proposition(FER(), { cle: "perimetre-vide" }));
    const chemin = join(bac.racine, "config/perimetre.yaml");
    writeFileSync(chemin, "", "utf8");
    // ErreurSchema n'est plus rangée parmi les erreurs de données (ERREURS_DE_DONNEES) : elle
    // remonte, et c'est principal.ts qui la transforme en 500 (jamais ce test, qui appelle le
    // gestionnaire de route directement, hors du serveur HTTP).
    expect(() => appeler("formulations", [])).toThrow(ErreurSchema);
  });
});

describe("Q1, option (a) : item corrigé, texte neutre inchangé", () => {
  function corriger(position: "pour" | "contre"): Jeu {
    const corrige = jeuPublie(position);
    ecrireJson(`data/items/${corrige.item.id}.json`, corrige.item);
    return corrige;
  }

  it("P corrigé de « pour » à « contre » ⇒ la proposition n'est plus listée ni promouvable", () => {
    const avant = proposition(FER(), { cle: "p-pour" });
    poserProposition(avant);
    expect(corps(appeler("formulations", []))["questions"]).toHaveLength(1);
    const corrige = corriger("contre");
    expect(questionDe(corrige.taches, "Q-FER").question.texte_neutre).toBe(FER().question.texte_neutre);
    expect(corps(appeler("formulations", []))["questions"]).toEqual([]);
    expect(appeler("formulation-promotion", [], requete(avant)).statut).toBe(404);
  });

  it("P corrigé après promotion ⇒ une proposition sur la nouvelle position se relit et remplace le fichier", () => {
    const avant = proposition(FER(), { cle: "p-promue" });
    poserProposition(avant);
    expect(appeler("formulation-promotion", [], requete(avant)).statut).toBe(201);
    const corrige = corriger("contre");
    const nouvelle = proposition(questionDe(corrige.taches, "Q-FER"), { cle: "p-contre", date: "2026-11-05T10:00:00+01:00" });
    poserProposition(nouvelle);
    expect(appeler("formulation-promotion", [], requete(nouvelle)).statut).toBe(201);
    const lue = lireFormulationsData(join(bac.racine, "data/formulations")).get(FER().question.id);
    expect(lue?.formulations.formulations[2]?.position_affirmee).toBe("contre");
  });

  it("aucune correction ⇒ inchangé", () => {
    poserProposition(proposition(FER(), { cle: "inchange" }));
    corriger("pour");
    expect(corps(appeler("formulations", []))["questions"]).toHaveLength(1);
  });
});

describe("promotion", () => {
  it("cas limite 4 : quatre cases cochées ⇒ data/formulations/<question_id>.json conforme, textes recopiés", () => {
    const acceptee = proposition(FER(), { cle: "promue" });
    poserProposition(acceptee);
    const reponse = appeler("formulation-promotion", [], requete(acceptee));
    expect(reponse.statut).toBe(201);
    const chemin = join(bac.racine, "data/formulations", `${FER().question.id}.json`);
    const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
    expect(() => valider("formulations-validees", brut, "essai")).not.toThrow();
    const lue = lireFormulationsData(join(bac.racine, "data/formulations")).get(FER().question.id);
    expect(lue?.formulations.proposition_id).toBe(acceptee.id);
    expect(lue?.formulations.formulations.every((formulation) => formulation.relecture.annotateur_id === "a1")).toBe(true);
    // Promue : la question sort de la liste, et une seconde promotion est refusée.
    expect(corps(appeler("formulations", []))["questions"]).toEqual([]);
    expect(appeler("formulation-promotion", [], requete(acceptee)).statut).toBe(409);
  });

  it.each([["neutre"], ["familier"], ["oriente"], ["premisse"]])(
    "cas limite 7 : case « %s » non cochée ⇒ promotion refusée par le serveur, rien n'est écrit",
    (case_) => {
      const acceptee = proposition(FER(), { cle: `case-${case_}` });
      poserProposition(acceptee);
      const reponse = appeler("formulation-promotion", [], requete(acceptee, { [case_]: false }));
      expect(reponse.statut).toBe(422);
      expect(existsSync(join(bac.racine, "data/formulations"))).toBe(false);
    },
  );

  it("cas limite 7 : une case absente de la requête n'est jamais supposée cochée", () => {
    const acceptee = proposition(FER(), { cle: "absente" });
    poserProposition(acceptee);
    const { premisse_conforme: _absente, ...sansPremisse } = requete(acceptee);
    expect(appeler("formulation-promotion", [], sansPremisse).statut).toBe(400);
    expect(appeler("formulation-promotion", [], null).statut).toBe(400);
    expect(existsSync(join(bac.racine, "data/formulations"))).toBe(false);
  });

  it("une proposition qui n'est plus la relisible (une plus récente est arrivée) ⇒ 409", () => {
    const ancienne = proposition(FER(), { cle: "ancienne", date: "2026-11-01T10:00:00+01:00" });
    poserProposition(ancienne);
    poserProposition(proposition(FER(), { cle: "recente", date: "2026-11-05T10:00:00+01:00" }));
    expect(appeler("formulation-promotion", [], requete(ancienne)).statut).toBe(409);
  });
});

describe("refus", () => {
  it("cas limite 6 : refus sans commentaire ⇒ refusé par le serveur, journal inchangé", () => {
    const acceptee = proposition(FER(), { cle: "sans-commentaire" });
    poserProposition(acceptee);
    const reponse = appeler("formulation-refus", [], requete(acceptee, { familier: false }, "   "));
    expect(reponse.statut).toBe(422);
    expect(existsSync(join(bac.racine, "validation/formulations/refus.jsonl"))).toBe(false);
  });

  it("cas limite 6 et 3 : refus valide ⇒ une ligne ajoutée, la proposition n'est plus listée", () => {
    const acceptee = proposition(FER(), { cle: "refusee" });
    poserProposition(acceptee);
    const reponse = appeler("formulation-refus", [], requete(acceptee, { premisse: false }, "Prémisse « contre »."));
    expect(reponse.statut).toBe(201);
    const lignes = lireRefusFormulations(join(bac.racine, "validation/formulations/refus.jsonl"));
    expect(lignes).toEqual([
      expect.objectContaining({
        proposition_id: acceptee.id,
        question_id: FER().question.id,
        empreinte_texte_neutre: acceptee.empreinte_texte_neutre,
        annotateur_id: "a1",
        registres: ["oriente"],
        premisse_conforme: false,
        commentaire: "Prémisse « contre ».",
      }),
    ]);
    expect(corps(appeler("formulations", []))["questions"]).toEqual([]);
    expect(appeler("formulation", [FER().question.id]).statut).toBe(404);
  });

  it("refus alors que tout est coché ⇒ 422", () => {
    const acceptee = proposition(FER(), { cle: "tout-coche" });
    poserProposition(acceptee);
    expect(appeler("formulation-refus", [], requete(acceptee, {}, "Je refuse.")).statut).toBe(422);
  });
});

describe("cas limite 11 : journal des refus illisible", () => {
  it("rien n'est listé ni promu", () => {
    const acceptee = proposition(FER(), { cle: "bloquee" });
    poserProposition(acceptee);
    mkdirSync(join(bac.racine, "validation/formulations"), { recursive: true });
    writeFileSync(join(bac.racine, "validation/formulations/refus.jsonl"), "pas du JSON\n", "utf8");
    const liste = appeler("formulations", []);
    expect(liste.statut).toBe(409);
    expect(corps(liste)).toMatchObject({ nature: "JournalRefusIllisible" });
    expect(appeler("formulation-promotion", [], requete(acceptee)).statut).toBe(409);
    expect(existsSync(join(bac.racine, "data/formulations"))).toBe(false);
  });
});
