/**
 * Les autres items validés sur un texte extrait faux (§4 « Contrat des artefacts », protocole 0.25,
 * D60 (9b), seconde moitié de D59 (9)) : la logique, sans le disque.
 *
 * « Les autres items validés sur ce même texte ne sont pas déplacés, mais leur validation ne tient
 * plus : un item non publié retourne en attente et est validé à nouveau, ses décisions antérieures
 * restant au journal, un item d'un lot en cours attendant la fin de son lot ; un item publié ne
 * change que par la contestation et le panel, et l'auteur le conteste dès que le rejet est
 * enregistré, comme après une correction de thème. »
 *
 * **Ce qui déclenche.** Les sources renvoyées par `renvoi-reextraction.ts` : depuis le protocole
 * 0.27, toute source de contenu d'un item rejeté dont une décision de rejet qui le fonde porte le
 * motif (un seul des deux « rejeter », l'arbitre, les deux sources d'un item O).
 *
 * **« Même texte ».** Un item reste attaché au texte sur lequel il a été validé (§4, Extraction
 * double) : il est concerné quand l'une de ses sources de contenu (`ecoute-t2.ts:sourcesDuContenu`)
 * porte exactement le couple (empreinte du document, empreinte du texte) de la source renvoyée. Un
 * renvoi sans empreinte de texte ne rapproche aucun item : il est rapporté à part (`sans_texte`),
 * jamais apparié par le seul document. Les items rejetés qui fondent un renvoi ne sont pas « les
 * autres items » : ils ne sont pas touchés.
 *
 * **Retour en attente** : le mécanisme de la correction de thème et du rattachement
 * (`renvoi-mesure.ts`). Version + 1 et entrée d'historique `CHANGEMENT_TEXTE_ERRONE` ; le lot qui
 * épinglait l'ancienne version ne juge plus l'item (`lotJugeEncore`), ses décisions restent au
 * journal, intactes, et son kappa ne bouge pas. Le contenu notant ne change pas : ni le texte, ni les
 * offsets, ni l'empreinte. Mêmes sorts que le renvoi après correction de thème :
 *
 * - `renvoyer` : jugé jusqu'au bout par son lot ;
 * - `decisions_incompletes` : son lot ne l'a pas encore jugé jusqu'au bout ; il attend la fin du lot ;
 * - publié (dans `data/items`) : rien n'est écrit, il est listé à contester par l'auteur.
 *
 * Un item qu'aucun lot ne juge n'a pas de validation qui tomberait : il n'est pas touché. Un item
 * déjà retourné en attente pour ce texte (son historique le dit) ne l'est pas une seconde fois
 * quand un nouveau lot l'a jugé : la relance est sans effet.
 */

import { sourcesDuContenu } from "./ecoute-t2.ts";
import { CHANGEMENT_TEXTE_ERRONE, jugementComplet, type JugementEnCours } from "./renvoi-mesure.ts";
import type { SourceRenvoyee } from "./renvoi-reextraction.ts";
import type { EntreeDecision, Item } from "./types.ts";
import { comparerChaines } from "../../outils/ordre-chaines.ts";

export { CHANGEMENT_TEXTE_ERRONE } from "./renvoi-mesure.ts";

/** Une source renvoyée dont le texte est identifié : seule elle rapproche des items. */
export type RenvoiIdentifie = SourceRenvoyee & { readonly texte_sha256: string };

export interface ContexteTexteErrone {
  /** Sources renvoyées (`renvoisAReextraction(...).sources`). */
  readonly renvois: readonly SourceRenvoyee[];
  /** Items de `staging/`. */
  readonly items: readonly Item[];
  /** Items publiés dans `data/items`, par identifiant ; leur état publié fait foi. */
  readonly publies: ReadonlyMap<string, Item>;
  /** Par item, le lot qui le juge encore et ses décisions actives ; absent : l'item n'est dans aucun lot. */
  readonly jugements: ReadonlyMap<string, JugementEnCours>;
}

export type SortRetour = "renvoyer" | "decisions_incompletes";

export interface RetourEnAttente {
  readonly item: Item;
  readonly sort: SortRetour;
  readonly lot_id: string;
  /** Les textes faux que porte l'item, pas encore inscrits à son historique. */
  readonly textes: readonly RenvoiIdentifie[];
}

export interface PublieAContester {
  /** L'item dans son état publié, que rien ici ne modifie. */
  readonly item: Item;
  readonly textes: readonly RenvoiIdentifie[];
}

export interface PlanTexteErrone {
  readonly retours: readonly RetourEnAttente[];
  readonly a_contester: readonly PublieAContester[];
  /** Renvois sans empreinte de texte : aucun item n'est rapproché d'eux. */
  readonly sans_texte: readonly SourceRenvoyee[];
}

/* ------------------------------------------------------------ appariement */

function estIdentifie(renvoi: SourceRenvoyee): renvoi is RenvoiIdentifie {
  return renvoi.texte_sha256 !== undefined;
}

function cleTexte(renvoi: RenvoiIdentifie): string {
  return `document ${renvoi.sha256} texte ${renvoi.texte_sha256}`;
}

function porteLeTexte(item: Item, renvoi: RenvoiIdentifie): boolean {
  return sourcesDuContenu(item).some(
    (source) => source.sha256 === renvoi.sha256 && source.texte_sha256 === renvoi.texte_sha256,
  );
}

function dejaRetournePour(item: Item, renvoi: RenvoiIdentifie): boolean {
  if (item.historique === undefined) return false;
  const attendu = `${CHANGEMENT_TEXTE_ERRONE} :`;
  return item.historique.some((entree) => {
    const { changement } = entree as { changement?: unknown };
    return typeof changement === "string" && changement.startsWith(attendu) && changement.includes(cleTexte(renvoi));
  });
}

function textesPortes(item: Item, renvois: readonly RenvoiIdentifie[]): readonly RenvoiIdentifie[] {
  return renvois.filter((renvoi) => porteLeTexte(item, renvoi));
}

/**
 * Vrai si l'une des sources de contenu de l'item porte le texte d'une source renvoyée identifiée.
 * Sert à ne lire les jugements que des items concernés (`jugementsDesVerdicts`).
 */
export function porteUnTexteRenvoye(item: Item, renvois: readonly SourceRenvoyee[]): boolean {
  return textesPortes(item, renvois.filter(estIdentifie)).length > 0;
}

/* ------------------------------------------------------------ planification */

function retourDe(item: Item, contexte: ContexteTexteErrone, renvois: readonly RenvoiIdentifie[]): RetourEnAttente | null {
  const textes = textesPortes(item, renvois).filter((renvoi) => !dejaRetournePour(item, renvoi));
  const jugement = contexte.jugements.get(item.id);
  if (textes.length === 0 || jugement === undefined) return null;
  const sort: SortRetour = jugementComplet(jugement) ? "renvoyer" : "decisions_incompletes";
  return { item, sort, lot_id: jugement.lot_id, textes };
}

function aContesterDe(item: Item, renvois: readonly RenvoiIdentifie[]): PublieAContester | null {
  const textes = textesPortes(item, renvois);
  return textes.length === 0 ? null : { item, textes };
}

function nonNul<T>(valeur: T | null): valeur is T {
  return valeur !== null;
}

function parIdentifiant(a: { readonly item: Item }, b: { readonly item: Item }): number {
  return comparerChaines(a.item.id, b.item.id);
}

/**
 * Ce que le rejet sous le motif « texte extrait erroné » fait aux autres items du même texte. Rien
 * n'est écrit : `pnpm promote --ecrire` réécrit en `staging/` les items `renvoyer`.
 */
export function planifierTexteErrone(contexte: ContexteTexteErrone): PlanTexteErrone {
  const renvois = contexte.renvois.filter(estIdentifie);
  const rejetes = new Set(contexte.renvois.flatMap((renvoi) => renvoi.items));
  const autres = (item: Item): boolean => !rejetes.has(item.id);

  const retours = contexte.items
    .filter((item) => autres(item) && !contexte.publies.has(item.id))
    .map((item) => retourDe(item, contexte, renvois))
    .filter(nonNul);
  const a_contester = [...contexte.publies.values()]
    .filter(autres)
    .map((item) => aContesterDe(item, renvois))
    .filter(nonNul);

  return {
    retours: retours.sort(parIdentifiant),
    a_contester: a_contester.sort(parIdentifiant),
    sans_texte: contexte.renvois.filter((renvoi) => !estIdentifie(renvoi)),
  };
}

/* ---------------------------------------------------------------- jugements */

/** Ce que la promotion sait d'un item jugé ; `outils/evaluation-lots.ts:Verdict` le satisfait. */
export interface VerdictJuge {
  readonly item: Pick<Item, "id">;
  readonly lot_id: string;
  readonly dossier: { readonly decisions: readonly EntreeDecision[] };
}

/**
 * Par item, le lot qui le juge encore et ses décisions actives, lus dans les verdicts de la
 * promotion (un verdict n'existe que pour un lot qui juge encore l'item). `annotateurs` : par lot
 * effectif, ses annotateurs. Un item jugé par deux lots arrête tout plutôt que d'en choisir un :
 * l'appelant ne passe que les verdicts des items concernés (`porteUnTexteRenvoye`), pour que cet
 * arrêt ne frappe qu'un item dont le sort en dépend.
 */
export function jugementsDesVerdicts(
  verdicts: readonly VerdictJuge[],
  annotateurs: ReadonlyMap<string, readonly string[]>,
): ReadonlyMap<string, JugementEnCours> {
  const jugements = new Map<string, JugementEnCours>();
  for (const verdict of verdicts) {
    const deja = jugements.get(verdict.item.id);
    if (deja !== undefined) {
      throw new Error(`Item ${verdict.item.id} jugé à la fois par ${deja.lot_id} et ${verdict.lot_id} : lots incohérents.`);
    }
    jugements.set(verdict.item.id, {
      lot_id: verdict.lot_id,
      annotateurs: annotateursDu(annotateurs, verdict.lot_id),
      decisions: verdict.dossier.decisions,
    });
  }
  return jugements;
}

function annotateursDu(annotateurs: ReadonlyMap<string, readonly string[]>, lot_id: string): readonly string[] {
  const liste = annotateurs.get(lot_id);
  if (liste === undefined) throw new Error(`Lot ${lot_id} sans annotateurs connus : verdict d'un lot absent des lots effectifs.`);
  return liste;
}

/* ------------------------------------------------------------------ retour */

export interface TraceRetour {
  /** HEAD au moment du retour : l'arbre est propre, il décrit l'état d'où part l'écriture. */
  readonly commit: string;
  readonly horodatage: string;
}

/**
 * La nouvelle version de l'item, de retour en attente : version incrémentée, historique augmenté.
 * Rien d'autre ne change, empreinte comprise : l'item n'est pas déplacé (§4, protocole 0.25).
 */
export function renvoyerEnAttente(item: Item, textes: readonly SourceRenvoyee[], trace: TraceRetour): Item {
  if (item.statut_validation !== "en_attente") {
    throw new Error(`Item ${item.id} : seul un item en attente retourne en attente (statut ${item.statut_validation}).`);
  }
  if (item.historique === undefined) throw new Error(`Item ${item.id} sans historique : le retour ne s'y inscrirait pas.`);
  const identifies = textes.filter(estIdentifie);
  if (identifies.length === 0 || identifies.length !== textes.length) {
    throw new Error(`Item ${item.id} : aucun texte identifié en cause (empreinte du texte absente), rien à inscrire.`);
  }
  const version = item.version + 1;
  const rejetes = [...new Set(identifies.flatMap((renvoi) => renvoi.items))].sort(comparerChaines);
  return {
    ...item,
    version,
    historique: [
      ...item.historique,
      {
        date: trace.horodatage,
        changement: `${CHANGEMENT_TEXTE_ERRONE} : ${identifies.map(cleTexte).join(", ")}`,
        motif:
          `rejet sous le motif « texte extrait erroné » (item ${rejetes.join(", ")}) : la validation de l'item ` +
          "sur ce texte ne tient plus ; il retourne en attente sans être déplacé (§4, protocole 0.25)",
        commit: trace.commit,
        version_resultante: version,
      },
    ],
  };
}
