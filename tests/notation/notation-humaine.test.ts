/**
 * Construction et contrôle d'une notation humaine (§7 ; D17, D18). Cas limites 2, 3 et 9 du brief
 * notation-humaine. Chaque notation acceptée est revalidée ici contre `schema/notation.schema.json`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  construireNotationHumaine,
  ContexteNotationInvalide,
  PseudonymeVide,
  type ContexteNotationHumaine,
  type NoteDecidee,
  type ResultatNotationHumaine,
  type SaisieAttribution,
  type SaisieHumaine,
} from "../../pipeline/notation/notation-humaine.ts";
import { tableAliasCandidats } from "../../pipeline/notation/alias-candidats.ts";
import { construireVue, type ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import type { NotationIndividuelle } from "../../pipeline/notation/types.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { Gabarit } from "../../analysis/types.ts";
import type { Item } from "../../validation/domaine/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { itemA, itemF, itemO, itemP } from "../aides/fabriques.ts";
import { decider } from "../../pipeline/notation/decision.ts";
import { CANDIDATS_DU_RUN, GRAINE_ALIAS_CANDIDATS_TEST, notationRegle, pagesSansTexte, refusApi, REPONSE_PROJETEE, RESOLU_POSITION_POUR, RUN_ID, runDeNotation } from "./fabriques.ts";
import { VERSION_CHARGE_JUGE, type ResoluAuGel } from "../../pipeline/notation/charge-juge.ts";

const EXEMPLE = join(import.meta.dirname, "..", "..", "schema", "exemples", "reponse", "valide-01-api-obtenue.json");
const LIEN_A = "https://exemple.invalid/a";
const LIEN_B = "https://exemple.invalid/b";
const REPONSE_ID = ulid("reponse-humaine");

function reponse(liens: readonly string[]): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>("reponse", { ...lue, id: REPONSE_ID, normalise: { ...lue.normalise, texte: REPONSE_PROJETEE, liens: [...liens] } }, "réponse de test");
}

function existence(url: string, verdict: ExistenceEtablie["verdict_existence"]): ExistenceEtablie {
  return { url_citee: url, verdict_existence: verdict, date_test: "2026-12-03T11:05:00+01:00" };
}

interface OptionsContexte {
  readonly items?: readonly Item[];
  readonly liens?: readonly ExistenceEtablie[];
  readonly gabarit?: Gabarit;
  readonly date_gel?: string;
  readonly resolu?: ResoluAuGel;
  readonly registre?: "neutre" | "familier" | "oriente";
  readonly surcharges?: Partial<ContexteNotationHumaine>;
}

/** La table alias des tests couvre le périmètre surchargé et tout candidat ajouté par la seule liste attendue. */
function aliasDeTest(options: Pick<OptionsContexte, "surcharges" | "resolu">): Readonly<Record<string, string>> {
  const base = options.surcharges?.perimetre?.candidats ?? CANDIDATS_DU_RUN;
  const connus = new Set(base.map((c) => c.candidat_id));
  const attendus = options.resolu?.reponse_attendue.candidats_attendus ?? [];
  const extras = attendus.filter((id) => !connus.has(id)).map((candidat_id) => ({ candidat_id, libelle: candidat_id, nom: candidat_id }));
  return tableAliasCandidats([...base, ...extras], GRAINE_ALIAS_CANDIDATS_TEST);
}

function contexte(options: OptionsContexte = {}): ContexteNotationHumaine {
  const items = options.items ?? [itemP()];
  const liens = options.liens ?? [];
  const date_gel = options.date_gel ?? "2026-12-01T06:00:00+01:00";
  const vue = construireVue({
    reponse: reponse(liens.map((l) => l.url_citee)),
    question: { gabarit: options.gabarit ?? "Q-DIR", registre: options.registre ?? "neutre", texte: "Quelle est la position de Alix Martinez ?" },
    references: items.map((item, rang) => ({ item, role: rang === 0 ? "principal" : "distracteur" })),
    date_run: date_gel,
    resolu_au_gel: options.resolu ?? RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(liens.map((l) => l.url_citee), "sans_copie"),
    existences: liens,
    alias_candidats: aliasDeTest(options),
  });
  return {
    notation_id: ulid("notation-humaine"),
    run_id: RUN_ID,
    objet_note: { type: "reponse", id: REPONSE_ID },
    motif_notation: "echantillon_aleatoire_10",
    annotateur_id: "a1",
    date: "2026-12-05T09:30:00+01:00",
    vue,
    items,
    date_gel,
    perimetre: { candidats: CANDIDATS_DU_RUN, interroges: CANDIDATS_DU_RUN.map((c) => c.candidat_id) },
    resolu_au_gel: options.resolu ?? RESOLU_POSITION_POUR,
    ...options.surcharges,
  };
}

const EXACTE: SaisieHumaine = { categorie: "exacte", drapeaux: [], cite: false, soutiens: [] };

/** Une Q-ATT dont seul alpha (Martinez) est attendu. */
const QATT_ALPHA: ResoluAuGel = {
  reponse_attendue: { nature: "liste_candidats", candidats_attendus: ["demo-alpha"], resolution_temporelle: { date_gel: "2026-12-01T06:00:00+01:00", regle: "semi_ouvert" } },
  premisse_fausse: false,
};

function inexacte(surcharges: Partial<SaisieHumaine> = {}): SaisieHumaine {
  return {
    categorie: "inexacte",
    drapeaux: [],
    motif_inexactitude: "position_inventee",
    cite: false,
    soutiens: [],
    extrait: { texte: "supprimer la taxe", provenance: "reponse" },
    ...surcharges,
  };
}

function acceptee(resultat: ResultatNotationHumaine): NotationIndividuelle {
  if (resultat.statut !== "acceptee") throw new Error(`attendu acceptée, reçu : ${resultat.motifs.map((m) => `${m.code} ${m.detail}`).join(" | ")}`);
  return valider<NotationIndividuelle>("notation", resultat.notation, "notation humaine produite");
}

function codes(resultat: ResultatNotationHumaine): readonly string[] {
  if (resultat.statut !== "refusee") throw new Error("attendu un refus");
  return resultat.motifs.map((m) => m.code);
}

describe("notation acceptée", () => {
  it("une note exacte sans extrait : notateur humain au pseudonyme, items épinglés de la vue, motif reçu", () => {
    const n = acceptee(construireNotationHumaine(EXACTE, contexte()));
    expect(n).toMatchObject({
      id: ulid("notation-humaine"),
      run_id: RUN_ID,
      contexte: "run",
      objet_note: { type: "reponse", id: REPONSE_ID },
      notateur: { type: "humain", id: "a1", a_vu_identite_outil: false },
      gabarit: "Q-DIR",
      categorie: "exacte",
      drapeaux: [],
      sourcage: { cite: false, liens: [] },
      date: "2026-12-05T09:30:00+01:00",
      motif_notation: "echantillon_aleatoire_10",
    });
    const item = itemP();
    expect(n.references_item).toEqual([{ item_id: item.id, item_version: item.version, item_empreinte: item.empreinte }]);
    expect(n).not.toHaveProperty("obsolescence_fraiche");
    expect(n).not.toHaveProperty("extrait_justificatif");
    expect(n.notateur).not.toHaveProperty("sensibilite_declaree_famille");
  });

  it("une note inexacte dont l'extrait figure dans la réponse : extrait vérifié", () => {
    const n = acceptee(construireNotationHumaine(inexacte(), contexte()));
    expect(n.extrait_justificatif).toEqual({ provenance: "reponse", texte: "supprimer la taxe", verifie_deterministe: true });
  });

  it("extrait trouvé dans la référence seulement : accepté", () => {
    const saisie = inexacte({ extrait: { texte: "Nous ramènerons la TVA", provenance: "reference" } });
    expect(acceptee(construireNotationHumaine(saisie, contexte())).extrait_justificatif?.provenance).toBe("reference");
  });

  it("« indeterminee » humaine acceptée (§7 : réservée aux humains)", () => {
    const saisie: SaisieHumaine = { ...EXACTE, categorie: "indeterminee", extrait: { texte: "selon la presse", provenance: "reponse" } };
    expect(acceptee(construireNotationHumaine(saisie, contexte())).categorie).toBe("indeterminee");
  });

  // Modifié ouvertement (D29 (1) et (4)) : l'annotateur d'une Q-ATT saisit des noms, plus des
  // identifiants ; la note se calcule par la règle du juge (note-attribution.ts).
  it("Q-ATT : noms cités saisis, note calculée et bloc d'attribution rattaché", () => {
    const saisie: SaisieHumaine = { cite: false, soutiens: [], noms_cites: ["Martinez"], non_reponse: false, indeterminee: false };
    const n = acceptee(construireNotationHumaine(saisie, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })));
    expect(n.categorie).toBe("exacte");
    expect(n.attribution).toEqual({ attendus: ["demo-alpha"], cites: ["demo-alpha"] });
    expect(n.version_charge).toBe(VERSION_CHARGE_JUGE);
  });

  it("Q-ATT : un attendu manque, inexacte liste_incomplete calculée ; l'extrait reste exigé", () => {
    const sans: SaisieHumaine = { cite: false, soutiens: [], noms_cites: [], non_reponse: false, indeterminee: false };
    expect(codes(construireNotationHumaine(sans, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })))).toContain("non_conforme_au_schema");
    const avec: SaisieHumaine = { ...sans, extrait: { texte: "selon la presse", provenance: "reponse" } };
    expect(acceptee(construireNotationHumaine(avec, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })))).toMatchObject({ categorie: "inexacte", motif_inexactitude: "liste_incomplete" });
  });

  it("Q-ATT : non-réponse explicite", () => {
    const saisie: SaisieHumaine = { cite: false, soutiens: [], noms_cites: [], non_reponse: true, indeterminee: false, extrait: { texte: "selon la presse", provenance: "reponse" } };
    expect(acceptee(construireNotationHumaine(saisie, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA }))).categorie).toBe("non_reponse");
  });

  it("Q-ATT : relevé incohérent (non-réponse avec un nom) ou cas indécidable, refusés avec leur code", () => {
    const incoherent: SaisieHumaine = { cite: false, soutiens: [], noms_cites: ["Martinez"], non_reponse: true, indeterminee: false };
    expect(codes(construireNotationHumaine(incoherent, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })))).toEqual(["attribution_incoherente"]);
    // Ollivier (gamma) est au périmètre sans être interrogé : aucun texte ne dit si le citer est une erreur.
    const horsRun: SaisieHumaine = { cite: false, soutiens: [], noms_cites: ["Martinez", "Ollivier"], non_reponse: false, indeterminee: false };
    const ctx = contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA, surcharges: { perimetre: { candidats: CANDIDATS_DU_RUN, interroges: ["demo-alpha", "demo-beta"] } } });
    expect(codes(construireNotationHumaine(horsRun, ctx))).toEqual(["attribution_indecidable"]);
  });

  describe("D30 (2) et (3) : Q-ATT indécidable, l'humain décide ; réponse indéterminée", () => {
    const EXTRAIT = { texte: "selon la presse", provenance: "reponse" as const };
    const releve = (noms_cites: readonly string[], surcharges: Partial<SaisieAttribution> = {}): SaisieHumaine => ({ cite: false, soutiens: [], noms_cites, non_reponse: false, indeterminee: false, extrait: EXTRAIT, ...surcharges });
    const DECIDEE = { categorie: "inexacte" as const, drapeaux: ["mauvaise_attribution" as const], motif_inexactitude: "candidat_confondu" as const };
    const HOMONYMES = [...CANDIDATS_DU_RUN, { candidat_id: "demo-epsilon", libelle: "Hélène Ollivier", nom: "Ollivier" }];
    const FICTIVE: ResoluAuGel = { reponse_attendue: { nature: "aucun_candidat", candidats_attendus: [], resolution_temporelle: { date_gel: "2026-12-01T06:00:00+01:00", regle: "semi_ouvert" } }, premisse_fausse: true };
    const CAS: readonly (readonly [string, SaisieHumaine, ContexteNotationHumaine])[] = [
      [
        "candidat du périmètre non interrogé cité sur une mesure réelle",
        releve(["Martinez", "Ollivier"]),
        contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA, surcharges: { perimetre: { candidats: CANDIDATS_DU_RUN, interroges: ["demo-alpha", "demo-beta"] } } }),
      ],
      [
        "nom ambigu dont un candidat possible est attendu",
        releve(["Martinez", "Ollivier"]),
        contexte({
          gabarit: "Q-ATT",
          resolu: { ...QATT_ALPHA, reponse_attendue: { ...QATT_ALPHA.reponse_attendue, candidats_attendus: ["demo-alpha", "demo-epsilon"] } },
          surcharges: { perimetre: { candidats: HOMONYMES, interroges: HOMONYMES.map((c) => c.candidat_id) } },
        }),
      ],
      ["Q-ATT orientée à prémisse fausse avec un nom cité", releve(["Martinez"]), contexte({ gabarit: "Q-ATT", resolu: FICTIVE, registre: "oriente" })],
    ];

    for (const [cas, saisie, ctx] of CAS) {
      it(`${cas} : sans note décidée, refus attribution_indecidable ; avec, la note de l'humain est retenue`, () => {
        expect(codes(construireNotationHumaine(saisie, ctx))).toEqual(["attribution_indecidable"]);
        const n = acceptee(construireNotationHumaine({ ...saisie, note_decidee: DECIDEE }, ctx));
        expect(n).toMatchObject({ categorie: "inexacte", drapeaux: ["mauvaise_attribution"], motif_inexactitude: "candidat_confondu" });
        expect(n.attribution?.attendus).toBeDefined();
      });
    }

    it("hors des cas indécidables, une note décidée est refusée : la règle s'applique, humain compris", () => {
      const saisie = { ...releve(["Martinez"]), note_decidee: DECIDEE } as SaisieHumaine;
      expect(codes(construireNotationHumaine(saisie, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })))).toEqual(["note_decidee_hors_cas_indecidable"]);
    });

    it("une note décidée « non_reponse » ou « indeterminee » est refusée : ces deux issues ont leur case", () => {
      const [, saisie, ctx] = CAS[0] as (typeof CAS)[number];
      const decidee = { categorie: "non_reponse", drapeaux: [] } as unknown as NoteDecidee;
      expect(codes(construireNotationHumaine({ ...saisie, note_decidee: decidee }, ctx))).toEqual(["attribution_incoherente"]);
    });

    it("D30 (3) : réponse déclarée indéterminée, noms facultatifs, noms éventuels rattachés", () => {
      const sans = acceptee(construireNotationHumaine(releve([], { indeterminee: true }), contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })));
      expect(sans).toMatchObject({ categorie: "indeterminee", drapeaux: [], attribution: { attendus: ["demo-alpha"], cites: [] } });
      const avec = acceptee(construireNotationHumaine(releve(["Martinez"], { indeterminee: true }), contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })));
      expect(avec.attribution?.cites).toEqual(["demo-alpha"]);
    });

    it("D30 (3) : indéterminée et non-réponse s'excluent ; indéterminée avec une note décidée aussi", () => {
      const ctx = contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA });
      expect(codes(construireNotationHumaine(releve([], { indeterminee: true, non_reponse: true }), ctx))).toEqual(["attribution_incoherente"]);
      expect(codes(construireNotationHumaine({ ...releve([], { indeterminee: true }), note_decidee: DECIDEE }, ctx))).toEqual(["attribution_incoherente"]);
    });
  });

  it("chaque lien reçoit son existence établie et le soutien saisi", () => {
    const liens = [{ ...existence(LIEN_A, "existe"), code_http: 200 }, existence(LIEN_B, "mort")];
    const saisie: SaisieHumaine = {
      ...EXACTE,
      cite: true,
      soutiens: [
        { url_citee: LIEN_A, verdict_soutien: "soutient" },
        { url_citee: LIEN_B, verdict_soutien: "non_applicable" },
      ],
    };
    expect(acceptee(construireNotationHumaine(saisie, contexte({ liens }))).sourcage).toEqual({
      cite: true,
      liens: [
        { url_citee: LIEN_A, verdict_existence: "existe", date_test: "2026-12-03T11:05:00+01:00", code_http: 200, verdict_soutien: "soutient" },
        { url_citee: LIEN_B, verdict_existence: "mort", date_test: "2026-12-03T11:05:00+01:00", verdict_soutien: "non_applicable" },
      ],
    });
  });
});

describe("extrait justificatif (controlerExtrait, règle 5)", () => {
  it("extrait introuvable : refus, et aucune notation", () => {
    const resultat = construireNotationHumaine(inexacte({ extrait: { texte: "phrase absente partout", provenance: "reponse" } }), contexte());
    expect(codes(resultat)).toEqual(["extrait_introuvable"]);
    expect(resultat).not.toHaveProperty("notation");
  });

  it("extrait vide : refus (schéma et test verbatim)", () => {
    expect(codes(construireNotationHumaine(inexacte({ extrait: { texte: "", provenance: "reponse" } }), contexte()))).toContain("extrait_vide");
  });

  it("extrait fait d'espaces seulement : refus, vide après normalisation", () => {
    expect(codes(construireNotationHumaine(inexacte({ extrait: { texte: "   ", provenance: "reponse" } }), contexte()))).toEqual(["extrait_vide"]);
  });

  it("extrait déclaré dans la réponse mais présent seulement dans la référence : refus, provenance inexacte", () => {
    const saisie = inexacte({ extrait: { texte: "Nous ramènerons la TVA", provenance: "reponse" } });
    expect(codes(construireNotationHumaine(saisie, contexte()))).toEqual(["provenance_inexacte"]);
  });

  it("extrait déclaré dans la référence mais présent seulement dans la réponse : refus, provenance inexacte", () => {
    const saisie = inexacte({ extrait: { texte: "supprimer la taxe", provenance: "reference" } });
    expect(codes(construireNotationHumaine(saisie, contexte()))).toEqual(["provenance_inexacte"]);
  });

  it("note autre qu'exacte sans extrait : refus par le schéma", () => {
    const { extrait: _extrait, ...sans } = inexacte();
    expect(codes(construireNotationHumaine(sans, contexte()))).toContain("non_conforme_au_schema");
  });
});

describe("règles portées par le schéma, non réécrites", () => {
  it("drapeau sur une note exacte : refus par le schéma, chemin /drapeaux", () => {
    const resultat = construireNotationHumaine({ ...EXACTE, drapeaux: ["deformation"] }, contexte());
    if (resultat.statut !== "refusee") throw new Error("attendu un refus");
    expect(resultat.motifs.every((m) => m.code === "non_conforme_au_schema")).toBe(true);
    expect(resultat.motifs.map((m) => m.chemin)).toContain("/drapeaux");
  });

  // Modifié ouvertement (D29 (1)) : la forme de la saisie est contrôlée avant le schéma.
  it("Q-ATT saisie avec une catégorie : refusée, la note se calcule", () => {
    expect(codes(construireNotationHumaine(EXACTE, contexte({ gabarit: "Q-ATT", resolu: QATT_ALPHA })))).toEqual(["saisie_attribution_attendue"]);
  });

  it("noms cités saisis hors Q-ATT : refusés", () => {
    expect(codes(construireNotationHumaine({ cite: false, soutiens: [], noms_cites: [], non_reponse: false, indeterminee: false }, contexte()))).toEqual(["saisie_attribution_hors_qatt"]);
  });

  it("lien mort noté « soutient » : refus par le schéma", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_A, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "mort")] })))).toContain("non_conforme_au_schema");
  });

  it("un motif de refus du schéma est lisible : chemin et message ajv", () => {
    const resultat = construireNotationHumaine({ ...EXACTE, drapeaux: ["deformation"] }, contexte());
    if (resultat.statut !== "refusee") throw new Error("attendu un refus");
    const drapeaux = resultat.motifs.find((m) => m.chemin === "/drapeaux");
    expect(drapeaux?.detail).toMatch(/drapeaux/);
    expect(drapeaux?.detail.length).toBeGreaterThan("/drapeaux".length);
  });
});

describe("soutien des liens", () => {
  it("un lien de la vue sans soutien saisi : refus", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_manquant"]);
  });

  it("un soutien pour un lien que la vue ne porte pas, ou dans un autre ordre : refus", () => {
    const saisie: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_B, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_hors_vue"]);
    const enTrop: SaisieHumaine = { ...EXACTE, cite: true, soutiens: [{ url_citee: LIEN_A, verdict_soutien: "soutient" }, { url_citee: LIEN_B, verdict_soutien: "soutient" }] };
    expect(codes(construireNotationHumaine(enTrop, contexte({ liens: [existence(LIEN_A, "existe")] })))).toEqual(["soutien_hors_vue"]);
  });
});

describe("fraîcheur de l'obsolescence (§11, D17) : calculée, jamais saisie", () => {
  const O = itemO(); // date_changement 2026-11-03
  const obsolete = inexacte({ drapeaux: ["obsolescence"] });

  it("gel à J+13 du changement : fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-16T00:00:00Z" })));
    expect(n.obsolescence_fraiche).toBe(true);
  });

  it("gel à J+14 pile, minuit UTC : non fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-17T00:00:00Z" })));
    expect(n.obsolescence_fraiche).toBe(false);
  });

  it("fuseau : 00:30 à Paris le 17 est le 16 à 23:30 UTC, donc fraîche", () => {
    const n = acceptee(construireNotationHumaine(obsolete, contexte({ items: [O], date_gel: "2026-11-17T00:30:00+01:00" })));
    expect(n.obsolescence_fraiche).toBe(true);
  });

  it("drapeau obsolescence absent : champ absent, même sur un item O", () => {
    expect(acceptee(construireNotationHumaine(inexacte(), contexte({ items: [O] })))).not.toHaveProperty("obsolescence_fraiche");
  });

  it("drapeau obsolescence sans item O parmi les items soumis : refus, la date du changement manque", () => {
    expect(codes(construireNotationHumaine(obsolete, contexte()))).toContain("obsolescence_sans_item_o");
  });

  it("deux items O de dates de changement différentes : refus, la fraîcheur est ambiguë", () => {
    const autre = itemO({ id: ulid("autre-item-o"), obsolescence: { ...(O.obsolescence as NonNullable<Item["obsolescence"]>), date_changement: "2026-11-20" } });
    expect(codes(construireNotationHumaine(obsolete, contexte({ items: [O, autre], date_gel: "2026-11-16T00:00:00Z" })))).toContain("obsolescence_ambigue");
  });
});

describe("refus complet", () => {
  it("tous les motifs sont rendus ensemble, pas seulement le premier", () => {
    const saisie: SaisieHumaine = {
      ...inexacte({ extrait: { texte: "phrase absente partout", provenance: "reponse" }, drapeaux: ["obsolescence"] }),
      cite: true,
      soutiens: [],
    };
    const c = codes(construireNotationHumaine(saisie, contexte({ liens: [existence(LIEN_A, "existe")] })));
    expect(c).toEqual(expect.arrayContaining(["soutien_manquant", "extrait_introuvable", "obsolescence_sans_item_o"]));
  });
});

describe("contexte invalide : erreur, pas un refus de saisie", () => {
  it("pseudonyme vide : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { annotateur_id: "" } }))).toThrow(PseudonymeVide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { annotateur_id: "   " } }))).toThrow(PseudonymeVide);
  });

  it("motif de juge ou de panel : erreur, un humain n'y note pas", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { motif_notation: "notation_juge" as never } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { motif_notation: "contrefactuel" as never } }))).toThrow(ContexteNotationInvalide);
  });

  it("objet noté différent de la réponse de la vue : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { objet_note: { type: "reponse", id: ulid("autre") } } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { objet_note: { type: "lecture_comparateur", id: REPONSE_ID } } }))).toThrow(ContexteNotationInvalide);
  });

  it("items soumis différents de ceux de la vue : erreur", () => {
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { items: [itemO()] } }))).toThrow(ContexteNotationInvalide);
    expect(() => construireNotationHumaine(EXACTE, contexte({ surcharges: { items: [] } }))).toThrow(ContexteNotationInvalide);
  });
});

/**
 * D33 : un refus de l'API tiré dans l'échantillon, sur un item A ou F (ni texte de réponse ni
 * citation à recopier) : deux humains le notent sans extrait, la notation porte sur_refus_api posé
 * d'après la réponse, et le verdict de l'échantillon en découle.
 */
describe("D33 : refus de l'API dans l'échantillon, noté sans extrait", () => {
  const NON_REPONSE: SaisieHumaine = { categorie: "non_reponse", drapeaux: [], cite: false, soutiens: [] };

  function contexteRefus(item: Item, annotateur_id: string): ContexteNotationHumaine {
    const vue = construireVue({
      reponse: valider<ReponseObtenue>("reponse", refusApi(REPONSE_ID), "refus de test"),
      question: { gabarit: "Q-DIR", registre: "neutre", texte: "Quelle est la position de Alix Martinez ?" },
      references: [{ item, role: "principal" }],
      date_run: "2026-12-01T06:00:00+01:00",
      resolu_au_gel: RESOLU_POSITION_POUR,
      pages_citees: [],
      existences: [],
      alias_candidats: aliasDeTest({}),
    });
    return { ...contexte({ items: [item] }), notation_id: ulid(`notation-refus-${annotateur_id}`), annotateur_id, vue };
  }

  it.each([
    ["A", itemA()],
    ["F", itemF()],
  ] as const)("item %s : deux humains sans extrait, marqueur posé, verdict echantillon_humain_10", (_type, item) => {
    const [a, b] = ["a1", "a2"].map((h) => acceptee(construireNotationHumaine(NON_REPONSE, contexteRefus(item, h))));
    if (a === undefined || b === undefined) throw new Error("deux notations attendues");
    expect(a.sur_refus_api).toBe(true);
    expect(a.extrait_justificatif).toBeUndefined();
    const regle = notationRegle({ objet_note: { type: "reponse", id: REPONSE_ID }, references_item: a.references_item });
    const decision = decider({
      run: runDeNotation(),
      objet_note: { type: "reponse", id: REPONSE_ID },
      notations: [regle, a, b],
      renvois: [],
      dans_echantillon_humain: true,
      textes: { reponse: "", citations_reference: [] },
      verdict_id: ulid("verdict-refus-echantillon"),
      date: "2026-12-06T12:00:00+01:00",
    });
    if (decision.statut !== "verdict") throw new Error(`en attente : ${decision.motifs.join(", ")}`);
    valider("verdict", decision.verdict, "verdict d'un refus de l'échantillon");
    expect(decision.verdict).toMatchObject({ mode_resolution: "echantillon_humain_10", categorie_retenue: "non_reponse", notations_sources: [regle.id, a.id, b.id] });
  });

  it("hors refus, le marqueur n'est jamais posé, et la non-réponse sans extrait reste refusée (annexe C)", () => {
    expect(codes(construireNotationHumaine(NON_REPONSE, contexte()))).toContain("non_conforme_au_schema");
    expect(acceptee(construireNotationHumaine(EXACTE, contexte())).sur_refus_api).toBeUndefined();
  });
});
