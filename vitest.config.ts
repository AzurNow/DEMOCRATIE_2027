import { defineConfig } from "vitest/config";

// Les projets (général, site) sont déclarés dans `vitest.workspace.ts`.
export default defineConfig({
  test: {
    environment: "node",
  },
});
