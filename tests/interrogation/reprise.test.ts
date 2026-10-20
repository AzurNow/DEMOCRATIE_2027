/**
 * Cas limite 11 du brief : reprise après interruption. Le journal des tentatives fait tenir le
 * plafond de trois tentatives même après un arrêt brutal, et une relance ne refait rien de fait.
 */

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

  it(
    "garderOctets qui échoue (collision avec des octets déjà gardés) n'est pas confondu avec recue_non_stockee : " +
      "la file s'arrête, et la relance repart avec un numéro de tentative neuf (§6, D55 (5), option la plus prudente)",
    async () => {
      const b = nouveauBanc();
      mkdirSync(b.tentatives, { recursive: true });
      writeFileSync(join(b.tentatives, nomOctets(cleDe(requete()), 1)), "octets étrangers, jamais écrits par le banc");
      b.editeur("outil-alpha", scenarioScripte(["reponse"]));
      await expect(b.executer(plan(requete()))).rejects.toThrow(OctetsDejaGardes);
      expect(b.lues()).toHaveLength(0);

      const relance = nouveauBanc(b.racine);
      relance.editeur("outil-alpha", scenarioScripte(["reponse"]));
      await relance.executer(plan(requete()));
      const reponse = seule(relance.lues());
      expect(reponse.statut_reponse).toBe("obtenue");
      expect(reponse.tentatives?.map((t) => [t.numero, t.erreur.type])).toEqual([[1, "autre"]]);
      expect(transportDe(relance).interne.recues).toHaveLength(1);
    },
  );
});
