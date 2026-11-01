import { formaterErreur } from "./erreurs.ts";
import type { ConformiteSchema } from "./meta.ts";
import type { RapportValidation, ResultatExemple } from "./validation.ts";

function imprimerCorpsEchec(resultat: ResultatExemple): void {
  if (resultat.obtenu === "absent") {
    process.stdout.write(`    fichier attendu par le manifeste, absent du disque : ${resultat.chemin}\n`);
    return;
  }
  if (resultat.obtenu === "invalide" && resultat.regleVisee !== undefined && resultat.regleVueParmiLesErreurs === false) {
    const { keyword, instancePath } = resultat.regleVisee;
    const chemin = instancePath === "" ? "(racine)" : instancePath;
    process.stdout.write(`    rejeté, mais pas pour la règle visée (« ${keyword} » à ${chemin}) ; erreurs obtenues :\n`);
  }
  // LESSONS.md, « vérifier qu'un test échoue pour la bonne raison » : toutes les erreurs, pas la
  // première, pour voir que la règle du protocole visée est bien celle qui a été atteinte.
  for (const erreur of resultat.erreurs) process.stdout.write(`    ${formaterErreur(erreur)}\n`);
}

function imprimerLigneResultat(resultat: ResultatExemple): void {
  const statut = resultat.reussi ? "OK" : "ECHEC";
  process.stdout.write(`[${statut}] ${resultat.chemin} — attendu ${resultat.attendu}, obtenu ${resultat.obtenu}\n`);
  if (!resultat.reussi) imprimerCorpsEchec(resultat);
}

function imprimerOrphelins(fichiersOrphelins: readonly string[]): void {
  for (const chemin of fichiersOrphelins) {
    process.stdout.write(`[ECHEC] présent sur le disque, absent du manifeste : ${chemin}\n`);
  }
}

function imprimerConformiteMetaSchema(conformites: readonly ConformiteSchema[]): boolean {
  let toutesConformes = true;
  for (const conformite of conformites) {
    if (conformite.conforme) continue;
    toutesConformes = false;
    process.stdout.write(`[ECHEC] schéma "${conformite.nom}" non conforme au méta-schéma draft 2020-12 :\n`);
    for (const erreur of conformite.erreurs) process.stdout.write(`    ${erreur}\n`);
  }
  return toutesConformes;
}

function imprimerAvertissementsStrict(avertissementsStrict: readonly string[]): void {
  if (avertissementsStrict.length === 0) return;
  process.stdout.write(
    `ajv strict: "log" — ${avertissementsStrict.length} avertissements de style ignorés ` +
      `(docs/DETTE.md, décision du 2026-09-18 sur strict: "log") ; sans effet sur le résultat ci-dessus.\n`,
  );
}

/**
 * Imprime le rapport complet et retourne `true` si tout est conforme : méta-schéma, chaque
 * exemple, et aucun fichier orphelin. L'appelant décide seul du code de sortie.
 */
export function imprimerRapport(
  rapport: RapportValidation,
  conformites: readonly ConformiteSchema[],
  avertissementsStrict: readonly string[],
): boolean {
  const metaConforme = imprimerConformiteMetaSchema(conformites);
  for (const resultat of rapport.resultats) imprimerLigneResultat(resultat);
  imprimerOrphelins(rapport.fichiersOrphelins);

  const reussis = rapport.resultats.filter((resultat) => resultat.reussi).length;
  const total = rapport.resultats.length;
  process.stdout.write(`\n${reussis}/${total} exemples conformes à l'attendu du manifeste.\n`);
  imprimerAvertissementsStrict(avertissementsStrict);

  return metaConforme && reussis === total && rapport.fichiersOrphelins.length === 0;
}
