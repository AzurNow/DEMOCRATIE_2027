// Deux familles de règles, toutes en erreur, aucune règle de style (décision D9 du 2026-09-23, qui
// étend celle du 2026-09-18) :
// - la complexité, cyclomatique (McCabe) et cognitive, sur tout le code (CLAUDE.md, « Complexité
//   sous les seuils ») ;
// - des règles qui attrapent des défauts réels, lues sur les types : promesse oubliée, `switch` non
//   exhaustif, conversion de type ou condition inutile, variable morte, `any`, `!`.
// Pas de preset « recommended » : chaque règle est choisie et se justifie seule.
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  {
    ignores: ["node_modules/**", "validation/client/dist/**", "site/dist/**", "site/.astro/**", ".claude/worktrees/**", "**/*.js"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Chaque fichier est lu avec le tsconfig le plus proche (racine ou validation/client).
        projectService: { allowDefaultProject: ["vitest.config.ts", "vitest.workspace.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      sonarjs,
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      complexity: ["error", { max: 9 }],
      "sonarjs/cognitive-complexity": ["error", 15],

      // Un `_` en tête dit « écarté exprès » (déstructuration qui retire un champ, argument imposé).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true, caughtErrors: "all" },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      eqeqeq: "error",
      "no-fallthrough": "error",
    },
  },
  {
    // CLAUDE.md, « Architecture » : `pipeline/` importe des fonctions et des types d'`analysis/`,
    // jamais l'inverse (revue du 2026-11-05, constats 2 et 3). Un tiers lit `analysis/` seul pour
    // vérifier les métriques. Types compris (`allowTypeImports` laissé à faux), et les imports
    // dynamiques ou de type (`import("…")`) aussi.
    files: ["analysis/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)pipeline(/|$)",
              message: "analysis/ n'importe rien de pipeline/ (CLAUDE.md, « Architecture ») : déplacer la règle partagée dans analysis/.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/(^|\\u002F)pipeline(\\u002F|$)/]",
          message: "analysis/ n'importe rien de pipeline/ (CLAUDE.md, « Architecture »), pas même dynamiquement.",
        },
        {
          selector: "TSImportType[argument.literal.value=/(^|\\u002F)pipeline(\\u002F|$)/]",
          message: "analysis/ n'importe rien de pipeline/ (CLAUDE.md, « Architecture »), pas même un type.",
        },
      ],
    },
  },
  {
    // docs/PLAN-PAGE-PEDAGOGIQUE.md, « Aucune logique métier » (revue du 2026-11-09, constat 6) : le
    // site importe des constantes, types et fonctions pures d'`analysis/` (#335), jamais `pipeline/`,
    // `validation/` ni `staging/`. Imports dynamiques et de type compris. Les fichiers `.astro` ne
    // sont pas lus par le lint : la garde réseau de `tests/site/` les couvre.
    files: ["site/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "(^|/)(pipeline|validation|staging)(/|$)",
              message: "site/ n'importe que des constantes, types et fonctions pures d'analysis/ (docs/PLAN-PAGE-PEDAGOGIQUE.md), jamais pipeline/, validation/ ni staging/.",
            },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression[source.value=/(^|\\u002F)(pipeline|validation|staging)(\\u002F|$)/]",
          message: "site/ n'importe ni pipeline/, ni validation/, ni staging/, pas même dynamiquement.",
        },
        {
          selector: "TSImportType[argument.literal.value=/(^|\\u002F)(pipeline|validation|staging)(\\u002F|$)/]",
          message: "site/ n'importe ni pipeline/, ni validation/, ni staging/, pas même un type.",
        },
      ],
    },
  },
];
