/**
 * Lot V3-4 : dans le client de validation, aucune promesse rejetée ne disparaît sans message.
 * L'API nomme les pannes ; `messagesDErreur` les dit en clair ; `lancerAvec` est l'unique point
 * par où passe une promesse lancée sans attente. Tout cela est pur : aucun DOM.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, EchecApi, PanneReseau, ReponseIllisible } from "../../validation/client/api.ts";
import { lancerAvec, messagesDErreur } from "../../validation/client/erreurs.ts";

function reponse(statut: number, texte: string): Response {
  return new Response(texte, { status: statut });
}

afterEach(() => vi.unstubAllGlobals());

describe("api du client de validation : pannes nommées", () => {
  it("fetch rejeté (réseau) : PanneReseau, qui garde la cause", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", () => Promise.reject(cause));
    const echec = await api.session().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(PanneReseau);
    expect((echec as PanneReseau).cause).toBe(cause);
  });

  it("corps non JSON : ReponseIllisible, avec le statut", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reponse(200, "<html>")));
    const echec = await api.session().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ReponseIllisible);
    expect((echec as ReponseIllisible).statut).toBe(200);
  });

  it("réponse 500 sans corps : EchecApi portant le statut", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reponse(500, "")));
    const echec = await api.session().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(EchecApi);
    expect((echec as EchecApi).statut).toBe(500);
  });
});

describe("messagesDErreur", () => {
  it("panne réseau : un message qui le dit", () => {
    const messages = messagesDErreur(new PanneReseau(new TypeError("Failed to fetch")));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("réseau");
    expect(messages[0]).toContain("Failed to fetch");
  });

  it("réponse 500 sans corps : le statut est dit", () => {
    expect(messagesDErreur(new EchecApi(500, null))).toEqual(["Échec HTTP 500."]);
  });

  it("réponse 400 {erreur, detail} : le détail du serveur est affiché", () => {
    const messages = messagesDErreur(new EchecApi(400, { erreur: "decision_invalide", detail: "item_id manquant" }));
    expect(messages).toEqual(["decision_invalide — item_id manquant"]);
  });

  it("réponse 409 {erreur} seule : le texte du serveur, pas un message générique", () => {
    expect(messagesDErreur(new EchecApi(409, { ok: false, erreur: "Aucune décision à annuler dans ce lot." }))).toEqual([
      "Aucune décision à annuler dans ce lot.",
    ]);
  });

  it("correction refusée (422 {refus}) : le refus est dit en entier", () => {
    const messages = messagesDErreur(new EchecApi(422, { ok: false, refus: [{ champ: "cite", motif: "hors source" }] }));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("Correction refusée");
    expect(messages[0]).toContain("hors source");
  });

  it("décision incomplète (422 {manquements}) : les manquements sont dits", () => {
    const messages = messagesDErreur(new EchecApi(422, { ok: false, manquements: ["q3", "q5"] }));
    expect(messages[0]).toContain("Décision incomplète");
    expect(messages[0]).toContain("q3");
    expect(messages[0]).toContain("q5");
  });

  it("corps sans champ connu : le corps est montré tel quel, avec le statut", () => {
    const messages = messagesDErreur(new EchecApi(418, { autre: 1 }));
    expect(messages[0]).toContain("418");
    expect(messages[0]).toContain('"autre":1');
  });

  it("JSON illisible : le message dit le statut", () => {
    const messages = messagesDErreur(new ReponseIllisible(200, new SyntaxError("Unexpected token")));
    expect(messages[0]).toContain("illisible");
    expect(messages[0]).toContain("200");
  });

  it("erreur inattendue : son message, jamais un défaut", () => {
    expect(messagesDErreur(new Error("boum"))).toEqual(["Erreur inattendue : boum"]);
    expect(messagesDErreur("texte")).toEqual(["Erreur inattendue : texte"]);
  });
});

describe("lancerAvec : le point unique des promesses lancées sans attente", () => {
  it("promesse rejetée : l'erreur est affichée, avec son détail", async () => {
    const affiche: (readonly string[])[] = [];
    await lancerAvec((m) => affiche.push(m), Promise.reject(new EchecApi(500, null)));
    expect(affiche).toEqual([["Échec HTTP 500."]]);
  });

  it("préfixe de contexte (brouillon) : ajouté devant chaque message", async () => {
    const affiche: (readonly string[])[] = [];
    await lancerAvec((m) => affiche.push(m), Promise.reject(new PanneReseau(new Error("x"))), "Brouillon non enregistré");
    expect(affiche).toHaveLength(1);
    expect(affiche[0]?.[0]).toMatch(/^Brouillon non enregistré : Panne réseau/);
  });

  it("promesse tenue : rien n'est affiché", async () => {
    const affiche: (readonly string[])[] = [];
    await lancerAvec((m) => affiche.push(m), Promise.resolve(null));
    expect(affiche).toEqual([]);
  });

  it("le brouillon ne se retente pas : un seul appel réseau par échec", async () => {
    const appels = vi.fn(() => Promise.reject(new TypeError("Failed to fetch")));
    vi.stubGlobal("fetch", appels);
    const affiche: (readonly string[])[] = [];
    await lancerAvec((m) => affiche.push(m), api.ecrireBrouillon({} as never), "Brouillon non enregistré");
    expect(appels).toHaveBeenCalledTimes(1);
    expect(affiche).toHaveLength(1);
  });
});

describe("aucune promesse lancée sans gestion dans les clients de validation", () => {
  const racine = join(import.meta.dirname, "..", "..", "validation", "client");

  for (const fichier of ["app.ts", "formulations.ts"]) {
    it(`${fichier} : tout « void appel() » passe par lancer(...), jamais de .then( ni de catch vide`, () => {
      const source = readFileSync(join(racine, fichier), "utf8");
      const nus = source.match(/\bvoid\s+(?!lancer\()[A-Za-z_][\w.]*\(/g) ?? [];
      expect(nus, `${fichier} lance sans gestion : ${nus.join(", ")}`).toEqual([]);
      expect(source).not.toMatch(/\.then\(/);
      expect(source).not.toMatch(/catch\s*(\([^)]*\))?\s*\{\s*\}/);
    });
  }

  it("app.ts n'a plus de catch sans variable (message générique qui remplace le détail)", () => {
    expect(readFileSync(join(racine, "app.ts"), "utf8")).not.toMatch(/catch\s*\{/);
  });
});
