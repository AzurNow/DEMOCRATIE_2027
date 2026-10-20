/**
 * Lot gel, PR 2a : la balise drand quicknet (D44) et l'identifiant dérivé (D45 (1)). Logique pure de
 * `pipeline/gel/balise.ts`, et la lecture des deux relais par un adaptateur de fixture : aucun test
 * ne touche le réseau. Chaque cas limite du brief porte son numéro, « balise, cas n ».
 *
 * Les valeurs attendues des dérivations sont écrites en clair, calculées hors de ce dépôt (Python,
 * `hashlib`, sur la règle de D44) : elles ne sont pas recalculées par le code qu'elles éprouvent.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  aleaDe,
  BaliseRefusee,
  CLE_IDENTIFIANT,
  CLES_DES_GRAINES,
  emissionDuTour,
  exigerTourEmis,
  graineDesOctets,
  identifiantDuRun,
  lireBalise,
  octetsDeLIdentifiant,
  QUICKNET,
  RELAIS,
  tourAuGel,
  urlInfo,
  urlTour,
  valeursDesGraines,
  verifierInfo,
  verifierTour,
} from "../../pipeline/gel/balise.ts";
import { NOMS_GRAINES } from "../../pipeline/gel/graines.ts";
import type { ReponseHttp } from "../../pipeline/gel/reseau.ts";
import { estUlid, ulidDe } from "../../validation/domaine/ulid.ts";
import { INFO_QUICKNET, octetsJson, relaisDeFixture, reponseJson, reponseTour, signatureDeFixture } from "./reseau-fixture.ts";

/** Le vecteur réel du brief : quicknet, tour 1000, lu le 2026-10-16 sur drand.cloudflare.com. */
const VECTEUR_1000 = {
  round: 1000,
  signature:
    "b44679b9a59af2ec876b1a6b1ad52ea9b1615fc3982b19576350f93447cb1125e342b73a8dd2bacbe47e4b6b63ed5e39",
  randomness: "fe290beca10872ef2fb164d2aa4442de4566183ec51c56ff3cd603d930e54fdd",
};

const [RELAIS_A, RELAIS_B] = RELAIS;
if (RELAIS_A === undefined || RELAIS_B === undefined) throw new Error("deux relais attendus");

async function refusDe(appel: () => unknown): Promise<BaliseRefusee> {
  try {
    await appel();
  } catch (erreur) {
    if (erreur instanceof BaliseRefusee) return erreur;
    throw erreur;
  }
  throw new Error("aucun refus de la balise");
}

/* ------------------------------------------------------------------ chaîne */

describe("chaîne épinglée (D44)", () => {
  it("quicknet : empreinte, genèse, période, schéma", () => {
    expect(QUICKNET).toEqual({
      empreinte: "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971",
      genese: 1692803367,
      periode: 3,
      schema_id: "bls-unchained-g1-rfc9380",
    });
  });

  it("deux relais indépendants, et les URL lues", () => {
    expect(RELAIS.map((relais) => relais.base)).toEqual(["https://api.drand.sh", "https://drand.cloudflare.com"]);
    expect(urlInfo(RELAIS_A)).toBe(`https://api.drand.sh/${QUICKNET.empreinte}/info`);
    expect(urlTour(RELAIS_B, 42)).toBe(`https://drand.cloudflare.com/${QUICKNET.empreinte}/public/42`);
  });
});

/* -------------------------------------------------------------------- tour */

describe("balise, cas 1 : le tour retenu", () => {
  // Le tour 1000 est émis à genèse + 999 × 3 s.
  const EMISSION_1000 = (1692803367 + 999 * 3) * 1000;

  it("balise, cas 1 : date_gel exactement sur l'émission d'un tour ⇒ ce tour", () => {
    expect(tourAuGel(EMISSION_1000)).toBe(1000);
    expect(emissionDuTour(1000)).toBe(EMISSION_1000);
  });

  it("balise, cas 1 : 1 ms après l'émission ⇒ le tour suivant", () => {
    expect(tourAuGel(EMISSION_1000 + 1)).toBe(1001);
  });

  it("balise, cas 1 : 1 ms avant l'émission ⇒ ce tour encore", () => {
    expect(tourAuGel(EMISSION_1000 - 1)).toBe(1000);
  });

  it("le tour 1 est émis à la genèse ; une date_gel antérieure est refusée, jamais ramenée au tour 1", async () => {
    expect(tourAuGel(1692803367 * 1000)).toBe(1);
    expect((await refusDe(() => tourAuGel(1692803367 * 1000 - 1))).motif).toBe("avant_genese");
  });

  it("le gel des fixtures (2026-12-01T00:00:00Z) tombe exactement sur l'émission du tour 34426612", () => {
    const gel = Date.parse("2026-12-01T00:00:00Z");
    expect(tourAuGel(gel)).toBe(34426612);
    expect(emissionDuTour(34426612)).toBe(gel);
  });

  it("un tour non encore émis est refusé ; émis à l'instant même, il est accepté", async () => {
    expect(() => exigerTourEmis(1000, EMISSION_1000)).not.toThrow();
    const refus = await refusDe(() => exigerTourEmis(1000, EMISSION_1000 - 1));
    expect(refus.motif).toBe("pas_encore_emis");
    expect(refus.message).toContain("1000");
  });
});

/* -------------------------------------------------------------- dérivation */

describe("balise, cas 2 : dérivation des graines et de l'identifiant", () => {
  it("aléa = SHA-256(octets de la signature) sur le vecteur réel du tour 1000", () => {
    expect(aleaDe(VECTEUR_1000.signature)).toBe(VECTEUR_1000.randomness);
  });

  it("balise, cas 2 : les six graines d'un aléa connu, calculées à la main", () => {
    expect(valeursDesGraines(VECTEUR_1000.randomness)).toEqual({
      tirage: 1988838112253212,
      echantillon_humain: 4397518236614702,
      bootstrap: 6226129174604279,
      permutation: 379229182868508,
      contrefactuel: 8908148394566155,
      alias_candidats: 6622177807060453,
    });
  });

  it("balise, cas 2 : chaque graine est dérivée par une clé lisible, son nom", () => {
    expect(CLES_DES_GRAINES).toEqual(Object.fromEntries(NOMS_GRAINES.map((nom) => [nom, nom])));
    expect(CLE_IDENTIFIANT).toBe("run_id");
  });

  it("balise, cas 2 : la partie aléatoire de l'ULID, 80 premiers bits, calculée à la main", () => {
    expect(Buffer.from(octetsDeLIdentifiant(VECTEUR_1000.randomness)).toString("hex")).toBe("8e4fcea6e1eab4a11af7");
    const gel = Date.parse("2026-12-01T00:00:00Z");
    const id = identifiantDuRun(gel, VECTEUR_1000.randomness);
    expect(id).toBe("01M8QEDC00HS7WX9Q1XATA26QQ");
    expect(estUlid(id)).toBe(true);
  });

  it("balise, cas 2 : la borne 2^53 − 1 est tenue, et 0 est atteint", () => {
    expect(graineDesOctets(new Uint8Array(8).fill(0xff))).toBe(2 ** 53 - 1);
    expect(Number.isSafeInteger(graineDesOctets(new Uint8Array(8).fill(0xff)))).toBe(true);
    expect(graineDesOctets(new Uint8Array(8))).toBe(0);
    // Les 11 bits de poids faible sont ceux que le décalage retire.
    expect(graineDesOctets(Uint8Array.from([0, 0, 0, 0, 0, 0, 0x07, 0xff]))).toBe(0);
    expect(graineDesOctets(Uint8Array.from([0, 0, 0, 0, 0, 0, 0x08, 0x00]))).toBe(1);
  });

  it("une graine ne se dérive que de 8 octets exactement", () => {
    expect(() => graineDesOctets(new Uint8Array(7))).toThrow(/8 octets/);
  });

  it("ulidDe : horodatage et 10 octets donnés, rien de tiré au hasard", () => {
    expect(ulidDe(0, new Uint8Array(10))).toBe("00000000000000000000000000");
    expect(ulidDe(2 ** 48 - 1, new Uint8Array(10).fill(0xff))).toBe("7ZZZZZZZZZZZZZZZZZZZZZZZZZ");
    expect(() => ulidDe(0, new Uint8Array(9))).toThrow(/10 octets/);
  });
});

/* -------------------------------------------------------------- réponses */

describe("balise, cas 5 : randomness du relais", () => {
  it("le vecteur réel passe", () => {
    const lu = verifierTour(RELAIS_B, 1000, reponseJson(VECTEUR_1000));
    expect(lu.signature).toBe(VECTEUR_1000.signature);
    expect(lu.alea).toBe(VECTEUR_1000.randomness);
  });

  it("balise, cas 5 : randomness ≠ SHA-256(signature) ⇒ refus", async () => {
    const faux = { ...VECTEUR_1000, randomness: "0".repeat(64) };
    const refus = await refusDe(() => verifierTour(RELAIS_B, 1000, reponseJson(faux)));
    expect(refus.motif).toBe("alea_faux");
    expect(refus.relais).toBe(RELAIS_B.nom);
  });

  it("un tour autre que celui demandé ⇒ refus", async () => {
    expect((await refusDe(() => verifierTour(RELAIS_B, 1001, reponseJson(VECTEUR_1000)))).motif).toBe("tour_different");
  });

  it("une signature qui n'a pas 48 octets (96 caractères hexadécimaux) ⇒ refus", async () => {
    const court = { ...VECTEUR_1000, signature: VECTEUR_1000.signature.slice(2) };
    expect((await refusDe(() => verifierTour(RELAIS_B, 1000, reponseJson(court)))).motif).toBe("illisible");
  });

  it("un corps qui n'est pas du JSON ⇒ refus nommé, jamais une lecture partielle", async () => {
    const corps: ReponseHttp = { statut: 200, octets: new TextEncoder().encode("<html>") };
    const refus = await refusDe(() => verifierTour(RELAIS_B, 1000, corps));
    expect(refus.motif).toBe("illisible");
    expect(refus.message).toContain(RELAIS_B.nom);
  });

  it("une réponse HTTP autre que 200 ⇒ refus", async () => {
    const refus = await refusDe(() => verifierTour(RELAIS_B, 1000, { statut: 404, octets: octetsJson(VECTEUR_1000) }));
    expect(refus.motif).toBe("statut_http");
    expect(refus.message).toContain("404");
  });
});

describe("balise, cas 6 : /info d'un relais", () => {
  it("l'info épinglée passe", () => {
    expect(() => verifierInfo(RELAIS_A, reponseJson(INFO_QUICKNET))).not.toThrow();
  });

  const ecarts: readonly (readonly [string, Record<string, unknown>])[] = [
    ["empreinte", { hash: "0".repeat(64) }],
    ["genèse", { genesis_time: 1692803368 }],
    ["période", { period: 30 }],
    ["schéma", { schemeID: "pedersen-bls-chained" }],
  ];
  for (const [nom, surcharge] of ecarts) {
    it(`balise, cas 6 : ${nom} différente de l'épinglée ⇒ refus`, async () => {
      const refus = await refusDe(() => verifierInfo(RELAIS_A, reponseJson({ ...INFO_QUICKNET, ...surcharge })));
      expect(refus.motif).toBe("chaine_differente");
      expect(refus.message).toContain(Object.keys(surcharge)[0]);
    });
  }

  it("un champ attendu absent ⇒ refus, jamais une valeur par défaut", async () => {
    const { period: _retire, ...sans } = INFO_QUICKNET;
    expect((await refusDe(() => verifierInfo(RELAIS_A, reponseJson(sans)))).motif).toBe("illisible");
  });
});

/* ----------------------------------------------------- lecture des deux relais */

const TOUR = 1000;

describe("lecture des deux relais", () => {
  it("deux relais d'accord ⇒ la balise, l'aléa recalculé, les deux réponses archivées telles quelles", async () => {
    const port = relaisDeFixture();
    const balise = await lireBalise(TOUR, port.lire);
    expect(balise.tour).toBe(TOUR);
    expect(balise.signature).toBe(signatureDeFixture(TOUR));
    expect(balise.alea).toBe(createHash("sha256").update(Buffer.from(signatureDeFixture(TOUR), "hex")).digest("hex"));
    expect(balise.lectures.map((lu) => lu.relais.nom)).toEqual(RELAIS.map((relais) => relais.nom));
    for (const lu of balise.lectures) expect(Buffer.from(lu.octets)).toEqual(Buffer.from(octetsJson(reponseTour(TOUR))));
    expect(port.appels).toEqual(RELAIS.flatMap((relais) => [urlInfo(relais), urlTour(relais, TOUR)]));
  });

  it("balise, cas 3 : les deux relais diffèrent par la signature ⇒ refus", async () => {
    const autre = { ...reponseTour(TOUR), signature: signatureDeFixture(TOUR + 1) };
    autre.randomness = aleaDe(autre.signature);
    const port = relaisDeFixture((url) => (url === urlTour(RELAIS_B, TOUR) ? reponseJson(autre) : undefined));
    const refus = await refusDe(() => lireBalise(TOUR, port.lire));
    expect(refus.motif).toBe("relais_en_desaccord");
    expect(refus.message).toContain(RELAIS_A.nom);
    expect(refus.message).toContain(RELAIS_B.nom);
  });

  it("balise, cas 3 : un relais rend un autre tour ⇒ refus", async () => {
    const port = relaisDeFixture((url) => (url === urlTour(RELAIS_B, TOUR) ? reponseJson(reponseTour(TOUR + 1)) : undefined));
    const refus = await refusDe(() => lireBalise(TOUR, port.lire));
    expect(refus.motif).toBe("tour_different");
    expect(refus.relais).toBe(RELAIS_B.nom);
  });

  it("balise, cas 4 : un relais injoignable ⇒ refus, l'autre n'est pas retenu seul", async () => {
    const port = relaisDeFixture((url) => (url.startsWith(RELAIS_B.base) ? new Error("ECONNREFUSED (simulé)") : undefined));
    const refus = await refusDe(() => lireBalise(TOUR, port.lire));
    expect(refus.motif).toBe("injoignable");
    expect(refus.relais).toBe(RELAIS_B.nom);
    expect(refus.message).toContain("ECONNREFUSED (simulé)");
  });

  it("balise, cas 4 : le premier relais en erreur HTTP ⇒ refus, le second n'est pas lu", async () => {
    const port = relaisDeFixture((url) => (url === urlTour(RELAIS_A, TOUR) ? { statut: 503, octets: new Uint8Array() } : undefined));
    const refus = await refusDe(() => lireBalise(TOUR, port.lire));
    expect(refus.motif).toBe("statut_http");
    expect(refus.relais).toBe(RELAIS_A.nom);
    expect(port.appels.some((url) => url.startsWith(RELAIS_B.base))).toBe(false);
  });

  it("balise, cas 6 : /info d'un relais sur une autre chaîne ⇒ refus avant la lecture de son tour", async () => {
    const port = relaisDeFixture((url) => (url === urlInfo(RELAIS_B) ? reponseJson({ ...INFO_QUICKNET, period: 30 }) : undefined));
    const refus = await refusDe(() => lireBalise(TOUR, port.lire));
    expect(refus.motif).toBe("chaine_differente");
    expect(port.appels).not.toContain(urlTour(RELAIS_B, TOUR));
  });
});
