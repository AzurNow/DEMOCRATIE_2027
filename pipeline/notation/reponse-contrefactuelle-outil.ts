/**
 * La réponse et la demande de charge permutées du contrefactuel d'outil (§7, protocole 0.24,
 * D59 (13)) : « en renotant un sous-ensemble après permutation des noms d'outils dans le texte des
 * réponses, seule trace de leur identité que voit le juge ».
 *
 * **Réponse contrefactuelle** (`schema/reponse.schema.json`, contexte `contrefactuel_outil`). Une
 * copie de la réponse d'origine sous un nouvel identifiant, qui dit de quoi elle dérive et par
 * quelle permutation (`noms_outils`, correspondances du dérangement des outils). Comme au test des
 * candidats (`reponse-contrefactuelle.ts`), seule la projection que lit le juge est permutée :
 * `normalise.texte` et la clé `texte` de chaque citation ; le brut, la requête, les liens,
 * l'outil et son alias sont recopiés à l'identique (règle 7). Une réponse manquante, un refus de
 * l'API ou une réponse qui n'est pas du run n'a rien à permuter : erreur.
 *
 * **Demande permutée.** Seule la réponse change : le §7 ne permute les noms d'outils que « dans le
 * texte des réponses ». La question, les items, la réponse attendue et les pages citées sont ceux
 * de la demande d'origine ; l'extrait de la notation permutée se contrôle contre le texte permuté
 * et les citations des items d'origine.
 */

import type { ReponseEcrite, ReponseObtenue } from "../interrogation/types.ts";
import type { DemandeCharge, ReponseNotable } from "./charge-juge.ts";
import { correspondancesOutils, permuterNomsOutils, type DerangementOutils } from "./derangement-outils.ts";
import { citationsDeReference, type TextesDeVerification } from "./extrait.ts";
import { citationPermutee, permutable, type SansContexte } from "./reponse-contrefactuelle.ts";

/** Une réponse permutée, conforme à `schema/reponse.schema.json` (contexte `contrefactuel_outil`). */
export type ReponseContrefactuelleOutil = SansContexte<ReponseObtenue> & {
  readonly contexte: "contrefactuel_outil";
  readonly derive_de_reponse_id: string;
  readonly permutation: {
    readonly type: "noms_outils";
    readonly correspondances: Readonly<Record<string, string>>;
  };
};

export interface ReponsePermuteeOutil {
  readonly reponse: ReponseContrefactuelleOutil;
  /** Somme des mentions résiduelles du texte et des citations (`permutation.ts`). */
  readonly mentions_residuelles: number;
}

export interface DemandePermuteeOutil {
  readonly demande: DemandeCharge;
  readonly reponse: ReponseContrefactuelleOutil;
  readonly textes: TextesDeVerification;
  readonly mentions_residuelles: number;
}

export function reponseContrefactuelleOutil(reponse: ReponseEcrite | ReponseNotable, nouvel_id: string, derangement: DerangementOutils): ReponsePermuteeOutil {
  const obtenue = permutable(reponse);
  let mentions = 0;
  const permuter = (texte: string): string => {
    const sortie = permuterNomsOutils(texte, derangement);
    mentions += sortie.mentions_residuelles;
    return sortie.texte;
  };
  const { contexte: _origine, ...sansContexte } = obtenue;
  const citations = obtenue.normalise.citations;
  const contrefactuelle: ReponseContrefactuelleOutil = {
    ...sansContexte,
    id: nouvel_id,
    contexte: "contrefactuel_outil",
    derive_de_reponse_id: obtenue.id,
    permutation: { type: "noms_outils", correspondances: correspondancesOutils(derangement) },
    normalise: {
      ...obtenue.normalise,
      texte: permuter(obtenue.normalise.texte),
      ...(citations === undefined ? {} : { citations: citations.map((c) => citationPermutee(c, permuter)) }),
    },
  };
  return { reponse: contrefactuelle, mentions_residuelles: mentions };
}

export function demandePermuteeOutils(demande: DemandeCharge, nouvel_id: string, derangement: DerangementOutils): DemandePermuteeOutil {
  const { reponse, mentions_residuelles } = reponseContrefactuelleOutil(demande.reponse, nouvel_id, derangement);
  return {
    demande: { ...demande, reponse },
    reponse,
    textes: { reponse: reponse.normalise.texte, citations_reference: citationsDeReference(demande.references.map((r) => r.item)) },
    mentions_residuelles,
  };
}
