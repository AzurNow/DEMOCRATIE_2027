// Générateur des huit illustrations pixel art de la page pédagogique (jetable, jamais importé).
// Usage : node scratch/illustrations/generer.mjs   → écrit site/src/illustrations/*.svg
// Une grille 160x120 de rôles de couleur ; chaque rôle devient une classe CSS ill-<nom>-<rôle>
// qui lit une variable --px-… (avec repli). Les rect sont fusionnés par ligne puis en colonne.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const W = 160;
const H = 120;
const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ROLES = { E: "encre", C: "corps", c: "clair", P: "papier", S: "ecran", M: "mur", F: "sol", K: "ciel", 1: "a1", 2: "a2", 3: "a3" };
const VARS = {
  encre: ["--px-encre", "#1f2233"],
  corps: ["--px-corps", "#7f93a8"],
  clair: ["--px-clair", "#ffffff"],
  papier: ["--px-papier", "#fbf8ef"],
  ecran: ["--px-ecran", "#25364a"],
  mur: ["--px-mur", "#e8e1d0"],
  sol: ["--px-sol", "#9a8f7a"],
  ciel: ["--px-ciel", "#bfe3f0"],
  a1: ["--px-accent-1", "#e4572e"],
  a2: ["--px-accent-2", "#2e86c1"],
  a3: ["--px-accent-3", "#b08a5a"],
};

class Couche {
  constructor() {
    this.g = Array.from({ length: H }, () => Array(W).fill(null));
  }
  px(x, y, ch) {
    if (x >= 0 && x < W && y >= 0 && y < H) this.g[y][x] = ch === "." ? this.g[y][x] : ch;
  }
  rect(ch, x, y, w, h) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, ch);
  }
  box(x, y, w, h, fill, border = "E", hl = "c") {
    this.rect(border, x, y, w, h);
    this.rect(fill, x + 1, y + 1, w - 2, h - 2);
    if (hl) {
      this.rect(hl, x + 1, y + 1, w - 2, 1);
      this.rect(hl, x + 1, y + 1, 1, h - 2);
    }
  }
  disc(cx, cy, r, ch) {
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + r * 0.6) this.px(cx + i, cy + j, ch);
  }
  ring(cx, cy, r, ch, epaisseur = 1) {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const d = i * i + j * j;
        if (d <= r * r + r * 0.6 && d > (r - epaisseur) * (r - epaisseur) + (r - epaisseur) * 0.6) this.px(cx + i, cy + j, ch);
      }
  }
  line(ch, x0, y0, x1, y1, t = 1, pas = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let k = 0; k <= n; k++) {
      if (k % pas !== 0) continue;
      const x = Math.round(x0 + ((x1 - x0) * k) / (n || 1));
      const y = Math.round(y0 + ((y1 - y0) * k) / (n || 1));
      this.rect(ch, x, y, t, t);
    }
  }
  spr(lignes, x, y, carte = {}, s = 1, flip = false) {
    lignes.forEach((l, j) => {
      const row = flip ? [...l].reverse() : [...l];
      row.forEach((c, i) => {
        if (c === ".") return;
        this.rect(carte[c] ?? c, x + i * s, y + j * s, s, s);
      });
    });
  }
}

const PERSONNE = [
  "...EEEEEE...",
  "..ECCCCCCE..",
  "..ECCCCCcE..",
  "..ECCCCCCE..",
  "..ECCCCCCE..",
  "...EEEEEE...",
  "..EEEEEEEE..",
  ".EBBBBBBBBE.",
  ".EBBBBBBBBE.",
  ".EBBBBBBBBE.",
  ".EBBBBBBBBE.",
  ".EBBBBBBBBE.",
  "..EEBBBBEE..",
  "..ECCEECCE..",
  "..ECCEECCE..",
  "..ECCEECCE..",
  "..EEEEEEEE..",
];
const POINT_INT = ["..PPP..", ".P...P.", "....P..", "...P...", "...P...", ".......", "...P..."];
const COCHE = ["........11.", ".......111.", "......111..", "1....111...", "11..111....", ".1111......", "..11......."];

function personne(L, x, y, chemise = "1", { s = 2, flip = false, haut = false } = {}) {
  const lignes = haut ? PERSONNE.slice(0, 13) : PERSONNE;
  L.spr(lignes, x, y, { B: chemise }, s, flip);
}

function salle(L) {
  L.rect("M", 0, 0, W, 92);
  L.rect("F", 0, 92, W, 28);
  L.rect("E", 0, 91, W, 1);
  for (let x = 6; x < W; x += 32) L.rect("c", x, 104, 8, 1);
  for (let x = 22; x < W; x += 32) L.rect("c", x, 112, 8, 1);
}

function boite(L, x, y, w, h, corps = "2") {
  L.box(x, y, w, h, corps);
  L.box(x + 3, y + 3, w - 6, h - 12, "S", "E", null);
  for (let i = 0; i < 2; i++) L.rect("E", x + 5, y + h - 6 + i * 2, w - 10, 1);
  L.rect("E", x + 3, y + h, 4, 3);
  L.rect("E", x + w - 7, y + h, 4, 3);
  L.rect("E", x + w - 8, y - 6, 1, 6);
  L.rect("1", x + w - 10, y - 9, 5, 3);
}

function bulle(L, x, y, w, h, tx) {
  L.box(x, y, w, h, "P", "E", null);
  for (let r = 0; r < 4; r++) {
    const ww = 8 - 2 * r;
    const xs = tx + r;
    const y0 = y + h - 1 + r;
    L.rect("P", xs + 1, y0, ww - 2, 1);
    L.px(xs, y0, "E");
    L.px(xs + ww - 1, y0, "E");
  }
  L.rect("E", tx + 3, y + h + 3, 2, 1);
}

function barres(L, x, y, largeurs, ch = "E", pas = 5) {
  largeurs.forEach((w, i) => L.rect(ch, x, y + i * pas, w, 2));
}

function pietement(L, x, y, w, h) {
  L.box(x, y, w, 5, "3");
  L.box(x + 2, y + 5, 4, h - 5, "3");
  L.box(x + w - 6, y + 5, 4, h - 5, "3");
}

// ---------------------------------------------------------------------------------------------
// Scènes. Chaque scène remplit `S.base` et appelle `S.anim(classe, couche, css)`.
// ---------------------------------------------------------------------------------------------

function accroche(S) {
  const L = S.base;
  salle(L);
  L.box(66, 8, 28, 24, "K", "E", "c");
  L.rect("E", 79, 9, 2, 22);
  L.rect("E", 67, 19, 26, 2);
  L.rect("c", 70, 12, 6, 2);
  L.rect("c", 84, 24, 6, 2);
  // personne derrière le bureau
  personne(L, 10, 48, "1", { haut: true });
  pietement(L, 4, 72, 80, 20);
  // écran
  L.box(40, 44, 28, 24, "C");
  L.box(43, 47, 22, 17, "S", "E", null);
  L.spr(POINT_INT, 46, 49, { P: "P" }, 1);
  L.rect("P", 46, 59, 14, 1);
  L.rect("E", 52, 68, 4, 4);
  L.box(38, 69, 26, 3, "P");
  // cadre d'une question dans une bulle
  bulle(L, 6, 8, 40, 26, 16);
  L.spr(POINT_INT, 11, 14, { P: "E" }, 2);
  L.rect("E", 26, 17, 14, 2);
  L.rect("E", 26, 22, 9, 2);
  // chemin de la question
  for (let x = 70; x < 98; x += 4) L.rect("2", x, 62, 2, 2);
  // la boîte qui parle
  boite(L, 100, 56, 40, 34, "2");
  bulle(L, 100, 6, 54, 28, 116);
  const bs = new Couche();
  bs.rect("E", 106, 12, 36, 2);
  S.anim("l1", bs, "animation:ill-accroche-apparait 3.6s steps(1,end) infinite backwards;");
  const b2 = new Couche();
  b2.rect("E", 106, 18, 42, 2);
  S.anim("l2", b2, "animation:ill-accroche-apparait 3.6s steps(1,end) .6s infinite backwards;");
  const b3 = new Couche();
  b3.rect("E", 106, 24, 26, 2);
  S.anim("l3", b3, "animation:ill-accroche-apparait 3.6s steps(1,end) 1.2s infinite backwards;");
  const paquet = new Couche();
  paquet.box(70, 59, 7, 6, "P");
  paquet.rect("1", 72, 61, 3, 2);
  S.anim("paquet", paquet, "animation:ill-accroche-voyage 2.4s steps(6,end) infinite;");
  const curseur = new Couche();
  curseur.rect("P", 62, 49, 2, 6);
  S.anim("curseur", curseur, "animation:ill-accroche-clig 1.2s steps(1,end) infinite;");
  const pts = new Couche();
  [114, 120, 126].forEach((x) => pts.rect("P", x, 62, 3, 3));
  S.anim("pts", pts, "animation:ill-accroche-clig 1.8s steps(1,end) infinite;");
  S.css(`@keyframes ill-accroche-apparait{0%{opacity:0}20%,90%{opacity:1}100%{opacity:0}}
@keyframes ill-accroche-voyage{0%{transform:translateX(0)}100%{transform:translateX(24px)}}
@keyframes ill-accroche-clig{0%{opacity:1}50%{opacity:0}100%{opacity:1}}`);
}

function collecter(S) {
  const L = S.base;
  salle(L);
  // armoire à tiroirs
  L.box(6, 12, 58, 80, "3");
  for (let c = 0; c < 2; c++)
    for (let r = 0; r < 4; r++) {
      const x = 10 + c * 26;
      const y = 17 + r * 18;
      L.box(x, y, 24, 14, "3");
      L.rect("E", x + 8, y + 8, 8, 3);
      L.rect("c", x + 9, y + 8, 6, 1);
      L.box(x + 8, y + 2, 8, 4, "P", "E", null);
    }
  // tiroir qui sort (animé) : par-dessus celui de la 2e colonne, 2e rang
  const t = new Couche();
  t.rect("P", 38, 34, 8, 2);
  t.rect("P", 49, 33, 6, 3);
  t.box(36, 35, 24, 14, "3");
  t.rect("E", 44, 43, 8, 3);
  t.rect("c", 45, 43, 6, 1);
  t.box(44, 37, 8, 4, "P", "E", null);
  S.anim("tiroir", t, "animation:ill-collecter-tire 3s steps(3,end) infinite;");
  // archiviste, un document à la main
  personne(L, 78, 58, "2");
  L.box(70, 66, 10, 13, "P");
  L.rect("E", 72, 70, 6, 1);
  L.rect("E", 72, 73, 6, 1);
  L.rect("E", 72, 76, 4, 1);
  L.rect("C", 76, 74, 4, 3);
  L.rect("E", 76, 77, 4, 1);
  // table, dossier scellé et pile
  pietement(L, 102, 74, 54, 18);
  L.box(108, 62, 30, 12, "2");
  L.box(108, 59, 10, 4, "2");
  L.rect("P", 142, 66, 12, 2);
  L.box(142, 68, 12, 6, "P");
  L.box(143, 62, 11, 6, "P");
  L.rect("1", 122, 62, 3, 12);
  L.disc(123, 68, 4, "E");
  L.disc(123, 68, 3, "1");
  // fiche d'empreinte au mur
  L.box(108, 14, 30, 34, "P");
  const motif = ["1.11.1", ".1..11", "11.1..", "1..1.1", ".11.1.", "1.1.11"];
  motif.forEach((ln, j) => [...ln].forEach((c, i) => c === "1" && L.rect("E", 113 + i * 4, 19 + j * 4, 3, 3)));
  L.rect("E", 113, 43, 20, 2);
  L.rect("2", 123, 50, 1, 8);
  for (let y = 50; y < 58; y += 3) L.rect("2", 123, y, 1, 2);
  const lueur = new Couche();
  lueur.rect("c", 121, 65, 2, 2);
  S.anim("lueur", lueur, "animation:ill-collecter-clig 1.6s steps(1,end) infinite;");
  const feuille = new Couche();
  feuille.box(66, 56, 8, 10, "P");
  S.anim("feuille", feuille, "animation:ill-collecter-vol 3s steps(6,end) infinite;");
  S.css(`@keyframes ill-collecter-tire{0%,10%{transform:translateX(0)}35%,65%{transform:translateX(7px)}90%,100%{transform:translateX(0)}}
@keyframes ill-collecter-clig{0%{opacity:1}50%{opacity:0}100%{opacity:1}}
@keyframes ill-collecter-vol{0%{transform:translate(0,0);opacity:1}85%{transform:translate(-18px,-12px);opacity:1}100%{transform:translate(-18px,-12px);opacity:0}}`);
}

function valider(S) {
  const L = S.base;
  salle(L);
  // chevalet et page commune
  L.rect("E", 36, 52, 3, 40);
  L.rect("E", 112, 52, 3, 40);
  L.box(20, 6, 120, 50, "P");
  barres(L, 28, 12, [60, 76, 44]);
  L.rect("1", 28, 29, 96, 7);
  barres(L, 30, 30, [90]);
  L.rect("E", 30, 33, 70, 2);
  barres(L, 28, 41, [80, 52]);
  // deux annotateurs
  personne(L, 30, 58, "1");
  personne(L, 106, 58, "2", { flip: true });
  // loupes
  [[48, 28, "L"], [112, 28, "R"]].forEach(([cx, cy, k]) => {
    L.disc(cx, cy, 11, "P");
    L.rect("1", cx - 9, cy - 3, 18, 7);
    L.rect("E", cx - 9, cy - 1, 16, 3);
    L.ring(cx, cy, 11, "E", 2);
    L.rect("c", cx - 7, cy - 8, 3, 1);
    L.line("E", k === "L" ? cx + 8 : cx - 8, cy + 8, k === "L" ? 54 : 106, 58, 2);
  });
  // table, tampon et encreur
  pietement(L, 62, 72, 38, 20);
  L.box(64, 66, 18, 6, "1");
  L.rect("E", 66, 70, 14, 1);
  const tampon = new Couche();
  tampon.box(88, 52, 8, 5, "3");
  tampon.box(90, 40, 4, 12, "3");
  tampon.box(86, 57, 12, 6, "2");
  S.anim("tampon", tampon, "animation:ill-valider-frappe 2.8s steps(2,end) infinite;");
  // marque de validation sur la page
  const marque = new Couche();
  marque.spr(COCHE, 66, 42, {}, 2);
  S.anim("marque", marque, "animation:ill-valider-marque 2.8s steps(1,end) infinite;");
  S.css(`@keyframes ill-valider-frappe{0%,40%{transform:translateY(0)}55%,70%{transform:translateY(7px)}100%{transform:translateY(0)}}
@keyframes ill-valider-marque{0%,55%{opacity:0}56%,100%{opacity:1}}`);
}

function questionner(S) {
  const L = S.base;
  salle(L);
  // machine à tirer
  L.rect("E", 14, 84, 6, 8);
  L.rect("E", 44, 84, 6, 8);
  L.box(8, 28, 52, 56, "2");
  L.box(14, 34, 40, 14, "S", "E", null);
  const g = ["P", "1", "P", "P", "3", "P", "1", "P", "P"];
  g.forEach((c, i) => L.rect(c, 17 + i * 4, 38, 3, 6));
  L.box(14, 54, 24, 24, "3");
  for (let i = 0; i < 3; i++) L.rect("E", 18, 60 + i * 5, 16, 2);
  L.box(54, 46, 8, 10, "E", "E", null);
  // dé sur la machine
  L.box(22, 12, 16, 16, "P");
  [[25, 15], [33, 15], [29, 19], [25, 23], [33, 23]].forEach(([x, y]) => L.rect("E", x, y, 3, 3));
  // manivelle
  L.rect("E", 2, 56, 7, 3);
  const m1 = new Couche();
  m1.rect("E", 2, 48, 3, 11);
  m1.box(0, 44, 7, 6, "1");
  S.anim("m1", m1, "animation:ill-questionner-m1 1.4s steps(1,end) infinite;");
  const m2 = new Couche();
  m2.rect("E", 2, 56, 3, 11);
  m2.box(0, 65, 7, 6, "1");
  S.anim("m2", m2, "animation:ill-questionner-m2 1.4s steps(1,end) infinite;", "opacity:0;");
  // rails
  L.box(62, 46, 20, 6, "3");
  L.box(80, 18, 4, 66, "3");
  [20, 50, 80].forEach((y) => L.box(84, y - 2, 38, 5, "3"));
  [10, 40, 70].forEach((y) => boite(L, 124, y, 32, 20, "2"));
  [20, 50, 80].forEach((y, k) => {
    const c = new Couche();
    [88, 104].forEach((x) => {
      c.box(x, y - 11, 7, 9, "P");
      c.rect("1", x + 2, y - 8, 3, 4);
    });
    S.anim(`cartes${k}`, c, "animation:ill-questionner-cartes 2s steps(4,end) infinite;");
  });
  S.css(`@keyframes ill-questionner-cartes{0%{transform:translateX(0)}100%{transform:translateX(16px)}}
@keyframes ill-questionner-m1{0%{opacity:1}50%,100%{opacity:0}}
@keyframes ill-questionner-m2{0%,50%{opacity:0}51%,100%{opacity:1}}`);
}

function interroger(S) {
  const L = S.base;
  salle(L);
  L.box(40, 57, 118, 4, "3");
  L.rect("E", 50, 61, 3, 6);
  L.rect("E", 146, 61, 3, 6);
  const modele = new Couche();
  bulle(modele, 0, 6, 24, 14, 3);
  modele.rect("E", 4, 10, 14, 2);
  modele.rect("E", 4, 14, 9, 2);
  S.defs.push({ id: "bulle", couche: modele });
  [44, 72, 100, 128].forEach((x, k) => {
    boite(L, x, 34, 24, 23, k % 2 ? "3" : "2");
    S.animUse(`b${k}`, "bulle", x, `animation:ill-interroger-apparait 4s steps(1,end) ${k * 0.6}s infinite backwards;`);
  });
  // horloge
  L.disc(20, 46, 11, "E");
  L.disc(20, 46, 9, "P");
  [[20, 38, 1, 2], [20, 52, 1, 2], [12, 46, 2, 1], [27, 46, 2, 1]].forEach(([x, y, w, h]) => L.rect("E", x, y, w, h));
  L.line("1", 20, 46, 16, 42, 2);
  L.rect("E", 19, 45, 3, 3);
  const mains = [[20, 39], [26, 46], [20, 53], [13, 46]];
  mains.forEach(([x1, y1], i) => {
    const h = new Couche();
    h.line("E", 20, 46, x1, y1, 1);
    S.anim(`h${i}`, h, `animation:ill-interroger-h${i} 3.2s steps(1,end) infinite;`, i === 0 ? "" : "opacity:0;");
  });
  for (let y = 60; y < 90; y += 4) L.rect("2", 19, y, 2, 2);
  // fenêtre de temps
  L.box(6, 94, 80, 8, "P");
  for (let x = 14; x < 82; x += 16) L.rect("E", x, 91, 1, 3);
  L.rect("1", 30, 95, 32, 6);
  L.rect("E", 28, 90, 2, 16);
  L.rect("E", 62, 90, 2, 16);
  // coffre ouvert
  L.box(96, 88, 54, 24, "3");
  L.rect("E", 96, 96, 54, 2);
  L.box(98, 82, 50, 8, "S", "E", null);
  L.box(104, 83, 12, 6, "P");
  L.box(124, 84, 14, 5, "P");
  L.box(118, 99, 8, 8, "1");
  [106, 134].forEach((x, k) => {
    const d = new Couche();
    bulle(d, x, 62, 12, 6, x + 1);
    S.anim(`d${k}`, d, `animation:ill-interroger-chute 2.4s steps(5,end) ${k * 1.2}s infinite backwards;`);
  });
  const frames = [0, 1, 2, 3].map((i) => `@keyframes ill-interroger-h${i}{0%,24%{opacity:${i === 0 ? 1 : 0}}25%,49%{opacity:${i === 1 ? 1 : 0}}50%,74%{opacity:${i === 2 ? 1 : 0}}75%,100%{opacity:${i === 3 ? 1 : 0}}}`).join("\n");
  S.css(`@keyframes ill-interroger-apparait{0%{opacity:0}15%,85%{opacity:1}100%{opacity:0}}
@keyframes ill-interroger-chute{0%{transform:translateY(0);opacity:1}80%{transform:translateY(16px);opacity:1}100%{transform:translateY(16px);opacity:0}}
${frames}`);
}

function noter(S) {
  const L = S.base;
  salle(L);
  // robot carré (famille 1)
  L.rect("E", 24, 24, 2, 10);
  L.box(22, 20, 6, 5, "1");
  L.box(12, 34, 26, 18, "2");
  L.box(16, 38, 18, 8, "S", "E", null);
  L.box(10, 54, 30, 26, "2");
  L.rect("E", 16, 60, 18, 2);
  L.rect("E", 16, 65, 18, 2);
  L.rect("E", 14, 80, 8, 12);
  L.rect("E", 28, 80, 8, 12);
  // robot rond (famille 2)
  L.disc(60, 42, 12, "E");
  L.disc(60, 42, 11, "3");
  L.rect("c", 54, 33, 6, 2);
  L.disc(60, 42, 5, "E");
  L.disc(60, 42, 4, "S");
  L.px(59, 41, "P");
  L.box(50, 58, 20, 18, "3");
  L.rect("E", 56, 64, 8, 2);
  L.disc(60, 84, 8, "E");
  L.disc(60, 84, 6, "C");
  L.rect("c", 58, 82, 3, 3);
  // humain qui vérifie, une planchette
  personne(L, 76, 58, "1");
  L.box(92, 66, 14, 18, "P");
  L.spr(COCHE, 94, 68, { 1: "1" }, 1);
  L.rect("E", 95, 78, 9, 1);
  L.rect("E", 95, 81, 6, 1);
  // grille de cases
  L.box(104, 10, 52, 48, "P");
  const etats = ["1.2.1", "21.1.", ".2.12", "1.1.2"];
  etats.forEach((ln, j) =>
    [...ln].forEach((c, i) => {
      const x = 108 + i * 9;
      const y = 14 + j * 9;
      L.box(x, y, 8, 8, "P", "E", null);
      if (c !== ".") L.rect(c, x + 2, y + 2, 4, 4);
    }),
  );
  [[0, 1, "1"], [2, 0, "2"], [4, 3, "1"]].forEach(([i, j, c], k) => {
    const o = new Couche();
    o.rect(c, 108 + i * 9 + 2, 14 + j * 9 + 2, 4, 4);
    S.anim(`case${k}`, o, `animation:ill-noter-apparait 3.6s steps(1,end) ${k * 0.8}s infinite backwards;`);
  });
  const scan = new Couche();
  scan.rect("P", 17, 39, 2, 6);
  const scan2 = new Couche();
  scan2.rect("P", 59, 41, 3, 3);
  S.anim("scan", scan, "animation:ill-noter-scan 1.6s steps(5,end) infinite;");
  S.anim("oeil", scan2, "animation:ill-noter-oeil 2.4s steps(1,end) infinite;");
  S.css(`@keyframes ill-noter-apparait{0%{opacity:0}15%,90%{opacity:1}100%{opacity:0}}
@keyframes ill-noter-scan{0%{transform:translateX(0)}100%{transform:translateX(12px)}}
@keyframes ill-noter-oeil{0%{opacity:1}60%{opacity:0}70%,100%{opacity:1}}`);
}

function analyser(S) {
  const L = S.base;
  salle(L);
  L.rect("E", 24, 72, 3, 20);
  L.rect("E", 88, 72, 3, 20);
  L.box(8, 8, 100, 64, "P");
  const lignes = [
    [22, 60, 18, 22, "1"],
    [35, 48, 12, 14, "2"],
    [48, 72, 24, 10, "3"],
    [61, 56, 26, 20, "1"],
  ];
  const f0 = new Couche();
  const f1 = new Couche();
  lignes.forEach(([y, cx, a, b, c]) => {
    L.rect(c, 14, y - 3, 7, 7);
    L.rect("E", 14, y - 3, 7, 1);
    L.rect("E", 14, y + 3, 7, 1);
    f0.rect("E", cx - a, y, a + b + 1, 1);
    f0.rect("E", cx - a, y - 3, 1, 7);
    f0.rect("E", cx + b, y - 3, 1, 7);
    f1.rect("E", cx - a + 4, y, a + b - 7, 1);
    f1.rect("E", cx - a + 4, y - 3, 1, 7);
    f1.rect("E", cx + b - 4, y - 3, 1, 7);
    L.box(cx - 3, y - 3, 7, 7, c);
  });
  S.anim("w0", f0, "animation:ill-analyser-w0 2.8s steps(1,end) infinite;");
  S.anim("w1", f1, "animation:ill-analyser-w1 2.8s steps(1,end) infinite;", "opacity:0;");
  // calendrier daté avant, cahier scellé
  L.box(122, 8, 32, 26, "P");
  L.rect("1", 123, 9, 30, 6);
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) L.rect(i === 1 && j === 0 ? "2" : "E", 127 + i * 6, 19 + j * 5, 3, 3);
  for (let y = 36; y < 44; y += 3) L.rect("2", 138, y, 2, 2);
  L.rect("2", 135, 44, 8, 1);
  L.rect("2", 136, 45, 6, 1);
  L.rect("2", 137, 46, 4, 1);
  L.box(120, 50, 36, 41, "2");
  L.rect("E", 120, 50, 6, 41);
  L.rect("3", 121, 51, 4, 39);
  L.box(120, 62, 36, 8, "P");
  L.disc(142, 66, 6, "E");
  L.disc(142, 66, 5, "1");
  const reflet = new Couche();
  reflet.rect("c", 139, 63, 2, 2);
  S.anim("reflet", reflet, "animation:ill-analyser-clig 1.6s steps(1,end) infinite;");
  S.css(`@keyframes ill-analyser-w0{0%{opacity:1}50%,100%{opacity:0}}
@keyframes ill-analyser-w1{0%{opacity:0}50%,100%{opacity:1}}
@keyframes ill-analyser-clig{0%{opacity:1}50%{opacity:0}100%{opacity:1}}`);
}

function publier(S) {
  const L = S.base;
  salle(L);
  // coffre ouvert
  L.box(8, 68, 58, 24, "3");
  L.rect("E", 8, 76, 58, 2);
  L.box(10, 62, 54, 8, "S", "E", null);
  L.box(30, 80, 8, 8, "1");
  L.box(12, 40, 54, 10, "3");
  L.rect("E", 14, 50, 3, 12);
  L.rect("E", 59, 50, 3, 12);
  // étagère publique
  L.box(100, 8, 56, 84, "3");
  L.box(104, 12, 48, 76, "M");
  [34, 58, 82].forEach((y) => L.box(104, y, 48, 5, "3"));
  const folder = (c, x, y) => {
    c.box(x, y, 14, 10, "2");
    c.box(x, y - 3, 6, 4, "2");
  };
  const bub = (c, x, y) => {
    c.box(x, y, 14, 8, "P");
    c.rect("E", x + 2, y + 2, 9, 1);
    c.rect("E", x + 2, y + 5, 6, 1);
    c.rect("E", x + 2, y + 8, 2, 1);
  };
  const code = (c, x, y) => {
    c.box(x, y, 14, 10, "P");
    c.spr(["..E", ".E.", "E..", ".E.", "..E"], x + 2, y + 2);
    c.spr(["E..", ".E.", "..E", ".E.", "E.."], x + 9, y + 2);
  };
  const ordres = [[folder, bub, code], [bub, code, folder], [code, folder, bub]];
  [34, 58, 82].forEach((y, r) => ordres[r].forEach((f, i) => f(L, 108 + i * 15, y - 11 + (f === bub ? 1 : 0))));
  // objets qui s'envolent
  [[folder, 0, 18], [bub, 1, 26], [code, 2, 36]].forEach(([f, k, x]) => {
    const o = new Couche();
    f(o, x, 54);
    S.anim(`o${k}`, o, `animation:ill-publier-vol 3.6s steps(8,end) ${k * 1.2}s infinite backwards;`);
  });
  for (let x = 70; x < 98; x += 4) L.rect("2", x, 60 - (x - 70) / 4, 2, 2);
  S.css(`@keyframes ill-publier-vol{0%{transform:translate(0,0);opacity:1}85%{transform:translate(56px,-8px);opacity:1}100%{transform:translate(56px,-8px);opacity:0}}`);
}

// ---------------------------------------------------------------------------------------------
// Émission
// ---------------------------------------------------------------------------------------------

function rectsParRole(couche) {
  const runs = new Map();
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const c = couche.g[y][x];
      if (c === null) {
        x++;
        continue;
      }
      let e = x;
      while (e < W && couche.g[y][e] === c) e++;
      if (!runs.has(c)) runs.set(c, []);
      runs.get(c).push({ x, y, w: e - x, h: 1 });
      x = e;
    }
  }
  const out = new Map();
  for (const [c, liste] of runs) {
    const ouverts = new Map();
    const finis = [];
    for (const r of liste) {
      const cle = `${r.x},${r.w}`;
      const o = ouverts.get(cle);
      if (o && o.y + o.h === r.y) o.h++;
      else {
        if (o) finis.push(o);
        ouverts.set(cle, { ...r });
      }
    }
    out.set(c, [...finis, ...ouverts.values()].sort((a, b) => a.y - b.y || a.x - b.x));
  }
  return out;
}

function groupes(couche, nom) {
  const parRole = rectsParRole(couche);
  return [...parRole]
    .map(([c, rs]) => `<g class="ill-${nom}-${ROLES[c]}">${rs.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/>`).join("")}</g>`)
    .join("\n");
}

function roles(couche) {
  return new Set(couche.g.flat().filter((c) => c !== null));
}

function construire(nom, scene) {
  const S = {
    base: new Couche(),
    anims: [],
    defs: [],
    cssExtra: [],
    css(t) {
      this.cssExtra.push(t);
    },
    animUse(cls, id, x, regle) {
      this.anims.push({ cls, use: { id, x }, couche: new Couche(), regle, base: "" });
    },
    anim(cls, couche, regle, base = "") {
      this.anims.push({ cls, couche, regle, base });
    },
  };
  scene(S);
  const used = roles(S.base);
  S.anims.forEach((a) => roles(a.couche).forEach((r) => used.add(r)));
  S.defs.forEach((d) => roles(d.couche).forEach((r) => used.add(r)));
  const p = `ill-${nom}-`;
  const css = [];
  [...used].forEach((c) => css.push(`.${p}${ROLES[c]}{fill:var(${VARS[ROLES[c]][0]},${VARS[ROLES[c]][1]})}`));
  S.anims.forEach((a) => css.push(`.${p}${a.cls}{${a.base}${a.regle}}`));
  const css2 = S.cssExtra.join("\n");
  const reduit = S.anims.map((a) => `.${p}${a.cls}`).join(",");
  const style = `${css.join("\n")}\n${css2}\n@media (prefers-reduced-motion: reduce){${reduit}{animation:none}}`;
  const corps = [
    groupes(S.base, nom),
    ...S.defs.map((d) => `<defs><g id="${p}${d.id}">\n${groupes(d.couche, nom)}\n</g></defs>`),
    ...S.anims.map((a) => a.use ? `<g class="${p}${a.cls}"><use href="#${p}${a.use.id}" x="${a.use.x}"/></g>` : `<g class="${p}${a.cls}">\n${groupes(a.couche, nom)}\n</g>`),
  ].join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" shape-rendering="crispEdges" aria-hidden="true" focusable="false">
<style>
${style}
</style>
${corps}
</svg>
`;
}

const scenes = { accroche, collecter, valider, questionner, interroger, noter, analyser, publier };
const dir = join(RACINE, "site", "src", "illustrations");
mkdirSync(dir, { recursive: true });
for (const [nom, scene] of Object.entries(scenes)) {
  const svg = construire(nom, scene);
  writeFileSync(join(dir, `${nom}.svg`), svg);
  console.log(nom, Buffer.byteLength(svg), "octets");
}
