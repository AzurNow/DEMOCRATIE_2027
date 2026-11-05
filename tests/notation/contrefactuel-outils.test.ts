/**
 * Contrefactuel d'outil (§7, protocole 0.24, D59 (13)) : réponse permutée, charge permutée, taux de
 * changement publié comme diagnostic, sans retrait de juge. Les notations d'entrée et les réponses
 * permutées sont validées contre leurs schémas.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construireCharge, type DemandeCharge } from "../../pipeline/notation/charge-juge.ts";
import { ContrefactuelIncoherent, type EntreeContrefactuel, type PaireContrefactuelle } from "../../pipeline/notation/contrefactuel.ts";
import { testerContrefactuelOutils, type ResultatContrefactuelOutils, type ResultatJugeOutils } from "../../pipeline/notation/contrefactuel-outils.ts";
import type { DerangementOutils, OutilNomme } from "../../pipeline/notation/derangement-outils.ts";
import type { TextesDeVerification } from "../../pipeline/notation/extrait.ts";
import { demandePermuteeOutils, reponseContrefactuelleOutil } from "../../pipeline/notation/reponse-contrefactuelle-outil.ts";
import type { NotationIndividuelle, RenvoiHumain } from "../../pipeline/notation/types.ts";
import type { ReponseManquante, ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { itemP } from "../aides/fabriques.ts";
import { ulid } from "../analysis/fabriques.ts";
import { ALIAS_CANDIDATS_TEST, inexacte, lien, notationJuge, pagesSansTexte, renvoiDefaillant, renvoiJuge, REPONSE_PROJETEE, RESOLU_POSITION_POUR, runDeNotation } from "./fabriques.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const NOUVEL_ID = ulid("reponse-contrefactuelle-outil");

const ALPHA: OutilNomme = { outil_id: "alpha", libelle: "Alphabot", editeur: "Société Alpha" };
const BETA: OutilNomme = { outil_id: "beta", libelle: "Le Chat", editeur: "Bêta IA" };
const ECHANGE: DerangementOutils = { paires: [{ source: ALPHA, image: BETA }, { source: BETA, image: ALPHA }], hors_derangement: [] };

const TEXTE = "Selon Alphabot (Société Alpha), Le Chat se trompe : la TVA passe à 5,5 %.";

function reponse(surcharges: Partial<ReponseObtenue["normalise"]> = {}): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>(
    "reponse",
    {
      ...lue,
      normalise: {
        ...lue.normalise,
        texte: TEXTE,
        liens: ["https://exemple.invalid/Alphabot"],
        citations: [{ url: "https://exemple.invalid/Alphabot", texte: "Alphabot l'affirme", type: "url_citation" }],
        ...surcharges,
      },
    },
    "réponse de test",
  );
}

function demande(r: ReponseObtenue = reponse()): DemandeCharge {
  return {
    reponse: r,
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Que dit Alphabot de la TVA ?" },
    references: [{ item: itemP(), role: "principal" }],
    date_run: "2026-12-01T06:00:00+01:00",
    prompt: { chemin: "prompts/judge-primaire.md", version: "1.0.0" },
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte([...new Set(r.normalise.liens)]),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  };
}

describe("réponse contrefactuelle d'outil", () => {
  it("contexte contrefactuel_outil, dérive de la réponse, permutation noms_outils ; valide au schéma", () => {
    const { reponse: permutee, mentions_residuelles } = reponseContrefactuelleOutil(reponse(), NOUVEL_ID, ECHANGE);
    valider("reponse", permutee, "réponse contrefactuelle d'outil");
    expect(permutee.id).toBe(NOUVEL_ID);
    expect(permutee.contexte).toBe("contrefactuel_outil");
    expect(permutee.derive_de_reponse_id).toBe(reponse().id);
    expect(permutee.permutation).toEqual({ type: "noms_outils", correspondances: { alpha: "beta", beta: "alpha" } });
    expect(mentions_residuelles).toBe(0);
  });

  it("une réponse qui nomme deux outils : les deux permutés dans le texte et les citations, liens intacts", () => {
    const { reponse: permutee } = reponseContrefactuelleOutil(reponse(), NOUVEL_ID, ECHANGE);
    expect(permutee.normalise.texte).toBe("Selon Le Chat (Bêta IA), Alphabot se trompe : la TVA passe à 5,5 %.");
    expect(permutee.normalise.citations).toEqual([{ url: "https://exemple.invalid/Alphabot", texte: "Le Chat l'affirme", type: "url_citation" }]);
    expect(permutee.normalise.liens).toEqual(["https://exemple.invalid/Alphabot"]);
  });

  it("le brut, la requête, l'outil et l'alias de la réponse sont recopiés à l'identique (règle 7)", () => {
    const origine = reponse();
    const { reponse: permutee } = reponseContrefactuelleOutil(origine, NOUVEL_ID, ECHANGE);
    expect(permutee.brut_sha256).toBe(origine.brut_sha256);
    expect(permutee.requete).toEqual(origine.requete);
    expect(permutee.outil_id).toBe(origine.outil_id);
    expect(permutee.alias_aveugle).toBe(origine.alias_aveugle);
    expect((permutee as unknown as Record<string, unknown>)["brut"]).toEqual((origine as unknown as Record<string, unknown>)["brut"]);
    expect((permutee as unknown as Record<string, unknown>)["brut_texte"]).toEqual((origine as unknown as Record<string, unknown>)["brut_texte"]);
  });

  it("une mention en capitales est comptée résiduelle, jamais remplacée", () => {
    const { reponse: permutee, mentions_residuelles } = reponseContrefactuelleOutil(reponse({ texte: "ALPHABOT et Alphabot" }), NOUVEL_ID, ECHANGE);
    expect(permutee.normalise.texte).toBe("ALPHABOT et Le Chat");
    expect(mentions_residuelles).toBe(1);
  });

  it("refus de l'API, réponse manquante, réponse déjà contrefactuelle : erreur, rien à permuter", () => {
    const refus = reponse({ texte: "", liens: [], citations: [], troncature: false, refus_api: true });
    expect(() => reponseContrefactuelleOutil(refus, NOUVEL_ID, ECHANGE)).toThrow(/refus de l'API/);
    const manquante = { ...reponse(), statut_reponse: "manquante" } as unknown as ReponseManquante;
    expect(() => reponseContrefactuelleOutil(manquante, NOUVEL_ID, ECHANGE)).toThrow(/manquante/);
    const deja = reponseContrefactuelleOutil(reponse(), NOUVEL_ID, ECHANGE).reponse;
    expect(() => reponseContrefactuelleOutil(deja, ulid("autre"), ECHANGE)).toThrow(/contexte/);
  });
});

describe("demande permutée d'outil : seule la réponse change", () => {
  it("question, items, réponse attendue et pages citées inchangés ; la charge se construit", () => {
    const d = demande();
    const permutee = demandePermuteeOutils(d, NOUVEL_ID, ECHANGE);
    expect(permutee.demande.question).toEqual(d.question);
    expect(permutee.demande.references).toEqual(d.references);
    expect(permutee.demande.resolu_au_gel).toEqual(d.resolu_au_gel);
    expect(permutee.demande.pages_citees).toEqual(d.pages_citees);
    expect(permutee.demande.reponse).toBe(permutee.reponse);
    expect(permutee.textes.reponse).toBe(permutee.reponse.normalise.texte);
    expect(construireCharge(permutee.demande).reponse.texte).toBe(permutee.reponse.normalise.texte);
  });
});

/* ------------------------------------------------------------------ taux de changement */

const TEXTES: TextesDeVerification = { reponse: REPONSE_PROJETEE, citations_reference: [] };
const origineId = (i: number): string => ulid(`outil-origine-${i}`);
const permuteeId = (i: number): string => ulid(`outil-permutee-${i}`);

function paire(i: number): PaireContrefactuelle {
  return { reponse_id: origineId(i), contrefactuelle_id: permuteeId(i), textes_origine: TEXTES, textes_permutes: TEXTES, mentions_residuelles: 0 };
}

type Surcharges = Parameters<typeof notationJuge>[1];

function surOrigine(juge: string, i: number, surcharges: Surcharges = {}): NotationIndividuelle {
  return notationJuge(juge, { objet_note: { type: "reponse", id: origineId(i) }, ...surcharges });
}

function surPermutee(juge: string, i: number, surcharges: Surcharges = {}): NotationIndividuelle {
  return notationJuge(juge, { objet_note: { type: "reponse", id: permuteeId(i) }, contexte: "contrefactuel_outil", motif_notation: "contrefactuel", ...surcharges });
}

function entree(n: number, notations: readonly NotationIndividuelle[], retires: readonly string[] = [], renvois: readonly RenvoiHumain[] = []): EntreeContrefactuel {
  for (const notation of notations) valider("notation", notation, `notation de test ${notation.id}`);
  const ids = Array.from({ length: n }, (_, i) => origineId(i));
  return {
    run: runDeNotation(retires),
    sous_ensemble: { reponse_ids: ids, eligibles: n, taille_visee: 200, sous_effectif: n < 200 },
    paires: ids.map((_, i) => paire(i)),
    notations,
    renvois,
  };
}

function jeu(n: number, changements: Readonly<Record<string, number>>, juges: readonly string[] = ["j1", "j2"], retires: readonly string[] = []): EntreeContrefactuel {
  const notations: NotationIndividuelle[] = [];
  for (let i = 0; i < n; i += 1) {
    for (const juge of juges) {
      notations.push(surOrigine(juge, i));
      const nombre = changements[juge];
      notations.push(surPermutee(juge, i, nombre !== undefined && i < nombre ? inexacte() : {}));
    }
  }
  return entree(n, notations, retires);
}

function jugeDe(resultat: ResultatContrefactuelOutils, juge_id: string): ResultatJugeOutils {
  if (resultat.statut !== "termine") throw new Error(`statut ${resultat.statut}`);
  const trouve = resultat.juges.find((j) => j.juge_id === juge_id);
  if (trouve === undefined) throw new Error(`juge ${juge_id} absent`);
  return trouve;
}

describe("taux de changement du contrefactuel d'outil : un diagnostic, jamais un retrait", () => {
  it("50 changements sur 200 (25 %) : taux publié, aucun champ de retrait ni d'échantillon", () => {
    const resultat = testerContrefactuelOutils(jeu(200, { j1: 50 }));
    expect(jugeDe(resultat, "j1")).toEqual({ juge_id: "j1", taux: { numerateur: 50, denominateur: 200, valeur: 0.25 }, paires_ecartees: 0 });
    expect(jugeDe(resultat, "j2")).toEqual({ juge_id: "j2", taux: { numerateur: 0, denominateur: 200, valeur: 0 }, paires_ecartees: 0 });
    expect(resultat).not.toHaveProperty("taux_echantillon_humain");
    expect(JSON.stringify(resultat)).not.toContain("retire");
  });

  it("les deux juges au-delà de 3 % : le run reste valide, le test est terminé", () => {
    expect(testerContrefactuelOutils(jeu(100, { j1: 40, j2: 40 })).statut).toBe("termine");
  });

  it("le sourçage n'entre pas dans le changement ; un extrait invalide d'un côté en est un", () => {
    const notations = [
      surOrigine("j1", 0, { sourcage: { cite: true, liens: [lien("existe", "soutient")] } }),
      surPermutee("j1", 0, { sourcage: { cite: true, liens: [lien("existe", "ne_soutient_pas")] } }),
      surOrigine("j1", 1),
      surPermutee("j1", 1, { ...inexacte(), extrait_justificatif: { provenance: "reponse", texte: "absent du texte", verifie_deterministe: true } }),
      surOrigine("j2", 0),
      surPermutee("j2", 0),
      surOrigine("j2", 1),
      surPermutee("j2", 1),
    ];
    const resultat = testerContrefactuelOutils(entree(2, notations));
    expect(jugeDe(resultat, "j1")).toMatchObject({ taux: { numerateur: 1, denominateur: 2 } });
  });

  it("une notation manquante : en attente, aucun taux", () => {
    const complet = jeu(3, {});
    const resultat = testerContrefactuelOutils({ ...complet, notations: complet.notations.slice(1) });
    expect(resultat.statut).toBe("en_attente");
    if (resultat.statut === "en_attente") expect(resultat.paires_incompletes).toEqual([{ reponse_id: origineId(0), juge_id: "j1", manque: ["origine"] }]);
  });

  it("aucune réponse éligible : indéfini, jamais 0 %", () => {
    expect(testerContrefactuelOutils(entree(0, []))).toMatchObject({ statut: "indefini", motif: "aucune_reponse_eligible" });
  });

  it("une paire renvoyée à l'humain par un juge est écartée et comptée ; toutes écartées : taux indéfini", () => {
    const notations = [surOrigine("j2", 0), surPermutee("j2", 0), surPermutee("j1", 0)];
    const renvois = [renvoiJuge("j1", { objet_note: { type: "reponse", id: origineId(0) } })];
    const resultat = testerContrefactuelOutils(entree(1, notations, [], renvois));
    expect(jugeDe(resultat, "j1")).toEqual({ juge_id: "j1", motif_indefini: "toutes_paires_ecartees", paires_ecartees: 1 });
  });

  it("un renvoi sur la copie permutée porte le contexte contrefactuel_outil (valide au schéma) ; sous celui des candidats : incohérence", () => {
    const renvoi = valider<RenvoiHumain>("renvoi-humain", renvoiJuge("j1", { objet_note: { type: "reponse", id: permuteeId(0) }, contexte: "contrefactuel_outil" }), "renvoi de test");
    const notations = [surOrigine("j1", 0), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(jugeDe(testerContrefactuelOutils(entree(1, notations, [], [renvoi])), "j1")).toEqual({ juge_id: "j1", motif_indefini: "toutes_paires_ecartees", paires_ecartees: 1 });
    const candidat = { ...renvoi, contexte: "contrefactuel_candidat" as const };
    expect(() => testerContrefactuelOutils(entree(1, notations, [], [candidat]))).toThrow(ContrefactuelIncoherent);
  });

  it("la permutée notée sous le contexte des candidats : incohérence nommée", () => {
    const notations = [surOrigine("j1", 0), surPermutee("j1", 0, { contexte: "contrefactuel_candidat" }), surOrigine("j2", 0), surPermutee("j2", 0)];
    expect(() => testerContrefactuelOutils(entree(1, notations))).toThrow(ContrefactuelIncoherent);
  });

  it("un juge déjà retiré au test des candidats : seul le juge restant est mesuré ; une notation du retiré est refusée", () => {
    const resultat = testerContrefactuelOutils(jeu(10, { j2: 1 }, ["j2"], ["j1"]));
    if (resultat.statut !== "termine") throw new Error(resultat.statut);
    expect(resultat.juges.map((j) => j.juge_id)).toEqual(["j2"]);
    expect(() => testerContrefactuelOutils(jeu(10, {}, ["j1", "j2"], ["j1"]))).toThrow(ContrefactuelIncoherent);
  });

  it("les deux juges retirés : le run est invalide, le test ne se joue pas (refus nommé)", () => {
    expect(() => testerContrefactuelOutils(jeu(1, {}, [], ["j1", "j2"]))).toThrow(ContrefactuelIncoherent);
  });
});

describe("D75 (2) : une paire renvoyée à un humain par un juge est écartée du taux de ce juge seul (§7, protocole 0.33)", () => {
  /** Trois paires, un changement de chaque juge sur la paire 0 ; chaque renvoi remplace la notation de son juge sur son objet. */
  function troisPaires(renvois: readonly RenvoiHumain[]): EntreeContrefactuel {
    const renvoyes = new Set(renvois.map((r) => `${r.notateur.id}\u0000${r.objet_note.id}`));
    const complet = jeu(3, { j1: 1, j2: 1 });
    const notations = complet.notations.filter((n) => !renvoyes.has(`${n.notateur.id}\u0000${n.objet_note.id}`));
    return entree(3, notations, [], renvois);
  }

  it("D75 (2) cas 1 : renvoi d'un seul juge sur la réponse d'origine : hors numérateur et dénominateur de ce juge, l'autre juge garde la paire", () => {
    const renvoi = renvoiJuge("j1", { objet_note: { type: "reponse", id: origineId(0) } });
    const resultat = testerContrefactuelOutils(troisPaires([renvoi]));
    expect(jugeDe(resultat, "j1")).toEqual({ juge_id: "j1", taux: { numerateur: 0, denominateur: 2, valeur: 0 }, paires_ecartees: 1 });
    expect(jugeDe(resultat, "j2")).toEqual({ juge_id: "j2", taux: { numerateur: 1, denominateur: 3, valeur: 1 / 3 }, paires_ecartees: 0 });
  });

  it("D75 (2) cas 1 bis : renvoi d'un juge défaillant sur la copie permutée, quel que soit le motif : même règle", () => {
    const renvoi = valider<RenvoiHumain>(
      "renvoi-humain",
      renvoiDefaillant("j2", { objet_note: { type: "reponse", id: permuteeId(0) }, contexte: "contrefactuel_outil" }),
      "renvoi de test",
    );
    const resultat = testerContrefactuelOutils(troisPaires([renvoi]));
    expect(jugeDe(resultat, "j1")).toEqual({ juge_id: "j1", taux: { numerateur: 1, denominateur: 3, valeur: 1 / 3 }, paires_ecartees: 0 });
    expect(jugeDe(resultat, "j2")).toEqual({ juge_id: "j2", taux: { numerateur: 0, denominateur: 2, valeur: 0 }, paires_ecartees: 1 });
  });

  it("D75 (2) cas 2 : renvoi des deux juges sur la même réponse : la paire sort du taux de chacun, comptée écartée chez chacun", () => {
    const renvois = ["j1", "j2"].map((juge) => renvoiJuge(juge, { objet_note: { type: "reponse", id: origineId(0) } }));
    const resultat = testerContrefactuelOutils(troisPaires(renvois));
    expect(resultat.statut).toBe("termine");
    for (const juge of ["j1", "j2"]) {
      expect(jugeDe(resultat, juge)).toEqual({ juge_id: juge, taux: { numerateur: 0, denominateur: 2, valeur: 0 }, paires_ecartees: 1 });
    }
  });
});
