/**
 * `pnpm go-no-go <repertoire_run>` — les sept critères go/no-go du §12, la décision de publication
 * qui en découle (D24), et la checklist de l'annexe F (`pipeline/go-no-go/go-no-go.ts`).
 *
 *   pnpm go-no-go runs/2026-12-01
 *
 * Écrit `go_no_go`, les kappas de l'échantillon humain, `perimetre.outils[].par_mode` de chaque
 * assistant inclus (D55 (7)) et, si la décision est provisoire, `motif_provisoire` dans `run.json`,
 * et `checklist.json` sans contreseing. Ne touche jamais `statut` et ne publie rien. Relancée sur
 * un run déjà décidé à l'identique, n'écrit rien et le dit.
 *
 * Codes de sortie : 0, la décision est écrite ou déjà là à l'identique ; 2, la commande est mal
 * appelée, le run est refusé (symétrie rouge, invalide, planifié), un fichier est illisible ou non
 * conforme, une référence humaine de l'échantillon manque, ou un go/no-go déjà écrit diffère du
 * recalcul. Dans ces derniers cas, rien n'est écrit.
 */

import { goNoGo, type ResultatGoNoGo } from "../pipeline/go-no-go/go-no-go.ts";
import { analyserArguments } from "./arguments.ts";

const USAGE = "usage : pnpm go-no-go <repertoire_run>";

function repertoireDemande(bruts: readonly string[]): string {
  analyserArguments(bruts, []);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return repertoire;
}

const LIBELLE_ISSUE = { ecrit: "écrit", inchange: "inchangé (déjà identique au recalcul)" } as const;

function imprimer(repertoire: string, resultat: ResultatGoNoGo): void {
  const lignes = [
    `Go/no-go (§12) — ${repertoire}`,
    ...resultat.go_no_go.criteres.map((c) => `  ${c.statut === "vert" ? "VERT " : "ROUGE"}  ${c.code.padEnd(36)} valeur ${String(c.valeur)} ; seuil ${String(c.seuil)}`),
    ...resultat.kappas.map((k) => `  kappa de l'échantillon, ${k.juge_id} : ${k.kappa === null ? `indéfini (${String(k.motif_indefini)})` : String(k.kappa)} sur ${k.n} réponse(s)`),
    `  réponses de l'échantillon à note humaine indéterminée, écartées du kappa (D25) : ${resultat.indeterminees}`,
    `  refus de l'API de l'échantillon, notés par règle sans juge, écartés du kappa (D32) : ${resultat.refus_api}`,
    `Décision : ${resultat.go_no_go.decision}${resultat.go_no_go.motif === undefined ? "" : ` — ${resultat.go_no_go.motif}`}`,
    `run.json : ${LIBELLE_ISSUE[resultat.run_json]} ; checklist.json : ${LIBELLE_ISSUE[resultat.checklist_json]}`,
    "Checklist de l'annexe F à contresigner : pnpm go-no-go:contresigner (le statut du run n'est pas changé).",
  ];
  process.stdout.write(`${lignes.join("\n")}\n`);
}

function principal(): void {
  try {
    const repertoire = repertoireDemande(process.argv.slice(2));
    imprimer(repertoire, goNoGo(repertoire));
  } catch (erreur) {
    if (!(erreur instanceof Error)) throw erreur;
    process.stderr.write(`Go/no-go non exécuté — ${erreur.name} :\n  ${erreur.message}\n`);
    process.exitCode = 2;
  }
}

principal();
