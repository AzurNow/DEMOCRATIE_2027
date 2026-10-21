/**
 * Un run fictif pour l'écran de notation humaine : le run gelé de `tests/notation/run-fictif.ts`
 * (un candidat, deux questions tirées, items commités dans un dépôt Git jetable), puis quatre
 * réponses obtenues, une valeur sentinelle pour l'outil, et aucune notation. Chaque test pose les
 * notations qu'il veut. Jamais sous `runs/` du dépôt : tout vit sous `os.tmpdir()`.
 *
 * Les réponses sont rangées par identifiant croissant ; `dans` est celle que tire l'échantillon
 * humain (⌈4 × 0,1⌉ = 1 réponse), `hors` les trois autres.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dispositionRunNote, lireRunJson, runDeNotationDe } from "../../analysis/lecture-run.ts";
import { DepotReponses } from "../../pipeline/interrogation/stockage.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import type { ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import { creerContexte, type Contexte } from "../../notation-humaine/serveur/contexte.ts";
import { FOURNISSEUR_SANS_EXISTENCE, type FournisseurExistences } from "../../notation-humaine/serveur/fournisseur.ts";
import { ROUTES } from "../../notation-humaine/serveur/routes.ts";
import type { Reponse } from "../../validation/serveur/http.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ecrireJson, poserRunGele } from "../notation/run-fictif.ts";
import { notationHumaine, notationJuge } from "../notation/fabriques.ts";

export const SENTINELLES = {
  outil: "sentinelle-outil-zeta",
  alias: "S99",
  autre_humain: "sentinelle-autre-humain",
  extrait_juge: "SENTINELLE-EXTRAIT-DU-JUGE",
  /** D55 (1), §7 : une fonction de normalisation nommerait l'éditeur noté, jamais soumise. */
  normalisation: "normaliser_editeurx_sentinelle",
} as const;

/** Les deux juges du run (`schema/exemples/run/valide-01-mensuel-publie.json`). */
export const JUGES = ["juge-1", "juge-2"] as const;

export const LIEN = "https://exemple.invalid/source-1";

export interface Options {
  /** `pilote` : le run porte le jeu d'or. */
  readonly type_run?: "pilote";
  /** Réponses (par rang, en ordre d'identifiant) qui citent le lien `LIEN`. */
  readonly avec_lien?: readonly number[];
}

export interface Monde {
  readonly bac: string;
  readonly repertoire_run: string;
  readonly items: string;
  readonly run_id: string;
  /** Réponses obtenues, en ordre croissant d'identifiant. */
  readonly reponses: readonly ReponseObtenue[];
  /** La réponse que tire l'échantillon humain. */
  readonly dans: ReponseObtenue;
  /** Les trois autres, en ordre d'identifiant. */
  readonly hors: readonly ReponseObtenue[];
  /** Fichiers de `volume/notations/`. */
  notationsEcrites(): readonly string[];
  /** Écrit directement des notations (le test se tient lui-même hors de l'écran). */
  ecrire(...notations: readonly NotationIndividuelle[]): void;
  contexte(annotateur_id: string, existences?: FournisseurExistences): Contexte;
  nettoyer(): void;
}

const NOMBRE_DE_REPONSES = 4;

function exemple(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(RACINE_PROJET, "schema", "exemples", "reponse", "valide-01-api-obtenue.json"), "utf8")) as Record<string, unknown>;
}

function reponse(run_id: string, rang: number, question: { readonly id: string; readonly formulations: readonly { readonly id: string }[] }, lien: boolean): ReponseObtenue {
  const formulation = question.formulations[0];
  if (formulation === undefined) throw new Error(`Question ${question.id} sans formulation.`);
  const base = exemple() as Record<string, unknown> & { normalise: Record<string, unknown> };
  return valider<ReponseObtenue>(
    "reponse",
    {
      ...base,
      id: ulid(`ecran-reponse-${rang}`),
      run_id,
      outil_id: SENTINELLES.outil,
      alias_aveugle: SENTINELLES.alias,
      question_id: question.id,
      formulation_id: formulation.id,
      echantillon: rang + 1,
      normalisation: { fonction: SENTINELLES.normalisation, version: "1.0.0" },
      normalise: { ...base.normalise, liens: lien ? [LIEN] : [] },
    },
    `réponse fictive ${rang}`,
  );
}

export function monter(options: Options = {}): Monde {
  const gele = poserRunGele();
  const run_id = gele.run["id"] as string;
  if (options.type_run !== undefined) ecrireJson(dispositionRunNote(gele.repertoire_run).run_json, { ...gele.run, type_run: options.type_run });
  const depot = DepotReponses.ouvrir(dispositionRunNote(gele.repertoire_run).reponses);
  const brutes = Array.from({ length: NOMBRE_DE_REPONSES }, (_, rang) =>
    reponse(run_id, rang, gele.tirees[rang % gele.tirees.length] as (typeof gele.tirees)[number], (options.avec_lien ?? []).includes(rang)),
  );
  for (const r of brutes) depot.ecrire(r);
  const reponses = [...brutes].sort((a, b) => (a.id < b.id ? -1 : 1));
  const run = runDeNotationDe(lireRunJson(gele.repertoire_run));
  const [id_dans] = tirerEchantillonHumain(reponses.map((r) => r.id), run.graines.echantillon_humain, run.taux_echantillon_humain);
  const dans = reponses.find((r) => r.id === id_dans);
  if (dans === undefined) throw new Error("Aucune réponse dans l'échantillon humain.");
  const depotNotation = DepotNotation.ouvrir(gele.repertoire_run);
  return {
    bac: gele.bac,
    repertoire_run: gele.repertoire_run,
    items: gele.items,
    run_id,
    reponses,
    dans,
    hors: reponses.filter((r) => r.id !== dans.id),
    notationsEcrites: () => lireNoms(dispositionRunNote(gele.repertoire_run).notations),
    ecrire: (...notations) => notations.forEach((n) => depotNotation.ecrireNotation(n)),
    contexte: (annotateur_id, existences = FOURNISSEUR_SANS_EXISTENCE) => creerContexte({ repertoire_run: gele.repertoire_run, repertoire_items: gele.items, annotateur_id, existences }),
    nettoyer: gele.nettoyer,
  };
}

function lireNoms(dossier: string): readonly string[] {
  return readdirSync(dossier).sort();
}

/** Une notation de juge sur la réponse, d'accord (exacte) ou non, avec les références de la question. */
export function juge(monde: Monde, juge_id: (typeof JUGES)[number], r: ReponseObtenue, surcharges: Partial<NotationIndividuelle> = {}): NotationIndividuelle {
  return notationJuge(juge_id, { ...porteuse(monde, r), ...surcharges });
}

export function humain(monde: Monde, annotateur: string, motif: NotationIndividuelle["motif_notation"] & string, r: ReponseObtenue, surcharges: Partial<NotationIndividuelle> = {}): NotationIndividuelle {
  return notationHumaine(annotateur, motif, { ...porteuse(monde, r), ...surcharges });
}

function porteuse(monde: Monde, r: ReponseObtenue): Partial<NotationIndividuelle> {
  const { references_item, gabarit } = referencesDe(monde, r);
  return { run_id: monde.run_id, objet_note: { type: "reponse", id: r.id }, references_item, gabarit };
}

function referencesDe(monde: Monde, r: ReponseObtenue): { references_item: NotationIndividuelle["references_item"]; gabarit: NotationIndividuelle["gabarit"] } {
  const questions = JSON.parse(readFileSync(dispositionRunNote(monde.repertoire_run).questions, "utf8")) as {
    id: string;
    gabarit: NotationIndividuelle["gabarit"];
    items: { reference: NotationIndividuelle["references_item"][number] }[];
  }[];
  const question = questions.find((q) => q.id === r.question_id);
  if (question === undefined) throw new Error(`Question ${r.question_id} introuvable.`);
  return { references_item: question.items.map((i) => i.reference), gabarit: question.gabarit };
}

/** Un fournisseur qui connaît le verdict « existe » pour chaque lien demandé de ces réponses. */
export function fournisseurQuiConnait(reponse_ids: readonly string[]): FournisseurExistences {
  return {
    existencesDe: (reponse_id, liens) =>
      reponse_ids.includes(reponse_id) ? liens.map((url): ExistenceEtablie => ({ url_citee: url, verdict_existence: "existe", date_test: "2026-12-02T10:00:00+01:00" })) : [],
    // Aucune copie conservée (pas de sha256_contenu) : la page est « sans_copie », aucun texte n'est lu.
    texteDeCopie: () => undefined,
  };
}

export const SAISIE_EXACTE = { categorie: "exacte", drapeaux: [], cite: false, soutiens: [] } as const;

/** Exécute un gestionnaire de la table, comme le serveur le ferait. */
export function appeler(contexte: Contexte, nom: string, params: readonly string[] = [], corps: unknown = null): Reponse {
  const route = ROUTES.find((r) => r.nom === nom);
  if (route === undefined) throw new Error(`Route ${nom} inconnue.`);
  return route.gestionnaire(contexte, params, corps);
}
