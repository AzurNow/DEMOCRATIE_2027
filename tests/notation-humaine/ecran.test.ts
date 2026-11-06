/**
 * L'écran de notation humaine, de la file à l'écriture (lot notation-humaine, PR 2). Les cas portent
 * les numéros du brief. Les gestionnaires de routes sont exécutés tels que le serveur les exécute,
 * sur un run fictif sous `os.tmpdir()` ; les existences sont injectées, jamais lues quelque part.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { etatDesTaches } from "../../notation-humaine/serveur/taches.ts";
import type { Contexte } from "../../notation-humaine/serveur/contexte.ts";
import { valider } from "../../outils/schemas/valider.ts";
import type { NotationIndividuelle } from "../../analysis/types-notation.ts";
import { appeler, fournisseurQuiConnait, humain, juge, JUGES, LIEN, monter, SAISIE_EXACTE, type Monde } from "./fixture.ts";

let monde: Monde | null = null;

afterEach(() => {
  monde?.nettoyer();
  monde = null;
});

function poser(options: Parameters<typeof monter>[0] = {}): Monde {
  monde = monter(options);
  return monde;
}

interface CorpsFile {
  readonly a_noter: readonly { readonly reponse_id: string }[];
  readonly en_attente_test_des_liens: number;
  readonly attend_juge: number;
}

function file(contexte: Contexte): CorpsFile {
  const reponse = appeler(contexte, "file");
  expect(reponse.statut).toBe(200);
  return reponse.corps as CorpsFile;
}

function aNoter(contexte: Contexte): readonly string[] {
  return file(contexte).a_noter.map((t) => t.reponse_id);
}

function noter(contexte: Contexte, reponse_id: string, saisie: unknown = SAISIE_EXACTE) {
  return appeler(contexte, "notation", [], { reponse_id, saisie });
}

const INEXACTE = { categorie: "inexacte", drapeaux: [], cite: false, soutiens: [], motif_inexactitude: "omission", extrait: { texte: "ramener la TVA", provenance: "reponse" } } as const;

/** Les deux juges notent chaque réponse « exacte » : ils s'accordent, la réponse est close. */
function jugesFermentTout(m: Monde): NotationIndividuelle[] {
  return m.reponses.flatMap((r) => JUGES.map((j) => juge(m, j, r)));
}

describe("3. un lien sans verdict d'existence", () => {
  it("la réponse n'est pas proposée, elle est comptée « en attente du test des liens »", () => {
    const m = poser({ avec_lien: [0, 1, 2, 3] });
    const contexte = m.contexte("a1");
    const corps = file(contexte);
    expect(corps.a_noter).toEqual([]);
    expect(corps.en_attente_test_des_liens).toBe(1);
    expect(appeler(contexte, "vue", [m.dans.id]).statut).toBe(409);
  });

  it("un fournisseur qui connaît l'existence rend la réponse notable, sans toucher à l'écran", () => {
    const m = poser({ avec_lien: [0, 1, 2, 3] });
    const contexte = m.contexte("a1", fournisseurQuiConnait([m.dans.id]));
    expect(aNoter(contexte)).toEqual([m.dans.id]);
    expect(file(contexte).en_attente_test_des_liens).toBe(0);
    const vue = appeler(contexte, "vue", [m.dans.id]).corps as { reponse: { liens: { url_citee: string; verdict_existence: string }[] } };
    expect(vue.reponse.liens.map((l) => [l.url_citee, l.verdict_existence])).toEqual([[LIEN, "existe"]]);
  });
});

describe("4. une réponse sans lien", () => {
  it("est notable de bout en bout : la notation écrite valide contre le schéma", () => {
    const m = poser();
    const contexte = m.contexte("a1");
    expect(aNoter(contexte)).toEqual([m.dans.id]);
    const resultat = noter(contexte, m.dans.id);
    expect(resultat.statut).toBe(201);
    const [fichier] = m.notationsEcrites();
    if (fichier === undefined) throw new Error("aucune notation écrite");
    const chemin = join(m.repertoire_run, "volume", "notations", fichier);
    const notation = valider<NotationIndividuelle>("notation", JSON.parse(readFileSync(chemin, "utf8")), chemin);
    expect(notation.notateur).toEqual({ type: "humain", id: "a1", a_vu_identite_outil: false });
    expect(notation.objet_note).toEqual({ type: "reponse", id: m.dans.id });
    expect(notation.motif_notation).toBe("echantillon_aleatoire_10");
    expect(notation.contexte).toBe("run");
    expect(`${notation.id}.json`).toBe(fichier);
  });
});

describe("5. une saisie refusée par le domaine", () => {
  it("renvoie tous les motifs, tels quels, et n'écrit rien", () => {
    const m = poser({ avec_lien: [0, 1, 2, 3] });
    const contexte = m.contexte("a1", fournisseurQuiConnait(m.reponses.map((r) => r.id)));
    // Inexacte sans motif d'inexactitude ni extrait, et sans le soutien du lien : trois fautes.
    const refusee = noter(contexte, m.dans.id, { categorie: "inexacte", drapeaux: [], cite: true, soutiens: [] });
    expect(refusee.statut).toBe(422);
    const { motifs } = refusee.corps as { motifs: { code: string; detail: string }[] };
    expect(motifs.map((x) => x.code)).toContain("soutien_manquant");
    expect(motifs.filter((x) => x.code === "non_conforme_au_schema").length).toBeGreaterThanOrEqual(2);
    expect(motifs.every((x) => x.detail.length > 0)).toBe(true);
    expect(m.notationsEcrites()).toEqual([]);
  });

  it("une demande mal formée est refusée avant le domaine, champ par champ", () => {
    const m = poser();
    const reponse = noter(m.contexte("a1"), m.dans.id, { categorie: 3, drapeaux: "x", cite: "oui", soutiens: [], inconnu: true });
    expect(reponse.statut).toBe(400);
    const { detail } = reponse.corps as { detail: string[] };
    expect(detail).toEqual(expect.arrayContaining(["saisie.categorie : une chaîne est attendue", "saisie.cite : un booléen est attendu", "saisie.inconnu : champ inconnu"]));
    expect(m.notationsEcrites()).toEqual([]);
  });
});

describe("6. double soumission de la même tâche", () => {
  it("la seconde échoue visiblement et le fichier n'est pas réécrit", () => {
    const m = poser();
    const contexte = m.contexte("a1");
    expect(noter(contexte, m.dans.id).statut).toBe(201);
    const [fichier] = m.notationsEcrites();
    const avant = readFileSync(join(m.repertoire_run, "volume", "notations", fichier as string), "utf8");
    const seconde = noter(contexte, m.dans.id);
    expect(seconde.statut).toBe(409);
    expect((seconde.corps as { erreur: string }).erreur).toBe("tache_indisponible");
    expect(m.notationsEcrites()).toEqual([fichier]);
    expect(readFileSync(join(m.repertoire_run, "volume", "notations", fichier as string), "utf8")).toBe(avant);
  });

  it("un identifiant déjà écrit lève FichierDejaEcrit, rendu à l'écran, sans réécriture", () => {
    const m = poser();
    // Les juges laissent la réponse `hors[0]` à un humain (extrait invalide), en plus de l'échantillon.
    const [ouverte] = m.hors;
    if (ouverte === undefined) throw new Error("réponse attendue");
    m.ecrire(
      juge(m, "juge-1", ouverte, { categorie: "inexacte", motif_inexactitude: "omission", extrait_justificatif: { provenance: "reponse", texte: "absent de la réponse", verifie_deterministe: true } }),
      juge(m, "juge-2", ouverte),
    );
    const identifiant = "0".repeat(25) + "1";
    const contexte = { ...m.contexte("a1"), nouvelId: () => identifiant };
    expect(aNoter(contexte)).toEqual(expect.arrayContaining([m.dans.id, ouverte.id]));
    const avant = m.notationsEcrites();
    expect(noter(contexte, m.dans.id).statut).toBe(201);
    const chemin = join(m.repertoire_run, "volume", "notations", `${identifiant}.json`);
    const ecrit = readFileSync(chemin, "utf8");
    const seconde = noter(contexte, ouverte.id, INEXACTE);
    expect(seconde.statut).toBe(409);
    expect((seconde.corps as { erreur: string }).erreur).toBe("FichierDejaEcrit");
    expect(m.notationsEcrites()).toEqual([...avant, `${identifiant}.json`].sort());
    expect(readFileSync(chemin, "utf8")).toBe(ecrit);
  });
});

describe("7. qui a déjà noté ne revoit pas la réponse", () => {
  it("a1 ne revoit pas sa réponse, a2 la voit encore", () => {
    const m = poser();
    expect(noter(m.contexte("a1"), m.dans.id).statut).toBe(201);
    expect(aNoter(m.contexte("a1"))).toEqual([]);
    expect(aNoter(m.contexte("a2"))).toEqual([m.dans.id]);
    expect(appeler(m.contexte("a1"), "vue", [m.dans.id]).statut).toBe(409);
  });
});

describe("8. arbitrage de l'échantillon", () => {
  it("l'arbitre voit la même vue que les deux premiers, sans leurs notes ni leurs pseudonymes", () => {
    const m = poser();
    const premiers = ["sentinelle-premier", "sentinelle-second"] as const;
    const [p1, p2] = premiers;
    const vuePremier = appeler(m.contexte(p1), "vue", [m.dans.id]).corps;
    expect(noter(m.contexte(p1), m.dans.id).statut).toBe(201);
    expect(noter(m.contexte(p2), m.dans.id, INEXACTE).statut).toBe(201);
    // Les deux premiers divergent : la tâche d'arbitrage est fermée à eux, ouverte à un troisième.
    expect(aNoter(m.contexte(p1))).toEqual([]);
    expect(aNoter(m.contexte(p2))).toEqual([]);
    const arbitre = m.contexte("sentinelle-arbitre");
    expect(aNoter(arbitre)).toEqual([m.dans.id]);
    expect(etatDesTaches(arbitre).notables.map((n) => n.tache.motif_notation)).toEqual(["arbitrage_echantillon_10"]);
    const reponse = appeler(arbitre, "vue", [m.dans.id]);
    expect(reponse.corps).toEqual(vuePremier);
    const serialise = JSON.stringify([reponse, appeler(arbitre, "file")]);
    for (const interdit of [...premiers, "inexacte", "omission", "arbitrage"]) expect(serialise).not.toContain(interdit);
    // L'arbitre note à l'aveugle, comme les autres : sa notation est écrite sous le motif d'arbitrage.
    expect(noter(arbitre, m.dans.id).statut).toBe(201);
    expect(aNoter(arbitre)).toEqual([]);
  });
});

describe("9. le jeu d'or du run pilote", () => {
  const motifs = (c: Contexte) => etatDesTaches(c).notables.map((n) => n.tache.motif_notation);

  it("run pilote : les tâches calibration_jeu_or apparaissent", () => {
    const m = poser({ type_run: "pilote" });
    const dans = motifs(m.contexte("a1"));
    expect(dans.filter((x) => x === "calibration_jeu_or")).toHaveLength(m.reponses.length);
    expect(dans).toContain("echantillon_aleatoire_10");
  });

  it("D93 : deux calibrations qui divergent → l'arbitre du jeu d'or note à l'aveugle, sa notation arbitrage_jeu_or est écrite", () => {
    const m = poser({ type_run: "pilote" });
    const r = m.hors[0];
    if (r === undefined) throw new Error("réponse attendue");
    const inexacte = { categorie: "inexacte" as const, drapeaux: [], motif_inexactitude: "omission" as const, extrait_justificatif: { provenance: "reponse" as const, texte: "ramener la TVA", verifie_deterministe: true } };
    const premiers = ["sentinelle-calibration-1", "sentinelle-calibration-2"] as const;
    m.ecrire(humain(m, premiers[0], "calibration_jeu_or", r), humain(m, premiers[1], "calibration_jeu_or", r, inexacte));
    const duJeu = (c: Contexte) => etatDesTaches(c).notables.filter((n) => n.tache.reponse_id === r.id).map((n) => n.tache.motif_notation);
    for (const premier of premiers) expect(duJeu(m.contexte(premier))).toEqual([]);
    const arbitre = m.contexte("a3");
    expect(duJeu(arbitre)).toEqual(["arbitrage_jeu_or"]);
    const serialise = JSON.stringify([appeler(arbitre, "vue", [r.id]), appeler(arbitre, "file")]);
    for (const interdit of [...premiers, "omission", "arbitrage", "calibration"]) expect(serialise).not.toContain(interdit);
    expect(noter(arbitre, r.id).statut).toBe(201);
    const ecrites = m.contexte("a4").notations().filter((n) => n.motif_notation === "arbitrage_jeu_or");
    expect(ecrites.map((n) => [n.notateur.id, n.objet_note.id])).toEqual([["a3", r.id]]);
    expect(duJeu(m.contexte("a3"))).toEqual([]);
    expect(duJeu(m.contexte("a4"))).toEqual([]);
  });

  it("run non pilote : aucune tâche de calibration", () => {
    const m = poser();
    expect(motifs(m.contexte("a1"))).toEqual(["echantillon_aleatoire_10"]);
  });
});

describe("11. réponses en attente", () => {
  it("attend_juge est compté, jamais proposé", () => {
    const m = poser();
    const [h1, h2, h3] = m.hors;
    if (h1 === undefined || h2 === undefined || h3 === undefined) throw new Error("trois réponses attendues");
    // `hors` : deux réponses closes par les juges, une qui attend encore un juge.
    m.ecrire(...[h1, h2].flatMap((r) => JUGES.map((j) => juge(m, j, r))), juge(m, "juge-1", h3));
    m.ecrire(...JUGES.map((j) => juge(m, j, m.dans)), humain(m, "a1", "echantillon_aleatoire_10", m.dans), humain(m, "a2", "echantillon_aleatoire_10", m.dans));
    const corps = file(m.contexte("a3"));
    expect(corps.attend_juge).toBe(1);
    expect(corps.a_noter).toEqual([]);
    expect(corps.en_attente_test_des_liens).toBe(0);
  });

  it("D75 (15) : même note et même motif, mais l'un cite une source et l'autre non → arbitrage proposé au troisième ; la file ne sert plus « sans motif admis »", () => {
    const m = poser();
    const inexacte = { categorie: "inexacte" as const, drapeaux: [], motif_inexactitude: "omission" as const, extrait_justificatif: { provenance: "reponse" as const, texte: "ramener la TVA", verifie_deterministe: true } };
    m.ecrire(
      ...jugesFermentTout(m),
      humain(m, "a1", "echantillon_aleatoire_10", m.dans, inexacte),
      humain(m, "a2", "echantillon_aleatoire_10", m.dans, { ...inexacte, sourcage: { cite: true, liens: [] } }),
    );
    const corps = file(m.contexte("a3"));
    expect(Object.keys(corps).sort()).toEqual(["a_noter", "attend_juge", "en_attente_test_des_liens"]);
    expect(aNoter(m.contexte("a3"))).toEqual([m.dans.id]);
    expect(aNoter(m.contexte("a1"))).toEqual([]);
    expect(aNoter(m.contexte("a2"))).toEqual([]);
  });

  it("§7 (0.31, D73 (14)) : même note, motifs différents dans l'échantillon → arbitrage proposé au troisième", () => {
    const m = poser();
    const inexacte = { categorie: "inexacte" as const, drapeaux: [], extrait_justificatif: { provenance: "reponse" as const, texte: "ramener la TVA", verifie_deterministe: true } };
    m.ecrire(
      ...jugesFermentTout(m),
      humain(m, "a1", "echantillon_aleatoire_10", m.dans, { ...inexacte, motif_inexactitude: "omission" }),
      humain(m, "a2", "echantillon_aleatoire_10", m.dans, { ...inexacte, motif_inexactitude: "position_opposee" }),
    );
    expect(aNoter(m.contexte("a3"))).toEqual([m.dans.id]);
    expect(aNoter(m.contexte("a1"))).toEqual([]);
  });
});

describe("juges d'accord : rien à noter hors de l'échantillon", () => {
  it("les réponses closes par les deux juges ne sont pas des tâches", () => {
    const m = poser();
    m.ecrire(...jugesFermentTout(m));
    expect(aNoter(m.contexte("a1"))).toEqual([m.dans.id]);
  });
});
