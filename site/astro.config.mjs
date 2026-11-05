// Site statique du Banc d'essai 2027 : export HTML pur, servi à la racine, sans intégration.
// Sortie dans site/dist/ (ignorée par Git). La télémétrie d'Astro est coupée par le script
// `build:site` (ASTRO_TELEMETRY_DISABLED=1). Le service d'images « passthrough » évite de tirer sharp.
import { defineConfig, passthroughImageService } from "astro/config";

export default defineConfig({
  output: "static",
  srcDir: "./src",
  publicDir: "./public",
  outDir: "./dist",
  base: "/",
  trailingSlash: "ignore",
  build: { inlineStylesheets: "always" },
  image: { service: passthroughImageService() },
  devToolbar: { enabled: false },
});
