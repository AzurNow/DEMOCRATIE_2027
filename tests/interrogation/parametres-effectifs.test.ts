/**
 * Conformité 2026-11-01, constat n° 10, exigence §6.04 : « les valeurs effectives [des paramètres
 * d'échantillonnage] sont enregistrées ».
 *
 * Le schéma distingue le canal (`canal: api`) : `metadonnees.parametres_effectifs` est obligatoire
 * pour toute réponse OBTENUE du canal api, refus de modération compris (même chemin d'écriture). Une
 * réponse manquante n'a pas de métadonnées. Le canal application n'est pas visé (pas d'API, §6).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { adaptateurSimule } from "../../pipeline/interrogation/editeur-simule.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { banc, CLE_API, plan, requete, scenarioScripte, seule, type Banc } from "./aides.ts";

const EXEMPLES = join(import.meta.dirname, "../../schema/exemples/reponse");

type Objet = Record<string, unknown>;

function exemple(nom: string): Objet {
  return JSON.parse(readFileSync(join(EXEMPLES, nom), "utf8")) as Objet;
}

function sansParametres(objet: Objet): Objet {
  const { parametres_effectifs: _retire, ...metadonnees } = objet["metadonnees"] as Objet;
  return { ...objet, metadonnees };
}

function cheminsRefuses(objet: Objet, nom: string): readonly string[] {
  const erreur = erreurDeSchema("reponse", objet, nom);
  if (erreur === null) throw new Error(`${nom} aurait dû être refusé par le schéma`);
  return erreur.chemins;
}

describe("§6.04 : parametres_effectifs obligatoire pour une réponse obtenue du canal api", () => {
  it("une réponse obtenue sans metadonnees.parametres_effectifs est refusée par le schéma", () => {
    const objet = sansParametres(exemple("valide-01-api-obtenue.json"));
    expect(cheminsRefuses(objet, "sans paramètres")).toContain("/metadonnees");
  });

  it("l'exemple invalide-18 est refusé sur cette règle", () => {
    const nom = "invalide-18-api-sans-parametres-effectifs.json";
    expect(cheminsRefuses(exemple(nom), nom)).toContain("/metadonnees");
  });

  it("un refus de modération (objet JSON) sans parametres_effectifs est refusé", () => {
    const objet = sansParametres(exemple("valide-03-api-obtenue-refus-api.json"));
    expect(cheminsRefuses(objet, "refus")).toContain("/metadonnees");
  });

  it("un refus de modération en corps texte sans parametres_effectifs est refusé", () => {
    const objet = sansParametres(exemple("valide-06-api-obtenue-refus-brut-texte.json"));
    expect(cheminsRefuses(objet, "refus texte")).toContain("/metadonnees");
  });

  it("une réponse manquante reste valide : elle n'a pas de métadonnées, donc pas ce champ", () => {
    const manquante = exemple("valide-02-api-manquante.json");
    expect(manquante["metadonnees"]).toBeUndefined();
    expect(erreurDeSchema("reponse", manquante, "manquante")).toBeNull();
  });

  it.each([
    "valide-01-api-obtenue.json",
    "valide-03-api-obtenue-refus-api.json",
    "valide-06-api-obtenue-refus-brut-texte.json",
  ])("l'exemple valide %s porte le champ et passe", (nom) => {
    expect(erreurDeSchema("reponse", exemple(nom), nom)).toBeNull();
  });
});

let courant: Banc | null = null;

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

async function interroger(issues: readonly string[]): Promise<ReponseObtenue> {
  courant = banc();
  courant.editeur("outil-alpha", scenarioScripte(issues));
  await courant.executer(plan(requete()));
  const reponse = seule(courant.lues());
  if (reponse.statut_reponse !== "obtenue") throw new Error(`réponse ${reponse.statut_reponse}, obtenue attendue`);
  return reponse;
}

const PARAMETRES_SIMULES = { max_tokens: 2048, instruction_systeme: "aucune", temperature: 1, top_p: 1 };

describe("§6.04 : l'interrogation simulée écrit les paramètres effectifs de l'adaptateur", () => {
  it("réponse ordinaire : parametres_effectifs égale exactement ce que l'adaptateur déclare pour la requête enregistrée", async () => {
    const reponse = await interroger(["reponse"]);
    const attendus = adaptateurSimule(CLE_API).parametresEffectifs({
      endpoint: reponse.requete.endpoint,
      entetes: reponse.requete.entetes,
      corps: reponse.requete.corps,
    });
    expect(reponse.metadonnees.parametres_effectifs).toEqual(attendus);
    expect(reponse.metadonnees.parametres_effectifs).toEqual(PARAMETRES_SIMULES);
  });

  it("refus de modération : parametres_effectifs est écrit aussi", async () => {
    const reponse = await interroger(["refus"]);
    expect(reponse.normalise.refus_api).toBe(true);
    expect(reponse.metadonnees.parametres_effectifs).toEqual(PARAMETRES_SIMULES);
  });
});
