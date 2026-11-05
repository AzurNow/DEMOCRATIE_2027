/**
 * Lot gel, PR 2a : l'engagement archivé (D46). Avant `date_gel`, l'auteur fait capturer par la Wayback
 * Machine la page GitHub du commit à geler ; le gel vérifie l'URL de capture, son horodatage, et que
 * la Wayback Machine la sert. Adaptateur de fixture seulement ; « balise, cas 8 » du brief.
 */

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DEPOT_PUBLIC,
  EngagementRefuse,
  engagementDuRun,
  instantDeCapture,
  lireEngagement,
  urlDisponibilite,
  verifierEngagement,
} from "../../pipeline/gel/engagement.ts";
import { capturePresente, octetsJson, reponseJson, waybackSimulee } from "../../pipeline/gel/reseau-simule.ts";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const AUTRE = "fedcba9876543210fedcba9876543210fedcba98";
const GEL = Date.parse("2026-12-01T00:00:00Z");
const HORODATAGE = "20261130120000";
const PAGE = `${DEPOT_PUBLIC}/commit/${HEAD}`;
const URL_CAPTURE = `https://web.archive.org/web/${HORODATAGE}/${PAGE}`;

async function refusDe(appel: () => unknown): Promise<EngagementRefuse> {
  try {
    await appel();
  } catch (erreur) {
    if (erreur instanceof EngagementRefuse) return erreur;
    throw erreur;
  }
  throw new Error("aucun refus de l'engagement");
}

describe("balise, cas 8 : l'URL de capture", () => {
  it("une capture du commit gelé, antérieure à date_gel, est lue", () => {
    expect(lireEngagement(URL_CAPTURE, HEAD, GEL)).toEqual({ url: URL_CAPTURE, horodatage: HORODATAGE, page: PAGE });
  });

  it("balise, cas 8 : engagement absent ⇒ refus qui nomme le champ", async () => {
    const refus = await refusDe(() => lireEngagement(undefined, HEAD, GEL));
    expect(refus.motif).toBe("absent");
    expect(refus.message).toContain("--engagement");
  });

  it("balise, cas 8 : URL d'un autre commit que HEAD ⇒ refus", async () => {
    const refus = await refusDe(() => lireEngagement(URL_CAPTURE.replace(HEAD, AUTRE), HEAD, GEL));
    expect(refus.motif).toBe("autre_commit");
    expect(refus.message).toContain(AUTRE);
    expect(refus.message).toContain(HEAD);
  });

  it("un commit abrégé n'est pas HEAD complet ⇒ refus de forme", async () => {
    expect((await refusDe(() => lireEngagement(URL_CAPTURE.replace(HEAD, HEAD.slice(0, 12)), HEAD, GEL))).motif).toBe("forme");
  });

  const formes: readonly (readonly [string, string])[] = [
    ["un autre hôte que web.archive.org", URL_CAPTURE.replace("web.archive.org", "archive.ph")],
    ["http au lieu de https", URL_CAPTURE.replace("https://web.archive.org", "http://web.archive.org")],
    ["un autre dépôt", URL_CAPTURE.replace(DEPOT_PUBLIC, "https://github.com/autre/depot")],
    ["un horodatage de 12 chiffres", URL_CAPTURE.replace(HORODATAGE, "202611301200")],
    ["une capture en version brute (id_)", URL_CAPTURE.replace(`${HORODATAGE}/`, `${HORODATAGE}id_/`)],
    ["une page qui n'est pas celle du commit", `https://web.archive.org/web/${HORODATAGE}/${DEPOT_PUBLIC}/tree/${HEAD}`],
  ];
  for (const [nom, url] of formes) {
    it(`${nom} ⇒ refus de forme`, async () => {
      expect((await refusDe(() => lireEngagement(url, HEAD, GEL))).motif).toBe("forme");
    });
  }

  it("balise, cas 8 : horodatage de capture égal à date_gel ⇒ refus", async () => {
    const refus = await refusDe(() => lireEngagement(URL_CAPTURE.replace(HORODATAGE, "20261201000000"), HEAD, GEL));
    expect(refus.motif).toBe("tardif");
  });

  it("balise, cas 8 : horodatage de capture postérieur à date_gel ⇒ refus", async () => {
    expect((await refusDe(() => lireEngagement(URL_CAPTURE.replace(HORODATAGE, "20261201000001"), HEAD, GEL))).motif).toBe("tardif");
  });

  it("une seconde avant date_gel suffit", () => {
    expect(lireEngagement(URL_CAPTURE.replace(HORODATAGE, "20261130235959"), HEAD, GEL).horodatage).toBe("20261130235959");
  });

  it("l'horodatage se lit en UTC ; une date impossible est refusée, jamais normalisée", async () => {
    expect(instantDeCapture(HORODATAGE)).toBe(Date.parse("2026-11-30T12:00:00Z"));
    expect((await refusDe(() => lireEngagement(URL_CAPTURE.replace(HORODATAGE, "20261131120000"), HEAD, GEL))).motif).toBe(
      "horodatage_invalide",
    );
    expect((await refusDe(() => instantDeCapture("20261130250000"))).motif).toBe("horodatage_invalide");
  });
});

describe("balise, cas 8 : la Wayback Machine sert la capture", () => {
  it("l'API de disponibilité est interrogée sur la page et l'horodatage exacts, une fois", async () => {
    const port = waybackSimulee();
    const engagement = await verifierEngagement(URL_CAPTURE, HEAD, GEL, port.lire);
    expect(port.appels).toEqual([urlDisponibilite(engagement)]);
    const parametres = new URL(urlDisponibilite(engagement)).searchParams;
    expect(new URL(urlDisponibilite(engagement)).origin + new URL(urlDisponibilite(engagement)).pathname).toBe(
      "https://archive.org/wayback/available",
    );
    expect(parametres.get("url")).toBe(PAGE);
    expect(parametres.get("timestamp")).toBe(HORODATAGE);
    // D47 (3) : la réponse de l'API, telle que reçue, et son empreinte dans run.json.
    const corps = octetsJson(capturePresente(PAGE, HORODATAGE));
    expect(Buffer.from(engagement.octets)).toEqual(Buffer.from(corps));
    expect(engagementDuRun(engagement, "2026-12-01")).toEqual({
      url: URL_CAPTURE,
      horodatage: HORODATAGE,
      disponibilite: {
        url: urlDisponibilite(engagement),
        chemin: "runs/2026-12-01/engagement/wayback.json",
        sha256: createHash("sha256").update(corps).digest("hex"),
      },
    });
  });

  it("une URL refusée n'appelle pas la Wayback Machine", async () => {
    const port = waybackSimulee();
    await refusDe(() => verifierEngagement(URL_CAPTURE.replace(HEAD, AUTRE), HEAD, GEL, port.lire));
    expect(port.appels).toEqual([]);
  });

  const nonServies: readonly (readonly [string, unknown])[] = [
    ["aucune capture", { url: PAGE, archived_snapshots: {}, timestamp: HORODATAGE }],
    ["une capture voisine, d'un autre horodatage", capturePresente(PAGE, "20261130115959")],
    [
      "une capture de statut 302",
      { archived_snapshots: { closest: { ...(capturePresente(PAGE, HORODATAGE) as { archived_snapshots: { closest: object } }).archived_snapshots.closest, status: "302" } } },
    ],
    [
      "une capture non disponible",
      { archived_snapshots: { closest: { ...(capturePresente(PAGE, HORODATAGE) as { archived_snapshots: { closest: object } }).archived_snapshots.closest, available: false } } },
    ],
    ["une capture d'une autre page", capturePresente(`${DEPOT_PUBLIC}/commit/${AUTRE}`, HORODATAGE)],
  ];
  for (const [nom, corps] of nonServies) {
    it(`balise, cas 8 : Wayback ne sert pas la capture (${nom}) ⇒ refus`, async () => {
      const port = waybackSimulee(() => reponseJson(corps));
      expect((await refusDe(() => verifierEngagement(URL_CAPTURE, HEAD, GEL, port.lire))).motif).toBe("non_servie");
    });
  }

  it("Wayback injoignable ⇒ refus nommé", async () => {
    const port = waybackSimulee(() => new Error("ETIMEDOUT (simulé)"));
    const refus = await refusDe(() => verifierEngagement(URL_CAPTURE, HEAD, GEL, port.lire));
    expect(refus.motif).toBe("injoignable");
    expect(refus.message).toContain("ETIMEDOUT (simulé)");
  });

  it("Wayback en erreur HTTP ⇒ refus nommé", async () => {
    const port = waybackSimulee(() => reponseJson({}, 503));
    expect((await refusDe(() => verifierEngagement(URL_CAPTURE, HEAD, GEL, port.lire))).motif).toBe("statut_http");
  });

  it("une réponse Wayback qui n'est pas du JSON attendu ⇒ refus nommé", async () => {
    const port = waybackSimulee(() => ({ statut: 200, octets: new TextEncoder().encode("<html>") }));
    expect((await refusDe(() => verifierEngagement(URL_CAPTURE, HEAD, GEL, port.lire))).motif).toBe("illisible");
    const autre = waybackSimulee(() => reponseJson({ archived_snapshots: { closest: { timestamp: 20261130120000 } } }));
    expect((await refusDe(() => verifierEngagement(URL_CAPTURE, HEAD, GEL, autre.lire))).motif).toBe("illisible");
  });
});
