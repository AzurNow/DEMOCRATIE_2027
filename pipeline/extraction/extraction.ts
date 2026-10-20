/**
 * Cœur de l'extraction double d'une source (§4 : « l'extraction est faite deux fois par des modèles
 * de familles différentes et tout désaccord d'existence ou de contenu est signalé » ; décision D52).
 *
 * Entrées : le texte canonique de la source, ses fiches d'extraction et l'extracteur épinglé, sa
 * transcription pour un enregistrement, le bloc `source` déjà assemblé (par
 * `pipeline/collecte/source.py:source_de`, seul assembleur, appelé sans citation : ni page ni
 * extrait), et les **sorties** des deux modèles : chaîne reçue telle quelle, ou raison pour laquelle la
 * réponse n'en donne pas (`SortieModele`, rejetée en `lecture_illisible`). Sorties : les
 * items et les mesures proposés, conformes à leurs schémas, prêts à être déposés dans `staging/`, et
 * le journal des rejets.
 *
 * Pur et déterministe : aucun appel réseau, aucune écriture disque ; le temps et les identifiants
 * entrent par des ports. Le même appel rend les mêmes octets, quel que soit l'ordre des items dans
 * chaque sortie (`appariement.ts`).
 *
 * Phases : vérifier l'entrée ; lire chaque sortie (rejet entier possible) ; rejeter les items qui ne
 * se localisent pas ; apparier ; déposer un item par paire ou par item seul ; valider à la sortie.
 *
 * **Une sortie rejetée en entier** (décision D53 (2)) : la source
 * est refusée, aucun item n'est déposé. Déposer les items de l'autre modèle en
 * `desaccord_existence` affirmerait que le modèle rejeté n'a rien trouvé, alors qu'il n'a rien rendu
 * de lisible : l'extraction n'a pas été faite deux fois.
 */

import { valider, validerFragment } from "../../outils/schemas/valider.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import type { Item, Source } from "../../validation/domaine/types.ts";
import { analyserVtt, type DocumentVtt } from "../../validation/domaine/webvtt.ts";
import { apparier, retenuDe, type Candidat, type Paire } from "./appariement.ts";
import { deposer, type ContexteDepot, type MesureStaging } from "./assemblage.ts";
import { choisirFiche, type ExtracteurEpingle, type FicheExtraction } from "./choix-texte.ts";
import { accordDe } from "./comparaison.ts";
import { exigerConfiguration, type ConfigurationExtraction } from "./configuration.ts";
import { FORMATS_MINUTES } from "./entrees.ts";
import { lireSortie } from "./lecture-sortie.ts";
import { localiser, type Localisation, type Reperes } from "./localisation.ts";
import type { MotifRejetSortieEntiere, Rejet, RejetDepot, RejetItem, RejetSortie } from "./rejets.ts";
import type { ItemPropose, RangModele, SortieExtraction, SortieModele } from "./types.ts";

export { ModelesIdentiques } from "./configuration.ts";

export interface EntreeExtraction {
  readonly configuration: ConfigurationExtraction;
  /** L'extracteur de texte épinglé par le code appelant (D52 (4)). */
  readonly extracteur_epingle: ExtracteurEpingle;
  /** `candidat_id` de la fiche de source. */
  readonly candidat_id: string;
  /** Bloc `commun#/$defs/source` assemblé sans citation : ni `page` ni `extrait`. */
  readonly source: Source;
  /** Toutes les fiches d'extraction de la source, telles que lues sur le disque. */
  readonly fiches: readonly unknown[];
  /** Texte canonique de la fiche de l'extracteur épinglé. */
  readonly texte: string;
  /** Transcription `.vtt` d'un enregistrement audio ou vidéo, `null` pour les autres formats. */
  readonly vtt: string | null;
  /** Sortie de chaque modèle, lisible ou non, par identifiant ; exactement les deux modèles configurés. */
  readonly sorties: ReadonlyMap<string, SortieModele>;
  /** Commit du code qui extrait, inscrit dans l'historique. */
  readonly commit: string;
}

export interface Ports {
  /** Instant ISO 8601 à décalage explicite. */
  readonly maintenant: () => string;
  readonly nouvelUlid: () => string;
}

export interface ResultatExtraction {
  readonly items: readonly Item[];
  readonly mesures: readonly MesureStaging[];
  readonly rejets: readonly Rejet[];
}

/* ------------------------------------------------------------------- erreurs */

export class SortiesIncompletes extends Error {
  constructor(attendus: readonly string[], recus: readonly string[]) {
    super(`Sorties reçues pour ${JSON.stringify(recus)}, attendues pour exactement ${JSON.stringify(attendus)}.`);
    this.name = "SortiesIncompletes";
  }
}

export class TexteNeCorrespondPas extends Error {
  constructor(attendue: string, obtenue: string) {
    super(`Le texte reçu a l'empreinte ${obtenue}, la fiche de l'extracteur épinglé nomme ${attendue}.`);
    this.name = "TexteNeCorrespondPas";
  }
}

export class SourceIncoherente extends Error {
  constructor(detail: string) {
    super(`Bloc source incohérent avec la fiche d'extraction retenue : ${detail}.`);
    this.name = "SourceIncoherente";
  }
}

export class SourceDejaLocalisee extends Error {
  constructor(champ: string) {
    super(`Le bloc source reçu porte déjà « ${champ} » : la page et l'extrait se calculent de chaque citation, ici.`);
    this.name = "SourceDejaLocalisee";
  }
}

export class PagesAbsentes extends Error {
  constructor(fiche: FicheExtraction) {
    super(
      `Source au format pdf, fiche d'extraction ${fiche.texte_sha256} sans pages : une citation tirée d'un PDF ` +
        `porte toujours sa page (§4), elle ne peut pas être calculée.`,
    );
    this.name = "PagesAbsentes";
  }
}

export class TranscriptionIncoherente extends Error {
  constructor(detail: string) {
    super(`Transcription : ${detail}.`);
    this.name = "TranscriptionIncoherente";
  }
}

/* ------------------------------------------------------------ vérifications */

function sortiesOrdonnees(entree: EntreeExtraction): readonly [SortieModele, SortieModele] {
  const [premier, second] = entree.configuration.modeles;
  const sortieA = entree.sorties.get(premier);
  const sortieB = entree.sorties.get(second);
  if (sortieA === undefined || sortieB === undefined || entree.sorties.size !== 2) {
    throw new SortiesIncompletes(entree.configuration.modeles, [...entree.sorties.keys()]);
  }
  return [sortieA, sortieB];
}

function verifierSource(source: Source, fiche: FicheExtraction, texte: string): void {
  const obtenue = sha256(texte);
  if (obtenue !== fiche.texte_sha256) throw new TexteNeCorrespondPas(fiche.texte_sha256, obtenue);
  if (source.texte_sha256 !== fiche.texte_sha256) {
    throw new SourceIncoherente(`source.texte_sha256 ${String(source.texte_sha256)}, fiche ${fiche.texte_sha256}`);
  }
  if (source.page !== undefined) throw new SourceDejaLocalisee("page");
  if (source.extrait !== undefined) throw new SourceDejaLocalisee("extrait");
}

function transcriptionDe(entree: EntreeExtraction, fiche: FicheExtraction): DocumentVtt | null {
  const attendue = FORMATS_MINUTES.has(entree.source.format);
  if (!attendue) {
    if (entree.vtt !== null) throw new TranscriptionIncoherente(`reçue pour une source au format ${entree.source.format}`);
    return null;
  }
  if (entree.vtt === null) throw new TranscriptionIncoherente(`absente pour une source au format ${entree.source.format}`);
  if (sha256(entree.vtt) !== fiche.vtt_sha256) {
    throw new TranscriptionIncoherente(`empreinte ${sha256(entree.vtt)}, la fiche nomme ${String(fiche.vtt_sha256)}`);
  }
  const document = analyserVtt(entree.vtt);
  if (document.texte !== entree.texte) throw new TranscriptionIncoherente("le texte dérivé du .vtt n'est pas le texte canonique");
  return document;
}

function reperesDe(entree: EntreeExtraction, fiche: FicheExtraction): Reperes {
  if (entree.source.format === "pdf" && fiche.pages === undefined) throw new PagesAbsentes(fiche);
  return { pages: fiche.pages === undefined ? null : fiche.pages, vtt: transcriptionDe(entree, fiche) };
}

/* -------------------------------------------------------------- localisation */

interface Lot {
  readonly candidats: Candidat[];
  readonly localisations: Map<Candidat, Localisation>;
  readonly rejets: RejetItem[];
}

interface ContexteLocalisation {
  readonly candidat_id: string;
  readonly texte: string;
  readonly reperes: Reperes;
}

function examiner(lot: Lot, item: ItemPropose, rang: RangModele, index: number, modele: string, contexte: ContexteLocalisation): void {
  if (item.candidat_id !== contexte.candidat_id) {
    const detail = `candidat_id « ${item.candidat_id} », la source est rattachée à « ${contexte.candidat_id} »`;
    lot.rejets.push({ portee: "item", modele, index, motif: "candidat_different", detail });
    return;
  }
  const resultat = localiser(item.citation_verbatim, contexte.texte, contexte.reperes);
  if (!resultat.ok) {
    lot.rejets.push({ portee: "item", modele, index, motif: resultat.motif, detail: resultat.detail });
    return;
  }
  const { localisation } = resultat;
  const candidat: Candidat = { rang, index, item, debut: localisation.offset_debut, fin: localisation.offset_fin };
  lot.candidats.push(candidat);
  lot.localisations.set(candidat, localisation);
}

function localiserLesItems(sorties: readonly [SortieExtraction, SortieExtraction], modeles: readonly [string, string], contexte: ContexteLocalisation): Lot {
  const lot: Lot = { candidats: [], localisations: new Map(), rejets: [] };
  sorties.forEach((sortie, rang) => {
    sortie.items.forEach((item, index) => examiner(lot, item, rang as RangModele, index, modeles[rang] as string, contexte));
  });
  return lot;
}

/* ---------------------------------------------------------------------- dépôt */

/** Types qu'un item de staging peut porter depuis une seule source : un item O exige aussi son état antérieur (§4). */
const TYPES_DEPOSABLES: ReadonlySet<ItemPropose["type"]> = new Set(["P"]);

function rejetDepot(paire: Paire, modeles: readonly [string, string]): RejetDepot {
  const retenu = retenuDe(paire);
  const partenaire = retenu === paire.premier ? paire.second : null;
  const accord = accordDe(paire, modeles).accord;
  return {
    portee: "depot",
    modele: modeles[retenu.rang],
    index: retenu.index,
    motif: "etat_o_sans_etat_anterieur",
    accord,
    detail:
      `item O : la source n'en établit que l'état postérieur, l'état antérieur se rapproche d'une autre source (§4, prompt) ; ` +
      (partenaire === null ? "aucun item apparié" : `apparié à l'item ${partenaire.index} de ${modeles[partenaire.rang]}`),
  };
}

function localisationDe(lot: Lot, candidat: Candidat): Localisation {
  const localisation = lot.localisations.get(candidat);
  if (localisation === undefined) throw new Error(`Item ${candidat.index} du modèle de rang ${candidat.rang} apparié sans localisation.`);
  return localisation;
}

function deposerLesPaires(paires: readonly Paire[], lot: Lot, contexte: ContexteDepot): Pick<ResultatExtraction, "items" | "mesures" | "rejets"> {
  const items: Item[] = [];
  const mesures: MesureStaging[] = [];
  const rejets: RejetDepot[] = [];
  for (const paire of paires) {
    const retenu = retenuDe(paire);
    if (!TYPES_DEPOSABLES.has(retenu.item.type)) {
      rejets.push(rejetDepot(paire, contexte.configuration.modeles));
      continue;
    }
    const depot = deposer(retenu, localisationDe(lot, retenu), accordDe(paire, contexte.configuration.modeles), contexte);
    items.push(valider<Item>("item", depot.item, `item extrait ${depot.item.id}`));
    mesures.push(valider<MesureStaging>("mesure", depot.mesure, `mesure proposée ${depot.mesure.id}`));
  }
  return { items, mesures, rejets };
}

/* --------------------------------------------------------------------- entrée */

function refusDeLaSource(rejets: readonly RejetSortie[]): ResultatExtraction {
  const modeles = rejets.map((rejet) => rejet.modele).join(" et de ");
  return {
    items: [],
    mesures: [],
    rejets: [
      ...rejets,
      {
        portee: "source",
        motif: "extraction_double_incomplete",
        detail: `sortie de ${modeles} rejetée en entier : la source n'a pas été extraite deux fois (§4), aucun item déposé`,
      },
    ],
  };
}

type Lectures =
  | { readonly ok: true; readonly sorties: readonly [SortieExtraction, SortieExtraction] }
  | { readonly ok: false; readonly rejets: readonly RejetSortie[] };

type LectureModele =
  | { readonly ok: true; readonly sortie: SortieExtraction }
  | { readonly ok: false; readonly motif: MotifRejetSortieEntiere; readonly detail: string };

/** Une sortie illisible est rejetée avec son motif et sa raison, telle quelle ; une sortie lisible est lue par `lireSortie`. */
function lireSortieModele(sortie: SortieModele): LectureModele {
  if (!sortie.lisible) return { ok: false, motif: sortie.motif, detail: sortie.raison };
  return lireSortie(sortie.texte);
}

function lireLesSorties(sorties: readonly [SortieModele, SortieModele], modeles: readonly [string, string]): Lectures {
  const lectures = [lireSortieModele(sorties[0]), lireSortieModele(sorties[1])] as const;
  const [premiere, seconde] = lectures;
  if (premiere.ok && seconde.ok) return { ok: true, sorties: [premiere.sortie, seconde.sortie] };
  const rejets = lectures.flatMap((lecture, rang): RejetSortie[] =>
    lecture.ok ? [] : [{ portee: "sortie", modele: modeles[rang] as string, motif: lecture.motif, detail: lecture.detail }],
  );
  return { ok: false, rejets };
}

function exigerEntree(entree: EntreeExtraction): void {
  exigerConfiguration(entree.configuration);
  validerFragment("commun", "#/$defs/identifiant_court", entree.candidat_id, "candidat_id de l'extraction");
  validerFragment("commun", "#/$defs/commit_git", entree.commit, "commit de l'extraction");
}

export function extraireSource(entree: EntreeExtraction, ports: Ports): ResultatExtraction {
  exigerEntree(entree);
  const sorties = sortiesOrdonnees(entree);
  const fiche = choisirFiche(entree.fiches, entree.extracteur_epingle, entree.source.sha256);
  verifierSource(entree.source, fiche, entree.texte);
  const reperes = reperesDe(entree, fiche);
  const { modeles } = entree.configuration;
  const lectures = lireLesSorties(sorties, modeles);
  if (!lectures.ok) return refusDeLaSource(lectures.rejets);
  const lot = localiserLesItems(lectures.sorties, modeles, {
    candidat_id: entree.candidat_id,
    texte: entree.texte,
    reperes,
  });
  const paires = apparier(
    lot.candidats.filter((candidat) => candidat.rang === 0),
    lot.candidats.filter((candidat) => candidat.rang === 1),
  );
  const contexte: ContexteDepot = { ...entree, instant: ports.maintenant(), nouvelUlid: ports.nouvelUlid };
  const depot = deposerLesPaires(paires, lot, contexte);
  return { items: depot.items, mesures: depot.mesures, rejets: [...lot.rejets, ...depot.rejets] };
}
