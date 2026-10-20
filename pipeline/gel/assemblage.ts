/**
 * Le gel d'un run, partie pure : des entrées déjà lues (`data/`, `config/`, le commit courant, les
 * graines) aux trois fichiers que `runs/<date>/` reçoit — `questions.json`, `tirage.json`,
 * `run.json` — au statut `planifie`. Aucune lecture, aucune écriture, aucun appel à Git ici :
 * `geler.ts` les fait, autour.
 *
 * Deux phases, séparées par la barrière de symétrie que l'appelant passe entre elles :
 *
 * 1. `preparer` : le périmètre au gel (`charger-perimetre.ts:construirePerimetre`, alias aveugles de
 *    `config/gel.json`), la fenêtre (`fenetre.ts:ouvrirFenetre`), et le jeu complet des questions
 *    engendrées au gel (`entrees.ts:tachesDe` puis `lecture-au-gel.ts:questionsAuGel`, qui refuse
 *    une question sans formulations relues sur son texte neutre et sa position courants). D44 :
 *    `engendree_le` de chaque question vaut `date_gel`, pour que deux gels du même commit donnent
 *    le même `questions.json`, octet pour octet. Rien ici ne dépend des graines ni de l'identifiant.
 * 2. `tirerAuGel` puis `fichiersDuGel` : le tirage (`tirage.ts:tirer`, graine du tirage, quotas du
 *    périmètre, tirage du run précédent pour les reprises du §5), puis, une fois la barrière passée, `run.json` qui référence `tirage.json` et
 *    `questions.json` (D48 (4)) par leur chemin et le SHA-256 de leurs octets exacts, et porte la balise (`balise.ts:baliseDuRun`),
 *    la table alias aveugle de candidat (§7, protocole 0.20, D55 (9), `notation/alias-candidats.ts:tableAliasCandidats`,
 *    graine `alias_candidats` et candidats interrogés au gel), l'engagement archivé (D46), le run
 *    précédent (D45 (3), `precedent.ts`) et l'empreinte du
 *    protocole ; enfin les réponses brutes des relais
 *    (sous `balise/`) et de la Wayback Machine (`engagement/wayback.json`, D47 (3)), octet pour
 *    octet. Chaque objet est validé contre son schéma avant d'être rendu.
 *
 * Le tirage dépend de l'identifiant du run : `tirage.ts:amorce` amorce le générateur avec la graine
 * ET `run.id`. L'un et l'autre sont dérivés de la balise et de `date_gel` (D44, D45 (1)) : deux gels
 * du même commit et de la même balise donnent les mêmes fichiers, octet pour octet (voir
 * `tests/gel/geler.test.ts`, cas 11).
 */

import { createHash } from "node:crypto";
import { validerFragment, valider } from "../../outils/schemas/valider.ts";
import { ouvrirFenetre } from "../interrogation/fenetre.ts";
import type { Fenetre } from "../interrogation/fenetre.ts";
import { dateParis, lireInstant } from "../interrogation/heure-paris.ts";
import { construirePerimetre } from "../questions/charger-perimetre.ts";
import type { PerimetreCharge } from "../questions/charger-perimetre.ts";
import { tirer } from "../questions/tirage.ts";
import type { ResultatTirage } from "../questions/tirage.ts";
import type { Item, Mesure, Question, RunAuGel, Symetrie, Tirage } from "../questions/types.ts";
import { tableAliasCandidats } from "../notation/alias-candidats.ts";
import { TAUX_ECHANTILLON_SANS_RETRAIT } from "../notation/taux-echantillon.ts";
import { tachesDe } from "../reformulation/entrees.ts";
import { questionsAuGel } from "../reformulation/lecture-au-gel.ts";
import type { FormulationsValidees } from "../reformulation/relecture.ts";
import { archivesDeLaBalise, baliseDuRun } from "./balise.ts";
import type { BaliseLue } from "./balise.ts";
import type { ConfigurationGel, JugeAuGel } from "./configuration.ts";
import { ARCHIVE_WAYBACK, engagementDuRun } from "./engagement.ts";
import type { EngagementVerifie } from "./engagement.ts";
import { grainesDuRun } from "./graines.ts";
import type { GrainesDuRun, ValeursDesGraines } from "./graines.ts";
import { exigerFenetreApresDateGel } from "./instants.ts";
import type { PrecedentDuGel } from "./precedent.ts";
import { STATUT_PLANIFIE } from "../run/types.ts";
import type { StatutRun } from "../run/types.ts";

/** Le statut d'un run qui vient d'être gelé : il n'est ni lancé ni publié. */
export const STATUT_AU_GEL: StatutRun = STATUT_PLANIFIE;

/** Un fichier du run : chemin relatif au répertoire du run, contenu exact. */
export interface FichierDuGel {
  readonly chemin: string;
  /** Un texte (UTF-8), ou des octets tels que reçus (règle 7). */
  readonly contenu: string | Uint8Array;
}

/** Les entrées lues par l'appelant, sans graines ni identifiant. */
export interface EntreesGel {
  /** Le YAML de `config/perimetre.yaml`, déjà lu, et sa provenance. */
  readonly perimetre_brut: unknown;
  readonly provenance_perimetre: string;
  readonly configuration: ConfigurationGel;
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  /** Le contenu de `data/formulations/`, par `question_id`. */
  readonly formulations: ReadonlyMap<string, FormulationsValidees>;
}

export interface GelPrepare {
  readonly perimetre: PerimetreCharge;
  readonly fenetre: Fenetre;
  /** Le jeu complet des questions engendrées au gel, triées par identifiant. */
  readonly questions: readonly Question[];
  /** `AAAA-MM-JJ` de `date_gel` à Paris : le nom du répertoire du run (`runs/README.md`). */
  readonly date_repertoire: string;
}

/**
 * Phase 1 : périmètre, fenêtre, questions. Lève sur toute entrée qui ne permet pas de geler, dont
 * une fenêtre ouverte à `date_gel` ou avant (D45 (4), D50, `instants.ts`).
 */
export function preparer(entrees: EntreesGel): GelPrepare {
  const perimetre = construirePerimetre(
    entrees.perimetre_brut,
    { items: entrees.items, mesures: entrees.mesures, alias_aveugles: entrees.configuration.alias_aveugles },
    entrees.provenance_perimetre,
  );
  const fenetre = ouvrirFenetre(entrees.configuration.fenetre_debut);
  const taches = tachesDe({ items: entrees.items, mesures: entrees.mesures, candidats: perimetre.perimetre.candidats });
  const questions = questionsAuGel(taches, entrees.formulations, perimetre.date_gel);
  const date_gel_ms = lireInstant(perimetre.date_gel, `${entrees.provenance_perimetre}, date_gel`);
  exigerFenetreApresDateGel(fenetre.debut_ms, date_gel_ms);
  const date_repertoire = dateParis(date_gel_ms);
  return { perimetre, fenetre, questions, date_repertoire };
}

/** Ce que le tirage et la barrière lisent du run. */
export function runAuGel(prepare: GelPrepare, run_id: string): RunAuGel {
  return { id: run_id, date_gel: prepare.perimetre.date_gel, perimetre: { candidats: prepare.perimetre.perimetre.candidats } };
}

export interface GelTire {
  readonly run_id: string;
  readonly graines: GrainesDuRun;
  readonly resultat: ResultatTirage;
  /** Le run précédent (D45 (3)), inscrit dans `run.json#/run_precedent`. */
  readonly precedent: PrecedentDuGel;
}

/**
 * Phase 2a : le tirage, avec la graine du tirage, les quotas du périmètre et le tirage du run
 * précédent (§5, reprises), absent quand aucun run ne précède.
 */
export function tirerAuGel(
  prepare: GelPrepare,
  entrees: EntreesGel,
  run_id: string,
  valeurs: ValeursDesGraines,
  precedent: PrecedentDuGel,
): GelTire {
  const graines = grainesDuRun(valeurs);
  const reprise = precedent.tirage_precedent === undefined ? {} : { tirage_precedent: precedent.tirage_precedent };
  const resultat = tirer({
    questions: prepare.questions,
    items: entrees.items,
    mesures: entrees.mesures,
    run: runAuGel(prepare, run_id),
    graine: graines.tirage,
    parametres: prepare.perimetre.parametres_tirage,
    ...reprise,
  });
  return { run_id, graines, resultat, precedent };
}

/** Ce qui s'inscrit dans `run.json` et ne vient ni du périmètre ni du tirage. */
export interface MetaDuRun {
  readonly type_run: string;
  /** HEAD au gel : `data/` est dans le même dépôt que le code (D41). */
  readonly commit: string;
  readonly symetrie: Symetrie;
  /** SHA-256 des octets de `docs/PROTOCOLE.md` au commit gelé. */
  readonly protocole_sha256: string;
  readonly balise: BaliseLue;
  readonly engagement: EngagementVerifie;
  /** D51 (3) : le run invalidé que remplace une réexécution, vérifié sous `runs/` ; `undefined` pour tout autre type. */
  readonly run_remplace_id: string | undefined;
}

/** Un fichier JSON du run : deux espaces d'indentation, une fin de ligne. */
export function texteJson(valeur: unknown): string {
  return `${JSON.stringify(valeur, null, 2)}\n`;
}

function sha256(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** D'abord retenu au gel : les kappas, le taux contrefactuel et le retrait viennent après. */
function jugeAuGel(juge: JugeAuGel) {
  return { ...juge, retire: false };
}

/** Les textes exacts de `tirage.json` et `questions.json`, tels qu'ils seront écrits. */
interface TextesEngages {
  readonly tirage: string;
  readonly questions: string;
}

/** §7 (protocole 0.20), D55 (9) : les mêmes candidats interrogés que le dérangement du test contrefactuel. */
function candidatsInterrogesAuGel(prepare: GelPrepare): readonly { readonly candidat_id: string }[] {
  return prepare.perimetre.perimetre.candidats.filter((candidat) => candidat.interroge);
}

function runDuGel(prepare: GelPrepare, entrees: EntreesGel, tire: GelTire, meta: MetaDuRun, textes: TextesEngages): unknown {
  const tirage = tire.resultat.tirage;
  return {
    id: tire.run_id,
    date_gel: prepare.perimetre.date_gel,
    fenetre: { debut: prepare.fenetre.debut, fin: prepare.fenetre.fin },
    type_run: meta.type_run,
    statut: STATUT_AU_GEL,
    ...(meta.run_remplace_id === undefined ? {} : { run_remplace_id: meta.run_remplace_id }),
    versions: {
      protocole: entrees.configuration.version_protocole,
      protocole_sha256: meta.protocole_sha256,
      code_commit: meta.commit,
      donnees_commit: meta.commit,
    },
    graines: tire.graines,
    alias_candidats: tableAliasCandidats(candidatsInterrogesAuGel(prepare), tire.graines.alias_candidats),
    balise: baliseDuRun(meta.balise, prepare.date_repertoire),
    engagement: engagementDuRun(meta.engagement, prepare.date_repertoire),
    run_precedent: tire.precedent.run_precedent,
    perimetre: prepare.perimetre.perimetre,
    juges: entrees.configuration.juges.map(jugeAuGel),
    taux_echantillon_humain: TAUX_ECHANTILLON_SANS_RETRAIT,
    symetrie: { conditions: meta.symetrie.conditions, statut_global: meta.symetrie.statut_global },
    tirage: {
      chemin: `runs/${prepare.date_repertoire}/tirage.json`,
      sha256: sha256(textes.tirage),
      nombre_questions: tirage.entrees.length,
    },
    questions: {
      chemin: `runs/${prepare.date_repertoire}/questions.json`,
      sha256: sha256(textes.questions),
    },
  };
}

/**
 * Phase 2b, après la barrière : les trois fichiers, chacun validé contre son schéma, puis les
 * archives de la balise et de l'engagement. `run.json` porte l'empreinte des octets exacts de
 * `tirage.json` et de `questions.json` (D48 (4)) tels qu'ils seront écrits, et de chaque archive.
 */
export function fichiersDuGel(prepare: GelPrepare, entrees: EntreesGel, tire: GelTire, meta: MetaDuRun): readonly FichierDuGel[] {
  const provenance = `gel du run ${tire.run_id}`;
  validerFragment<string>("run", "#/properties/type_run", meta.type_run, `${provenance}, type_run`);
  const tirage = valider<Tirage>("tirage", tire.resultat.tirage, `${provenance}, tirage.json`);
  const questions = prepare.questions.map((question) => valider<Question>("question", question, `${provenance}, question ${question.id}`));
  const textes: TextesEngages = { tirage: texteJson(tirage), questions: texteJson(questions) };
  const run = valider<unknown>("run", runDuGel(prepare, entrees, tire, meta, textes), `${provenance}, run.json`);
  return [
    { chemin: "questions.json", contenu: textes.questions },
    { chemin: "tirage.json", contenu: textes.tirage },
    { chemin: "run.json", contenu: texteJson(run) },
    ...archivesDeLaBalise(meta.balise).map((archive) => ({ chemin: archive.chemin, contenu: archive.octets })),
    { chemin: ARCHIVE_WAYBACK, contenu: meta.engagement.octets },
  ];
}
