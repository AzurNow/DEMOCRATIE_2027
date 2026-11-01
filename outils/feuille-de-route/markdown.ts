/**
 * Assemblage de `docs/FEUILLE-DE-ROUTE.md`.
 *
 * Une fonction par section, dans l'ordre du brief : entête, décisions en attente, décisions
 * tranchées, arbre Mermaid, tableau des lots, jalons, échelle de preuve, anomalies. Toute
 * itération dont l'ordre pourrait varier (lots, jalons, décisions) est triée explicitement, pour
 * une sortie déterministe octet pour octet.
 */

import { comparerChaines } from "../ordre-chaines.ts";
import type { EtatLot } from "./graphe.ts";
import { genererMermaid } from "./mermaid.ts";
import type { Decision, DecisionTranchee, FeuilleDeRoute, Jalon, Lot, Niveau } from "./types.ts";

const NIVEAUX: readonly Niveau[] = ["T0", "T1", "T2", "T3", "T4"];

function genererEntete(feuille: FeuilleDeRoute): string {
  return [
    "# Feuille de route — Banc d'essai 2027",
    "",
    "> Fichier généré par `pnpm feuille-de-route` depuis `docs/feuille-de-route.json`. " +
      `Ne pas éditer à la main. Mis à jour le ${feuille.date_maj}.`,
  ].join("\n");
}

function lotsPortantDecision(feuille: FeuilleDeRoute, decisionId: string): readonly string[] {
  return feuille.lots
    .filter((lot) => lot.decisions.includes(decisionId))
    .map((lot) => lot.id)
    .sort();
}

function genererBlocDecisionEnAttente(decision: Decision, feuille: FeuilleDeRoute): string {
  const options = decision.options.map((option, index) => `${index + 1}. ${option}`).join("\n");
  const lots = lotsPortantDecision(feuille, decision.id);
  const lignesLots = lots.length > 0 ? lots.join(", ") : "aucun";
  return [
    `### ${decision.id} — ${decision.question}`,
    "",
    decision.contexte,
    "",
    "Options :",
    "",
    options,
    "",
    `**Recommandation :** ${decision.recommandation}`,
    "",
    `Lots portant cette décision : ${lignesLots}`,
  ].join("\n");
}

function genererDecisionsEnAttente(feuille: FeuilleDeRoute): string {
  const decisions = feuille.decisions
    .filter((decision) => decision.statut === "en_attente")
    .sort((a, b) => comparerChaines(a.id, b.id));
  if (decisions.length === 0) {
    return ["## Décisions en attente", "", "Aucune décision en attente."].join("\n");
  }
  const blocs = decisions.map((decision) => genererBlocDecisionEnAttente(decision, feuille));
  return ["## Décisions en attente", "", blocs.join("\n\n")].join("\n");
}

function genererDecisionsTranchees(feuille: FeuilleDeRoute): string {
  const decisions = feuille.decisions
    .filter((decision): decision is DecisionTranchee => decision.statut === "tranchee")
    .sort((a, b) => comparerChaines(a.id, b.id));
  if (decisions.length === 0) {
    return ["## Décisions tranchées", "", "Aucune décision tranchée."].join("\n");
  }
  const blocs = decisions.map(
    (decision) =>
      `### ${decision.id} — ${decision.question}\n\n` +
      `**Décision du ${decision.date_decision} :** ${decision.retenu}`,
  );
  return ["## Décisions tranchées", "", blocs.join("\n\n")].join("\n");
}

function genererArbre(feuille: FeuilleDeRoute): string {
  const legende =
    "Légende : couleur par niveau de preuve — T0 gris, T1 ambre, T2 bleu, T3 vert, T4 bleu foncé ; " +
    "une décision en attente est un hexagone rouge. Arête pleine (`-->`) = dépendance bloquante ; " +
    "arête pointillée (`-.->`) = dépendance informative seulement.";
  const mermaid = genererMermaid({ jalons: feuille.jalons, lots: feuille.lots, decisions: feuille.decisions });
  return ["## Arbre", "", legende, "", "```mermaid", mermaid, "```"].join("\n");
}

function texteEtat(etat: EtatLot): string {
  if (etat.type === "atteint") return "atteint";
  if (etat.type === "debloque") return "débloqué";
  return `bloqué par ${etat.bloqueurs.join(", ")}`;
}

function texteDependances(lot: Lot): string {
  if (lot.depend_de.length === 0) return "—";
  const triees = [...lot.depend_de].sort((a, b) => comparerChaines(a.lot, b.lot));
  return triees.map((dependance) => (dependance.type === "bloque" ? dependance.lot : `${dependance.lot} (informe)`)).join(", ");
}

function dateDuJalon(jalons: readonly Jalon[], jalonId: string): string {
  const jalon = jalons.find((candidat) => candidat.id === jalonId);
  if (jalon === undefined) throw new Error(`Jalon inconnu lors du tri du tableau des lots : ${jalonId}`);
  return jalon.date;
}

function trierLotsPourTableau(feuille: FeuilleDeRoute): readonly Lot[] {
  return [...feuille.lots].sort((a, b) => {
    const comparaisonDate = comparerChaines(dateDuJalon(feuille.jalons, a.jalon), dateDuJalon(feuille.jalons, b.jalon));
    return comparaisonDate !== 0 ? comparaisonDate : comparerChaines(a.id, b.id);
  });
}

function etatDuLot(etats: ReadonlyMap<string, EtatLot>, lotId: string): EtatLot {
  const etat = etats.get(lotId);
  if (etat === undefined) throw new Error(`État manquant pour le lot ${lotId}`);
  return etat;
}

function genererLigneLot(lot: Lot, etats: ReadonlyMap<string, EtatLot>): string {
  const colonnes = [
    lot.id,
    lot.titre,
    lot.jalon,
    lot.niveau,
    texteEtat(etatDuLot(etats, lot.id)),
    lot.agent,
    lot.taille,
    String(lot.temps_auteur_h),
    texteDependances(lot),
  ];
  return `| ${colonnes.join(" | ")} |`;
}

function genererTableauLots(feuille: FeuilleDeRoute, etats: ReadonlyMap<string, EtatLot>): string {
  const lignes = [
    "| Lot | Titre | Jalon | Niveau | État | Agent | Taille | Temps auteur (h) | Dépend de |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...trierLotsPourTableau(feuille).map((lot) => genererLigneLot(lot, etats)),
  ];
  return lignes.join("\n");
}

function genererLots(feuille: FeuilleDeRoute, etats: ReadonlyMap<string, EtatLot>): string {
  return ["## Lots", "", genererTableauLots(feuille, etats)].join("\n");
}

function trierJalons(jalons: readonly Jalon[]): readonly Jalon[] {
  return [...jalons].sort((a, b) => comparerChaines(a.date, b.date) || comparerChaines(a.id, b.id));
}

function genererTableauJalons(feuille: FeuilleDeRoute): string {
  const lignes = [
    "| Jalon | Date | Titre | Critère |",
    "| --- | --- | --- | --- |",
    ...trierJalons(feuille.jalons).map((jalon) => `| ${jalon.id} | ${jalon.date} | ${jalon.titre} | ${jalon.critere} |`),
  ];
  return lignes.join("\n");
}

function genererBlocJalon(jalon: Jalon, feuille: FeuilleDeRoute): string {
  const lots = feuille.lots.filter((lot) => lot.jalon === jalon.id).sort((a, b) => comparerChaines(a.id, b.id));
  const puces = lots.map((lot) => `- ${lot.id} (${lot.niveau})`).join("\n");
  return [`### ${jalon.id}`, "", puces].join("\n");
}

function genererJalons(feuille: FeuilleDeRoute): string {
  const blocs = trierJalons(feuille.jalons).map((jalon) => genererBlocJalon(jalon, feuille));
  return ["## Jalons", "", genererTableauJalons(feuille), "", blocs.join("\n\n")].join("\n");
}

function genererEchelle(feuille: FeuilleDeRoute): string {
  const lignes = [
    "## Échelle de preuve",
    "",
    "| Niveau | Définition |",
    "| --- | --- |",
    ...NIVEAUX.map((niveau) => `| ${niveau} | ${feuille.echelle[niveau]} |`),
  ];
  return lignes.join("\n");
}

function genererAnomalies(feuille: FeuilleDeRoute): string {
  if (feuille.anomalies.length === 0) return ["## Anomalies relevées", "", "Aucune."].join("\n");
  return ["## Anomalies relevées", "", feuille.anomalies.map((anomalie) => `- ${anomalie}`).join("\n")].join("\n");
}

export function genererMarkdown(feuille: FeuilleDeRoute, etats: ReadonlyMap<string, EtatLot>): string {
  const sections = [
    genererEntete(feuille),
    genererDecisionsEnAttente(feuille),
    genererDecisionsTranchees(feuille),
    genererArbre(feuille),
    genererLots(feuille, etats),
    genererJalons(feuille),
    genererEchelle(feuille),
    genererAnomalies(feuille),
  ];
  return `${sections.join("\n\n")}\n`;
}
