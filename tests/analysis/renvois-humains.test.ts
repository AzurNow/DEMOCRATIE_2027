/**
 * §7 (§7.59 de la matrice de conformité ; D74 (22)) : « Une réponse qu'un juge ne peut pas noter […]
 * est renvoyée à un humain […] ; elle sort du kappa de ce juge, et leur nombre est publié par juge,
 * avec leur motif. » Le compte vit dans `analysis/renvois-humains.ts`, une seule fois.
 *
 * Cas limites : aucun renvoi (chaque juge du gel publié, chaque motif connu à 0 dans chaque
 * contexte) ; renvoi d'un seul des deux juges ; plusieurs motifs pour un même juge ; motif ou
 * contexte inconnu du schéma, juge non déclaré au gel, renvoi en double : refus ; juge retiré :
 * publié avec ses renvois et `retire: true` ; renvois du test contrefactuel : comptés à part, sous
 * leur contexte, jamais mêlés à ceux du run.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONTEXTES_RENVOI,
  ContexteDeRenvoiInconnu,
  JugeDeRenvoiNonDeclare,
  MOTIFS_RENVOI,
  MotifDeRenvoiInconnu,
  RenvoiEnDouble,
  renvoisParJuge,
  type RenvoiLu,
} from "../../analysis/renvois-humains.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { ulid } from "./fabriques.ts";

const JUGES = [
  { juge_id: "juge-1", retire: false },
  { juge_id: "juge-2", retire: false },
] as const;

const ZERO = { attribution_indecidable: 0, erreur_api_persistante: 0, contexte_depasse: 0, sortie_refusee: 0, sortie_illisible: 0 };
const ZERO_PAR_CONTEXTE = { run: ZERO, contrefactuel_candidat: ZERO, contrefactuel_outil: ZERO };

let compteur = 0;

function renvoi(juge_id: string, motif: string, contexte = "run", reponse = `reponse-${++compteur}`): RenvoiLu {
  return { id: ulid(`renvoi-${++compteur}`), contexte, objet_note: { type: "reponse", id: ulid(reponse) }, notateur: { id: juge_id }, motif };
}

describe("§7 : renvois à un humain publiés par juge et par motif", () => {
  it("les motifs et les contextes connus sont ceux de schema/renvoi-humain.schema.json, dans son ordre", () => {
    const schema = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/renvoi-humain.schema.json"), "utf8")) as {
      properties: { motif: { enum: string[] }; contexte: { enum: string[] } };
    };
    expect([...MOTIFS_RENVOI]).toEqual(schema.properties.motif.enum);
    expect([...CONTEXTES_RENVOI]).toEqual(schema.properties.contexte.enum);
  });

  it("aucun renvoi : chaque juge du gel est publié, chaque motif connu à 0 dans chaque contexte, jamais une liste vide", () => {
    expect(renvoisParJuge(JUGES, [])).toEqual([
      { juge_id: "juge-1", retire: false, par_contexte: ZERO_PAR_CONTEXTE },
      { juge_id: "juge-2", retire: false, par_contexte: ZERO_PAR_CONTEXTE },
    ]);
  });

  it("renvoi d'un seul des deux juges : compté à ce juge seulement, l'autre reste à 0", () => {
    const [premier, second] = renvoisParJuge(JUGES, [renvoi("juge-2", "contexte_depasse")]);
    expect(premier?.par_contexte).toEqual(ZERO_PAR_CONTEXTE);
    expect(second?.par_contexte.run).toEqual({ ...ZERO, contexte_depasse: 1 });
    expect(second?.par_contexte.contrefactuel_candidat).toEqual(ZERO);
  });

  it("plusieurs motifs pour un même juge : chaque motif compté à part", () => {
    const renvois = [
      renvoi("juge-1", "attribution_indecidable"),
      renvoi("juge-1", "attribution_indecidable"),
      renvoi("juge-1", "sortie_illisible"),
      renvoi("juge-1", "erreur_api_persistante"),
    ];
    const [premier] = renvoisParJuge(JUGES, renvois);
    expect(premier?.par_contexte.run).toEqual({ ...ZERO, attribution_indecidable: 2, sortie_illisible: 1, erreur_api_persistante: 1 });
  });

  it("une même réponse renvoyée par les deux juges : un renvoi à chacun", () => {
    const resultat = renvoisParJuge(JUGES, [renvoi("juge-1", "sortie_refusee", "run", "commune"), renvoi("juge-2", "sortie_refusee", "run", "commune")]);
    expect(resultat.map((j) => j.par_contexte.run.sortie_refusee)).toEqual([1, 1]);
  });

  it("renvois du test contrefactuel : comptés sous leur contexte, jamais mêlés à ceux du run", () => {
    const resultat = renvoisParJuge(JUGES, [
      renvoi("juge-1", "sortie_illisible", "contrefactuel_candidat"),
      renvoi("juge-1", "attribution_indecidable", "contrefactuel_outil"),
      renvoi("juge-1", "sortie_illisible", "run"),
    ]);
    expect(resultat[0]?.par_contexte).toEqual({
      run: { ...ZERO, sortie_illisible: 1 },
      contrefactuel_candidat: { ...ZERO, sortie_illisible: 1 },
      contrefactuel_outil: { ...ZERO, attribution_indecidable: 1 },
    });
  });

  it("juge retiré : toujours déclaré au run (§7), publié avec ses renvois et retire: true", () => {
    const juges = [{ juge_id: "juge-1", retire: false }, { juge_id: "juge-2", retire: true }];
    const resultat = renvoisParJuge(juges, [renvoi("juge-2", "sortie_illisible", "contrefactuel_candidat")]);
    expect(resultat[1]).toEqual({ juge_id: "juge-2", retire: true, par_contexte: { ...ZERO_PAR_CONTEXTE, contrefactuel_candidat: { ...ZERO, sortie_illisible: 1 } } });
  });

  it("l'ordre des juges est celui du gel (run.json#/juges)", () => {
    const juges = [{ juge_id: "juge-z", retire: false }, { juge_id: "juge-a", retire: false }];
    expect(renvoisParJuge(juges, []).map((j) => j.juge_id)).toEqual(["juge-z", "juge-a"]);
  });

  it("motif inconnu du schéma : refus, jamais ignoré ni rangé sous « autre »", () => {
    expect(() => renvoisParJuge(JUGES, [renvoi("juge-1", "juge_fatigue")])).toThrow(MotifDeRenvoiInconnu);
  });

  it("contexte inconnu du schéma : refus", () => {
    expect(() => renvoisParJuge(JUGES, [renvoi("juge-1", "sortie_illisible", "pilote")])).toThrow(ContexteDeRenvoiInconnu);
  });

  it("renvoi d'un juge non déclaré au gel : refus, jamais ignoré", () => {
    expect(() => renvoisParJuge(JUGES, [renvoi("juge-3", "sortie_illisible")])).toThrow(JugeDeRenvoiNonDeclare);
  });

  it("deux renvois du même juge sur la même réponse dans le même contexte : refus, jamais compté deux fois", () => {
    const doublon = [renvoi("juge-1", "sortie_illisible", "run", "double"), renvoi("juge-1", "contexte_depasse", "run", "double")];
    expect(() => renvoisParJuge(JUGES, doublon)).toThrow(RenvoiEnDouble);
  });

  it("la même réponse renvoyée par un juge au run et au contrefactuel : deux contextes, pas un doublon", () => {
    const resultat = renvoisParJuge(JUGES, [renvoi("juge-1", "sortie_illisible", "run", "deux"), renvoi("juge-1", "sortie_illisible", "contrefactuel_candidat", "deux")]);
    expect(resultat[0]?.par_contexte.run.sortie_illisible).toBe(1);
    expect(resultat[0]?.par_contexte.contrefactuel_candidat.sortie_illisible).toBe(1);
  });
});
