/**
 * Les sept états de l'objet qui traverse le « fil du parcours » (page pédagogique).
 *
 * Chaque état est une grille de 16 x 16 pixels, composée de calques (un calque = des lignes de
 * caractères posées à un décalage). Le rendu est une liste de `<rect>` entiers, groupés par
 * couleur ; les couleurs ne sont que des classes `fil-…` que `fil.css` lie aux variables `--px-…`
 * du thème. Aucun contenu de mesure : ce sont des pictogrammes, sans chiffre ni axe.
 *
 * Légende : `#` encre, `p` papier, `c` clair, `g` gris du corps, `1` `2` `3` accents, `.` transparent.
 */

const TAILLE = 16;

interface Calque {
  readonly lignes: readonly string[];
  readonly x: number;
  readonly y: number;
}

const CLASSES: Readonly<Record<string, string>> = {
  "#": "fil-e",
  p: "fil-p",
  c: "fil-c",
  g: "fil-g",
  "1": "fil-a1",
  "2": "fil-a2",
  "3": "fil-a3",
};

function calque(x: number, y: number, ...lignes: string[]): Calque {
  return { lignes, x, y };
}

/** Rectangle bordé d'encre, intérieur rempli de `fond`. */
function boite(x: number, y: number, largeur: number, hauteur: number, fond: string): Calque {
  const haut = "#".repeat(largeur);
  const milieu = `#${fond.repeat(largeur - 2)}#`;
  return calque(x, y, haut, ...Array.from({ length: hauteur - 2 }, () => milieu), haut);
}

/** Pose les calques dans l'ordre sur une grille vide ; un pixel hors grille ou inconnu fait échouer la construction. */
function composer(nom: string, calques: readonly Calque[]): string[][] {
  const grille = Array.from({ length: TAILLE }, () => Array.from({ length: TAILLE }, () => "."));
  for (const c of calques) {
    c.lignes.forEach((ligne, dy) => {
      [...ligne].forEach((car, dx) => {
        if (car === ".") return;
        const ligneGrille = grille[c.y + dy];
        if (CLASSES[car] === undefined || ligneGrille === undefined || c.x + dx >= TAILLE) {
          throw new Error(`Fil du parcours, état « ${nom} » : pixel invalide « ${car} » en (${c.x + dx}, ${c.y + dy}).`);
        }
        ligneGrille[c.x + dx] = car;
      });
    });
  }
  return grille;
}

/** Fusionne les pixels contigus d'une ligne en un seul rectangle, groupés par couleur. */
function groupes(grille: string[][]): string {
  const parCouleur = new Map<string, string[]>();
  grille.forEach((ligne, y) => {
    let x = 0;
    while (x < ligne.length) {
      const car = ligne[x] ?? ".";
      let fin = x;
      while (fin + 1 < ligne.length && ligne[fin + 1] === car) fin += 1;
      if (car !== ".") {
        const liste = parCouleur.get(car) ?? [];
        liste.push(`<rect x="${x}" y="${y}" width="${fin - x + 1}" height="1"/>`);
        parCouleur.set(car, liste);
      }
      x = fin + 1;
    }
  });
  return [...parCouleur].map(([car, rects]) => `<g class="${CLASSES[car] ?? ""}">${rects.join("")}</g>`).join("");
}

const PAGE = boite(3, 1, 10, 14, "p");
const LIGNES_PAGE = [calque(5, 3, "gggggg"), calque(5, 5, "gggggg"), calque(5, 7, "ggg")];

/** Tampon rond à coche, posé en bas à droite de la fiche. */
const TAMPON = [
  calque(7, 7, "..###..", ".#222#.", "#22222#", "#22222#", "#22222#", ".#222#.", "..###.."),
  calque(8, 10, "#.#", ".#."),
  calque(11, 9, "#"),
];

const BULLE = [boite(1, 1, 14, 8, "p"), calque(3, 8, "p"), calque(2, 9, "#p#", "##.")];
const BULLE_TEXTE = [calque(3, 3, "gggggggggg"), calque(3, 5, "gggggggg")];

export interface EtatFil {
  readonly numero: number;
  readonly nom: string;
  /** Libellé court de la station : il ne dit rien de plus que le texte de l'étape. */
  readonly etiquette: string;
  /** Contenu d'un `<symbol viewBox="0 0 16 16">`. */
  readonly svg: string;
}

const ETATS_BRUTS: ReadonlyArray<{ nom: string; etiquette: string; calques: readonly Calque[] }> = [
  {
    nom: "collecter",
    etiquette: "source archivée",
    calques: [PAGE, ...LIGNES_PAGE, calque(5, 9, "1#1#", "#1#1", "1#1#", "#1#1"), calque(10, 10, "gg"), calque(10, 12, "gg")],
  },
  { nom: "valider", etiquette: "position vérifiée", calques: [PAGE, ...LIGNES_PAGE, ...TAMPON] },
  {
    nom: "questionner",
    etiquette: "question",
    calques: [
      boite(2, 2, 12, 12, "p"),
      calque(3, 3, "3333333333"),
      calque(6, 5, ".111.", "1...1", "....1", "..11.", "..1..", ".....", "..1.."),
    ],
  },
  {
    nom: "interroger",
    etiquette: "réponse brute",
    calques: [
      ...BULLE,
      ...BULLE_TEXTE,
      calque(9, 9, ".####.", ".#..#.", ".#..#.", "######", "#3333#", "#3##3#", "######"),
    ],
  },
  {
    nom: "noter",
    etiquette: "réponse notée",
    calques: [
      ...BULLE,
      ...BULLE_TEXTE,
      boite(9, 9, 6, 6, "c"),
      calque(10, 12, "2.2"),
      calque(11, 13, "2"),
      calque(13, 11, "2"),
    ],
  },
  {
    nom: "analyser",
    etiquette: "taux et intervalle",
    calques: [
      calque(5, 2, "######"),
      calque(5, 13, "######"),
      calque(7, 3, "##", "##", "##", "##", "##", "##", "##", "##", "##", "##"),
      boite(5, 5, 6, 6, "1"),
    ],
  },
  {
    nom: "publier",
    etiquette: "publié",
    calques: [
      boite(3, 3, 5, 7, "p"),
      calque(4, 5, "ggg"),
      calque(4, 7, "ggg"),
      boite(9, 4, 4, 6, "2"),
      boite(1, 9, 14, 6, "3"),
      calque(2, 11, "############"),
      calque(7, 10, "cc", "cc"),
    ],
  },
];

/** Les sept états, dans l'ordre des étapes. */
export const ETATS_FIL: readonly EtatFil[] = ETATS_BRUTS.map((e, i) => ({
  numero: i + 1,
  nom: e.nom,
  etiquette: e.etiquette,
  svg: groupes(composer(e.nom, e.calques)),
}));
