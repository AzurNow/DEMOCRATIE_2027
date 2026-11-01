/**
 * Constat 14 du 2026-10-12 : une panne réseau, une réponse non 2xx ou un JSON illisible ne sont
 * jamais avalées. L'API du client les nomme ; `messagesDErreur` les dit en clair, pour l'écran.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { api, EchecApi, PanneReseau, ReponseIllisible } from "../../notation-humaine/client/api.ts";
import { messagesDErreur } from "../../notation-humaine/client/erreurs.ts";

function reponse(statut: number, texte: string): Response {
  return new Response(texte, { status: statut });
}

afterEach(() => vi.unstubAllGlobals());

describe("api du client de notation humaine : pannes nommées", () => {
  it("fetch rejeté (réseau) : PanneReseau, qui garde la cause", async () => {
    const cause = new TypeError("Failed to fetch");
    vi.stubGlobal("fetch", () => Promise.reject(cause));
    const echec = await api.file().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(PanneReseau);
    expect((echec as PanneReseau).cause).toBe(cause);
  });

  it("corps non JSON : ReponseIllisible, avec le statut", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reponse(200, "<html>")));
    const echec = await api.file().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(ReponseIllisible);
    expect((echec as ReponseIllisible).statut).toBe(200);
  });

  it("réponse 500 : EchecApi portant le statut", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(reponse(500, "")));
    const echec = await api.file().catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(EchecApi);
    expect((echec as EchecApi).statut).toBe(500);
  });
});

describe("messagesDErreur", () => {
  it("panne réseau : un message qui le dit", () => {
    const messages = messagesDErreur(new PanneReseau(new TypeError("Failed to fetch")));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("réseau");
  });

  it("réponse 500 sans corps : le statut est dit", () => {
    expect(messagesDErreur(new EchecApi(500, null))).toEqual(["Échec HTTP 500."]);
  });

  it("réponse 400 {erreur, detail} : le détail est affiché", () => {
    const messages = messagesDErreur(new EchecApi(400, { erreur: "saisie_invalide", detail: "saisie.cite manquant" }));
    expect(messages).toEqual(["saisie_invalide — saisie.cite manquant"]);
  });

  it("refus de grille : un message par motif", () => {
    const corps = {
      motifs: [
        { code: "a", detail: "x" },
        { code: "b", detail: "y" },
      ],
    };
    expect(messagesDErreur(new EchecApi(400, corps))).toEqual(["a — x", "b — y"]);
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
