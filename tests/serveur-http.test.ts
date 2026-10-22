/**
 * La plomberie HTTP partagée entre `pnpm validate` et `pnpm notation:humaine`
 * (`validation/serveur/http.ts`, D55 (8), revue du 2026-10-12 constat 20) : un corps JSON illisible
 * répond 400 des deux côtés, une erreur inattendue masque son message et sa pile au navigateur
 * (D18), un paramètre de route mal encodé répond 400 nommé plutôt que de remonter en 500, et les
 * deux serveurs servent le même en-tête `content-security-policy`, tiré du même module.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { creerServeur as creerServeurNotation, ADRESSE } from "../notation-humaine/serveur/principal.ts";
import { creerServeur as creerServeurValidation } from "../validation/serveur/principal.ts";
import { POLITIQUE_SECURITE, servirStatique } from "../validation/serveur/http.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemO, itemP, source } from "./aides/fabriques.ts";
import { monter, type Monde } from "./notation-humaine/fixture.ts";
import { VERSION_VUE_ANNOTATEUR } from "../pipeline/notation/vue-annotateur.ts";

let bac: Bac | null = null;
let monde: Monde | null = null;
let serveurs: Server[] = [];

afterEach(async () => {
  for (const serveur of serveurs) await new Promise<void>((resolu) => serveur.close(() => resolu()));
  serveurs = [];
  bac?.detruire();
  bac = null;
  monde?.nettoyer();
  monde = null;
});

async function ecouter(serveur: Server): Promise<string> {
  await new Promise<void>((resolu) => serveur.listen(0, ADRESSE, resolu));
  serveurs.push(serveur);
  return `http://${ADRESSE}:${(serveur.address() as AddressInfo).port}`;
}

function bacAvecLot(
  lot_id: string,
  item: Item = itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" }),
): { bac: Bac; item: Item } {
  const b = creerBac();
  b.ecrireItem(item);
  b.ecrireMesure(mesurePour(item));
  b.ecrireLot(lotDe(lot_id, [item]));
  return { bac: b, item };
}

describe("JSON illisible dans un POST (D55 (8))", () => {
  it("la validation répond 400, comme la notation, au lieu de 500", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/decisions`, { method: "POST", body: "{ pas du json" });
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("CorpsIllisible");
  });
});

describe("erreur inattendue : seul le nom sort, message et chemin restent au serveur (D18, D55 (8))", () => {
  it("une LigneAlteree du journal de l'autre annotateur ne nomme ni son message ni son chemin au navigateur", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    bac.journal("a2").ajouter("lot-001", decision({ annotateur_id: "a2", item: posee.item, decision: "accepter", lot_id: "lot-001" }));
    const chemin = bac.journal("a2").chemin("lot-001");
    const entree = JSON.parse(readFileSync(chemin, "utf8").trim()) as Record<string, unknown>;
    writeFileSync(chemin, `${JSON.stringify({ ...entree, decision: "rejeter" })}\n`, "utf8");

    const espion = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
      const reponse = await fetch(`${base}/api/lots/lot-001/diagnostic`);
      expect(reponse.status).toBe(500);
      const corps = (await reponse.json()) as { erreur: string; detail: string };
      expect(corps.erreur).toBe("LigneAlteree");
      expect(corps.detail).toBe("Voir la console du serveur.");
      const serialise = JSON.stringify(corps);
      expect(serialise).not.toContain("a2");
      expect(serialise).not.toContain(chemin);

      const ecrit = espion.mock.calls.map((appel) => String(appel[0])).join("");
      expect(ecrit).toContain(chemin);
      expect(ecrit).toContain("a2");
    } finally {
      espion.mockRestore();
    }
  });
});

describe("paramètre de route mal encodé (D55 (8))", () => {
  it("la validation répond 400 nommé, pas un URIError en 500", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/lots/%E0%A4%A`);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("ParametreMalEncode");
  });

  it("la notation répond 400 nommé par la même fonction", async () => {
    monde = monter();
    const base = await ecouter(creerServeurNotation(monde.contexte("a1")));
    const reponse = await fetch(`${base}/api/vue/%E0%A4%A`);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreur: string };
    expect(corps.erreur).toBe("ParametreMalEncode");
  });

  it("un paramètre pourcent-encodé valide est décodé avant d'atteindre le gestionnaire", async () => {
    const posee = bacAvecLot("lot-aa");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/lots/lot%2Daa`);
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { lot: { lot_id: string } };
    expect(corps.lot.lot_id).toBe("lot-aa");
  });

  it("le pendant côté notation : un paramètre pourcent-encodé valide atteint le gestionnaire décodé", async () => {
    monde = monter();
    const id = monde.dans.id;
    const premier = id[0] as string;
    const encode = `%${premier.charCodeAt(0).toString(16).padStart(2, "0")}${id.slice(1)}`;
    expect(encode).not.toBe(id);
    const base = await ecouter(creerServeurNotation(monde.contexte("a1")));
    const reponse = await fetch(`${base}/api/vue/${encode}`);
    expect(reponse.status).toBe(200);
    const corps = (await reponse.json()) as { version_vue: string };
    expect(corps.version_vue).toBe(VERSION_VUE_ANNOTATEUR);
  });
});

describe("une seule politique de sécurité pour les deux serveurs (constat 20, D55 (8))", () => {
  it("validation et notation servent le même en-tête content-security-policy", async () => {
    bac = creerBac();
    monde = monter();
    const baseValidation = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const baseNotation = await ecouter(creerServeurNotation(monde.contexte("a1")));
    const reponseValidation = await fetch(`${baseValidation}/api/session`);
    const reponseNotation = await fetch(`${baseNotation}/api/session`);
    expect(reponseValidation.headers.get("content-security-policy")).toBe(POLITIQUE_SECURITE);
    expect(reponseNotation.headers.get("content-security-policy")).toBe(POLITIQUE_SECURITE);
  });

  it("un 204 de la validation (brouillon) reste sans corps ni content-type", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await fetch(`${base}/api/brouillon`, {
      method: "POST",
      body: JSON.stringify({ lot_id: "lot-001", item_id: "x", duree_affichage_ms: 1, duree_active_ms: 1 }),
    });
    expect(reponse.status).toBe(204);
    expect(reponse.headers.get("content-type")).toBeNull();
    expect(await reponse.text()).toBe("");
  });
});

describe("corps des POST contrôlé avant écriture (revue du 2026-10-12, constat 12, Lot 8d)", () => {
  async function poster(base: string, chemin: string, corps: unknown): Promise<Response> {
    return fetch(`${base}${chemin}`, { method: "POST", body: JSON.stringify(corps) });
  }

  it("(a) un corps vide répond 400 avec la liste des champs en cause, pas 500", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", null);
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { ok: boolean; erreurs: string[] };
    expect(corps.ok).toBe(false);
    expect(corps.erreurs.length).toBeGreaterThan(0);
    expect(corps.erreurs[0]).toContain("objet JSON");
  });

  it("(b) lot_id absent répond 400, jamais « Lot inconnu »", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1,
      duree_active_ms: 1,
    });
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreurs: string[] };
    expect(corps.erreurs.some((e) => e.includes("lot_id"))).toBe(true);
    expect(JSON.stringify(corps)).not.toContain("Lot inconnu");
  });

  it("(c) lot_id avec remontée de répertoire (../…) répond 400, rien n'est lu hors de validation/lots", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const cheminSecret = join(bac.racine, "validation", "secret.json");
    writeFileSync(
      cheminSecret,
      JSON.stringify({
        lot_id: "secret-fuite",
        nature: "reel",
        graine_maitresse: "g",
        algorithme_ordre: "ordre-annotateur-v1",
        date_creation: "2026-01-01T00:00:00+01:00",
        annotateurs: ["a1", "a2"],
        items: [],
      }),
      "utf8",
    );
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      lot_id: "../secret",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1,
      duree_active_ms: 1,
    });
    expect(reponse.status).toBe(400);
    const texte = await reponse.text();
    expect(texte).not.toContain("secret-fuite");
    expect(existsSync(cheminSecret)).toBe(true);
  });

  it("(c bis) lot_id absolu ou à séparateur Windows répond 400 lui aussi", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    for (const lot_id of ["/etc/passwd", "a\\b"]) {
      const reponse = await poster(base, "/api/decisions", {
        lot_id,
        item_id: posee.item.id,
        decision: "accepter",
        reponses_grille: GRILLE_TOUT_VRAI,
        corrections: [],
        duree_affichage_ms: 1,
        duree_active_ms: 1,
      });
      expect(reponse.status, `lot_id ${lot_id}`).toBe(400);
    }
  });

  it("(d) un champ de mauvais type (reponses_grille: null) répond 400, pas une TypeError en 500", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      lot_id: "lot-001",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: null,
      corrections: [],
      duree_affichage_ms: 1,
      duree_active_ms: 1,
    });
    expect(reponse.status).toBe(400);
    const corps = (await reponse.json()) as { erreurs: string[] };
    expect(corps.erreurs.some((e) => e.includes("reponses_grille"))).toBe(true);
  });

  it("(d bis) l'annulation refuse elle aussi un lot_id invalide, 400 et non 404", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/annulations", { lot_id: "../x" });
    expect(reponse.status).toBe(400);
  });

  it("(e) un brouillon à durée non numérique répond 400, rien n'est écrit", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/brouillon", {
      lot_id: "lot-001",
      item_id: "x",
      duree_affichage_ms: "pas un nombre",
      duree_active_ms: 1,
    });
    expect(reponse.status).toBe(400);
    const chemin = join(bac.racine, "validation/brouillons", "a1.json");
    expect(existsSync(chemin)).toBe(false);
  });

  it("(e bis) un brouillon à durée négative répond 400, rien n'est écrit", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/brouillon", {
      lot_id: "lot-001",
      item_id: "x",
      duree_affichage_ms: -1,
      duree_active_ms: 1,
    });
    expect(reponse.status).toBe(400);
    const chemin = join(bac.racine, "validation/brouillons", "a1.json");
    expect(existsSync(chemin)).toBe(false);
  });

  it("(f) un brouillon déjà mal formé sur disque est ignoré à la lecture, sans être supprimé", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const chemin = join(bac.racine, "validation/brouillons", "a1.json");
    mkdirSync(join(bac.racine, "validation/brouillons"), { recursive: true });
    const brouillonMalForme = JSON.stringify({
      lot_id: "lot-001",
      item_id: posee.item.id,
      duree_affichage_ms: "pas un nombre",
      duree_active_ms: 1,
    });
    writeFileSync(chemin, `${brouillonMalForme}\n`, "utf8");

    const espion = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
      const lecture = await fetch(`${base}/api/brouillon`);
      expect(lecture.status).toBe(200);
      expect(await lecture.json()).toBeNull();

      const vue = await fetch(`${base}/api/lots/lot-001/items/${posee.item.id}`);
      expect(vue.status).toBe(200);
      const corpsVue = (await vue.json()) as { brouillon: unknown };
      expect(corpsVue.brouillon).toBeNull();

      const ecrit = espion.mock.calls.map((appel) => String(appel[0])).join("");
      expect(ecrit).toContain(chemin);
    } finally {
      espion.mockRestore();
    }
    // Le fichier n'est jamais supprimé automatiquement : il reste la preuve de ce qui a été écrit.
    expect(existsSync(chemin)).toBe(true);
    expect(readFileSync(chemin, "utf8")).toBe(`${brouillonMalForme}\n`);
  });

  it("(g) le chemin nominal des décisions, annulations et brouillons reste inchangé", async () => {
    const posee = bacAvecLot("lot-001");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));

    const brouillon = await poster(base, "/api/brouillon", {
      lot_id: "lot-001",
      item_id: posee.item.id,
      duree_affichage_ms: 10,
      duree_active_ms: 9,
    });
    expect(brouillon.status).toBe(204);

    const decisionReponse = await poster(base, "/api/decisions", {
      lot_id: "lot-001",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(decisionReponse.status).toBe(201);

    const annulationReponse = await poster(base, "/api/annulations", { lot_id: "lot-001" });
    expect(annulationReponse.status).toBe(201);
  });

  /**
   * Le chemin nominal du vrai client n'était pas prouvé : `api.decider(charge: unknown)`
   * (`validation/client/api.ts`) n'était pas typé, et seule `charge` construite littéralement
   * dans les tests ci-dessus passait. Ces corps reproduisent exactement ceux que construisent
   * `app.ts:soumettre()`, `app.ts:enregistrerBrouillon()` et `api.ts:annuler()`, pour prouver
   * que le lecteur les accepte réellement (relecture Lot 8d).
   */
  it("(h) le corps exact de soumettre() pour un item non-O, grille avec des null", async () => {
    const itemSansQuantification = itemP({
      assertion: {
        position: "pour",
        paraphrase: "Ramener la TVA sur les produits énergétiques de 20 % à 5,5 %.",
        citation_verbatim: "Nous ramènerons la TVA sur l'énergie à 5,5 %.",
        source: source(),
      },
    });
    const posee = bacAvecLot("lot-h", itemSansQuantification);
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      lot_id: "lot-h",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: {
        citation_fidele: true,
        paraphrase_exacte: true,
        position_univoque: true,
        theme_correct: true,
        quantification_correcte: null,
      },
      questions_specifiques: {},
      corrections: [],
      commentaire: null,
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.status).toBe(201);
  });

  it("(i) le corps exact pour un item O (reponses_par_etat), grilles avec des null", async () => {
    const posee = bacAvecLot("lot-i", itemO());
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      lot_id: "lot-i",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_par_etat: {
        anterieur: {
          citation_fidele: true,
          paraphrase_exacte: true,
          position_univoque: true,
          theme_correct: null,
          quantification_correcte: null,
        },
        posterieur: {
          citation_fidele: true,
          paraphrase_exacte: true,
          position_univoque: true,
          theme_correct: true,
          quantification_correcte: null,
        },
      },
      questions_specifiques: { changement_explicite: true, transcription_ecoutee: true },
      corrections: [],
      commentaire: null,
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.status).toBe(201);
  });

  it('(j) le corps exact d\'une correction au format du client (decision: "corriger")', async () => {
    const posee = bacAvecLot("lot-j");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/decisions", {
      lot_id: "lot-j",
      item_id: posee.item.id,
      decision: "corriger",
      reponses_grille: GRILLE_TOUT_VRAI,
      questions_specifiques: {},
      corrections: [
        {
          cible: "item",
          chemin: "/assertion/paraphrase",
          ancienne_valeur: "Ramener la TVA sur les produits énergétiques de 20 % à 5,5 %.",
          nouvelle_valeur: "Ramener la TVA sur l'énergie de 20 % à 5,5 %.",
        },
      ],
      commentaire: null,
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.status).toBe(201);
  });

  it("(k) le brouillon exact tel qu'écrit par enregistrerBrouillon()", async () => {
    bac = creerBac();
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const reponse = await poster(base, "/api/brouillon", {
      lot_id: "lot-001",
      item_id: "x",
      reponses: { citation_fidele: true },
      reponses_par_etat: { anterieur: {}, posterieur: {} },
      questions_specifiques: {},
      commentaire: "",
      duree_affichage_ms: 10,
      duree_active_ms: 9,
    });
    expect(reponse.status).toBe(204);
  });

  it("(l) l'annulation exacte envoyée par api.annuler() ({ lot_id })", async () => {
    const posee = bacAvecLot("lot-l");
    bac = posee.bac;
    const base = await ecouter(creerServeurValidation(bac.contexte("a1"), bac.racine));
    const decisionReponse = await poster(base, "/api/decisions", {
      lot_id: "lot-l",
      item_id: posee.item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(decisionReponse.status).toBe(201);

    const reponse = await poster(base, "/api/annulations", { lot_id: "lot-l" });
    expect(reponse.status).toBe(201);
  });
});

describe("servirStatique confiné au dossier du client (relecture D55 (8))", () => {
  let racine: string | null = null;

  afterEach(() => {
    if (racine !== null) rmSync(racine, { recursive: true, force: true });
    racine = null;
  });

  function poserDossiers(): { client: string } {
    racine = mkdtempSync(join(tmpdir(), "banc-statique-"));
    const client = join(racine, "client");
    mkdirSync(join(client, "sous"), { recursive: true });
    writeFileSync(join(client, "index.html"), "<p>accueil</p>", "utf8");
    writeFileSync(join(client, "app.js"), "// app", "utf8");
    writeFileSync(join(client, "sous", "feuille.css"), "body{}", "utf8");
    const voisin = join(racine, "client-autre");
    mkdirSync(voisin, { recursive: true });
    writeFileSync(join(voisin, "secret.txt"), "secret", "utf8");
    return { client };
  }

  it("un dossier voisin dont le nom commence pareil (« client-autre ») n'est pas servi", () => {
    const { client } = poserDossiers();
    const resultat = servirStatique(client, "/../client-autre/secret.txt");
    expect(resultat.statut).toBe(404);
  });

  it("l'accueil, un script et un fichier de sous-dossier légitimes restent servis", () => {
    const { client } = poserDossiers();
    expect(servirStatique(client, "/").statut).toBe(200);
    expect(servirStatique(client, "/app.js").statut).toBe(200);
    expect(servirStatique(client, "/sous/feuille.css").statut).toBe(200);
  });
});
