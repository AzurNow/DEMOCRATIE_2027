// Script jetable (Lot 8c, constat 15) : détecte les cycles d'import entre fichiers .ts du dépôt,
// en particulier pipeline/questions/{tirage,tirabilite,entrees-tirage,graine,symetrie,completude}.ts.
// Usage : node scratch/verifier-cycles.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";

const racine = resolve(import.meta.dirname, "..");
const ignores = new Set(["node_modules", ".git", "scratch", "archives", "modeles"]);

function fichiersTs(dossier, acc = []) {
  for (const nom of readdirSync(dossier)) {
    if (ignores.has(nom)) continue;
    const chemin = join(dossier, nom);
    const info = statSync(chemin);
    if (info.isDirectory()) fichiersTs(chemin, acc);
    else if (extname(nom) === ".ts") acc.push(chemin);
  }
  return acc;
}

function importsDe(chemin) {
  const texte = readFileSync(chemin, "utf8");
  const re = /from\s+["']((?:\.\.?\/)[^"']+)["']/g;
  const cibles = [];
  let m;
  while ((m = re.exec(texte)) !== null) {
    const cible = resolve(dirname(chemin), m[1]);
    cibles.push(cible);
  }
  return cibles;
}

const fichiers = fichiersTs(racine);
const graphe = new Map(fichiers.map((f) => [f, importsDe(f).filter((c) => fichiers.includes(c))]));

const EN_COURS = 1;
const FINI = 2;
const etat = new Map();
const pile = [];
const cycles = [];

function dfs(noeud) {
  etat.set(noeud, EN_COURS);
  pile.push(noeud);
  for (const voisin of graphe.get(noeud) ?? []) {
    if (etat.get(voisin) === EN_COURS) {
      const debut = pile.indexOf(voisin);
      cycles.push([...pile.slice(debut), voisin].map((c) => relative(racine, c)));
    } else if (etat.get(voisin) !== FINI) {
      dfs(voisin);
    }
  }
  pile.pop();
  etat.set(noeud, FINI);
}

for (const fichier of fichiers) if (!etat.has(fichier)) dfs(fichier);

if (cycles.length === 0) {
  console.log("Aucun cycle d'import détecté.");
} else {
  console.log(`${cycles.length} cycle(s) détecté(s) :`);
  for (const cycle of cycles) console.log("  " + cycle.join(" -> "));
  process.exitCode = 1;
}
