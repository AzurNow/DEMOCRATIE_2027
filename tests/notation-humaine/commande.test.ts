/**
 * `pnpm notation:humaine` : le pseudonyme (cas limite 2), le répertoire de run illisible (cas 10),
 * et le serveur local (adresse, politique de sécurité, aucune ressource distante). Seuls les échecs
 * se lancent en processus : une exécution réussie reste en écoute, les tests l'évitent.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { creerServeur, ADRESSE } from "../../notation-humaine/serveur/principal.ts";
import { POLITIQUE_SECURITE } from "../../validation/serveur/http.ts";
import { PseudonymeVide } from "../../pipeline/notation/notation-humaine.ts";
import { RACINE_PROJET, executerOutil } from "../aides/depot.ts";
import { monter, type Monde } from "./fixture.ts";

let monde: Monde | null = null;

afterEach(() => {
  monde?.nettoyer();
  monde = null;
});

function lancer(repertoire: string, pseudonyme: string | undefined, items?: string) {
  const env = { ...process.env };
  delete env["ANNOTATEUR_ID"];
  if (pseudonyme !== undefined) env["ANNOTATEUR_ID"] = pseudonyme;
  return executerOutil("notation-humaine.ts", [repertoire, ...(items === undefined ? [] : [`--items=${items}`])], env);
}

describe("2. pseudonyme vide ou fait d'espaces", () => {
  it("le contexte est refusé : aucune tâche n'est servie", () => {
    monde = monter();
    for (const vide of ["", "   ", "\t"]) expect(() => monde?.contexte(vide)).toThrow(PseudonymeVide);
  });

  it("la commande sort en erreur et nomme PseudonymeVide", () => {
    monde = monter();
    const resultat = lancer(monde.repertoire_run, "   ", monde.items);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("PseudonymeVide");
  });

  it("un pseudonyme absent de l'environnement, ou hors du schéma, est refusé aussi", () => {
    monde = monter();
    const absent = lancer(monde.repertoire_run, undefined, monde.items);
    expect(absent.status).toBe(2);
    expect(absent.erreur).toContain("ANNOTATEUR_ID n'est pas défini");
    const invalide = lancer(monde.repertoire_run, "Pas Valide", monde.items);
    expect(invalide.status).toBe(2);
    expect(invalide.erreur).toContain("ErreurSchema");
  });
});

describe("10. répertoire de run absent ou illisible", () => {
  it("répertoire absent : code non nul, l'erreur est nommée", () => {
    monde = monter();
    const resultat = lancer(join(monde.bac, "runs", "2026-12-02"), "a1", monde.items);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("RepertoireDeRunIllisible");
  });

  it("répertoire sans run.json : même erreur", () => {
    monde = monter();
    const vide = join(monde.bac, "runs", "vide");
    mkdirSync(vide, { recursive: true });
    const resultat = lancer(vide, "a1", monde.items);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("RepertoireDeRunIllisible");
  });

  it("run.json illisible : code non nul, l'erreur est nommée", () => {
    monde = monter();
    writeFileSync(join(monde.repertoire_run, "run.json"), "{ pas du json", "utf8");
    const resultat = lancer(monde.repertoire_run, "a1", monde.items);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("FichierDeRunRefuse");
  });

  it("volume absent : code non nul, il faut le reconstituer", () => {
    monde = monter();
    rmSync(join(monde.repertoire_run, "volume"), { recursive: true });
    const resultat = lancer(monde.repertoire_run, "a1", monde.items);
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("VolumeAbsent");
  });

  it("option inconnue : code non nul, usage rappelé", () => {
    monde = monter();
    const resultat = executerOutil("notation-humaine.ts", [monde.repertoire_run, "--inconnue"], { ...process.env, ANNOTATEUR_ID: "a1" });
    expect(resultat.status).toBe(2);
    expect(resultat.erreur).toContain("option(s) inconnue(s)");
  });
});

describe("le serveur local", () => {
  it("n'écoute que sur 127.0.0.1, sans origine externe", () => {
    const code = readFileSync(join(RACINE_PROJET, "notation-humaine/serveur/principal.ts"), "utf8")
      .split("\n")
      .filter((ligne) => !/^\s*(\*|\/\/|\/\*)/.test(ligne))
      .join("\n");
    expect(ADRESSE).toBe("127.0.0.1");
    expect(code).toContain("serveur.listen(options.port, ADRESSE");
    expect(code).not.toContain("0.0.0.0");
    // La politique de sécurité n'est plus recopiée : une seule définition, dans le module
    // partagé (constat 20 de la revue du 2026-10-12, D55 (8)). `tests/serveur-http.test.ts`
    // vérifie à l'exécution que les deux serveurs servent le même en-tête.
    const partagee = readFileSync(join(RACINE_PROJET, "validation/serveur/http.ts"), "utf8");
    for (const directive of POLITIQUE_SECURITE.split("; ")) expect(partagee).toContain(`"${directive}"`);
  });

  it("le client ne référence aucune URL externe", () => {
    for (const fichier of ["index.html", "style.css", "app.ts", "api.ts", "dom.ts", "affichage.ts", "formulaire.ts", "types.ts"]) {
      const contenu = readFileSync(join(RACINE_PROJET, "notation-humaine/client", fichier), "utf8");
      const urls = contenu.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      expect(urls, `${fichier} référence ${urls.join(", ")}`).toEqual([]);
    }
  });

  it("sert l'API et les fichiers statiques, avec la politique de sécurité", async () => {
    monde = monter();
    const serveur = creerServeur(monde.contexte("a1"));
    await new Promise<void>((resolu) => serveur.listen(0, ADRESSE, resolu));
    try {
      const base = `http://${ADRESSE}:${(serveur.address() as AddressInfo).port}`;
      const session = await fetch(`${base}/api/session`);
      expect(session.status).toBe(200);
      expect(session.headers.get("content-security-policy")).toBe(POLITIQUE_SECURITE);
      expect(((await session.json()) as { annotateur_id: string }).annotateur_id).toBe("a1");
      const page = await fetch(`${base}/`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("Notation humaine");
      expect((await fetch(`${base}/inconnu.js`)).status).toBe(404);
      expect((await fetch(`${base}/../../package.json`)).status).toBe(404);
      const illisible = await fetch(`${base}/api/notations`, { method: "POST", body: "{ pas du json" });
      expect(illisible.status).toBe(400);
      expect(((await illisible.json()) as { erreur: string }).erreur).toBe("CorpsIllisible");
    } finally {
      await new Promise<void>((resolu) => serveur.close(() => resolu()));
    }
  });
});
