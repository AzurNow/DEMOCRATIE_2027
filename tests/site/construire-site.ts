/**
 * `globalSetup` des tests du site : construit `site/dist/` une fois avant eux, avec la commande
 * même de `pnpm build:site` (télémétrie Astro coupée par le script). Les tests de `tests/site/`
 * lisent le site construit ; sans cette étape, `pnpm test` échouait sur un clone propre.
 * Une construction qui échoue fait échouer l'exécution, avec la fin de la sortie d'Astro.
 * pnpm est lancé par `process.execPath` sur `npm_execpath` (posée par pnpm quand il lance
 * `pnpm test`) : `execFileSync("pnpm")` échoue sous Windows (`.cmd` refusé sans shell, ou pnpm
 * absent du PATH derrière `corepack pnpm`).
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const RACINE = resolve(import.meta.dirname, "../..");
const LIGNES_DE_SORTIE_MONTREES = 40;

export function cheminDePnpm(env: NodeJS.ProcessEnv = process.env): string {
  const chemin = env["npm_execpath"];
  if (chemin === undefined || chemin === "") {
    throw new Error("npm_execpath absente : lancer les tests par `pnpm test` (ou `corepack pnpm test`), pas par vitest directement.");
  }
  return chemin;
}

export function setup(): void {
  const pnpm = cheminDePnpm();
  try {
    execFileSync(process.execPath, [pnpm, "run", "build:site"], { cwd: RACINE, stdio: "pipe", encoding: "utf8" });
  } catch (erreur) {
    const sortie = erreur as { stdout?: string; stderr?: string; message: string };
    const fin = `${sortie.stdout ?? ""}\n${sortie.stderr ?? ""}`.trim().split("\n").slice(-LIGNES_DE_SORTIE_MONTREES).join("\n");
    throw new Error(`pnpm build:site a échoué, les tests du site n'ont rien à lire :\n${fin || sortie.message}`);
  }
}
