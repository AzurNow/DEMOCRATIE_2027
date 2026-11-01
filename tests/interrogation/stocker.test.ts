/**
 * §6 (0.21) : « L'opérateur la stocke depuis ses octets gardés, tels que reçus, une fois la cause
 * corrigée ; elle est alors une réponse obtenue dans la fenêtre. » La garde des métadonnées de
 * réception à côté des octets, et `stockerEnAttente` (`pnpm interrogation:stocker`), qui passe par
 * le même chemin que le stockage du run.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { adaptateurSimule } from "../../pipeline/interrogation/editeur-simule.ts";
import { instantParis } from "../../pipeline/interrogation/heure-paris.ts";
import { JournalIllisible, JournalRequete, nomJournal, nomOctets, nomReception, type Reception } from "../../pipeline/interrogation/journal.ts";
import { codeSortieStockage, RequeteInconnue } from "../../pipeline/interrogation/stocker.ts";
import { empreinteOctets } from "../../pipeline/interrogation/tentatives.ts";
import { cleDe, type ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { sha256 } from "../../validation/domaine/empreinte.ts";
import { canoniser } from "../../validation/domaine/empreinte.ts";
import { banc, plan, requete, scenarioScripte, seule, transportDe, type Banc } from "./aides.ts";

const bancs: Banc[] = [];

function nouveauBanc(racine?: string): Banc {
  const b = racine === undefined ? banc() : banc(undefined, racine);
  bancs.push(b);
  return b;
}

afterEach(() => {
  for (const b of bancs.splice(0)) b.nettoyer();
});

const ECHEC_ECRITURE = new Error("Écriture simulée en échec (schéma refusé).");

/** Le dépôt lève au moment d'écrire : la cause qu'il faudra corriger avant de stocker. */
function ecritureEnEchec(depot: { ecrire: unknown }): void {
  depot.ecrire = () => {
    throw ECHEC_ECRITURE;
  };
}

/** Le contenu du seul fichier de réponse, son identifiant (opaque, aléatoire par construction) remplacé. */
function texteSansId(b: Banc): string {
  const [nom, ...autres] = readdirSync(b.reponses);
  if (nom === undefined || autres.length > 0) throw new Error("une seule réponse attendue");
  const texte = readFileSync(join(b.reponses, nom), "utf8");
  const { id } = JSON.parse(texte) as { id: string };
  return texte.split(id).join("<id>");
}

function cleHex(): string {
  return sha256(canoniser(cleDe(requete())));
}

function journalDe(b: Banc): JournalRequete {
  mkdirSync(b.tentatives, { recursive: true });
  return new JournalRequete(b.tentatives, cleDe(requete()));
}

function lignesJournal(b: Banc): string {
  return readFileSync(join(b.tentatives, nomJournal(cleDe(requete()))), "utf8");
}

/** Un banc dont l'unique requête attend l'opérateur : réponse 200 reçue, écriture en échec. */
async function enAttenteApresEcritureEnEchec(): Promise<Banc> {
  const b = nouveauBanc();
  b.editeur("outil-alpha", scenarioScripte(["reponse"]));
  const bilan = await b.executer(plan(requete()), { depotPatch: ecritureEnEchec });
  expect(bilan.en_attente_operateur).toHaveLength(1);
  return b;
}

const HORODATAGE_DEBUT_MS = Date.parse("2026-12-01T05:10:00Z");

/** L'adaptateur qui a reçu les octets au run : celui de l'éditeur simulé du banc. */
const RECU_PAR = adaptateurSimule("cle-de-test").normalisation;

/** L'arrêt brutal après la garde (§6, 0.19) : `debut`, réception et octets gardés, rien d'autre. */
function arretApresGarde(b: Banc, numero: number, statut_http: number, octets: Uint8Array): void {
  const journal = journalDe(b);
  for (let passee = 1; passee < numero; passee += 1) {
    journal.inscrireDebut(passee, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.inscrireEchec(passee, { type: "http", message: "HTTP 503", code_http: 503 });
  }
  journal.inscrireDebut(numero, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
  const reception: Reception = {
    numero,
    statut_http,
    debut_ms: HORODATAGE_DEBUT_MS,
    reception_ms: HORODATAGE_DEBUT_MS + 1_200,
    octets_sha256: empreinteOctets(octets),
    normalisation: RECU_PAR,
  };
  journal.garderReception(reception);
  journal.garderOctets(numero, octets);
}

const CORPS_200 = new TextEncoder().encode(
  '{"id":"sim-1","type":"message","model":"modele-simule-2026-12","content":[{"type":"text","text":"Reçue avant l\'arrêt.","citations":[]}],' +
    '"stop_reason":"end_turn","usage":{"input_tokens":12,"output_tokens":34}}',
);

describe("§6 : la réception gardée avec les octets", () => {
  it("chaque réponse HTTP reçue laisse, à côté de ses octets, ses métadonnées de réception : statut, instants, empreinte", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["http_503", "reponse"]));
    await b.executer(plan(requete()));
    const journal = journalDe(b);
    const premiere = journal.lireReception(1);
    const seconde = journal.lireReception(2);
    expect(premiere).toMatchObject({ numero: 1, statut_http: 503 });
    expect(seconde).toMatchObject({ numero: 2, statut_http: 200 });
    const obtenue = seule(b.lues()) as ReponseObtenue;
    expect(seconde?.octets_sha256).toBe(obtenue.brut_octets_sha256);
    expect(premiere?.normalisation).toEqual(obtenue.normalisation);
    expect(seconde?.normalisation).toEqual(obtenue.normalisation);
    expect(instantParis(seconde?.debut_ms as number)).toBe(obtenue.metadonnees.horodatage_requete);
    expect(instantParis(seconde?.reception_ms as number)).toBe(obtenue.metadonnees.horodatage_reponse);
    expect(empreinteOctets(readFileSync(join(b.tentatives, nomOctets(cleDe(requete()), 2))))).toBe(seconde?.octets_sha256);
  });

  it("une erreur de transport (réseau) ne laisse ni octets ni réception", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["reseau", "reponse"]));
    await b.executer(plan(requete()));
    expect(existsSync(join(b.tentatives, nomReception(cleDe(requete()), 1)))).toBe(false);
    expect(existsSync(join(b.tentatives, nomOctets(cleDe(requete()), 1)))).toBe(false);
  });

  it("réception gardée sans octets (arrêt entre les deux écritures) : tentative interrompue ordinaire, renvoyée", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.garderReception({ numero: 1, statut_http: 200, debut_ms: HORODATAGE_DEBUT_MS, reception_ms: HORODATAGE_DEBUT_MS, octets_sha256: empreinteOctets(CORPS_200), normalisation: RECU_PAR });
    b.editeur("outil-alpha", scenarioScripte(["reponse"]));
    const bilan = await b.executer(plan(requete()));
    expect(bilan.en_attente_operateur).toEqual([]);
    expect(transportDe(b).interne.recues).toHaveLength(1);
    expect(seule(b.lues()).tentatives?.map((t) => t.erreur.type)).toEqual(["autre"]);
  });
});

describe("§6 : l'opérateur stocke depuis les octets gardés", () => {
  it("réponse 200 non stockable puis cause corrigée : réponse obtenue identique, octet pour octet (identifiant opaque mis à part), à celle du chemin normal", async () => {
    const direct = nouveauBanc();
    direct.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await direct.executer(plan(requete()));

    const b = await enAttenteApresEcritureEnEchec();
    expect(b.lues()).toHaveLength(0);
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues).toEqual([{ genre: "stockee", requete: cleDe(requete()), numero: 1 }]);
    expect(codeSortieStockage(bilan)).toBe(0);
    expect(texteSansId(b)).toBe(texteSansId(direct));
    const obtenue = seule(b.lues()) as ReponseObtenue;
    expect(obtenue.statut_reponse).toBe("obtenue");
    // Dans la fenêtre : l'instant de réception d'origine, non celui du stockage.
    expect(obtenue.metadonnees.horodatage_reponse).toBe(instantParis(b.fenetre.debut_ms + 1_200));
  });

  it("la réponse brute n'est jamais modifiée : octets gardés et réception intacts, empreinte stockée égale à celle des octets", async () => {
    const b = await enAttenteApresEcritureEnEchec();
    const cheminOctets = join(b.tentatives, nomOctets(cleDe(requete()), 1));
    const cheminReception = join(b.tentatives, nomReception(cleDe(requete()), 1));
    const octetsAvant = readFileSync(cheminOctets);
    const receptionAvant = readFileSync(cheminReception);
    const dateAvant = statSync(cheminOctets).mtimeMs;
    b.stocker(plan(requete()));
    expect(readFileSync(cheminOctets).equals(octetsAvant)).toBe(true);
    expect(readFileSync(cheminReception).equals(receptionAvant)).toBe(true);
    expect(statSync(cheminOctets).mtimeMs).toBe(dateAvant);
    expect((seule(b.lues()) as ReponseObtenue).brut_octets_sha256).toBe(empreinteOctets(octetsAvant));
  });

  it("stockage qui échoue encore : la requête reste en attente, refus nommé avec la cause, code 2, rien d'écrit", async () => {
    const b = await enAttenteApresEcritureEnEchec();
    const journalAvant = lignesJournal(b);
    const bilan = b.stocker(plan(requete()), { depotPatch: ecritureEnEchec });
    expect(bilan.issues).toEqual([
      { genre: "refusee", requete: cleDe(requete()), numero: 1, motif: "stockage_impossible", cause: ECHEC_ECRITURE.message },
    ]);
    expect(codeSortieStockage(bilan)).toBe(2);
    expect(b.lues()).toHaveLength(0);
    expect(lignesJournal(b)).toBe(journalAvant);

    const relance = nouveauBanc(b.racine);
    relance.editeur("outil-alpha", scenarioScripte([]));
    const execution = await relance.executer(plan(requete()));
    expect(execution.en_attente_operateur).toHaveLength(1);
    expect(transportDe(relance).interne.recues).toHaveLength(0);
  });

  it("octets sans métadonnées de réception : refus nommé sans_metadonnees, rien d'écrit, code 2", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    const chemin = journal.garderOctets(1, CORPS_200);
    journal.inscrireRecueNonStockee(1, chemin, "cause d'un run antérieur à la garde des réceptions");
    const journalAvant = lignesJournal(b);
    const fichiersAvant = readdirSync(b.tentatives).sort();
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues).toHaveLength(1);
    expect(bilan.issues[0]).toMatchObject({ genre: "refusee", numero: 1, motif: "sans_metadonnees" });
    expect(codeSortieStockage(bilan)).toBe(2);
    expect(lignesJournal(b)).toBe(journalAvant);
    expect(readdirSync(b.tentatives).sort()).toEqual(fichiersAvant);
    expect(existsSync(b.reponses) ? readdirSync(b.reponses) : []).toEqual([]);
  });

  it("garde des octets elle-même en échec (chemin_octets nul) : refus nommé sans_octets", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.inscrireRecueNonStockee(1, null, "octets non gardés : disque plein simulé");
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues[0]).toMatchObject({ genre: "refusee", numero: 1, motif: "sans_octets" });
    expect(codeSortieStockage(bilan)).toBe(2);
  });

  it("octets qui ne correspondent pas à l'empreinte de leur réception : refus nommé reception_incoherente, rien d'écrit", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.garderReception({ numero: 1, statut_http: 200, debut_ms: HORODATAGE_DEBUT_MS, reception_ms: HORODATAGE_DEBUT_MS, octets_sha256: empreinteOctets(CORPS_200), normalisation: RECU_PAR });
    journal.garderOctets(1, new TextEncoder().encode("d'autres octets que ceux de la réception"));
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues[0]).toMatchObject({ genre: "refusee", numero: 1, motif: "reception_incoherente" });
    expect(codeSortieStockage(bilan)).toBe(2);
    expect(existsSync(b.reponses) ? readdirSync(b.reponses) : []).toEqual([]);
  });

  it("octets reçus par un autre adaptateur (autre fonction) : refus nommé adaptateur_different, rien d'écrit, la requête reste en attente", async () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.garderReception({
      numero: 1,
      statut_http: 200,
      debut_ms: HORODATAGE_DEBUT_MS,
      reception_ms: HORODATAGE_DEBUT_MS + 1_200,
      octets_sha256: empreinteOctets(CORPS_200),
      normalisation: { fonction: "normaliser_editeur_reel", version: RECU_PAR.version },
    });
    const chemin = journal.garderOctets(1, CORPS_200);
    journal.inscrireRecueNonStockee(1, chemin, "écriture en échec");
    const journalAvant = lignesJournal(b);
    const fichiersAvant = readdirSync(b.tentatives).sort();
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues).toEqual([
      {
        genre: "refusee",
        requete: cleDe(requete()),
        numero: 1,
        motif: "adaptateur_different",
        cause: `octets reçus par l'adaptateur normaliser_editeur_reel ${RECU_PAR.version}, adaptateur donné ${RECU_PAR.fonction} ${RECU_PAR.version}`,
      },
    ]);
    expect(codeSortieStockage(bilan)).toBe(2);
    expect(lignesJournal(b)).toBe(journalAvant);
    expect(readdirSync(b.tentatives).sort()).toEqual(fichiersAvant);
    expect(existsSync(b.reponses) ? readdirSync(b.reponses) : []).toEqual([]);

    const relance = nouveauBanc(b.racine);
    relance.editeur("outil-alpha", scenarioScripte([]));
    expect((await relance.executer(plan(requete()))).en_attente_operateur).toHaveLength(1);
    expect(transportDe(relance).interne.recues).toHaveLength(0);
  });

  it("même fonction, autre version de l'adaptateur : refus nommé adaptateur_different", () => {
    const b = nouveauBanc();
    arretApresGarde(b, 1, 200, CORPS_200);
    const cheminReception = join(b.tentatives, nomReception(cleDe(requete()), 1));
    const reception = JSON.parse(readFileSync(cheminReception, "utf8")) as Reception;
    rmSync(cheminReception);
    journalDe(b).garderReception({ ...reception, normalisation: { fonction: RECU_PAR.fonction, version: `${RECU_PAR.version}-autre` } });
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues[0]).toMatchObject({ genre: "refusee", numero: 1, motif: "adaptateur_different" });
    expect(existsSync(b.reponses) ? readdirSync(b.reponses) : []).toEqual([]);
  });

  it("réception sans normalisation (volume antérieur) : refusée au schéma, jamais complétée, rien d'écrit", () => {
    const b = nouveauBanc();
    arretApresGarde(b, 1, 200, CORPS_200);
    const cheminReception = join(b.tentatives, nomReception(cleDe(requete()), 1));
    const { normalisation: _n, ...sans } = JSON.parse(readFileSync(cheminReception, "utf8")) as Reception;
    writeFileSync(cheminReception, JSON.stringify(sans));
    expect(() => journalDe(b).lireReception(1)).toThrow(/ErreurSchema|must have required property 'normalisation'/);
    expect(() => b.stocker(plan(requete()))).toThrow(/must have required property 'normalisation'/);
    expect(existsSync(b.reponses) ? readdirSync(b.reponses) : []).toEqual([]);
  });

  it("503 gardé : conclu en échec ordinaire (tentative comptée), puis la relance ordinaire retente comme le chemin normal", async () => {
    const normal = nouveauBanc();
    normal.editeur("outil-alpha", scenarioScripte(["http_503", "reponse"]));
    await normal.executer(plan(requete()));
    const attendue = seule(normal.lues()) as ReponseObtenue;

    const b = nouveauBanc();
    const corps503 = new TextEncoder().encode("Service Unavailable");
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(b.fenetre.debut_ms), cleDe(requete()));
    journal.garderReception({ numero: 1, statut_http: 503, debut_ms: b.fenetre.debut_ms, reception_ms: b.fenetre.debut_ms + 1_200, octets_sha256: empreinteOctets(corps503), normalisation: RECU_PAR });
    journal.garderOctets(1, corps503);
    b.editeur("outil-alpha", scenarioScripte([]));
    const avant = await b.executer(plan(requete()));
    expect(avant.en_attente_operateur).toHaveLength(1);

    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues).toEqual([
      { genre: "echec_conclu", requete: cleDe(requete()), numero: 1, erreur: { type: "http", message: "HTTP 503", code_http: 503 }, tentatives: 1 },
    ]);
    expect(codeSortieStockage(bilan)).toBe(0);
    expect(b.lues()).toHaveLength(0);
    expect(journalDe(b).reprise()).toEqual({
      genre: "tentatives",
      tentatives: [{ numero: 1, horodatage: instantParis(b.fenetre.debut_ms), erreur: { type: "http", message: "HTTP 503", code_http: 503 } }],
    });

    // La relance part de l'instant où le chemin normal a reçu le 503 : mêmes attentes, mêmes instants.
    const relance = banc(b.fenetre.debut_ms + 1_200, b.racine);
    relance.editeur("outil-alpha", scenarioScripte(["reponse"]));
    await relance.executer(plan(requete()));
    expect(transportDe(relance).interne.recues).toHaveLength(1);
    // Le corps simulé porte le rang de l'envoi pour son transport (« sim-1 » ici, « sim-2 » au chemin
    // normal) : seuls l'identifiant et ce corps diffèrent, tout le reste est identique.
    const { id: _id, brut: _brut, brut_sha256: _b, brut_octets_sha256: _o, ...reste } = seule(relance.lues()) as ReponseObtenue;
    const { id: _idA, brut: _brutA, brut_sha256: _bA, brut_octets_sha256: _oA, ...resteAttendu } = attendue;
    expect(reste).toEqual(resteAttendu);
    expect(reste.tentatives).toEqual([{ numero: 1, horodatage: instantParis(b.fenetre.debut_ms), erreur: { type: "http", message: "HTTP 503", code_http: 503 } }]);
  });

  it("503 gardé à la 3e tentative : conclu en échec, la relance écrit la manquante « echecs » sans rien envoyer", async () => {
    const b = nouveauBanc();
    arretApresGarde(b, 3, 503, new TextEncoder().encode("Service Unavailable"));
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues[0]).toMatchObject({ genre: "echec_conclu", numero: 3, tentatives: 3 });
    b.editeur("outil-alpha", scenarioScripte([]));
    await b.executer(plan(requete()));
    expect(seule(b.lues())).toMatchObject({ statut_reponse: "manquante", motif_manquante: "echecs" });
    expect(transportDe(b).interne.recues).toHaveLength(0);
  });

  it("arrêt après la garde, ligne non conclue (octets_sans_suite) : stockée de même, et la relance la saute", async () => {
    const b = nouveauBanc();
    arretApresGarde(b, 2, 200, CORPS_200);
    const bilan = b.stocker(plan(requete()));
    expect(bilan.issues).toEqual([{ genre: "stockee", requete: cleDe(requete()), numero: 2 }]);
    const obtenue = seule(b.lues()) as ReponseObtenue;
    expect(obtenue.tentatives?.map((t) => t.numero)).toEqual([1]);
    expect(obtenue.metadonnees.horodatage_requete).toBe(instantParis(HORODATAGE_DEBUT_MS));
    expect(obtenue.metadonnees.latence_ms).toBe(1_200);
    b.editeur("outil-alpha", scenarioScripte([]));
    expect(await b.executer(plan(requete()))).toEqual({ ecrites: 0, deja_ecrites: 1, en_attente_operateur: [] });
  });

  it("deuxième lancement : rien à faire, code 0, rien de réécrit", async () => {
    const b = await enAttenteApresEcritureEnEchec();
    b.stocker(plan(requete()));
    const avant = texteSansId(b);
    const journalAvant = lignesJournal(b);
    const second = b.stocker(plan(requete()));
    expect(second).toEqual({ deja_ecrites: 1, sans_attente: 0, issues: [] });
    expect(codeSortieStockage(second)).toBe(0);
    expect(texteSansId(b)).toBe(avant);
    expect(lignesJournal(b)).toBe(journalAvant);
  });

  it("--requete : ne traite que cette requête ; une requête sans attente n'est pas touchée", async () => {
    const b = nouveauBanc();
    b.editeur("outil-alpha", scenarioScripte(["reponse", "reponse"]));
    const autre = requete({ echantillon: 2 });
    await b.executer(plan(requete(), autre), { depotPatch: ecritureEnEchec });
    const bilan = b.stocker(plan(requete(), autre), { requete: cleHex() });
    expect(bilan.issues).toEqual([{ genre: "stockee", requete: cleDe(requete()), numero: 1 }]);
    expect(seule(b.lues()).echantillon).toBe(1);
  });

  it("requête inconnue du plan : refus nommé RequeteInconnue, rien d'écrit", async () => {
    const b = await enAttenteApresEcritureEnEchec();
    expect(() => b.stocker(plan(requete()), { requete: "0".repeat(64) })).toThrow(RequeteInconnue);
    expect(b.lues()).toHaveLength(0);
  });
});

describe("§6 : le journal après un échec conclu par l'opérateur", () => {
  it("un « echec » qui suit « recue_non_stockee » d'une autre tentative lève", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.inscrireRecueNonStockee(1, null, "cause");
    journal.inscrireEchec(2, { type: "http", message: "HTTP 503", code_http: 503 });
    expect(() => journal.reprise()).toThrow(JournalIllisible);
  });

  it("un « debut » qui suit directement « recue_non_stockee » lève toujours", () => {
    const b = nouveauBanc();
    const journal = journalDe(b);
    journal.inscrireDebut(1, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    journal.inscrireRecueNonStockee(1, null, "cause");
    journal.inscrireDebut(2, instantParis(HORODATAGE_DEBUT_MS), cleDe(requete()));
    expect(() => journal.reprise()).toThrow(JournalIllisible);
  });
});
