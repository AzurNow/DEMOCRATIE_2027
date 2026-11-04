/**
 * Réextraction d'une source renvoyée (§4, décision D73 (9)) : « nouvelle double extraction sur un
 * texte canonique d'empreinte différente (nouvelle version épinglée ou nouvelle capture), jamais sur
 * le texte rejeté ».
 *
 * Le renvoi n'est pas un état écrit : `pnpm promote` le recalcule depuis les verdicts
 * (`validation/domaine/renvoi-reextraction.ts:renvoisAReextraction`), et `pnpm extraire` en reçoit
 * la liste au démarrage (`commande.ts`, dépendance `renvoisAReextraction`). Un renvoi désigne le
 * document, son URL et le texte jugé faux. Le texte qu'une entrée désigne est refusé quand il a
 * l'empreinte d'un texte renvoyé de la même source, reconnue par son document ou par son URL :
 * une nouvelle capture qui redonne le même texte redonne le texte rejeté. Un renvoi sans empreinte
 * de texte ne désigne aucun texte et ne refuse rien ici ; le journal indexé par texte
 * (`staging.ts:journalPresent`) empêche alors seul de relancer un texte déjà extrait.
 */

/** Ce que l'extraction lit d'un renvoi ; `renvoi-reextraction.ts:SourceRenvoyee` le satisfait. */
export interface TexteRenvoye {
  readonly sha256: string;
  /** Absent quand la source renvoyée n'en porte pas : rien n'est alors refusé par ce module. */
  readonly texte_sha256?: string;
  readonly url: string;
}

/** Le texte qu'une entrée d'extraction désigne : la fiche de l'extracteur épinglé et son bloc source. */
export interface TexteDesigne {
  readonly sha256_source: string;
  readonly texte_sha256: string;
  readonly url: string;
}

export class TexteRenvoyeALaReextraction extends Error {
  constructor(cle: string, designe: TexteDesigne) {
    super(
      `Source ${cle} renvoyée à la réextraction (motif « texte extrait erroné ») : le texte ${designe.texte_sha256} ` +
        `est le texte rejeté. La réextraction exige un texte canonique d'empreinte différente, nouvelle version ` +
        `épinglée ou nouvelle capture (§4, D73 (9)) ; rien n'est appelé ni écrit.`,
    );
    this.name = "TexteRenvoyeALaReextraction";
  }
}

function designePar(renvoi: TexteRenvoye, designe: TexteDesigne): boolean {
  if (renvoi.texte_sha256 !== designe.texte_sha256) return false;
  return renvoi.sha256 === designe.sha256_source || renvoi.url === designe.url;
}

/** Lève `TexteRenvoyeALaReextraction` si le texte désigné est celui qu'un renvoi a rejeté. */
export function exigerTexteNonRenvoye(cle: string, designe: TexteDesigne, renvois: readonly TexteRenvoye[]): void {
  if (renvois.some((renvoi) => designePar(renvoi, designe))) throw new TexteRenvoyeALaReextraction(cle, designe);
}
