/**
 * Aveuglement de l'écran de notation humaine (D18, aveugle total ; cas limite 1 du brief).
 *
 * Même méthode que `tests/aveuglement.test.ts` : une énumération, pas un échantillon. Le test
 * parcourt **toutes** les routes déclarées, les exécute sur un run où l'outil, les juges et un autre
 * annotateur portent des valeurs sentinelles, et vérifie qu'aucune n'apparaît dans une réponse
 * sérialisée. La table de routes du test est comparée à celle du serveur : une route ajoutée sans y
 * penser fait tomber la suite.
 */

import { afterEach, describe, expect, it } from "vitest";
import { ROUTES } from "../../notation-humaine/serveur/routes.ts";
import { appeler, humain, juge, monter, SENTINELLES, SAISIE_EXACTE, type Monde } from "./fixture.ts";

let monde: Monde | null = null;

afterEach(() => {
  monde?.nettoyer();
  monde = null;
});

/** Tout ce qu'un annotateur ne doit jamais lire, sous quelque forme que ce soit. */
const INTERDITS = [
  SENTINELLES.outil,
  SENTINELLES.alias,
  SENTINELLES.autre_humain,
  SENTINELLES.extrait_juge,
  SENTINELLES.normalisation,
  "outil_id",
  "alias_aveugle",
  "juge-1",
  "juge-2",
  "famille-juge",
  "notation_juge",
  // Le motif de la tâche trahirait une note de juge ou d'humain : il n'est jamais servi.
  "motif_notation",
  "extrait_invalide",
  "desaccord_juges",
  "erreur_grave",
  "accord_partiel_juges",
  "arbitrage_echantillon_10",
];

function jeuAveugle(): Monde {
  const m = monter();
  const [h1, h2] = m.hors;
  if (h1 === undefined || h2 === undefined) throw new Error("réponses attendues");
  m.ecrire(
    // Un autre humain a noté la réponse de l'échantillon, avec un extrait qui lui est propre.
    humain(m, SENTINELLES.autre_humain, "echantillon_aleatoire_10", m.dans),
    // Les juges ne s'accordent pas sur h1, et l'extrait du premier échoue au test verbatim : un humain est appelé.
    juge(m, "juge-1", h1, { categorie: "inexacte", motif_inexactitude: "omission", extrait_justificatif: { provenance: "reponse", texte: SENTINELLES.extrait_juge, verifie_deterministe: true } }),
    juge(m, "juge-2", h1),
    // Les juges s'accordent sur h2.
    juge(m, "juge-1", h2),
    juge(m, "juge-2", h2),
  );
  return m;
}

describe("1. aveuglement : aucune route ne sert l'outil, un juge ni un autre annotateur", () => {
  it("la table de routes du test est celle du serveur", () => {
    expect(ROUTES.map((r) => `${r.methode} ${r.nom}`).sort()).toEqual(["GET file", "GET session", "GET vue", "POST notation"]);
  });

  it("chaque route, exécutée sur un run chargé de sentinelles, n'en renvoie aucune", () => {
    monde = jeuAveugle();
    const m = monde;
    const contexte = m.contexte("a1");
    const [h1] = m.hors;
    const appelees = new Set<string>();
    const appel = (nom: string, params: readonly string[] = [], corps: unknown = null) => {
      appelees.add(nom);
      return appeler(contexte, nom, params, corps);
    };
    const vues = m.reponses.map((r) => appel("vue", [r.id]));
    const reponses = [
      appel("session"),
      appel("file"),
      ...vues,
      // Une notation acceptée, puis une refusée : leurs corps sont servis aussi.
      appel("notation", [], { reponse_id: m.dans.id, saisie: SAISIE_EXACTE }),
      appel("notation", [], { reponse_id: (h1 ?? m.dans).id, saisie: { ...SAISIE_EXACTE, categorie: "inexacte" } }),
    ];
    // Les routes exécutées couvrent toute la table.
    expect([...appelees].sort()).toEqual(ROUTES.map((r) => r.nom).sort());
    // Des tâches ont bien été servies : sinon l'absence des sentinelles ne prouverait rien.
    expect(vues.filter((v) => v.statut === 200).length).toBeGreaterThanOrEqual(2);
    const serialise = JSON.stringify(reponses);
    for (const interdit of INTERDITS) expect(serialise, `« ${interdit} » apparaît dans une réponse`).not.toContain(interdit);
  });

  it("la vue d'une réponse est celle d'un juge : ni outil, ni mode, ni requête, ni brut", () => {
    monde = jeuAveugle();
    const vue = appeler(monde.contexte("a1"), "vue", [monde.dans.id]).corps as Record<string, unknown>;
    // D27 (charge-juge-v3) : réponse attendue, pages citées et leur borne ; rien qui désigne l'outil.
    expect(Object.keys(vue).sort()).toEqual(
      ["date_run", "longueur_max_texte_page", "pages_citees", "question", "reponse", "reponse_attendue", "reponse_id", "references", "version_grille", "version_normalisation_verbatim", "version_vue"].sort(),
    );
    expect(Object.keys(vue["question"] as object).sort()).toEqual(["gabarit", "registre", "texte"]);
    expect(Object.keys(vue["reponse"] as object).sort()).toEqual(["citations", "liens", "refus_api", "texte", "troncature"]);
  });

  it("la session ne dit que le pseudonyme de la session", () => {
    monde = jeuAveugle();
    const session = appeler(monde.contexte("a1"), "session").corps as { annotateur_id: string };
    expect(session.annotateur_id).toBe("a1");
    expect(JSON.stringify(session)).not.toContain(SENTINELLES.autre_humain);
  });
});
