/**
 * `pnpm kappa:jeu-or` — inscrit dans `run.json` du run pilote, pour chaque juge retenu, le kappa
 * juge-humain du jeu d'or (ou le motif de son indéfinition) et les comptes du jeu d'or qui le fondent
 * (§7 « Calibration et fiabilité publiée » ; D89, D75 (27), D73 (8)).
 *
 *   pnpm kappa:jeu-or <repertoire_run>
 *
 * À lancer sur le run pilote une fois ses juges passés et le jeu d'or doublement noté par les humains
 * (`pnpm notation:humaine`), avant `pnpm analyze` : les trois champs entrent dans l'empreinte du run
 * (§9). Le calcul est `analysis/kappa-jeu-or.ts:inscriptionsJeuOr` ; la lecture, la fusion et
 * l'écriture sont `pipeline/notation/inscription-jeu-or.ts`, où les refus sont décrits. N'écrit que
 * `kappa_juge_humain`, `motif_indefini_kappa_juge_humain` et `comptes_jeu_or` des juges retenus ;
 * rien d'autre, aucun autre fichier.
 *
 * Refuse, sans rien écrire : un run qui n'est pas le pilote, pas `en_cours`, invalidé, sans test
 * contrefactuel inscrit, ou déjà analysé ; un jeu d'or dont une réponse n'a pas ses deux notations
 * humaines de calibration ; des notations incohérentes (deux humains qui divergent compris : le
 * troisième humain du jeu d'or n'a pas encore de motif de notation) ; un kappa déjà inscrit et
 * différent du recalcul. Déjà inscrit à l'identique : rien n'est écrit, et la commande le dit.
 *
 * Codes de sortie : 0, kappa inscrit ou déjà inscrit à l'identique ; 2, commande mal appelée ou refusée.
 */

import type { InscriptionJeuOr } from "../analysis/kappa-jeu-or.ts";
import { inscrireJeuOr, type ResultatInscriptionJeuOr } from "../pipeline/notation/inscription-jeu-or.ts";
import { analyserArguments } from "./arguments.ts";
import { estUnRefusAttendu } from "./refus-attendu.ts";

const USAGE = "usage : pnpm kappa:jeu-or <repertoire_run>";

/** Un seul argument positionnel, le répertoire du run ; aucune option n'est reconnue. */
function repertoireDemande(bruts: readonly string[]): string {
  analyserArguments(bruts, []);
  const positionnels = bruts.filter((argument) => !argument.startsWith("--"));
  const [repertoire] = positionnels;
  if (repertoire === undefined || positionnels.length > 1) throw new Error(`un seul répertoire de run est attendu. ${USAGE}`);
  return repertoire;
}

const LIBELLE = {
  inscrite: "kappa du jeu d'or inscrit",
  deja_inscrite: "kappa du jeu d'or déjà inscrit à l'identique ; rien n'est écrit",
} as const;

function valeur(inscription: InscriptionJeuOr): string {
  return "kappa_juge_humain" in inscription ? `kappa ${inscription.kappa_juge_humain}` : `kappa absent, motif ${inscription.motif_indefini_kappa_juge_humain}`;
}

function ligneDuJuge(inscription: InscriptionJeuOr): string {
  const c = inscription.comptes_jeu_or;
  return (
    `  ${inscription.juge_id} : ${valeur(inscription)} — ${c.comparees} comparée(s) sur ${c.reponses} ; écartées : ` +
    `${c.renvois_ecartes} renvoi(s), ${c.indeterminees} indéterminée(s), ${c.non_classees} non classée(s), ${c.refus_api} refus de l'API\n`
  );
}

function imprimer(repertoire: string, resultat: ResultatInscriptionJeuOr): void {
  const jeu = resultat.jeu_or;
  const effectif = jeu.sous_effectif ? ` (sous-effectif : ${jeu.obtenues} réponses obtenues pour ${jeu.taille_visee} visées)` : "";
  process.stdout.write(`Run ${resultat.run_id} — ${repertoire}\n  ${LIBELLE[resultat.issue]}\n  jeu d'or : ${jeu.reponse_ids.length} réponse(s)${effectif}\n`);
  for (const inscription of resultat.inscriptions) process.stdout.write(ligneDuJuge(inscription));
}

function principal(): void {
  try {
    const repertoire = repertoireDemande(process.argv.slice(2));
    imprimer(repertoire, inscrireJeuOr(repertoire));
  } catch (erreur) {
    if (!estUnRefusAttendu(erreur)) throw erreur;
    process.stderr.write(`Kappa du jeu d'or non inscrit — ${erreur.name} :\n  ${erreur.message}\nRien n'est écrit.\n`);
    process.exitCode = 2;
  }
}

principal();
