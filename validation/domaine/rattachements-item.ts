/**
 * Rattachement d'un item de staging à une autre mesure : la logique, sans le disque (décision
 * D53 (1) du 2026-10-16).
 *
 * L'extraction crée une mesure de staging par item, avec le libellé du modèle. Pour que plusieurs
 * items partagent un même référent, l'auteur rattache un item à une mesure existante :
 * `pnpm mesures --rattacher=<item> --a=<mesure> --ecrire` réécrit l'item en `staging/` et trace la
 * décision dans un registre publié en ajout seul, `validation/mesures/rattachements.json`.
 *
 * **L'item que voient les annotateurs est celui qui sera promu.** La mesure et sa version font
 * partie du contenu notant (§4, protocole 0.13) : le rattachement est une réécriture de l'item,
 * sur le modèle exact de `renvoi-mesure.ts:repinglerSurMesure` (version + 1, empreinte recalculée,
 * entrée d'historique avec le HEAD), jamais une substitution au moment de `pnpm promote`.
 *
 * **Item déjà annoté ⇒ renvoi en attente**, par le même mécanisme que le renvoi : l'entrée
 * d'historique `CHANGEMENT_RATTACHEMENT` fait que le lot qui épinglait l'ancienne version ne juge
 * plus l'item (`lotJugeEncore`), et ses décisions restent au journal. Mêmes refus que le renvoi,
 * sans exception : item publié, item dont le lot n'a pas fini, item non en attente.
 *
 * **Type de l'item et caractère fictif de la cible** (protocole 0.17, §4) : « Un item F ne se
 * rattache qu'à une mesure fictive, un item d'un autre type qu'à une mesure qui ne l'est pas. »
 *
 * La commande ne rédige ni ne modifie le contenu d'une mesure : elle change l'identifiant de
 * rattachement d'un item, rien d'autre.
 */

import { empreinteContenuNotant } from "./empreinte.ts";
import { CHANGEMENT_RATTACHEMENT, jugementComplet, type JugementEnCours } from "./renvoi-mesure.ts";
import type { Item, Mesure } from "./types.ts";
import { MOTIF_ULID } from "./ulid.ts";
import {
  DATE_CIVILE,
  objetOuLeve as objetOuLeveCommun,
  refuserChampsEnTrop as refuserChampsEnTropCommun,
} from "./validateurs-champ.ts";

export interface RattachementItem {
  readonly item_id: string;
  /** Version de l'item avant le rattachement. */
  readonly item_version: number;
  readonly mesure_avant: string;
  readonly mesure_apres: string;
  /** Version courante de la mesure cible, sur laquelle l'item est épinglé. */
  readonly mesure_version_apres: number;
  /** Date civile du rattachement, `AAAA-MM-JJ`. */
  readonly date: string;
}

export type RegistreRattachementsItem = readonly RattachementItem[];

/* ------------------------------------------------------------------- refus */

/**
 * - `deja_rattache` : la cible est déjà la mesure de l'item ; rien à faire (une relance tombe ici) ;
 * - `type_incompatible` : un item F vers une mesure non fictive, ou un item P, A ou O vers une
 *   mesure fictive (§4, protocole 0.17) ;
 * - `publie` : l'item est dans `data/items` ; il ne change que par contestation et panel ;
 * - `pas_en_attente` : seul un item en attente se rattache, comme seul il se renvoie ;
 * - `decisions_incompletes` : son lot ne l'a pas jugé jusqu'au bout ; à relancer à la fin du lot.
 */
export type MotifRefusRattachement =
  | "deja_rattache"
  | "type_incompatible"
  | "publie"
  | "pas_en_attente"
  | "decisions_incompletes";

export class RattachementRefuse extends Error {
  readonly motif: MotifRefusRattachement;
  readonly item_id: string;

  constructor(item: Item, motif: MotifRefusRattachement, detail: string) {
    super(`Rattachement de l'item ${item.id} refusé (${motif}) : ${detail} Rien n'est écrit.`);
    this.name = "RattachementRefuse";
    this.motif = motif;
    this.item_id = item.id;
  }
}

export interface ContexteRattachement {
  readonly item: Item;
  /** La mesure cible, dans sa version courante en `staging/mesures/`. */
  readonly cible: Mesure;
  /** Vrai si l'item est déjà dans `data/items`. */
  readonly publie: boolean;
  /** Le lot qui juge encore l'item et ses décisions actives ; `undefined` : l'item n'est dans aucun lot. */
  readonly jugement: JugementEnCours | undefined;
}

interface Controle {
  readonly motif: MotifRefusRattachement;
  readonly refuse: (contexte: ContexteRattachement) => boolean;
  readonly detail: (contexte: ContexteRattachement) => string;
}

/** Les refus, dans l'ordre où ils sont rendus. Des données : aucune branche par cas. */
const CONTROLES: readonly Controle[] = [
  {
    motif: "deja_rattache",
    refuse: ({ item, cible }) => item.mesure_id === cible.id,
    detail: ({ cible }) => `il cite déjà la mesure ${cible.id} ; rien à faire.`,
  },
  {
    motif: "type_incompatible",
    refuse: ({ item, cible }) => (item.type === "F") !== cible.fictive,
    detail: ({ item, cible }) =>
      `c'est un item de type ${item.type} et la mesure ${cible.id} est ${cible.fictive ? "fictive" : "non fictive"}. ` +
      "§4 (protocole 0.17) : un item F ne se rattache qu'à une mesure fictive, un item d'un autre type " +
      "qu'à une mesure qui ne l'est pas.",
  },
  {
    motif: "publie",
    refuse: ({ publie }) => publie,
    detail: () =>
      "il est déjà publié dans data/. Un item publié ne change que par pnpm contester puis pnpm panel " +
      "(décision de l'auteur du 2026-09-28), jamais par ce chemin.",
  },
  {
    motif: "pas_en_attente",
    refuse: ({ item }) => item.statut_validation !== "en_attente",
    detail: ({ item }) => `seul un item en attente se rattache (statut ${item.statut_validation}).`,
  },
  {
    motif: "decisions_incompletes",
    refuse: ({ jugement }) => jugement !== undefined && !jugementComplet(jugement),
    detail: ({ jugement }) =>
      `son lot ${String(jugement?.lot_id)} ne l'a pas encore jugé jusqu'au bout ; ` +
      "le rattacher changerait un lot en cours. Relancer une fois le lot terminé.",
  },
];

/** Lève `RattachementRefuse` au premier contrôle qui refuse ; sinon, l'item est rattachable. */
export function verifierRattachable(contexte: ContexteRattachement): void {
  const refus = CONTROLES.find((controle) => controle.refuse(contexte));
  if (refus !== undefined) throw new RattachementRefuse(contexte.item, refus.motif, refus.detail(contexte));
}

/* ------------------------------------------------------------- réécriture */

export interface TraceRattachement {
  /** HEAD au moment du rattachement : l'arbre est propre, il décrit l'état d'où part l'écriture. */
  readonly commit: string;
  readonly horodatage: string;
  /** Date civile inscrite au registre. */
  readonly date: string;
}

/** L'entrée du registre qui trace le rattachement de `item` (dans sa version d'avant) à `cible`. */
export function entreeRattachement(item: Item, cible: Mesure, date: string): RattachementItem {
  return {
    item_id: item.id,
    item_version: item.version,
    mesure_avant: item.mesure_id,
    mesure_apres: cible.id,
    mesure_version_apres: cible.version,
    date,
  };
}

/**
 * La nouvelle version de l'item : rattaché à `cible` dans sa version courante, version de l'item
 * incrémentée, empreinte recalculée, historique augmenté. Rien d'autre ne change : l'item reste en
 * attente. Les contrôles qui ne dépendent que de l'item et de la cible sont refaits ici.
 */
export function rattacherItem(item: Item, cible: Mesure, trace: TraceRattachement): Item {
  verifierRattachable({ item, cible, publie: false, jugement: undefined });
  if (item.historique === undefined) throw new Error(`Item ${item.id} sans historique : le rattachement ne s'y inscrirait pas.`);
  const version = item.version + 1;
  const rattache: Item = { ...item, mesure_id: cible.id, mesure_version: cible.version, version };
  return {
    ...rattache,
    empreinte: empreinteContenuNotant(rattache),
    historique: [
      ...item.historique,
      {
        date: trace.horodatage,
        changement: `${CHANGEMENT_RATTACHEMENT} : mesure ${cible.id} en version ${cible.version}`,
        motif:
          `rattachement inscrit au registre des rattachements le ${trace.date} : l'item citait la mesure ` +
          `${item.mesure_id} en version ${item.mesure_version} (décision D53 (1))`,
        commit: trace.commit,
        version_resultante: version,
      },
    ],
  };
}

/* ---------------------------------------------------------- frontière typée */

const CHAMPS: ReadonlySet<string> = new Set([
  "item_id",
  "item_version",
  "mesure_avant",
  "mesure_apres",
  "mesure_version_apres",
  "date",
]);
const ULID = MOTIF_ULID;

export class EntreeRattachementInvalide extends Error {
  constructor(detail: string, provenance: string) {
    super(`Entrée du registre des rattachements invalide (${provenance}) : ${detail}`);
    this.name = "EntreeRattachementInvalide";
  }
}

/**
 * Frontière d'exécution d'une entrée, en lecture comme en écriture. Même verdict que
 * `schema/rattachement-item.schema.json` sur chaque cas (test d'accord) : une entrée malformée
 * arrête, elle n'est jamais complétée ni ignorée.
 */
export function validerEntreeRattachement(valeur: unknown, provenance: string): RattachementItem {
  const brute = objetOuLeve(valeur, provenance);
  refuserChampsEnTrop(brute, provenance);
  return {
    item_id: motifObligatoire(brute, "item_id", ULID, provenance),
    item_version: versionObligatoire(brute, "item_version", provenance),
    mesure_avant: motifObligatoire(brute, "mesure_avant", ULID, provenance),
    mesure_apres: motifObligatoire(brute, "mesure_apres", ULID, provenance),
    mesure_version_apres: versionObligatoire(brute, "mesure_version_apres", provenance),
    date: motifObligatoire(brute, "date", DATE_CIVILE, provenance),
  };
}

function objetOuLeve(valeur: unknown, provenance: string): Record<string, unknown> {
  return objetOuLeveCommun(valeur, provenance, (detail, p) => {
    throw new EntreeRattachementInvalide(detail, p);
  });
}

function refuserChampsEnTrop(brute: Record<string, unknown>, provenance: string): void {
  refuserChampsEnTropCommun(brute, CHAMPS, provenance, (detail, p) => {
    throw new EntreeRattachementInvalide(detail, p);
  });
}

function motifObligatoire(brute: Record<string, unknown>, cle: string, motif: RegExp, provenance: string): string {
  const valeur = brute[cle];
  if (typeof valeur !== "string" || !motif.test(valeur)) {
    throw new EntreeRattachementInvalide(`champ « ${cle} » absent ou mal formé (attendu ${motif.source}).`, provenance);
  }
  return valeur;
}

function versionObligatoire(brute: Record<string, unknown>, cle: string, provenance: string): number {
  const valeur = brute[cle];
  if (typeof valeur !== "number" || !Number.isInteger(valeur) || valeur < 1) {
    throw new EntreeRattachementInvalide(`champ « ${cle} » absent ou non entier ≥ 1.`, provenance);
  }
  return valeur;
}
