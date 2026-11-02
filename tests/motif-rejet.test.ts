/**
 * Motif de rejet énuméré « texte extrait erroné » (§4, protocole 0.24, D59 (9), première moitié).
 *
 * Un texte extrait faux se solde par un rejet de l'item sous ce motif, et c'est ce motif qui renvoie
 * la source à la réextraction. Ici : la forme du motif dans la ligne de journal, aux trois
 * frontières (lecteur de requête, domaine, schéma). Le renvoi lui-même est testé dans
 * `tests/renvoi-reextraction.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../outils/schemas/valider.ts";
import { construireDecision, type SoumissionDecision } from "../validation/domaine/decision.ts";
import type { Decision, Item, MotifRejet } from "../validation/domaine/types.ts";
import { lireRequeteDecision } from "../validation/serveur/lecture-requetes.ts";
import { decision, GRILLE_TOUT_VRAI, itemA, itemF, itemO, itemP } from "./aides/fabriques.ts";

const contexte = (item: Item) => ({
  annotateur_id: "a1",
  lot_id: "lot-001",
  lot_nature: "reel" as const,
  item,
  visite: 1,
  horodatage: "2026-09-20T10:00:00+02:00",
  identifiant: "01JBANCESSA1DEC1S10N000099",
});

function soumission(item: Item, decision_: Decision, motif?: MotifRejet): SoumissionDecision {
  const grilles = item.type === "O" ? { reponses_par_etat: GRILLES_O } : { reponses_grille: grilleSelonType(item) };
  return {
    item_id: item.id,
    decision: decision_,
    ...grilles,
    ...(item.type === "A" ? { questions_specifiques: { couverture_theme_verifiee: true, corpus_complet: true, confirmation_absence: true } } : {}),
    ...(item.type === "F" ? { questions_specifiques: { fictivite_verifiee: true, plausibilite: true } } : {}),
    ...(motif === undefined ? {} : { motif_rejet: motif }),
    duree_affichage_ms: 1000,
    duree_active_ms: 900,
  };
}

/** Item O de la fabrique : états sans quantification, thème jugé sur l'état postérieur seulement. */
const GRILLES_O = {
  anterieur: { ...GRILLE_TOUT_VRAI, theme_correct: null, quantification_correcte: null },
  posterieur: { ...GRILLE_TOUT_VRAI, quantification_correcte: null },
};

/** Grilles complètes par type (les questions sans objet valent null, §4). */
function grilleSelonType(item: Item) {
  if (item.type === "A") {
    return { citation_fidele: null, paraphrase_exacte: null, position_univoque: true, theme_correct: true, quantification_correcte: null };
  }
  if (item.type === "F") {
    return { citation_fidele: null, paraphrase_exacte: null, position_univoque: null, theme_correct: true, quantification_correcte: null };
  }
  return GRILLE_TOUT_VRAI;
}

describe("motif de rejet « texte extrait erroné » : domaine", () => {
  it("un rejet d'item P sous le motif est accepté, et la ligne de journal le porte", () => {
    const item = itemP();
    const resultat = construireDecision(soumission(item, "rejeter", "texte_extrait_errone"), contexte(item));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.entree.motif_rejet).toBe("texte_extrait_errone");
    expect(erreurDeSchema("decision", resultat.entree, "test")).toBeNull();
  });

  it("un rejet sans motif reste un rejet ordinaire : la ligne ne porte aucun motif, ni valeur inventée", () => {
    const item = itemP();
    const resultat = construireDecision(soumission(item, "rejeter"), contexte(item));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect("motif_rejet" in resultat.entree).toBe(false);
    expect(erreurDeSchema("decision", resultat.entree, "test")).toBeNull();
  });

  it("le motif est refusé sur toute décision autre que « rejeter »", () => {
    const item = itemP();
    for (const autre of ["accepter", "non_evaluable"] as Decision[]) {
      const resultat = construireDecision(soumission(item, autre, "texte_extrait_errone"), contexte(item));
      expect(resultat.ok, autre).toBe(false);
      if (resultat.ok) continue;
      expect(resultat.manquements).toContainEqual({ cle: "motif_rejet", probleme: "repondue_alors_que_sans_objet" });
    }
  });

  it("le motif est refusé sur un item F, qui n'a aucune source de contenu, donc aucun texte extrait", () => {
    const item = itemF();
    const resultat = construireDecision(soumission(item, "rejeter", "texte_extrait_errone"), contexte(item));
    expect(resultat.ok).toBe(false);
    if (resultat.ok) return;
    expect(resultat.manquements).toContainEqual({ cle: "motif_rejet", probleme: "repondue_alors_que_sans_objet" });
  });

  it("le motif est admis sur un item A (source de couverture) et sur un item O (deux états sourcés)", () => {
    for (const item of [itemA(), itemO()]) {
      const resultat = construireDecision(
        {
          ...soumission(item, "rejeter", "texte_extrait_errone"),
          ...(item.type === "O" ? { questions_specifiques: { changement_explicite: true, transcription_ecoutee: true } } : {}),
        },
        contexte(item),
      );
      expect(resultat.ok, `item ${item.type} : ${JSON.stringify(resultat.ok ? null : resultat.manquements)}`).toBe(true);
    }
  });
});

describe("motif de rejet : schéma de la ligne de journal", () => {
  it("une valeur hors de l'énumération est refusée par le schéma", () => {
    const item = itemP();
    const ligne = { ...decision({ annotateur_id: "a1", item, decision: "rejeter" }), motif_rejet: "coquille" };
    expect(erreurDeSchema("decision", ligne, "test")).not.toBeNull();
  });

  it("le schéma refuse le motif sur une décision autre que « rejeter »", () => {
    const item = itemP();
    const ligne = { ...decision({ annotateur_id: "a1", item, decision: "accepter" }), motif_rejet: "texte_extrait_errone" };
    expect(erreurDeSchema("decision", ligne, "test")).not.toBeNull();
  });

  it("une ligne de journal antérieure, sans le champ, reste valide", () => {
    const item = itemP();
    expect(erreurDeSchema("decision", decision({ annotateur_id: "a1", item, decision: "rejeter" }), "test")).toBeNull();
  });
});

describe("motif de rejet : lecteur du corps POST /api/decisions", () => {
  const CORPS = {
    lot_id: "lot-001",
    item_id: "01JBANCESSA100000001TEM0A1",
    decision: "rejeter",
    reponses_grille: GRILLE_TOUT_VRAI,
    corrections: [],
    duree_affichage_ms: 1,
    duree_active_ms: 1,
  };

  it("lit le motif quand il est une chaîne", () => {
    const lecture = lireRequeteDecision({ ...CORPS, motif_rejet: "texte_extrait_errone" });
    expect(lecture.ok).toBe(true);
    if (lecture.ok) expect(lecture.requete.motif_rejet).toBe("texte_extrait_errone");
  });

  it("refuse en 400 un motif qui n'est pas une chaîne, null compris : une absence s'écrit en omettant le champ", () => {
    expect(lireRequeteDecision({ ...CORPS, motif_rejet: null }).ok).toBe(false);
    expect(lireRequeteDecision({ ...CORPS, motif_rejet: 3 }).ok).toBe(false);
  });
});
