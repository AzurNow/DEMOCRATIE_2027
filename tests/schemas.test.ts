/**
 * Cas limites du validateur des exemples, un test par cas listé dans le brief. Les cas 1 et 2
 * tournent sur les vrais fichiers de `schema/` : ce sont eux la garantie que `pnpm check` couvre
 * réellement le manifeste. Les cas 3 à 7 construisent un répertoire d'exemples jetable, pour
 * isoler chaque désaccord entre le manifeste et le schéma sans dépendre du contenu réel de
 * `schema/exemples/`.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listerFichiersExemplesSurDisque } from "../outils/schemas/disque.ts";
import { tenterValidationIsolee } from "../outils/schemas/isole.ts";
import type { Manifeste } from "../outils/schemas/manifeste.ts";
import { chargerManifeste } from "../outils/schemas/manifeste.ts";
import { verifierConformiteMetaSchema } from "../outils/schemas/meta.ts";
import { construireRegistre } from "../outils/schemas/registre.ts";
import { validerContreManifeste } from "../outils/schemas/validation.ts";

const racineSchema = resolve(import.meta.dirname, "../schema");
const racineExemplesReels = resolve(racineSchema, "exemples");
const manifesteReel = resolve(racineExemplesReels, "manifeste.json");

// --- Fabriques pour les cas 3 à 7 : une mesure valide et une mesure à deux violations. ---

function mesureValideBrute(): Record<string, unknown> {
  return {
    id: "JE6Y9CC6TBCK6K7H6WNNZ7353S",
    version: 1,
    empreinte: "4b502fd1225fcfe3e99e3466bea4f871aba6bee8acd0896a1844868bd1552d8a",
    libelle: "TVA réduite sur les produits énergétiques",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "ramener la TVA sur les produits énergétiques à 5,5 %",
    fictive: false,
    historique: [
      {
        date: "2026-09-20T10:05:00+02:00",
        changement: "création",
        commit: "2f22765d04931a078909145ca628d2264c852d7d",
        version_resultante: 1,
      },
    ],
  };
}

/** Deux violations distinctes et indépendantes : `libelle` manquant, `theme` hors de l'énumération. */
function mesureDoubleViolationBrute(): Record<string, unknown> {
  const { libelle: _sansLibelle, ...reste } = mesureValideBrute();
  return { ...reste, theme: "hors_liste" };
}

interface RepertoireJetable {
  readonly racine: string;
  ecrire(cheminRelatif: string, contenu: unknown): void;
}

function repertoireJetable(): RepertoireJetable {
  const racine = mkdtempSync(join(tmpdir(), "banc-essai-schemas-"));
  return {
    racine,
    ecrire(cheminRelatif, contenu) {
      const chemin = join(racine, cheminRelatif);
      mkdirSync(join(chemin, ".."), { recursive: true });
      writeFileSync(chemin, JSON.stringify(contenu, null, 2), "utf8");
    },
  };
}

function manifesteDe(exemples: Manifeste["exemples"]): Manifeste {
  return { description: "manifeste de test", exemples };
}

let dossiersACreer: string[] = [];

afterEach(() => {
  for (const dossier of dossiersACreer) rmSync(dossier, { recursive: true, force: true });
  dossiersACreer = [];
});

function nouveauRepertoire(): RepertoireJetable {
  const repertoire = repertoireJetable();
  dossiersACreer.push(repertoire.racine);
  return repertoire;
}

describe("schémas réels : manifeste et méta-schéma", () => {
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
  // 176 → 178 : conformité 2026-09-29, n° 5, deux invalides de diagnostic de lot (sans kappa_par_question, kappa de question avec motif).
  // 178 → 179 : conformité 2026-09-29, n° 6, un valide d'item (non évaluable par le panel, attestation conservée).
  // 179 → 188 : décisions de l'auteur du 2026-10-02 (lot interrogation), trois valides et six invalides de réponse (refus_api, motif_manquante).
  // 188 → 192 : décisions de l'auteur du 2026-10-02 (suite du lot interrogation), un valide et trois invalides de réponse (brut_texte, brut_octets_sha256, requete.entetes).
  // 192 → 194 : décision D15 de l'auteur (lot notation), une notation valide et une invalide sous le motif extrait_invalide.
  // 194 → 196 : décision D17 de l'auteur, une notation et un verdict invalides portant la fraîcheur sans le drapeau obsolescence.
  // 196 → 202 : lot notation (entrées-sorties, §7), deux valides et quatre invalides de run (test contrefactuel publié : bloc, taux et effectifs des juges).
  // 202 → 204 : décision D15 de l'auteur (« accord partiel → humain »), une notation valide et une invalide sous le motif accord_partiel_juges.
  // 204 → 212 : décision D20 de l'auteur (lot test-liens), quatre valides et quatre invalides du nouveau schéma existence-lien.
  // 212 → 219 : décision D21 de l'auteur (lot test-liens), deux valides et cinq invalides d'existence-lien (instantané écarté, téléchargement de la copie archivée, url_non_ascii retirée).
  // 219 → 220 : décision D22 de l'auteur (lot test-liens), un invalide d'existence-lien (téléchargement servi hors de la forme id_).
  // 220 → 232 : décision D24 de l'auteur (lot go-no-go), un valide et quatre invalides de run, deux valides et cinq invalides du nouveau schéma checklist.
  // 232 → 233 : décision D25 de l'auteur (lot go-no-go), un invalide de run (go/no-go sans indeterminees_echantillon_humain).
  // 233 → 240 : décision D27 de l'auteur (lot charge-juge-v3), une notation valide (Q-ATT, nom ambigu), trois valides et trois invalides du nouveau schéma extraction-page-lien.
  // 240 → 241 : décision D29 (4) de l'auteur, une notation invalide (sans version_charge).
  // 241 → 246 : décision D30 de l'auteur, une notation valide et une invalide (lecture de comparateur et version_charge), un invalide de run (go/no-go sans renvois_attribution_indecidable), un valide et un invalide du nouveau schéma renvoi-humain.
  // 246 → 250 : décision D31 de l'auteur, un valide et trois invalides de run (paires écartées, taux de juge indéfini, renvois écartés du kappa).
  // 250 → 259 : décision D32 de l'auteur, une notation valide et quatre invalides (notation par règle d'un refus de l'API), un verdict valide et deux invalides (regle_refus_api), un invalide de run (go/no-go sans refus_api_echantillon_humain).
  // 259 → 262 : décision D33 de l'auteur, une notation valide (humain sur un refus, sans extrait) et deux invalides (juge marqué sur_refus_api, règle sans le marqueur).
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
  it("1. les 324 exemples du manifeste réel donnent tous le résultat attendu", () => {
    const manifeste = chargerManifeste(manifesteReel);
    const { ajv } = construireRegistre(racineSchema);
    const rapport = validerContreManifeste(ajv, racineExemplesReels, manifeste);

    expect(manifeste.exemples).toHaveLength(324);
    const echecs = rapport.resultats.filter((resultat) => !resultat.reussi);
    expect(echecs).toEqual([]);
    expect(rapport.fichiersOrphelins).toEqual([]);
  });

  // 22 → 23 : perimetre (config/perimetre.yaml), conformité 2026-09-29, n° 23 et 25.
  // 23 → 24 : existence-lien (résultat du test HTTP d'un lien), décision D20 de l'auteur.
  // 24 → 25 : checklist (checklist de run de l'annexe F), décision D24 de l'auteur.
  // 25 → 26 : extraction-page-lien (texte d'une copie de page citée), décision D27 de l'auteur.
  // 26 → 27 : renvoi-humain (renvoi d'une Q-ATT indécidable vers l'humain), décision D30 (2) de l'auteur.
  // 27 → 28 : proposition-formulation (staging de la reformulation), décisions D39 et D42 de l'auteur.
  // 28 → 30 : formulations-validees (data/formulations/) et refus-formulation (validation/formulations/refus.jsonl), décisions D39 et D42 de l'auteur.
  // 30 → 31 : config-gel (config/gel.json), décision D41 de l'auteur.
  // 31 → 32 : sortie-extraction (sortie brute d'un modèle extracteur), décision D52 de l'auteur.
  // 32 → 35 : entree-extraction, reponse-extraction et journal-extraction (pnpm extraire), décisions D52 et D53 de l'auteur.
  // 35 → 36 : relecture-mesure (registre des relectures de mesure, verrou de promotion), décision D53 (1) de l'auteur.
  // 36 → 37 : rattachement-item (registre des rattachements d'item, pnpm mesures --rattacher), décision D53 (1) de l'auteur.
  // 37 → 38 : lot (manifeste de lot de validation), revue du 2026-10-12, constat 4 (D55 (3)).
  it("2. les trente-huit schémas réels sont conformes au méta-schéma draft 2020-12", () => {
    const conformites = verifierConformiteMetaSchema(racineSchema);
    expect(conformites).toHaveLength(38);
    for (const conformite of conformites) {
      expect(conformite.erreurs, `schéma "${conformite.nom}"`).toEqual([]);
      expect(conformite.conforme, `schéma "${conformite.nom}"`).toBe(true);
    }
  });
});

describe("désaccords entre manifeste et disque", () => {
  it("3. un exemple listé au manifeste mais absent du disque nomme le chemin", () => {
    const repertoire = nouveauRepertoire();
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/absente.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats).toHaveLength(1);
    expect(rapport.resultats[0]).toMatchObject({
      chemin: "mesure/absente.json",
      obtenu: "absent",
      reussi: false,
    });
  });

  it("4. un fichier du disque absent du manifeste nomme le chemin (le manifeste est exclu)", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/valide-01.json", mesureValideBrute());
    repertoire.ecrire("mesure/orpheline.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/valide-01.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.fichiersOrphelins).toEqual(["mesure/orpheline.json"]);
  });
});

describe("désaccords entre attendu et verdict ajv", () => {
  it("5. un exemple valide attendu que le schéma rejette est signalé en échec avec ses erreurs", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/rejetee.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/rejetee.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "invalide", reussi: false });
    expect(rapport.resultats[0]?.erreurs.length).toBeGreaterThan(0);
  });

  it("6. un exemple invalide attendu que le schéma accepte est signalé en échec", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/acceptee.json", mesureValideBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/acceptee.json", attendu: "invalide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);

    expect(rapport.resultats[0]).toMatchObject({ obtenu: "valide", reussi: false });
  });

  it("7. les deux violations d'un même objet sont toutes les deux rapportées, pas seulement la première", () => {
    const repertoire = nouveauRepertoire();
    repertoire.ecrire("mesure/deux-violations.json", mesureDoubleViolationBrute());
    const { ajv } = construireRegistre(racineSchema);
    const manifeste = manifesteDe([
      { objet: "mesure", fichier: "mesure/deux-violations.json", attendu: "valide", motif: "test" },
    ]);

    const rapport = validerContreManifeste(ajv, repertoire.racine, manifeste);
    const erreurs = rapport.resultats[0]?.erreurs ?? [];

    expect(erreurs.length).toBeGreaterThanOrEqual(2);
    expect(erreurs.some((erreur) => erreur.instancePath === "" && erreur.keyword === "required")).toBe(true);
    expect(erreurs.some((erreur) => erreur.instancePath === "/theme")).toBe(true);
  });
});

describe("couplage du registre commun", () => {
  it("8. un schéma pris isolément sans le registre commun échoue en nommant la référence non résolue", () => {
    expect(() => tenterValidationIsolee("item", racineSchema)).toThrow(
      /urn:banc-essai-2027:schema:commun/,
    );
  });
});

describe("aucun fichier du disque n'est ignoré", () => {
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
  // 176 → 178 : conformité 2026-09-29, n° 5, deux invalides de diagnostic de lot (sans kappa_par_question, kappa de question avec motif).
  // 178 → 179 : conformité 2026-09-29, n° 6, un valide d'item (non évaluable par le panel, attestation conservée).
  // 179 → 188 : décisions de l'auteur du 2026-10-02 (lot interrogation), trois valides et six invalides de réponse (refus_api, motif_manquante).
  // 188 → 192 : décisions de l'auteur du 2026-10-02 (suite du lot interrogation), un valide et trois invalides de réponse (brut_texte, brut_octets_sha256, requete.entetes).
  // 192 → 194 : décision D15 de l'auteur (lot notation), une notation valide et une invalide sous le motif extrait_invalide.
  // 194 → 196 : décision D17 de l'auteur, une notation et un verdict invalides portant la fraîcheur sans le drapeau obsolescence.
  // 196 → 202 : lot notation (entrées-sorties, §7), deux valides et quatre invalides de run (test contrefactuel publié : bloc, taux et effectifs des juges).
  // 202 → 204 : décision D15 de l'auteur (« accord partiel → humain »), une notation valide et une invalide sous le motif accord_partiel_juges.
  // 204 → 212 : décision D20 de l'auteur (lot test-liens), quatre valides et quatre invalides du nouveau schéma existence-lien.
  // 212 → 219 : décision D21 de l'auteur (lot test-liens), deux valides et cinq invalides d'existence-lien (instantané écarté, téléchargement de la copie archivée, url_non_ascii retirée).
  // 219 → 220 : décision D22 de l'auteur (lot test-liens), un invalide d'existence-lien (téléchargement servi hors de la forme id_).
  // 220 → 232 : décision D24 de l'auteur (lot go-no-go), un valide et quatre invalides de run, deux valides et cinq invalides du nouveau schéma checklist.
  // 232 → 233 : décision D25 de l'auteur (lot go-no-go), un invalide de run (go/no-go sans indeterminees_echantillon_humain).
  // 233 → 240 : décision D27 de l'auteur (lot charge-juge-v3), une notation valide, trois valides et trois invalides d'extraction-page-lien.
  // 240 → 241 : décision D29 (4) de l'auteur, une notation invalide (sans version_charge).
  // 241 → 246 : décision D30 de l'auteur, une notation valide et une invalide (lecture de comparateur et version_charge), un invalide de run (go/no-go sans renvois_attribution_indecidable), un valide et un invalide du nouveau schéma renvoi-humain.
  // 246 → 250 : décision D31 de l'auteur, un valide et trois invalides de run (paires écartées, taux de juge indéfini, renvois écartés du kappa).
  // 250 → 259 : décision D32 de l'auteur, une notation valide et quatre invalides (notation par règle d'un refus de l'API), un verdict valide et deux invalides (regle_refus_api), un invalide de run (go/no-go sans refus_api_echantillon_humain).
  // 259 → 262 : décision D33 de l'auteur, une notation valide (humain sur un refus, sans extrait) et deux invalides (juge marqué sur_refus_api, règle sans le marqueur).
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
  it("le lister des exemples réels ne rate ni la table de vérité ni les 324 exemples", () => {
    expect(listerFichiersExemplesSurDisque(racineExemplesReels)).toHaveLength(324);
  });
});
