/**
 * Table des routes de l'écran de notation humaine.
 *
 * Exportée, comme celle de l'interface de validation : le test d'aveuglement l'énumère, exécute
 * chaque gestionnaire sur un run où l'outil, les juges et un autre annotateur portent des valeurs
 * sentinelles, et vérifie qu'aucune n'apparaît dans une réponse. Le même test compare cette table à
 * celle que le serveur enregistre.
 *
 * **D18, aveugle total.** L'API ne sert que la `VueAnnotateur`, la liste des réponses à noter et des
 * totaux. Elle ne sert jamais : l'outil, une note de juge, une notation existante, un annotateur
 * autre que celui de la session, ni le **motif** de la tâche (un désaccord des juges ou un arbitrage
 * trahirait une note). Le motif reste dans le serveur, où il sert à construire la notation.
 */

import { CATEGORIES_RETENUES, DRAPEAUX, VERDICTS_SOUTIEN } from "../../analysis/types.ts";
import { construireNotationHumaine } from "../../pipeline/notation/notation-humaine.ts";
import { FichierDejaEcrit } from "../../pipeline/notation/stockage.ts";
import { MOTIFS_INEXACTITUDE } from "../../pipeline/notation/types.ts";
import { VERSION_GRILLE_HUMAINE } from "../../pipeline/notation/vue-annotateur.ts";
import type { Reponse } from "../../validation/serveur/http.ts";
import type { Contexte } from "./contexte.ts";
import { lireDemande } from "./saisie.ts";
import { etatDesTaches, type Notable } from "./taches.ts";

export interface Route {
  readonly nom: string;
  readonly methode: "GET" | "POST";
  readonly motif: RegExp;
  readonly gestionnaire: (contexte: Contexte, params: readonly string[], corps: unknown) => Reponse;
}

/** Les provenances d'un extrait, `notation.schema.json#/properties/extrait_justificatif`. */
const PROVENANCES = ["reponse", "reference"] as const;

function session(contexte: Contexte): Reponse {
  const { run } = contexte.donnees;
  return {
    statut: 200,
    corps: {
      annotateur_id: contexte.annotateur_id,
      run_id: run.id,
      date_gel: run.date_gel,
      version_grille: VERSION_GRILLE_HUMAINE,
      grille: {
        categories: CATEGORIES_RETENUES,
        drapeaux: DRAPEAUX,
        motifs_inexactitude: MOTIFS_INEXACTITUDE,
        verdicts_soutien: VERDICTS_SOUTIEN,
        provenances: PROVENANCES,
      },
    },
  };
}

function file(contexte: Contexte): Reponse {
  const etat = etatDesTaches(contexte);
  return {
    statut: 200,
    corps: {
      // Un identifiant par tâche, dans l'ordre de la file : le motif n'est pas servi.
      a_noter: etat.notables.map((n) => ({ reponse_id: n.tache.reponse_id })),
      en_attente_test_des_liens: etat.en_attente_test_des_liens,
      attend_juge: etat.attend_juge,
      sans_motif_admis: etat.sans_motif_admis,
    },
  };
}

/** La première tâche de l'annotateur sur cette réponse : à motifs multiples, l'ordre de la file. */
function notableDe(contexte: Contexte, reponse_id: string): Notable | undefined {
  return etatDesTaches(contexte).notables.find((n) => n.tache.reponse_id === reponse_id);
}

function indisponible(reponse_id: string): Reponse {
  return {
    statut: 409,
    corps: { erreur: "tache_indisponible", detail: `Aucune tâche de notation n'est ouverte pour vous sur la réponse ${reponse_id} : déjà notée par vous, hors de votre file, ou en attente du test des liens.` },
  };
}

function vue(contexte: Contexte, params: readonly string[]): Reponse {
  const [reponse_id] = params;
  if (reponse_id === undefined) return { statut: 400, corps: { erreur: "reponse_id manquant" } };
  const notable = notableDe(contexte, reponse_id);
  return notable === undefined ? indisponible(reponse_id) : { statut: 200, corps: notable.vue };
}

function enregistrer(contexte: Contexte, notable: Notable, reponse_id: string, saisie: Parameters<typeof construireNotationHumaine>[0]): Reponse {
  const prep = contexte.donnees.reponses.find((p) => p.reponse.id === reponse_id);
  if (prep === undefined) throw new Error(`Réponse ${reponse_id} inconnue du run chargé.`);
  const resultat = construireNotationHumaine(saisie, {
    notation_id: contexte.nouvelId(),
    run_id: contexte.donnees.run.id,
    objet_note: { type: "reponse", id: reponse_id },
    motif_notation: notable.tache.motif_notation,
    annotateur_id: contexte.annotateur_id,
    date: contexte.maintenant(),
    vue: notable.vue,
    items: prep.items,
    date_gel: contexte.donnees.run.date_gel,
    perimetre: contexte.donnees.perimetre,
    resolu_au_gel: prep.resolu_au_gel,
  });
  // Chaque motif de refus est rendu tel quel : l'annotateur corrige, rien n'est écrit.
  if (resultat.statut === "refusee") return { statut: 422, corps: { statut: "refusee", motifs: resultat.motifs } };
  try {
    contexte.depot.ecrireNotation(resultat.notation);
  } catch (erreur) {
    if (erreur instanceof FichierDejaEcrit) return { statut: 409, corps: { erreur: erreur.name, detail: erreur.message } };
    throw erreur;
  }
  return { statut: 201, corps: { ok: true, id: resultat.notation.id } };
}

function notation(contexte: Contexte, _params: readonly string[], corps: unknown): Reponse {
  const lecture = lireDemande(corps);
  if (!lecture.valide) return { statut: 400, corps: { erreur: "demande_invalide", detail: lecture.erreurs } };
  const { reponse_id, saisie } = lecture.demande;
  const notable = notableDe(contexte, reponse_id);
  return notable === undefined ? indisponible(reponse_id) : enregistrer(contexte, notable, reponse_id, saisie);
}

export const ROUTES: readonly Route[] = [
  { nom: "session", methode: "GET", motif: /^\/api\/session$/, gestionnaire: (c) => session(c) },
  { nom: "file", methode: "GET", motif: /^\/api\/file$/, gestionnaire: (c) => file(c) },
  { nom: "vue", methode: "GET", motif: /^\/api\/vue\/([^/]+)$/, gestionnaire: vue },
  { nom: "notation", methode: "POST", motif: /^\/api\/notations$/, gestionnaire: notation },
];

export function trouverRoute(methode: string, chemin: string): { readonly route: Route; readonly params: readonly string[] } | null {
  for (const route of ROUTES) {
    if (route.methode !== methode) continue;
    const trouve = route.motif.exec(chemin);
    if (trouve !== null) return { route, params: trouve.slice(1) };
  }
  return null;
}
