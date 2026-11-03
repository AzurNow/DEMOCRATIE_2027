/**
 * Fabriques des tests d'analyse.
 *
 * Elles ne servent qu'à écrire des jeux de données minuscules dont le résultat se calcule sur
 * papier : chaque test pose ses effectifs, la fabrique remplit le reste avec des valeurs
 * neutres. Une valeur neutre de fabrique n'est jamais une valeur par défaut de production — le
 * code mesuré, lui, n'en a aucune.
 */

import { createHash } from "node:crypto";
import type { MotifSansQualificatif, Qualificatif } from "../../analysis/bootstrap.ts";
import type {
  CandidatAuGel,
  EntreeTirage,
  Intervalle95,
  Item,
  LectureComparateur,
  Notation,
  OutilAuGel,
  Question,
  Reponse,
  Run,
  Verdict,
} from "../../analysis/types.ts";
import type { UniteAnalyse } from "../../analysis/filtre.ts";
import type { PartageCouples, RequeteDuPlan } from "../../analysis/seuils.ts";
import type { CoupleOutilMode, Mode } from "../../analysis/types.ts";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Le motif d'une différence fabriquée à la main, dont le test pose lui-même le qualificatif : sans
 * qualificatif, `difference_indefinie` sans valeur, `sans_intervalle` sans borne, `grappe_unique` sur
 * une seule grappe, `taux_degenere` sinon (le cas [0 ; 0] ou [1 ; 1] du §8 que ces tests posent).
 */
export function motifFabrique(
  valeur: number | null,
  borne: Intervalle95 | null,
  qualificatif: Qualificatif | null,
): MotifSansQualificatif | null {
  if (qualificatif !== null) return null;
  if (valeur === null) return "difference_indefinie";
  if (borne === null) return "sans_intervalle";
  return borne.degenere === "grappe_unique" ? "grappe_unique" : "taux_degenere";
}

/**
 * Partiel où `undefined` signifie « champ absent », et non « champ à undefined » : les schémas
 * distinguent une réponse manquante (sans `normalise`) d'une réponse vide, et une Q-ATT (sans
 * `candidat_id`) d'une question dont le candidat serait inconnu.
 */
export type Partiel<T> = { [K in keyof T]?: T[K] | undefined };

function fusionner<T extends object>(base: T, partiel: Partiel<T>): T {
  const sortie = { ...base } as Record<string, unknown>;
  for (const [cle, valeur] of Object.entries(partiel)) {
    if (valeur === undefined) delete sortie[cle];
    else sortie[cle] = valeur;
  }
  return sortie as T;
}

/** ULID déterministe dérivé d'une clé lisible : les tests restent rejouables et diffusables. */
export function ulid(cle: string): string {
  const octets = createHash("sha256").update(cle, "utf8").digest();
  let sortie = "";
  for (let i = 0; i < 26; i += 1) {
    sortie += ALPHABET[(octets[i] as number) % ALPHABET.length];
  }
  return sortie;
}

/** Identifiant de question au format du schéma : `q_` suivi de 32 caractères hexadécimaux. */
export function idQuestion(cle: string): string {
  return `q_${createHash("sha256").update(cle, "utf8").digest("hex").slice(0, 32)}`;
}

export function empreinte(cle: string): string {
  return createHash("sha256").update(cle, "utf8").digest("hex");
}

const UNITE_NEUTRE: UniteAnalyse = {
  verdict_id: ulid("verdict-neutre"),
  reponse_id: ulid("reponse-neutre"),
  outil_id: "outil-alpha",
  mode: "web_desactivee",
  canal: "api",
  question_id: idQuestion("question-neutre"),
  grappe_id: ulid("grappe-neutre"),
  item_principal_id: ulid("grappe-neutre"),
  item_ids: [ulid("grappe-neutre")],
  type_item_principal: "P",
  gabarit: "Q-DIR",
  candidat_id: "candidat-a",
  theme: "retraites",
  registre: "neutre",
  echantillon: 1,
  premisse_fausse: null,
  categorie: "exacte",
  drapeaux: [],
  obsolescence_fraiche: null,
  sourcage: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
  dans_echantillon_humain: false,
  tronquee: false,
};

export function unite(partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse {
  return fusionner(UNITE_NEUTRE, partiel);
}

/** `n` unités identiques, pour poser un effectif sans répéter dix lignes. */
export function unites(n: number, partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse[] {
  return Array.from({ length: n }, (_, i) =>
    unite({ ...partiel, verdict_id: ulid(`verdict-${JSON.stringify(partiel)}-${i}`) }),
  );
}

/** Une grappe de `n` unités partageant le même item principal. */
export function grappe(cle: string, n: number, partiel: Partiel<UniteAnalyse> = {}): UniteAnalyse[] {
  return unites(n, { ...partiel, grappe_id: ulid(cle), item_principal_id: ulid(cle) });
}

export function verdict(partiel: Partiel<Verdict> = {}): Verdict {
  return fusionner<Verdict>({
    id: ulid("verdict"),
    run_id: ulid("run"),
    contexte: "run",
    objet_note: { type: "reponse", id: ulid("reponse") },
    categorie_retenue: "exacte",
    drapeaux_retenus: [],
    sourcage_retenu: { cite: false, au_moins_un_lien_existant: false, au_moins_un_lien_soutenant: false },
    dans_echantillon_humain: false,
    erreur_grave: false,
  }, partiel);
}

export function reponse(partiel: Partiel<Reponse> = {}): Reponse {
  return fusionner<Reponse>({
    id: ulid("reponse"),
    run_id: ulid("run"),
    contexte: "run",
    canal: "api",
    outil_id: "outil-alpha",
    mode: "web_desactivee",
    question_id: idQuestion("question"),
    formulation_id: ulid("formulation-neutre"),
    echantillon: 1,
    statut_reponse: "obtenue",
    normalise: { texte: "texte", liens: [], troncature: false },
  }, partiel);
}

/**
 * Le plan d'interrogation d'un run complet : une requête par réponse API de contexte run, à sa
 * clé (outil, mode, question, formulation, échantillon). Ce que `pipeline/interrogation/plan.ts`
 * aurait planifié si chaque requête avait reçu sa réponse ; une réponse sans mode n'y entre pas.
 */
export function planCouvrant(reponses: readonly Reponse[]): RequeteDuPlan[] {
  return reponses
    .filter((r) => r.contexte === "run" && r.canal === "api")
    .flatMap((r) =>
      r.mode === undefined
        ? []
        : [{ outil_id: r.outil_id, mode: r.mode, question_id: r.question_id, formulation_id: r.formulation_id, echantillon: r.echantillon }],
    );
}

/** `nombre` requêtes planifiées d'un couple, chacune sur sa propre question. */
export function requetesPlanifiees(outil_id: string, mode: Mode, nombre: number): RequeteDuPlan[] {
  return Array.from({ length: nombre }, (_, rang) => ({
    outil_id,
    mode,
    question_id: idQuestion(`plan-${outil_id}-${mode}-${rang}`),
    formulation_id: ulid("formulation-neutre"),
    echantillon: 1,
  }));
}

/** La réponse API de contexte run d'une requête du plan, au statut voulu. */
export function reponseDe(requete: RequeteDuPlan, statut_reponse: Reponse["statut_reponse"]): Reponse {
  const cle = `${requete.outil_id}-${requete.mode}-${requete.question_id}-${requete.formulation_id}-${requete.echantillon}`;
  return reponse({
    id: ulid(`reponse-du-plan-${cle}`),
    outil_id: requete.outil_id,
    mode: requete.mode,
    question_id: requete.question_id,
    formulation_id: requete.formulation_id,
    echantillon: requete.echantillon,
    statut_reponse,
    normalise: statut_reponse === "manquante" ? undefined : { texte: "texte", liens: [], troncature: false },
  });
}

export function question(partiel: Partiel<Question> = {}): Question {
  return fusionner<Question>({
    id: idQuestion("question"),
    gabarit: "Q-DIR",
    candidat_id: "candidat-a",
    items: [
      {
        reference: { item_id: ulid("item"), item_version: 1, item_empreinte: empreinte("item") },
        role: "principal",
      },
    ],
    grappe_id: ulid("item"),
    formulations: [
      { id: ulid("formulation-neutre"), registre: "neutre", empreinte_texte: empreinte("neutre") },
      { id: ulid("formulation-familiere"), registre: "familier", empreinte_texte: empreinte("familier") },
      {
        id: ulid("formulation-orientee"),
        registre: "oriente",
        empreinte_texte: empreinte("oriente"),
        // Protocole 0.11 (n° 37) : la prémisse se résout au gel, dans le tirage, plus sur la question.
      },
    ],
  }, partiel);
}

export function item(partiel: Partiel<Item> = {}): Item {
  return fusionner<Item>({ id: ulid("item"), version: 1, type: "P", candidat_id: "candidat-a" }, partiel);
}

export function entreeTirage(partiel: Partiel<EntreeTirage> = {}): EntreeTirage {
  return fusionner<EntreeTirage>({
    question_id: idQuestion("question"),
    candidat_id: "candidat-a",
    theme: "retraites",
    gabarit: "Q-DIR",
    premisse_fausse: false,
  }, partiel);
}

/** Identifiants triés de `n` items P, au format du run (`items_p_au_gel`). */
export function itemsPAuGel(prefixe: string, n: number): readonly string[] {
  return Array.from({ length: n }, (_, rang) => ulid(`${prefixe}-${rang}`)).sort();
}

export function candidat(partiel: Partiel<CandidatAuGel> = {}): CandidatAuGel {
  return fusionner<CandidatAuGel>({
    candidat_id: "candidat-a",
    statut_au_gel: "actif",
    items_p_verifies: 20,
    items_p_au_gel: itemsPAuGel("item-p-candidat-a", 20),
    sous_seuil: false,
    interroge: true,
  }, partiel);
}

export function outil(partiel: Partiel<OutilAuGel> = {}): OutilAuGel {
  return fusionner<OutilAuGel>({
    outil_id: "outil-alpha",
    famille: "assistant",
    inclus: true,
    mode_de_tete: "web_desactivee",
  }, partiel);
}

export function run(partiel: Partiel<Run> = {}): Run {
  return fusionner<Run>({
    id: ulid("run"),
    date_gel: "2026-12-01T06:00:00+01:00",
    perimetre: { candidats: [candidat()], outils: [outil()] },
  }, partiel);
}

/**
 * Run dont l'unique candidat interrogé porte `items` comme items P de référence, et dont les
 * comparateurs inclus sont `comparateurs` (plus l'assistant neutre de la fabrique).
 */
export function runDeComparateurs(items: readonly string[], comparateurs: readonly string[] = ["comparateur-un"]): Run {
  const tries = [...items].sort();
  return run({
    perimetre: {
      candidats: [candidat({ items_p_verifies: tries.length, items_p_au_gel: tries, sous_seuil: tries.length < 10 })],
      outils: [outil(), ...comparateurs.map((outil_id) => outil({ outil_id, famille: "comparateur", mode_de_tete: undefined }))],
    },
  });
}

export function lectureComparateur(partiel: Partiel<LectureComparateur> = {}): LectureComparateur {
  return fusionner<LectureComparateur>({
    id: ulid("lecture"),
    run_id: ulid("run"),
    contexte: "run",
    outil_id: "comparateur-un",
    reference_item: { item_id: ulid("item"), item_version: 1, item_empreinte: empreinte("item") },
    affiche: true,
  }, partiel);
}

/** Notation humaine de l'échantillon de 10 %, exacte, sans lien : chaque test pose ce qui compte. */
export function notation(partiel: Partiel<Notation> = {}): Notation {
  return fusionner<Notation>({
    id: ulid("notation"),
    run_id: ulid("run"),
    contexte: "run",
    objet_note: { type: "reponse", id: ulid("reponse") },
    notateur: { type: "humain", id: "a1" },
    categorie: "exacte",
    drapeaux: [],
    sourcage: { cite: false, liens: [] },
    motif_notation: "echantillon_aleatoire_10",
  }, partiel);
}

/**
 * Partage où chaque couple outil × mode du canal API présent dans les unités est comparable : pour
 * les tests dont le seuil de 20 % du §8 n'est pas le sujet. Une unité API sans mode n'y entre pas,
 * pour que le code mesuré, et non la fabrique, la refuse.
 */
export function tousCompares(...jeux: readonly (readonly UniteAnalyse[])[]): PartageCouples {
  const vus = new Map<string, CoupleOutilMode>();
  for (const unite of jeux.flat()) {
    if (unite.canal !== "api" || unite.mode === null) continue;
    vus.set(`${unite.outil_id}/${unite.mode}`, { outil_id: unite.outil_id, mode: unite.mode });
  }
  return { compares: [...vus.values()], incomplets: [] };
}
