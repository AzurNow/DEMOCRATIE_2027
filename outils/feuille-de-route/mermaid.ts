/**
 * Rendu du graphe en Mermaid (`flowchart LR`), un `subgraph` par jalon.
 *
 * Aucune bibliothèque : Mermaid est du texte, GitHub le rend nativement. Tout est trié
 * explicitement (jalons par date, lots et décisions par id, dépendances par id de cible) pour
 * que la sortie soit un texte déterministe, octet pour octet, à entrée égale.
 */

import { comparerChaines } from "../ordre-chaines.ts";
import type { Decision, Jalon, Lot, TypeDependance } from "./types.ts";

export interface DonneesGraphe {
  readonly jalons: readonly Jalon[];
  readonly lots: readonly Lot[];
  readonly decisions: readonly Decision[];
}

const MOIS_ABREGES: readonly string[] = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export function identifiantLot(id: string): string {
  return `lot_${id.replaceAll("-", "_")}`;
}

export function identifiantDecision(id: string): string {
  return `dec_${id.replaceAll("-", "_")}`;
}

function identifiantJalon(id: string): string {
  return `jalon_${id.replaceAll("-", "_")}`;
}

/** Échappe le texte libre d'une étiquette de nœud : jamais de guillemet ni de chevron bruts. */
export function echapperTexte(texte: string): string {
  return texte.replaceAll('"', "#quot;").replaceAll("<", "#lt;").replaceAll(">", "#gt;");
}

function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

function formatDateFrancais(date: string): string {
  const [annee, mois, jour] = date.split("-");
  const moisAbrege = mois === undefined ? undefined : MOIS_ABREGES[Number(mois) - 1];
  if (annee === undefined || jour === undefined || moisAbrege === undefined) {
    throw new Error(`Date de jalon invalide, attendu AAAA-MM-JJ : ${date}`);
  }
  return `${Number(jour)} ${moisAbrege} ${annee}`;
}

export function noeudLot(lot: Lot): string {
  const etiquette = [lot.id, lot.titre, lot.niveau].map(echapperTexte).join("<br/>");
  return `${identifiantLot(lot.id)}["${etiquette}"]:::${lot.niveau}`;
}

export function noeudDecision(decision: Decision): string {
  const etiquette = [decision.id, tronquer(decision.question, 60)].map(echapperTexte).join("<br/>");
  return `${identifiantDecision(decision.id)}{{"${etiquette}"}}:::decision`;
}

export function areteDependance(source: string, cible: string, type: TypeDependance): string {
  const fleche: Record<TypeDependance, string> = { bloque: "-->", informe: "-.->" };
  return `${identifiantLot(source)} ${fleche[type]} ${identifiantLot(cible)}`;
}

function trierParDatePuisId(jalons: readonly Jalon[]): readonly Jalon[] {
  return [...jalons].sort((a, b) => comparerChaines(a.date, b.date) || comparerChaines(a.id, b.id));
}

function trierParId<T extends { readonly id: string }>(elements: readonly T[]): readonly T[] {
  return [...elements].sort((a, b) => comparerChaines(a.id, b.id));
}

function rendreSubgraph(jalon: Jalon, lots: readonly Lot[]): readonly string[] {
  const titre = echapperTexte(`${jalon.id} · ${formatDateFrancais(jalon.date)}`);
  const lignes = [`  subgraph ${identifiantJalon(jalon.id)}["${titre}"]`];
  for (const lot of trierParId(lots)) lignes.push(`    ${noeudLot(lot)}`);
  lignes.push("  end");
  return lignes;
}

function rendreSubgraphs(donnees: DonneesGraphe): readonly string[] {
  const lignes: string[] = [];
  for (const jalon of trierParDatePuisId(donnees.jalons)) {
    const lotsDuJalon = donnees.lots.filter((lot) => lot.jalon === jalon.id);
    lignes.push(...rendreSubgraph(jalon, lotsDuJalon));
  }
  return lignes;
}

function decisionsEnAttenteTriees(decisions: readonly Decision[]): readonly Decision[] {
  return trierParId(decisions.filter((decision) => decision.statut === "en_attente"));
}

function rendreDecisions(decisions: readonly Decision[]): readonly string[] {
  return decisionsEnAttenteTriees(decisions).map((decision) => `  ${noeudDecision(decision)}`);
}

function rendreAretesDependances(lots: readonly Lot[]): readonly string[] {
  const lignes: string[] = [];
  for (const lot of trierParId(lots)) {
    const dependances = [...lot.depend_de].sort((a, b) => comparerChaines(a.lot, b.lot));
    for (const dependance of dependances) {
      lignes.push(`  ${areteDependance(dependance.lot, lot.id, dependance.type)}`);
    }
  }
  return lignes;
}

function rendreAretesDecisions(donnees: DonneesGraphe): readonly string[] {
  const lignes: string[] = [];
  for (const decision of decisionsEnAttenteTriees(donnees.decisions)) {
    const lotsPortant = trierParId(donnees.lots.filter((lot) => lot.decisions.includes(decision.id)));
    for (const lot of lotsPortant) {
      lignes.push(`  ${identifiantDecision(decision.id)} --> ${identifiantLot(lot.id)}`);
    }
  }
  return lignes;
}

function rendreClassDefs(): readonly string[] {
  return [
    "  classDef T0 fill:#78716c,color:#ffffff,stroke:#44403c",
    "  classDef T1 fill:#b45309,color:#ffffff,stroke:#78350f",
    "  classDef T2 fill:#0369a1,color:#ffffff,stroke:#0c4a6e",
    "  classDef T3 fill:#15803d,color:#ffffff,stroke:#14532d",
    "  classDef T4 fill:#1d4ed8,color:#ffffff,stroke:#1e3a8a",
    "  classDef decision fill:#b91c1c,color:#ffffff,stroke:#7f1d1d",
  ];
}

export function genererMermaid(donnees: DonneesGraphe): string {
  const lignes = [
    "flowchart LR",
    ...rendreSubgraphs(donnees),
    ...rendreDecisions(donnees.decisions),
    ...rendreAretesDependances(donnees.lots),
    ...rendreAretesDecisions(donnees),
    ...rendreClassDefs(),
  ];
  return lignes.join("\n");
}
