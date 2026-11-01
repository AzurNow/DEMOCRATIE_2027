/** La provenance d'un extrait n'a aucune valeur par défaut : « — choisir — » est une absence, dite à l'écran. */

/** « — choisir — » vaut absence de choix, jamais une valeur. */
export function valeurChoisie(s: { readonly value: string }): string | null {
  return s.value === "" ? null : s.value;
}

/** Un extrait saisi exige une provenance choisie ; sans extrait, rien n'est exigé ni envoyé. */
export function erreurDeProvenance(extrait: string, provenance: string | null): string | null {
  if (extrait.length === 0 || provenance !== null) return null;
  return "Choisissez la provenance de l'extrait justificatif (réponse ou citation de référence).";
}
