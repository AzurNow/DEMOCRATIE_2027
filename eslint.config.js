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
];
