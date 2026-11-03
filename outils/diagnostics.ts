/**
 * `pnpm diagnostics` — publie le kappa de chaque lot (§4, « calculé par lot […] et publié » ; §9,
 * « diagnostics de lot »), puis imprime les kappas qui comptent pour le §12.
 *
 * Commande distincte de `pnpm promote`, parce que les deux n'ont ni le même objet ni le même
 * moment : le kappa se publie dès que les deux annotateurs ont fini un lot, y compris pour un lot
 * d'entraînement ou un lot supersédé qui ne promeut rien ; `promote` écrit dans `data/`, simule par
 * défaut et exige un arbre Git propre. Lier la publication du kappa à une promotion laisserait le
 * chiffre qui décide de J3 dépendre du fait qu'on ait promu ou non.
 *
 * Écrit dans `validation/diagnostics/<lot_id>/<instant>.json`, en ajout seul
 * (`validation/io/diagnostics-fichier.ts`). N'écrit ni dans `data/` ni dans `staging/`.
 *
 *   pnpm diagnostics
 */

import { resolve } from "node:path";
import { analyserArguments, texte } from "./arguments.ts";
import { publierDiagnostics, type Chemins } from "./diagnostics/publier.ts";
import { kappasRetenusSection12, type DiagnosticPublie } from "../validation/domaine/diagnostic-publie.ts";
import { lireDiagnostics } from "../validation/io/diagnostics-fichier.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";

const OPTIONS: readonly string[] = ["staging", "data", "lots", "decisions", "diagnostics"];

function lireChemins(): Chemins {
  const racine = resolve(import.meta.dirname, "..");
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  return {
    staging: texte(table, "staging", resolve(racine, "staging")),
    data: texte(table, "data", resolve(racine, "data/items")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    diagnostics: texte(table, "diagnostics", resolve(racine, "validation/diagnostics")),
  };
}

function libelleKappa(diagnostic: DiagnosticPublie): string {
  if (diagnostic.kappa !== undefined) return `kappa ${diagnostic.kappa.toFixed(3)}`;
  return `kappa absent (${String(diagnostic.motif_indefini)})`;
}

/** §4 (D65) : le champ publié, jamais recalculé ici. */
function libelleAccord(diagnostic: DiagnosticPublie): string {
  if (diagnostic.accord_suffisant === null) return "accord non décidable (aucun item commun)";
  return diagnostic.accord_suffisant ? "accord suffisant" : "accord insuffisant";
}

function ligneRetenue(diagnostic: DiagnosticPublie): string {
  const taille = diagnostic.taille_conforme ? "" : ` — effectif non conforme (${diagnostic.taille_lot}/${diagnostic.taille_attendue})`;
  return `  ${diagnostic.lot_id} (${diagnostic.nature}) : ${libelleAccord(diagnostic)}, ${libelleKappa(diagnostic)}, n = ${diagnostic.n}, calculé le ${diagnostic.date_calcul}${taille}`;
}

function principal(): void {
  const chemins = lireChemins();
  const comptes = publierDiagnostics(chemins, instantLocal(new Date()));
  console.log("Diagnostics de lot :");
  for (const compte of comptes) console.log(`  ${compte.lot_id} : ${compte.issue}`);

  const retenus = kappasRetenusSection12(lireDiagnostics(chemins.diagnostics), lireLots(chemins.lots));
  console.log("\nKappas retenus pour le §12 (derniers maillons, supersede_par = null) :");
  for (const diagnostic of retenus) console.log(ligneRetenue(diagnostic));
}

principal();
