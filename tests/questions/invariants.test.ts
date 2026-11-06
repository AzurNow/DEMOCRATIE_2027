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
import { listerFichiersExemplesSurDisque } from "../../outils/schemas/disque.ts";
import { chargerManifeste } from "../../outils/schemas/manifeste.ts";
import { itemA, itemF, itemO, itemP, mesure } from "./fabriques.ts";

const RACINE_EXEMPLES = resolve(import.meta.dirname, "../../schema/exemples");
const MANIFESTE_EXEMPLES = resolve(RACINE_EXEMPLES, "manifeste.json");

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
  // La garde d'égalité disque / manifeste vit dans tests/schemas.test.ts ; ici on garantit que la
  // lecture des invariants voit chaque fichier d'exemple que le lister du validateur voit.
  it("lit chaque exemple du dépôt que le validateur de schémas liste", () => {
    const lus = EXEMPLES.map((exemple) => `${exemple.objet}/${exemple.fichier}`).sort();
    const listes = listerFichiersExemplesSurDisque(RACINE_EXEMPLES).filter((chemin) =>
      chemin.includes("/"),
    );
    expect(lus.length).toBeGreaterThan(0);
    expect(lus).toEqual(listes);
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
    // Le compte vient du manifeste des exemples (table de vérité), pas d'un nombre écrit ici ;
    // tests/schemas.test.ts garantit que le manifeste et le disque listent les mêmes fichiers.
    const attendus = chargerManifeste(MANIFESTE_EXEMPLES).exemples.filter(
      (entree) => entree.objet === "notation" || entree.objet === "verdict",
    );
    expect(attendus.length).toBeGreaterThan(0);
    expect(notants).toHaveLength(attendus.length);
    expect(contexteSuitObjetNote(notants, objets)).toEqual([]);
  });

  it("ne trouve aucun item fictif pointant une mesure réelle", () => {
    const items = contenus("item").map((contenu) => contenu as unknown as Item);
    const mesures = contenus("mesure").map((contenu) => contenu as unknown as Mesure);
    expect(itemsFictifsPointentMesureFictive(items, mesures)).toEqual([]);
  });
});
