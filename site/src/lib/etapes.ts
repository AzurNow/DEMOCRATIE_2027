/**
 * Les sept étapes du parcours d'une question, dans l'ordre : leur nom (qui forme l'ancre
 * `#etape-<nom>`, le nom de l'illustration et celui de la station du fil) et la ligne courte de la
 * vue d'ensemble. Le texte de chaque étape vit dans site/src/sections/Parcours.astro ; cette liste
 * ne porte que ce que la vue d'ensemble et la numérotation partagent.
 */

export type NomEtape = "collecter" | "valider" | "questionner" | "interroger" | "noter" | "analyser" | "publier";

export interface EtapeParcours {
  readonly nom: NomEtape;
  /** Nom court affiché dans la vue d'ensemble. */
  readonly court: string;
  /** L'étape en quelques mots, sur une ligne. */
  readonly ligne: string;
}

export const ETAPES_PARCOURS: readonly EtapeParcours[] = [
  { nom: "collecter", court: "Collecter", ligne: "les sources, archivées" },
  { nom: "valider", court: "Valider", ligne: "mot pour mot, à deux" },
  { nom: "questionner", court: "Questionner", ligne: "les mêmes pour tous" },
  { nom: "interroger", court: "Interroger", ligne: "mêmes conditions, réponse brute" },
  { nom: "noter", court: "Noter", ligne: "deux juges, puis des humains" },
  { nom: "analyser", court: "Analyser", ligne: "des règles fixées avant" },
  { nom: "publier", court: "Publier", ligne: "tout, ensemble" },
];

/** L'ancre d'une étape dans la page. */
export function ancreEtape(nom: NomEtape): string {
  return `etape-${nom}`;
}

/** Le numéro (à partir de 1) d'une étape. Un nom absent de la liste est une erreur, jamais un 0. */
export function numeroEtape(nom: NomEtape): number {
  const indice = ETAPES_PARCOURS.findIndex((e) => e.nom === nom);
  if (indice === -1) throw new Error(`Étape du parcours inconnue : « ${nom} ».`);
  return indice + 1;
}
