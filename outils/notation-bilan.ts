/**
 * Le bilan imprimé d'une notation (`pipeline/notation/bilan-notation.ts`), le même pour
 * `pnpm notation:dry` et `pnpm notation:reelle` : seule la ligne de titre diffère. Le bilan est relu
 * du disque ; les réponses qui attendent un humain sont comptées par motif, jamais résolues.
 */

import { MOTIFS_DU_BILAN, texteContrefactuelInscrit, type BilanNotation } from "../pipeline/notation/bilan-notation.ts";
import type { EtatLecturesDuRun } from "../pipeline/notation/verdicts-de-lecture.ts";

const LIBELLES_MOTIFS: Readonly<Record<(typeof MOTIFS_DU_BILAN)[number], string>> = {
  notation_juge_manquante: "notation de juge manquante",
  desaccord_juges: "désaccord des juges",
  extrait_invalide: "extrait invalide",
  drapeau_grave: "erreur grave à revoir",
  double_notation_humaine_incomplete: "échantillon humain (double notation)",
  arbitrage_echantillon_manquant: "arbitrage de l'échantillon",
  accord_sans_note_commune: "accord partiel des juges",
  attribution_indecidable: "attribution indécidable (renvoi d'un juge)",
  juge_defaillant: "juge défaillant (renvoi d'un juge)",
  test_liens: "en attente du test des liens",
  contrefactuel_en_attente: "test contrefactuel en attente",
  run_invalide: "run invalide (deux juges retirés)",
};

function contrefactuelInscrit(bilan: BilanNotation): string {
  const inscrit = bilan.contrefactuel_inscrit;
  if (inscrit === undefined) return "";
  return texteContrefactuelInscrit(inscrit);
}

/** Les lignes du bilan, sous la ligne de titre `titre — <répertoire du run>`. */
export function lignesBilanNotation(titre: string, repertoire_run: string, bilan: BilanNotation): readonly string[] {
  const lignes: string[] = [`${titre} — ${repertoire_run}`, `Test contrefactuel : ${bilan.statut_contrefactuel}${contrefactuelInscrit(bilan)}`];
  for (const juge of bilan.juges) {
    const taux = juge.changements_contrefactuel === undefined ? "sans taux" : `${juge.changements_contrefactuel.numerateur}/${juge.changements_contrefactuel.denominateur} changements`;
    lignes.push(`  ${juge.juge_id.padEnd(16)} ${juge.retire ? "RETIRÉ" : "retenu"}  ${taux}  notations : run ${juge.notations_run}, contrefactuel ${juge.notations_contrefactuel}, contrefactuel d'outil ${juge.notations_contrefactuel_outil}`);
  }
  lignes.push(`  règle d12-refus-api (D32)  notations : run ${bilan.notations_par_regle}, sans juge`);
  lignes.push(`Échantillon humain : ${bilan.taux_echantillon_humain * 100} %`);
  lignes.push(`Réponses obtenues : ${bilan.reponses_obtenues} = ${bilan.verdicts} verdict(s) + ${bilan.reponses_en_attente} en attente`);
  for (const [mode, nombre] of Object.entries(bilan.verdicts_par_mode)) lignes.push(`  verdict ${mode.padEnd(28)} ${nombre}`);
  lignes.push("Attentes par motif (une réponse peut en porter plusieurs) :");
  for (const motif of MOTIFS_DU_BILAN) {
    const nombre = bilan.attentes_par_motif[motif];
    if (nombre !== undefined) lignes.push(`  ${LIBELLES_MOTIFS[motif].padEnd(40)} ${nombre}`);
  }
  lignes.push(`Réponses contrefactuelles écrites : ${bilan.reponses_contrefactuelles} ; notations humaines lues : ${bilan.notations_humaines}`);
  return lignes;
}

/** Étape 5 de la chaîne (D87) : les verdicts de lecture écrits, les lectures qui attendent un humain, ou pourquoi rien n'a été joué. */
export function texteLectures(lectures: EtatLecturesDuRun): string {
  if (lectures.statut === "non_jouees") return `Lectures de comparateur : non jouées (${lectures.motif})`;
  const aNoter = lectures.attentes.filter((a) => a.statut === "a_noter").length;
  const aArbitrer = lectures.attentes.length - aNoter;
  return `Lectures de comparateur : ${lectures.verdicts.length} verdict(s) ; ${aNoter} à noter, ${aArbitrer} à arbitrer`;
}
