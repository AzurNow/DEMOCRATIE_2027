import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { AnySchemaObject, Plugin } from "ajv";
import { cheminSchema, NOMS_SCHEMAS } from "./noms.ts";

/**
 * `ajv-formats` ne publie qu'un export par défaut CommonJS ; sous `moduleResolution: NodeNext`
 * sans `esModuleInterop` (ni l'un ni l'autre à ajouter pour ce lot, cf. brief), un `import
 * addFormats from "ajv-formats"` ou un import namespace se retype en l'espace de noms du module
 * entier au lieu de la fonction de greffon — `require` direct est le contournement le plus net,
 * sans toucher `tsconfig.json`.
 */
const requerir = createRequire(import.meta.url);
const addFormats = requerir("ajv-formats") as Plugin<unknown>;

export type InstanceAjv = InstanceType<typeof Ajv2020>;

export interface Registre {
  readonly ajv: InstanceAjv;
  readonly avertissementsStrict: readonly string[];
}

/**
 * `strict: "log"` et non `true` (`CLAUDE.md`, brief : « si strict refuse un mot-clé légitime du
 * draft 2020-12 utilisé par les schémas, passe en strict: "log" et dis-le, ne modifie pas le
 * schéma »). Les schémas combinent `if`/`then`/`else`, `not` et `contains` à travers des
 * branches que l'heuristique statique de ajv ne peut pas suivre ; en `strict: true`, le premier
 * appel de validation lève une exception avant d'atteindre le premier exemple. Les avertissements
 * sont collectés, jamais imprimés ligne à ligne (plusieurs centaines par run) : seul leur nombre
 * apparaît dans le rapport.
 */
export function creerAjv(avertissements: string[]): InstanceAjv {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: "log",
    logger: {
      log: () => undefined,
      warn: (message: string) => {
        avertissements.push(message);
      },
      error: (message: string) => {
        avertissements.push(message);
      },
    },
  });
  addFormats(ajv);
  return ajv;
}

function chargerSchemaDepuisDisque(chemin: string): AnySchemaObject {
  const brut = readFileSync(chemin, "utf8");
  return JSON.parse(brut) as AnySchemaObject;
}

/**
 * Charge tous les schémas dans un unique registre ajv (draft 2020-12 + ajv-formats). C'est la seule
 * façon de les résoudre : `commun.schema.json` crée un couplage assumé (`docs/DETTE.md`, entrée du
 * 2026-09-17, point 4). Voir `isole.ts` pour la contre-épreuve.
 */
export function construireRegistre(racineSchema: string): Registre {
  const avertissements: string[] = [];
  const ajv = creerAjv(avertissements);
  for (const nom of NOMS_SCHEMAS) {
    const schema = chargerSchemaDepuisDisque(cheminSchema(racineSchema, nom));
    ajv.addSchema(schema);
  }
  return { ajv, avertissementsStrict: avertissements };
}
