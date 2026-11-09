/**
 * `docs/APPELS-INTERROGATION.md` (§9, « Reproductibilité » ; D59 (16), protocole 0.24) : « le
 * protocole renvoie à `docs/APPELS-INTERROGATION.md`, document engendré depuis le code de
 * l'interrogation, qui documente exactement quels appels faire ».
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ADAPTATEURS_DOCUMENTES,
  CLE_FICTIVE,
  genererAppelsInterrogation,
} from "../outils/appels-interrogation/rendu.ts";
import {
  ATTENTES_AVANT_RELANCE_MS,
  DELAI_TENTATIVE_MS,
  ECHANTILLONS,
  TENTATIVES_MAX,
  TOKENS_SORTIE_MAX,
} from "../pipeline/interrogation/conditions.ts";
import { EN_TETES_AUTHENTIFICATION } from "../pipeline/interrogation/editeur.ts";
import { REGLES_SIMULE } from "../pipeline/interrogation/editeur-simule.ts";

const CHEMIN = resolve(import.meta.dirname, "../docs/APPELS-INTERROGATION.md");

describe("docs/APPELS-INTERROGATION.md", () => {
  it("est à jour avec le code de l'interrogation (sinon : pnpm appels-interrogation)", () => {
    expect(readFileSync(CHEMIN, "utf8")).toBe(genererAppelsInterrogation());
  });

  it("est déterministe : deux rendus donnent les mêmes octets", () => {
    expect(genererAppelsInterrogation()).toBe(genererAppelsInterrogation());
  });

  it("porte les conditions figées du §6 telles que le code les applique", () => {
    const texte = genererAppelsInterrogation();
    expect(texte).toContain(`| Tentatives par requête, au plus | ${TENTATIVES_MAX} |`);
    expect(texte).toContain(`| Abandon d'une tentative sans réponse | ${DELAI_TENTATIVE_MS / 1000} s |`);
    expect(texte).toContain(
      `| Attente avant la tentative 2, puis 3 | ${ATTENTES_AVANT_RELANCE_MS[0] / 1000} s, puis ${ATTENTES_AVANT_RELANCE_MS[1] / 1000} s |`,
    );
    expect(texte).toContain(`| Tokens de sortie, au plus | ${TOKENS_SORTIE_MAX} |`);
    expect(texte).toContain(`| Échantillons par question, formulation et mode | ${ECHANTILLONS} |`);
    for (const nom of EN_TETES_AUTHENTIFICATION) expect(texte).toContain(`\`${nom}\``);
  });

  it("documente chaque adaptateur dans chacun des deux modes, requête construite par l'adaptateur lui-même", () => {
    const texte = genererAppelsInterrogation();
    expect(ADAPTATEURS_DOCUMENTES.map((a) => a.nom)).toContain("editeur-simule");
    expect(texte).toContain(REGLES_SIMULE.endpoint);
    expect(texte).toContain("#### Mode `web_activee`");
    expect(texte).toContain("#### Mode `web_desactivee`");
    expect(texte).toContain(`"max_tokens": ${TOKENS_SORTIE_MAX}`);
    expect(texte).toContain('"recherche_web"');
  });

  it("ne porte aucune clé réelle : seule la clé fictive figure dans les en-têtes", () => {
    const texte = genererAppelsInterrogation();
    expect(texte).toContain(CLE_FICTIVE);
    expect(texte).not.toMatch(/sk-[A-Za-z0-9]{8,}/);
  });

  it("dit qu'aucun adaptateur d'éditeur réel n'est encore écrit : le seul documenté est simulé", () => {
    // Le jour où un adaptateur réel rejoint la liste, ce test change avec elle.
    expect(ADAPTATEURS_DOCUMENTES.map((a) => a.nature)).toEqual(["simule"]);
    expect(genererAppelsInterrogation()).toContain("Aucun adaptateur d'éditeur réel n'est encore écrit");
  });
});

/**
 * DETTE n° 5 (lot interrogation, #234) : le code n'a pas de registre des adaptateurs d'interrogation,
 * seulement un module `pipeline/interrogation/editeur-<nom>.ts` par éditeur. La garde est donc
 * textuelle : chaque module d'éditeur doit être importé par le rendu du document, où
 * `ADAPTATEURS_DOCUMENTES` en tire sa fabrique. Un adaptateur ajouté sans documentation fait échouer
 * ce test.
 */
const RENDU = readFileSync(resolve(import.meta.dirname, "../outils/appels-interrogation/rendu.ts"), "utf8");
const MODULES_EDITEUR = readdirSync(resolve(import.meta.dirname, "../pipeline/interrogation")).filter((f) => /^editeur-.+\.ts$/u.test(f));

function modulesNonDocumentes(modules: readonly string[], source: string): readonly string[] {
  return modules.filter((m) => !source.includes(`pipeline/interrogation/${m}"`));
}

describe("docs/APPELS-INTERROGATION.md : aucun adaptateur d'éditeur oublié", () => {
  it("chaque module pipeline/interrogation/editeur-*.ts est importé par le rendu du document", () => {
    expect(MODULES_EDITEUR).toContain("editeur-simule.ts");
    expect(modulesNonDocumentes(MODULES_EDITEUR, RENDU)).toEqual([]);
  });

  it("un module d'éditeur ajouté sans documentation est signalé (la garde n'est pas vide)", () => {
    expect(modulesNonDocumentes([...MODULES_EDITEUR, "editeur-nouveau.ts"], RENDU)).toEqual(["editeur-nouveau.ts"]);
  });
});
