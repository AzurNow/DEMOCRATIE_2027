/**
 * `pnpm schemas` — valide les exemples de `schema/exemples/` contre `schema/exemples/manifeste.json`
 * et les schémas contre le méta-schéma draft 2020-12. Fait partie de `pnpm check`
 * (`schema/README.md`, « Exemples et table de vérité »).
 *
 * Ne fait que composer `outils/schemas/*` et imprimer : la logique pure vit dans ces modules, sur
 * le modèle de `outils/feuille-de-route.ts` et `outils/feuille-de-route/`.
 *
 *   pnpm schemas
 */
import { resolve } from "node:path";
import { bilanDesAvertissements } from "./schemas/avertissements.ts";
import { chargerManifeste } from "./schemas/manifeste.ts";
import { verifierConformiteMetaSchema } from "./schemas/meta.ts";
import { construireRegistre } from "./schemas/registre.ts";
import { imprimerRapport } from "./schemas/rapport.ts";
import { validerContreManifeste } from "./schemas/validation.ts";

export { validerContreManifeste } from "./schemas/validation.ts";

interface Chemins {
  readonly racineSchema: string;
  readonly racineExemples: string;
  readonly manifeste: string;
}

function cheminsParDefaut(): Chemins {
  const racineSchema = resolve(import.meta.dirname, "..", "schema");
  return {
    racineSchema,
    racineExemples: resolve(racineSchema, "exemples"),
    manifeste: resolve(racineSchema, "exemples", "manifeste.json"),
  };
}

function principal(): void {
  const chemins = cheminsParDefaut();
  const conformites = verifierConformiteMetaSchema(chemins.racineSchema);
  const manifeste = chargerManifeste(chemins.manifeste);
  const { ajv, avertissementsStrict } = construireRegistre(chemins.racineSchema);
  const rapport = validerContreManifeste(ajv, chemins.racineExemples, manifeste);
  const succes = imprimerRapport(rapport, conformites, bilanDesAvertissements(avertissementsStrict));
  if (!succes) process.exitCode = 1;
}

principal();
