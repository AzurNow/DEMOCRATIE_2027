/**
 * Contrôle croisé verdicts × notations × run (conformité n° 18, protocole 0.15, §7 ; D13).
 *
 * Après le retrait d'un juge, un verdict peut contredire le run qui le porte sans qu'aucun schéma ne
 * le voie : chaque schéma ne lit qu'un objet. Ce contrôle les lit ensemble et rend la liste des
 * violations, chacune nommée par un code et rattachée à son verdict. Une liste vide est un run
 * propre ; rien n'est corrigé ici.
 *
 * L'appartenance à l'échantillon humain est rejouée à partir des réponses obtenues du run (la
 * population du tirage, reçue en entrée : un verdict en attente n'existe pas encore, les verdicts
 * ne la donnent donc pas), de `run.graines.echantillon_humain` et de `run.taux_echantillon_humain`,
 * avec `echantillons.ts:tirerEchantillonHumain`, le même tirage que celui qui a désigné les humains.
 *
 * Le résultat publié du test contrefactuel (lot notation, PR C) est relu juge par juge, quand il
 * est présent : le retrait se décide sur les effectifs, en entiers (`depasseSeuilRetrait` de
 * `contrefactuel.ts`, « au-delà de 3 % » strict), et le taux publié doit être leur quotient exact.
 */

import type { Ulid } from "../../analysis/types.ts";
import { depasseSeuilRetrait } from "./contrefactuel.ts";
import { jugesDuRun } from "./decision.ts";
import { tirerEchantillonHumain } from "./echantillons.ts";
import { porteDrapeauGrave } from "./note-retenue.ts";
import { TAUX_ECHANTILLON_APRES_RETRAIT, TAUX_ECHANTILLON_SANS_RETRAIT } from "./taux-echantillon.ts";
import type { JugeDuRun, ModeResolution, NotationIndividuelle, RunDeNotation, VerdictProduit } from "./types.ts";

export const CODES_VIOLATION = [
  "source_introuvable",
  "source_hors_objet_ou_run",
  "source_de_juge_retire",
  "juge_unique_sans_retrait",
  "drapeau_grave_ignore",
  "appartenance_echantillon_non_rejouee",
  "notation_humaine_absente",
  "taux_echantillon_incoherent",
  "retrait_contrefactuel_incoherent",
  "taux_contrefactuel_incoherent",
  "denominateur_contrefactuel_incoherent",
  "notation_par_regle_incoherente",
  "marqueur_refus_api_incoherent",
] as const;
export type CodeViolation = (typeof CODES_VIOLATION)[number];

export interface Violation {
  readonly code: CodeViolation;
  /** Absent pour une violation qui porte sur le run lui-même. */
  readonly verdict_id?: Ulid;
  readonly detail: string;
}

export interface EntreeControleCroise {
  readonly run: RunDeNotation;
  /** Les réponses obtenues du run, population du tirage de l'échantillon humain. */
  readonly reponses_obtenues: readonly Ulid[];
  /** D33 : celles des réponses obtenues qui sont un refus de l'API (`normalise.refus_api`). */
  readonly refus_api: readonly Ulid[];
  readonly notations: readonly NotationIndividuelle[];
  readonly verdicts: readonly VerdictProduit[];
}

interface Contexte {
  readonly run: RunDeNotation;
  readonly retires: ReadonlySet<string>;
  readonly parId: ReadonlyMap<Ulid, NotationIndividuelle>;
  readonly echantillon: ReadonlySet<Ulid>;
  readonly notations: readonly NotationIndividuelle[];
}

/** Modes dont la note vient d'un humain, et le nombre minimal d'humains distincts qu'ils exigent. */
const HUMAINS_EXIGES: ReadonlyMap<ModeResolution, number> = new Map<ModeResolution, number>([
  ["tranche_humain", 1],
  ["revue_erreur_grave", 1],
  ["arbitrage_panel", 1],
  ["echantillon_humain_10", 2],
]);

/** Modes où la note retenue vient des seuls juges. */
const MODES_DE_JUGE: ReadonlySet<ModeResolution> = new Set<ModeResolution>(["accord_juges", "juge_unique_apres_retrait"]);

export function controleCroise(entree: EntreeControleCroise): readonly Violation[] {
  const ctx: Contexte = {
    run: entree.run,
    retires: new Set(entree.run.juges.filter((j) => j.retire).map((j) => j.juge_id)),
    parId: new Map(entree.notations.map((n) => [n.id, n])),
    echantillon: new Set(tirerEchantillonHumain(entree.reponses_obtenues, entree.run.graines.echantillon_humain, entree.run.taux_echantillon_humain)),
    notations: entree.notations,
  };
  return [
    ...violationsDuRun(entree.run),
    ...marqueursRefus(entree.notations, new Set(entree.refus_api)),
    ...entree.verdicts.flatMap((verdict) => violationsDuVerdict(verdict, ctx)),
  ];
}

/**
 * D33 : une notation de contexte run sur une réponse porte `sur_refus_api` si et seulement si la
 * réponse est un refus de l'API. Le marqueur exempte de l'extrait : posé sur une réponse ordinaire,
 * il ferait passer une note sans justification ; absent sur un refus, la réponse a été notée comme
 * une autre.
 */
function marqueursRefus(notations: readonly NotationIndividuelle[], refus: ReadonlySet<Ulid>): Violation[] {
  return notations
    .filter((n) => n.contexte === "run" && n.objet_note.type === "reponse" && (n.sur_refus_api === true) !== refus.has(n.objet_note.id))
    .map((n) => ({
      code: "marqueur_refus_api_incoherent" as const,
      detail: `notation ${n.id} (${n.notateur.type} ${n.notateur.id}) : sur_refus_api ${n.sur_refus_api === true ? "posé" : "absent"}, alors que la réponse ${n.objet_note.id} ${refus.has(n.objet_note.id) ? "est" : "n'est pas"} un refus de l'API.`,
    }));
}

function violationsDuRun(run: RunDeNotation): Violation[] {
  jugesDuRun(run, run.id);
  return [...tauxEchantillon(run), ...run.juges.flatMap((juge) => [...violationsContrefactuelles(juge), ...denominateurContrefactuel(juge, run)])];
}

/** §7 : le taux passe à 25 % quand un juge est retiré, et à ce seul cas. */
function tauxEchantillon(run: RunDeNotation): Violation[] {
  const retrait = run.juges.some((j) => j.retire);
  const attendu = retrait ? TAUX_ECHANTILLON_APRES_RETRAIT : TAUX_ECHANTILLON_SANS_RETRAIT;
  if (run.taux_echantillon_humain === attendu) return [];
  return [
    {
      code: "taux_echantillon_incoherent",
      detail: `taux_echantillon_humain ${run.taux_echantillon_humain} alors que ${retrait ? "un juge est retiré" : "aucun juge n'est retiré"} (attendu ${attendu}).`,
    },
  ];
}

/**
 * §7 : « au-delà de 3 %, le juge concerné est retiré du run ». Un juge sans effectifs publiés (test
 * pas encore fait, ou indéfini) n'a rien à contrôler ici ; le schéma exige le taux et ses
 * effectifs ensemble, et les exige d'un test terminé.
 */
function violationsContrefactuelles(juge: JugeDuRun): Violation[] {
  const changements = juge.changements_contrefactuel;
  if (changements === undefined) return [];
  const { numerateur, denominateur } = changements;
  const violations: Violation[] = [];
  const auDela = depasseSeuilRetrait(numerateur, denominateur);
  if (juge.retire !== auDela) {
    violations.push({
      code: "retrait_contrefactuel_incoherent",
      detail: `juge ${juge.juge_id} : ${numerateur} changements sur ${denominateur} ${auDela ? "dépassent" : "ne dépassent pas"} 3 %, et retire vaut ${String(juge.retire)}.`,
    });
  }
  if (juge.taux_changement_contrefactuel !== numerateur / denominateur) {
    violations.push({
      code: "taux_contrefactuel_incoherent",
      detail: `juge ${juge.juge_id} : taux_changement_contrefactuel ${String(juge.taux_changement_contrefactuel)} au lieu de ${numerateur}/${denominateur}.`,
    });
  }
  return violations;
}

/**
 * Le dénominateur du taux d'un juge plus ses paires écartées (D31 (1) : paires dont il a renvoyé un
 * côté vers l'humain) font la taille du sous-ensemble publiée dans `contrefactuel_candidats.taille` ;
 * un taux indéfini (`toutes_paires_ecartees`) suppose toutes les paires écartées. Contrôlé quand le
 * bloc est présent et que le juge publie un résultat ; le schéma exige le bloc d'un run publié.
 */
function denominateurContrefactuel(juge: JugeDuRun, run: RunDeNotation): Violation[] {
  const bloc = run.contrefactuel_candidats;
  const resultat = juge.changements_contrefactuel !== undefined || juge.motif_indefini_contrefactuel !== undefined;
  if (bloc === undefined || !resultat) return [];
  const ecartees = juge.paires_ecartees_contrefactuel;
  const comptees = juge.changements_contrefactuel === undefined ? 0 : juge.changements_contrefactuel.denominateur;
  if (ecartees !== undefined && comptees + ecartees === bloc.taille) return [];
  return [
    {
      code: "denominateur_contrefactuel_incoherent",
      detail: `juge ${juge.juge_id} : ${comptees} paire(s) au dénominateur et ${String(ecartees)} écartée(s), pour un sous-ensemble de ${bloc.taille} réponse(s) (contrefactuel_candidats.taille).`,
    },
  ];
}

function violationsDuVerdict(verdict: VerdictProduit, ctx: Contexte): Violation[] {
  const sources = sourcesResolues(verdict, ctx);
  return [
    ...sources.violations,
    ...jugeUniqueSansRetrait(verdict, ctx),
    ...drapeauGraveIgnore(verdict, ctx),
    ...appartenanceEchantillon(verdict, ctx),
    ...humainsAbsents(verdict, sources.notations),
    ...regleIncoherente(verdict, sources.notations),
  ].map((violation) => ({ ...violation, verdict_id: verdict.id }));
}

/** Modes dont un verdict peut citer la notation par règle d'un refus de l'API (D32). */
const MODES_AVEC_REGLE: ReadonlySet<ModeResolution> = new Set<ModeResolution>(["regle_refus_api", "echantillon_humain_10"]);

/**
 * D32 : un verdict `regle_refus_api` a pour seule source la notation par règle ; une notation par
 * règle n'est citée que par lui, ou, dans l'échantillon, à côté des deux humains dont la note prévaut.
 */
function regleIncoherente(verdict: VerdictProduit, sources: readonly NotationIndividuelle[]): ViolationSansVerdict[] {
  const regles = sources.filter((n) => n.notateur.type === "regle");
  const parRegle = verdict.mode_resolution === "regle_refus_api";
  const seuleSource = regles.length === 1 && sources.length === 1;
  if (parRegle ? seuleSource : regles.length === 0 || MODES_AVEC_REGLE.has(verdict.mode_resolution)) return [];
  return [
    {
      code: "notation_par_regle_incoherente",
      detail: `verdict en ${verdict.mode_resolution} avec ${regles.length} notation(s) par règle parmi ${sources.length} source(s) (D32).`,
    },
  ];
}

type ViolationSansVerdict = Omit<Violation, "verdict_id">;

function sourcesResolues(
  verdict: VerdictProduit,
  ctx: Contexte,
): { readonly notations: readonly NotationIndividuelle[]; readonly violations: readonly ViolationSansVerdict[] } {
  const notations: NotationIndividuelle[] = [];
  const violations: ViolationSansVerdict[] = [];
  for (const id of verdict.notations_sources) {
    const notation = ctx.parId.get(id);
    if (notation === undefined) violations.push({ code: "source_introuvable", detail: `notation source ${id} absente des notations du run.` });
    else {
      notations.push(notation);
      violations.push(...violationsDeSource(verdict, notation, ctx.retires));
    }
  }
  return { notations, violations };
}

function violationsDeSource(verdict: VerdictProduit, notation: NotationIndividuelle, retires: ReadonlySet<string>): ViolationSansVerdict[] {
  const violations: ViolationSansVerdict[] = [];
  if (!porteSurLeMemeObjet(verdict, notation)) {
    violations.push({
      code: "source_hors_objet_ou_run",
      detail: `notation ${notation.id} : ${notation.objet_note.type} ${notation.objet_note.id} du run ${notation.run_id}, contexte ${notation.contexte}.`,
    });
  }
  if (estDeJugeRetire(notation, retires)) {
    violations.push({ code: "source_de_juge_retire", detail: `notation ${notation.id} du juge retiré ${notation.notateur.id} (D13).` });
  }
  return violations;
}

function porteSurLeMemeObjet(verdict: VerdictProduit, notation: NotationIndividuelle): boolean {
  return (
    notation.run_id === verdict.run_id &&
    notation.contexte === verdict.contexte &&
    notation.objet_note.type === verdict.objet_note.type &&
    notation.objet_note.id === verdict.objet_note.id
  );
}

function estDeJugeRetire(notation: NotationIndividuelle, retires: ReadonlySet<string>): boolean {
  return notation.notateur.type === "juge" && retires.has(notation.notateur.id);
}

function jugeUniqueSansRetrait(verdict: VerdictProduit, ctx: Contexte): ViolationSansVerdict[] {
  if (verdict.mode_resolution !== "juge_unique_apres_retrait" || ctx.retires.size > 0) return [];
  return [{ code: "juge_unique_sans_retrait", detail: "juge_unique_apres_retrait alors qu'aucun juge du run n'est retiré." }];
}

/** Hors échantillon, une note de juges ne peut pas taire un drapeau grave posé par un juge non retiré. */
function drapeauGraveIgnore(verdict: VerdictProduit, ctx: Contexte): ViolationSansVerdict[] {
  if (verdict.dans_echantillon_humain || !MODES_DE_JUGE.has(verdict.mode_resolution)) return [];
  const graves = ctx.notations.filter(
    (n) => n.notateur.type === "juge" && !ctx.retires.has(n.notateur.id) && porteSurLeMemeObjet(verdict, n) && porteDrapeauGrave(n),
  );
  return graves.map((n) => ({
    code: "drapeau_grave_ignore",
    detail: `le juge ${n.notateur.id} pose ${n.drapeaux.join(", ")} (notation ${n.id}) et le verdict est en ${verdict.mode_resolution}.`,
  }));
}

function appartenanceEchantillon(verdict: VerdictProduit, ctx: Contexte): ViolationSansVerdict[] {
  if (verdict.objet_note.type !== "reponse") return [];
  const tiree = ctx.echantillon.has(verdict.objet_note.id);
  if (verdict.dans_echantillon_humain === tiree) return [];
  return [
    {
      code: "appartenance_echantillon_non_rejouee",
      detail: `dans_echantillon_humain ${String(verdict.dans_echantillon_humain)}, alors que le tirage rejoué ${tiree ? "la contient" : "ne la contient pas"}.`,
    },
  ];
}

function humainsAbsents(verdict: VerdictProduit, sources: readonly NotationIndividuelle[]): ViolationSansVerdict[] {
  const exiges = HUMAINS_EXIGES.get(verdict.mode_resolution);
  if (exiges === undefined) return [];
  const humains = new Set(sources.filter((n) => n.notateur.type === "humain").map((n) => n.notateur.id));
  if (humains.size >= exiges) return [];
  return [
    {
      code: "notation_humaine_absente",
      detail: `${verdict.mode_resolution} exige ${exiges} humain(s) distinct(s) parmi les sources ; ${humains.size} trouvé(s).`,
    },
  ];
}
