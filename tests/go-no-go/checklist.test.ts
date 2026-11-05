/**
 * La checklist de l'annexe F (D24 (4)) : texte du protocole, cases calculées, cases déclarées, et
 * le contreseing de l'auteur.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { valider } from "../../outils/schemas/valider.ts";
import {
  CASES_ANNEXE_F,
  constatGraineDuTirage,
  constatInterrogationDansLaFenetre,
  constatItemsAbsenceReverifies,
  constatNotationComplete,
  constatRobustesseCalculee,
  type DemarragesDeReponse,
  construireChecklist,
  partDuPipeline,
  type Checklist,
  type Constat,
} from "../../pipeline/go-no-go/checklist.ts";
import { RemplacementIntrouvable, type MaillonDeRemplacement } from "../../pipeline/interrogation/fenetre.ts";
import { ContreseingRefuse, contresigner, contresignerFichier, type Declaration } from "../../pipeline/go-no-go/contreseing.ts";
import { CODES_CRITERES, type Critere } from "../../pipeline/go-no-go/types.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "../analysis/fabriques.ts";

const RUN_ID = ulid("run-checklist");
const DATE = "2026-12-04T18:00:00+01:00";

function criteres(rouges: readonly string[] = []): Critere[] {
  return CODES_CRITERES.map((code) => ({ code, statut: rouges.includes(code) ? "rouge" : "vert", valeur: 0, seuil: 0 }));
}

const CONSTATS_FAITS: readonly Constat[] = [
  { nom: "graine_du_tirage_enregistree", fait: true, detail: "" },
  { nom: "notation_complete", fait: true, detail: "" },
  { nom: "interrogation_dans_la_fenetre", fait: true, detail: "" },
  { nom: "items_absence_reverifies", fait: true, detail: "" },
  { nom: "robustesse_calculee", fait: true, detail: "" },
];

/** Mardi 1er décembre 2026, 6 h, heure de Paris : la fenêtre du §6, semi-ouverte [debut, fin). */
const FENETRE = { debut: "2026-12-01T06:00:00+01:00", fin: "2026-12-03T06:00:00+01:00" };
/** Le run mensuel dont `FENETRE` est la fenêtre : type et instant de gel règlent l'ouverture (§6). */
const MENSUEL = { type_run: "mensuel", date_gel: "2026-11-27T09:00:00+01:00" } as const;
const RUN = { ...MENSUEL, fenetre: FENETRE };
/** Un run qui n'est pas une réexécution ne lit aucun run du dépôt (D74 (19)). */
function AUCUN_RUN(): readonly MaillonDeRemplacement[] {
  throw new Error("les runs du dépôt ne devaient pas être lus pour ce run");
}

function demarree(...horodatages: string[]): DemarragesDeReponse {
  const [reussie, ...echecs] = horodatages;
  return {
    contexte: "run",
    canal: "api",
    statut_reponse: "obtenue",
    metadonnees: { horodatage_requete: String(reussie) },
    ...(echecs.length === 0 ? {} : { tentatives: echecs.map((horodatage) => ({ horodatage })) }),
  };
}

const TOUT_DECLARE: readonly Declaration[] = [
  { rang: 1, etat: "faite" },
  { rang: 8, etat: "faite" },
  { rang: 9, etat: "faite" },
  { rang: 10, etat: "non_faite", motif: "Notification prévue après publication." },
];

describe("les dix cases de l'annexe F", () => {
  it("texte mot pour mot et ordre du protocole (docs/PROTOCOLE.md, annexe F)", () => {
    const protocole = readFileSync(join(RACINE_PROJET, "docs/PROTOCOLE.md"), "utf8");
    const annexe = protocole.slice(protocole.indexOf("**F. Checklist de run**"));
    const lignes = annexe
      .split("\n")
      .filter((ligne) => ligne.startsWith("- [ ] "))
      .slice(0, 10)
      .map((ligne) => ligne.slice("- [ ] ".length));
    expect(CASES_ANNEXE_F.map((c) => c.texte)).toEqual(lignes);
  });

  it("le pipeline écrit les cases calculées avec leur état, les déclarées sans état, sans contreseing ; conforme au schéma", () => {
    const checklist = construireChecklist(RUN_ID, criteres(), CONSTATS_FAITS);
    expect(checklist.contreseing).toBeUndefined();
    expect(checklist.cases.map((c) => [c.rang, c.nature, c.etat])).toEqual([
      [1, "declaree", undefined],
      [2, "calculee", "faite"],
      [3, "calculee", "faite"],
      [4, "calculee", "faite"],
      [5, "calculee", "faite"],
      [6, "calculee", "faite"],
      [7, "calculee", "faite"],
      [8, "declaree", undefined],
      [9, "declaree", undefined],
      [10, "declaree", undefined],
    ]);
    expect(() => valider("checklist", checklist, "test")).not.toThrow();
  });

  it("une case calculée dont un appui manque est non faite, avec un motif qui le nomme", () => {
    const constats = [
      constatGraineDuTirage({ valeur: 1 }, undefined),
      constatNotationComplete([ulid("a"), ulid("b")], new Set([ulid("a")])),
      ...CONSTATS_FAITS.filter((c) => c.nom !== "graine_du_tirage_enregistree" && c.nom !== "notation_complete"),
    ];
    const checklist = construireChecklist(RUN_ID, criteres(["kappa_juges_humains", "analyses_preenregistrees_executees"]), constats);
    const parRang = new Map(checklist.cases.map((c) => [c.rang, c]));
    expect(parRang.get(3)).toMatchObject({ etat: "non_faite", motif: "tirage.json absent du répertoire du run." });
    expect(parRang.get(5)).toMatchObject({ etat: "non_faite", motif: "1 réponse(s) obtenue(s) sans verdict." });
    expect(parRang.get(6)).toMatchObject({ etat: "non_faite", motif: "critère kappa_juges_humains au rouge." });
    expect(parRang.get(7)).toMatchObject({ etat: "non_faite" });
    expect(parRang.get(2)).toMatchObject({ etat: "faite" });
    expect(() => valider("checklist", checklist, "test")).not.toThrow();
  });

  it("sans fichier qui les porte, les cases 2 et 7 sont non faites (D25 (3)), et restent calculées", () => {
    const constats = [...CONSTATS_FAITS.filter((c) => c.nom !== "items_absence_reverifies" && c.nom !== "robustesse_calculee"), constatItemsAbsenceReverifies(), constatRobustesseCalculee(null)];
    const checklist = construireChecklist(RUN_ID, criteres(), constats);
    const parRang = new Map(checklist.cases.map((c) => [c.rang, c]));
    expect(parRang.get(2)).toMatchObject({ nature: "calculee", etat: "non_faite" });
    expect(parRang.get(2)?.motif).toContain("lot extraction");
    expect(parRang.get(7)).toMatchObject({ nature: "calculee", etat: "non_faite" });
    expect(parRang.get(7)?.motif).toContain("metriques/");
    expect(() => valider("checklist", checklist, "test")).not.toThrow();
  });

  it("graine du tirage : identique, faite ; différente, non faite", () => {
    expect(constatGraineDuTirage({ valeur: 1, algorithme: "a" }, { algorithme: "a", valeur: 1 }).fait).toBe(true);
    expect(constatGraineDuTirage({ valeur: 1 }, { valeur: 2 })).toMatchObject({ fait: false });
  });
});

describe("interrogation dans la fenêtre de 48 h (case 4 ; §6, fenêtre semi-ouverte [debut, fin))", () => {
  it("toutes les tentatives démarrent dans la fenêtre, la première à l'ouverture exacte : fait", () => {
    const reponses = [demarree("2026-12-01T06:00:00+01:00"), demarree("2026-12-03T05:59:59+01:00", "2026-12-03T05:57:00+01:00")];
    expect(constatInterrogationDansLaFenetre(RUN, reponses, AUCUN_RUN)).toMatchObject({ nom: "interrogation_dans_la_fenetre", fait: true });
  });

  it("une tentative qui démarre exactement à la fin : non faite (aucune tentative ne démarre à fin)", () => {
    const constat = constatInterrogationDansLaFenetre(RUN, [demarree("2026-12-02T10:00:00+01:00", "2026-12-03T06:00:00+01:00")], AUCUN_RUN);
    expect(constat).toMatchObject({ fait: false, detail: "1 tentative(s) démarrée(s) hors de la fenêtre [debut, fin)" });
  });

  it("une tentative avant l'ouverture : non faite", () => {
    expect(constatInterrogationDansLaFenetre(RUN, [demarree("2026-12-01T05:59:59+01:00")], AUCUN_RUN).fait).toBe(false);
  });

  it("une manquante hors fenêtre sans tentative n'a rien démarré : elle ne compte pas", () => {
    const jamaisEnvoyee: DemarragesDeReponse = { contexte: "run", canal: "api", statut_reponse: "manquante" };
    expect(constatInterrogationDansLaFenetre(RUN, [demarree("2026-12-01T07:00:00+01:00"), jamaisEnvoyee], AUCUN_RUN).fait).toBe(true);
  });

  it("une réponse hors du canal API ou hors du contexte run n'est pas jugée sur la fenêtre", () => {
    const application = { ...demarree("2026-12-10T10:00:00+01:00"), canal: "application" as const };
    const contrefactuelle = { ...demarree("2026-12-04T10:00:00+01:00"), contexte: "contrefactuel_candidat" as const };
    expect(constatInterrogationDansLaFenetre(RUN, [application, contrefactuelle], AUCUN_RUN).fait).toBe(true);
  });

  it("une fenêtre de 47 h dans run.json : non faite", () => {
    const constat = constatInterrogationDansLaFenetre({ ...MENSUEL, fenetre: { ...FENETRE, fin: "2026-12-03T05:00:00+01:00" } }, [demarree("2026-12-01T07:00:00+01:00")], AUCUN_RUN);
    expect(constat).toMatchObject({ fait: false });
    expect(constat.detail).toContain("48 h");
  });

  it("une fenêtre qui n'ouvre pas un mardi à 6 h, heure de Paris : non faite", () => {
    const constat = constatInterrogationDansLaFenetre({ ...MENSUEL, fenetre: { debut: "2026-12-02T06:00:00+01:00", fin: "2026-12-04T06:00:00+01:00" } }, [], AUCUN_RUN);
    expect(constat).toMatchObject({ fait: false });
    expect(constat.detail).toContain("mardi");
  });

  it("run supplémentaire gelé un samedi, fenêtre ouverte le dimanche à 6 h (§6, 0.27) : faite", () => {
    const run = {
      type_run: "supplementaire_debat",
      date_gel: "2027-03-13T10:00:00+01:00",
      fenetre: { debut: "2027-03-14T06:00:00+01:00", fin: "2027-03-16T06:00:00+01:00" },
    };
    expect(constatInterrogationDansLaFenetre(run, [demarree("2027-03-14T06:00:00+01:00")], AUCUN_RUN)).toMatchObject({ fait: true });
  });

  it("run supplémentaire dont la fenêtre ouvre le mardi suivant, pas le lendemain du gel : non faite, le jour attendu nommé", () => {
    const run = {
      type_run: "supplementaire_debat",
      date_gel: "2027-03-13T10:00:00+01:00",
      fenetre: { debut: "2027-03-16T06:00:00+01:00", fin: "2027-03-18T06:00:00+01:00" },
    };
    const constat = constatInterrogationDansLaFenetre(run, [], AUCUN_RUN);
    expect(constat).toMatchObject({ fait: false });
    expect(constat.detail).toContain("2027-03-14");
  });

  it("réexécution d'un supplémentaire (D74 (19)) : la fenêtre du lendemain de son gel est faite, celle du mardi non", () => {
    const remplace = { id: "01KBCS0G00SVPP1EMENTA1RE00", type_run: "supplementaire_debat" };
    const depot = (): readonly MaillonDeRemplacement[] => [remplace];
    const reexecution = { type_run: "reexecution", date_gel: "2027-03-13T10:00:00+01:00", run_remplace_id: remplace.id };
    const lendemain = { ...reexecution, fenetre: { debut: "2027-03-14T06:00:00+01:00", fin: "2027-03-16T06:00:00+01:00" } };
    const mardi = { ...reexecution, fenetre: { debut: "2027-03-16T06:00:00+01:00", fin: "2027-03-18T06:00:00+01:00" } };
    expect(constatInterrogationDansLaFenetre(lendemain, [demarree("2027-03-14T06:00:00+01:00")], depot)).toMatchObject({ fait: true });
    expect(constatInterrogationDansLaFenetre(mardi, [], depot)).toMatchObject({ fait: false });
  });

  it("réexécution dont le run remplacé est introuvable : erreur nommée, pas une case non faite ni un repli sur le mardi", () => {
    const reexecution = { type_run: "reexecution", date_gel: "2027-03-13T10:00:00+01:00", run_remplace_id: "01KBCS0G00NTR0VVAB1E000000" };
    const run = { ...reexecution, fenetre: { debut: "2027-03-16T06:00:00+01:00", fin: "2027-03-18T06:00:00+01:00" } };
    expect(() => constatInterrogationDansLaFenetre(run, [], () => [])).toThrow(RemplacementIntrouvable);
  });
});

describe("contreseing de l'auteur", () => {
  const pipeline = (): Checklist => construireChecklist(RUN_ID, criteres(["analyses_preenregistrees_executees"]), CONSTATS_FAITS);

  it("ajoute nom et date, l'état des cases déclarées, et ne touche pas aux cases calculées", () => {
    const signee = contresigner(pipeline(), { nom: "Auteur Fictif", declarations: TOUT_DECLARE, date: DATE });
    expect(signee.contreseing).toEqual({ nom: "Auteur Fictif", date: DATE });
    expect(signee.cases.find((c) => c.rang === 10)).toMatchObject({ etat: "non_faite", motif: "Notification prévue après publication." });
    expect(signee.cases.find((c) => c.rang === 7)).toEqual(pipeline().cases.find((c) => c.rang === 7));
    expect(partDuPipeline(signee)).toEqual(pipeline());
    expect(() => valider("checklist", signee, "test")).not.toThrow();
  });

  it("une case déclarée sans état : refus", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: TOUT_DECLARE.filter((d) => d.rang !== 9), date: DATE })).toThrow(/case déclarée 9/);
  });

  it("une case non faite sans motif : refus", () => {
    const declarations = TOUT_DECLARE.map((d) => (d.rang === 10 ? { rang: 10, etat: "non_faite" as const } : d));
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations, date: DATE })).toThrow(/non faite sans motif/);
  });

  it("une case non faite au motif blanc : refus", () => {
    const declarations = TOUT_DECLARE.map((d) => (d.rang === 10 ? { rang: 10, etat: "non_faite" as const, motif: "   " } : d));
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations, date: DATE })).toThrow(ContreseingRefuse);
  });

  it("une case calculée ne se déclare pas : refus (une case non faite reste non faite)", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 7, etat: "faite" }], date: DATE })).toThrow(/calculée par le pipeline/);
  });

  it("une case déclarée deux fois, un rang inconnu, un nom vide : refus", () => {
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 1, etat: "faite" }], date: DATE })).toThrow(/2 fois/);
    expect(() => contresigner(pipeline(), { nom: "Auteur", declarations: [...TOUT_DECLARE, { rang: 11, etat: "faite" }], date: DATE })).toThrow(/n'existe pas/);
    expect(() => contresigner(pipeline(), { nom: " ", declarations: TOUT_DECLARE, date: DATE })).toThrow(/nom/);
  });

  it("double contreseing : refus", () => {
    const signee = contresigner(pipeline(), { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE });
    expect(() => contresigner(signee, { nom: "Autre", declarations: TOUT_DECLARE, date: DATE })).toThrow(/déjà contresignée/);
  });
});

describe("contreseing sur fichier", () => {
  const dossiers: string[] = [];
  afterEach(() => {
    for (const d of dossiers.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  function runAvecChecklist(): string {
    const dossier = mkdtempSync(join(tmpdir(), "banc-contreseing-"));
    dossiers.push(dossier);
    writeFileSync(join(dossier, "checklist.json"), `${JSON.stringify(construireChecklist(RUN_ID, criteres(), CONSTATS_FAITS), null, 2)}\n`);
    writeFileSync(join(dossier, "run.json"), '{"octets": "qui ne doivent pas bouger"}\n');
    return dossier;
  }

  it("écrit checklist.json contresigné, run.json inchangé octet pour octet", () => {
    const dossier = runAvecChecklist();
    const avant = readFileSync(join(dossier, "run.json"));
    contresignerFichier(dossier, { nom: "Auteur Fictif", declarations: TOUT_DECLARE, date: DATE });
    expect(readFileSync(join(dossier, "run.json")).equals(avant)).toBe(true);
    const relue = valider<Checklist>("checklist", JSON.parse(readFileSync(join(dossier, "checklist.json"), "utf8")), "relue");
    expect(relue.contreseing).toEqual({ nom: "Auteur Fictif", date: DATE });
  });

  it("refusé : rien n'est écrit", () => {
    const dossier = runAvecChecklist();
    const avant = readFileSync(join(dossier, "checklist.json"));
    expect(() => contresignerFichier(dossier, { nom: "Auteur", declarations: [], date: DATE })).toThrow(ContreseingRefuse);
    expect(readFileSync(join(dossier, "checklist.json")).equals(avant)).toBe(true);
  });

  it("re-signer une checklist déjà contresignée : refus, fichier inchangé", () => {
    const dossier = runAvecChecklist();
    contresignerFichier(dossier, { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE });
    const avant = readFileSync(join(dossier, "checklist.json"));
    expect(() => contresignerFichier(dossier, { nom: "Auteur", declarations: TOUT_DECLARE, date: DATE })).toThrow(/déjà contresignée/);
    expect(readFileSync(join(dossier, "checklist.json")).equals(avant)).toBe(true);
  });
});
