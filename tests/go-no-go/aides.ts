/**
 * Aides des tests du go/no-go (§12, D24) : échantillons humains synthétiques, réponses API, et le
 * run simulé de `pnpm notation:dry`, noté puis complété par une double notation humaine de son
 * échantillon. Jamais sous `runs/` du dépôt : `mkdtemp` sous `os.tmpdir()`.
 */

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lireDossier, lireReponses, lireRunJson } from "../../analysis/lecture-run.ts";
import type { CategorieRetenue, Mode, Reponse } from "../../analysis/types.ts";
import { tirerEchantillonHumain } from "../../pipeline/notation/echantillons.ts";
import { lancerNotationSimulee } from "../../pipeline/notation/notation-simulee.ts";
import { DepotNotation } from "../../pipeline/notation/stockage.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import { idQuestion, ulid } from "../analysis/fabriques.ts";
import { inexacte, notationHumaine, notationJuge } from "../notation/fabriques.ts";
import { options, parametresDeReference } from "../notation/simulation.ts";
import { VERSION_CHARGE_JUGE } from "../../pipeline/notation/charge-juge.ts";

type Categorie3 = Extract<CategorieRetenue, "exacte" | "inexacte" | "non_reponse">;

function surchargesDe(categorie: CategorieRetenue): Partial<NotationIndividuelle> {
  return categorie === "inexacte" ? inexacte() : { categorie };
}

/** Une réponse de l'échantillon : la catégorie de chaque juge, des deux humains, et de l'arbitre éventuel. */
export interface LigneEchantillon {
  readonly juges: Readonly<Record<string, Categorie3>>;
  readonly humains: readonly [CategorieRetenue, CategorieRetenue];
  readonly arbitre?: CategorieRetenue;
}

export interface EchantillonSynthetique {
  readonly echantillon: readonly string[];
  readonly notations: readonly NotationIndividuelle[];
}

export function echantillonSynthetique(lignes: readonly LigneEchantillon[]): EchantillonSynthetique {
  const echantillon = lignes.map((_, rang) => ulid(`reponse-echantillon-${rang}`));
  const notations = lignes.flatMap((ligne, rang) => {
    const objet = { objet_note: { type: "reponse" as const, id: echantillon[rang] as string } };
    const [h1, h2] = ligne.humains;
    return [
      ...Object.entries(ligne.juges).map(([juge, categorie]) => notationJuge(juge, { ...objet, ...surchargesDe(categorie) })),
      notationHumaine("annotateur-1", "echantillon_aleatoire_10", { ...objet, ...surchargesDe(h1) }),
      notationHumaine("annotateur-2", "echantillon_aleatoire_10", { ...objet, ...surchargesDe(h2) }),
      ...(ligne.arbitre === undefined ? [] : [notationHumaine("annotateur-3", "arbitrage_echantillon_10", { ...objet, ...surchargesDe(ligne.arbitre) })]),
    ];
  });
  return { echantillon, notations };
}

/** `nombre` lignes identiques. */
export function fois(nombre: number, ligne: LigneEchantillon): readonly LigneEchantillon[] {
  return Array.from({ length: nombre }, () => ligne);
}

let rangReponse = 0;

/**
 * Une réponse API minimale de contexte run, ce que lit `analysis/seuils.ts`. Chacune sur sa propre
 * question : deux réponses ne répondent jamais à la même requête du plan (protocole 0.21).
 */
export function reponseApi(outil_id: string, mode: Mode, statut_reponse: Reponse["statut_reponse"]): Reponse {
  rangReponse += 1;
  return {
    id: ulid(`reponse-api-${rangReponse}`),
    run_id: ulid("run-go-no-go"),
    contexte: "run",
    canal: "api",
    outil_id,
    mode,
    question_id: idQuestion(`reponse-api-${rangReponse}`),
    formulation_id: ulid("formulation"),
    echantillon: 1,
    statut_reponse,
  };
}

export function reponsesApi(outil_id: string, mode: Mode, manquantes: number, total: number): readonly Reponse[] {
  return Array.from({ length: total }, (_, i) => reponseApi(outil_id, mode, i < manquantes ? "manquante" : "obtenue"));
}

/* ------------------------------------------------------------------ run simulé noté */

const repertoires: string[] = [];

export function nettoyerRepertoires(): void {
  for (const chemin of repertoires.splice(0)) rmSync(chemin, { recursive: true, force: true });
}

function temporaire(prefixe: string): string {
  const chemin = mkdtempSync(join(tmpdir(), prefixe));
  repertoires.push(chemin);
  return chemin;
}

/** Une notation humaine d'échantillon qui recopie la note du premier juge : les deux humains s'accordent. */
function humaineDepuis(juge: NotationIndividuelle, annotateur: string): NotationIndividuelle {
  return {
    ...juge,
    id: ulid(`go-no-go-${annotateur}-${juge.objet_note.id}`),
    notateur: { type: "humain", id: annotateur, sensibilite_declaree_famille: "famille-1", a_vu_identite_outil: false },
    motif_notation: "echantillon_aleatoire_10",
    date: "2026-12-05T09:30:00+01:00",
  };
}

/** Pose la double notation humaine (concordante) de chaque réponse de l'échantillon du run. */
function noterEchantillon(repertoire_run: string): void {
  const run = lireRunJson(repertoire_run);
  const obtenues = lireReponses(repertoire_run, run.id).filter((r) => r.contexte === "run" && r.statut_reponse === "obtenue").map((r) => r.id);
  const echantillon = tirerEchantillonHumain(obtenues, run.graines.echantillon_humain, run.taux_echantillon_humain);
  const notations = lireDossier<NotationIndividuelle>(join(repertoire_run, "volume", "notations"), "notation", run.id);
  const depot = DepotNotation.ouvrir(repertoire_run);
  for (const id of echantillon) {
    const juge = notations.find((n) => n.contexte === "run" && n.objet_note.id === id && n.notateur.type === "juge");
    const regle = notations.find((n) => n.contexte === "run" && n.objet_note.id === id && n.notateur.type === "regle");
    const modele = juge ?? (regle === undefined ? undefined : nonReponseHumaineSurRefus(regle));
    if (modele === undefined) throw new Error(`réponse ${id} de l'échantillon sans notation de juge ni de règle dans le run simulé.`);
    depot.ecrireNotation(humaineDepuis(modele, "annotateur-1"));
    depot.ecrireNotation(humaineDepuis(modele, "annotateur-2"));
  }
}

/**
 * D32 et D33 : un refus de l'API de l'échantillon n'a pas de notation de juge à recopier. Les humains
 * le notent non-réponse, sans extrait : leur notation porte sur_refus_api, comme la règle.
 */
function nonReponseHumaineSurRefus(regle: NotationIndividuelle): NotationIndividuelle {
  return { ...regle, version_charge: VERSION_CHARGE_JUGE };
}

let reference: Promise<string> | undefined;
let racineReference: string | undefined;

/** À appeler dans `afterAll` : retire aussi le run de référence, partagé par les tests d'un fichier. */
export function nettoyerReference(): void {
  nettoyerRepertoires();
  if (racineReference !== undefined) rmSync(racineReference, { recursive: true, force: true });
  racineReference = undefined;
  reference = undefined;
}

async function runDeReference(): Promise<string> {
  const racine = mkdtempSync(join(tmpdir(), "banc-go-no-go-reference-"));
  racineReference = racine;
  const resultat = await lancerNotationSimulee(options(racine), parametresDeReference());
  noterEchantillon(resultat.repertoire_run);
  return resultat.repertoire_run;
}

/** Une copie neuve du run simulé noté (échantillon doublement noté), sous un répertoire temporaire. */
export async function runSimuleNote(): Promise<string> {
  reference ??= runDeReference();
  const source = await reference;
  const copie = join(temporaire("banc-go-no-go-"), "2026-11-27");
  cpSync(source, copie, { recursive: true });
  return copie;
}

export function lireObjet(chemin: string): Record<string, unknown> {
  const valeur: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) throw new Error(`${chemin} : objet JSON attendu.`);
  return { ...valeur };
}

export function ecrireObjet(chemin: string, valeur: unknown): void {
  writeFileSync(chemin, `${JSON.stringify(valeur, null, 2)}\n`);
}
