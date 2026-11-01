/**
 * Ce qu'une réécriture d'un item publié a le droit de changer.
 *
 * Un item de `data/items/` est publié : ce qu'il affirme a pu être lu, cité, noté. Une commande qui
 * le réécrit (contestation, décision du panel) n'y **ajoute** que ce qui s'est passé depuis ; elle
 * n'efface ni ne récrit rien. La règle est pure, sans disque : `validation/io/data-items.ts`
 * l'applique avant toute réécriture, et c'est le seul module qui réécrit un item publié.
 *
 * - `id`, `validations[]` et `absence.confirmation_initiale` sont identiques : ils décrivent la
 *   promotion, qui a eu lieu une fois.
 * - `contestations[]`, `historique[]` et `absence.reverifications[]` gardent leur préfixe. Une
 *   `decision_panel` s'ajoute à une contestation qui n'en avait pas ; elle n'est jamais remplacée.
 * - Exactement une entrée d'historique est ajoutée, et sa `version_resultante` est celle de l'item.
 * - Le contenu notant ne change que par les chemins de la liste blanche des corrections
 *   (`cheminModifiable`), et seulement si la commande l'autorise (décision « correction » du
 *   panel). Tout autre champ reste identique, source comprise : une source ne se corrige pas.
 * - Une correction incrémente la version d'une unité ; l'empreinte est recalculée si, et seulement
 *   si, le contenu notant a changé (§4 : la paraphrase en est exclue).
 */

import { canoniser, empreinteApresModification } from "./empreinte.ts";
import { cheminModifiable } from "./promotion.ts";
import type { Item } from "./types.ts";

export interface AutorisationReecriture {
  /** Vrai seulement pour une décision « correction » du panel. */
  readonly corrections: boolean;
}

export class EcritureNonAjoutSeule extends Error {
  readonly item_id: string;
  readonly motifs: readonly string[];

  constructor(item_id: string, motifs: readonly string[]) {
    super(
      `Réécriture refusée de l'item publié ${item_id} : elle n'est pas un ajout.\n` +
        motifs.map((motif) => `  ${motif}`).join("\n"),
    );
    this.name = "EcritureNonAjoutSeule";
    this.item_id = item_id;
    this.motifs = motifs;
  }
}

/**
 * Chemins concrets que la liste blanche peut atteindre. Le filtre par `cheminModifiable` garde la
 * liste blanche seule juge : un chemin énuméré ici mais absent d'elle reste figé.
 */
const CHEMINS_CANDIDATS: readonly string[] = [
  "/valide_du",
  "/valide_au",
  "/obsolescence/date_changement",
  ...["/assertion", "/obsolescence/etat_anterieur", "/obsolescence/etat_posterieur"].flatMap((etat) =>
    ["position", "paraphrase", "citation_verbatim", "quantification"].map((champ) => `${etat}/${champ}`),
  ),
].filter(cheminModifiable);

/** Champs dont l'évolution est contrôlée à part, ou libre (les deux statuts). */
const CHAMPS_CONTROLES_A_PART = [
  "statut_validation",
  "statut_contestation",
  "version",
  "empreinte",
  "contestations",
  "historique",
] as const;

export function verifierAjoutSeul(avant: Item, apres: Item, autorisation: AutorisationReecriture): void {
  const motifs = [
    ...motifsIdentite(avant, apres),
    ...motifsContestations(avant, apres),
    ...motifsHistorique(avant, apres),
    ...motifsReverifications(avant, apres),
    ...motifsContenu(avant, apres, autorisation),
  ];
  if (motifs.length > 0) throw new EcritureNonAjoutSeule(avant.id, motifs);
}

function identiques(a: unknown, b: unknown): boolean {
  return canoniser(a) === canoniser(b);
}

function motifsIdentite(avant: Item, apres: Item): readonly string[] {
  const motifs: string[] = [];
  if (avant.id !== apres.id) motifs.push(`id changé : ${avant.id} → ${apres.id}`);
  if (!identiques(avant.validations, apres.validations)) motifs.push("validations[] modifiées");
  if (!identiques(avant.absence?.confirmation_initiale, apres.absence?.confirmation_initiale)) {
    motifs.push("absence.confirmation_initiale modifiée");
  }
  return motifs;
}

function prefixeGarde(avant: readonly unknown[], apres: readonly unknown[]): boolean {
  return apres.length >= avant.length && identiques(avant, apres.slice(0, avant.length));
}

/** Un tableau que `item.schema.json` exige : son absence est une erreur, jamais une liste vide. */
function requis(item: Item, cle: "contestations" | "historique"): readonly unknown[] {
  const valeur = item[cle];
  if (valeur === undefined) throw new Error(`Item ${item.id} sans ${cle}[] : non conforme à item.schema.json`);
  return valeur;
}

/** Hors item A, aucun bloc absence, donc aucune revérification à comparer. */
function motifsReverifications(avant: Item, apres: Item): readonly string[] {
  if (avant.absence === undefined && apres.absence === undefined) return [];
  if (avant.absence === undefined || apres.absence === undefined) return ["bloc absence ajouté ou retiré"];
  const garde = prefixeGarde(avant.absence.reverifications, apres.absence.reverifications);
  return garde ? [] : ["absence.reverifications[] : préfixe non conservé"];
}

/* ------------------------------------------------------------------ contestations */

function champDe(valeur: unknown, cle: string): unknown {
  if (typeof valeur !== "object" || valeur === null) return undefined;
  return (valeur as Record<string, unknown>)[cle];
}

function sansDecision(contestation: unknown): unknown {
  if (typeof contestation !== "object" || contestation === null) return contestation;
  const { decision_panel: _decision, ...reste } = contestation as Record<string, unknown>;
  return reste;
}

/** Une contestation conservée : même contenu, et une décision du panel ajoutée au plus, jamais changée. */
function motifContestation(avant: unknown, apres: unknown, rang: number): string | null {
  if (!identiques(sansDecision(avant), sansDecision(apres))) return `contestations[${rang}] réécrite`;
  const decisionAvant = champDe(avant, "decision_panel");
  if (decisionAvant === undefined) return null;
  if (identiques(decisionAvant, champDe(apres, "decision_panel"))) return null;
  return `contestations[${rang}].decision_panel remplacée ou retirée`;
}

function motifsContestations(avant: Item, apres: Item): readonly string[] {
  const anciennes = requis(avant, "contestations");
  const nouvelles = requis(apres, "contestations");
  if (nouvelles.length < anciennes.length) return ["contestations[] : une contestation a disparu"];
  return anciennes
    .map((contestation, rang) => motifContestation(contestation, nouvelles[rang], rang))
    .filter((motif): motif is string => motif !== null);
}

/* ------------------------------------------------------------------- historique */

function motifsHistorique(avant: Item, apres: Item): readonly string[] {
  const anciennes = requis(avant, "historique");
  const nouvelles = requis(apres, "historique");
  if (!prefixeGarde(anciennes, nouvelles)) return ["historique[] : préfixe non conservé"];
  if (nouvelles.length !== anciennes.length + 1) {
    return [`historique[] : ${nouvelles.length - anciennes.length} entrée(s) ajoutée(s), une seule attendue`];
  }
  const resultante = champDe(nouvelles[nouvelles.length - 1], "version_resultante");
  if (resultante !== apres.version) {
    return [`historique[] : version_resultante ${String(resultante)} ≠ version de l'item ${apres.version}`];
  }
  return [];
}

/* ---------------------------------------------------------------- contenu notant */

function lirePointeur(racine: unknown, chemin: string): unknown {
  return chemin
    .split("/")
    .slice(1)
    .reduce<unknown>((noeud, segment) => champDe(noeud, segment), racine);
}

function effacerPointeur(racine: unknown, chemin: string): void {
  const segments = chemin.split("/").slice(1);
  const parent = lirePointeur(racine, `/${segments.slice(0, -1).join("/")}`.replace(/\/$/, ""));
  if (typeof parent !== "object" || parent === null) return;
  delete (parent as Record<string, unknown>)[segments[segments.length - 1] as string];
}

/** L'item privé de ce qui peut évoluer : ce qui reste doit être identique, octet canonique pour octet. */
function partieFigee(item: Item, autorisation: AutorisationReecriture): unknown {
  const copie = structuredClone(item) as unknown as Record<string, unknown>;
  for (const champ of CHAMPS_CONTROLES_A_PART) delete copie[champ];
  effacerPointeur(copie, "/absence/reverifications");
  if (autorisation.corrections) for (const chemin of CHEMINS_CANDIDATS) effacerPointeur(copie, chemin);
  return copie;
}

function valeursCorrigeables(item: Item): readonly unknown[] {
  return CHEMINS_CANDIDATS.map((chemin) => lirePointeur(item, chemin));
}

function motifsContenu(avant: Item, apres: Item, autorisation: AutorisationReecriture): readonly string[] {
  if (!identiques(partieFigee(avant, autorisation), partieFigee(apres, autorisation))) {
    return [
      autorisation.corrections
        ? "contenu modifié hors de la liste blanche des corrections"
        : "contenu modifié alors que la commande n'autorise aucune correction",
    ];
  }
  return motifsVersion(avant, apres);
}

function motifsVersion(avant: Item, apres: Item): readonly string[] {
  const corrige = !identiques(valeursCorrigeables(avant), valeursCorrigeables(apres));
  const versionAttendue = corrige ? avant.version + 1 : avant.version;
  const empreinteAttendue = empreinteApresModification(avant, apres);
  const motifs: string[] = [];
  if (apres.version !== versionAttendue) motifs.push(`version ${apres.version}, ${versionAttendue} attendue`);
  if (apres.empreinte !== empreinteAttendue) motifs.push("empreinte non conforme au contenu notant");
  return motifs;
}
