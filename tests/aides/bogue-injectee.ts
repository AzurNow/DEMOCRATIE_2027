/**
 * Préchargement de test (`node --import`) : simule un bogue JavaScript dans une commande réelle.
 * Quand `BANC_BOGUE_FICHIER` nomme un fichier (par exemple `outils/contacts.ts`), le premier appel
 * de `filter`, `map`, `flatMap` ou `findIndex` d'un tableau fait DEPUIS ce fichier lève une
 * `TypeError`, comme le ferait un accès sur `undefined`. Rien d'autre n'est touché. Aucun code de
 * production ne l'importe : seuls les tests le passent en `--import`, pour vérifier qu'un bogue
 * remonte avec sa pile (`outils/refus-attendu.ts`) au lieu d'être rattrapé en message d'une ligne.
 */

const fichier = process.env["BANC_BOGUE_FICHIER"];

type MethodeTableau = "filter" | "map" | "flatMap" | "findIndex";

function armer(methode: MethodeTableau, cible: string): void {
  const origine = Array.prototype[methode] as (...arguments_: unknown[]) => unknown;
  Object.defineProperty(Array.prototype, methode, {
    configurable: true,
    writable: true,
    value: function (this: unknown[], ...arguments_: unknown[]): unknown {
      const appelant = (new Error("sonde").stack as string).split("\n")[2] as string;
      if (appelant.includes(cible)) throw new TypeError("bogue injectée par le test : accès sur undefined");
      return origine.apply(this, arguments_);
    },
  });
}

if (fichier !== undefined) {
  for (const methode of ["filter", "map", "flatMap", "findIndex"] as const) armer(methode, fichier);
}
