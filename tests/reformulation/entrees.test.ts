/**
 * Entrées de `pnpm reformuler` : questions engendrées depuis `data/` (fichiers validés), candidats
 * lus dans `config/perimetre.yaml`, demande de chaque question. Une entrée vide arrête la commande.
 */

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurSchema } from "../../outils/schemas/valider.ts";
import { AUCUNE } from "../../pipeline/reformulation/position-affirmee.ts";
import { dispositionEntrees, EntreeAbsente, lireCandidats, lireDonnees, tachesDe } from "../../pipeline/reformulation/entrees.ts";
import { itemP } from "../questions/fabriques.ts";
import { CANDIDATS, ITEMS, LIBELLE, MESURE_BUDGET, MESURE_JARDIN, promu, racineDeTest } from "./aides.ts";

const racines: string[] = [];
function racine(options: Parameters<typeof racineDeTest>[0] = {}): string {
  const chemin = racineDeTest(options);
  racines.push(chemin);
  return chemin;
}
afterEach(() => {
  for (const chemin of racines.splice(0)) rmSync(chemin, { recursive: true, force: true });
});

describe("lecture des entrées", () => {
  it("lit items, mesures et candidats d'une racine, chacun validé", () => {
    const donnees = lireDonnees(dispositionEntrees(racine()));
    expect(donnees.items.map((item) => item.id).sort()).toEqual(ITEMS.map((item) => item.id).sort());
    expect(donnees.mesures.map((une) => une.id).sort()).toEqual([MESURE_BUDGET.id, MESURE_JARDIN.id].sort());
    expect(donnees.candidats).toEqual(CANDIDATS);
  });

  it("cas limite 11 : data/items absent ⇒ EntreeAbsente qui le dit", () => {
    const chemin = racine();
    rmSync(join(chemin, "data", "items"), { recursive: true });
    expect(() => lireDonnees(dispositionEntrees(chemin))).toThrow(EntreeAbsente);
    expect(() => lireDonnees(dispositionEntrees(chemin))).toThrow(/aucun item validé/u);
  });

  it("cas limite 11 : data/items vide ⇒ EntreeAbsente", () => {
    expect(() => lireDonnees(dispositionEntrees(racine({ items: [] })))).toThrow(/aucun item validé/u);
  });

  it("périmètre sans candidat (le brouillon d'aujourd'hui) ⇒ EntreeAbsente", () => {
    expect(() => lireDonnees(dispositionEntrees(racine({ candidats: [] })))).toThrow(/aucun candidat dans le périmètre/u);
  });

  it("le brouillon du dépôt se lit : aucun candidat", () => {
    expect(lireCandidats(join(import.meta.dirname, "../../config/perimetre.yaml"))).toEqual([]);
  });

  it("un périmètre non conforme au schéma ⇒ ErreurSchema", () => {
    const chemin = racine();
    writeFileSync(join(chemin, "config", "perimetre.yaml"), "candidats: 3\n", "utf8");
    expect(() => lireCandidats(join(chemin, "config", "perimetre.yaml"))).toThrow(ErreurSchema);
  });

  it("un item non conforme dans data/items ⇒ ErreurSchema, jamais ignoré", () => {
    const chemin = racine();
    mkdirSync(join(chemin, "data", "items"), { recursive: true });
    writeFileSync(join(chemin, "data", "items", "abime.json"), "{}", "utf8");
    expect(() => lireDonnees(dispositionEntrees(chemin))).toThrow(ErreurSchema);
  });
});

describe("tâches : une demande par question engendrée", () => {
  const taches = tachesDe({ items: ITEMS, mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });

  it("ordonnées par identifiant de question, sans doublon", () => {
    const ids = taches.map((tache) => tache.question.id);
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("chaque demande porte le texte neutre de sa question", () => {
    for (const tache of taches) expect(tache.demande.texte_neutre).toBe(tache.question.texte_neutre);
  });

  it("une question nommée porte le libellé du périmètre ; une Q-ATT n'en porte aucun", () => {
    const nommees = taches.filter((tache) => tache.question.candidat_id === "demo-alpha");
    expect(nommees.length).toBeGreaterThan(0);
    for (const tache of nommees) expect(tache.demande.libelle_candidat).toBe(LIBELLE);
    const attributions = taches.filter((tache) => tache.question.gabarit === "Q-ATT");
    expect(attributions.length).toBeGreaterThan(0);
    for (const tache of attributions) expect(tache.demande.libelle_candidat).toBeNull();
  });

  it("la position affirmée suit la règle fixe : item P « contre » ⇒ contre, item A ⇒ AUCUNE", () => {
    const surP = taches.filter((tache) => tache.question.candidat_id === "demo-alpha");
    const surA = taches.filter((tache) => tache.question.candidat_id === "demo-beta");
    expect(new Set(surP.map((tache) => tache.demande.position_affirmee))).toEqual(new Set(["contre"]));
    expect(new Set(surA.map((tache) => tache.demande.position_affirmee))).toEqual(new Set(["AUCUNE"]));
  });

  it("item P « sans_objet » : les tâches se construisent sans lever, position affirmée AUCUNE (§5, D54 (4))", () => {
    const itemSansObjet = promu(
      itemP({ cle: "reformuler-p-sans-objet", candidat_id: "demo-alpha", mesure: MESURE_JARDIN, position: "sans_objet" }),
    );
    const avecSansObjet = tachesDe({ items: [...ITEMS, itemSansObjet], mesures: [MESURE_BUDGET, MESURE_JARDIN], candidats: CANDIDATS });
    const surItem = avecSansObjet.filter((tache) =>
      tache.question.items.some((entree) => entree.role === "principal" && entree.reference.item_id === itemSansObjet.id),
    );
    expect(surItem.length).toBeGreaterThan(0);
    for (const tache of surItem) expect(tache.demande.position_affirmee).toBe(AUCUNE);
  });
});
