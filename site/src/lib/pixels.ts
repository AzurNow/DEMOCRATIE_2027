/**
 * Petits dessins pixel de la page « exemple » (site/src/pages/exemple.astro), écrits en grilles de
 * caractères et convertis en rectangles à la construction (Astro statique, rien au runtime).
 *
 * Un caractère = un pixel. `.` est transparent ; chaque autre caractère nomme une variable `--px-…`
 * du thème (jetons.css), jamais une couleur en dur : le dessin suit le thème clair ou sombre.
 * Un caractère inconnu ou des lignes de longueurs différentes font échouer la construction :
 * jamais de pixel deviné.
 */

/** Caractère de la grille ⇒ suffixe de la variable `--px-…` (et de la classe `ex-px-…`). */
export const COULEURS_PIXEL = {
  e: "encre",
  p: "papier",
  c: "clair",
  g: "corps",
  k: "ciel",
  s: "sol",
  m: "mur",
  n: "ecran",
  "1": "accent-1",
  "2": "accent-2",
  "3": "accent-3",
} as const;

export type CouleurPixel = (typeof COULEURS_PIXEL)[keyof typeof COULEURS_PIXEL];

/** Une suite horizontale de pixels de même couleur. */
export interface RectanglePixel {
  readonly x: number;
  readonly y: number;
  readonly largeur: number;
  readonly couleur: CouleurPixel;
}

export interface DessinPixel {
  readonly largeur: number;
  readonly hauteur: number;
  readonly rectangles: readonly RectanglePixel[];
}

function couleurDe(caractere: string, ligne: number, colonne: number): CouleurPixel | null {
  if (caractere === ".") return null;
  if (!Object.hasOwn(COULEURS_PIXEL, caractere)) {
    throw new Error(`Pixel inconnu « ${caractere} » ligne ${ligne + 1}, colonne ${colonne + 1}.`);
  }
  return COULEURS_PIXEL[caractere as keyof typeof COULEURS_PIXEL];
}

/** Les rectangles d'une ligne : chaque suite de pixels de même couleur en un seul rectangle. */
function rectanglesDeLigne(ligne: string, y: number): RectanglePixel[] {
  const rectangles: RectanglePixel[] = [];
  let x = 0;
  while (x < ligne.length) {
    const couleur = couleurDe(ligne[x] ?? ".", y, x);
    let fin = x + 1;
    while (fin < ligne.length && ligne[fin] === ligne[x]) fin += 1;
    if (couleur !== null) rectangles.push({ x, y, largeur: fin - x, couleur });
    x = fin;
  }
  return rectangles;
}

/** Convertit une grille en rectangles. Refuse une grille vide ou des lignes de longueurs inégales. */
export function dessinDeGrille(grille: readonly string[]): DessinPixel {
  const largeur = grille[0]?.length ?? 0;
  if (largeur === 0) throw new Error("Dessin pixel vide.");
  grille.forEach((ligne, y) => {
    if (ligne.length !== largeur) {
      throw new Error(`Dessin pixel irrégulier : la ligne ${y + 1} a ${ligne.length} pixels, la première ${largeur}.`);
    }
  });
  return { largeur, hauteur: grille.length, rectangles: grille.flatMap((ligne, y) => rectanglesDeLigne(ligne, y)) };
}

/** Une personne anonyme (annotateur, humain qui note) ; `t` est la couleur du vêtement. */
function personne(t: "1" | "2" | "3"): string[] {
  return [
    "...eeeeee...",
    "..eeeeeeee..",
    "..ecccccce..",
    "..ececcece..",
    "..ecccccce..",
    "..ecceecce..",
    "...eeeeee...",
    "....ecce....",
    `..e${t.repeat(6)}e..`,
    `.e${t.repeat(8)}e.`,
    `e${t.repeat(10)}e`,
    `e${t.repeat(10)}e`,
    `e${t.repeat(10)}e`,
    "eeeeeeeeeeee",
  ];
}

/** Un juge automatique (robot) ; `t` est sa couleur, différente pour chaque famille de modèles. */
function juge(t: "1" | "3"): string[] {
  return [
    ".....ee.....",
    `.....${t}${t}.....`,
    ".eeeeeeeeee.",
    ".egggggggge.",
    ".egnnggnnge.",
    ".egnnggnnge.",
    ".egggggggge.",
    ".eggeeeegge.",
    ".eeeeeeeeee.",
    `..e${t.repeat(6)}e..`,
    `.e${t.repeat(8)}e.`,
    `.e${t}${t}eeee${t}${t}e.`,
    `.e${t.repeat(8)}e.`,
    ".eeeeeeeeee.",
  ];
}

/** Les dessins de la page, par nom. */
export const SPRITES = {
  banc: [
    "..eeeeeeeeeeee..",
    "..e3333333333e..",
    "..eeeeeeeeeeee..",
    "...e........e...",
    "eeeeeeeeeeeeeeee",
    "e33333333333333e",
    "eeeeeeeeeeeeeeee",
    ".ee..........ee.",
    ".ee..........ee.",
  ],
  archive: [
    "eeeeeeeeeeee",
    "emmmmmmmmmme",
    "emmmmeemmmme",
    "emmmmmmmmmme",
    "eeeeeeeeeeee",
    "emmmmmmmmmme",
    "emmmmeemmmme",
    "emmmmmmmmmme",
    "eeeeeeeeeeee",
    "emmmmmmmmmme",
    "emmmmeemmmme",
    "emmmmmmmmmme",
    "eeeeeeeeeeee",
  ],
  coche: ["......ee", ".....ee.", "ee..ee..", ".eeee...", "..ee...."],
  annotatrice: personne("1"),
  annotateur: personne("2"),
  humain: personne("3"),
  "juge-a": juge("1"),
  "juge-b": juge("3"),
  outil: [
    "eeeeeeeeeeeeee",
    "egggggggggggge",
    "egnnnnnnnnnnge",
    "egnennnnnnenge",
    "egnnnnnnnnnnge",
    "egnnneeeennnge",
    "egnnnnnnnnnnge",
    "egggggggggggge",
    "eeeeeeeeeeeeee",
    "....egggge....",
    "..eeeeeeeeee..",
  ],
  de: [
    "eeeeeeeeee",
    "ecccccccce",
    "eceeccccce",
    "eceeccccce",
    "eccceeccce",
    "eccceeccce",
    "eccccceece",
    "eccccceece",
    "ecccccccce",
    "eeeeeeeeee",
  ],
  horloge: [
    "eeeeeeeeeee",
    "eccccecccce",
    "eccccecccce",
    "eccccecccce",
    "eccccecccce",
    "ecccceeecce",
    "eccccccccce",
    "eccccccccce",
    "eccccccccce",
    "eccccccccce",
    "eeeeeeeeeee",
  ],
  coffre: [
    ".eeeeeeeeeeee.",
    "e333333333333e",
    "e333333333333e",
    "eeeeeeeeeeeeee",
    "e33333ee33333e",
    "e33333cc33333e",
    "e33333ee33333e",
    "e333333333333e",
    "eeeeeeeeeeeeee",
  ],
  dossier: [
    ".eeeee..........",
    "e33333eeeeeeeee.",
    "e3333333333333e.",
    "e33ppppppppp33e.",
    "e33peeeeeeep33e.",
    "e33ppppppppp33e.",
    "e33peeeeep3333e.",
    "eeeeeeeeeeeeeeee",
    "e33333333333333e",
    "e33333333333333e",
    "eeeeeeeeeeeeeeee",
  ],
} as const satisfies Record<string, readonly string[]>;

export type NomSprite = keyof typeof SPRITES;

/** Le dessin d'un sprite nommé. */
export function dessinDuSprite(nom: NomSprite): DessinPixel {
  return dessinDeGrille(SPRITES[nom]);
}
