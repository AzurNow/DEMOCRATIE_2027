/**
 * Les liens d'une saisie de l'application grand public (§6, protocole 0.31, D73 (12)) : « ses
 * liens sont les adresses http ou https qui figurent dans ce texte ». Le texte n'est jamais
 * modifié (règle 7) : chaque lien est une sous-chaîne exacte du texte copié.
 *
 * Règle d'extraction, déterministe, version `REGLE_LIENS_DU_TEXTE` :
 *
 * 1. **Début.** Une adresse commence par `http://` ou `https://`, en minuscules, au début du texte
 *    ou après un caractère qui n'est ni une lettre ni un chiffre (`xhttps://` n'en est pas une).
 *    Le schéma `reponse` exige `^https?://` : un schéma en majuscules (`HTTPS://`) n'est pas
 *    retenu, plutôt que réécrit. `ftp://`, `www.…` et un domaine nu sans schéma ne sont pas des
 *    adresses http ou https et ne sont pas retenus.
 * 2. **Fin.** L'adresse s'arrête au premier blanc (espaces insécables et fines comprises, retour à
 *    la ligne compris) ou au premier caractère qu'une URL ne contient pas en clair :
 *    `" < > [ ] { } | \ ^` et l'accent grave, plus les guillemets typographiques `« » “ ”`.
 *    Les crochets interdisent donc les hôtes IPv6 littéraux, absents des réponses attendues.
 * 3. **Ponctuation finale.** Sont retirés, de la fin vers le début, tant qu'il y en a : `. , ; :
 *    ! ?`, l'apostrophe droite et courbe, l'astérisque (gras Markdown), et une parenthèse
 *    fermante quand l'adresse en compte plus de fermantes que d'ouvrantes (`(voir https://a/p)` →
 *    `https://a/p`, mais `https://…/Exemple_(homonymie)` garde la sienne).
 * 4. **Hôte.** Ce qui reste doit avoir au moins un caractère après `://` : `https://` seul n'est pas
 *    retenu.
 * 5. **Doublons.** Chaque occurrence est retenue, dans l'ordre d'apparition, comme côté API
 *    (`normalise.liens`, « dans l'ordre d'apparition ») ; la notation dédoublonne déjà les pages
 *    citées (une page par lien distinct, `pipeline/notation/charge-juge.ts`).
 */

/** Version de la règle ci-dessus : elle entre dans `reponse.normalisation.version` des saisies. */
export const REGLE_LIENS_DU_TEXTE = "1.0.0";

const ADRESSE = /(?<![\p{L}\p{N}])https?:\/\/[^\s"<>[\]{}|\\^`«»“”]+/gu;

/** Ponctuation qui termine une phrase plutôt qu'une adresse (règle 3, hors parenthèse). */
const FINALE = new Set([".", ",", ";", ":", "!", "?", "'", "’", "*"]);

const SCHEMA_ET_HOTE = /^https?:\/\/./u;

export function liensDuTexte(texte: string): string[] {
  const liens: string[] = [];
  for (const occurrence of texte.matchAll(ADRESSE)) {
    const adresse = sansPonctuationFinale(occurrence[0]);
    if (SCHEMA_ET_HOTE.test(adresse)) liens.push(adresse);
  }
  return liens;
}

function sansPonctuationFinale(brute: string): string {
  let adresse = brute;
  while (adresse.length > 0 && finaleARetirer(adresse)) adresse = adresse.slice(0, -1);
  return adresse;
}

function finaleARetirer(adresse: string): boolean {
  const derniere = adresse.slice(-1);
  if (FINALE.has(derniere)) return true;
  return derniere === ")" && compter(adresse, ")") > compter(adresse, "(");
}

function compter(chaine: string, caractere: string): number {
  return chaine.split(caractere).length - 1;
}
