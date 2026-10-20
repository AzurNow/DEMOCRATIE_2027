/**
 * Cas limite 11 du brief : reprise après interruption. Le journal des tentatives fait tenir le
 * plafond de trois tentatives même après un arrêt brutal, et une relance ne refait rien de fait.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JournalIllisible, JournalRequete, MESSAGE_INTERROMPUE, nomJournal, nomOctets, OctetsDejaGardes } from "../../pipeline/interrogation/journal.ts";
import { cleDe } from "../../pipeline/interrogation/types.ts";
import { banc, plan, requete, scenarioScripte, seule, transportDe, type Banc } from "./aides.ts";

let courant: Banc | null = null;

function nouveauBanc(racine?: string): Banc {
  courant = racine === undefined ? banc() : banc(undefined, racine);
  return courant;
}

afterEach(() => {
  courant?.nettoyer();
  courant = null;
});

function journalDe(b: Banc): JournalRequete {
  mkdirSync(b.tentatives, { recursive: true });
  return new JournalRequete(b.tentatives, cleDe(requete()));
}

describe("cas 11 : reprise", () => {
  it("une tentative journalisée sans résultat (arrêt pendant l'envoi) compte comme échouée, de type « autre »", async () => {
    const b = nouveauBanc();
    journalDe(b).inscrireDebut(1, "2026-12-01T06:00:00.000+01:00", cleDe(requete()));
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await b.executer(plan(requete()));
    const reponse = seule(b.lues());
    expect(reponse.statut_reponse).toBe("obtenue");
    expect(reponse.tentatives).toEqual([
      { numero: 1, horodatage: "2026-12-01T06:00:00.000+01:00", erreur: { type: "autre", message: MESSAGE_INTERROMPUE } },
    ]);
    expect(transportDe(b).interne.recues).toHaveLength(1);
  });

  it("après un arrêt pendant la 2e tentative, la relance n'envoie qu'une 3e : jamais une 4e", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", (_corps, rang) => {
      if (rang === 1) return { genre: "http", statut: 503 };
      throw new Error("arrêt brutal simulé pendant l'envoi");
    });
    await expect(b.executer(plan(requete()))).rejects.toThrow(/arrêt brutal/);
    expect(b.lues()).toHaveLength(0);

    const relance = nouveauBanc(b.racine);
    relance.editeur("outil-alpha", scenarioScripte(["http_503"]));
    await relance.executer(plan(requete()));
    const reponse = seule(relance.lues());
    expect(reponse).toMatchObject({ statut_reponse: "manquante", motif_manquante: "echecs" });
    expect(reponse.tentatives?.map((t) => [t.numero, t.erreur.type])).toEqual([
      [1, "http"],
      [2, "autre"],
      [3, "http"],
    ]);
    expect(transportDe(relance).interne.recues).toHaveLength(1);
  });

  it("trois tentatives déjà journalisées : la relance écrit la manquante sans rien envoyer", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    for (const numero of [1, 2, 3]) {
      journal.inscrireDebut(numero, "2026-12-01T06:00:00.000+01:00", cleDe(requete()));
      journal.inscrireEchec(numero, { type: "http", message: "HTTP 503", code_http: 503 });
    }
    b.editeur("outil-alpha", scenarioScripte([]));
    await b.executer(plan(requete()));
    expect(seule(b.lues())).toMatchObject({ statut_reponse: "manquante", motif_manquante: "echecs" });
    expect(transportDe(b).interne.recues).toHaveLength(0);
  });

  it("une relance après un run complet ne refait rien", async () => {
    const b = nouveauBanc();
    // Les deux échantillons envoient le même corps : le serveur simulé les voit aux rangs 1 et 2.
    b.editeur("outil-alpha", scenarioScripte(["reponse", "reponse"]));
    const requetes = [requete(), requete({ echantillon: 2 })];
    await b.executer(plan(...requetes));
    const avant = b.lues();

    const relance = nouveauBanc(b.racine);
    relance.editeur("outil-alpha", scenarioScripte([]));
    const bilan = await relance.executer(plan(...requetes));
    expect(bilan).toEqual({ ecrites: 0, deja_ecrites: 2, en_attente_operateur: [] });
    expect(transportDe(relance).interne.recues).toHaveLength(0);
    expect(relance.lues()).toEqual(avant);
  });

  it("le journal porte une ligne par début et par échec, en ajout seul", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["http_503", "reponse"]));
    await b.executer(plan(requete()));
    const lignes = readFileSync(join(b.tentatives, nomJournal(cleDe(requete()))), "utf8").trimEnd().split("\n");
    expect(lignes.map((l) => (JSON.parse(l) as { evenement: string; numero: number }).evenement)).toEqual([
      "debut",
      "echec",
      "debut",
    ]);
  });

  it("un journal dont la dernière ligne est tronquée lève, il n'est ni réparé ni ignoré", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, "2026-12-01T06:00:00.000+01:00", cleDe(requete()));
    appendFileSync(journal.chemin, '{"evenement":"ec');
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await expect(b.executer(plan(requete()))).rejects.toThrow(JournalIllisible);
    expect(b.lues()).toHaveLength(0);
  });

  it("une erreur journalisée hors de l'énumération du schéma lève", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, "2026-12-01T06:00:00.000+01:00", cleDe(requete()));
    appendFileSync(journal.chemin, `${JSON.stringify({ evenement: "echec", numero: 1, erreur: { type: "refus_api", message: "x" } })}\n`);
    expect(() => journal.reprise()).toThrow(JournalIllisible);
  });

  it.each([
    ["chemin absolu", "/tmp/octets-etrangers.octets"],
    ["chemin composé", "sous-repertoire/octets.octets"],
    ["remontée de répertoire", "../octets.octets"],
  ])("un chemin_octets %s dans recue_non_stockee lève à la relecture (règle 2, §6, D55 (5))", (_cas, chemin_octets) => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, "2026-12-01T06:00:00.000+01:00", cleDe(requete()));
    appendFileSync(journal.chemin, `${JSON.stringify({ evenement: "recue_non_stockee", numero: 1, chemin_octets, cause: "x" })}\n`);
    expect(() => journal.reprise()).toThrow(JournalIllisible);
  });

  it(
    "garderOctets qui échoue (collision avec des octets déjà gardés) : la première exécution lève " +
      "OctetsDejaGardes, le journal porte recue_non_stockee sans octets, et la relance n'envoie rien, " +
      "la requête attend l'opérateur (§6, D55 (5))",
    async () => {
      const b = nouveauBanc();
      mkdirSync(b.tentatives, { recursive: true });
      writeFileSync(join(b.tentatives, nomOctets(cleDe(requete()), 1)), "octets étrangers, jamais écrits par le banc");
      b.editeur("outil-alpha", scenarioScripte(["reponse"]));
      await expect(b.executer(plan(requete()))).rejects.toThrow(OctetsDejaGardes);
      expect(b.lues()).toHaveLength(0);
      const lignes = readFileSync(join(b.tentatives, nomJournal(cleDe(requete()))), "utf8").trimEnd().split("\n");
      const derniere = JSON.parse(lignes[lignes.length - 1] as string) as {
        evenement: string;
        chemin_octets: unknown;
        cause: string;
      };
      expect(derniere.evenement).toBe("recue_non_stockee");
      expect(derniere.chemin_octets).toBeNull();
      expect(derniere.cause).toContain("octets non gardés");

      const relance = nouveauBanc(b.racine);
      relance.editeur("outil-alpha", scenarioScripte([]));
      const bilan = await relance.executer(plan(requete()));
      expect(bilan.ecrites).toBe(0);
      expect(bilan.en_attente_operateur).toHaveLength(1);
      expect(bilan.en_attente_operateur[0]?.chemin_octets).toBeNull();
      expect(transportDe(relance).interne.recues).toHaveLength(0);
    },
  );
});

describe("D55 (5) : écriture atomique des octets gardés (garderOctets)", () => {
  it("octets rendus identiques octet à octet, nom relatif, aucun .tmp restant après succès", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    const octets = new Uint8Array([0, 1, 2, 253, 254, 255, 42]);
    const nom = journal.garderOctets(1, octets);
    expect(nom).toBe(nomOctets(cleDe(requete()), 1));
    expect(Array.from(readFileSync(join(b.tentatives, nom)))).toEqual(Array.from(octets));
    expect(readdirSync(b.tentatives).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });

  it("collision : OctetsDejaGardes, octets d'origine intacts, aucun .tmp restant", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    const octets = new Uint8Array([1, 2, 3]);
    journal.garderOctets(1, octets);
    expect(() => journal.garderOctets(1, new Uint8Array([9, 9, 9]))).toThrow(OctetsDejaGardes);
    expect(Array.from(readFileSync(join(b.tentatives, nomOctets(cleDe(requete()), 1))))).toEqual(Array.from(octets));
    expect(readdirSync(b.tentatives).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});
