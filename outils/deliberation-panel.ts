/**
 * Lecture du fichier d'une délibération du panel sans majorité (`pnpm panel --sans-majorite=…`,
 * §10 et annexe E, protocole 0.29, D71 (8)). Frontière d'entrée : le fichier est rédigé à la main,
 * chaque champ est contrôlé ici avant que le domaine ne le voie.
 *
 *   { "opinions": [ { "membre": "<nom publié>", "vote": "maintien|correction|retrait|non_evaluabilite",
 *                     "motivation_fichier": "<chemin>" }, … ],
 *     "deportes": [ "<nom publié>", … ] }
 *
 * Chaque motivation est lue de son fichier (`lireTexteAuteur`), le chemin étant relatif au fichier
 * de la délibération. `deportes` est obligatoire, vide si personne ne s'est déporté : une liste
 * absente n'est jamais lue comme « aucun déport ».
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { lireTexteAuteur } from "./texte-auteur.ts";
import type { DecisionPanel } from "../validation/domaine/contestation-item.ts";
import type { OpinionDeMembre } from "../validation/domaine/deliberation-sans-majorite.ts";

export interface DeliberationLue {
  readonly opinions: readonly OpinionDeMembre[];
  readonly deportes: readonly string[];
}

export class FichierDeliberationInvalide extends Error {
  constructor(chemin: string, detail: string) {
    super(`--sans-majorite : ${chemin} : ${detail}`);
    this.name = "FichierDeliberationInvalide";
  }
}

function objet(valeur: unknown): Record<string, unknown> | null {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Record<string, unknown>) : null;
}

function chaine(champs: Record<string, unknown>, cle: string, chemin: string, ou: string): string {
  const valeur = champs[cle];
  if (typeof valeur !== "string") throw new FichierDeliberationInvalide(chemin, `${ou}.${cle} doit être une chaîne.`);
  return valeur;
}

function opinion(brute: unknown, rang: number, chemin: string): OpinionDeMembre {
  const ou = `opinions[${rang}]`;
  const champs = objet(brute);
  if (champs === null) throw new FichierDeliberationInvalide(chemin, `${ou} doit être un objet.`);
  const fichier = resolve(dirname(chemin), chaine(champs, "motivation_fichier", chemin, ou));
  return {
    membre: chaine(champs, "membre", chemin, ou),
    // Le vote est contrôlé contre l'énumération de l'annexe E par le domaine, qui le refuse sinon.
    vote: chaine(champs, "vote", chemin, ou) as DecisionPanel,
    motivation: lireTexteAuteur(fichier, `motivation de ${ou}`),
  };
}

function deportes(brut: unknown, chemin: string): readonly string[] {
  if (!Array.isArray(brut) || !brut.every((membre) => typeof membre === "string")) {
    throw new FichierDeliberationInvalide(chemin, "deportes doit être un tableau de noms (vide si personne ne s'est déporté).");
  }
  return brut;
}

export function lireDeliberation(chemin: string): DeliberationLue {
  const champs = objet(JSON.parse(readFileSync(chemin, "utf8")) as unknown);
  if (champs === null) throw new FichierDeliberationInvalide(chemin, "le fichier doit contenir un objet JSON.");
  const inconnus = Object.keys(champs).filter((cle) => cle !== "opinions" && cle !== "deportes");
  if (inconnus.length > 0) throw new FichierDeliberationInvalide(chemin, `champ(s) inconnu(s) : ${inconnus.join(", ")}.`);
  const opinions = champs["opinions"];
  if (!Array.isArray(opinions)) throw new FichierDeliberationInvalide(chemin, "opinions doit être un tableau.");
  return {
    opinions: opinions.map((brute, rang) => opinion(brute, rang, chemin)),
    deportes: deportes(champs["deportes"], chemin),
  };
}
