/**
 * Cas limites des deux règles de complexité : un test par seuil, sur du code construit en mémoire
 * et vérifié par l'API Linter, jamais par un processus. Les deux règles sont lues dans
 * `eslint.config.js` lui-même (DETTE 2026-09-18, n° 7) : un seuil changé dans la configuration
 * fait échouer ces tests au lieu de rester testé à l'ancienne valeur. Les règles typées (D9), qui
 * exigent un projet TypeScript, ne sont pas reprises.
 */

import { Linter } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import configurationDuDepot from "../eslint.config.js";

const REGLES_DE_COMPLEXITE = ["complexity", "sonarjs/cognitive-complexity"] as const;

/**
 * La règle `nom` telle que la déclare exactement un bloc de la configuration. Absente ou déclarée
 * deux fois : refus, plutôt que de tester une valeur choisie au hasard.
 */
function regleDeLaConfiguration(configuration: readonly Linter.Config[], nom: string): Linter.RuleEntry {
  const declarations = configuration.flatMap((bloc) => {
    const entree = bloc.rules?.[nom];
    return entree === undefined ? [] : [entree];
  });
  const [unique] = declarations;
  if (declarations.length !== 1 || unique === undefined) {
    throw new Error(`eslint.config.js déclare la règle « ${nom} » ${declarations.length} fois, une seule attendue.`);
  }
  return unique;
}

function reglesDeComplexite(configuration: readonly Linter.Config[]): Linter.RulesRecord {
  return Object.fromEntries(REGLES_DE_COMPLEXITE.map((nom) => [nom, regleDeLaConfiguration(configuration, nom)]));
}

describe("règles ESLint : complexité cyclomatique et cognitive", () => {
  const configuration: Linter.Config = {
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { sonarjs },
    rules: reglesDeComplexite(configurationDuDepot),
  };

  function verifier(code: string): readonly string[] {
    const linter = new Linter();
    return linter.verify(code, configuration, { filename: "sondage.ts" }).map((message) => message.ruleId ?? "");
  }

  function fonctionAvecNIfsAPlat(nombreDeIf: number): string {
    const corps = Array.from({ length: nombreDeIf }, (_, index) => `if (x === ${index}) return ${index};`).join(" ");
    return `function f(x: number) { ${corps} return -1; }`;
  }

  it("lit les deux règles dans eslint.config.js, et refuse une règle absente ou déclarée deux fois", () => {
    expect(Object.keys(reglesDeComplexite(configurationDuDepot))).toEqual([...REGLES_DE_COMPLEXITE]);
    expect(() => regleDeLaConfiguration([{ rules: {} }], "complexity")).toThrow(/0 fois/);
    const doublee: Linter.Config[] = [{ rules: { complexity: "error" } }, { rules: { complexity: "warn" } }];
    expect(() => regleDeLaConfiguration(doublee, "complexity")).toThrow(/2 fois/);
  });

  it("un seuil modifié dans la configuration lue change le verdict (le test ne fige aucune valeur)", () => {
    const relachee = reglesDeComplexite([{ rules: { complexity: ["error", { max: 10 }], "sonarjs/cognitive-complexity": ["error", 15] } }]);
    const linter = new Linter();
    const messages = linter.verify(fonctionAvecNIfsAPlat(9), { ...configuration, rules: relachee }, { filename: "sondage.ts" });
    expect(messages).toEqual([]);
  });

  it("9. une fonction à dix branches est refusée, à neuf branches acceptée (complexité cyclomatique)", () => {
    expect(verifier(fonctionAvecNIfsAPlat(8))).toEqual([]); // 1 + 8 if = 9 : accepté
    expect(verifier(fonctionAvecNIfsAPlat(9))).toContain("complexity"); // 1 + 9 if = 10 : refusé
  });

  it("10. cognitive 16 est refusée, 15 est acceptée", () => {
    // Cinq `if` imbriqués : 1+2+3+4+5 = 15, accepté.
    const cognitive15 =
      "function f(x: number) { if (x===0) { if (x===1) { if (x===2) { if (x===3) { " +
      "if (x===4) { return 1; } } } } } return 0; }";
    // Un sixième `if`, non imbriqué (+1 seulement) : 16, refusé.
    const cognitive16 =
      "function f(x: number) { if (x===0) { if (x===1) { if (x===2) { if (x===3) { " +
      "if (x===4) { return 1; } } } } } if (x===5) { return 2; } return 0; }";

    expect(verifier(cognitive15)).toEqual([]);
    expect(verifier(cognitive16)).toContain("sonarjs/cognitive-complexity");
  });
});
