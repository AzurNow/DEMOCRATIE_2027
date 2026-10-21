/**
 * Tests d'intégration sur les vraies routes : porte d'entraînement, retrait d'un item contesté,
 * vérification d'empreinte d'archive, et absence de ressource distante.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rejouer } from "../validation/domaine/journal.ts";
import { servirArchive } from "../validation/io/archives.ts";
import { ROUTES, type Reponse } from "../validation/serveur/routes.ts";
import type { Contexte } from "../validation/serveur/contexte.ts";
import { creerBac, lotDe, mesurePour, type Bac } from "./aides/bac.ts";
import { decision, GRILLE_TOUT_VRAI, itemP } from "./aides/fabriques.ts";
import type { Item } from "../validation/domaine/types.ts";

let bac: Bac;
let items: Item[];

function appeler(contexte: Contexte, nom: string, params: readonly string[] = [], corps: unknown = null): Reponse {
  const route = ROUTES.find((candidate) => candidate.nom === nom);
  if (route === undefined) throw new Error(`Route inconnue : ${nom}`);
  return route.gestionnaire(contexte, params, corps);
}

beforeEach(() => {
  bac = creerBac();
  items = [
    itemP({ id: "01JBANCESSA100000001TEM0A1", candidat_id: "demo-alpha" }),
    itemP({ id: "01JBANCESSA100000001TEM0B2", candidat_id: "demo-beta" }),
  ];
  for (const item of items) {
    bac.ecrireItem(item);
    bac.ecrireMesure(mesurePour(item));
  }
  bac.ecrireLot(lotDe("ent-001", items, "entrainement"));
  bac.ecrireLot(lotDe("lot-002", items, "reel"));
});

afterEach(() => {
  bac.detruire();
});

describe("porte d'entraînement (§4)", () => {
  it("refuse un lot réel tant que l'entraînement n'est pas fini", () => {
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean; motif_inaccessible: string | null }[];
    };
    const reel = corps.lots.find((lot) => lot.lot_id === "lot-002");
    expect(reel?.accessible).toBe(false);
    expect(reel?.motif_inaccessible).toContain("ent-001");
  });

  it("laisse l'entraînement accessible, évidemment", () => {
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean }[];
    };
    expect(corps.lots.find((lot) => lot.lot_id === "ent-001")?.accessible).toBe(true);
  });

  it("ouvre le lot réel une fois l'entraînement terminé", () => {
    const journal = bac.journal("a1");
    for (const item of items) {
      journal.ajouter(
        "ent-001",
        decision({ annotateur_id: "a1", item, decision: "accepter", lot_id: "ent-001", lot_nature: "entrainement" }),
      );
    }
    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean }[];
    };
    expect(corps.lots.find((lot) => lot.lot_id === "lot-002")?.accessible).toBe(true);
  });

  it("la vue d'un lot réel porte elle aussi le blocage", () => {
    const corps = appeler(bac.contexte("a1"), "lot", ["lot-002"]).corps as {
      accessible: boolean;
      motif_inaccessible: string | null;
    };
    expect(corps.accessible).toBe(false);
    expect(corps.motif_inaccessible).not.toBeNull();
  });
});

/**
 * Un item « contestee » porte au moins une contestation (`item.schema.json`) : sans elle, la
 * lecture de `staging/` le refuse désormais comme non conforme.
 */
function contester(item: Item): Item {
  return {
    ...item,
    statut_contestation: "contestee",
    contestations: [
      {
        id: "01JBANCESSA1C0NTESTAT10N01",
        date_reception: "2026-09-25T09:00:00+02:00",
        texte: "Texte de contestation fictif.",
        contestataire_type: "campagne",
        // Protocole 0.10, §4 : le masquage des coordonnées est publié, booléen exigé par le schéma.
        caviardage: false,
      },
    ],
  };
}

describe("item contesté (§4, droit de réponse)", () => {
  // Revue du 2026-10-12, constat 13 : un GET ne doit plus jamais écrire au journal, lot ouvert
  // ou figé. Le retrait est montré par le 409, journalisé seulement à la prochaine écriture.
  it("sort du lot dès l'affichage, et un GET n'écrit jamais rien au journal (constat 13)", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    const contexte = bac.contexte("a1");

    const premiere = appeler(contexte, "item", ["ent-001", conteste.id]);
    expect(premiere.statut).toBe(409);
    expect((premiere.corps as { retire: boolean }).retire).toBe(true);

    const seconde = appeler(contexte, "item", ["ent-001", conteste.id]);
    expect(seconde.statut).toBe(409);

    expect(bac.journal("a1").lire("ent-001")).toHaveLength(0);
  });

  it("refuse aussi la décision sur un item contesté, et journalise son retrait une seule fois", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    const reponse = appeler(bac.contexte("a1"), "decision", [], {
      lot_id: "ent-001",
      item_id: conteste.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.statut).toBe(409);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees).toHaveLength(1);
    expect(entrees[0]?.type_entree).toBe("retrait_item");
  });

  it("une décision sur un autre item écrit d'abord le retrait en attente, une seule fois (constat 13)", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    const contexte = bac.contexte("a1");
    const autre = items[1] as Item;

    const soumettreAutre = (verdict: string): Reponse =>
      appeler(contexte, "decision", [], {
        lot_id: "ent-001",
        item_id: autre.id,
        decision: verdict,
        reponses_grille: GRILLE_TOUT_VRAI,
        corrections: [],
        duree_affichage_ms: 1000,
        duree_active_ms: 900,
      });

    expect(soumettreAutre("accepter").statut).toBe(201);
    const apresPremiere = bac.journal("a1").lire("ent-001");
    expect(apresPremiere.map((entree) => entree.type_entree)).toEqual(["retrait_item", "decision"]);
    expect((apresPremiere[0] as { item_id: string }).item_id).toBe(conteste.id);

    expect(soumettreAutre("rejeter").statut).toBe(201);
    const apresSeconde = bac.journal("a1").lire("ent-001");
    expect(apresSeconde.map((entree) => entree.type_entree)).toEqual(["retrait_item", "decision", "decision"]);
  });

  it("une contestation reçue après la décision ne défait pas la décision (D55 (6), relecture)", () => {
    const premier = items[0] as Item;
    const second = items[1] as Item;
    bac.journal("a1").ajouter(
      "ent-001",
      decision({ annotateur_id: "a1", item: premier, decision: "accepter", lot_id: "ent-001", lot_nature: "entrainement" }),
    );

    const conteste = contester(premier);
    bac.ecrireItem(conteste);

    const reponse = appeler(bac.contexte("a1"), "decision", [], {
      lot_id: "ent-001",
      item_id: second.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(reponse.statut).toBe(201);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees.map((entree) => entree.type_entree)).toEqual(["decision", "decision"]);

    const corps = appeler(bac.contexte("a1"), "lot", ["ent-001"]).corps as {
      progression: { total: number; decides: number; retires: number; restants: number; termine: boolean };
    };
    expect(corps.progression).toEqual({ total: 2, decides: 2, retires: 0, restants: 0, termine: true });
  });

  it("l'item retiré sort du dénominateur du kappa, et n'est pas compté comme un désaccord", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);

    // Les deux annotateurs décident l'item restant, et rencontrent l'item contesté.
    for (const annotateur of ["a1", "a2"]) {
      const contexte = bac.contexte(annotateur);
      appeler(contexte, "item", ["lot-002", conteste.id]);
      bac.journal(annotateur).ajouter(
        "lot-002",
        decision({
          annotateur_id: annotateur,
          item: items[1] as Item,
          decision: "accepter",
          lot_id: "lot-002",
        }),
      );
    }

    const corps = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]).corps as {
      les_deux_ont_fini: boolean;
      kappa: { n: number };
    };
    expect(corps.les_deux_ont_fini).toBe(true);
    expect(corps.kappa.n).toBe(1);
  });
});

/**
 * Revue du 2026-10-12, constat 13 : le retrait d'un item contesté ne s'écrit par aucune route sur
 * un lot figé par les deux annotateurs, et un GET ne le journalise jamais, qu'il soit rencontré
 * avant ou après le gel du lot.
 */
describe("lot figé : le retrait ne s'écrit par aucune route (constat 13)", () => {
  it("GET sur un item contesté jamais vu, lot figé par les deux annotateurs : 409, journal inchangé", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    for (const annotateur of ["a1", "a2"]) {
      bac.journal(annotateur).ajouter(
        "lot-002",
        decision({ annotateur_id: annotateur, item: items[1] as Item, decision: "accepter", lot_id: "lot-002" }),
      );
    }

    const reponse = appeler(bac.contexte("a1"), "item", ["lot-002", conteste.id]);
    expect(reponse.statut).toBe(409);
    expect((reponse.corps as { retire: boolean }).retire).toBe(true);
    // Seule l'entrée de décision sur items[1], écrite par le test lui-même, est présente.
    expect(bac.journal("a1").lire("lot-002")).toHaveLength(1);
  });

  it("décision et annulation sur un lot figé : le verrou passe avant tout retrait en attente, rien n'est écrit", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    for (const annotateur of ["a1", "a2"]) {
      bac.journal(annotateur).ajouter(
        "lot-002",
        decision({ annotateur_id: annotateur, item: items[1] as Item, decision: "accepter", lot_id: "lot-002" }),
      );
    }
    const avant = bac.journal("a1").lire("lot-002");

    const decisionReponse = appeler(bac.contexte("a1"), "decision", [], {
      lot_id: "lot-002",
      item_id: conteste.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
    expect(decisionReponse.statut).toBe(409);
    expect((decisionReponse.corps as { erreur?: string }).erreur).toContain("réannotation");

    const annulationReponse = appeler(bac.contexte("a1"), "annulation", [], { lot_id: "lot-002" });
    expect(annulationReponse.statut).toBe(409);
    expect((annulationReponse.corps as { erreur?: string }).erreur).toContain("réannotation");

    expect(bac.journal("a1").lire("lot-002")).toEqual(avant);
  });
});

/**
 * Revue du 2026-10-12, constat 13 : un item contesté qu'un GET a montré comme retiré sans le
 * journaliser doit quand même être sauté par `vueLot`/`itemCourant`, et compté par sa
 * progression — sinon l'annotateur resterait bloqué dessus.
 */
describe("vueLot et motifBlocage sautent un item contesté non journalisé (constat 13)", () => {
  it("vueLot ne propose pas l'item contesté comme item_courant, et sa progression le compte comme retiré", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);

    const corps = appeler(bac.contexte("a1"), "lot", ["ent-001"]).corps as {
      item_courant: string | null;
      progression: { total: number; decides: number; retires: number; restants: number; termine: boolean };
    };

    expect(corps.item_courant).toBe((items[1] as Item).id);
    expect(corps.progression).toEqual({ total: 2, decides: 0, retires: 1, restants: 1, termine: false });
    expect(bac.journal("a1").lire("ent-001")).toHaveLength(0);
  });

  it("motifBlocage ne reste pas bloqué sur un item d'entraînement contesté non journalisé", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    bac.journal("a1").ajouter(
      "ent-001",
      decision({
        annotateur_id: "a1",
        item: items[1] as Item,
        decision: "accepter",
        lot_id: "ent-001",
        lot_nature: "entrainement",
      }),
    );

    const corps = appeler(bac.contexte("a1"), "session").corps as {
      lots: { lot_id: string; accessible: boolean }[];
    };
    expect(corps.lots.find((lot) => lot.lot_id === "lot-002")?.accessible).toBe(true);
  });

  it("/api/session donne la même progression que /api/lots/<id> pour un item contesté non journalisé (D55 (6), relecture)", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);

    const progressionSession = (
      appeler(bac.contexte("a1"), "session").corps as {
        lots: { lot_id: string; progression: { retires: number; restants: number } }[];
      }
    ).lots.find((lot) => lot.lot_id === "ent-001")?.progression;

    const progressionLot = (
      appeler(bac.contexte("a1"), "lot", ["ent-001"]).corps as {
        progression: { retires: number; restants: number };
      }
    ).progression;

    expect(progressionSession).toEqual(progressionLot);
    expect(progressionSession).toEqual({ total: 2, decides: 0, retires: 1, restants: 1, termine: false });
  });
});

/** Contenu octet pour octet de chaque fichier de journal, par chemin relatif. */
function instantaneJournaux(): Map<string, Buffer> {
  const racine = join(bac.racine, "validation/decisions");
  const fichiers = readdirSync(racine, { recursive: true, withFileTypes: true }).filter((entree) => entree.isFile());
  return new Map(
    fichiers.map((entree) => {
      const chemin = join(entree.parentPath, entree.name);
      return [chemin, readFileSync(chemin)];
    }),
  );
}

function decideTout(annotateur: string): void {
  for (const item of items) {
    bac.journal(annotateur).ajouter(
      "lot-002",
      decision({ annotateur_id: annotateur, item, decision: "accepter", lot_id: "lot-002" }),
    );
  }
}

describe("contestation au calcul du kappa, par la route (§4, constat 9)", () => {
  it("un item contesté après les deux décisions sort du kappa sans que personne ne l'affiche", () => {
    decideTout("a1");
    decideTout("a2");
    bac.ecrireItem(contester(items[0] as Item));

    const corps = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]).corps as {
      les_deux_ont_fini: boolean;
      kappa: { n: number };
      exclus_contestation: number;
    };
    expect(corps.les_deux_ont_fini).toBe(true);
    expect(corps.kappa.n).toBe(1);
    expect(corps.exclus_contestation).toBe(1);
  });

  it("le diagnostic laisse les journaux inchangés octet pour octet, décisions de l'item exclu comprises", () => {
    decideTout("a1");
    decideTout("a2");
    bac.ecrireItem(contester(items[0] as Item));
    const avant = instantaneJournaux();
    expect(avant.size).toBe(2);

    appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]);

    expect(instantaneJournaux()).toEqual(avant);
    const decisionsExclues = bac
      .journal("a1")
      .lire("lot-002")
      .filter((entree) => entree.item_id === (items[0] as Item).id);
    expect(decisionsExclues).toHaveLength(1);
  });

  it("un item arbitré (maintien) sort aussi du kappa, sans nommer l'item", () => {
    decideTout("a1");
    decideTout("a2");
    const conteste = contester(items[0] as Item);
    const contestation = (conteste.contestations as readonly Record<string, unknown>[])[0];
    bac.ecrireItem({
      ...conteste,
      statut_contestation: "arbitree",
      contestations: [
        {
          ...contestation,
          decision_panel: {
            date: "2026-10-01T09:00:00+02:00",
            decision: "maintien",
            motivation: "Motif fictif.",
            statut_validation_anterieur: "verifie",
          },
        },
      ],
    });

    const reponse = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]);
    const corps = reponse.corps as { kappa: { n: number }; exclus_contestation: number };
    expect(reponse.statut).toBe(200);
    expect(corps.kappa.n).toBe(1);
    expect(corps.exclus_contestation).toBe(1);
    expect(JSON.stringify(corps).includes((items[0] as Item).id)).toBe(false);
  });
});

describe("le kappa n'apparaît qu'une fois les deux lots finis", () => {
  it("ne dit rien tant que le second annotateur n'a pas terminé", () => {
    for (const item of items) {
      bac.journal("a1").ajouter(
        "lot-002",
        decision({ annotateur_id: "a1", item, decision: "accepter", lot_id: "lot-002" }),
      );
    }
    const corps = appeler(bac.contexte("a1"), "diagnostic", ["lot-002"]).corps as {
      les_deux_ont_fini: boolean;
      kappa: unknown;
    };
    expect(corps.les_deux_ont_fini).toBe(false);
    expect(corps.kappa).toBeNull();
  });
});

describe("annulation par l'interface", () => {
  it("écrit une entrée d'annulation et laisse l'ancienne décision en place", () => {
    const contexte = bac.contexte("a1");
    const item = items[0] as Item;
    appeler(contexte, "decision", [], {
      lot_id: "ent-001",
      item_id: item.id,
      decision: "accepter",
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });

    const reponse = appeler(contexte, "annulation", [], { lot_id: "ent-001" });
    expect(reponse.statut).toBe(201);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees).toHaveLength(2);
    expect(rejouer(entrees).decisions.size).toBe(0);
  });

  it("répond proprement quand il n'y a rien à annuler", () => {
    expect(appeler(bac.contexte("a1"), "annulation", [], { lot_id: "ent-001" }).statut).toBe(409);
  });

  it("rien à annuler, item contesté en attente : 409, aucun retrait écrit (constat 13)", () => {
    const conteste = contester(items[0] as Item);
    bac.ecrireItem(conteste);
    expect(appeler(bac.contexte("a1"), "annulation", [], { lot_id: "ent-001" }).statut).toBe(409);
    expect(bac.journal("a1").lire("ent-001")).toHaveLength(0);
  });

  it("annuler la décision d'un autre item que celui déjà décidé puis contesté ne défait pas sa décision (D55 (6), relecture)", () => {
    const premier = items[0] as Item;
    const second = items[1] as Item;
    const journal = bac.journal("a1");
    journal.ajouter(
      "ent-001",
      decision({ annotateur_id: "a1", item: premier, decision: "accepter", lot_id: "ent-001", lot_nature: "entrainement" }),
    );
    journal.ajouter(
      "ent-001",
      decision({ annotateur_id: "a1", item: second, decision: "accepter", lot_id: "ent-001", lot_nature: "entrainement" }),
    );

    const conteste = contester(premier);
    bac.ecrireItem(conteste);

    const reponse = appeler(bac.contexte("a1"), "annulation", [], { lot_id: "ent-001" });
    expect(reponse.statut).toBe(201);
    expect((reponse.corps as { item_id: string }).item_id).toBe(second.id);

    const entrees = bac.journal("a1").lire("ent-001");
    expect(entrees.filter((entree) => entree.type_entree === "retrait_item")).toHaveLength(0);
  });
});

describe("archives servies", () => {
  it("refuse une archive dont l'empreinte ne correspond plus", () => {
    const chemin = join(bac.racine, "archive.txt");
    writeFileSync(chemin, "contenu d'origine", "utf8");
    const bonne = servirArchive({
      racine: bac.racine,
      chemin_local: "archive.txt",
      sha256: "0".repeat(64),
    });
    expect(bonne.ok).toBe(false);
    expect(bonne.ok === false && bonne.motif).toBe("empreinte_divergente");
  });

  it("refuse de sortir de la racine autorisée", () => {
    const resultat = servirArchive({
      racine: join(bac.racine, "staging"),
      chemin_local: "../../etc/passwd",
      sha256: "0".repeat(64),
    });
    expect(resultat.ok).toBe(false);
    expect(resultat.ok === false && resultat.motif).toBe("hors_perimetre");
  });

  it("sert un fichier dont l'empreinte correspond", () => {
    const contenu = "contenu archivé";
    writeFileSync(join(bac.racine, "archive.txt"), contenu, "utf8");
    const attendue = createHash("sha256").update(contenu, "utf8").digest("hex");
    const resultat = servirArchive({ racine: bac.racine, chemin_local: "archive.txt", sha256: attendue });
    expect(resultat.ok).toBe(true);
    expect(resultat.ok === true && resultat.contenu.toString("utf8")).toBe(contenu);
  });

  it("refuse un fichier absent plutôt que de servir du vide", () => {
    const resultat = servirArchive({
      racine: bac.racine,
      chemin_local: "jamais-collectee.pdf",
      sha256: "0".repeat(64),
    });
    expect(resultat.ok === false && resultat.motif).toBe("fichier_absent");
  });
});

describe("aucune ressource distante", () => {
  const racineDepot = join(import.meta.dirname, "..");

  it("le client ne référence aucune URL externe", () => {
    const fichiers = [
      "validation/client/index.html",
      "validation/client/style.css",
      "validation/client/app.ts",
      "validation/client/api.ts",
      "validation/client/source.ts",
      "validation/client/edition.ts",
    ];
    for (const fichier of fichiers) {
      const contenu = readFileSync(join(racineDepot, fichier), "utf8");
      const urls = contenu.match(/https?:\/\/[^\s"'`)]+/g) ?? [];
      expect(urls, `${fichier} référence ${urls.join(", ")}`).toEqual([]);
    }
  });

  it("la politique de sécurité de contenu n'autorise que l'origine locale", () => {
    const serveur = readFileSync(join(racineDepot, "validation/serveur/principal.ts"), "utf8");
    expect(serveur).toContain("default-src 'self'");
    expect(serveur).toContain('const ADRESSE = "127.0.0.1"');
    expect(serveur).toContain("serveur.listen(port, ADRESSE");
  });

  it("le serveur n'écoute sur aucune adresse d'écoute globale", () => {
    // Les commentaires sont écartés : l'un d'eux explique justement pourquoi 0.0.0.0 est exclu.
    const code = readFileSync(join(racineDepot, "validation/serveur/principal.ts"), "utf8")
      .split("\n")
      .filter((ligne) => !/^\s*(\*|\/\/|\/\*)/.test(ligne))
      .join("\n");
    expect(code).not.toContain("0.0.0.0");
    expect(code).not.toContain("::");
  });
});

/**
 * Décision de l'auteur du 2026-10-02, conformité n° 16, texte au §4 en 0.15 : un lot terminé par
 * ses deux annotateurs est figé, un changement d'avis passe par un lot de réannotation.
 */
describe("lot terminé : décisions figées (conformité n° 16)", () => {
  function soumettre(annotateur: string, lot_id: string, item: Item, verdict = "accepter"): Reponse {
    return appeler(bac.contexte(annotateur), "decision", [], {
      lot_id,
      item_id: item.id,
      decision: verdict,
      reponses_grille: GRILLE_TOUT_VRAI,
      corrections: [],
      duree_affichage_ms: 1000,
      duree_active_ms: 900,
    });
  }

  function decideLot(annotateur: string, lot_id: string, nature: "reel" | "entrainement" = "reel"): void {
    for (const item of items) {
      bac.journal(annotateur).ajouter(
        lot_id,
        decision({ annotateur_id: annotateur, item, decision: "accepter", lot_id, lot_nature: nature }),
      );
    }
  }

  it("refuse une décision sur un lot terminé par les deux annotateurs, et n'écrit rien au journal", () => {
    decideTout("a1");
    decideTout("a2");
    const avant = instantaneJournaux();

    const reponse = soumettre("a1", "lot-002", items[0] as Item, "rejeter");

    expect(reponse.statut).toBe(409);
    expect((reponse.corps as { erreur: string }).erreur).toContain("réannotation");
    expect(instantaneJournaux()).toEqual(avant);
  });

  it("refuse aussi l'annulation sur un lot terminé, sans rien écrire", () => {
    decideTout("a1");
    decideTout("a2");
    const avant = instantaneJournaux();

    const reponse = appeler(bac.contexte("a1"), "annulation", [], { lot_id: "lot-002" });

    expect(reponse.statut).toBe(409);
    expect((reponse.corps as { erreur: string }).erreur).toContain("réannotation");
    expect(instantaneJournaux()).toEqual(avant);
  });

  it("un seul annotateur a fini : le second décide encore, et le premier change encore d'avis", () => {
    decideTout("a1");
    expect(soumettre("a2", "lot-002", items[0] as Item).statut).toBe(201);
    expect(soumettre("a1", "lot-002", items[0] as Item, "rejeter").statut).toBe(201);
    expect(appeler(bac.contexte("a1"), "annulation", [], { lot_id: "lot-002" }).statut).toBe(201);
  });

  it("la dernière décision qui termine le lot est acceptée, la suivante est refusée", () => {
    decideTout("a1");
    bac.journal("a2").ajouter(
      "lot-002",
      decision({ annotateur_id: "a2", item: items[0] as Item, decision: "accepter", lot_id: "lot-002" }),
    );

    expect(soumettre("a2", "lot-002", items[1] as Item).statut).toBe(201);
    expect(soumettre("a2", "lot-002", items[1] as Item, "rejeter").statut).toBe(409);
    expect(soumettre("a1", "lot-002", items[0] as Item, "rejeter").statut).toBe(409);
  });

  it("un lot de réannotation qui supersède un lot terminé accepte des décisions", () => {
    decideTout("a1");
    decideTout("a2");
    bac.ecrireLot({
      ...lotDe("lot-002-r1", items, "reel"),
      nature: "reannotation",
      reannote: "lot-002",
      date_calibration: "2026-10-03",
    });

    expect(soumettre("a1", "lot-002-r1", items[0] as Item, "rejeter").statut).toBe(201);
    expect(soumettre("a2", "lot-002-r1", items[0] as Item).statut).toBe(201);
  });

  it("un lot d'entraînement suit la même règle", () => {
    decideLot("a1", "ent-001", "entrainement");
    expect(soumettre("a1", "ent-001", items[0] as Item, "rejeter").statut).toBe(201);
    decideLot("a2", "ent-001", "entrainement");

    expect(soumettre("a1", "ent-001", items[0] as Item, "rejeter").statut).toBe(409);
  });
});
