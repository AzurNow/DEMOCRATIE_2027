/**
 * Protocole 0.13, §4 « Correction de thème » (conformité n° 69) : « Une correction acceptée crée une
 * nouvelle version de la mesure : les autres items de cette mesure, jugés contre l'ancien thème,
 * retournent en attente et sont validés à nouveau sur la nouvelle version. »
 *
 * Le chemin outillé : `pnpm mesures --renvoyer=<mesure> [--ecrire]`. Il réécrit en `staging/` (là où
 * vit l'item en attente, règle 3 de CLAUDE.md) chaque autre item de la mesure, épinglé sur la
 * nouvelle version ; le lot qui l'avait jugé ne le juge plus (il épingle une version dépassée), et
 * l'item rentre dans la réserve d'un prochain lot. Les décisions déjà prises restent au journal,
 * intactes : elles sont supersédées par la version, sur le modèle de la réannotation, jamais effacées.
 *
 * Cas limites : X demande la correction, Y (même mesure, autre candidat) est renvoyé ; ses anciennes
 * décisions restent au journal ; relancer la commande ne fait rien de plus (idempotence).
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema, JsonIllisible } from "../outils/schemas/valider.ts";
import type { DecisionCorrectionMesure } from "../validation/domaine/corrections-mesure.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import {
  correctionAppliquee,
  lotJugeEncore,
  planifierRenvois,
  repinglerSurMesure,
  RenvoiSansCorrectionAppliquee,
  type ContexteRenvoi,
  type JugementEnCours,
} from "../validation/domaine/renvoi-mesure.ts";
import type { Correction, EntreeDecision, Item } from "../validation/domaine/types.ts";
import { ajouterAuRegistre } from "../validation/io/mesures-fichier.ts";
import { ItemStagingModifie, reecrireItemStaging } from "../validation/io/staging-renvoi.ts";
import { creerBac, lotDe, type Bac } from "./aides/bac.ts";
import { commiterTout, executerOutil, head, initialiserDepot } from "./aides/depot.ts";
import { decision, itemP, mesure } from "./aides/fabriques.ts";

const MESURE_ID = "01JBANCESSA90000000MESVRE1";
const THEME_DEMANDE = "ecologie_energie";

const CORRECTION_THEME: Correction = {
  cible: "mesure",
  chemin: "/theme",
  ancienne_valeur: "fiscalite_pouvoir_achat",
  nouvelle_valeur: THEME_DEMANDE,
};

const ACCEPTATION: DecisionCorrectionMesure = {
  mesure_id: MESURE_ID,
  mesure_version: 1,
  theme_demande: THEME_DEMANDE,
  decision: "acceptee",
  date: "2026-11-20",
};

/** La mesure après la correction acceptée : nouvelle version, thème demandé. */
const MESURE_V2 = mesure({ id: MESURE_ID, version: 2, theme: THEME_DEMANDE });

/** X : l'item dont les deux annotateurs ont demandé la correction de thème. */
const X = itemP({ id: "01JBANCESSA1000000000TEMX1", candidat_id: "demo-alpha" });
/** Y : même mesure, autre candidat, jugé contre l'ancien thème. */
const Y = itemP({ id: "01JBANCESSA1000000000TEMY1", candidat_id: "demo-beta" });
/** Z : même mesure, encore dans aucun lot. */
const Z = itemP({ id: "01JBANCESSA1000000000TEMZ1", candidat_id: "demo-gamma" });

function demandes(item: Item): readonly EntreeDecision[] {
  return ["a1", "a2"].map((annotateur_id) =>
    decision({ annotateur_id, item, decision: "corriger", corrections: [CORRECTION_THEME] }),
  );
}

function acceptations(item: Item, annotateurs: readonly string[] = ["a1", "a2"]): readonly EntreeDecision[] {
  return annotateurs.map((annotateur_id) => decision({ annotateur_id, item, decision: "accepter" }));
}

function jugement(decisions: readonly EntreeDecision[]): JugementEnCours {
  return { lot_id: "lot-001", annotateurs: ["a1", "a2"], decisions };
}

function contexte(surcharges: Partial<ContexteRenvoi> = {}): ContexteRenvoi {
  return {
    mesure: MESURE_V2,
    items: [X, Y, Z],
    publies: new Set(),
    jugements: new Map([
      [X.id, jugement(demandes(X))],
      [Y.id, jugement(acceptations(Y))],
    ]),
    registre: [ACCEPTATION],
    ...surcharges,
  };
}

const TRACE = { commit: "c".repeat(40), horodatage: "2026-11-21T09:00:00+01:00", decision: ACCEPTATION };

/* ------------------------------------------------------------------ domaine */

describe("correctionAppliquee : le renvoi n'existe qu'après une correction acceptée et appliquée", () => {
  it("rend la décision du registre quand la mesure porte le thème accepté", () => {
    expect(correctionAppliquee([ACCEPTATION], MESURE_V2)).toEqual(ACCEPTATION);
  });

  it("refuse une mesure dont le registre n'accepte aucune correction", () => {
    expect(() => correctionAppliquee([], MESURE_V2)).toThrow(RenvoiSansCorrectionAppliquee);
  });

  it("refuse une acceptation que la mesure ne porte pas encore", () => {
    const encoreV1 = mesure({ id: MESURE_ID, version: 1 });
    expect(() => correctionAppliquee([ACCEPTATION], encoreV1)).toThrow(RenvoiSansCorrectionAppliquee);
  });

  it("refuse une correction refusée, même si la mesure porte ce thème", () => {
    const refus: DecisionCorrectionMesure = { ...ACCEPTATION, decision: "refusee", motif: "Le thème d'origine est juste." };
    expect(() => correctionAppliquee([refus], MESURE_V2)).toThrow(RenvoiSansCorrectionAppliquee);
  });
});

describe("planifierRenvois : qui retourne en attente", () => {
  function sorts(ctx: ContexteRenvoi): Record<string, string> {
    return Object.fromEntries(planifierRenvois(ctx).map((renvoi) => [renvoi.item.id, renvoi.sort]));
  }

  it("Y, jugé par les deux contre l'ancien thème, et Z, hors lot, sont renvoyés ; X, demandeur, ne l'est pas", () => {
    expect(sorts(contexte())).toEqual({ [X.id]: "demandeur", [Y.id]: "renvoyer", [Z.id]: "renvoyer" });
  });

  it("Y décidé par un seul annotateur attend la fin de son lot : décisions incomplètes", () => {
    const ctx = contexte({ jugements: new Map([[X.id, jugement(demandes(X))], [Y.id, jugement(acceptations(Y, ["a1"]))]]) });
    expect(sorts(ctx)[Y.id]).toBe("decisions_incompletes");
  });

  it("Y déjà publié dans data/ n'est pas renvoyé par ce chemin (décision de l'auteur du 2026-09-28 : contestation et panel) : il est nommé", () => {
    expect(sorts(contexte({ publies: new Set([Y.id]) }))[Y.id]).toBe("publie");
  });

  it("un item déjà épinglé sur la version courante n'est plus planifié : idempotence", () => {
    const repingle = repinglerSurMesure(Y, MESURE_V2, TRACE);
    expect(sorts(contexte({ items: [X, repingle, Z] }))).toEqual({ [X.id]: "demandeur", [Z.id]: "renvoyer" });
  });

  it("un item d'une autre mesure n'est jamais planifié", () => {
    const autre = itemP({ id: "01JBANCESSA1000000000TEMW1", mesure_id: "01JBANCESSA90000000MESVRE9" });
    expect(sorts(contexte({ items: [autre] }))).toEqual({});
  });

  it("un seul annotateur portant la demande acceptée suffit à faire de l'item un demandeur", () => {
    const [demande] = demandes(X);
    if (demande === undefined) throw new Error("demande absente");
    const mixte = [demande, decision({ annotateur_id: "a2", item: X, decision: "accepter" })];
    expect(sorts(contexte({ jugements: new Map([[X.id, jugement(mixte)]]) }))[X.id]).toBe("demandeur");
  });
});

describe("repinglerSurMesure : la nouvelle version de l'item", () => {
  const repingle = repinglerSurMesure(Y, MESURE_V2, TRACE);

  it("épingle la nouvelle version de la mesure et incrémente la version de l'item", () => {
    expect([repingle.mesure_version, repingle.version]).toEqual([2, Y.version + 1]);
  });

  it("recalcule l'empreinte : la version de la mesure fait partie du contenu notant (§4)", () => {
    expect(repingle.empreinte).toBe(empreinteContenuNotant(repingle));
    expect(repingle.empreinte).not.toBe(Y.empreinte);
  });

  it("reste en attente, sans rien changer d'autre que l'épinglage, la version, l'empreinte et l'historique", () => {
    const { mesure_version: _m, version: _v, empreinte: _e, historique: _h, ...reste } = repingle;
    const { mesure_version: _m2, version: _v2, empreinte: _e2, historique: _h2, ...avant } = Y;
    expect(repingle.statut_validation).toBe("en_attente");
    expect(reste).toEqual(avant);
  });

  it("ajoute une entrée d'historique qui nomme la décision du registre", () => {
    const historique = repingle.historique as readonly Record<string, unknown>[];
    expect(historique.slice(0, -1)).toEqual(Y.historique);
    expect(historique.at(-1)).toEqual({
      date: TRACE.horodatage,
      changement: "renvoi en attente : mesure 01JBANCESSA90000000MESVRE1 en version 2",
      motif:
        // Protocole 0.13 : « épinglait » et non « avait été jugé » — Z, renvoyé lui aussi, n'a été jugé
        // dans aucun lot ; la trace publiée dit ce qui est vrai de tous les items renvoyés.
        "correction de thème acceptée au registre le 2026-11-20 (thème ecologie_energie) : l'item " +
        "épinglait la version 1 de la mesure (§4, protocole 0.13)",
      commit: TRACE.commit,
      version_resultante: Y.version + 1,
    });
  });

  it("est conforme à item.schema.json", () => {
    expect(erreurDeSchema("item", repingle, "test")).toBeNull();
  });
});

describe("cas limites du renvoi (protocole 0.13, ajoutés avec le module)", () => {
  it("Y dans un lot où personne ne l'a encore jugé attend la fin de son lot", () => {
    const ctx = contexte({ jugements: new Map([[X.id, jugement(demandes(X))], [Y.id, jugement([])]]) });
    expect(planifierRenvois(ctx).find((renvoi) => renvoi.item.id === Y.id)?.sort).toBe("decisions_incompletes");
  });

  it("Y dont les décisions demandent un autre thème n'est pas demandeur : il est renvoyé", () => {
    const autre: Correction = { ...CORRECTION_THEME, nouvelle_valeur: "sante" };
    const demandesAutres = ["a1", "a2"].map((annotateur_id) =>
      decision({ annotateur_id, item: Y, decision: "corriger", corrections: [autre] }),
    );
    const ctx = contexte({ jugements: new Map([[Y.id, jugement(demandesAutres)]]) });
    expect(planifierRenvois(ctx).find((renvoi) => renvoi.item.id === Y.id)?.sort).toBe("renvoyer");
  });

  it("un lot sans annotateur n'est jamais tenu pour complet", () => {
    const vide: JugementEnCours = { lot_id: "lot-001", annotateurs: [], decisions: [] };
    const ctx = contexte({ jugements: new Map([[Y.id, vide]]) });
    expect(planifierRenvois(ctx).find((renvoi) => renvoi.item.id === Y.id)?.sort).toBe("decisions_incompletes");
  });

  it("nomme le lot qui juge encore l'item, et « null » hors lot", () => {
    const lots = Object.fromEntries(planifierRenvois(contexte()).map((renvoi) => [renvoi.item.id, renvoi.lot_id]));
    expect(lots).toEqual({ [X.id]: "lot-001", [Y.id]: "lot-001", [Z.id]: null });
  });

  it("un item qui épingle une version de mesure postérieure à la courante arrête tout", () => {
    const futur = itemP({ id: "01JBANCESSA1000000000TEMV1", mesure_version: 3 });
    expect(() => planifierRenvois(contexte({ items: [futur] }))).toThrow(/postérieure à sa version courante/);
  });

  it("repinglerSurMesure refuse un item qui n'est pas en attente", () => {
    expect(() => repinglerSurMesure({ ...Y, statut_validation: "verifie" }, MESURE_V2, TRACE)).toThrow(/en attente/);
  });

  it("lotJugeEncore : le lot qui épingle la version d'avant le renvoi ne juge plus l'item, un lot qui épingle la nouvelle le juge", () => {
    const repingle = repinglerSurMesure(Y, MESURE_V2, TRACE);
    expect(lotJugeEncore(repingle, { item_version: Y.version })).toBe(false);
    expect(lotJugeEncore(repingle, { item_version: repingle.version })).toBe(true);
  });

  it("lotJugeEncore : une version changée sans renvoi reste jugée par son lot (règle de concordance intacte : versions différentes ⇒ arbitrage)", () => {
    expect(lotJugeEncore({ ...Y, version: Y.version + 1 }, { item_version: Y.version })).toBe(true);
  });
});

describe("reecrireItemStaging : l'écriture du renvoi dans staging/", () => {
  it("refuse si le fichier a changé depuis sa lecture, et n'écrit rien", () => {
    const bac = creerBac();
    try {
      bac.ecrireItem(Y);
      const deplace = { ...Y, version: Y.version + 5 };
      bac.ecrireItem(deplace);
      const avant = lireStaging(bac, Y);
      expect(() => reecrireItemStaging(join(bac.racine, "staging"), Y, repinglerSurMesure(Y, MESURE_V2, TRACE))).toThrow(
        ItemStagingModifie,
      );
      expect(lireStaging(bac, Y)).toBe(avant);
    } finally {
      bac.detruire();
    }
  });

  it("un item de staging illisible lève JsonIllisible qui nomme son chemin, et n'écrit rien (constat 26)", () => {
    const bac = creerBac();
    try {
      const chemin = join(bac.racine, "staging/items", `${Y.id}.json`);
      writeFileSync(chemin, "{ pas du json", "utf8");
      const appel = (): void => reecrireItemStaging(join(bac.racine, "staging"), Y, repinglerSurMesure(Y, MESURE_V2, TRACE));
      expect(appel).toThrow(JsonIllisible);
      expect(appel).toThrow(chemin);
      expect(readFileSync(chemin, "utf8")).toBe("{ pas du json");
      expect(readdirSync(join(bac.racine, "staging/items"))).toEqual([`${Y.id}.json`]);
    } finally {
      bac.detruire();
    }
  });

  it("refuse un item non conforme au schéma, et n'écrit rien", () => {
    const bac = creerBac();
    try {
      bac.ecrireItem(Y);
      const avant = lireStaging(bac, Y);
      const fautif = { ...repinglerSurMesure(Y, MESURE_V2, TRACE), mesure_version: 0 };
      expect(() => reecrireItemStaging(join(bac.racine, "staging"), Y, fautif)).toThrow(/mesure_version/);
      expect(lireStaging(bac, Y)).toBe(avant);
    } finally {
      bac.detruire();
    }
  });
});

/* ------------------------------------------------------------ `pnpm mesures --renvoyer` */

function chemins(bac: Bac): readonly string[] {
  return [
    `--racine=${bac.racine}`,
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
    `--data=${join(bac.racine, "data/items")}`,
  ];
}

/** Un dépôt jetable où X et Y ont été jugés dans lot-001 contre la version 1, et où la mesure est passée en version 2. */
function preparer(): Bac {
  const bac = creerBac();
  bac.ecrireItem(X);
  bac.ecrireItem(Y);
  bac.ecrireMesure(MESURE_V2);
  // Décision D53 (1) : la version 2, issue de la correction de thème acceptée, est relue à son tour.
  bac.relireMesure(MESURE_V2);
  bac.ecrireLot(lotDe("lot-001", [X, Y]));
  for (const entree of [...demandes(X), ...acceptations(Y)]) bac.journal(entree.annotateur_id).ajouter("lot-001", entree);
  ajouterAuRegistre(join(bac.racine, "validation/mesures"), ACCEPTATION);
  initialiserDepot(bac.racine);
  return bac;
}

function lireStaging(bac: Bac, item: Item): string {
  return readFileSync(join(bac.racine, "staging/items", `${item.id}.json`), "utf8");
}

function journaux(bac: Bac): string {
  const repertoire = join(bac.racine, "validation/decisions");
  return readdirSync(repertoire, { recursive: true })
    .map(String)
    .sort()
    .map((nom) => {
      try {
        return `${nom}\n${readFileSync(join(repertoire, nom), "utf8")}`;
      } catch (erreur) {
        if ((erreur as NodeJS.ErrnoException).code === "EISDIR") return nom;
        throw erreur;
      }
    })
    .join("\n");
}

describe("`pnpm mesures --renvoyer`", () => {
  it("simule par défaut : nomme Y et X, n'écrit rien", () => {
    const bac = preparer();
    try {
      const avant = lireStaging(bac, Y);
      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`]);
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toMatch(new RegExp(`Renvoyés en attente : 1[\\s\\S]*${Y.id}`));
      expect(resultat.sortie).toMatch(new RegExp(`Demandeurs[^\\n]*: 1[\\s\\S]*${X.id}`));
      expect(resultat.sortie).toMatch(/Simulation/);
      expect(lireStaging(bac, Y)).toBe(avant);
    } finally {
      bac.detruire();
    }
  });

  it("avec --ecrire : Y repasse en attente sur la version 2, ses décisions restent au journal, lot-001 ne le juge plus, il rentre dans la réserve", () => {
    const bac = preparer();
    try {
      const journalAvant = journaux(bac);
      const xAvant = lireStaging(bac, X);
      const ecriture = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]);
      expect(ecriture.status).toBe(0);

      const y = JSON.parse(lireStaging(bac, Y)) as Item;
      expect([y.statut_validation, y.mesure_version, y.version]).toEqual(["en_attente", 2, Y.version + 1]);
      expect((y.historique as readonly { commit: string }[]).at(-1)?.commit).toBe(head(bac.racine));
      expect(lireStaging(bac, X)).toBe(xAvant);
      expect(journaux(bac)).toBe(journalAvant);

      commiterTout(bac.racine, "renvoi");
      const promotion = executerOutil("promote.ts", chemins(bac));
      expect(promotion.status).toBe(0);
      expect(promotion.sortie).toMatch(new RegExp(`À promouvoir : 1\\n  ${X.id}`));
      expect(promotion.sortie).toMatch(new RegExp(`Renvoyés en attente[^\\n]*: 1\\n  ${Y.id}[^\\n]*lot-001[^\\n]*version 1[^\\n]*version 2`));

      const lots = executerOutil("lots.ts", [
        `--staging=${join(bac.racine, "staging")}`,
        `--lots=${join(bac.racine, "validation/lots")}`,
        `--data=${join(bac.racine, "data/items")}`,
        "--annotateurs=a1,a2",
        "--graine=g",
      ]);
      expect(lots.status).toBe(0);
      expect(lots.sortie).toMatch(/^1 item\(s\) disponible\(s\)/);
    } finally {
      bac.detruire();
    }
  });

  it("relancée, elle ne fait rien de plus (idempotence)", () => {
    const bac = preparer();
    try {
      expect(executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]).status).toBe(0);
      commiterTout(bac.racine, "renvoi");
      const apres = lireStaging(bac, Y);

      const seconde = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]);
      expect(seconde.status).toBe(0);
      expect(seconde.sortie).toMatch(/Renvoyés en attente : 0/);
      expect(lireStaging(bac, Y)).toBe(apres);
    } finally {
      bac.detruire();
    }
  });

  it("refuse d'écrire sur un arbre Git non propre", () => {
    const bac = preparer();
    try {
      writeFileSync(join(bac.racine, "trace.txt"), "modification non commitée\n");
      const avant = lireStaging(bac, Y);
      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/Arbre Git non propre/);
      expect(lireStaging(bac, Y)).toBe(avant);
    } finally {
      bac.detruire();
    }
  });

  it("refuse une mesure sans correction acceptée et appliquée, en le disant", () => {
    const bac = preparer();
    try {
      const resultat = executerOutil("mesures.ts", [
        ...chemins(bac),
        `--mesures=${join(bac.racine, "validation/mesures-vide")}`,
        `--renvoyer=${MESURE_ID}`,
      ]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.erreur).toMatch(/aucune correction de thème acceptée/);
    } finally {
      bac.detruire();
    }
  });

  it("seconde correction : le lot qui épingle l'item d'avant le premier renvoi ne le juge plus, seul son nouveau lot compte", () => {
    const bac = preparer();
    try {
      expect(executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]).status).toBe(0);
      const yV2 = JSON.parse(lireStaging(bac, Y)) as Item;
      // lot-002 reprend Y dans sa nouvelle version ; a1 seul l'a jugé. Puis la mesure passe en version 3.
      bac.ecrireLot(lotDe("lot-002", [yV2]));
      bac.journal("a1").ajouter("lot-002", decision({ annotateur_id: "a1", lot_id: "lot-002", item: yV2, decision: "accepter" }));
      bac.ecrireMesure(mesure({ id: MESURE_ID, version: 3, theme: "sante" }));
      ajouterAuRegistre(join(bac.racine, "validation/mesures"), { ...ACCEPTATION, mesure_version: 2, theme_demande: "sante", date: "2026-12-01" });
      commiterTout(bac.racine, "seconde correction");

      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`]);
      expect(resultat.sortie).toMatch(new RegExp(`décisions incomplètes[^\\n]*: 1\\n  ${Y.id}  \\[lot-002\\]`));
    } finally {
      bac.detruire();
    }
  });

  it("un item encore en cours de jugement ou déjà publié est nommé, et la commande sort en erreur sans l'écrire", () => {
    const bac = creerBac();
    try {
      bac.ecrireItem(X);
      bac.ecrireItem(Y);
      bac.ecrireMesure(MESURE_V2);
      bac.ecrireLot(lotDe("lot-001", [X, Y]));
      for (const entree of [...demandes(X), ...acceptations(Y, ["a1"])]) bac.journal(entree.annotateur_id).ajouter("lot-001", entree);
      ajouterAuRegistre(join(bac.racine, "validation/mesures"), ACCEPTATION);
      initialiserDepot(bac.racine);
      const avant = lireStaging(bac, Y);

      const resultat = executerOutil("mesures.ts", [...chemins(bac), `--renvoyer=${MESURE_ID}`, "--ecrire"]);
      expect(resultat.status).not.toBe(0);
      expect(resultat.sortie).toMatch(new RegExp(`décisions incomplètes[^\\n]*: 1\\n  ${Y.id}  \\[lot-001\\]`));
      expect(lireStaging(bac, Y)).toBe(avant);
    } finally {
      bac.detruire();
    }
  });
});
