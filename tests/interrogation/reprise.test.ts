/**
 * Cas limite 11 du brief : reprise après interruption. Le journal des tentatives fait tenir le
 * plafond de trois tentatives même après un arrêt brutal, et une relance ne refait rien de fait.
 */

import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  JournalIllisible,
  JournalRequete,
  MESSAGE_INTERROMPUE,
  MESSAGE_OCTETS_SANS_SUITE,
  nomJournal,
  nomOctets,
  OctetsDejaGardes,
} from "../../pipeline/interrogation/journal.ts";
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

/**
 * §6 (0.19) : une réponse reçue et gardée n'est jamais renvoyée. Un arrêt brutal entre la garde des
 * octets et la suite (réponse écrite ou événement du journal) laisse un `debut` sans suite dont les
 * octets existent : c'est une réponse reçue, pas une tentative interrompue.
 */
describe("§6 : arrêt après la garde des octets, avant leur stockage", () => {
  const HORODATAGE = "2026-12-01T06:00:00.000+01:00";

  type LigneLue = { readonly evenement: string; readonly numero: number };

  function lignesJournal(b: Banc): readonly LigneLue[] {
    return readFileSync(join(b.tentatives, nomJournal(cleDe(requete()))), "utf8")
      .trimEnd()
      .split("\n")
      .map((l) => JSON.parse(l) as LigneLue);
  }

  /** L'état laissé par l'arrêt : `debut` de la tentative `numero` inscrit, octets gardés, rien d'autre. */
  function arretApresGarde(b: Banc, numero: number, octets: Uint8Array): void {
    const journal = journalDe(b);
    for (let passee = 1; passee < numero; passee += 1) {
      journal.inscrireDebut(passee, HORODATAGE, cleDe(requete()));
      journal.inscrireEchec(passee, { type: "http", message: "HTTP 503", code_http: 503 });
    }
    journal.inscrireDebut(numero, HORODATAGE, cleDe(requete()));
    journal.garderOctets(numero, octets);
  }

  it("relance : aucune requête renvoyée, aucune réponse écrite, la requête attend l'opérateur avec ses octets", async () => {
    const b = nouveauBanc();
    const octets = new TextEncoder().encode('{"content":[{"type":"text","text":"Reçue avant l\'arrêt."}]}');
    arretApresGarde(b, 1, octets);
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const bilan = await b.executer(plan(requete()));
    expect(transportDe(b).interne.recues).toHaveLength(0);
    expect(b.lues()).toHaveLength(0);
    expect(bilan.ecrites).toBe(0);
    expect(bilan.en_attente_operateur).toHaveLength(1);
    const [attente] = bilan.en_attente_operateur;
    expect(attente?.genre).toBe("en_attente_operateur");
    expect(attente?.numero).toBe(1);
    expect(attente?.cause).toBe(MESSAGE_OCTETS_SANS_SUITE);
    expect(attente?.chemin_octets).toBe(join(b.tentatives, nomOctets(cleDe(requete()), 1)));
    expect(Array.from(readFileSync(attente?.chemin_octets as string))).toEqual(Array.from(octets));
  });

  it("la relance conclut la ligne par recue_non_stockee : les octets ne restent pas orphelins du journal", async () => {
    const b = nouveauBanc();
    arretApresGarde(b, 1, new Uint8Array([1, 2, 3]));
    b.editeur("outil-alpha", scenarioScripte([]));
    await b.executer(plan(requete()));
    expect(lignesJournal(b)).toEqual([
      { evenement: "debut", numero: 1, horodatage: HORODATAGE, requete: cleDe(requete()) },
      { evenement: "recue_non_stockee", numero: 1, chemin_octets: nomOctets(cleDe(requete()), 1), cause: MESSAGE_OCTETS_SANS_SUITE },
    ]);
  });

  it("compteur de tentatives inchangé : après deux échecs, la 3e reçue et gardée n'est ni comptée ni suivie d'une manquante", async () => {
    const b = nouveauBanc();
    arretApresGarde(b, 3, new Uint8Array([7, 7, 7]));
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const bilan = await b.executer(plan(requete()));
    expect(transportDe(b).interne.recues).toHaveLength(0);
    expect(b.lues()).toHaveLength(0);
    expect(bilan.en_attente_operateur.map((a) => a.numero)).toEqual([3]);
    expect(lignesJournal(b).map((l) => [l.evenement, l.numero])).toEqual([
      ["debut", 1],
      ["echec", 1],
      ["debut", 2],
      ["echec", 2],
      ["debut", 3],
      ["recue_non_stockee", 3],
    ]);
  });

  it("deuxième relance : idempotente, rien n'est envoyé ni ajouté au journal, même attente", async () => {
    const b = nouveauBanc();
    arretApresGarde(b, 1, new Uint8Array([1, 2, 3]));
    b.editeur("outil-alpha", scenarioScripte([]));
    const premier = await b.executer(plan(requete()));
    const journalApresPremiere = readFileSync(join(b.tentatives, nomJournal(cleDe(requete()))), "utf8");

    const relance = nouveauBanc(b.racine);
    relance.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const second = await relance.executer(plan(requete()));
    expect(second).toEqual(premier);
    expect(transportDe(relance).interne.recues).toHaveLength(0);
    expect(relance.lues()).toHaveLength(0);
    expect(readFileSync(join(relance.tentatives, nomJournal(cleDe(requete()))), "utf8")).toBe(journalApresPremiere);
  });

  it.each([
    ["vides", new Uint8Array([])],
    ["tronqués", new TextEncoder().encode('{"content":[{"type":"te')],
  ])("octets gardés %s : ce sont les octets reçus, gardés tels quels, jamais réparés ni renvoyés", async (_cas, octets) => {
    const b = nouveauBanc();
    arretApresGarde(b, 1, octets);
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const bilan = await b.executer(plan(requete()));
    expect(transportDe(b).interne.recues).toHaveLength(0);
    expect(b.lues()).toHaveLength(0);
    expect(bilan.en_attente_operateur).toHaveLength(1);
    expect(Array.from(readFileSync(bilan.en_attente_operateur[0]?.chemin_octets as string))).toEqual(Array.from(octets));
  });

  it("non-régression : arrêt avant la garde des octets, la tentative reste interrompue et la requête est renvoyée", async () => {
    const b = nouveauBanc();
    journalDe(b).inscrireDebut(1, HORODATAGE, cleDe(requete()));
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const bilan = await b.executer(plan(requete()));
    expect(bilan.en_attente_operateur).toEqual([]);
    expect(transportDe(b).interne.recues).toHaveLength(1);
    expect(seule(b.lues()).tentatives).toEqual([{ numero: 1, horodatage: HORODATAGE, erreur: { type: "autre", message: MESSAGE_INTERROMPUE } }]);
  });

  it("des octets gardés d'une tentative close (échec journalisé) ne changent rien : seule la tentative ouverte compte", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, HORODATAGE, cleDe(requete()));
    journal.garderOctets(1, new TextEncoder().encode("Service indisponible"));
    journal.inscrireEchec(1, { type: "http", message: "HTTP 503", code_http: 503 });
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await b.executer(plan(requete()));
    expect(transportDe(b).interne.recues).toHaveLength(1);
    expect(seule(b.lues()).statut_reponse).toBe("obtenue");
  });
});
