/**
 * Les avertissements `strict: "log"` d'ajv, catégorisés (docs/DETTE.md, 2026-09-18, point 4).
 *
 * Seules les catégories de `CATEGORIES_ADMISES` sont tolérées ; tout autre message — mot-clé
 * mal orthographié (`requird`), mot-clé inconnu, nouvelle règle de style — lève une erreur
 * nommée qui cite le message (et donc le schéma, ajv le nomme dans son message). Une catégorie
 * admise qui n'a plus aucune occurrence est signalée elle aussi : la table ne garde que ce qui
 * est observé.
 */

export interface CategorieAdmise {
  readonly code: string;
  /** Le message d'ajv, sans l'identité du schéma ni du chemin. */
  readonly motif: RegExp;
  /** Le mot-clé du draft 2020-12 légitime qui provoque l'avertissement. */
  readonly justification: string;
}

export const CATEGORIES_ADMISES: readonly CategorieAdmise[] = [
  {
    code: "strictRequired",
    motif: /^strict mode: required property ".*" is not defined at ".*" \(strictRequired\)$/,
    justification:
      "`required` dans une branche `if`/`then`/`not`/`contains` : la propriété est déclarée dans `properties` du schéma parent, hors de portée de l'heuristique statique d'ajv.",
  },
  {
    code: "strictTypes-type-manquant",
    motif: /^strict mode: missing type ".*" for keyword ".*" at ".*" \(strictTypes\)$/,
    justification:
      "`properties`/`required`/`minItems`… dans une branche `allOf`/`then` sans `type` répété : le type est porté par le schéma parent.",
  },
  {
    code: "strictTypes-union",
    motif: /^strict mode: use allowUnionTypes to allow union type keyword at ".*" \(strictTypes\)$/,
    justification: "`type` donné sous forme de tableau (par exemple `[\"string\", \"null\"]`), légitime en draft 2020-12.",
  },
  {
    code: "strictTuples",
    motif: /^strict mode: ".*" is \d+-tuple, but minItems or maxItems\/.* are not specified or different at path ".*"$/,
    justification: "`prefixItems` sans `minItems`/`maxItems` égaux à sa longueur : tuple volontairement ouvert.",
  },
];

export interface BilanAvertissements {
  readonly total: number;
  /** Compte par code de catégorie admise, y compris les zéros. */
  readonly comptes: ReadonlyMap<string, number>;
  /** Codes admis sans aucune occurrence : la table est à élaguer. */
  readonly sansOccurrence: readonly string[];
}

export class ErreurAvertissementStrictInconnu extends Error {
  readonly inconnus: readonly string[];
  constructor(inconnus: readonly string[]) {
    const lignes = inconnus.map((message) => `  - ${message}`).join("\n");
    super(
      `ajv strict: ${inconnus.length} avertissement(s) hors des catégories admises ` +
        `(outils/schemas/avertissements.ts) :\n${lignes}`,
    );
    this.name = "ErreurAvertissementStrictInconnu";
    this.inconnus = inconnus;
  }
}

function codeDe(message: string, categories: readonly CategorieAdmise[]): string | undefined {
  return categories.find((categorie) => categorie.motif.test(message))?.code;
}

/**
 * Compte les avertissements par catégorie admise ; lève `ErreurAvertissementStrictInconnu` pour
 * tout message qui n'en relève pas.
 */
export function bilanDesAvertissements(
  avertissements: readonly string[],
  categories: readonly CategorieAdmise[] = CATEGORIES_ADMISES,
): BilanAvertissements {
  const comptes = new Map<string, number>(categories.map((categorie) => [categorie.code, 0]));
  const inconnus: string[] = [];
  for (const message of avertissements) {
    const code = codeDe(message, categories);
    if (code === undefined) inconnus.push(message);
    else comptes.set(code, (comptes.get(code) ?? 0) + 1);
  }
  if (inconnus.length > 0) throw new ErreurAvertissementStrictInconnu(inconnus);
  const sansOccurrence = [...comptes].filter(([, compte]) => compte === 0).map(([code]) => code);
  return { total: avertissements.length, comptes, sansOccurrence };
}
