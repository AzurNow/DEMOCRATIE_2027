import { defineWorkspace } from "vitest/config";

// Deux projets : les tests du site lisent `site/dist/`, que leur `globalSetup` construit avant eux
// (même commande que `pnpm build:site`). Les autres tests ne paient pas cette construction.
export default defineWorkspace([
  {
    extends: "./vitest.config.ts",
    test: {
      name: "general",
      include: ["tests/**/*.test.ts"],
      exclude: ["tests/site/**", "**/node_modules/**"],
    },
  },
  {
    extends: "./vitest.config.ts",
    test: {
      name: "site",
      include: ["tests/site/**/*.test.ts"],
      globalSetup: ["tests/site/construire-site.ts"],
    },
  },
]);
