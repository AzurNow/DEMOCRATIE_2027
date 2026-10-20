/**
 * Chargeur de `config/perimetre.yaml` (conformité 2026-09-29, n° 23 et 25).
 *
 * Le fichier est saisi à la main par l'auteur, aux noms de `run.schema.json#/properties/perimetre`
 * (décision de l'auteur du 2026-10-02). Ce module en tire, pour un run :
 *   (a) l'instantané `run.perimetre`, validé contre `run.schema.json` avant d'être rendu ;
 *   (b) les `ParametresTirage` du tirage (§5 : les deux quotas, le second « déclaré séparément
 *       dans `config/perimetre.yaml` »).
 *
 * Quatre phases, chacune un refus nommé, jamais une valeur par défaut :
 *   1. le fichier est validé contre `schema/perimetre.schema.json` (`ErreurSchema`) ; un brouillon
 *      (clés à null, listes vides) y est conforme ;
 *   2. pour un run, aucun null ne reste dans une clé obligatoire et les listes de candidats et
 *      d'outils ne sont pas vides (`PerimetreIncomplet`, qui nomme chaque clé) ;
 *   3. ce que le JSON Schema ne sait pas contrôler (`PerimetreRefuse`, qui nomme chaque motif) :
 *      les dix thèmes exactement, les identifiants uniques, un `candidat_id` homonyme de l'amorce
 *      du groupe d'attribution du tirage (`tirage.ts:AMORCE_GROUPE_ATTRIBUTION`, D55 (10)), la
 *      liste officielle selon le régime, un candidat retiré non interrogé, la règle d'inclusion du
 *      §3 (`perimetre.ts:inclusionAvantListe`)
 *      pour chaque candidat non retiré du régime `avant_liste_officielle`, et un alias aveugle pour
 *      chaque assistant inclus, qui ne trahit ni le libellé, ni l'éditeur, ni l'`outil_id` d'un outil
 *      du périmètre (aucun de leurs mots significatifs, aucune de leurs formes collées :
 *      `revelationsDansAlias`, D48 (2) et (3)), qu'aucun autre outil ne partage, après
 *      normalisation (`normaliserAlias`, D45 (2)), et qui n'est pas confondable avec un alias
 *      aveugle de candidat — la lettre « C » suivie uniquement de chiffres (§7, protocole 0.20) ;
 *   4. l'instantané est calculé — `items_p_au_gel` par `couverture.ts:itemsPAuGel`,
 *      `items_p_verifies` en est la longueur (la définition de `itemsPComptesAuGel`), `sous_seuil`
 *      le seuil du §4 — puis validé contre `run.schema.json#/properties/perimetre`.
 *
 * Ce que le chargeur ne fait pas : lire les parts 80 % / 20 % du §5 (constantes de `tirage.ts` et
 * `symetrie.ts`), calculer `par_mode` (`analysis/seuils.ts`, après le run), attribuer les alias
 * aveugles (l'appelant les fournit : aucun code du dépôt ne les attribue aujourd'hui), écrire un
 * fichier. `libelle`, `editeur` et `sdk` d'un outil, et `contact_notification` d'un candidat
 * (lu par `outils/contacts.ts`), restent dans le YAML : `run.schema.json` ne les porte pas.
 */

import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Mode } from "../../analysis/types.ts";
import { validerFragment, valider } from "../../outils/schemas/valider.ts";
import { itemsPAuGel } from "./couverture.ts";
import { inclusionAvantListe, SONDAGES_MINIMUM } from "./perimetre.ts";
import { AMORCE_GROUPE_ATTRIBUTION } from "./tirage.ts";
import { THEMES } from "./types.ts";
import type { Item, Mesure, ParametresTirage, RegimeInclusion, StatutAuGel } from "./types.ts";

/**
 * §4 : « Un candidat comptant moins de 10 items P vérifiés à la date du run est rapporté à part. »
 * Aucune constante du code ne portait ce seuil avant ce chargeur : il n'était écrit que dans
 * `run.schema.json` (lien `items_p_verifies` ↔ `sous_seuil`), qui revalide l'instantané produit et
 * lèverait si les deux divergeaient.
 */
export const SEUIL_COUVERTURE_ITEMS_P = 10;

/** `run.schema.json#/$defs/preuve_archivee`. */
export interface PreuveArchivee {
  readonly url: string;
  readonly date_publication: string;
  readonly sha256: string;
  readonly archive_url: string;
}

export interface DeclarationCandidature {
  readonly url: string;
  readonly date: string;
  readonly par: "interesse" | "parti";
  readonly sha256: string;
  readonly archive_url: string;
}

export interface PreuveSondage extends PreuveArchivee {
  readonly institut: string;
}

interface CandidatSaisi {
  readonly candidat_id: string;
  readonly libelle: string;
  readonly nom: string;
  readonly statut_au_gel: StatutAuGel;
  readonly interroge: boolean;
  readonly declaration_candidature?: DeclarationCandidature;
  readonly preuves_inclusion?: readonly PreuveSondage[];
  readonly contact_notification: unknown;
}

/** Ce que l'outil porte dans l'instantané : tout ce qui est saisi, sauf libelle, editeur et sdk. */
interface OutilCommun {
  readonly outil_id: string;
  readonly famille: "assistant" | "comparateur";
  readonly inclus: boolean;
  readonly motif_exclusion?: string;
  readonly modele_demande?: string;
  readonly modes?: readonly Mode[];
  readonly mode_de_tete?: Mode;
  readonly cgu_relues_le?: string;
  readonly clause_restrictive_signalee?: boolean;
  readonly preuve_inclusion?: PreuveArchivee;
}

interface OutilSaisi extends OutilCommun {
  readonly libelle: string;
  readonly editeur: string;
  readonly sdk?: { readonly paquet: string; readonly version: string };
}

/** `config/perimetre.yaml`, une fois conforme à `schema/perimetre.schema.json`. */
interface PerimetreSaisi {
  readonly version: string;
  readonly date_gel: string | null;
  readonly regime_inclusion: RegimeInclusion | null;
  readonly liste_officielle: PreuveArchivee | null;
  readonly themes: readonly string[];
  readonly tirage: {
    readonly questions_par_strate: number | null;
    readonly questions_attribution_par_theme: number | null;
  };
  readonly candidats: readonly CandidatSaisi[];
  readonly outils: readonly OutilSaisi[];
}

/** Le même, sans aucun null restant dans une clé obligatoire. */
interface PerimetrePourRun extends Omit<PerimetreSaisi, "date_gel" | "regime_inclusion" | "tirage"> {
  readonly date_gel: string;
  readonly regime_inclusion: RegimeInclusion;
  readonly tirage: ParametresTirage;
}

export interface CandidatDeRun {
  readonly candidat_id: string;
  readonly libelle: string;
  readonly nom: string;
  readonly statut_au_gel: StatutAuGel;
  readonly interroge: boolean;
  readonly declaration_candidature?: DeclarationCandidature;
  readonly preuves_inclusion?: readonly PreuveSondage[];
  readonly items_p_verifies: number;
  readonly items_p_au_gel: readonly string[];
  readonly sous_seuil: boolean;
}

export interface OutilDeRun extends OutilCommun {
  readonly alias_aveugle?: string;
}

/** `run.perimetre`, tel que `run.schema.json` le décrit. */
export interface PerimetreDeRun {
  readonly regime_inclusion: RegimeInclusion;
  readonly liste_officielle?: PreuveArchivee;
  readonly candidats: readonly CandidatDeRun[];
  readonly outils: readonly OutilDeRun[];
}

/** Ce que l'appelant fournit, lu au gel ailleurs que dans ce fichier. */
export interface ContexteDuGel {
  readonly items: readonly Item[];
  readonly mesures: readonly Mesure[];
  /** `outil_id` → alias aveugle (§7). Exigé pour chaque assistant inclus. */
  readonly alias_aveugles: ReadonlyMap<string, string>;
}

export interface PerimetreCharge {
  readonly date_gel: string;
  readonly perimetre: PerimetreDeRun;
  readonly parametres_tirage: ParametresTirage;
}

/** Un brouillon présenté pour un run : chaque clé restée nulle ou liste vide est nommée. */
export class PerimetreIncomplet extends Error {
  readonly provenance: string;
  readonly cles: readonly string[];

  constructor(provenance: string, cles: readonly string[]) {
    super(
      `${provenance} : périmètre incomplet pour un run, clés nulles ou listes vides : ${cles.join(", ")}. ` +
        `Aucune valeur par défaut n'est appliquée.`,
    );
    this.name = "PerimetreIncomplet";
    this.provenance = provenance;
    this.cles = cles;
  }
}

/** Un périmètre conforme au schéma mais que les règles refusent : chaque motif est nommé. */
export class PerimetreRefuse extends Error {
  readonly provenance: string;
  readonly motifs: readonly string[];

  constructor(provenance: string, motifs: readonly string[]) {
    super(`${provenance} : périmètre refusé :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "PerimetreRefuse";
    this.provenance = provenance;
    this.motifs = motifs;
  }
}

/* -------------------------------------------------------- 2. complet pour un run */

function clesManquantes(saisi: PerimetreSaisi): readonly string[] {
  const nulles: readonly (readonly [string, unknown])[] = [
    ["date_gel", saisi.date_gel],
    ["regime_inclusion", saisi.regime_inclusion],
    ["tirage.questions_par_strate", saisi.tirage.questions_par_strate],
    ["tirage.questions_attribution_par_theme", saisi.tirage.questions_attribution_par_theme],
  ];
  const vides: readonly (readonly [string, readonly unknown[]])[] = [
    ["candidats", saisi.candidats],
    ["outils", saisi.outils],
  ];
  return [
    ...nulles.filter(([, valeur]) => valeur === null).map(([cle]) => cle),
    ...vides.filter(([, liste]) => liste.length === 0).map(([cle]) => cle),
  ];
}

function sansNull(saisi: PerimetreSaisi): PerimetrePourRun | null {
  const { date_gel, regime_inclusion } = saisi;
  const { questions_par_strate, questions_attribution_par_theme } = saisi.tirage;
  if (date_gel === null || regime_inclusion === null) return null;
  if (questions_par_strate === null || questions_attribution_par_theme === null) return null;
  return { ...saisi, date_gel, regime_inclusion, tirage: { questions_par_strate, questions_attribution_par_theme } };
}

function exigerPourUnRun(saisi: PerimetreSaisi, provenance: string): PerimetrePourRun {
  const cles = clesManquantes(saisi);
  const pourRun = sansNull(saisi);
  if (cles.length > 0 || pourRun === null) throw new PerimetreIncomplet(provenance, cles);
  return pourRun;
}

/* ------------------------------------------------- 3. ce que le schéma ne sait pas */

function doublons(valeurs: readonly string[]): readonly string[] {
  return [...new Set(valeurs.filter((valeur, rang) => valeurs.indexOf(valeur) !== rang))];
}

function motifsThemes(themes: readonly string[]): readonly string[] {
  const saisis = new Set(themes);
  const attendus = new Set<string>(THEMES);
  return [
    ...THEMES.filter((theme) => !saisis.has(theme)).map((theme) => `themes : « ${theme} » manquant`),
    ...themes.filter((theme) => !attendus.has(theme)).map((theme) => `themes : « ${theme} » hors des dix thèmes du §3`),
    ...doublons(themes).map((theme) => `themes : « ${theme} » en double`),
  ].map((motif) => `${motif} (exactement commun#/$defs/theme)`);
}

/**
 * D55 (10), constat 42 de la revue du 2026-10-12 : un `candidat_id` homonyme de l'amorce du groupe
 * d'attribution (`tirage.ts:AMORCE_GROUPE_ATTRIBUTION`) partagerait son flux aléatoire avec lui au
 * tirage (`tirage.ts:amorce`). Seule source de vérité de cette chaîne : importée, jamais recopiée.
 */
function motifsAmorceAttribution(candidats: readonly CandidatSaisi[]): readonly string[] {
  return candidats
    .filter((candidat) => candidat.candidat_id === AMORCE_GROUPE_ATTRIBUTION)
    .map(
      (candidat) =>
        `candidats : candidat_id « ${candidat.candidat_id} » est l'identifiant du groupe d'attribution ` +
        `du tirage ; il partagerait son flux aléatoire avec lui (§5, D55 (10))`,
    );
}

function motifsIdentifiants(perimetre: PerimetrePourRun): readonly string[] {
  return [
    ...doublons(perimetre.candidats.map((candidat) => candidat.candidat_id)).map((id) => `candidats : candidat_id « ${id} » en double`),
    ...doublons(perimetre.outils.map((outil) => outil.outil_id)).map((id) => `outils : outil_id « ${id} » en double`),
    ...motifsAmorceAttribution(perimetre.candidats),
  ];
}

/** §3 : la liste officielle est exigée dans son régime et interdite avant. Une table, pas un `if` par régime. */
const LISTE_OFFICIELLE_EXIGEE: Readonly<Record<RegimeInclusion, boolean>> = {
  avant_liste_officielle: false,
  liste_officielle: true,
};

function motifsRegime(perimetre: PerimetrePourRun): readonly string[] {
  const exigee = LISTE_OFFICIELLE_EXIGEE[perimetre.regime_inclusion];
  if ((perimetre.liste_officielle !== null) === exigee) return [];
  const attendu = exigee ? "la liste archivée du Conseil constitutionnel est exigée" : "elle doit rester null";
  return [`liste_officielle : ${exigee ? "absente" : "renseignée"} dans le régime ${perimetre.regime_inclusion} ; ${attendu} (§3)`];
}

function motifsRetires(candidats: readonly CandidatSaisi[]): readonly string[] {
  return candidats
    .filter((candidat) => candidat.statut_au_gel === "retire" && candidat.interroge)
    .map((candidat) => `${candidat.candidat_id} : retiré mais interroge: true ; §3, aucune question ne le nomme plus`);
}

function motifInclusion(candidat: CandidatSaisi, date_gel: string): readonly string[] {
  const verdict = inclusionAvantListe(candidat, date_gel);
  if (verdict.inclus) return [];
  const declaration = verdict.declaration_au_gel ? "présente au gel" : "absente ou postérieure au gel";
  return [
    `${candidat.candidat_id} : ne remplit pas la règle d'inclusion du §3 au gel ${date_gel} ` +
      `(déclaration de candidature ${declaration} ; ${verdict.sondages_dans_la_fenetre} sondage(s) distinct(s) ` +
      `dans les 60 jours, ${SONDAGES_MINIMUM} exigés). Le fichier l'inclurait à tort.`,
  ];
}

/** §3 : la règle des sondages ne vaut que pour un candidat non retiré du régime avant la liste. */
function motifsInclusion(perimetre: PerimetrePourRun): readonly string[] {
  if (perimetre.regime_inclusion !== "avant_liste_officielle") return [];
  return perimetre.candidats
    .filter((candidat) => candidat.statut_au_gel !== "retire")
    .flatMap((candidat) => motifInclusion(candidat, perimetre.date_gel));
}

function exigeAlias(outil: OutilCommun): boolean {
  return outil.famille === "assistant" && outil.inclus;
}

/**
 * D45 (2) : la seule normalisation des alias aveugles, entre eux et avec les champs qui nomment un
 * outil — NFKD, diacritiques (marques combinantes) retirés, minuscules, espaces repliés en un seul
 * et retirés aux deux bouts. « Éditeur  Alpha » et « editeur alpha » sont le même texte.
 */
export function normaliserAlias(texte: string): string {
  return texte.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

/** D48 (3) : un mot de 3 lettres au moins, après normalisation, est significatif ; « ai », « le » ne le sont pas. */
export const LETTRES_MOT_SIGNIFICATIF = 3;

/** Ce qui n'est ni lettre ni chiffre sépare les mots (espace, tiret, souligné, apostrophe…). */
const SEPARATEURS = /[^\p{L}\p{N}]+/gu;

/** Ce qu'un alias trahit d'un texte qui nomme un outil : un de ses mots significatifs, ou sa forme collée. */
export interface Revelation {
  readonly nature: "mot" | "forme_collee";
  /** Le mot ou la forme collée, normalisés, tels que trouvés dans l'alias. */
  readonly trouve: string;
}

function motsSignificatifs(normalise: string): readonly string[] {
  const mots = normalise.split(SEPARATEURS).filter((mot) => [...mot].length >= LETTRES_MOT_SIGNIFICATIF);
  return [...new Set(mots)];
}

function formeCollee(normalise: string): string {
  return normalise.replace(SEPARATEURS, "");
}

/**
 * D48 (3) : la seule comparaison d'un alias à un texte qui nomme un outil, l'un et l'autre passés par
 * `normaliserAlias`. L'alias trahit le texte s'il contient un de ses mots significatifs (« Mistral »
 * contre « Mistral AI ») ou sa forme sans espaces ni séparateurs, comparée à la forme collée de
 * l'alias (« LeChat » contre « Le Chat »), quand elle compte 3 lettres au moins comme un mot (D50 :
 * un outil nommé « X » ne fait pas refuser tout alias qui contient un X). Ces deux règles couvrent
 * l'inclusion du texte entier, dès qu'il compte 3 lettres au moins.
 * Rend tout ce qui est trouvé, mots d'abord ; vide, l'alias ne trahit pas ce texte.
 */
export function revelationsDansAlias(alias: string, texte: string): readonly Revelation[] {
  const alias_normalise = normaliserAlias(alias);
  const texte_normalise = normaliserAlias(texte);
  const mots: readonly Revelation[] = motsSignificatifs(texte_normalise)
    .filter((mot) => alias_normalise.includes(mot))
    .map((mot) => ({ nature: "mot", trouve: mot }));
  const collee = formeCollee(texte_normalise);
  const forme: readonly Revelation[] =
    [...collee].length >= LETTRES_MOT_SIGNIFICATIF && formeCollee(alias_normalise).includes(collee) ? [{ nature: "forme_collee", trouve: collee }] : [];
  return [...mots, ...forme];
}

/**
 * Ce qui, dans un outil saisi, le nomme : `libelle` (le périmètre ne porte pas de champ « nom »
 * distinct de lui), `editeur` et `outil_id` (D48 (2) : clé stable, ses tirets et soulignés
 * découpent des mots comme les espaces). Un alias qui en trahit un, de n'importe quel outil du
 * périmètre, trahit un outil au juge (§7).
 */
const CHAMPS_REVELATEURS = ["libelle", "editeur", "outil_id"] as const;

const NATURE: Readonly<Record<Revelation["nature"], string>> = { mot: "le mot", forme_collee: "la forme collée" };

function enMots(revelations: readonly Revelation[]): string {
  return revelations.map((revelation) => `${NATURE[revelation.nature]} « ${revelation.trouve} »`).join(", ");
}

function motifsRevelateurs(outil_id: string, alias: string, outils: readonly OutilSaisi[]): readonly string[] {
  return outils.flatMap((outil) =>
    CHAMPS_REVELATEURS.map((champ) => ({ champ, revelations: revelationsDansAlias(alias, outil[champ]) }))
      .filter(({ revelations }) => revelations.length > 0)
      .map(
        ({ champ, revelations }) =>
          `alias_aveugle « ${alias} » de ${outil_id} contient ${enMots(revelations)} du ${champ} « ${outil[champ]} » ` +
          `de l'outil ${outil.outil_id} : l'aveuglement des juges ne tient plus (§7, D45 (2), D48 (2) et (3))`,
      ),
  );
}

/** Les alias, groupés par texte normalisé : un groupe de plus d'un est partagé par plusieurs outils. */
function motifsPartages(alias: ReadonlyMap<string, string>): readonly string[] {
  const valeurs = [...alias.values()];
  const normalises = valeurs.map(normaliserAlias);
  return doublons(normalises).map((normalise) => {
    const saisis = [...new Set(valeurs.filter((_, rang) => normalises[rang] === normalise))];
    const textes = saisis.map((valeur) => `« ${valeur} »`).join(", ");
    return `alias_aveugle ${textes} attribué à plusieurs outils : l'aveuglement des juges ne tient plus (§7)`;
  });
}

/**
 * Règle de code (§7, protocole 0.20) : un alias d'outil formé de la lettre « C » suivie uniquement
 * de chiffres est confondable avec un alias aveugle de candidat (« C1 » à « Cn »). Non écrite au
 * protocole (décision de session, à reporter à la prochaine révision) : `pattern` des schémas
 * inchangé, refus par le code qui valide le périmètre, comme les autres règles de cette fonction.
 */
const ALIAS_OUTIL_CONFONDU_CANDIDAT = /^C[0-9]+$/;

function motifsConfondusAvecCandidat(alias: ReadonlyMap<string, string>): readonly string[] {
  return [...alias]
    .filter(([, valeur]) => ALIAS_OUTIL_CONFONDU_CANDIDAT.test(valeur))
    .map(([outil_id, valeur]) => `alias_aveugle « ${valeur} » de ${outil_id} confondable avec un alias aveugle de candidat (§7, 0.20)`);
}

function motifsAlias(outils: readonly OutilSaisi[], alias: ReadonlyMap<string, string>): readonly string[] {
  const connus = new Set(outils.map((outil) => outil.outil_id));
  return [
    ...outils
      .filter((outil) => exigeAlias(outil) && !alias.has(outil.outil_id))
      .map((outil) => `${outil.outil_id} : assistant inclus sans alias_aveugle fourni par l'appelant (§7)`),
    ...[...alias.keys()]
      .filter((id) => !connus.has(id))
      .map((id) => `alias_aveugle fourni pour « ${id} », absent des outils du périmètre`),
    ...motifsPartages(alias),
    ...motifsConfondusAvecCandidat(alias),
    ...[...alias].flatMap(([outil_id, valeur]) => motifsRevelateurs(outil_id, valeur, outils)),
  ];
}

function exigerCoherent(perimetre: PerimetrePourRun, contexte: ContexteDuGel, provenance: string): void {
  const motifs = [
    ...motifsThemes(perimetre.themes),
    ...motifsIdentifiants(perimetre),
    ...motifsRegime(perimetre),
    ...motifsRetires(perimetre.candidats),
    ...motifsInclusion(perimetre),
    ...motifsAlias(perimetre.outils, contexte.alias_aveugles),
  ];
  if (motifs.length > 0) throw new PerimetreRefuse(provenance, motifs);
}

/* ------------------------------------------------------------- 4. instantané */

function candidatAuGel(candidat: CandidatSaisi, date_gel: string, contexte: ContexteDuGel): CandidatDeRun {
  const { contact_notification: _horsInstantane, ...saisi } = candidat;
  const items_p_au_gel = itemsPAuGel(contexte.items, candidat.candidat_id, date_gel, contexte.mesures);
  return {
    ...saisi,
    items_p_verifies: items_p_au_gel.length,
    items_p_au_gel,
    sous_seuil: items_p_au_gel.length < SEUIL_COUVERTURE_ITEMS_P,
  };
}

/** L'alias absent reste absent : `run.schema.json` refuse alors l'assistant inclus qui n'en a pas. */
function outilAuGel(outil: OutilSaisi, alias: ReadonlyMap<string, string>): OutilDeRun {
  const { libelle: _libelle, editeur: _editeur, sdk: _sdk, ...reste } = outil;
  const alias_aveugle = alias.get(outil.outil_id);
  return alias_aveugle === undefined ? reste : { ...reste, alias_aveugle };
}

function instantane(perimetre: PerimetrePourRun, contexte: ContexteDuGel): PerimetreDeRun {
  const liste = perimetre.liste_officielle === null ? {} : { liste_officielle: perimetre.liste_officielle };
  return {
    regime_inclusion: perimetre.regime_inclusion,
    ...liste,
    candidats: perimetre.candidats.map((candidat) => candidatAuGel(candidat, perimetre.date_gel, contexte)),
    outils: perimetre.outils.map((outil) => outilAuGel(outil, contexte.alias_aveugles)),
  };
}

/**
 * La partie pure : le YAML déjà lu, les items et mesures au gel, les alias. Rend l'instantané
 * validé et les paramètres du tirage, ou lève (`ErreurSchema`, `PerimetreIncomplet`,
 * `PerimetreRefuse`, ou l'erreur de `itemsPAuGel` sur un item ou une mesure incohérents).
 */
export function construirePerimetre(brut: unknown, contexte: ContexteDuGel, provenance: string): PerimetreCharge {
  const saisi = valider<PerimetreSaisi>("perimetre", brut, provenance);
  const perimetre = exigerPourUnRun(saisi, provenance);
  exigerCoherent(perimetre, contexte, provenance);
  const produit = validerFragment<PerimetreDeRun>(
    "run",
    "#/properties/perimetre",
    instantane(perimetre, contexte),
    `${provenance}, instantané run.perimetre`,
  );
  return {
    date_gel: perimetre.date_gel,
    perimetre: produit,
    parametres_tirage: {
      questions_par_strate: perimetre.tirage.questions_par_strate,
      questions_attribution_par_theme: perimetre.tirage.questions_attribution_par_theme,
    },
  };
}

/** La partie mince : lit le fichier YAML (clés en double refusées par `yaml`) et délègue. */
export function chargerPerimetre(chemin: string, contexte: ContexteDuGel): PerimetreCharge {
  const brut: unknown = parse(readFileSync(chemin, "utf8"));
  return construirePerimetre(brut, contexte, chemin);
}
