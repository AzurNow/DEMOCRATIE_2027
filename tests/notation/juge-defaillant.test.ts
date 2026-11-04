/**
 * §7 (protocole 0.27, D67 ; conformité 2026-11-03, constat 8, §7.59) : « Une réponse qu'un juge ne
 * peut pas noter (erreur persistante de son API, charge qui dépasse sa fenêtre de contexte, sortie
 * refusée ou illisible) est renvoyée à un humain, comme une question d'attribution que la règle ne
 * tranche pas ; elle sort du kappa de ce juge ». Le renvoi porte son motif nommé et la notation
 * continue ; une erreur du banc, elle, remonte toujours.
 *
 * Annexe C (protocole 0.27, C.04, constat 11) : côté juge, une réponse au texte vide est notée sans
 * extrait, et la notation porte `sur_texte_vide`, posé d'après le texte.
 */

import { describe, expect, it } from "vitest";
import type { ChargeJuge } from "../../pipeline/notation/charge-juge.ts";
import {
  issueDeJuge,
  JugeDefaillant,
  noterOuRenvoyer,
  type CadreNotationJuge,
  type IdentiteJuge,
  type Juge,
  type SortieJuge,
  type SortieJugeAttribution,
} from "../../pipeline/notation/juge.ts";
import { MOTIFS_RENVOI_DEFAILLANCE, type NotationIndividuelle, type RenvoiHumain } from "../../pipeline/notation/types.ts";
import { ContexteAttributionIncoherent } from "../../pipeline/notation/note-attribution.ts";
import { LienSansVerdictExistence } from "../../pipeline/notation/vue-annotateur.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { ulid } from "../analysis/fabriques.ts";
import { CADRE_V3, CANDIDATS_DU_RUN, GEL_DES_TESTS, ITEM_REF, REPONSE_ID, REPONSE_PROJETEE, RUN_ID } from "./fabriques.ts";

const IDENTITE: IdentiteJuge = { juge_id: "j1", famille_modele: "famille-j1", modele: "famille-j1/modele", prompt: { chemin: "simule://juge-test", version: "1.0.0" } };
const CHARGE = {} as ChargeJuge;

const EXACTE: SortieJuge = { categorie: "exacte", drapeaux: [], sourcage: { cite: false, soutiens: [] } };
const NON_REPONSE_SANS_EXTRAIT: SortieJuge = { categorie: "non_reponse", drapeaux: [], sourcage: { cite: false, soutiens: [] } };

const LISTE: ReponseAttendue = {
  nature: "liste_candidats",
  candidats_attendus: ["demo-alpha"],
  candidats_references: ["demo-alpha", "demo-beta", "demo-gamma"],
  resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" },
};

function cadre(surcharges: Partial<CadreNotationJuge> = {}): CadreNotationJuge {
  return {
    id: ulid("notation-juge-defaillant"),
    run_id: RUN_ID,
    contexte: "run",
    motif_notation: "notation_juge",
    objet_id: REPONSE_ID,
    gabarit: "Q-DIR",
    references_item: [ITEM_REF],
    date: "2026-12-04T10:00:00+01:00",
    liens: [],
    existences: new Map(),
    textes: { reponse: REPONSE_PROJETEE, citations_reference: [] },
    ...CADRE_V3,
    ...surcharges,
  };
}

const QATT: Partial<CadreNotationJuge> = { gabarit: "Q-ATT", reponse_attendue: LISTE, candidats: CANDIDATS_DU_RUN };

function renvoiDe(resultat: ReturnType<typeof issueDeJuge>): RenvoiHumain {
  if (resultat.type !== "renvoi") throw new Error(`renvoi attendu, reçu ${resultat.type}`);
  return valider<RenvoiHumain>("renvoi-humain", resultat.renvoi, "renvoi de juge défaillant");
}

function notationDe(resultat: ReturnType<typeof issueDeJuge>): NotationIndividuelle {
  if (resultat.type !== "notation") throw new Error(`notation attendue, reçu ${resultat.type}`);
  return valider<NotationIndividuelle>("notation", resultat.notation, "notation de juge");
}

function juge(noter: () => Promise<SortieJuge>): Juge {
  return { identite: IDENTITE, noter };
}

describe("§7 (0.27) : une sortie incohérente devient un renvoi sortie_illisible, jamais un arrêt", () => {
  const INCOHERENTES: readonly (readonly [string, SortieJuge, Partial<CadreNotationJuge>])[] = [
    ["sans catégorie hors Q-ATT", { sourcage: { cite: false, soutiens: [] } } as unknown as SortieJuge, {}],
    ["champ inconnu", { ...EXACTE, avis_personnel: "x" } as SortieJuge, {}],
    ["non_classee rendue par le juge", { ...EXACTE, categorie: "non_classee" }, {}],
    ["drapeau obsolescence sans item O", { categorie: "inexacte", drapeaux: ["obsolescence"], motif_inexactitude: "position_opposee", sourcage: { cite: false, soutiens: [] }, extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE } }, {}],
    ["avis de soutien sans source citée", { ...EXACTE, sourcage: { cite: false, soutiens: [{ url_citee: "https://exemple.invalid/a", verdict_soutien: "soutient" }] } }, {}],
  ];

  for (const [cas, sortie, surcharges] of INCOHERENTES) {
    it(cas, () => {
      const renvoi = renvoiDe(issueDeJuge(IDENTITE, sortie, cadre(surcharges)));
      expect(renvoi).toMatchObject({ motif: "sortie_illisible", gabarit: "Q-DIR", contexte: "run", objet_note: { type: "reponse", id: REPONSE_ID }, notateur: { type: "juge", id: "j1" } });
      expect(renvoi.raison.length).toBeGreaterThan(0);
      expect("noms_cites" in renvoi || "attribution" in renvoi).toBe(false);
    });
  }

  it("Q-ATT au relevé incohérent (non-réponse avec des noms) : sortie_illisible sur la Q-ATT, sans noms ni bloc d'attribution", () => {
    const sortie: SortieJugeAttribution = { noms_cites: ["Martinez"], non_reponse: true, sourcage: { cite: false, soutiens: [] }, extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE } };
    const renvoi = renvoiDe(issueDeJuge(IDENTITE, sortie, cadre(QATT)));
    expect(renvoi).toMatchObject({ motif: "sortie_illisible", gabarit: "Q-ATT" });
    expect("noms_cites" in renvoi).toBe(false);
  });

  it("le renvoi porte l'identifiant que la notation aurait porté : une relance le retrouve", () => {
    const sortie = { sourcage: { cite: false, soutiens: [] } } as unknown as SortieJuge;
    expect(renvoiDe(issueDeJuge(IDENTITE, sortie, cadre())).id).toBe(cadre().id);
  });

  it("une erreur du banc n'est jamais convertie : un lien sans verdict d'existence remonte", () => {
    const sortie: SortieJuge = { ...EXACTE, sourcage: { cite: true, soutiens: [{ url_citee: "https://exemple.invalid/a", verdict_soutien: "soutient" }] } };
    expect(() => issueDeJuge(IDENTITE, sortie, cadre({ liens: ["https://exemple.invalid/a"] }))).toThrow(LienSansVerdictExistence);
  });

  it("un contexte de run incohérent (éliminé aussi interrogé) remonte, jamais renvoyé", () => {
    const sortie: SortieJugeAttribution = { noms_cites: ["Martinez"], non_reponse: false, sourcage: { cite: false, soutiens: [] }, extrait_justificatif: { provenance: "reponse", texte: REPONSE_PROJETEE } };
    expect(() => issueDeJuge(IDENTITE, sortie, cadre({ ...QATT, elimines: ["demo-beta"] }))).toThrow(ContexteAttributionIncoherent);
  });

  it("une sortie cohérente reste une notation", () => {
    expect(notationDe(issueDeJuge(IDENTITE, EXACTE, cadre())).categorie).toBe("exacte");
  });
});

describe("§7 (0.27) : un juge défaillant (JugeDefaillant) devient un renvoi sous son motif", () => {
  for (const motif of MOTIFS_RENVOI_DEFAILLANCE) {
    it(`${motif} : renvoi conforme au schéma, motif et détail conservés`, async () => {
      const defaillant = juge(() => Promise.reject(new JugeDefaillant("j1", motif, "trois tentatives sans réponse")));
      const renvoi = renvoiDe(await noterOuRenvoyer(defaillant, CHARGE, cadre()));
      expect(renvoi.motif).toBe(motif);
      expect(renvoi.raison).toContain("trois tentatives sans réponse");
    });
  }

  it("sur une Q-ATT aussi, sans noms relevés", async () => {
    const renvoi = renvoiDe(await noterOuRenvoyer(juge(() => Promise.reject(new JugeDefaillant("j1", "contexte_depasse", "charge trop longue"))), CHARGE, cadre(QATT)));
    expect(renvoi).toMatchObject({ motif: "contexte_depasse", gabarit: "Q-ATT" });
  });

  it("un autre rejet du juge n'est pas une défaillance nommée : il remonte tel quel", async () => {
    await expect(noterOuRenvoyer(juge(() => Promise.reject(new TypeError("bogue"))), CHARGE, cadre())).rejects.toThrow(TypeError);
  });

  it("une sortie rendue passe par issueDeJuge : notation, ou renvoi sortie_illisible", async () => {
    expect((await noterOuRenvoyer(juge(() => Promise.resolve(EXACTE)), CHARGE, cadre())).type).toBe("notation");
    const illisible = { sourcage: { cite: false, soutiens: [] } } as unknown as SortieJuge;
    expect(renvoiDe(await noterOuRenvoyer(juge(() => Promise.resolve(illisible)), CHARGE, cadre())).motif).toBe("sortie_illisible");
  });
});

describe("annexe C (0.27) : réponse au texte vide, côté juge", () => {
  const VIDE = { textes: { reponse: "", citations_reference: [] } } as const;

  it("non-réponse sans extrait sur un texte vide : notation valide, sur_texte_vide posé", () => {
    const notation = notationDe(issueDeJuge(IDENTITE, NON_REPONSE_SANS_EXTRAIT, cadre(VIDE)));
    expect(notation.sur_texte_vide).toBe(true);
    expect(notation.extrait_justificatif).toBeUndefined();
  });

  it("texte non vide : aucun marqueur, et la non-réponse sans extrait reste invalide au schéma", () => {
    const resultat = issueDeJuge(IDENTITE, NON_REPONSE_SANS_EXTRAIT, cadre());
    if (resultat.type !== "notation") throw new Error("notation attendue");
    expect(resultat.notation.sur_texte_vide).toBeUndefined();
    expect(() => valider("notation", resultat.notation, "non-réponse sans extrait")).toThrow();
  });

  it("texte fait d'espaces : un texte, aucun marqueur", () => {
    const resultat = issueDeJuge(IDENTITE, NON_REPONSE_SANS_EXTRAIT, cadre({ textes: { reponse: "   ", citations_reference: [] } }));
    if (resultat.type !== "notation") throw new Error("notation attendue");
    expect(resultat.notation.sur_texte_vide).toBeUndefined();
  });

  it("Q-ATT au texte vide, liste attendue non vide, sans extrait : notation inexacte acceptée, et non plus une sortie incohérente", () => {
    const sortie: SortieJugeAttribution = { noms_cites: [], non_reponse: false, sourcage: { cite: false, soutiens: [] } };
    const notation = notationDe(issueDeJuge(IDENTITE, sortie, cadre({ ...QATT, ...VIDE })));
    expect(notation).toMatchObject({ categorie: "inexacte", sur_texte_vide: true });
  });

  it("Q-ATT au texte non vide sans extrait : toujours renvoyée (sortie_illisible), jamais notée", () => {
    const sortie: SortieJugeAttribution = { noms_cites: [], non_reponse: false, sourcage: { cite: false, soutiens: [] } };
    expect(renvoiDe(issueDeJuge(IDENTITE, sortie, cadre(QATT))).motif).toBe("sortie_illisible");
  });
});
