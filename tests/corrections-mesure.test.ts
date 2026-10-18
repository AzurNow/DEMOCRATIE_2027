/**
 * Registre des corrections de thème (§4, « Correction de thème »).
 *
 * Le thème appartient à la mesure, référent partagé entre candidats : un annotateur ne le
 * corrige pas, il le **demande**. L'auteur tranche, et sa décision est tracée dans un registre
 * publié en ajout seul. Quatre issues, et une seule est une promotion :
 *
 *   acceptée **et** mesure portant le thème → promotion
 *   acceptée sans mesure modifiée           → erreur bloquante
 *   refusée                                 → arbitrage, avec le motif du refus
 *   absente                                 → attente, avec son ancienneté
 *
 * L'écoulement du temps ne vaut jamais refus : une demande de quatre cents jours attend encore.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ancienneteEnJours,
  CorrectionMesureIncoherente,
  decisionApplicable,
  EntreeRegistreInvalide,
  validerEntreeRegistre,
  type DecisionCorrectionMesure,
} from "../validation/domaine/corrections-mesure.ts";
import { empreinteContenuNotant } from "../validation/domaine/empreinte.ts";
import { appliquerValidations, evaluerPromotion, VersionMesureEcart, type Dossier } from "../validation/domaine/promotion.ts";
import type { Correction, Decision, EntreeDecision, Item } from "../validation/domaine/types.ts";
import { ajouterAuRegistre, cheminRegistre, lireRegistre, RegistreIllisible } from "../validation/io/mesures-fichier.ts";
import { poserRegistreAjoutSeul, RegistreModifieDepuisLecture } from "../validation/io/relectures-fichier.ts";
import { urnSchema } from "../outils/schemas/noms.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { creerBac, lotDe, resceller, type Bac } from "./aides/bac.ts";
import { decision, itemP, mesure, OPTIONS_PROMOTION } from "./aides/fabriques.ts";

const RACINE = resolve(import.meta.dirname, "..");

function executer(script: string, arguments_: readonly string[]) {
  const resultat = spawnSync(
    process.execPath,
    ["--experimental-strip-types", join(RACINE, script), ...arguments_],
    { encoding: "utf8" },
  );
  return {
    status: resultat.status === null ? -1 : resultat.status,
    sortie: resultat.stdout,
    erreur: resultat.stderr,
  };
}

const CORRECTION_THEME: Correction = {
  cible: "mesure",
  chemin: "/theme",
  ancienne_valeur: "fiscalite_pouvoir_achat",
  nouvelle_valeur: "ecologie_energie",
};

function entree(surcharges: Partial<DecisionCorrectionMesure> = {}): DecisionCorrectionMesure {
  return {
    mesure_id: "01JBANCESSA90000000MESVRE1",
    mesure_version: 1,
    theme_demande: "ecologie_energie",
    decision: "acceptee",
    date: "2026-11-20",
    ...surcharges,
  };
}

function dossier(
  item: Item,
  decisions: readonly EntreeDecision[],
  surcharges: Partial<Dossier> = {},
): Dossier {
  return {
    item,
    mesure: mesure(),
    lot_id: "lot-001",
    lot_nature: "reel",
    decisions,
    registre_corrections_mesure: [],
    ...surcharges,
  };
}

function deuxCorrections(item: Item): readonly EntreeDecision[] {
  return [
    decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [CORRECTION_THEME] }),
    decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [CORRECTION_THEME] }),
  ];
}

/* ------------------------------------------------------ verdict, en fonction pure */

describe("decisionApplicable", () => {
  it("rend « absente » quand aucune entrée ne vise cette mesure et ce thème", () => {
    const registre = [
      entree({ mesure_id: "01JBANCESSA90000000MESVRE9" }),
      entree({ theme_demande: "sante" }),
    ];
    const resultat = decisionApplicable(registre, CORRECTION_THEME, mesure());
    expect(resultat.verdict).toBe("absente");
    expect(resultat.entree).toBeNull();
  });

  it("rend « acceptée et appliquée » quand la mesure porte le thème demandé", () => {
    const resultat = decisionApplicable([entree()], CORRECTION_THEME, mesure({ theme: "ecologie_energie" }));
    expect(resultat.verdict).toBe("acceptee_et_appliquee");
  });

  it("rend « acceptée sans mesure modifiée » quand la mesure porte encore l'ancien thème", () => {
    const resultat = decisionApplicable([entree()], CORRECTION_THEME, mesure({ theme: "fiscalite_pouvoir_achat" }));
    expect(resultat.verdict).toBe("acceptee_sans_mesure_modifiee");
  });

  it("rend « refusée » et porte le motif du refus", () => {
    const refus = entree({ decision: "refusee", motif: "le thème demandé recouvre déjà la fiscalité." });
    const resultat = decisionApplicable([refus], CORRECTION_THEME, mesure());
    expect(resultat.verdict).toBe("refusee");
    expect(resultat.entree?.motif).toBe("le thème demandé recouvre déjà la fiscalité.");
  });

  it("retient la plus récente de deux décisions sur la même mesure et le même thème", () => {
    const registre = [
      entree({ decision: "refusee", motif: "hors périmètre", date: "2026-11-20" }),
      entree({ decision: "acceptee", date: "2026-11-27" }),
    ];
    const resultat = decisionApplicable(registre, CORRECTION_THEME, mesure({ theme: "ecologie_energie" }));
    expect(resultat.verdict).toBe("acceptee_et_appliquee");
    expect(resultat.entree?.date).toBe("2026-11-27");
  });

  it("ne rapproche jamais une correction d'un autre chemin d'une entrée du registre", () => {
    const correction: Correction = { ...CORRECTION_THEME, chemin: "/libelle" };
    const resultat = decisionApplicable([entree()], correction, mesure({ theme: "ecologie_energie" }));
    expect(resultat.verdict).toBe("absente");
  });
});

describe("ancienneté d'une demande", () => {
  it("se compte en jours entiers contre un instant passé en paramètre", () => {
    expect(ancienneteEnJours("2026-11-20T10:00:00+01:00", "2026-11-27T09:00:00+01:00")).toBe(6);
    expect(ancienneteEnJours("2026-11-20T10:00:00+01:00", "2026-11-27T11:00:00+01:00")).toBe(7);
  });

  it("refuse une date illisible plutôt que de compter zéro", () => {
    expect(() => ancienneteEnJours("hier", "2026-11-27T11:00:00+01:00")).toThrow(/illisible/);
  });
});

/* --------------------------------------------------------- registre sur disque */

describe("registre en ajout seul", () => {
  function repertoireDe(bac: Bac): string {
    return join(bac.racine, "validation/mesures");
  }

  it("14. une acceptation ajoute une entrée et laisse les précédentes identiques, dans le même ordre", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      const premiere = entree({ theme_demande: "sante", date: "2026-11-02" });
      const seconde = entree({ date: "2026-11-20" });
      ajouterAuRegistre(repertoire, premiere);
      ajouterAuRegistre(repertoire, seconde);

      const registre = lireRegistre(repertoire);
      expect(registre).toHaveLength(2);
      expect(registre[0]).toEqual(premiere);
      expect(registre[1]).toEqual(seconde);
      // Ajout en fin de tableau, et rien d'autre : le fichier est exactement la sérialisation
      // des deux entrées dans leur ordre d'écriture.
      expect(readFileSync(join(repertoire, "decisions.json"), "utf8")).toBe(
        `${JSON.stringify([premiere, seconde], null, 2)}\n`,
      );
    } finally {
      bac.detruire();
    }
  });

  it("15. un refus sans motif est refusé, et rien n'est écrit", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      expect(() => ajouterAuRegistre(repertoire, entree({ decision: "refusee" }))).toThrow(/motif/);
      expect(existsSync(join(repertoire, "decisions.json"))).toBe(false);
    } finally {
      bac.detruire();
    }
  });

  it("16. un refus avec motif donne une entrée portant le motif", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      ajouterAuRegistre(repertoire, entree({ decision: "refusee", motif: "le thème reste celui de la mesure." }));
      expect(lireRegistre(repertoire)[0]?.motif).toBe("le thème reste celui de la mesure.");
    } finally {
      bac.detruire();
    }
  });

  it("17. deux décisions successives sur la même mesure et le même thème restent toutes les deux", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      ajouterAuRegistre(repertoire, entree({ decision: "refusee", motif: "prématuré", date: "2026-11-20" }));
      ajouterAuRegistre(repertoire, entree({ decision: "acceptee", date: "2026-11-27" }));
      const registre = lireRegistre(repertoire);
      expect(registre).toHaveLength(2);
      expect(registre.map((ligne) => ligne.decision)).toEqual(["refusee", "acceptee"]);
      expect(decisionApplicable(registre, CORRECTION_THEME, mesure({ theme: "ecologie_energie" })).verdict).toBe(
        "acceptee_et_appliquee",
      );
    } finally {
      bac.detruire();
    }
  });

  it("18. un registre absent est un registre vide ; un registre illisible est une erreur", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      expect(lireRegistre(repertoire)).toEqual([]);
      mkdirSync(repertoire, { recursive: true });
      writeFileSync(join(repertoire, "decisions.json"), "{ ceci n'est pas du JSON", "utf8");
      expect(() => lireRegistre(repertoire)).toThrow(RegistreIllisible);
    } finally {
      bac.detruire();
    }
  });

  it("19. une écriture concurrente est détectée par un refus nommé, sans fichier tronqué", () => {
    const bac = creerBac();
    const repertoire = repertoireDe(bac);
    try {
      const chemin = cheminRegistre(repertoire);
      mkdirSync(repertoire, { recursive: true });
      writeFileSync(chemin, "[]\n", "utf8");
      // `lu: null` simule une lecture faite avant la création du fichier par un autre processus :
      // la pose doit refuser plutôt qu'écraser la décision écrite entre-temps.
      expect(() => poserRegistreAjoutSeul(chemin, null, [entree()])).toThrow(RegistreModifieDepuisLecture);
      expect(readFileSync(chemin, "utf8")).toBe("[]\n");
      expect(ajouterAuRegistre(repertoire, entree({ theme_demande: "sante" }))).toHaveLength(1);
    } finally {
      bac.detruire();
    }
  });
});

/* ------------------------------------------- le registre décide de la promotion */

describe("promotion en fonction du registre", () => {
  it("20. demande acceptée et mesure portant le thème : promotion", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, deuxCorrections(item), {
        mesure: mesure({ theme: "ecologie_energie" }),
        registre_corrections_mesure: [entree()],
      }),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "promouvoir" && issue.statut).toBe("verifie");
  });

  it("21. demande acceptée sans mesure modifiée : erreur bloquante nommant la mesure", () => {
    const item = itemP();
    expect(() =>
      evaluerPromotion(
        dossier(item, deuxCorrections(item), {
          mesure: mesure({ theme: "fiscalite_pouvoir_achat" }),
          registre_corrections_mesure: [entree()],
        }),
        OPTIONS_PROMOTION,
      ),
    ).toThrow(CorrectionMesureIncoherente);
  });

  it("22. demande refusée : arbitrage portant le motif du refus", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, deuxCorrections(item), {
        registre_corrections_mesure: [
          entree({ decision: "refusee", motif: "la mesure porte déjà le bon thème." }),
        ],
      }),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "arbitrage" && issue.motif).toBe("correction_mesure_refusee");
    expect(issue.sort === "arbitrage" && issue.motif_refus).toBe("la mesure porte déjà le bon thème.");
  });

  it("23. demande absente : attente, avec l'ancienneté de la demande", () => {
    const item = itemP();
    const issue = evaluerPromotion(dossier(item, deuxCorrections(item)), {
      commit: "b".repeat(40),
      horodatage: "2026-10-02T10:00:00+02:00",
    });
    expect(issue.sort === "attente" && issue.motif).toBe("correction_mesure_en_attente");
    // Les décisions de la fabrique sont horodatées au 2026-09-20 à 10 h.
    expect(issue.sort === "attente" && issue.demande?.anciennete_jours).toBe(12);
  });

  it("24. une demande de quatre cents jours attend encore : jamais de refus implicite", () => {
    const item = itemP();
    const issue = evaluerPromotion(dossier(item, deuxCorrections(item)), {
      commit: "b".repeat(40),
      horodatage: "2027-10-25T10:00:00+02:00",
    });
    expect(issue.sort === "attente" && issue.motif).toBe("correction_mesure_en_attente");
    expect(issue.sort === "attente" && issue.demande?.anciennete_jours).toBe(400);
  });

  it("25. une correction de mesure visant un autre chemin que /theme laisse l'item en attente", () => {
    const item = itemP();
    const correction: Correction = { ...CORRECTION_THEME, chemin: "/libelle" };
    const issue = evaluerPromotion(
      dossier(item, [
        decision({ annotateur_id: "a1", item, decision: "corriger", corrections: [correction] }),
        decision({ annotateur_id: "a2", item, decision: "corriger", corrections: [correction] }),
      ]),
      OPTIONS_PROMOTION,
    );
    expect(issue.sort === "attente" && issue.motif).toBe("correction_mesure_en_attente");
  });
});

/*
 * Conformité n° 69 (§4.37) : « mesure et sa version » font partie du contenu notant. Après une
 * correction de thème acceptée, la mesure porte le nouveau thème dans une nouvelle version ; l'item
 * promu gardait l'ancienne `mesure_version`, et rien ne comparait l'épinglage à la mesure courante.
 */
describe("version de la mesure épinglée par l'item promu", () => {
  it("26. correction de thème acceptée : l'item promu porte la version de la mesure qui porte le thème", () => {
    const item = itemP();
    const issue = evaluerPromotion(
      dossier(item, deuxCorrections(item), {
        mesure: mesure({ theme: "ecologie_energie", version: 2 }),
        registre_corrections_mesure: [entree({ mesure_version: 1 })],
      }),
      OPTIONS_PROMOTION,
    );
    if (issue.sort !== "promouvoir") throw new Error(`promotion attendue, obtenu ${issue.sort}`);
    expect(issue.item.mesure_version).toBe(2);
    // Le contenu notant a changé (§4 : « mesure et sa version ») : nouvelle empreinte, version suivante.
    expect(issue.item.empreinte).toBe(empreinteContenuNotant(issue.item));
    expect(issue.item.empreinte).not.toBe(item.empreinte);
    expect(issue.item.version).toBe(item.version + 1);
  });

  it("27. item vérifié épinglant une version dépassée de sa mesure, sans correction : écart bloquant", () => {
    const item = itemP();
    const acceptations = [
      decision({ annotateur_id: "a1", item, decision: "accepter" }),
      decision({ annotateur_id: "a2", item, decision: "accepter" }),
    ];
    const evaluer = () =>
      evaluerPromotion(dossier(item, acceptations, { mesure: mesure({ version: 2 }) }), OPTIONS_PROMOTION);
    expect(evaluer).toThrow(VersionMesureEcart);
    expect(evaluer).toThrow(new RegExp(`${item.id}.*version 1.*version 2`));
  });

  it("28. même épinglage, versions égales : promotion sans changement de version ni d'empreinte", () => {
    const item = itemP();
    const acceptations = [
      decision({ annotateur_id: "a1", item, decision: "accepter" }),
      decision({ annotateur_id: "a2", item, decision: "accepter" }),
    ];
    const issue = evaluerPromotion(dossier(item, acceptations), OPTIONS_PROMOTION);
    if (issue.sort !== "promouvoir") throw new Error(`promotion attendue, obtenu ${issue.sort}`);
    expect(issue.item.mesure_version).toBe(1);
    expect(issue.item.version).toBe(item.version);
    expect(issue.item.empreinte).toBe(item.empreinte);
  });

  it("28 bis. contenu d'item inchangé (arbitrage retenant l'original) : l'épinglage déplacé change quand même empreinte et version", () => {
    const item = itemP();
    const promu = appliquerValidations(
      dossier(item, deuxCorrections(item), {
        mesure: mesure({ theme: "ecologie_energie", version: 2 }),
        registre_corrections_mesure: [entree({ mesure_version: 1 })],
      }),
      item,
      "verifie",
      OPTIONS_PROMOTION,
      false,
      { changement: "promotion vers data/ après arbitrage", motif: "original retenu" },
    );
    expect(promu.mesure_version).toBe(2);
    expect(promu.empreinte).toBe(empreinteContenuNotant(promu));
    expect(promu.version).toBe(item.version + 1);
  });

  it("29. un item rejeté n'engendre aucune question : son épinglage n'est ni déplacé ni bloquant", () => {
    const item = itemP();
    const rejets = [
      decision({ annotateur_id: "a1", item, decision: "rejeter" }),
      decision({ annotateur_id: "a2", item, decision: "rejeter" }),
    ];
    const issue = evaluerPromotion(dossier(item, rejets, { mesure: mesure({ version: 2 }) }), OPTIONS_PROMOTION);
    if (issue.sort !== "promouvoir") throw new Error(`promotion attendue, obtenu ${issue.sort}`);
    expect(issue.statut).toBe("rejete");
    expect(issue.item.mesure_version).toBe(1);
  });
});

/* ------------------------------------------------------- rapport de `pnpm promote` */

const JOUR_MS = 86_400_000;

/** Un horodatage antérieur de `jours` jours et une heure : la marge évite tout arrondi. */
function ilYA(jours: number): string {
  return new Date(Date.now() - jours * JOUR_MS - 3_600_000).toISOString();
}

function correctionVers(theme: string): Correction {
  return { cible: "mesure", chemin: "/theme", ancienne_valeur: "fiscalite_pouvoir_achat", nouvelle_valeur: theme };
}

interface Demande {
  readonly suffixe: string;
  readonly theme_mesure: string;
  readonly horodatage: string;
}

/**
 * Un item corrigé vers un thème, avec sa mesure propre : chaque cas du registre a besoin de sa
 * mesure, puisque c'est la mesure qui porte — ou ne porte pas — le thème demandé.
 */
function poserDemande(bac: Bac, demande: Demande): Item {
  const item = itemP({
    id: `01JBANCESSA1000000000TEM${demande.suffixe}`,
    candidat_id: `demo-${demande.suffixe}`,
    mesure_id: `01JBANCESSA90000000MESVR${demande.suffixe}`,
  });
  bac.ecrireItem(item);
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1, theme: demande.theme_mesure }));
  bac.relireMesure(mesure({ id: item.mesure_id, version: 1, theme: demande.theme_mesure }));
  for (const annotateur of ["a1", "a2"]) {
    const entreeJournal = decision({
      annotateur_id: annotateur,
      item,
      decision: "corriger",
      corrections: [correctionVers("ecologie_energie")],
    });
    bac.journal(annotateur).ajouter("lot-001", resceller({ ...entreeJournal, horodatage: demande.horodatage }));
  }
  return item;
}

function cheminsDe(bac: Bac): readonly string[] {
  return [
    `--staging=${join(bac.racine, "staging")}`,
    `--lots=${join(bac.racine, "validation/lots")}`,
    `--decisions=${join(bac.racine, "validation/decisions")}`,
    `--mesures=${join(bac.racine, "validation/mesures")}`,
  ];
}

describe("rapport de `pnpm promote`", () => {
  it("22, 23, 24. le rapport nomme le motif d'un refus et l'âge des demandes sans décision", () => {
    const bac = creerBac();
    const mesures = join(bac.racine, "validation/mesures");
    try {
      const refusee = poserDemande(bac, {
        suffixe: "51",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(3),
      });
      const recente = poserDemande(bac, {
        suffixe: "52",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(12),
      });
      const ancienne = poserDemande(bac, {
        suffixe: "53",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(400),
      });
      bac.ecrireLot(lotDe("lot-001", [refusee, recente, ancienne]));
      ajouterAuRegistre(mesures, {
        mesure_id: refusee.mesure_id,
        mesure_version: 1,
        theme_demande: "ecologie_energie",
        decision: "refusee",
        date: "2026-11-20",
        motif: "la mesure couvre déjà ce thème",
      });

      const resultat = executer("outils/promote.ts", cheminsDe(bac));
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toContain("correction_mesure_refusee");
      expect(resultat.sortie).toContain("la mesure couvre déjà ce thème");
      expect(resultat.sortie).toContain(recente.id);
      expect(resultat.sortie).toMatch(/12 jour/);
      expect(resultat.sortie).toMatch(/400 jour/);
    } finally {
      bac.detruire();
    }
  });

  it("21. une acceptation sans mesure modifiée arrête la commande avec un code non nul", () => {
    const bac = creerBac();
    try {
      const item = poserDemande(bac, {
        suffixe: "54",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(1),
      });
      bac.ecrireLot(lotDe("lot-001", [item]));
      ajouterAuRegistre(join(bac.racine, "validation/mesures"), {
        mesure_id: item.mesure_id,
        mesure_version: 1,
        theme_demande: "ecologie_energie",
        decision: "acceptee",
        date: "2026-11-20",
      });

      const resultat = executer("outils/promote.ts", cheminsDe(bac));
      expect(resultat.status).not.toBe(0);
      expect(`${resultat.sortie}${resultat.erreur}`).toContain(item.mesure_id);
    } finally {
      bac.detruire();
    }
  });

  it("20. une acceptation appliquée à la mesure laisse l'item être promu", () => {
    const bac = creerBac();
    try {
      const item = poserDemande(bac, { suffixe: "55", theme_mesure: "ecologie_energie", horodatage: ilYA(1) });
      bac.ecrireLot(lotDe("lot-001", [item]));
      ajouterAuRegistre(join(bac.racine, "validation/mesures"), {
        mesure_id: item.mesure_id,
        mesure_version: 1,
        theme_demande: "ecologie_energie",
        decision: "acceptee",
        date: "2026-11-20",
      });

      const resultat = executer("outils/promote.ts", cheminsDe(bac));
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toMatch(new RegExp(`À promouvoir : 1[\\s\\S]*${item.id}`));
    } finally {
      bac.detruire();
    }
  });

  it("26. le taux de « non évaluable » est imprimé pour les deux annotateurs, et une absence reste absente", () => {
    const bac = creerBac();
    try {
      const decisions: readonly Decision[] = ["accepter", "accepter", "non_evaluable"];
      const items = decisions.map((sens, rang) => {
        const item = itemP({
          id: `01JBANCESSA1000000000TEM6${rang}`,
          candidat_id: `demo-${rang}`,
          mesure_id: `01JBANCESSA90000000MESVR6${rang}`,
        });
        bac.ecrireItem(item);
        bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
        // a1 décide les trois, dont un « non évaluable » ; a2 n'ouvre pas le lot.
        bac.journal("a1").ajouter("lot-001", decision({ annotateur_id: "a1", item, decision: sens }));
        return item;
      });
      bac.ecrireLot(lotDe("lot-001", items));

      const resultat = executer("outils/promote.ts", cheminsDe(bac));
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toMatch(/a1 33\.3 %/);
      expect(resultat.sortie).toMatch(/a2 —/);
      expect(resultat.sortie).not.toMatch(/a2 0\.0 %/);
    } finally {
      bac.detruire();
    }
  });
});

/* --------------------------------------------------------------- `pnpm mesures` */

describe("`pnpm mesures`", () => {
  it("19. sans argument, liste les demandes en attente avec leur ancienneté et n'écrit rien", () => {
    const bac = creerBac();
    try {
      const item = poserDemande(bac, {
        suffixe: "71",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(9),
      });
      bac.ecrireLot(lotDe("lot-001", [item]));

      const resultat = executer("outils/mesures.ts", cheminsDe(bac));
      expect(resultat.status).toBe(0);
      expect(resultat.sortie).toContain(item.mesure_id);
      expect(resultat.sortie).toContain("ecologie_energie");
      expect(resultat.sortie).toMatch(/9 jour/);
      expect(existsSync(join(bac.racine, "validation/mesures/decisions.json"))).toBe(false);
    } finally {
      bac.detruire();
    }
  });

  it("n'écrit qu'avec --ecrire, et refuse un refus sans motif", () => {
    const bac = creerBac();
    const mesures = join(bac.racine, "validation/mesures");
    try {
      const item = poserDemande(bac, {
        suffixe: "72",
        theme_mesure: "fiscalite_pouvoir_achat",
        horodatage: ilYA(2),
      });
      bac.ecrireLot(lotDe("lot-001", [item]));
      const demande = [
        ...cheminsDe(bac),
        `--mesure=${item.mesure_id}`,
        "--theme=ecologie_energie",
        "--date=2026-11-20",
      ];

      const simulation = executer("outils/mesures.ts", [...demande, "--decision=acceptee"]);
      expect(simulation.status).toBe(0);
      expect(existsSync(join(mesures, "decisions.json"))).toBe(false);

      const refus = executer("outils/mesures.ts", [...demande, "--decision=refusee", "--ecrire"]);
      expect(refus.status).not.toBe(0);
      expect(`${refus.sortie}${refus.erreur}`).toMatch(/motif/);
      expect(existsSync(join(mesures, "decisions.json"))).toBe(false);

      const ecriture = executer("outils/mesures.ts", [...demande, "--decision=acceptee", "--ecrire"]);
      expect(ecriture.status).toBe(0);
      expect(lireRegistre(mesures)).toHaveLength(1);
    } finally {
      bac.detruire();
    }
  });
});

/* -------------------------------------------------- accord entre les deux validateurs */

/**
 * `validerEntreeRegistre()` est la frontière d'exécution (messages en français, pour l'auteur qui
 * corrige son registre à la main) ; `schema/decision-mesure.schema.json`, chargé ici par
 * `construireRegistre()` comme le fait `tests/schemas.test.ts`, est le contrat publié — plus
 * strict. Ce bloc vérifie qu'ils sont d'accord là où une règle leur est commune, et documente
 * explicitement le seul point où ils divergent : `validerEntreeRegistre()` ne connaît pas la
 * liste des dix thèmes, qui n'est définie nulle part dans `validation/domaine/` (`Mesure.theme`
 * y est un `string` ordinaire).
 */
describe("accord entre validerEntreeRegistre() et le schéma decision-mesure", () => {
  const racineSchema = join(RACINE, "schema");
  const racineExemplesDecisionMesure = join(racineSchema, "exemples/decision-mesure");

  function chargerExemple(nom: string): unknown {
    return JSON.parse(readFileSync(join(racineExemplesDecisionMesure, nom), "utf8"));
  }

  function validateurSchema() {
    const { ajv } = construireRegistre(racineSchema);
    const validateur = ajv.getSchema(urnSchema("decision-mesure"));
    if (validateur === undefined) throw new Error("schéma decision-mesure non enregistré.");
    return validateur;
  }

  it("1. un registre contenant une entrée acceptée sans motif : valide pour les deux validateurs", () => {
    const exemple = chargerExemple("valide-01-acceptation.json");
    expect(() => validerEntreeRegistre(exemple, "test")).not.toThrow();
    expect(validateurSchema()(exemple)).toBe(true);
  });

  it("2. un refus motivé est accepté par les deux validateurs", () => {
    const exemple = chargerExemple("valide-02-refus-motive.json");
    expect(() => validerEntreeRegistre(exemple, "test")).not.toThrow();
    expect(validateurSchema()(exemple)).toBe(true);
  });

  it("3. un refus sans motif est rejeté par les deux validateurs", () => {
    const exemple = chargerExemple("invalide-01-refus-sans-motif.json");
    expect(() => validerEntreeRegistre(exemple, "test")).toThrow(EntreeRegistreInvalide);
    expect(() => validerEntreeRegistre(exemple, "test")).toThrow(/motif/);
    expect(validateurSchema()(exemple)).toBe(false);
  });

  it("4. un theme_demande hors des dix est rejeté par le schéma seul : asymétrie assumée", () => {
    const exemple = chargerExemple("invalide-02-theme-hors-liste.json");

    // Le schéma connaît les dix thèmes fixes du §3 (commun.schema.json#/$defs/theme) et rejette.
    expect(validateurSchema()(exemple)).toBe(false);

    // `validerEntreeRegistre()` ne porte aucune liste de thèmes : `Mesure.theme` est un `string`
    // ordinaire dans `validation/domaine/types.ts`, et cette fonction n'en vérifie pas le contenu.
    // Si un jour quelqu'un ajoute cette liste à la frontière, cette assertion devient fausse et
    // ce test échoue — c'est voulu : le jour où la répartition des rôles change, il faut le dire
    // explicitement ici, pas le découvrir en silence.
    expect(() => validerEntreeRegistre(exemple, "test")).not.toThrow();
  });

  it("5. un mesure_id qui n'est pas un ULID (contient I ou U) est rejeté par le schéma", () => {
    const entree: DecisionCorrectionMesure = {
      mesure_id: "01JBANCESSAI0000000MESURE1", // I et U : hors de l'alphabet Crockford base32.
      mesure_version: 1,
      theme_demande: "sante",
      decision: "acceptee",
      date: "2026-11-20",
    };
    expect(validateurSchema()(entree)).toBe(false);
  });
});
