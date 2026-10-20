/**
 * Cas limites 1 à 9 du brief : l'exécution d'une requête contre l'éditeur simulé, en temps virtuel.
 * Chaque `describe` porte le numéro du cas.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { CORPS_REFUS_LISTE, LATENCE_SIMULEE_MS } from "../../pipeline/interrogation/editeur-simule.ts";
import { RunHorsFenetre } from "../../pipeline/interrogation/executer.ts";
import { messageAttenteOperateur } from "../../pipeline/interrogation/operateur.ts";
import { empreinteOctets, MESSAGE_TIMEOUT } from "../../pipeline/interrogation/tentatives.ts";
import type { ReponseManquante, ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { canoniser, empreinteDe } from "../../validation/domaine/empreinte.ts";
import {
  banc,
  CLE_API,
  FENETRE,
  instantsRelatifs,
  issue,
  plan,
  requete,
  scenarioScripte,
  seule,
  transportDe,
  type Banc,
} from "./aides.ts";

const L = LATENCE_SIMULEE_MS;
const TEXTE_REPONSE = texteDe("reponse");

function texteDe(nom: string): string {
  const attendue = issue(nom);
  if (attendue.genre !== "reponse") throw new Error(`${nom} n'est pas une réponse`);
  return attendue.texte;
}
let courant: Banc | null = null;

function nouveauBanc(depart_ms?: number): Banc {
  courant = banc(depart_ms);
  return courant;
}

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

function obtenue(b: Banc): ReponseObtenue {
  const reponse = seule(b.lues());
  if (reponse.statut_reponse !== "obtenue") throw new Error(`réponse ${reponse.statut_reponse}, obtenue attendue`);
  return reponse;
}

function manquante(b: Banc): ReponseManquante {
  const reponse = seule(b.lues());
  if (reponse.statut_reponse !== "manquante") throw new Error(`réponse ${reponse.statut_reponse}, manquante attendue`);
  return reponse;
}

async function uneRequete(b: Banc, issues: readonly string[]): Promise<void> {
  b.editeur("outil-alpha", scenarioScripte(issues));
  await b.executer(plan(requete()));
}

describe("cas 1 : succès", () => {
  it("cas 1a : succès à la première tentative, sans tentative conservée", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["reponse"]);
    const reponse = obtenue(b);
    expect(reponse.tentatives).toBeUndefined();
    expect(reponse.normalise.refus_api).toBe(false);
    expect(reponse.normalise.texte).toBe(TEXTE_REPONSE);
    expect(transportDe(b).interne.recues).toHaveLength(1);
  });

  it("cas 1b : succès à la troisième après deux erreurs, les deux tentatives en échec conservées", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["http_503", "reseau", "reponse"]);
    const reponse = obtenue(b);
    expect(reponse.tentatives?.map((t) => [t.numero, t.erreur.type])).toEqual([
      [1, "http"],
      [2, "reseau"],
    ]);
    expect(reponse.tentatives?.[0]?.erreur.code_http).toBe(503);
    expect(reponse.requete.horodatage).toBe(reponse.tentatives?.[0]?.horodatage);
    expect(transportDe(b).interne.recues).toHaveLength(3);
  });
});

describe("cas 2 : trois échecs", () => {
  it("donnent une manquante, motif « echecs », 3 tentatives, ni brut ni normalise", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["http_503", "quota", "reseau"]);
    const reponse = manquante(b);
    expect(reponse.motif_manquante).toBe("echecs");
    expect(reponse.tentatives.map((t) => [t.numero, t.erreur.type])).toEqual([
      [1, "http"],
      [2, "quota"],
      [3, "reseau"],
    ]);
    expect(Object.keys(reponse)).not.toContain("brut");
    expect(Object.keys(reponse)).not.toContain("normalise");
    expect(Object.keys(reponse)).not.toContain("brut_sha256");
    expect(transportDe(b).interne.recues).toHaveLength(3);
  });
});

describe("cas 3 : délais", () => {
  it("attend exactement 30 s avant la deuxième tentative, puis 120 s avant la troisième", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["http_503", "http_503", "http_503"]);
    expect(instantsRelatifs(b)).toEqual([0, L + 30_000, L + 30_000 + L + 120_000]);
  });

  it("abandonne une tentative au bout de 180 s, classée « timeout », et attend 30 s depuis l'abandon", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["lent", "reponse"]);
    const reponse = obtenue(b);
    expect(reponse.tentatives).toEqual([
      { numero: 1, horodatage: "2026-12-01T06:00:00.000+01:00", erreur: { type: "timeout", message: MESSAGE_TIMEOUT } },
    ]);
    expect(instantsRelatifs(b)).toEqual([0, 180_000 + 30_000]);
  });
});

describe("cas 4 : refus de modération de l'API", () => {
  it("est une réponse obtenue, refus_api true, une seule tentative, brut = corps d'erreur tel que reçu", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["refus"]);
    const reponse = obtenue(b);
    expect(reponse.normalise).toEqual({ texte: "", liens: [], troncature: false, refus_api: true });
    expect(reponse.tentatives).toBeUndefined();
    expect(transportDe(b).interne.recues).toHaveLength(1);
    const recu = seule(transportDe(b).rendues);
    const texteRecu = new TextDecoder().decode(recu.corps);
    expect(recu.statut).toBe(400);
    expect(canoniser(reponse.brut)).toBe(canoniser(JSON.parse(texteRecu)));
    expect(reponse.brut_sha256).toBe(empreinteDe(JSON.parse(texteRecu)));
    expect(reponse.brut_octets_sha256).toBe(empreinteOctets(recu.corps));
  });

  it("n'est pas retenté, même s'il reste deux tentatives", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["refus", "reponse"]);
    expect(obtenue(b).normalise.refus_api).toBe(true);
    expect(transportDe(b).interne.recues).toHaveLength(1);
  });

});

describe("corps qui ne sont pas des objets JSON (décisions de l'auteur du 2026-10-02)", () => {
  it("refus texte stocké en brut_texte et non retenté, y compris après relance", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["refus_texte", "reponse"]));
    await b.executer(plan(requete()));
    const reponse = obtenue(b);
    expect(reponse.brut_texte).toBe(CORPS_REFUS_LISTE);
    expect(Object.keys(reponse)).not.toContain("brut");
    expect(Object.keys(reponse)).not.toContain("brut_sha256");
    expect(reponse.brut_octets_sha256).toBe(empreinteOctets(new TextEncoder().encode(CORPS_REFUS_LISTE)));
    expect(reponse.normalise).toEqual({ texte: "", liens: [], troncature: false, refus_api: true });
    expect(reponse.tentatives).toBeUndefined();
    expect(transportDe(b).interne.recues).toHaveLength(1);

    // Relance sur le même répertoire : la réponse est écrite, rien n'est renvoyé.
    const suite = banc(undefined, b.racine);
    courant = suite;
    suite.editeur("outil-alpha", scenarioScripte([]));
    expect(await suite.executer(plan(requete()))).toEqual({ ecrites: 0, deja_ecrites: 1, en_attente_operateur: [] });
    expect(transportDe(suite).interne.recues).toHaveLength(0);
  });

  it("2xx texte : réponse obtenue, brut_texte tel que reçu, normalisée par l'adaptateur", async () => {
    const b = nouveauBanc();
    const corps = "Réponse en texte brut, sans JSON.\n";
    b.editeur("outil-alpha", () => ({ genre: "corps", statut: 200, corps }));
    await b.executer(plan(requete()));
    const reponse = obtenue(b);
    expect(reponse.brut_texte).toBe(corps);
    expect(reponse.normalise).toEqual({ texte: corps, liens: [], troncature: false, refus_api: false });
    expect(reponse.metadonnees.modele_renvoye).toBeNull();
    expect(reponse.metadonnees.stop_reason).toBeNull();
  });

  it("corps non UTF-8 : octets gardés sous volume/, événement recue_non_stockee, en attente de l'opérateur (§6, D55 (5))", async () => {
    const b = nouveauBanc();
    const corps = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    b.editeur("outil-alpha", () => ({ genre: "corps", statut: 200, corps }));
    const bilan = await b.executer(plan(requete()));
    expect(bilan.ecrites).toBe(0);
    expect(bilan.deja_ecrites).toBe(0);
    expect(bilan.en_attente_operateur).toHaveLength(1);
    const [attente] = bilan.en_attente_operateur;
    expect(attente?.numero).toBe(1);
    expect(attente?.cause).toContain("UTF-8");
    expect(Array.from(readFileSync(attente?.chemin_octets as string))).toEqual(Array.from(corps));
    expect(b.lues()).toHaveLength(0);
    expect(transportDe(b).interne.recues).toHaveLength(1);
  });

  it("brut_octets_sha256 diffère de brut_sha256 sur un corps à gros entier et clés réordonnées, et égale le SHA-256 des octets envoyés", async () => {
    const b = nouveauBanc();
    const corps =
      '{"stop_reason":"end_turn","id":12345678901234567890,' +
      '"content":[{"type":"text","text":"Simulé."}], "model":"modele-simule-2026-12"}';
    b.editeur("outil-alpha", () => ({ genre: "corps", statut: 200, corps }));
    await b.executer(plan(requete()));
    const reponse = obtenue(b);
    const octetsEnvoyes = seule(transportDe(b).rendues).corps;
    expect(reponse.brut_octets_sha256).toBe(empreinteOctets(octetsEnvoyes));
    expect(reponse.brut_octets_sha256).toBe(empreinteOctets(new TextEncoder().encode(corps)));
    expect(reponse.brut_octets_sha256).not.toBe(reponse.brut_sha256);
    // La lecture JSON a perdu l'entier exact : c'est ce que l'empreinte des octets rend visible.
    expect(String(reponse.brut?.["id"])).not.toBe("12345678901234567890");
  });
});

describe("D55 (5), §6 : réponse reçue, non stockée", () => {
  it(
    "écriture de la réponse structurée qui lève après réception (schéma refusé, p. ex.) : octets gardés, " +
      "recue_non_stockee, aucune tentative comptée, pas de « manquante »",
    async () => {
      const b = nouveauBanc();
      b.editeur("outil-alpha", scenarioScripte(["reponse"]));
      const echec = new Error("Écriture simulée en échec (schéma refusé).");
      const bilan = await b.executer(plan(requete()), {
        depotPatch: (depot) => {
          depot.ecrire = () => {
            throw echec;
          };
        },
      });
      expect(bilan.ecrites).toBe(0);
      expect(bilan.en_attente_operateur).toHaveLength(1);
      const [attente] = bilan.en_attente_operateur;
      expect(attente?.numero).toBe(1);
      expect(attente?.cause).toBe(echec.message);
      const octetsEnvoyes = seule(transportDe(b).rendues).corps;
      expect(Array.from(readFileSync(attente?.chemin_octets as string))).toEqual(Array.from(octetsEnvoyes));
      expect(b.lues()).toHaveLength(0);
      expect(transportDe(b).interne.recues).toHaveLength(1);
    },
  );

  it("une requête en recue_non_stockee n'empêche pas une autre requête, d'un autre outil, d'aboutir", async () => {
    const b = nouveauBanc();
    const corpsInvalide = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d]);
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    b.editeur("outil-beta", () => ({ genre: "corps", statut: 200, corps: corpsInvalide }));
    const normale = requete();
    const invalide = requete({ outil_id: "outil-beta", alias_aveugle: "B02" });
    const premier = await b.executer(plan(normale, invalide));
    expect(premier.ecrites).toBe(1);
    expect(premier.en_attente_operateur).toHaveLength(1);
    expect(premier.en_attente_operateur[0]?.requete.outil_id).toBe("outil-beta");
    expect(seule(b.lues()).outil_id).toBe("outil-alpha");

    const relance = banc(undefined, b.racine);
    courant = relance;
    relance.editeur("outil-alpha", scenarioScripte([]));
    relance.editeur("outil-beta", scenarioScripte([]));
    const second = await relance.executer(plan(normale, invalide));
    expect(second).toEqual({ ecrites: 0, deja_ecrites: 1, en_attente_operateur: premier.en_attente_operateur });
    expect(transportDe(relance, "outil-alpha").interne.recues).toHaveLength(0);
    expect(transportDe(relance, "outil-beta").interne.recues).toHaveLength(0);
    const message = messageAttenteOperateur(second.en_attente_operateur[0] as (typeof second.en_attente_operateur)[number]);
    expect(message).toContain("outil-beta");
    expect(message).toContain(invalide.question_id);
    expect(message).toContain("opérateur");
  });
});

describe("cas 5 : fenêtre, côté exécution", () => {
  it("une tentative à fin − 1 ms part ; la requête suivante, qui tomberait après fin, est manquante hors_fenetre avec 0 tentative", async () => {
    const b = nouveauBanc(FENETRE.fin_ms - 1);
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await b.executer(plan(requete(), requete({ echantillon: 2 })));
    const [premiere, seconde] = [...b.lues()].sort((x, y) => x.echantillon - y.echantillon);
    expect(premiere?.statut_reponse).toBe("obtenue");
    expect(seconde).toMatchObject({ statut_reponse: "manquante", motif_manquante: "hors_fenetre", tentatives: [] });
    expect(instantsRelatifs(b)).toEqual([b.fenetre.fin_ms - 1 - b.fenetre.debut_ms]);
  });

  it("une requête à fin exactement ne part pas : manquante hors_fenetre, 0 tentative, rien envoyé", async () => {
    const b = nouveauBanc(FENETRE.fin_ms);
    await uneRequete(b, []);
    const reponse = manquante(b);
    expect(reponse.motif_manquante).toBe("hors_fenetre");
    expect(reponse.tentatives).toEqual([]);
    expect(reponse.requete.horodatage).toBe(b.fenetre.fin);
    expect(transportDe(b).interne.recues).toHaveLength(0);
  });

  it("une 2e tentative qui tomberait après fin donne une manquante hors_fenetre avec 1 tentative", async () => {
    const b = nouveauBanc(FENETRE.fin_ms - 10_000);
    await uneRequete(b, ["http_503"]);
    const reponse = manquante(b);
    expect(reponse.motif_manquante).toBe("hors_fenetre");
    expect(reponse.tentatives.map((t) => t.numero)).toEqual([1]);
    expect(transportDe(b).interne.recues).toHaveLength(1);
  });

  it("un run lancé avant l'ouverture de la fenêtre est refusé", async () => {
    const b = nouveauBanc(FENETRE.debut_ms - 1);
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await expect(b.executer(plan(requete()))).rejects.toThrow(RunHorsFenetre);
  });
});

describe("cas 6 : les files des outils sont indépendantes", () => {
  it("un outil en panne ne retarde pas l'autre", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["http_503", "http_503", "http_503"]));
    b.editeur("outil-beta", scenarioScripte(["reponse"]));
    const alpha = [requete(), requete({ formulation_id: "4K7G2R5S6T8V9W0X1Y2Z3A4B5C", texte: "autre" })];
    const beta = alpha.map((r) => ({ ...r, outil_id: "outil-beta", alias_aveugle: "B02" }));
    await b.executer(plan(...alpha, ...beta));
    expect(instantsRelatifs(b, "outil-beta")).toEqual([0, L]);
    expect(instantsRelatifs(b, "outil-alpha")).toEqual([
      0,
      L + 30_000,
      2 * L + 150_000,
      3 * L + 150_000,
      4 * L + 180_000,
      5 * L + 300_000,
    ]);
  });
});

describe("cas 7 : réponse tronquée", () => {
  it("est obtenue, troncature true, texte intact", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["tronquee"]);
    const reponse = obtenue(b);
    expect(reponse.normalise.troncature).toBe(true);
    expect(reponse.metadonnees.stop_reason).toBe("max_tokens");
    expect(reponse.normalise.texte).toBe(texteDe("tronquee"));
  });
});

describe("cas 8 : modele_renvoye", () => {
  it("vaut null quand l'API ne le renvoie pas, jamais modele_demande", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["sans_modele"]);
    const reponse = obtenue(b);
    expect(reponse.metadonnees.modele_renvoye).toBeNull();
    expect(reponse.metadonnees.modele_demande).toBe("modele-simule");
  });

  it("est ce que l'API renvoie quand elle le renvoie", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["reponse"]);
    expect(obtenue(b).metadonnees.modele_renvoye).toBe("modele-simule-2026-12");
  });

  it("la latence est mesurée par le client, entre envoi et réception", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["reponse"]);
    expect(obtenue(b).metadonnees.latence_ms).toBe(L);
  });
});

describe("cas 9 : requête enregistrée", () => {
  it("l'en-tête d'authentification est envoyé mais absent de la réponse stockée ; le corps est identique", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["reponse"]);
    const envoyee = seule(transportDe(b).interne.recues).requete;
    expect(envoyee.entetes["authorization"]).toBe(`Bearer ${CLE_API}`);
    const reponse = obtenue(b);
    expect(reponse.requete.corps).toEqual(envoyee.corps);
    expect(reponse.requete.sha256).toBe(empreinteDe(envoyee.corps));
    expect(reponse.requete.entetes).toEqual({ "content-type": "application/json", "x-version-api-simulee": "2026-12-01" });
    expect(Object.keys(reponse.requete).sort()).toEqual(["corps", "endpoint", "entetes", "horodatage", "sha256"]);
    const fichier = readFileSync(`${b.reponses}/${reponse.id}.json`, "utf8");
    expect(fichier).not.toContain(CLE_API);
    expect(fichier.toLowerCase()).not.toContain("authorization");
  });

  it("le corps porte le texte de la formulation seul : aucune instruction système, 2 048 tokens", async () => {
    const b = nouveauBanc();
    await uneRequete(b, ["reponse"]);
    expect(obtenue(b).requete.corps).toEqual({
      model: "modele-simule",
      max_tokens: 2048,
      messages: [{ role: "user", content: requete().texte }],
    });
  });
});
