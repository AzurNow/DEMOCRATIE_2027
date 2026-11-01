import { readFileSync } from "node:fs";

export type Attendu = "valide" | "invalide";

/**
 * La règle qu'un exemple invalide vise : le mot-clé ajv et le chemin de l'instance (`instancePath`)
 * de l'erreur attendue. Le chemin de schéma (`schemaPath`) est exclu à dessein : il change dès qu'un
 * schéma est refactoré, sans que la règle change.
 */
export interface ErreurVisee {
  readonly keyword: string;
  readonly instance_path: string;
}

export interface EntreeManifeste {
  readonly objet: string;
  readonly fichier: string;
  readonly attendu: Attendu;
  readonly motif: string;
  readonly regle_protocole?: string;
  /** Obligatoire pour un exemple invalide, interdite pour un valide (revue du 2026-10-12, constat 22). */
  readonly erreur_visee?: ErreurVisee;
}

export interface Manifeste {
  readonly description: string;
  readonly exemples: readonly EntreeManifeste[];
}

/** Le manifeste est la table de vérité : une forme inattendue est une erreur du runner, jamais
 * un cas ignoré (règle « aucune valeur par défaut silencieuse »). */
export class ErreurManifeste extends Error {}

function estAttendu(valeur: unknown): valeur is Attendu {
  return valeur === "valide" || valeur === "invalide";
}

function champTexte(brute: Record<string, unknown>, cle: string, contexte: string): string {
  const valeur = brute[cle];
  if (typeof valeur !== "string") {
    throw new ErreurManifeste(`${contexte}.${cle} manquant ou non textuel.`);
  }
  return valeur;
}

function champTexteFacultatif(brute: Record<string, unknown>, cle: string, contexte: string): string | undefined {
  const valeur = brute[cle];
  if (valeur === undefined) return undefined;
  if (typeof valeur !== "string") {
    throw new ErreurManifeste(`${contexte}.${cle} doit être textuel quand il est présent.`);
  }
  return valeur;
}

function lireErreurVisee(brute: unknown, fichier: string): ErreurVisee {
  const contexte = `manifeste (fichier ${fichier}) : erreur_visee`;
  if (typeof brute !== "object" || brute === null) {
    throw new ErreurManifeste(`${contexte} doit être un objet {keyword, instance_path}.`);
  }
  const objet = brute as Record<string, unknown>;
  return { keyword: champTexte(objet, "keyword", contexte), instance_path: champTexte(objet, "instance_path", contexte) };
}

/** Un invalide déclare sa règle visée ; un valide n'en déclare pas (rien à viser). */
function lireErreurViseeSelonAttendu(
  brute: Record<string, unknown>,
  attendu: Attendu,
  fichier: string,
): ErreurVisee | undefined {
  const declaree = brute["erreur_visee"];
  if (attendu === "valide") {
    if (declaree !== undefined) {
      throw new ErreurManifeste(`manifeste (fichier ${fichier}) : un exemple valide ne porte pas d'erreur_visee.`);
    }
    return undefined;
  }
  if (declaree === undefined) {
    throw new ErreurManifeste(`manifeste (fichier ${fichier}) : un exemple invalide doit déclarer son erreur_visee.`);
  }
  return lireErreurVisee(declaree, fichier);
}

function validerEntree(brute: unknown, index: number): EntreeManifeste {
  const contexte = `manifeste.exemples[${index}]`;
  if (typeof brute !== "object" || brute === null) {
    throw new ErreurManifeste(`${contexte} n'est pas un objet.`);
  }
  const objetBrut = brute as Record<string, unknown>;
  const objet = champTexte(objetBrut, "objet", contexte);
  const fichier = champTexte(objetBrut, "fichier", contexte);
  const motif = champTexte(objetBrut, "motif", contexte);
  const reglesProtocole = champTexteFacultatif(objetBrut, "regle_protocole", contexte);
  if (!estAttendu(objetBrut["attendu"])) {
    throw new ErreurManifeste(`${contexte}.attendu doit être "valide" ou "invalide" (fichier ${fichier}).`);
  }
  const attendu = objetBrut["attendu"];
  const erreurVisee = lireErreurViseeSelonAttendu(objetBrut, attendu, fichier);
  return {
    objet,
    fichier,
    attendu,
    motif,
    ...(reglesProtocole === undefined ? {} : { regle_protocole: reglesProtocole }),
    ...(erreurVisee === undefined ? {} : { erreur_visee: erreurVisee }),
  };
}

export function chargerManifeste(chemin: string): Manifeste {
  const brut = JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  if (typeof brut["description"] !== "string") {
    throw new ErreurManifeste("manifeste.description manquant ou non textuel.");
  }
  if (!Array.isArray(brut["exemples"])) {
    throw new ErreurManifeste("manifeste.exemples doit être un tableau.");
  }
  const exemples = brut["exemples"].map((entree: unknown, index: number) => validerEntree(entree, index));
  return { description: brut["description"], exemples };
}
