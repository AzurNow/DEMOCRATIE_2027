/**
 * `pnpm go-no-go:contresigner <repertoire_run> --nom="<nom>" --case=<rang>:faite --case=<rang>:non_faite:<motif>`
 * — le contreseing de la checklist de l'annexe F par l'auteur (D24 (4) ; `pipeline/go-no-go/contreseing.ts`).
 *
 *   pnpm go-no-go:contresigner runs/2026-12-01 --nom="Prénom Nom" \
 *     --case=1:faite --case=8:faite --case=9:faite --case=10:non_faite:"Notification prévue lundi"
 *
 * Une option `--case` par case déclarée (1, 8, 9 et 10 dans l'annexe F), aucune pour une case
 * calculée. Le motif d'une case non faite est obligatoire et suit le deuxième deux-points ; il peut
 * en contenir d'autres. La date du contreseing est l'instant courant. Seul `checklist.json` est
 * écrit ; `run.json` n'est jamais ouvert en écriture.
 *
 * Codes de sortie : 0, checklist contresignée ; 2, la commande est mal appelée ou le contreseing est
 * refusé (déjà signé, case déclarée sans état, case non faite sans motif…), rien n'est écrit.
 */

import { contresignerFichier, type Declaration } from "../pipeline/go-no-go/contreseing.ts";
import { analyserArguments, multiples, obligatoire } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = 'usage : pnpm go-no-go:contresigner <repertoire_run> --nom="<nom>" --case=<rang>:faite|--case=<rang>:non_faite:<motif> …';

function declarationDe(brut: string): Declaration {
  const [rang, etat, ...reste] = brut.split(":");
  const motif = reste.length === 0 ? undefined : reste.join(":");
  if (rang === undefined || !/^[0-9]+$/.test(rang)) throw new Error(`--case=${brut} : rang illisible. ${USAGE}`);
  if (etat !== "faite" && etat !== "non_faite") throw new Error(`--case=${brut} : l'état est « faite » ou « non_faite ». ${USAGE}`);
  const declaration: Declaration = { rang: Number(rang), etat };
  return motif === undefined ? declaration : { ...declaration, motif };
}

function repertoireDe(bruts: readonly string[]): string {
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return repertoire;
}

function principal(): void {
  try {
    const bruts = process.argv.slice(2);
    const options = analyserArguments(bruts, ["nom", "case"]);
    const repertoire = repertoireDe(bruts);
    const nom = obligatoire(options, "nom", "le nom de l'auteur qui contresigne (annexe F).");
    const signee = contresignerFichier(repertoire, { nom, declarations: multiples(bruts, "case").map(declarationDe), date: new Date().toISOString() });
    process.stdout.write(`Checklist de l'annexe F contresignée par ${nom} le ${String(signee.contreseing?.date)} — ${repertoire}/checklist.json\n`);
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Contreseing non exécuté — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
