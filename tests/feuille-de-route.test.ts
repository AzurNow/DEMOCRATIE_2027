/**
 * Cas limites du générateur de feuille de route (lot `feuille-de-route`), un test par cas listé
 * dans le brief. `lecture.ts` est testé sur des objets JS construits en mémoire ; `graphe.ts` et
 * `mermaid.ts` sur des valeurs déjà typées (on ne repasse pas par la validation structurelle).
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculerEtats, CycleDetecte, verifierAcyclique } from "../outils/feuille-de-route/graphe.ts";
import { ErreurFeuilleDeRoute, validerFeuilleDeRoute } from "../outils/feuille-de-route/lecture.ts";
import { cellule, genererMarkdown } from "../outils/feuille-de-route/markdown.ts";
import {
  areteDependance,
  echapperTexte,
  genererMermaid,
  identifiantDecision,
  identifiantLot,
  noeudDecision,
  noeudLot,
} from "../outils/feuille-de-route/mermaid.ts";
import type { Decision, Dependance, FeuilleDeRoute, Jalon, Lot, Niveau } from "../outils/feuille-de-route/types.ts";
import { estAJour } from "../outils/feuille-de-route/verification.ts";

// --- Fabriques pour lecture.ts : objets JS bruts, pas de types imposés. ---

function jalonBrut(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "J1", date: "2026-10-15", titre: "Jalon un", critere: "Critère un", ...overrides };
}

function decisionBrute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "D1",
    statut: "en_attente",
    question: "Une question ?",
    contexte: "Un contexte.",
    options: ["Option 1", "Option 2"],
    recommandation: "Une recommandation.",
    ...overrides,
  };
}

function lotBrut(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "lot-a",
    titre: "Lot A",
    jalon: "J1",
    niveau: "T0",
    agent: "sonnet",
    taille: "S",
    temps_auteur_h: 1,
    depend_de: [],
    decisions: [],
    ...overrides,
  };
}

function feuilleBrute(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    date_maj: "2026-09-18",
    echelle: { T0: "a", T1: "b", T2: "c", T3: "d", T4: "e" },
    jalons: [jalonBrut()],
    decisions: [],
    lots: [lotBrut()],
    anomalies: [],
    ...overrides,
  };
}

describe("lecture : validation structurelle", () => {
  it("1. dépendance vers un lot inexistant nomme le lot source et l'id inconnu", () => {
    const feuille = feuilleBrute({
      lots: [lotBrut({ depend_de: [{ lot: "fantome", type: "bloque" }] })],
    });
    try {
      validerFeuilleDeRoute(feuille);
      expect.unreachable("devait lever");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(ErreurFeuilleDeRoute);
      expect((erreur as Error).message).toContain("lot-a");
      expect((erreur as Error).message).toContain("fantome");
    }
  });

  it("2. décision référencée par un lot mais absente de decisions nomme les deux", () => {
    const feuille = feuilleBrute({ lots: [lotBrut({ decisions: ["D9"] })] });
    try {
      validerFeuilleDeRoute(feuille);
      expect.unreachable("devait lever");
    } catch (erreur) {
      expect((erreur as Error).message).toContain("lot-a");
      expect((erreur as Error).message).toContain("D9");
    }
  });

  it("3. jalon référencé inconnu lève une erreur", () => {
    const feuille = feuilleBrute({ lots: [lotBrut({ jalon: "J9" })] });
    expect(() => validerFeuilleDeRoute(feuille)).toThrow(ErreurFeuilleDeRoute);
  });

  it("4. niveau hors de T0..T4 nomme le lot et la valeur", () => {
    const feuille = feuilleBrute({ lots: [lotBrut({ niveau: "T9" })] });
    try {
      validerFeuilleDeRoute(feuille);
      expect.unreachable("devait lever");
    } catch (erreur) {
      expect((erreur as Error).message).toContain("lot-a");
      expect((erreur as Error).message).toContain("T9");
    }
  });

  it("5. type de dépendance autre que bloque ou informe lève une erreur", () => {
    const feuille = feuilleBrute({
      lots: [lotBrut({ depend_de: [{ lot: "lot-a", type: "requiert" }] })],
    });
    expect(() => validerFeuilleDeRoute(feuille)).toThrow(ErreurFeuilleDeRoute);
  });

  it("6. deux lots avec le même id lèvent une erreur", () => {
    const feuille = feuilleBrute({ lots: [lotBrut(), lotBrut()] });
    expect(() => validerFeuilleDeRoute(feuille)).toThrow(ErreurFeuilleDeRoute);
  });

  it("7. statut de décision autre que en_attente ou tranchee lève une erreur", () => {
    const feuille = feuilleBrute({ decisions: [decisionBrute({ statut: "ouverte" })] });
    expect(() => validerFeuilleDeRoute(feuille)).toThrow(ErreurFeuilleDeRoute);
  });

  it("7 bis. une décision tranchee sans retenu ni date_decision lève une erreur", () => {
    const sansRetenu = feuilleBrute({ decisions: [decisionBrute({ statut: "tranchee", date_decision: "2026-09-20" })] });
    expect(() => validerFeuilleDeRoute(sansRetenu)).toThrow(ErreurFeuilleDeRoute);
    const sansDate = feuilleBrute({ decisions: [decisionBrute({ statut: "tranchee", retenu: "Option 1." })] });
    expect(() => validerFeuilleDeRoute(sansDate)).toThrow(ErreurFeuilleDeRoute);
  });

  it("8. champ obligatoire manquant (taille) nomme le lot et le champ", () => {
    const lot = lotBrut();
    delete lot["taille"];
    const feuille = feuilleBrute({ lots: [lot] });
    try {
      validerFeuilleDeRoute(feuille);
      expect.unreachable("devait lever");
    } catch (erreur) {
      expect((erreur as Error).message).toContain("lot-a");
      expect((erreur as Error).message).toContain("taille");
    }
  });

  it("9. le vrai fichier docs/feuille-de-route.json est lu sans erreur", () => {
    const chemin = resolve(import.meta.dirname, "../docs/feuille-de-route.json");
    const brut = JSON.parse(readFileSync(chemin, "utf8"));
    expect(() => validerFeuilleDeRoute(brut)).not.toThrow();
  });
});

// --- Fabriques pour graphe.ts et mermaid.ts : valeurs déjà typées. ---

function dep(lot: string, type: Dependance["type"]): Dependance {
  return { lot, type };
}

function fabriquerLot(champs: {
  id: string;
  niveau: Niveau;
  jalon?: string;
  depend_de?: readonly Dependance[];
  decisions?: readonly string[];
}): Lot {
  return {
    id: champs.id,
    titre: `Titre ${champs.id}`,
    jalon: champs.jalon === undefined ? "J1" : champs.jalon,
    niveau: champs.niveau,
    agent: "sonnet",
    taille: "S",
    temps_auteur_h: 1,
    depend_de: champs.depend_de === undefined ? [] : champs.depend_de,
    decisions: champs.decisions === undefined ? [] : champs.decisions,
  };
}

function fabriquerDecision(id: string, statut: Decision["statut"]): Decision {
  const commune = {
    id,
    question: `Question de ${id}`,
    contexte: "Contexte.",
    options: ["Option 1", "Option 2"],
    recommandation: "Recommandation.",
  };
  if (statut === "en_attente") return { ...commune, statut };
  return { ...commune, statut, retenu: "Option 1 retenue.", date_decision: "2026-09-20" };
}

function fabriquerJalon(id: string, date: string): Jalon {
  return { id, date, titre: `Jalon ${id}`, critere: "Critère" };
}

describe("graphe : cycles", () => {
  it("10. un cycle A → B → A par dépendances bloque nomme les ids du cycle", () => {
    const a = fabriquerLot({ id: "a", niveau: "T0", depend_de: [dep("b", "bloque")] });
    const b = fabriquerLot({ id: "b", niveau: "T0", depend_de: [dep("a", "bloque")] });
    try {
      verifierAcyclique([a, b]);
      expect.unreachable("devait lever");
    } catch (erreur) {
      expect(erreur).toBeInstanceOf(CycleDetecte);
      const cycle = (erreur as CycleDetecte).cycle;
      expect(cycle).toContain("a");
      expect(cycle).toContain("b");
    }
  });

  it("11. un cycle qui ne passe que par des arêtes informe est aussi une erreur", () => {
    const a = fabriquerLot({ id: "a", niveau: "T0", depend_de: [dep("b", "informe")] });
    const b = fabriquerLot({ id: "b", niveau: "T0", depend_de: [dep("a", "informe")] });
    expect(() => verifierAcyclique([a, b])).toThrow(CycleDetecte);
  });
});

describe("graphe : état des lots", () => {
  it("12. un lot à T3 avec une dépendance bloque non atteinte est atteint quand même", () => {
    const x = fabriquerLot({ id: "x", niveau: "T0" });
    const lot = fabriquerLot({ id: "lot", niveau: "T3", depend_de: [dep("x", "bloque")] });
    const etats = calculerEtats([x, lot], []);
    expect(etats.get("lot")).toEqual({ type: "atteint" });
  });

  it("13. un lot à T0 sans dépendance ni décision est débloqué", () => {
    const lot = fabriquerLot({ id: "lot", niveau: "T0" });
    const etats = calculerEtats([lot], []);
    expect(etats.get("lot")).toEqual({ type: "debloque" });
  });

  it("14. un lot à T0 dont une dépendance bloque est à T2 est bloqué par cette dépendance", () => {
    const x = fabriquerLot({ id: "x", niveau: "T2" });
    const lot = fabriquerLot({ id: "lot", niveau: "T0", depend_de: [dep("x", "bloque")] });
    const etats = calculerEtats([x, lot], []);
    expect(etats.get("lot")).toEqual({ type: "bloque", bloqueurs: ["x"] });
  });

  it("15. un lot à T0 dont la seule dépendance est informe vers un lot à T0 est débloqué", () => {
    const x = fabriquerLot({ id: "x", niveau: "T0" });
    const lot = fabriquerLot({ id: "lot", niveau: "T0", depend_de: [dep("x", "informe")] });
    const etats = calculerEtats([x, lot], []);
    expect(etats.get("lot")).toEqual({ type: "debloque" });
  });

  it("16. un lot à T0 portant une décision en_attente est bloqué par cette décision", () => {
    const lot = fabriquerLot({ id: "lot", niveau: "T0", decisions: ["D1"] });
    const etats = calculerEtats([lot], [fabriquerDecision("D1", "en_attente")]);
    expect(etats.get("lot")).toEqual({ type: "bloque", bloqueurs: ["D1"] });
  });

  it("17. un lot à T0 portant une décision tranchee uniquement est débloqué", () => {
    const lot = fabriquerLot({ id: "lot", niveau: "T0", decisions: ["D1"] });
    const etats = calculerEtats([lot], [fabriquerDecision("D1", "tranchee")]);
    expect(etats.get("lot")).toEqual({ type: "debloque" });
  });

  it("18. un lot bloqué par une dépendance et une décision liste les deux, décisions puis lots, triés", () => {
    const x = fabriquerLot({ id: "zz-lot", niveau: "T0" });
    const y = fabriquerLot({ id: "aa-lot", niveau: "T0" });
    const lot = fabriquerLot({
      id: "lot",
      niveau: "T0",
      depend_de: [dep("zz-lot", "bloque"), dep("aa-lot", "bloque")],
      decisions: ["D2", "D1"],
    });
    const etats = calculerEtats(
      [x, y, lot],
      [fabriquerDecision("D1", "en_attente"), fabriquerDecision("D2", "en_attente")],
    );
    expect(etats.get("lot")).toEqual({ type: "bloque", bloqueurs: ["D1", "D2", "aa-lot", "zz-lot"] });
  });
});

describe("mermaid : rendu", () => {
  it("19. guillemets doubles et chevron > sont échappés, sans guillemet ni chevron bruts", () => {
    const echappe = echapperTexte('Titre "cité" > suite');
    expect(echappe).not.toContain('"');
    expect(echappe).not.toContain(">");
    expect(echappe).not.toContain("<");
    expect(echappe).toContain("#quot;");
    expect(echappe).toContain("#gt;");
  });

  it("20. un id de lot contenant un tiret produit un identifiant Mermaid sans tiret", () => {
    const id = identifiantLot("perimetre-prompts");
    expect(id).not.toContain("-");
    expect(id).toBe("lot_perimetre_prompts");
  });

  it("21. un lot d'id 'end' produit l'identifiant Mermaid lot_end, jamais end seul", () => {
    expect(identifiantLot("end")).toBe("lot_end");
  });

  it("22. une arête informe est -.->,  une arête bloque est -->", () => {
    expect(areteDependance("a", "b", "informe")).toContain("-.->");
    expect(areteDependance("a", "b", "bloque")).toContain("-->");
    expect(areteDependance("a", "b", "bloque")).not.toContain("-.->");
  });

  it("23. une décision tranchee n'apparaît pas dans le graphe, une décision en_attente y apparaît avec une arête par lot", () => {
    const lot1 = fabriquerLot({ id: "lot1", niveau: "T0", decisions: ["D1"] });
    const lot2 = fabriquerLot({ id: "lot2", niveau: "T0", decisions: ["D1"] });
    const decisionEnAttente = fabriquerDecision("D1", "en_attente");
    const decisionTranchee = fabriquerDecision("D2", "tranchee");
    const rendu = genererMermaid({
      jalons: [fabriquerJalon("J1", "2026-10-15")],
      lots: [lot1, lot2],
      decisions: [decisionEnAttente, decisionTranchee],
    });
    expect(rendu).toContain(identifiantDecision("D1"));
    expect(rendu).not.toContain(identifiantDecision("D2"));
    expect(rendu).toContain(`${identifiantDecision("D1")} --> ${identifiantLot("lot1")}`);
    expect(rendu).toContain(`${identifiantDecision("D1")} --> ${identifiantLot("lot2")}`);
  });

  it("24. exactement un subgraph par jalon, dans l'ordre des dates, chaque lot dans un seul subgraph", () => {
    const j1 = fabriquerJalon("J1", "2026-10-15");
    const j2 = fabriquerJalon("J2", "2026-10-31");
    const lotJ1 = fabriquerLot({ id: "lot-j1", niveau: "T0", jalon: "J1" });
    const lotJ2 = fabriquerLot({ id: "lot-j2", niveau: "T0", jalon: "J2" });
    const rendu = genererMermaid({ jalons: [j2, j1], lots: [lotJ2, lotJ1], decisions: [] });
    const occurrencesSubgraph = rendu.match(/subgraph /g) ?? [];
    expect(occurrencesSubgraph).toHaveLength(2);

    const indexJ1 = rendu.indexOf("jalon_J1");
    const indexJ2 = rendu.indexOf("jalon_J2");
    expect(indexJ1).toBeLessThan(indexJ2);

    const occurrencesNoeudLotJ1 = rendu.split(noeudLot(lotJ1)).length - 1;
    expect(occurrencesNoeudLotJ1).toBe(1);
  });

  it("le nœud d'une décision tronque la question à 60 caractères", () => {
    const question = "x".repeat(80);
    const decision = fabriquerDecision("D1", "en_attente");
    const rendu = noeudDecision({ ...decision, question });
    expect(rendu).toContain("x".repeat(60) + "…");
    expect(rendu).not.toContain("x".repeat(61));
  });
});

describe("markdown : échappement des cellules", () => {
  const f: FeuilleDeRoute = {
    date_maj: "2026-09-18",
    echelle: { T0: "a | b", T1: "b", T2: "c", T3: "d", T4: "e" },
    jalons: [{ id: "J1", date: "2026-10-15", titre: "Jalon | un", critere: "Critère" }],
    decisions: [],
    lots: [{ ...fabriquerLot({ id: "lot-a", niveau: "T0" }), titre: "Avant | après" }],
    anomalies: [],
  };

  it("29. un titre contenant | reste une seule cellule, rendue \\|", () => {
    const markdown = genererMarkdown(f, calculerEtats(f.lots, f.decisions));
    const ligne = markdown.split("\n").find((l) => l.startsWith("| lot-a |"));
    expect(ligne).toContain("| Avant \\| après |");
    expect(ligne?.split(/(?<!\\)\|/).length).toBe(11);
    expect(markdown).toContain("| Jalon \\| un |");
    expect(markdown).toContain("| T0 | a \\| b |");
  });

  it("30. plusieurs | et un \\| déjà échappé : une cellule chacun, sans ré-échapper la barre oblique", () => {
    expect(cellule("a | b | c")).toBe("a \\| b \\| c");
    expect(cellule("a \\| b")).toBe("a \\| b");
    expect(cellule("x | y \\| z | w")).toBe("x \\| y \\| z \\| w");
    expect(cellule(cellule("a | b"))).toBe("a \\| b");
  });
});

describe("outil --verifier", () => {
  it("31. sur le dépôt, --verifier sort en 0 avec son message quand le Markdown est à jour", () => {
    const racine = resolve(import.meta.dirname, "..");
    const r = spawnSync("node", ["--experimental-strip-types", "outils/feuille-de-route.ts", "--verifier"], {
      cwd: racine,
      encoding: "utf8",
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("est à jour");
  });
});

describe("markdown et outil", () => {
  function feuille(overrides: Partial<FeuilleDeRoute> = {}): FeuilleDeRoute {
    return {
      date_maj: "2026-09-18",
      echelle: { T0: "a", T1: "b", T2: "c", T3: "d", T4: "e" },
      jalons: [fabriquerJalon("J1", "2026-10-15")],
      decisions: [],
      lots: [fabriquerLot({ id: "lot-a", niveau: "T0" })],
      anomalies: [],
      ...overrides,
    };
  }

  it("25. déterminisme : deux appels sur la même entrée produisent une chaîne identique", () => {
    const f = feuille({ decisions: [fabriquerDecision("D1", "en_attente")], lots: [fabriquerLot({ id: "lot-a", niveau: "T0", decisions: ["D1"] })] });
    const etats = calculerEtats(f.lots, f.decisions);
    const premier = genererMarkdown(f, etats);
    const second = genererMarkdown(f, etats);
    expect(second).toBe(premier);
  });

  it("26. sans décision en attente, la section contient 'Aucune décision en attente.'", () => {
    const f = feuille();
    const etats = calculerEtats(f.lots, f.decisions);
    const markdown = genererMarkdown(f, etats);
    expect(markdown).toContain("Aucune décision en attente.");
  });

  it("27. la colonne État d'un lot bloqué nomme précisément ses bloqueurs", () => {
    const bloquant = fabriquerLot({ id: "collecte", niveau: "T0" });
    const lot = fabriquerLot({
      id: "extraction",
      niveau: "T0",
      depend_de: [dep("collecte", "bloque")],
      decisions: ["D3"],
    });
    const f = feuille({
      lots: [bloquant, lot],
      decisions: [fabriquerDecision("D3", "en_attente")],
    });
    const etats = calculerEtats(f.lots, f.decisions);
    const markdown = genererMarkdown(f, etats);
    expect(markdown).toContain("bloqué par D3, collecte");
  });

  it("27 bis. une décision tranchée affiche ce qui a été retenu et sa date, pas sa recommandation", () => {
    const f = feuille({ decisions: [fabriquerDecision("D1", "tranchee")] });
    const etats = calculerEtats(f.lots, f.decisions);
    const markdown = genererMarkdown(f, etats);
    expect(markdown).toContain("**Décision du 2026-09-20 :** Option 1 retenue.");
    expect(markdown).not.toContain("**Recommandation :** Recommandation.");
  });

  it("28. --verifier : code 0 sur un Markdown à jour, code 1 sur un Markdown modifié", () => {
    const f = feuille();
    const etats = calculerEtats(f.lots, f.decisions);
    const genere = genererMarkdown(f, etats);
    expect(estAJour(genere, genere)).toBe(true);
    expect(estAJour("autre chose", genere)).toBe(false);
    expect(estAJour(undefined, genere)).toBe(false);
  });
});
