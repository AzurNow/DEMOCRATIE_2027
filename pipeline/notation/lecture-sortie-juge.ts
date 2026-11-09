/**
 * La lecture du texte rendu par un juge réel (§7) : un objet JSON, rien d'autre, de la forme d'une
 * `SortieJuge` (`juge.ts`). Ce module ne juge que la forme ; le sens (une catégorie sur une Q-ATT,
 * `non_classee` rendue par le juge, des avis de soutien qui ne suivent pas les liens de la charge,
 * l'extrait exigé…) reste contrôlé à un seul endroit, `juge.ts:issueDeJuge`, qui en fait un renvoi
 * `sortie_illisible`.
 *
 * **Ce qui est refusé ici**, avec la raison en clair (`LectureSortieJuge`, jamais une exception) :
 * - un texte qui n'est pas du JSON, ou du JSON qui n'est pas un objet. Le prompt (`prompts/judge-*`)
 *   demande « un seul objet JSON, sans aucun texte avant ni après, sans bloc de code » : un bloc
 *   Markdown autour de l'objet n'est pas retiré, il rend la sortie illisible (rien n'est réparé) ;
 * - un champ hors de `CHAMPS_SORTIE_JUGE` et de `CHAMPS_SORTIE_JUGE_ATTRIBUTION` ;
 * - un champ connu dont la valeur n'a pas le type ou la valeur admise (énumérations de
 *   `analysis/types.ts` et `analysis/types-notation.ts`, jamais recopiées) ;
 * - une sortie sans `sourcage`, ou qui ne porte ni la forme ordinaire (`categorie` et `drapeaux`)
 *   ni la forme d'attribution (`noms_cites` et `non_reponse`).
 *
 * Aucune valeur n'est complétée ni corrigée : un champ absent reste absent.
 */

import { CATEGORIES_RETENUES, DRAPEAUX, VERDICTS_SOUTIEN } from "../../analysis/types.ts";
import { MOTIFS_INEXACTITUDE } from "../../analysis/types-notation.ts";
import { estObjetJson, lireJson } from "../interrogation/editeur.ts";
import { CHAMPS_SORTIE_JUGE, CHAMPS_SORTIE_JUGE_ATTRIBUTION, type SortieJuge } from "./juge.ts";

export type LectureSortieJuge = { readonly lisible: true; readonly sortie: SortieJuge } | { readonly lisible: false; readonly raison: string };

/** Les champs qu'une sortie de juge peut porter, sous l'une ou l'autre forme. */
export const CHAMPS_CONNUS_SORTIE_JUGE: readonly string[] = [...new Set<string>([...CHAMPS_SORTIE_JUGE, ...CHAMPS_SORTIE_JUGE_ATTRIBUTION])];

const PROVENANCES_EXTRAIT: readonly string[] = ["reponse", "reference"];

type Conforme = (valeur: unknown) => boolean;

function parmi(admises: readonly string[]): Conforme {
  return (valeur) => typeof valeur === "string" && admises.includes(valeur);
}

function listeDe(element: Conforme): Conforme {
  return (valeur) => Array.isArray(valeur) && (valeur as readonly unknown[]).every(element);
}

/** Un objet qui porte exactement ces clés, chacune conforme. */
function objetExact(controles: Readonly<Record<string, Conforme>>): Conforme {
  const cles = Object.keys(controles).sort();
  return (valeur) => {
    if (!estObjetJson(valeur)) return false;
    if (Object.keys(valeur).sort().join("\u0000") !== cles.join("\u0000")) return false;
    return Object.entries(controles).every(([cle, conforme]) => conforme(valeur[cle]));
  };
}

const estTexte: Conforme = (valeur) => typeof valeur === "string";
const estBooleen: Conforme = (valeur) => typeof valeur === "boolean";
const estSoutien = objetExact({ url_citee: estTexte, verdict_soutien: parmi(VERDICTS_SOUTIEN) });

interface ControleDeChamp {
  readonly conforme: Conforme;
  /** Ce qui est attendu, dit dans la raison d'un refus. */
  readonly attendu: string;
}

/** Le contrôle de forme de chaque champ connu ; ses clés sont exactement `CHAMPS_CONNUS_SORTIE_JUGE` (test). */
export const CONTROLES_SORTIE_JUGE: Readonly<Record<string, ControleDeChamp>> = {
  categorie: { conforme: parmi(CATEGORIES_RETENUES), attendu: `l'une de ${CATEGORIES_RETENUES.join(", ")}` },
  drapeaux: { conforme: listeDe(parmi(DRAPEAUX)), attendu: `une liste parmi ${DRAPEAUX.join(", ")}` },
  motif_inexactitude: { conforme: parmi(MOTIFS_INEXACTITUDE), attendu: `l'un de ${MOTIFS_INEXACTITUDE.join(", ")}` },
  sourcage: {
    conforme: objetExact({ cite: estBooleen, soutiens: listeDe(estSoutien) }),
    attendu: `un objet {cite, soutiens}, chaque soutien {url_citee, verdict_soutien} avec un verdict parmi ${VERDICTS_SOUTIEN.join(", ")}`,
  },
  extrait_justificatif: {
    conforme: objetExact({ provenance: parmi(PROVENANCES_EXTRAIT), texte: estTexte }),
    attendu: `un objet {provenance, texte}, provenance parmi ${PROVENANCES_EXTRAIT.join(", ")}`,
  },
  noms_cites: { conforme: listeDe(estTexte), attendu: "une liste de textes" },
  non_reponse: { conforme: estBooleen, attendu: "un booléen" },
};

/** Le contrôle d'un champ connu ; un champ connu sans contrôle est une incohérence du code, jamais ignorée. */
function controleDe(cle: string): ControleDeChamp {
  const controle = CONTROLES_SORTIE_JUGE[cle];
  if (controle === undefined) throw new Error(`Lecture de la sortie de juge : aucun contrôle pour le champ ${cle} (incohérence interne).`);
  return controle;
}

function illisible(raison: string): LectureSortieJuge {
  return { lisible: false, raison };
}

/** La forme ordinaire, la forme d'attribution, ou ni l'une ni l'autre ; leur mélange est laissé à `juge.ts`. */
function formeReconnue(objet: Readonly<Record<string, unknown>>): boolean {
  const ordinaire = Object.hasOwn(objet, "categorie") && Object.hasOwn(objet, "drapeaux");
  const attribution = Object.hasOwn(objet, "noms_cites") && Object.hasOwn(objet, "non_reponse");
  return ordinaire || attribution;
}

function lireObjet(objet: Readonly<Record<string, unknown>>): LectureSortieJuge {
  const inconnus = Object.keys(objet).filter((cle) => !CHAMPS_CONNUS_SORTIE_JUGE.includes(cle));
  if (inconnus.length > 0) return illisible(`champ(s) hors du format de sortie du juge : ${inconnus.join(", ")} (admis : ${CHAMPS_CONNUS_SORTIE_JUGE.join(", ")}).`);
  const fautifs = Object.keys(objet).filter((cle) => !controleDe(cle).conforme(objet[cle]));
  if (fautifs.length > 0) return illisible(`${fautifs.map((cle) => `« ${cle} » n'est pas ${controleDe(cle).attendu}`).join(" ; ")}.`);
  if (!Object.hasOwn(objet, "sourcage")) return illisible("« sourcage » absent : il est exigé sur toute sortie.");
  if (!formeReconnue(objet)) return illisible("ni « categorie » et « drapeaux », ni « noms_cites » et « non_reponse » : la sortie n'a aucune des deux formes attendues.");
  return { lisible: true, sortie: objet as unknown as SortieJuge };
}

/** Le texte du modèle, lu comme une sortie de juge ; illisible, avec sa raison, sinon. */
export function lireSortieJuge(texte: string): LectureSortieJuge {
  const lecture = lireJson(texte);
  if (!lecture.lisible) return illisible(`le texte du modèle n'est pas du JSON (${lecture.raison}).`);
  if (!estObjetJson(lecture.valeur)) return illisible("le texte du modèle est du JSON, mais pas un objet.");
  return lireObjet(lecture.valeur);
}
