// Planche de contrôle : inline les 8 SVG sous deux jeux de variables --px-… (clair / sombre).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const r = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const noms = ["accroche", "collecter", "valider", "questionner", "interroger", "noter", "analyser", "publier"];
const svgs = noms.map((n) => readFileSync(join(r, "site/src/illustrations", n + ".svg"), "utf8"));
const clair = "--px-ciel:#bfe3f0;--px-sol:#b9ad92;--px-mur:#efe8d8;--px-encre:#1f2233;--px-clair:#ffffff;--px-corps:#7f93a8;--px-accent-1:#e4572e;--px-accent-2:#2e86c1;--px-accent-3:#c9a56b;--px-papier:#fbf8ef;--px-ecran:#25364a;";
const sombre = "--px-ciel:#1b2a44;--px-sol:#2a2a38;--px-mur:#3a3f55;--px-encre:#0b0c14;--px-clair:#8d93b8;--px-corps:#8fa3b8;--px-accent-1:#ff7a52;--px-accent-2:#5aa9e6;--px-accent-3:#a3824f;--px-papier:#d9d5c6;--px-ecran:#0f1a2b;";
const bloc = (v, bg) =>
  `<div style="${v}background:${bg};padding:8px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${svgs.map((s) => `<div style="aspect-ratio:4/3">${s}</div>`).join("")}</div>`;
writeFileSync(
  join(r, "scratch/illustrations/planche.html"),
  `<!doctype html><meta charset=utf-8><style>body{margin:0;width:1280px}svg{width:100%;height:100%;display:block}</style>${bloc(clair, "#f5f1e6")}${bloc(sombre, "#12131c")}`,
);
