// Générateur jetable des SVG de décors d'arrière-plan (jamais importé par du code de production).
// Usage : node scratch/decors/generer.mjs → écrit site/src/decors/*.svg
// Chaque pièce : une liste de groupes ; un groupe = { anim?, rects: [[rôle, x, y, w, h], ...] }.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SORTIE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site", "src", "decors");
mkdirSync(SORTIE, { recursive: true });

const VARS = {
  encre: ["--px-encre", "#1f2233"],
  corps: ["--px-corps", "#7f93a8"],
  clair: ["--px-clair", "#ffffff"],
  papier: ["--px-papier", "#fbf8ef"],
  ecran: ["--px-ecran", "#25364a"],
  sol: ["--px-sol", "#9a8f7a"],
  a1: ["--px-accent-1", "#e4572e"],
  a2: ["--px-accent-2", "#2e86c1"],
  a3: ["--px-accent-3", "#b08a5a"],
};

// --- primitives ---
const plein = (r, x, y, w, h, bord = "encre") => [[bord, x, y, w, h], [r, x + 1, y + 1, w - 2, h - 2]];
function pointille(r, x, y, w, h, pas = 3) {
  const out = [];
  for (let i = 0; i < w; i += pas * 2) out.push([r, x + i, y, Math.min(pas, w - i), 1], [r, x + i, y + h - 1, Math.min(pas, w - i), 1]);
  for (let j = pas; j < h - 1; j += pas * 2) out.push([r, x, y + j, 1, Math.min(pas, h - 1 - j)], [r, x + w - 1, y + j, 1, Math.min(pas, h - 1 - j)]);
  return out;
}
function anneau(r, cx, cy, rayon, ep) {
  const out = [];
  for (let j = -rayon; j <= rayon; j++) {
    let debut = null;
    for (let i = -rayon; i <= rayon + 1; i++) {
      const d = i * i + j * j;
      const dedans = i <= rayon && d <= rayon * rayon + rayon * 0.6 && d > (rayon - ep) * (rayon - ep) + (rayon - ep) * 0.6;
      if (dedans && debut === null) debut = i;
      if (!dedans && debut !== null) {
        out.push([r, cx + debut, cy + j, i - debut, 1]);
        debut = null;
      }
    }
  }
  return out;
}
function disque(r, cx, cy, rayon) {
  const out = [];
  for (let j = -rayon; j <= rayon; j++) {
    const demi = Math.floor(Math.sqrt(rayon * rayon + rayon * 0.6 - j * j));
    out.push([r, cx - demi, cy + j, 2 * demi + 1, 1]);
  }
  return out;
}
const glyphe = (r, x, y, rows) => rows.flatMap((ligne, j) => [...ligne].flatMap((c, i) => (c === "X" ? [[r, x + i, y + j, 1, 1]] : [])));
const POINT_INTERROGATION = [".XXX.", "X...X", "....X", "...X.", "..X..", ".....", "..X.."];
const bulle = (x, y, w, h, fond = "clair") => [
  ...plein(fond, x, y, w, h),
  [fond, x + 3, y + h - 1, 4, 1], [fond, x + 3, y + h, 3, 1],
  ["encre", x + 2, y + h, 1, 1], ["encre", x + 3, y + h + 1, 1, 1], ["encre", x + 6, y + h, 1, 1], ["encre", x + 4, y + h + 2, 2, 1], ["encre", x + 6, y + h + 1, 1, 1],
];
const lignes = (r, x, y, largeurs, pas = 3) => largeurs.map((w, i) => [r, x, y + i * pas, w, 1]);

// --- sortie ---
function ecrire(nom, w, h, groupes) {
  const prefixe = `decor-${nom.split("-")[0]}`;
  const roles = new Set();
  for (const g of groupes) for (const [r] of g.rects) roles.add(r);
  const css = [...roles].sort().map((r) => `.${prefixe}-${r}{fill:var(${VARS[r][0]},${VARS[r][1]})}`).join("\n");
  const corps = groupes
    .map((g) => {
      const parRole = new Map();
      for (const [r, x, y, rw, rh] of g.rects) {
        if (rw <= 0 || rh <= 0) continue;
        if (![x, y, rw, rh].every(Number.isInteger)) throw new Error(`${nom} : rect non entier ${[x, y, rw, rh]}`);
        if (!parRole.has(r)) parRole.set(r, []);
        parRole.get(r).push(`<rect x="${x}" y="${y}" width="${rw}" height="${rh}"/>`);
      }
      const interieur = [...parRole].map(([r, rs]) => `<g class="${prefixe}-${r}">${rs.join("")}</g>`).join("\n");
      return g.anim ? `<g class="${prefixe}-${g.anim}">\n${interieur}\n</g>` : interieur;
    })
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">\n<style>\n${css}\n</style>\n${corps}\n</svg>\n`;
  writeFileSync(join(SORTIE, `${nom}.svg`), svg);
  console.log(nom, Buffer.byteLength(svg), "octets");
}

// ===== Accroche : la même question, plusieurs outils, des réponses à comparer =====
{
  const bulles = [8, 68, 128].map((x, i) => ({ anim: `q${i + 1}`, rects: [...bulle(x, 14, 22, 19), ...glyphe("a1", x + 8, 18, POINT_INTERROGATION)] }));
  ecrire("accroche-haut", 160, 48, bulles);

  const boite = (x, accent) => [
    ...plein("corps", x, 38, 30, 26), [accent, x + 1, 39, 28, 4], ["ecran", x + 5, 47, 20, 8],
    ["clair", x + 8, 50, 3, 3], ["clair", x + 19, 50, 3, 3], ["encre", x + 12, 58, 6, 2],
    ["encre", x + 6, 64, 5, 3], ["encre", x + 19, 64, 5, 3],
  ];
  const reponses = [
    { anim: "r1", rects: [...bulle(2, 4, 36, 18), ...lignes("sol", 6, 8, [26, 20, 28, 14], 3)] },
    { anim: "r2", rects: [...bulle(62, 0, 30, 26), ...lignes("sol", 66, 4, [20, 22, 14, 21, 10], 3)] },
    { anim: "r3", rects: [...bulle(122, 6, 32, 15), ...lignes("sol", 126, 10, [22, 10, 24], 3)] },
  ];
  ecrire("accroche-bas", 160, 70, [...reponses, { rects: [...boite(5, "a1"), ...boite(65, "a2"), ...boite(125, "a3")] }]);
}

// ===== Questions : une loupe qui regarde un aspect précis de chaque carte =====
{
  const cartes = [];
  const accents = ["a1", "a2", "a3"];
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const x = 4 + i * 48;
      const y = 4 + j * 27;
      cartes.push(...plein("papier", x, y, 40, 22), [accents[(i + j) % 3], x + 1, y + 1, 38, 4], ...lignes("sol", x + 4, y + 8, [24 - i * 3, 30 - j * 4, 14 + i * 4], 4));
    }
  }
  const monture = [...anneau("a1", 14, 14, 10, 2), ["a1", 22, 22, 3, 3], ["a1", 25, 25, 3, 3], ["a1", 28, 28, 3, 3]];
  ecrire("questions", 144, 84, [{ rects: cartes }, { anim: "loupe", rects: monture }, { anim: "verre", rects: disque("clair", 14, 14, 8) }]);
}

// ===== Limites : un viseur sur un périmètre défini, le reste s'estompe =====
{
  const a = 6;
  const b = 138;
  const coins = [
    { anim: "coin-hg", rects: [["a1", a, a, 16, 3], ["a1", a, a, 3, 16]] },
    { anim: "coin-hd", rects: [["a1", b - 13, a, 16, 3], ["a1", b, a, 3, 16]] },
    { anim: "coin-bg", rects: [["a1", a, b, 16, 3], ["a1", a, b - 13, 3, 16]] },
    { anim: "coin-bd", rects: [["a1", b - 13, b, 16, 3], ["a1", b, b - 13, 3, 16]] },
  ];
  const dedans = [...plein("a2", 54, 54, 14, 14), ...plein("papier", 76, 62, 14, 14), ...plein("a3", 60, 78, 12, 12)];
  const dehors = [[14, 22], [108, 16], [118, 62], [16, 100], [96, 118], [12, 58], [50, 12]];
  const remplissages = dehors.map(([x, y]) => ["corps", x, y, 14, 14]);
  const contours = dehors.flatMap(([x, y]) => pointille("corps", x, y, 14, 14, 2));
  ecrire("limites", 144, 144, [{ rects: contours }, { anim: "dehors", rects: remplissages }, { rects: dedans }, ...coins]);
}

// ===== Préenregistrement : la méthode est gelée AVANT les premiers résultats =====
{
  const ligne = [["corps", 6, 36, 132, 2]];
  const piste = [["a2", 6, 36, 132, 2]];
  const jalonMethode = [
    ...plein("papier", 14, 4, 16, 20), ...lignes("sol", 17, 8, [10, 10, 7], 3), ["encre", 21, 24, 2, 10], ...plein("a2", 18, 33, 10, 6),
  ];
  const cadenasFerme = [...plein("a3", 24, 14, 12, 10), ["encre", 29, 18, 2, 3], ["encre", 26, 6, 2, 8], ["encre", 32, 6, 2, 8], ["encre", 26, 6, 8, 2]];
  const cadenasOuvert = [...plein("a3", 24, 14, 12, 10), ["encre", 29, 18, 2, 3], ["encre", 26, 3, 2, 7], ["encre", 26, 3, 8, 2]];
  const jalonResultats = [
    ...pointille("corps", 108, 4, 24, 20, 3), ...pointille("corps", 113, 14, 4, 6, 2), ...pointille("corps", 120, 10, 4, 10, 2),
    ["corps", 119, 24, 2, 10], ...plein("papier", 115, 33, 10, 6),
  ];
  const curseur = [["a1", 4, 42, 5, 2], ["a1", 3, 44, 7, 2], ["a1", 2, 46, 9, 2], ["encre", 6, 38, 1, 4]];
  ecrire("preenregistrement", 144, 52, [
    { rects: ligne }, { anim: "piste", rects: piste }, { rects: jalonMethode }, { rects: jalonResultats },
    { anim: "ouvert", rects: cadenasOuvert }, { anim: "ferme", rects: cadenasFerme }, { anim: "curseur", rects: curseur },
  ]);
}

// ===== Contester : le circuit d'une contestation, une correction s'ajoute et n'efface pas =====
{
  const personne = (x, y, c) => [...plein("corps", x + 3, y, 10, 10), ...plein(c, x, y + 11, 16, 14)];
  const contestataire = personne(10, 6, "a2");
  const panel = [personne(36, 78, "a1"), personne(64, 74, "a3"), personne(92, 78, "a2")].flat();
  const table = plein("sol", 28, 106, 88, 5);
  const chemin1 = [[34, 32], [38, 38], [42, 44], [46, 50], [50, 56]].map(([x, y]) => ["corps", x, y, 3, 3]);
  const chemin2 = [[70, 116], [70, 122], [70, 128]].map(([x, y]) => ["corps", x, y, 3, 3]);
  const enveloppe = [
    ...plein("papier", 0, 0, 16, 11), ["encre", 2, 2, 2, 1], ["encre", 4, 3, 2, 1], ["encre", 6, 4, 4, 1],
    ["encre", 10, 3, 2, 1], ["encre", 12, 2, 2, 1], ["a1", 7, 5, 2, 2],
  ];
  const ancienne = [...plein("papier", 14, 136, 52, 52), ...lignes("sol", 20, 144, [38, 30, 34, 22, 36, 26], 5), ["a3", 20, 180, 14, 3]];
  const nouvelle = [
    ...plein("papier", 78, 136, 52, 52), ["a2", 79, 137, 50, 9], ["clair", 83, 140, 3, 3], ["clair", 89, 140, 3, 3], ["clair", 95, 140, 3, 3],
    ...lignes("sol", 84, 152, [38, 30, 34, 22, 30], 5), ["a2", 84, 178, 18, 3], ["a2", 106, 178, 2, 2],
  ];
  ecrire("contester", 144, 196, [
    { rects: contestataire }, { rects: [...chemin1, ...chemin2] }, { rects: [...table, ...panel] },
    { rects: ancienne }, { anim: "nouvelle", rects: nouvelle }, { anim: "enveloppe", rects: enveloppe },
  ]);
}
