/**
 * Table des routes.
 *
 * Elle est **exportée** et c'est délibéré : le test d'aveuglement l'énumère, exécute chaque
 * gestionnaire sur un jeu où l'autre annotateur a laissé des valeurs sentinelles, et vérifie
 * qu'aucune n'apparaît dans une réponse. Le même test compare cette table à celle que le
 * serveur enregistre réellement, de sorte qu'une route ajoutée plus tard sans y penser fasse
 * tomber la suite.
 *
 * Aucun gestionnaire ne lit d'identité d'annotateur dans une requête : elle vient du contexte,
 * qui la tient de l'environnement.
 */

import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { diagnostiquerLot } from "../domaine/analyse-lot.ts";
import {
  construireAnnulation,
  construireDecision,
  construireRetrait,
  type SoumissionDecision,
} from "../domaine/decision.ts";
import { validerCorrections } from "../domaine/corrections.ts";
import { RACCOURCIS, TOUCHES_DECISION, TOUCHE_CONFIRMATION, TOUCHES_REPONSE } from "../domaine/interaction.ts";
import { itemCourant, prochaineVisite, progression, rejouer, type EtatAnnotateur } from "../domaine/journal.ts";
import { ordreAffichage, tailleAttendue } from "../domaine/lot.ts";
import { refusSurLotTermine } from "../domaine/verrou-lot.ts";
import { ulid } from "../domaine/ulid.ts";
import type { Item, ItemDuLot, Lot } from "../domaine/types.ts";
import { servirArchive } from "../io/archives.ts";
import {
  lireTexteCanonique,
  lireTranscription,
  mesureDe,
  TexteCanoniqueAltere,
  type Staging,
} from "../io/staging.ts";
import { enumerationCommune } from "../io/referentiels.ts";
import { itemsEffectifs, statutContestationEffectif } from "../io/items-effectifs.ts";
import type { Contexte } from "./contexte.ts";
import { accesTexteCorrections, emplacement } from "./emplacements.ts";
import { GESTIONNAIRES_FORMULATIONS } from "./formulations.ts";
import { construireVueItem, construireVueLot, projeterLot } from "./vues.ts";

export interface Reponse {
  readonly statut: number;
  readonly corps?: unknown;
  readonly binaire?: Buffer;
  readonly type_mime?: string;
}

export interface Route {
  readonly nom: string;
  readonly methode: "GET" | "POST";
  readonly motif: RegExp;
  readonly gestionnaire: (contexte: Contexte, params: readonly string[], corps: unknown) => Reponse;
}

/* --------------------------------------------------------------- session */

function session(contexte: Contexte): Reponse {
  const lots = contexte.lots().filter((lot) => lot.annotateurs.includes(contexte.annotateur_id));
  const blocage = motifBlocage(contexte, lots);
  return {
    statut: 200,
    corps: {
      annotateur_id: contexte.annotateur_id,
      staging: contexte.configuration.racine_staging,
      // Lus dans schema/commun.schema.json : les dix thèmes du §3 n'ont pas de seconde copie.
      themes: enumerationCommune(contexte.configuration.racine_depot, "theme"),
      positions: enumerationCommune(contexte.configuration.racine_depot, "position"),
      lots: lots.map((lot) => ({
        ...projeterLot(lot),
        progression: progression(lot.items, rejouer(contexte.journal.lire(lot.lot_id))),
        accessible: lot.nature === "entrainement" || blocage === null,
        motif_inaccessible: lot.nature === "entrainement" ? null : blocage,
      })),
    },
  };
}

/**
 * §4 : les annotateurs sont formés sur 30 items d'entraînement communs **avant tout lot réel**.
 * L'interface ne sert donc aucun lot réel tant qu'un lot d'entraînement reste inachevé.
 */
function motifBlocage(contexte: Contexte, lots: readonly Lot[]): string | null {
  const entrainements = lots.filter((lot) => lot.nature === "entrainement");
  if (entrainements.length === 0) {
    return "Aucun lot d'entraînement n'est composé : le §4 en exige un avant tout lot réel.";
  }
  for (const lot of entrainements) {
    const contestes = contestesParmi(contexte, lot.items);
    const avancement = progression(lot.items, rejouer(contexte.journal.lire(lot.lot_id)), contestes);
    if (!avancement.termine) {
      return `Lot d'entraînement ${lot.lot_id} inachevé : ${avancement.restants} item(s) restant(s).`;
    }
  }
  return null;
}

/**
 * `item_id` de `items` dont le statut de contestation effectif (§4, 0.8) n'est pas « aucune ».
 * Un item sans correspondant dans `staging/` n'est jamais tenu pour contesté ici.
 */
function contestesParmi(contexte: Contexte, items: readonly ItemDuLot[]): ReadonlySet<string> {
  const staging = contexte.staging();
  const data = contexte.itemsData();
  const contestes = new Set<string>();
  for (const reference of items) {
    const item = staging.items.get(reference.item_id);
    if (item !== undefined && statutContestationEffectif(item, data) !== "aucune") {
      contestes.add(reference.item_id);
    }
  }
  return contestes;
}

/* ------------------------------------------------------------------- lot */

function vueLot(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const lot = contexte.lot(lot_id);
  if (lot === null) return { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } };

  const etat = rejouer(contexte.journal.lire(lot_id));
  const ordre = ordreAffichage(lot, contexte.annotateur_id);
  const contestes = contestesParmi(contexte, ordre);
  const blocage = lot.nature === "entrainement" ? null : motifBlocage(contexte, contexte.lots());

  return {
    statut: 200,
    corps: construireVueLot({
      lot,
      ordre,
      etat,
      item_courant: itemCourant(ordre, etat, contestes),
      contestes,
      accessible: blocage === null,
      motif_inaccessible: blocage,
    }),
  };
}

/**
 * Le kappa du lot, seule lecture croisée du projet. Rien n'est renvoyé tant que les deux
 * annotateurs n'ont pas fini : avant, le chiffre n'existe pas, et le seul fait de l'afficher
 * dirait où en est l'autre.
 */
function diagnostic(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const lot = contexte.lot(lot_id);
  if (lot === null) return { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } };

  // État effectif (§4, 0.8) : un item contesté après sa promotion l'est dans `data/`, pas dans `staging/`.
  const resultat = diagnostiquerLot({
    lot,
    items: itemsEffectifs(contexte.staging().items, contexte.itemsData()),
    etats: contexte.etatsDuLot(lot),
    taille_attendue: tailleAttendue(contexte.lots(), lot),
  });

  if (!resultat.les_deux_ont_fini) {
    return { statut: 200, corps: { lot_id, les_deux_ont_fini: false, kappa: null } };
  }
  return { statut: 200, corps: resultat };
}

/* ------------------------------------------------------------------ item */

function vueItem(contexte: Contexte, params: readonly string[]): Reponse {
  const lot_id = params[0] as string;
  const item_id = params[1] as string;
  const cadre = resoudre(contexte, lot_id, item_id);
  if ("erreur" in cadre) return cadre.erreur;

  const { item, staging, ordre } = cadre;
  const retrait = retirerSiConteste(contexte, item);
  if (retrait !== null) return retrait;

  const index = ordre.findIndex((entree) => entree.item_id === item_id);
  return {
    statut: 200,
    corps: {
      ...construireVueItem(item, mesureDe(staging, item), accesTextes(contexte), {
        index,
        total: ordre.length,
      }),
      lot_id,
      brouillon: brouillonDe(contexte, lot_id, item_id),
      annulable: annulable(contexte, lot_id),
    },
  };
}

function accesTextes(contexte: Contexte) {
  const racine = contexte.configuration.racine_staging;
  return {
    texte: (sha256: string | null) => (sha256 === null ? null : lireTexteCanonique(racine, sha256)),
    transcription: (sha256: string) => lireTranscription(racine, sha256),
  };
}

function brouillonDe(contexte: Contexte, lot_id: string, item_id: string) {
  const brouillon = contexte.brouillons.lire();
  if (brouillon === null) return null;
  if (brouillon.lot_id !== lot_id || brouillon.item_id !== item_id) return null;
  return brouillon;
}

function annulable(contexte: Contexte, lot_id: string): { id: string; item_id: string } | null {
  const etat = rejouer(contexte.journal.lire(lot_id));
  if (etat.annulable === null) return null;
  return { id: etat.annulable.id, item_id: etat.annulable.item_id };
}

/**
 * §4, droit de réponse, lecture seule : un item contesté sort du lot en cours dès l'affichage.
 * Garde-fou d'affichage : l'annotateur ne voit ni ne décide un item contesté. Un GET n'écrit
 * jamais rien au journal, que le lot soit ouvert ou figé (revue du 2026-10-12, constat 13) : le
 * retrait est seulement montré par ce 409, et journalisé à la première écriture qui suit
 * (décision ou annulation), sous le verrou d'un lot terminé (`ecrireRetraitsEnAttente`). Il ne
 * décide **pas** du dénominateur du kappa, que `diagnostiquerLot` lit sur le statut de l'item au
 * calcul.
 */
function retirerSiConteste(contexte: Contexte, item: Item): Reponse | null {
  const statut = statutContestationEffectif(item, contexte.itemsData());
  return statut === "aucune" ? null : reponseRetire(item.id);
}

function reponseRetire(item_id: string): Reponse {
  return {
    statut: 409,
    corps: {
      retire: true,
      item_id,
      motif:
        "Cet item a été contesté : il sort du lot en cours et n'est pas à valider. " +
        "Le panel statue sous 14 jours (annexe E).",
    },
  };
}

function ecrireRetrait(contexte: Contexte, lot: Lot, item_id: string, statut: string): void {
  contexte.journal.ajouter(
    lot.lot_id,
    construireRetrait({
      identifiant: ulid(),
      annotateur_id: contexte.annotateur_id,
      lot_id: lot.lot_id,
      lot_nature: lot.nature,
      item_id,
      motif: `item ${statut}`,
      horodatage: contexte.maintenant(),
    }),
  );
}

/**
 * Les contestations qu'un GET a montrées sans les journaliser (constat 13) s'écrivent ici, dans
 * l'ordre d'affichage, une seule fois chacune. Appelée seulement après le verrou
 * (`refuserSiLotTermine`) et juste avant l'écriture qu'elle précède : un refus plus tard dans la
 * route (corrections invalides, schéma non conforme) n'écrit donc aucun retrait.
 */
function ecrireRetraitsEnAttente(contexte: Contexte, lot: Lot, etat: EtatAnnotateur): void {
  const ordre = ordreAffichage(lot, contexte.annotateur_id);
  const staging = contexte.staging();
  const data = contexte.itemsData();
  for (const entree of ordre) {
    if (etat.retires.has(entree.item_id)) continue;
    const item = staging.items.get(entree.item_id);
    if (item === undefined) continue;
    const statut = statutContestationEffectif(item, data);
    if (statut !== "aucune") ecrireRetrait(contexte, lot, item.id, statut);
  }
}

/* -------------------------------------------------------------- décisions */

interface RequeteDecision extends SoumissionDecision {
  readonly lot_id: string;
}

function enregistrerDecision(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = corps as Partial<RequeteDecision>;
  const cadre = resoudre(contexte, requete.lot_id ?? "", requete.item_id ?? "");
  if ("erreur" in cadre) return cadre.erreur;

  const { lot, item } = cadre;
  const refus = refusAvantDecision(contexte, lot, item);
  if (refus !== null) return refus;

  const corrections = validerCorrections(
    requete.corrections ?? [],
    accesCorrections(contexte, item),
  );
  if (!corrections.ok) return { statut: 422, corps: { ok: false, refus: corrections.refus } };

  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  const construite = construireDecision(
    { ...(requete as RequeteDecision), corrections: corrections.corrections },
    {
      annotateur_id: contexte.annotateur_id,
      lot_id: lot.lot_id,
      lot_nature: lot.nature,
      item,
      visite: prochaineVisite(etat, item.id),
      horodatage: contexte.maintenant(),
      identifiant: ulid(),
    },
  );
  if (!construite.ok) return { statut: 422, corps: { ok: false, manquements: construite.manquements } };

  // L'entrée que le corps de la requête va devenir, confrontée à son schéma avant tout ajout
  // (revue du 2026-09-23, constat 2 : `decision: "approuver"` était écrit au journal, puis compté
  // « non évaluable » dans le kappa). Non conforme : HTTP 400, rien n'est écrit.
  const nonConforme = erreurDeSchema("decision", construite.entree, "requête POST /api/decisions");
  if (nonConforme !== null) return { statut: 400, corps: { ok: false, erreur: nonConforme.message } };

  ecrireRetraitsEnAttente(contexte, lot, etat);
  contexte.journal.ajouter(lot.lot_id, construite.entree);
  contexte.brouillons.effacer();
  return { statut: 201, corps: { ok: true, id: construite.entree.id } };
}

/**
 * Décision de l'auteur du 2026-10-02, conformité n° 16, texte au §4 en 0.15 : un lot terminé par
 * ses deux annotateurs est figé. Refus 409, rien n'est écrit au journal. Même garde pour la
 * décision et l'annulation, qui sont toutes deux des écritures.
 */
function refuserSiLotTermine(contexte: Contexte, lot: Lot): Reponse | null {
  const refus = refusSurLotTermine({
    lot,
    items: itemsEffectifs(contexte.staging().items, contexte.itemsData()),
    etats: contexte.etatsDuLot(lot),
  });
  return refus === null ? null : { statut: 409, corps: { ok: false, erreur: refus } };
}

/** Le verrou d'abord : un lot figé n'écrit rien, pas même le retrait d'un item contesté. */
function refusAvantDecision(contexte: Contexte, lot: Lot, item: Item): Reponse | null {
  const verrou = refuserSiLotTermine(contexte, lot);
  if (verrou !== null) return verrou;
  return retirerSiContesteEtEcrire(contexte, lot, item);
}

/**
 * Une décision qui vise elle-même un item contesté est refusée : 409, le retrait est journalisé
 * s'il ne l'est pas déjà, aucune décision n'est écrite. N'est appelée qu'après le verrou.
 */
function retirerSiContesteEtEcrire(contexte: Contexte, lot: Lot, item: Item): Reponse | null {
  const statut = statutContestationEffectif(item, contexte.itemsData());
  if (statut === "aucune") return null;
  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  if (!etat.retires.has(item.id)) ecrireRetrait(contexte, lot, item.id, statut);
  return reponseRetire(item.id);
}

function accesCorrections(contexte: Contexte, item: Item) {
  return accesTexteCorrections(item, accesTextes(contexte).texte);
}

/** Annuler, c'est écrire une entrée de plus. Rien n'est effacé, jamais. */
function annuler(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const requete = corps as { lot_id?: string; commentaire?: string | null };
  const lot = contexte.lot(requete.lot_id ?? "");
  if (lot === null) return { statut: 404, corps: { erreur: "Lot inconnu" } };

  const verrou = refuserSiLotTermine(contexte, lot);
  if (verrou !== null) return verrou;

  const etat = rejouer(contexte.journal.lire(lot.lot_id));
  if (etat.annulable === null) {
    return { statut: 409, corps: { erreur: "Aucune décision à annuler dans ce lot." } };
  }

  ecrireRetraitsEnAttente(contexte, lot, etat);

  const entree = construireAnnulation({
    identifiant: ulid(),
    annotateur_id: contexte.annotateur_id,
    lot_id: lot.lot_id,
    lot_nature: lot.nature,
    item_id: etat.annulable.item_id,
    annule: etat.annulable.id,
    horodatage: contexte.maintenant(),
    ...(requete.commentaire === undefined ? {} : { commentaire: requete.commentaire }),
  });
  contexte.journal.ajouter(lot.lot_id, entree);
  return { statut: 201, corps: { ok: true, id: entree.id, item_id: entree.item_id } };
}

/* -------------------------------------------------------------- brouillon */

function lireBrouillon(contexte: Contexte): Reponse {
  return { statut: 200, corps: contexte.brouillons.lire() };
}

function ecrireBrouillon(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  contexte.brouillons.ecrire(corps as never);
  return { statut: 204 };
}

/* ---------------------------------------------------------------- source */

function servirSource(contexte: Contexte, params: readonly string[]): Reponse {
  const cadre = resoudre(contexte, params[0] as string, params[1] as string);
  if ("erreur" in cadre) return cadre.erreur;

  const lieu = emplacement(cadre.item, params[2] as string);
  if (lieu === null) return { statut: 404, corps: { erreur: "Emplacement inconnu" } };
  if (lieu.source.chemin_local === undefined) {
    return { statut: 404, corps: { erreur: "Aucune copie locale pour cette source." } };
  }

  const servie = servirArchive({
    racine: contexte.configuration.racine_depot,
    chemin_local: lieu.source.chemin_local,
    sha256: lieu.source.sha256,
  });
  if (!servie.ok) {
    return {
      statut: 409,
      corps: {
        erreur: "Archive non conforme : rien n'est affiché.",
        motif: servie.motif,
        detail: servie.detail,
      },
    };
  }
  return { statut: 200, binaire: servie.contenu, type_mime: servie.type_mime };
}

/* ------------------------------------------------------- texte canonique */

/**
 * Enveloppe des routes qui lisent un texte canonique. Un texte altéré (empreinte divergente)
 * refuse la réponse entière, comme `servirSource` pour l'archive : rien n'est montré, rien n'est
 * enregistré. Toute autre erreur remonte telle quelle.
 */
function refuserTexteAltere(gestionnaire: Route["gestionnaire"]): Route["gestionnaire"] {
  return (contexte, params, corps) => {
    try {
      return gestionnaire(contexte, params, corps);
    } catch (erreur) {
      if (!(erreur instanceof TexteCanoniqueAltere)) throw erreur;
      return {
        statut: 409,
        corps: {
          erreur: "Texte canonique non conforme : rien n'est affiché ni enregistré.",
          motif: "empreinte_divergente",
          detail: `attendue ${erreur.attendue}, obtenue ${erreur.obtenue}`,
        },
      };
    }
  };
}

/* ----------------------------------------------------------- raccourcis */

function raccourcis(): Reponse {
  return {
    statut: 200,
    corps: {
      raccourcis: RACCOURCIS,
      touches_decision: TOUCHES_DECISION,
      touche_confirmation: TOUCHE_CONFIRMATION,
      touches_reponse: TOUCHES_REPONSE,
    },
  };
}

/* ------------------------------------------------------------- résolution */

interface Cadre {
  readonly lot: Lot;
  readonly item: Item;
  readonly staging: Staging;
  readonly ordre: readonly ItemDuLot[];
}

function resoudre(contexte: Contexte, lot_id: string, item_id: string): Cadre | { erreur: Reponse } {
  const lot = contexte.lot(lot_id);
  if (lot === null) return { erreur: { statut: 404, corps: { erreur: `Lot inconnu : ${lot_id}` } } };

  const ordre = ordreAffichage(lot, contexte.annotateur_id);
  if (!ordre.some((entree) => entree.item_id === item_id)) {
    return { erreur: { statut: 404, corps: { erreur: `Item hors du lot ${lot_id}` } } };
  }

  const staging = contexte.staging();
  const item = staging.items.get(item_id);
  if (item === undefined) {
    return { erreur: { statut: 404, corps: { erreur: `Item ${item_id} absent de staging` } } };
  }
  return { lot, item, staging, ordre };
}

/* --------------------------------------------------------------- la table */

export const ROUTES: readonly Route[] = [
  { nom: "session", methode: "GET", motif: /^\/api\/session$/, gestionnaire: session },
  { nom: "lot", methode: "GET", motif: /^\/api\/lots\/([^/]+)$/, gestionnaire: vueLot },
  {
    nom: "diagnostic",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/diagnostic$/,
    gestionnaire: diagnostic,
  },
  {
    nom: "item",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/items\/([^/]+)$/,
    gestionnaire: refuserTexteAltere(vueItem),
  },
  {
    nom: "decision",
    methode: "POST",
    motif: /^\/api\/decisions$/,
    gestionnaire: refuserTexteAltere(enregistrerDecision),
  },
  { nom: "annulation", methode: "POST", motif: /^\/api\/annulations$/, gestionnaire: annuler },
  { nom: "brouillon-lire", methode: "GET", motif: /^\/api\/brouillon$/, gestionnaire: lireBrouillon },
  { nom: "brouillon-ecrire", methode: "POST", motif: /^\/api\/brouillon$/, gestionnaire: ecrireBrouillon },
  { nom: "raccourcis", methode: "GET", motif: /^\/api\/raccourcis$/, gestionnaire: raccourcis },
  {
    nom: "source",
    methode: "GET",
    motif: /^\/api\/lots\/([^/]+)\/items\/([^/]+)\/source\/([^/]+)$/,
    gestionnaire: servirSource,
  },
  // Relecture des formulations (D39, D42) : voir `formulations.ts`.
  { nom: "formulations", methode: "GET", motif: /^\/api\/formulations$/, gestionnaire: GESTIONNAIRES_FORMULATIONS.liste },
  {
    nom: "formulation",
    methode: "GET",
    motif: /^\/api\/formulations\/(q_[0-9a-f]{32})$/,
    gestionnaire: GESTIONNAIRES_FORMULATIONS.detail,
  },
  {
    nom: "formulation-promotion",
    methode: "POST",
    motif: /^\/api\/formulations\/promotions$/,
    gestionnaire: GESTIONNAIRES_FORMULATIONS.promouvoir,
  },
  {
    nom: "formulation-refus",
    methode: "POST",
    motif: /^\/api\/formulations\/refus$/,
    gestionnaire: GESTIONNAIRES_FORMULATIONS.refuser,
  },
];

/** Pour le test d'aveuglement : la liste des noms, comparée à celle du serveur. */
export const NOMS_ROUTES: readonly string[] = ROUTES.map((route) => route.nom);

export function trouverRoute(methode: string, chemin: string): { route: Route; params: string[] } | null {
  for (const route of ROUTES) {
    if (route.methode !== methode) continue;
    const trouve = route.motif.exec(chemin);
    if (trouve !== null) return { route, params: trouve.slice(1) };
  }
  return null;
}
