/**
 * Fabriques d'objets pour les tests. Aucun candidat réel, aucune position réelle : les items
 * de test portent des identifiants ouvertement fictifs. Inventer une position attribuée à une
 * personne réelle est interdit sans réserve, et un fichier de test n'est pas une exception.
 */

import { empreinteContenuNotant, empreinteDe, empreinteMesure } from "../../validation/domaine/empreinte.ts";
import type {
  Correction,
  Decision,
  EntreeDecision,
  Grille,
  Item,
  Mesure,
  NatureLot,
  QuestionsSpecifiques,
  Source,
} from "../../validation/domaine/types.ts";

export const GRILLE_TOUT_VRAI: Grille = {
  citation_fidele: true,
  paraphrase_exacte: true,
  position_univoque: true,
  theme_correct: true,
  quantification_correcte: true,
};

export function source(surcharges: Partial<Source> = {}): Source {
  return {
    tier: "T1",
    url: "https://demo.invalid/programme.pdf",
    type_document: "programme_pdf",
    // Protocole 0.13 (n° 54) : chaque source déclare son format.
    format: "pdf",
    page: 14,
    sha256: "1".repeat(64),
    texte_sha256: "2".repeat(64),
    archive_url: "https://archive.invalid/programme.pdf",
    date_source: "2026-09-01",
    date_collecte: "2026-09-03T09:12:00+02:00",
    chemin_local: "validation/fixtures/archives/programme.pdf",
    publication: "publique",
    ...surcharges,
  };
}

/**
 * `mesure.schema.json` exige un historique, que le type `Mesure` de l'interface ne lit pas : la
 * fabrique le porte pour que la mesure passe la validation de schéma à la lecture de `staging/`.
 */
const HISTORIQUE_MESURE = [
  {
    date: "2026-09-03T10:00:00+02:00",
    changement: "création",
    commit: "a".repeat(40),
    version_resultante: 1,
  },
];

/**
 * L'empreinte est calculée depuis le contenu, surcharges comprises, comme celle des items : un test
 * qui veut une empreinte incohérente la pose après coup, `{ ...mesure(), empreinte }`.
 */
export function mesure(surcharges: Partial<Mesure> = {}): Mesure {
  const socle = {
    id: "01JBANCESSA90000000MESVRE1",
    version: 1,
    empreinte: "",
    libelle: "TVA réduite sur l'énergie",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "ramener la TVA sur les produits énergétiques à 5,5 %",
    fictive: false,
    historique: HISTORIQUE_MESURE,
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteMesure(socle) };
}

export function itemP(surcharges: Partial<Item> = {}): Item {
  const socle: Item = {
    id: "01JBANCESSA1000000001TEM01",
    version: 1,
    empreinte: "0".repeat(64),
    type: "P",
    candidat_id: "demo-alpha",
    mesure_id: "01JBANCESSA90000000MESVRE1",
    mesure_version: 1,
    statut_validation: "en_attente",
    statut_contestation: "aucune",
    valide_du: "2026-09-01",
    valide_au: null,
    assertion: {
      position: "pour",
      paraphrase: "Ramener la TVA sur les produits énergétiques de 20 % à 5,5 %.",
      citation_verbatim: "Nous ramènerons la TVA sur l'énergie à 5,5 %.",
      quantification: { dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }] },
      source: source(),
    },
    validations: [],
    contestations: [],
    historique: [
      {
        date: "2026-09-03T10:00:00+02:00",
        changement: "création",
        commit: "a".repeat(40),
        version_resultante: 1,
      },
    ],
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemA(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSA1000000001TEM02",
    type: "A",
    absence: {
      source_couverture_theme: source(),
      corpus_examine: [{ url: "https://demo.invalid/programme.pdf", sha256: "1".repeat(64), tier: "T1" }],
      date_examen: "2026-09-04T10:00:00+02:00",
      reverifications: [],
    },
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemO(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSA1000000001TEM03",
    type: "O",
    obsolescence: {
      date_changement: "2026-11-03",
      etat_anterieur: {
        position: "pour",
        paraphrase: "Abaisser l'âge légal de départ à 60 ans.",
        citation_verbatim: "Nous rétablirons la retraite à 60 ans.",
        source: source(),
      },
      etat_posterieur: {
        position: "conditionnel",
        paraphrase: "Abaisser l'âge légal à 62 ans, sauf carrières longues.",
        citation_verbatim: "Ce sera 62 ans, et 60 ans pour les carrières longues.",
        // Protocole 0.17 : une source T2 délimite l'extrait de l'enregistrement qu'elle cite.
        source: source({ tier: "T2", type_document: "enregistrement_video", extrait: { debut: "00:01:00", fin: "00:01:30" } }),
      },
      remplace_item_id: null,
    },
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

export function itemF(surcharges: Partial<Item> = {}): Item {
  const { assertion: _ignore, ...sansAssertion } = itemP();
  const socle: Item = {
    ...sansAssertion,
    id: "01JBANCESSA1000000001TEM04",
    type: "F",
    redige_par: "a1",
    mesure_id: "01JBANCESSA90000000MESVRE2",
    ...surcharges,
  };
  return { ...socle, empreinte: empreinteContenuNotant(socle) };
}

let compteur = 0;

export interface OptionsDecision {
  readonly annotateur_id: string;
  readonly item: Item;
  readonly decision: Decision;
  readonly lot_id?: string;
  readonly lot_nature?: NatureLot;
  readonly reponses_grille?: Grille;
  readonly reponses_par_etat?: EntreeDecision["reponses_par_etat"];
  readonly questions_specifiques?: QuestionsSpecifiques;
  readonly corrections?: readonly Correction[];
  readonly item_version?: number;
  readonly item_empreinte?: string;
  readonly commentaire?: string | null;
}

// Découpage en fonctions nommées plutôt qu'une cascade de `??` et de ternaires dans `decision()`
// (compétence `complexite-maitrisee`, « extraire des prédicats nommés » / « déplacer les cas dans
// les données ») : chaque valeur par défaut de fixture devient un appel, `decision()` reste plate.

function avecDefaut<T>(valeur: T | undefined, defaut: T): T {
  return valeur === undefined ? defaut : valeur;
}

function champsGrille(options: OptionsDecision): Partial<Pick<EntreeDecision, "reponses_grille">> {
  if (options.item.type === "O") return {};
  return { reponses_grille: avecDefaut(options.reponses_grille, GRILLE_TOUT_VRAI) };
}

function champsParEtat(options: OptionsDecision): Partial<Pick<EntreeDecision, "reponses_par_etat">> {
  if (options.item.type !== "O") return {};
  return {
    reponses_par_etat: avecDefaut(options.reponses_par_etat, {
      anterieur: GRILLE_TOUT_VRAI,
      posterieur: GRILLE_TOUT_VRAI,
    }),
  };
}

function champsQuestionsSpecifiques(
  options: OptionsDecision,
): Partial<Pick<EntreeDecision, "questions_specifiques">> {
  if (options.questions_specifiques === undefined) return {};
  return { questions_specifiques: options.questions_specifiques };
}

export function decision(options: OptionsDecision): EntreeDecision {
  compteur += 1;
  const socle = {
    id: `01JBANCESSA1DEC1S10N${String(compteur).padStart(6, "0")}`,
    journal_version: 1,
    type_entree: "decision" as const,
    annotateur_id: options.annotateur_id,
    lot_id: avecDefaut(options.lot_id, "lot-001"),
    lot_nature: avecDefaut(options.lot_nature, "reel"),
    item_id: options.item.id,
    item_version: avecDefaut(options.item_version, options.item.version),
    item_empreinte: avecDefaut(options.item_empreinte, options.item.empreinte),
    item_type: options.item.type,
    decision: options.decision,
    ...champsGrille(options),
    ...champsParEtat(options),
    ...champsQuestionsSpecifiques(options),
    corrections: avecDefaut(options.corrections, [] as readonly Correction[]),
    commentaire: avecDefaut(options.commentaire, null),
    horodatage: "2026-09-20T10:00:00+02:00",
    duree_affichage_ms: 40000,
    duree_active_ms: 38000,
    visite: 1,
  };
  return { ...socle, empreinte_ligne: empreinteDe(socle) };
}

export const OPTIONS_PROMOTION = {
  commit: "b".repeat(40),
  horodatage: "2026-09-21T09:00:00+02:00",
};
