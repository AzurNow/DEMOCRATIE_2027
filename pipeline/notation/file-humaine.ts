/**
 * La file de travail des annotateurs humains (§7 ; D18 du 2026-10-06) : qui doit encore noter quoi,
 * sous quel motif.
 *
 * **Entrées.** Le run, ses réponses obtenues (contexte `run`) avec les textes contre lesquels
 * l'extrait d'un juge est contrôlé, toutes les notations du run (juges et humains, calibration
 * comprise), et le tirage du jeu d'or s'il s'agit d'un run pilote (`null` sinon, jamais supposé).
 * L'échantillon humain est rejoué par `echantillons.ts:tirerEchantillonHumain`, au taux du run ; le
 * jeu d'or reçu est rejoué par `tirerJeuOr` et refusé s'il diffère.
 *
 * **Pas d'affectation préalable.** La file dit, pour un annotateur, quelles tâches il peut prendre
 * (`tachesPour`), et les ordonne de façon déterministe sans que l'ordre dépende du motif (§7 ; D79
 * du 2026-11-05, texte proposé pour la 0.34) : le rang d'une tâche est celui de sa réponse dans
 * `echantillons.ts:ordreFileHumaine`, tiré parmi toutes les réponses obtenues du run avec la graine
 * de l'échantillon humain et la clé `ordre_file_humaine`. À rang égal (une réponse sous deux motifs),
 * l'ordre de `MOTIFS_HUMAINS` départage. Un ordre par blocs (l'échantillon d'abord) trahirait à
 * l'annotateur qu'une réponse servie après le bloc vient d'un désaccord ou d'un drapeau des juges.
 *
 * **Dérivation, réponse par réponse.**
 *
 * - Les notations de calibration (`calibration_jeu_or`) sont séparées des notations de décision
 *   (`separerCalibration`) : elles n'entrent jamais dans `decision.ts:decider`, qui les refuserait.
 * - **Échantillon** : les places restantes parmi les deux notations `echantillon_aleatoire_10`,
 *   ouvertes à tout annotateur qui n'en a pas déjà rendu une ; puis, si les deux sont faites et ne
 *   concordent pas (`analysis/note-lue.ts:notationsConcordent`), ou concordent mais divergent sur le
 *   motif d'inexactitude, la citation d'une source ou l'existence d'un lien (§7, 0.33 ; D73 (14),
 *   D75 (15) ; `note-retenue.ts:humainsAArbitrer`), une place d'arbitrage
 *   (`arbitrage_echantillon_10`), fermée aux deux premiers. Ces tâches ne dépendent pas des juges :
 *   elles sont ouvertes même si un juge manque, la réponse figurant alors aussi parmi celles qui
 *   attendent un juge.
 * - **Hors échantillon** : `decider` ; « en attente » d'un humain donne une tâche à une place, sous
 *   le motif que `decider` admet dans ce cas (`MOTIF_HUMAIN_DE_L_ATTENTE`, testé contre `decider`).
 * - **Jeu d'or** : deux places `calibration_jeu_or` par réponse tirée, par deux annotateurs
 *   distincts. Une réponse tirée aussi dans l'échantillon est notée deux fois, sous deux motifs.
 * - **Attend un juge** : `decider` rend « en attente » d'un juge. Ce n'est pas une tâche humaine ;
 *   l'état est rendu à part (`attend_juge`).
 *   Hors échantillon, le même cas entre deux juges est un accord partiel (D15), tâche
 *   `accord_partiel_juges`.
 *
 * **Contraintes tenues.** Deux notations d'échantillon par deux annotateurs distincts ; l'arbitre
 * distinct des deux premiers ; deux notations de calibration par deux annotateurs distincts ; un seul
 * humain appelé hors échantillon (la tâche se ferme dès qu'il a noté, `decider` rendant un verdict) ;
 * jamais deux notations d'un annotateur sur la même réponse sous le même motif. Une entrée qui viole
 * l'une d'elles lève `FileIncoherente` (ou `NotationsIncoherentes`, levée par `decider`) : rien n'est
 * ignoré en silence.
 *
 * **Hors de la file**, explicitement : les notations de juge des contextes contrefactuels (des
 * réponses permutées, qu'aucun humain ne note), et les notations de lectures de comparateur (QR9),
 * dont la file n'est pas écrite ici.
 *
 * **Aveuglement.** `tachesPour` ne rend que la réponse et le motif, jamais qui d'autre a noté. Le
 * motif sert à construire la notation ; l'écran ne le montre pas à l'annotateur quand il trahit une
 * note de juge ou d'humain (D18).
 */

import type { Ulid } from "../../analysis/types.ts";
import { decider, type Decision, type MotifAttente } from "./decision.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";
import { ordreFileHumaine, tirerEchantillonHumain, tirerJeuOr, type JeuOr } from "./echantillons.ts";
import type { TextesDeVerification } from "./extrait.ts";
import { exigerPseudonyme, MOTIFS_HUMAINS, type MotifHumain } from "./notation-humaine.ts";
import { humainsAArbitrer } from "./note-retenue.ts";
import type { NotationIndividuelle, RenvoiHumain, RunDeNotation } from "./types.ts";

export interface ReponseDeLaFile {
  readonly reponse_id: Ulid;
  /** Les textes contre lesquels l'extrait de chaque juge est contrôlé (`extrait.ts`). */
  readonly textes: TextesDeVerification;
}

export interface EntreeFile {
  readonly run: RunDeNotation;
  /** Les réponses obtenues du run : la population de l'échantillon humain et du jeu d'or. */
  readonly reponses: readonly ReponseDeLaFile[];
  /** Toutes les notations du run, juges et humains, calibration comprise. */
  readonly notations: readonly NotationIndividuelle[];
  /** Les renvois de juge du run (D30 (2)) : ils appellent un humain sous `attribution_indecidable`. */
  readonly renvois: readonly RenvoiHumain[];
  /** Le tirage du jeu d'or d'un run pilote ; `null` pour tout autre run. */
  readonly jeu_or: JeuOr | null;
}

export interface Tache {
  readonly reponse_id: Ulid;
  readonly motif_notation: MotifHumain;
  readonly places_restantes: number;
  /** Les annotateurs exclus de cette tâche, rangés. */
  readonly deja_notee_par: readonly string[];
}

/** Ce qu'un annotateur reçoit : jamais qui d'autre a noté. */
export interface TacheAnnotateur {
  readonly reponse_id: Ulid;
  readonly motif_notation: MotifHumain;
}

export interface ReponseEnAttente {
  readonly reponse_id: Ulid;
  readonly motifs: readonly MotifAttente[];
}

export interface Compte {
  readonly taches: number;
  readonly places: number;
}

export interface FileHumaine {
  readonly taches: readonly Tache[];
  /** Réponses dont une notation de juge manque : pas une tâche humaine. */
  readonly attend_juge: readonly ReponseEnAttente[];
  readonly comptes: Readonly<Record<MotifHumain, Compte>>;
  tachesPour(annotateur_id: string): readonly TacheAnnotateur[];
}

export class FileIncoherente extends Error {
  constructor(detail: string) {
    super(`File de notation humaine : ${detail}`);
    this.name = "FileIncoherente";
  }
}

/** Les notations de calibration d'un côté, toutes les autres de l'autre, dans l'ordre reçu. */
export function separerCalibration(notations: readonly NotationIndividuelle[]): {
  readonly decision: readonly NotationIndividuelle[];
  readonly calibration: readonly NotationIndividuelle[];
} {
  return {
    decision: notations.filter((n) => n.motif_notation !== "calibration_jeu_or"),
    calibration: notations.filter((n) => n.motif_notation === "calibration_jeu_or"),
  };
}

/**
 * Le motif sous lequel l'humain appelé hors échantillon note, selon ce qu'attend `decider`, dans cet
 * ordre de priorité : un extrait invalide exige `extrait_invalide` (`decision.ts:motifsHumainsAdmis`) ;
 * sinon `desaccord_juges` si les juges divergent, même si un drapeau grave est aussi posé ; sinon
 * `erreur_grave` ; enfin `accord_partiel_juges` pour un accord des juges sans note commune (D15).
 * `decider` admet `desaccord_juges` comme `erreur_grave` sans extrait invalide : le désaccord est
 * retenu, parce qu'il est la raison première de l'appel.
 */
const MOTIF_HUMAIN_DE_L_ATTENTE: readonly (readonly [MotifAttente, MotifHumain])[] = [
  // D30 (2) : un renvoi de juge prime, comme dans `decision.ts:motifsHumainsAdmis`.
  ["attribution_indecidable", "attribution_indecidable"],
  // §7 (0.27) : le renvoi d'un juge défaillant, après celui d'une Q-ATT indécidable.
  ["juge_defaillant", "juge_defaillant"],
  ["extrait_invalide", "extrait_invalide"],
  ["desaccord_juges", "desaccord_juges"],
  ["drapeau_grave", "erreur_grave"],
  ["accord_sans_note_commune", "accord_partiel_juges"],
];

/** Contextes dont les notations, de juge seulement, ne sont pas l'affaire de la file. */
const CONTEXTES_CONTREFACTUELS: ReadonlySet<string> = new Set(["contrefactuel_candidat", "contrefactuel_outil"]);

/** Le `decider` de la file ne lit que le statut : ce verdict n'est jamais rendu ni écrit. */
const VERDICT_JETABLE = { verdict_id: "00000000000000000000000000", date: "1970-01-01T00:00:00Z" } as const;

interface Contexte {
  readonly run: RunDeNotation;
  readonly echantillon: ReadonlySet<Ulid>;
  readonly jeu_or: ReadonlySet<Ulid>;
  /** Le rang de chaque réponse obtenue dans l'ordre de la file (D79). */
  readonly ordre: ReadonlyMap<Ulid, number>;
}

interface BilanReponse {
  readonly taches: readonly Tache[];
  readonly attend_juge: readonly ReponseEnAttente[];
}

export function construireFile(entree: EntreeFile): FileHumaine {
  const ids = entree.reponses.map((r) => r.reponse_id);
  const ctx: Contexte = {
    run: entree.run,
    echantillon: new Set(tirerEchantillonHumain(ids, entree.run.graines.echantillon_humain, entree.run.taux_echantillon_humain)),
    jeu_or: new Set(jeuOrRejoue(entree, ids)),
    ordre: rangs(ordreFileHumaine(ids, entree.run.graines.echantillon_humain)),
  };
  const parReponse = regrouper(entree, ids);
  const bilans = entree.reponses.map((reponse) => bilanDeReponse(ctx, reponse, notationsDe(parReponse, reponse.reponse_id), renvoisDe(entree, reponse.reponse_id)));
  const taches = bilans.flatMap((b) => b.taches).sort((a, b) => comparerTaches(ctx, a, b));
  const parId = (a: ReponseEnAttente, b: ReponseEnAttente): number => comparerChaines(a.reponse_id, b.reponse_id);
  return {
    taches,
    attend_juge: bilans.flatMap((b) => b.attend_juge).sort(parId),
    comptes: compter(taches),
    tachesPour: (annotateur_id) => tachesPour(taches, annotateur_id),
  };
}

/* ------------------------------------------------------------------ entrées */

function rangs(ordre: readonly Ulid[]): ReadonlyMap<Ulid, number> {
  return new Map(ordre.map((id, rang) => [id, rang]));
}

function jeuOrRejoue(entree: EntreeFile, ids: readonly Ulid[]): readonly Ulid[] {
  if (entree.jeu_or === null) return [];
  const rejoue = tirerJeuOr(ids, entree.run.graines.echantillon_humain);
  if (JSON.stringify(rejoue) !== JSON.stringify(entree.jeu_or)) {
    throw new FileIncoherente(`le tirage du jeu d'or reçu ne se rejoue pas sur les ${ids.length} réponses obtenues du run ${entree.run.id}.`);
  }
  return rejoue.reponse_ids;
}

function horsDeLaFile(notation: NotationIndividuelle): boolean {
  const contrefactuelle = CONTEXTES_CONTREFACTUELS.has(notation.contexte) && notation.notateur.type === "juge";
  return contrefactuelle || notation.objet_note.type === "lecture_comparateur";
}

function regrouper(entree: EntreeFile, ids: readonly Ulid[]): ReadonlyMap<Ulid, NotationIndividuelle[]> {
  const parReponse = new Map<Ulid, NotationIndividuelle[]>(ids.map((id) => [id, []]));
  for (const notation of entree.notations) {
    if (horsDeLaFile(notation)) continue;
    const liste = parReponse.get(notation.objet_note.id);
    if (notation.contexte !== "run" || notation.run_id !== entree.run.id || liste === undefined) {
      throw new FileIncoherente(
        `la notation ${notation.id} (contexte ${notation.contexte}, run ${notation.run_id}) porte sur ${notation.objet_note.id}, qui n'est pas une réponse obtenue du run ${entree.run.id}.`,
      );
    }
    liste.push(notation);
  }
  return parReponse;
}

function notationsDe(parReponse: ReadonlyMap<Ulid, readonly NotationIndividuelle[]>, reponse_id: Ulid): readonly NotationIndividuelle[] {
  const notations = parReponse.get(reponse_id);
  if (notations === undefined) throw new FileIncoherente(`réponse ${reponse_id} absente du regroupement.`);
  return notations;
}

/* ------------------------------------------------------------------ une réponse */

/** Les renvois de contexte run portant sur la réponse ; `decider` contrôle leur cohérence. */
function renvoisDe(entree: EntreeFile, reponse_id: Ulid): readonly RenvoiHumain[] {
  return entree.renvois.filter((renvoi) => renvoi.contexte === "run" && renvoi.objet_note.id === reponse_id);
}

function bilanDeReponse(ctx: Contexte, reponse: ReponseDeLaFile, notations: readonly NotationIndividuelle[], renvois: readonly RenvoiHumain[]): BilanReponse {
  const id = reponse.reponse_id;
  verifierUnParMotif(id, notations);
  const { decision, calibration } = separerCalibration(notations);
  const dans = ctx.echantillon.has(id);
  const resultat = decider({ run: ctx.run, objet_note: { type: "reponse", id }, notations: decision, renvois, dans_echantillon_humain: dans, textes: reponse.textes, ...VERDICT_JETABLE });
  return {
    taches: [...(dans ? tachesEchantillon(id, decision) : tachesHorsEchantillon(id, resultat)), ...tachesJeuOr(ctx, id, calibration)],
    attend_juge: resultat.statut === "en_attente" && resultat.attend === "juge" ? [{ reponse_id: id, motifs: resultat.motifs }] : [],
  };
}

/** Jamais deux notations d'un même humain sur la même réponse sous le même motif. */
function verifierUnParMotif(reponse_id: Ulid, notations: readonly NotationIndividuelle[]): void {
  const vus = new Set<string>();
  for (const n of notations.filter((x) => x.notateur.type === "humain")) {
    const cle = `${n.notateur.id}\u0000${String(n.motif_notation)}`;
    if (vus.has(cle)) throw new FileIncoherente(`réponse ${reponse_id} : deux notations de ${n.notateur.id} sous le motif ${String(n.motif_notation)}.`);
    vus.add(cle);
  }
}

function humainsSous(notations: readonly NotationIndividuelle[], motif: MotifHumain): readonly NotationIndividuelle[] {
  return notations.filter((n) => n.notateur.type === "humain" && n.motif_notation === motif);
}

function auteurs(notations: readonly NotationIndividuelle[]): readonly string[] {
  return notations.map((n) => n.notateur.id).sort(comparerChaines);
}

function tache(reponse_id: Ulid, motif_notation: MotifHumain, places_restantes: number, deja: readonly NotationIndividuelle[]): Tache {
  return { reponse_id, motif_notation, places_restantes, deja_notee_par: auteurs(deja) };
}

/* ------------------------------------------------------------------ échantillon */

function tachesEchantillon(id: Ulid, decision: readonly NotationIndividuelle[]): readonly Tache[] {
  const premiers = humainsSous(decision, "echantillon_aleatoire_10");
  const arbitres = humainsSous(decision, "arbitrage_echantillon_10");
  verifierEchantillon(id, premiers, arbitres);
  const [a, b] = premiers;
  if (a === undefined || b === undefined) return [tache(id, "echantillon_aleatoire_10", 2 - premiers.length, premiers)];
  if (arbitres.length > 0 || !humainsAArbitrer(a, b)) return [];
  return [tache(id, "arbitrage_echantillon_10", 1, premiers)];
}

/**
 * Contrôles qui ne dépendent pas des juges : `decider` ne lit les humains qu'une fois les juges
 * présents, et la file doit rester cohérente avant.
 */
function verifierEchantillon(id: Ulid, premiers: readonly NotationIndividuelle[], arbitres: readonly NotationIndividuelle[]): void {
  if (premiers.length > 2) throw new FileIncoherente(`réponse ${id} : ${premiers.length} notations d'échantillon au lieu de deux.`);
  if (arbitres.length > 1) throw new FileIncoherente(`réponse ${id} : ${arbitres.length} arbitrages au lieu d'un.`);
  const [arbitre] = arbitres;
  if (arbitre === undefined) return;
  const [a, b] = premiers;
  if (a === undefined || b === undefined || !humainsAArbitrer(a, b)) {
    throw new FileIncoherente(`réponse ${id} : arbitrage de ${arbitre.notateur.id} sans deux notations d'échantillon discordantes (note, motif ou sourçage).`);
  }
  if (premiers.some((n) => n.notateur.id === arbitre.notateur.id)) {
    throw new FileIncoherente(`réponse ${id} : l'arbitre ${arbitre.notateur.id} n'est pas un troisième humain.`);
  }
}

/* ------------------------------------------------------------------ hors échantillon */

function tachesHorsEchantillon(id: Ulid, resultat: Decision): readonly Tache[] {
  if (resultat.statut === "verdict" || resultat.attend === "juge") return [];
  const appel = MOTIF_HUMAIN_DE_L_ATTENTE.find(([attente]) => resultat.motifs.includes(attente));
  if (appel === undefined) throw new FileIncoherente(`réponse ${id} : decider attend un humain (${resultat.motifs.join(", ")}) sans motif connu de la file.`);
  return [tache(id, appel[1], 1, [])];
}

/* ------------------------------------------------------------------ jeu d'or */

function tachesJeuOr(ctx: Contexte, id: Ulid, calibration: readonly NotationIndividuelle[]): readonly Tache[] {
  if (!ctx.jeu_or.has(id)) {
    if (calibration.length > 0) throw new FileIncoherente(`réponse ${id} : notation de calibration sur une réponse hors du jeu d'or.`);
    return [];
  }
  if (calibration.some((n) => n.notateur.type !== "humain")) throw new FileIncoherente(`réponse ${id} : notation de calibration par un juge.`);
  if (calibration.length > 2) throw new FileIncoherente(`réponse ${id} : ${calibration.length} notations de calibration au lieu de deux.`);
  return calibration.length === 2 ? [] : [tache(id, "calibration_jeu_or", 2 - calibration.length, calibration)];
}

/* ------------------------------------------------------------------ ordre, comptes, vue d'un annotateur */

/** Le rang de la réponse dans l'ordre tiré de la file, quel que soit le motif (D79). */
function rangDans(ordre: ReadonlyMap<Ulid, number>, reponse_id: Ulid): number {
  const rang = ordre.get(reponse_id);
  if (rang === undefined) throw new FileIncoherente(`réponse ${reponse_id} : tâche hors de l'ordre tiré des réponses obtenues.`);
  return rang;
}

function comparerTaches(ctx: Contexte, a: Tache, b: Tache): number {
  const rangA = rangDans(ctx.ordre, a.reponse_id);
  const rangB = rangDans(ctx.ordre, b.reponse_id);
  return rangA !== rangB ? rangA - rangB : MOTIFS_HUMAINS.indexOf(a.motif_notation) - MOTIFS_HUMAINS.indexOf(b.motif_notation);
}

function compter(taches: readonly Tache[]): Readonly<Record<MotifHumain, Compte>> {
  const comptes = Object.fromEntries(MOTIFS_HUMAINS.map((motif) => [motif, { taches: 0, places: 0 }])) as Record<MotifHumain, Compte>;
  for (const t of taches) {
    const avant = comptes[t.motif_notation];
    comptes[t.motif_notation] = { taches: avant.taches + 1, places: avant.places + t.places_restantes };
  }
  return comptes;
}

function tachesPour(taches: readonly Tache[], annotateur_id: string): readonly TacheAnnotateur[] {
  exigerPseudonyme(annotateur_id);
  return taches.filter((t) => !t.deja_notee_par.includes(annotateur_id)).map((t) => ({ reponse_id: t.reponse_id, motif_notation: t.motif_notation }));
}
