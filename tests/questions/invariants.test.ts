/**
 * Les quatre invariants inter-fichiers de `docs/DETTE.md` (« JSON Schema », point 1).
 *
 * JSON Schema valide un fichier à la fois. Ces quatre cohérences-là traversent les fichiers :
 * aucune validation de schéma ne peut les voir, et une divergence sur `grappe_id` fausse toutes
 * les grappes du bootstrap du §8 sans que rien n'échoue.
 *
 * Chaque invariant est vérifié sur un cas conforme et sur un cas violé, puis sur les exemples
 * réels de `schema/exemples/`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contexteSuitObjetNote,
  grappeSuitItemPrincipal,
  itemsFictifsPointentMesureFictive,
  premisseFausseSurItemFOuO,
  validationsConcordantesMemeVersion,
} from "../../pipeline/questions/invariants.ts";
import type { PorteurDePremisse } from "../../pipeline/questions/invariants.ts";
import type { CodeGabarit, Item, Mesure, Position } from "../../pipeline/questions/types.ts";
import { itemA, itemF, itemO, itemP, mesure } from "./fabriques.ts";

const RACINE_EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples");

interface Exemple {
  readonly objet: string;
  readonly fichier: string;
  readonly contenu: Record<string, unknown>;
}

function lireExemples(): readonly Exemple[] {
  const exemples: Exemple[] = [];
  for (const objet of readdirSync(RACINE_EXEMPLES, { withFileTypes: true })) {
    if (!objet.isDirectory()) continue;
    for (const fichier of readdirSync(resolve(RACINE_EXEMPLES, objet.name))) {
      const brut = readFileSync(resolve(RACINE_EXEMPLES, objet.name, fichier), "utf8");
      exemples.push({
        objet: objet.name,
        fichier,
        contenu: JSON.parse(brut) as Record<string, unknown>,
      });
    }
  }
  return exemples;
}

const EXEMPLES = lireExemples();

function contenus(objet: string, prefixe = ""): readonly Record<string, unknown>[] {
  return EXEMPLES.filter(
    (exemple) => exemple.objet === objet && exemple.fichier.startsWith(prefixe),
  ).map((exemple) => exemple.contenu);
}

/* ------------------------------------------------------------ grappe_id */

interface PorteurDeGrappe {
  readonly id: string;
  readonly gabarit: CodeGabarit;
  readonly grappe_id: string;
  readonly items: readonly { readonly reference: { readonly item_id: string }; readonly role: string }[];
}

function porteurDeQuestion(contenu: Record<string, unknown>): PorteurDeGrappe {
  return contenu as unknown as PorteurDeGrappe;
}

function porteursDeTirage(contenu: Record<string, unknown>): readonly PorteurDeGrappe[] {
  const entrees = contenu["entrees"] as readonly Record<string, unknown>[];
  return entrees.map((entree) => ({
    id: entree["question_id"] as string,
    gabarit: entree["gabarit"] as CodeGabarit,
    grappe_id: entree["grappe_id"] as string,
    items: entree["items_au_gel"] as PorteurDeGrappe["items"],
  }));
}

/*
 * Protocole 0.9 (§5 et §8, constat n° 39) : la grappe d'une Q-ATT est sa mesure, que l'invariant lit
 * sur les items. Les exemples de Q-ATT portent les items YARY… (celui de `item/valide-01`) et R6Y2…,
 * tous deux sur la mesure de `mesure/valide-01`.
 */
const MESURE_EXEMPLE = "JE6Y9CC6TBCK6K7H6WNNZ7353S";
const ITEMS_EXEMPLES = [
  { id: "YARYX9NM753C0AF6CDVVE6SVGM", mesure_id: MESURE_EXEMPLE },
  { id: "R6Y2NGVGPBZ3SCVGAFH669X8VD", mesure_id: MESURE_EXEMPLE },
];

describe("invariant : grappe_id est l'item principal", () => {
  const conforme: PorteurDeGrappe = {
    id: "q_" + "a".repeat(32),
    gabarit: "Q-DIR",
    grappe_id: "YARYX9NM753C0AF6CDVVE6SVGM",
    items: [
      { reference: { item_id: "YARYX9NM753C0AF6CDVVE6SVGM" }, role: "principal" },
      { reference: { item_id: "R6Y2NGVGPBZ3SCVGAFH669X8VD" }, role: "attendu_dans_liste" },
    ],
  };

  it("ne rend aucune violation sur un cas conforme", () => {
    expect(grappeSuitItemPrincipal([conforme], ITEMS_EXEMPLES)).toEqual([]);
  });

  it("nomme la question dont la grappe désigne un autre item", () => {
    const violee = { ...conforme, grappe_id: "R6Y2NGVGPBZ3SCVGAFH669X8VD" };
    const violations = grappeSuitItemPrincipal([violee], ITEMS_EXEMPLES);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(violee.id);
    expect(violations[0]?.detail).toContain("R6Y2NGVGPBZ3SCVGAFH669X8VD");
  });

  it("nomme la question qui porte deux items principaux", () => {
    const violee: PorteurDeGrappe = {
      ...conforme,
      items: [
        { reference: { item_id: "YARYX9NM753C0AF6CDVVE6SVGM" }, role: "principal" },
        { reference: { item_id: "R6Y2NGVGPBZ3SCVGAFH669X8VD" }, role: "principal" },
      ],
    };
    expect(grappeSuitItemPrincipal([violee], ITEMS_EXEMPLES)).toHaveLength(1);
  });

  it("nomme la question qui ne porte aucun item principal", () => {
    const violee: PorteurDeGrappe = {
      ...conforme,
      items: [{ reference: { item_id: "R6Y2NGVGPBZ3SCVGAFH669X8VD" }, role: "attendu_dans_liste" }],
    };
    expect(grappeSuitItemPrincipal([violee], ITEMS_EXEMPLES)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------- contexte */

describe("invariant : le contexte d'une notation suit celui de l'objet noté", () => {
  const objets = [{ id: "YPWCRSKQA9C9VVYJ9Z3SFNQX2F", contexte: "run" }];
  const notation = {
    id: "P584FDFZGFEB8P08FNANNGSXR9",
    contexte: "run",
    objet_note: { type: "reponse", id: "YPWCRSKQA9C9VVYJ9Z3SFNQX2F" },
  };

  it("ne rend aucune violation sur un cas conforme", () => {
    expect(contexteSuitObjetNote([notation], objets)).toEqual([]);
  });

  it("nomme la notation dont le contexte diverge de celui de la réponse notée", () => {
    const violee = { ...notation, contexte: "contrefactuel_outil" };
    const violations = contexteSuitObjetNote([violee], objets);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(violee.id);
    expect(violations[0]?.detail).toContain("contrefactuel_outil");
  });

  it("nomme la notation dont l'objet noté est introuvable", () => {
    const violations = contexteSuitObjetNote([notation], []);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toMatch(/introuvable/i);
  });
});

/* ------------------------------------------------------- item F et mesure */

describe("invariant : tout item F pointe une mesure fictive", () => {
  const fictive: Mesure = mesure({ cle: "fictive", fictive: true });
  const reelle: Mesure = mesure({ cle: "reelle", fictive: false });
  const items: readonly Item[] = [
    itemF({ cle: "f-ok", candidat_id: "demo-alpha", mesure: fictive }),
    itemP({ cle: "p-ok", candidat_id: "demo-alpha", mesure: reelle }),
  ];

  it("ne rend aucune violation sur un cas conforme", () => {
    expect(itemsFictifsPointentMesureFictive(items, [fictive, reelle])).toEqual([]);
  });

  it("nomme l'item F qui pointe une mesure réelle", () => {
    const fautif = itemF({ cle: "f-faux", candidat_id: "demo-alpha", mesure: reelle });
    const violations = itemsFictifsPointentMesureFictive([fautif], [fictive, reelle]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(fautif.id);
  });

  it("nomme l'item F dont la mesure est absente du référentiel", () => {
    const fautif = itemF({ cle: "f-orphelin", candidat_id: "demo-alpha", mesure: fictive });
    const violations = itemsFictifsPointentMesureFictive([fautif], [reelle]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toMatch(/introuvable/i);
  });
});

/* ------------------------------------------- versions des deux validations */

describe("invariant : les deux validations concordantes portent la même version", () => {
  const item_id = "YARYX9NM753C0AF6CDVVE6SVGM";
  const empreinte = "7".repeat(64);
  const concordantes = [
    { id: "d1", item_id, annotateur_id: "a1", decision: "accepter", item_version: 2, item_empreinte: empreinte },
    { id: "d2", item_id, annotateur_id: "a2", decision: "corriger", item_version: 2, item_empreinte: empreinte },
  ];

  it("ne rend aucune violation quand les deux décisions portent la même version", () => {
    expect(validationsConcordantesMemeVersion(concordantes)).toEqual([]);
  });

  it("nomme l'item dont les deux décisions retenues portent des versions différentes", () => {
    const divergentes = [
      concordantes[0] as (typeof concordantes)[number],
      { ...(concordantes[1] as (typeof concordantes)[number]), item_version: 3 },
    ];
    const violations = validationsConcordantesMemeVersion(divergentes);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(item_id);
  });

  it("nomme l'item dont les deux décisions portent des empreintes différentes à version égale", () => {
    const divergentes = [
      concordantes[0] as (typeof concordantes)[number],
      { ...(concordantes[1] as (typeof concordantes)[number]), item_empreinte: "8".repeat(64) },
    ];
    expect(validationsConcordantesMemeVersion(divergentes)).toHaveLength(1);
  });

  it("ignore une décision de rejet, qui ne vérifie aucun item", () => {
    const rejet = [
      concordantes[0] as (typeof concordantes)[number],
      { ...(concordantes[1] as (typeof concordantes)[number]), decision: "rejeter", item_version: 9 },
    ];
    expect(validationsConcordantesMemeVersion(rejet)).toEqual([]);
  });
});

/* ------------------------------------------ prémisse fausse sur F ou O */

/*
 * Protocole 0.11 (constat n° 37) : la formulation orientée ne porte plus le booléen
 * `premisse_fausse`, figé, mais la position que sa prémisse affirme ; la vérité se résout au gel.
 * L'invariant garde ce qui ne dépend pas de la date : les cas 10 d'origine (prémisse fausse sur un
 * item P, item introuvable, principal non unique, tri) sont réécrits sur la position affirmée, avec
 * les mêmes assertions ; s'y ajoutent l'item O sans position notée et l'item A qui en porte une.
 */
describe("invariant : une prémisse fausse ne porte que sur un item F ou O (§5, protocole 0.11)", () => {
  const MESURE_REELLE = mesure({ cle: "premisse-reelle" });
  const MESURE_FICTIVE = mesure({ cle: "premisse-fictive", fictive: true });
  const p = itemP({ cle: "premisse-p", candidat_id: "demo-alpha", mesure: MESURE_REELLE, position: "pour" });
  const f = itemF({ cle: "premisse-f", candidat_id: "demo-alpha", mesure: MESURE_FICTIVE });
  const o = itemO({ cle: "premisse-o", candidat_id: "demo-alpha", mesure: MESURE_REELLE });
  const a = itemA({ cle: "premisse-a", candidat_id: "demo-alpha", mesure: MESURE_REELLE });
  const items = [p, f, o, a];

  /** Question minimale dont la formulation orientée affirme la position demandée, ou aucune. */
  function questionSur(item: Item, position_affirmee: Position | undefined, gabarit: CodeGabarit = "Q-ORI"): PorteurDePremisse {
    const orientee = { id: `f-${item.id}-oriente`, registre: "oriente" };
    return {
      id: `q-${item.id}-${gabarit}-${String(position_affirmee)}`,
      gabarit,
      items: [{ reference: { item_id: item.id }, role: "principal" }],
      formulations: [
        { id: `f-${item.id}-neutre`, registre: "neutre" },
        position_affirmee === undefined ? orientee : { ...orientee, position_affirmee },
      ],
    };
  }

  it("cas 10 : nomme la question dont l'item principal est P et dont la prémisse affirme une autre position", () => {
    const fautive = questionSur(p, "contre");
    const violations = premisseFausseSurItemFOuO([fautive], items);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(fautive.id);
    expect(violations[0]?.detail).toContain(`f-${p.id}-oriente`);
  });

  it("cas 10 : ne rend aucune violation pour une position affirmée sur un item F ou O", () => {
    expect(
      premisseFausseSurItemFOuO(
        [questionSur(f, "pour"), questionSur(f, undefined), questionSur(o, "pour"), questionSur(o, "contre")],
        items,
      ),
    ).toEqual([]);
  });

  it("cas 10 : ne rend aucune violation sur un item P dont la prémisse affirme sa position, ou rien", () => {
    expect(premisseFausseSurItemFOuO([questionSur(p, "pour"), questionSur(p, undefined)], items)).toEqual([]);
  });

  it("nomme la question sur un item O dont la formulation orientée ne note aucune position", () => {
    const muette = questionSur(o, undefined);
    const violations = premisseFausseSurItemFOuO([muette], items);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.objet).toBe(muette.id);
    expect(violations[0]?.detail).toMatch(/aucune position affirmée/);
  });

  it("nomme la question sur un item A dont la prémisse affirme une position", () => {
    const violations = premisseFausseSurItemFOuO([questionSur(a, "pour"), questionSur(a, undefined)], items);
    expect(violations.map((violation) => violation.objet)).toEqual([questionSur(a, "pour").id]);
  });

  it("nomme la question d'attribution sur une mesure fictive dont la prémisse affirme une position (D42 (3))", () => {
    const affirmante = questionSur(f, "pour", "Q-ATT");
    const violations = premisseFausseSurItemFOuO([affirmante, questionSur(f, undefined, "Q-ATT")], items);
    expect(violations.map((violation) => violation.objet)).toEqual([affirmante.id]);
    expect(violations[0]?.detail).toMatch(/question d'attribution/);
  });

  it("nomme la question dont l'item principal est introuvable", () => {
    const violations = premisseFausseSurItemFOuO([questionSur(p, "contre")], [f, o]);
    expect(violations).toHaveLength(1);
    expect(violations[0]?.detail).toMatch(/introuvable/i);
  });

  it("nomme la question à position affirmée qui ne porte pas exactement un item principal", () => {
    const sansPrincipal: PorteurDePremisse = {
      ...questionSur(f, "pour"),
      items: [{ reference: { item_id: f.id }, role: "attendu_dans_liste" }],
    };
    expect(premisseFausseSurItemFOuO([sansPrincipal], items)).toHaveLength(1);
    const deuxPrincipaux: PorteurDePremisse = {
      ...questionSur(f, "pour"),
      items: [
        { reference: { item_id: f.id }, role: "principal" },
        { reference: { item_id: o.id }, role: "principal" },
      ],
    };
    expect(premisseFausseSurItemFOuO([deuxPrincipaux], items)).toHaveLength(1);
  });

  it("rend les violations triées par question, indépendamment de l'ordre des fichiers", () => {
    const qa = { ...questionSur(p, "contre"), id: "q-a" };
    const qb = { ...questionSur(p, "contre"), id: "q-b" };
    const objets = premisseFausseSurItemFOuO([qb, qa], items).map((violation) => violation.objet);
    expect(objets).toEqual(["q-a", "q-b"]);
  });
});

/* ------------------------------------------------- exemples réels du dépôt */

describe("exemples de schema/exemples/", () => {
  // 127 → 132 : cinq exemples invalides de run ajoutés (conformité n° 10, 19, 21 et par_mode).
  // 132 → 137 : un exemple valide et quatre invalides d'item ajoutés (conformité n° 11, 12, 13).
  // 137 → 140 : deux exemples invalides de question et un de tirage (conformité n° 37, prémisse résolue au gel).
  // 140 → 146 : six exemples invalides (conformité n° 59, 61, 62, 64 ×2, 66).
  // 146 → 152 : un exemple valide et cinq invalides de run (protocole 0.13, §7 et §12).
  // 152 → 158 : protocole 0.13, quatre invalides et un valide d'item (format, attestation), un invalide de fiche-source (tiers).
  // 158 → 159 : conformité 2026-09-29, n° 1, un invalide d'item (décision du panel sans statut_validation_anterieur).
  // 159 → 160 : décision de l'auteur du 2026-09-29, n° 8, un invalide de tirage (sans contestes_au_gel).
  // 160 → 164 : conformité 2026-09-29, n° 31 et 33, quatre invalides d'item (thème porté, sans mesure_version, quantification hors dimensions, adresse du contestataire).
  // 164 → 166 : conformité 2026-09-29, n° 24, deux invalides de tirage (entrée sans thème, entrée sans grappe).
  // 166 → 168 : décisions de l'auteur du 2026-10-01, deux invalides de run (planifié sans donnees_commit, symétrie sans condition de quota).
  // 168 → 176 : conformité 2026-09-29, n° 15 (trois invalides de run), n° 27 (trois invalides de réponse), n° 29 (un valide et un invalide de notation).
  // 176 → 178 : conformité 2026-09-29, n° 5, deux invalides de diagnostic de lot.
  // 178 → 179 : conformité 2026-09-29, n° 6, un valide d'item (non évaluable par le panel, attestation conservée).
  // 179 → 188 : décisions de l'auteur du 2026-10-02 (lot interrogation), trois valides et six invalides de réponse (refus_api, motif_manquante).
  // 188 → 192 : décisions de l'auteur du 2026-10-02 (suite du lot interrogation), un valide et trois invalides de réponse (brut_texte, brut_octets_sha256, requete.entetes).
  // 192 → 194 : décision D15 de l'auteur (lot notation), une notation valide et une invalide sous le motif extrait_invalide.
  // 194 → 196 : décision D17 de l'auteur, une notation et un verdict invalides portant la fraîcheur sans le drapeau obsolescence.
  // 196 → 202 : lot notation (entrées-sorties, §7), deux valides et quatre invalides de run (test contrefactuel publié : bloc, taux et effectifs des juges).
  // 202 → 204 : décision D15 de l'auteur (« accord partiel → humain »), une notation valide et une invalide sous le motif accord_partiel_juges.
  // 204 → 212 : décision D20 de l'auteur (lot test-liens), quatre valides et quatre invalides du nouveau schéma existence-lien.
  // 212 → 219 : décision D21 de l'auteur (lot test-liens), deux valides et cinq invalides d'existence-lien.
  // 219 → 220 : décision D22 de l'auteur (lot test-liens), un invalide d'existence-lien (téléchargement servi hors de la forme id_).
  // 220 → 232 : décision D24 de l'auteur (lot go-no-go), un valide et quatre invalides de run, deux valides et cinq invalides du nouveau schéma checklist.
  // 232 → 233 : décision D25 de l'auteur (lot go-no-go), un invalide de run (go/no-go sans indeterminees_echantillon_humain).
  // 233 → 240 : décision D27 de l'auteur (lot charge-juge-v3), une notation valide, trois valides et trois invalides d'extraction-page-lien.
  // 240 → 241 : décision D29 (4) de l'auteur, une notation invalide (sans version_charge).
  // 241 → 246 : décision D30 de l'auteur, deux notations (lecture de comparateur), un run, deux renvois.
  // 246 → 250 : décision D31 de l'auteur, un valide et trois invalides de run.
  // 250 → 259 : décision D32 de l'auteur, une notation valide et quatre invalides, un verdict valide et deux invalides, un invalide de run.
  // 259 → 262 : décision D33 de l'auteur, une notation valide et deux invalides (marqueur sur_refus_api).
  // 262 → 266 : décisions D39 et D42, deux propositions de formulation valides (acceptée, rejetée) et deux invalides (brut et brut_texte ; AUCUNE recopiée).
  // 266 → 273 : décisions D39 et D42 (relecture des formulations), deux valides et deux invalides du nouveau schéma formulations-validees (neutre produite par un modèle ; sens non préservé), un valide et deux invalides du nouveau schéma refus-formulation (commentaire blanc ; aucun registre).
  // 273 → 278 : décision D41 (lot gel), deux valides (complet, brouillon) et trois invalides (clé inconnue ; juge sans version_prompt ; fenêtre sans décalage) du nouveau schéma config-gel.
  // 278 → 284 : lot gel, PR 2a (D44, D46), un valide (pilote sans balise ni engagement) et cinq invalides (mensuel sans balise ; sans engagement ; signature de 47 octets ; horodatage de 12 chiffres ; un seul relais) du schéma run.
  // 284, inchangé : D47 (2), le valide pilote sans balise est remplacé par un invalide équivalent (invalide-46-pilote-sans-balise).
  // 284 → 286 : lot gel, PR 2b (D45 (3)), deux invalides du schéma run (sans run_precedent ; run précédent sans empreinte de son tirage).
  // 286 → 288 : lot gel, PR 2c (D48 (4)), deux invalides du schéma run (sans questions ; run précédent sans empreinte de ses questions).
  // 288 → 294 : lot gel, PR 3 (D51), deux valides et quatre invalides du schéma run (invalidation en cours, réexécution).
  // 294 → 300 : décision D52 (lot extraction, PR 1), deux valides (exemple du prompt ; aucun item) et quatre invalides (type A ; position sans_objet ; thème hors des dix ; page donnée par le modèle) du nouveau schéma sortie-extraction.
  // 300 → 309 : décisions D52 et D53 (lot extraction, PR 3), un valide et un invalide d'entree-extraction, deux valides et un invalide de reponse-extraction, deux valides et deux invalides de journal-extraction.
  // 309 → 312 : décision D53 (1) (verrou de relecture des mesures), un valide et deux invalides de relecture-mesure.
  // 312 → 316 : décision D53 (1) (rattachement d'un item à une autre mesure), un valide et trois invalides de rattachement-item.
  // 316 → 324 : revue du 2026-10-12, constat 4 (D55 (3)), deux valides et six invalides du nouveau schéma lot.
  it("charge les 324 exemples du dépôt", () => {
    expect(EXEMPLES).toHaveLength(324);
  });

  it("ne trouve aucune violation de grappe dans les exemples valides", () => {
    const porteurs = [
      ...contenus("question", "valide-").map(porteurDeQuestion),
      ...contenus("tirage", "valide-").flatMap(porteursDeTirage),
    ];
    expect(porteurs.length).toBeGreaterThan(0);
    expect(grappeSuitItemPrincipal(porteurs, ITEMS_EXEMPLES)).toEqual([]);
  });

  it("repère les deux exemples invalides qui portent deux items principaux", () => {
    const porteurs = [
      ...contenus("question", "invalide-01").map(porteurDeQuestion),
      ...contenus("tirage", "invalide-02").flatMap(porteursDeTirage),
    ];
    expect(grappeSuitItemPrincipal(porteurs, ITEMS_EXEMPLES)).toHaveLength(2);
  });

  it("ne trouve aucune divergence de contexte entre notations, verdicts et objets notés", () => {
    const objets = [...contenus("reponse"), ...contenus("lecture-comparateur")].map((contenu) => ({
      id: contenu["id"] as string,
      contexte: contenu["contexte"] as string,
    }));
    const notants = [...contenus("notation"), ...contenus("verdict")].map((contenu) => ({
      id: contenu["id"] as string,
      contexte: contenu["contexte"] as string,
      objet_note: contenu["objet_note"] as { type: string; id: string },
    }));
    // 16 → 18 : une notation et un verdict invalides ajoutés (conformité n° 64), copies d'exemples
    // valides dont seul le sourçage change ; leur contexte suit toujours l'objet noté.
    // 18 → 20 : une notation valide et une invalide ajoutées (conformité 2026-09-29, n° 29), copies
    // de valide-01 dont seul le sourçage change ; leur contexte suit toujours l'objet noté.
    // 20 → 22 : une notation valide et une invalide ajoutées (décision D15, motif extrait_invalide) ;
    // leur contexte suit toujours l'objet noté.
    // 22 → 24 : une notation et un verdict invalides ajoutés (décision D17, fraîcheur sans drapeau
    // obsolescence), copies de valide-01 ; leur contexte suit toujours l'objet noté.
    // 24 → 26 : une notation valide et une invalide ajoutées (décision D15, motif accord_partiel_juges) ;
    // leur contexte suit toujours l'objet noté.
    // 26 → 27 : une notation valide ajoutée (décision D27, Q-ATT à nom ambigu), copie de valide-01 ;
    // son contexte suit toujours l'objet noté.
    // 27 → 28 : une notation invalide ajoutée (décision D29 (4), sans version_charge), copie de valide-01.
    // 28 → 30 : une notation valide et une invalide sur une lecture de comparateur (décision D30 (4)) ;
    // leur contexte suit toujours l'objet noté.
    // 30 → 38 : décision D32, cinq notations (une valide par règle, quatre invalides) et trois verdicts
    // (un valide en regle_refus_api, deux invalides), tous de contexte run ; leur contexte suit
    // toujours l'objet noté.
    // 38 → 41 : décision D33, trois notations (marqueur sur_refus_api), de contexte run.
    expect(notants).toHaveLength(41);
    expect(contexteSuitObjetNote(notants, objets)).toEqual([]);
  });

  it("ne trouve aucun item fictif pointant une mesure réelle", () => {
    const items = contenus("item").map((contenu) => contenu as unknown as Item);
    const mesures = contenus("mesure").map((contenu) => contenu as unknown as Mesure);
    expect(itemsFictifsPointentMesureFictive(items, mesures)).toEqual([]);
  });
});
