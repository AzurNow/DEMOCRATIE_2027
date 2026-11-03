/**
 * Délibération du panel sans majorité (§10 et annexe E, protocole 0.29, D71 (8)) : « À égalité des
 * voix, rien ne change : l'item reste contesté et hors du tirage, et les opinions de chaque membre
 * sont publiées à côté de l'item, en ajout seul, avec la contestation qu'elles tranchent. »
 *
 * La délibération s'ajoute à `deliberations_sans_majorite[]` de la contestation qu'elle tranche,
 * sans décision : statut de contestation, statut de validation, version, empreinte et contenu
 * restent ceux de l'item. Elle est refusée si une décision réunit la majorité des votants (le panel
 * tranche alors par `--decision`), si la contestation porte déjà une décision, si la version jugée
 * est périmée, s'il y a moins de deux votants, un membre en double, un déporté qui vote, un vote
 * hors des quatre décisions de l'annexe E ou une motivation vide. L'ajout seul des délibérations
 * déjà écrites est contrôlé à la réécriture (`verifierAjoutSeul`).
 */

import {
  ContestationDejaDecidee,
  ContestationInexistante,
  contestationsDe,
  DECISIONS_PANEL,
  entreeHistorique,
  VersionJugeePerimee,
  type ContestationPubliee,
  type DeliberationPubliee,
  type ResultatPanel,
  type TraceEcriture,
} from "./contestation-item.ts";
import type { Item } from "./types.ts";

export type OpinionDeMembre = DeliberationPubliee["opinions"][number];

export interface DeliberationSansMajorite {
  readonly contestation_id: string;
  readonly version_jugee: number;
  readonly date: string;
  /** Une opinion par membre votant : les déportés n'en ont pas. */
  readonly opinions: readonly OpinionDeMembre[];
  readonly deportes: readonly string[];
}

export class DeliberationRefusee extends Error {
  constructor(item_id: string, motifs: readonly string[]) {
    super(`Item ${item_id} : délibération sans majorité refusée :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "DeliberationRefusee";
  }
}

function enDouble(valeurs: readonly string[]): readonly string[] {
  return [...new Set(valeurs.filter((valeur, rang) => valeurs.indexOf(valeur) !== rang))];
}

function motifsVotants(deliberation: DeliberationSansMajorite): readonly string[] {
  const membres = deliberation.opinions.map((opinion) => opinion.membre);
  const deportesVotants = deliberation.deportes.filter((deporte) => membres.includes(deporte));
  return [
    ...(membres.length < 2 ? [`${membres.length} votant(s) : il faut au moins deux votants pour une égalité`] : []),
    ...enDouble(membres).map((membre) => `membre en double parmi les votants : ${membre}`),
    ...enDouble(deliberation.deportes).map((membre) => `membre en double parmi les déportés : ${membre}`),
    ...deportesVotants.map((membre) => `${membre} est déporté et ne vote pas`),
  ];
}

function motifsOpinion(opinion: OpinionDeMembre): readonly string[] {
  return [
    ...(opinion.membre.trim().length === 0 ? ["opinion sans nom de membre"] : []),
    ...((DECISIONS_PANEL as readonly string[]).includes(opinion.vote) ? [] : [`vote de ${opinion.membre} hors énumération : ${opinion.vote}`]),
    ...(opinion.motivation.trim().length === 0 ? [`motivation vide pour ${opinion.membre}`] : []),
  ];
}

/** Une décision qui réunit plus de la moitié des votants est une majorité : rien à publier ici. */
function motifsMajorite(opinions: readonly OpinionDeMembre[]): readonly string[] {
  return DECISIONS_PANEL.filter((decision) => 2 * opinions.filter((opinion) => opinion.vote === decision).length > opinions.length).map(
    (decision) => `« ${decision} » réunit la majorité des ${opinions.length} votants : c'est une décision, à enregistrer par --decision`,
  );
}

function motifs(deliberation: DeliberationSansMajorite): readonly string[] {
  return [...motifsVotants(deliberation), ...deliberation.opinions.flatMap(motifsOpinion), ...motifsMajorite(deliberation.opinions)];
}

function publier(deliberation: DeliberationSansMajorite): DeliberationPubliee {
  return {
    date: deliberation.date,
    version_jugee: deliberation.version_jugee,
    opinions: deliberation.opinions.map(({ membre, vote, motivation }) => ({ membre, vote, motivation })),
    deportes: deliberation.deportes,
  };
}

/**
 * `item.schema.json` interdit un tableau vide (`minItems: 1`) : son absence est la seule forme
 * d'une contestation sans délibération sans majorité, et la première délibération le crée.
 */
function dejaPubliees(contestation: ContestationPubliee): readonly DeliberationPubliee[] {
  const publiees = contestation.deliberations_sans_majorite;
  return publiees === undefined ? [] : publiees;
}

export function enregistrerDeliberationSansMajorite(
  item: Item,
  deliberation: DeliberationSansMajorite,
  trace: TraceEcriture,
): ResultatPanel {
  const cible = contestationsDe(item).find((contestation) => contestation.id === deliberation.contestation_id);
  if (cible === undefined) throw new ContestationInexistante(item.id, deliberation.contestation_id);
  if (cible.decision_panel !== undefined) throw new ContestationDejaDecidee(item.id, cible.id);
  if (deliberation.version_jugee !== item.version) throw new VersionJugeePerimee(item.id, deliberation.version_jugee, item.version);
  const refus = motifs(deliberation);
  if (refus.length > 0) throw new DeliberationRefusee(item.id, refus);

  const contestations = contestationsDe(item).map((contestation) =>
    contestation.id === cible.id
      ? { ...contestation, deliberations_sans_majorite: [...dejaPubliees(contestation), publier(deliberation)] }
      : contestation,
  );
  return {
    item: {
      ...item,
      contestations,
      historique: entreeHistorique(
        item,
        item.version,
        trace,
        "délibération du panel sans majorité",
        `contestation ${cible.id}, ${deliberation.opinions.length} votant(s), ${deliberation.deportes.length} déporté(s)`,
      ),
    },
    autorisation: { corrections: false },
  };
}
