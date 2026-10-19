/**
 * Cœur de l'extraction double, de bout en bout (§4 ; décision D52) : texte canonique et sorties
 * brutes des deux modèles en entrée ; items et mesures de staging, journal des rejets en sortie.
 * Pur : aucune écriture disque hors du test 17, qui écrit dans un répertoire temporaire.
 * Cas limites 2, 3, 4, 10 (PDF sans pages), 11 (enregistrement), 13, 14, 16 et 17 du brief.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extraireSource,
  ModelesIdentiques,
  PagesAbsentes,
  SortiesIncompletes,
  SourceDejaLocalisee,
  SourceIncoherente,
  TexteNeCorrespondPas,
  TranscriptionIncoherente,
  type EntreeExtraction,
  type ResultatExtraction,
} from "../../pipeline/extraction/extraction.ts";
import { AucunTexteEpingle } from "../../pipeline/extraction/choix-texte.ts";
import type { Rejet } from "../../pipeline/extraction/rejets.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { empreinteContenuNotant } from "../../validation/domaine/empreinte.ts";
import { chargerStaging, mesureDe } from "../../validation/io/staging.ts";
import type { Item } from "../../validation/domaine/types.ts";
import {
  CANDIDAT,
  COMMIT,
  entreeHtml,
  entreePdf,
  entreeVideo,
  fiche,
  HTML,
  illisible,
  INSTANT,
  lisible,
  MODELE_A,
  MODELE_B,
  ports,
  propose,
  sortie,
  sourceArticle,
} from "./aides.ts";

const TEXTE =
  "Notre constat : les centres de santé ferment trop tôt.\n" +
  "Nous ouvrirons tous les centres de santé municipaux le dimanche.\n" +
  "Nous créeront une prime de 150 euros pour chaque apprenti de première année.";
const C_SANTE = "Nous ouvrirons tous les centres de santé municipaux le dimanche.";
const C_PRIME = "Nous créeront une prime de 150 euros pour chaque apprenti de première année.";
const PRIME = {
  mesure_proposee: { libelle: "Créer une prime pour les apprentis de première année", theme: "travail_emploi" },
  paraphrase: "Créer une prime de 150 euros pour chaque apprenti de première année.",
  quantification: { dimensions: [{ type: "montant", valeur: 150, unite: "EUR", operateur: "exact" }] },
};
const VIDE = '{"items": []}';

function extraire(entree: EntreeExtraction): ResultatExtraction {
  return extraireSource(entree, ports());
}

function seul<T>(valeurs: readonly T[]): T {
  expect(valeurs).toHaveLength(1);
  return valeurs[0] as T;
}

describe("extraction double : issue nominale", () => {
  const resultat = extraire(
    entreeHtml(TEXTE, sortie(propose(C_SANTE), propose(C_PRIME, PRIME)), sortie(propose(C_PRIME, PRIME), propose(C_SANTE))),
  );

  it("deux paires en accord ⇒ deux items, deux mesures, aucun rejet", () => {
    expect(resultat.items).toHaveLength(2);
    expect(resultat.mesures).toHaveLength(2);
    expect(resultat.rejets).toEqual([]);
    expect(resultat.items.map((item) => item.assertion?.extraction)).toEqual([
      { modeles: [MODELE_A, MODELE_B], accord: "accord" },
      { modeles: [MODELE_A, MODELE_B], accord: "accord" },
    ]);
  });

  it("l'item porte ce que le code ajoute : offsets, test verbatim daté, source, dates, historique", () => {
    const item = resultat.items[0] as Item;
    const debut = TEXTE.indexOf(C_SANTE);
    expect(item).toMatchObject({
      version: 1,
      type: "P",
      candidat_id: CANDIDAT,
      mesure_version: 1,
      statut_validation: "en_attente",
      statut_contestation: "aucune",
      valide_du: "2026-09-01",
      valide_au: null,
      validations: [],
      contestations: [],
    });
    expect(item.assertion?.citation_verbatim).toBe(C_SANTE);
    expect(item.assertion?.test_verbatim).toEqual({
      passe: true,
      date: INSTANT,
      version_normalisation: "normalisation-v1",
      offset_debut: debut,
      offset_fin: debut + C_SANTE.length,
    });
    expect(item.assertion?.source.page).toBeUndefined();
    expect(item.historique).toEqual([
      {
        date: INSTANT,
        changement: "création par extraction double",
        motif: `prompts/extraction-1.0.0, modèles ${MODELE_A} puis ${MODELE_B}, accord`,
        commit: COMMIT,
        version_resultante: 1,
      },
    ]);
  });

  it("l'empreinte est celle du contenu notant", () => {
    for (const item of resultat.items) expect(item.empreinte).toBe(empreinteContenuNotant(item));
  });

  it("chaque item épingle une mesure de staging nouvelle, version 1, au libellé et au thème proposés", () => {
    const [premier] = resultat.items;
    const mesure = resultat.mesures.find((candidate) => candidate.id === premier?.mesure_id);
    expect(mesure).toMatchObject({
      version: 1,
      libelle: "Ouvrir les centres de santé le dimanche",
      theme: "sante",
      formulation_canonique: "Ouvrir les centres de santé le dimanche",
      fictive: false,
    });
  });

  it("les items suivent l'ordre du texte, quel que soit l'ordre des sorties", () => {
    expect(resultat.items.map((item) => item.assertion?.citation_verbatim)).toEqual([C_SANTE, C_PRIME]);
  });
});

describe("cas 17 : conformité aux schémas et relecture par l'interface de validation", () => {
  const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE), propose(C_PRIME, PRIME)), sortie(propose(C_SANTE))));

  it('chaque item passe valider("item") et chaque mesure valider("mesure")', () => {
    for (const item of resultat.items) expect(() => valider("item", item, item.id)).not.toThrow();
    for (const mesure of resultat.mesures) expect(() => valider("mesure", mesure, mesure.id)).not.toThrow();
  });

  it("chargerStaging relit items et mesures écrits dans un répertoire temporaire", () => {
    const racine = mkdtempSync(join(tmpdir(), "extraction-staging-"));
    mkdirSync(join(racine, "items"));
    mkdirSync(join(racine, "mesures"));
    for (const item of resultat.items) writeFileSync(join(racine, "items", `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`);
    for (const mesure of resultat.mesures) {
      writeFileSync(join(racine, "mesures", `${mesure.id}.json`), `${JSON.stringify(mesure, null, 2)}\n`);
    }
    const staging = chargerStaging(racine);
    expect([...staging.items.keys()]).toEqual(resultat.items.map((item) => item.id).sort());
    for (const item of staging.items.values()) expect(mesureDe(staging, item).theme).toBeDefined();
  });

  it("un item T3 est déposé « à confirmer » (§4), conforme au schéma", () => {
    const entree = { ...entreeHtml(TEXTE, sortie(propose(C_SANTE)), sortie(propose(C_SANTE))), source: sourceArticle(TEXTE) };
    const item = seul(extraire(entree).items);
    expect(item.statut_validation).toBe("a_confirmer");
    expect(() => valider("item", item, item.id)).not.toThrow();
  });
});

describe("cas 2 et 3 : sorties vides", () => {
  it('cas 2 : {"items": []} des deux côtés ⇒ zéro item, zéro rejet, pas d\'erreur', () => {
    expect(extraire(entreeHtml(TEXTE, VIDE, VIDE))).toEqual({ items: [], mesures: [], rejets: [] });
  });

  it("cas 3 : un modèle rend des items, l'autre aucun ⇒ tous desaccord_existence, déposés", () => {
    const resultat = extraire(entreeHtml(TEXTE, VIDE, sortie(propose(C_SANTE), propose(C_PRIME, PRIME))));
    expect(resultat.items.map((item) => item.assertion?.extraction)).toEqual([
      { modeles: [MODELE_A, MODELE_B], accord: "desaccord_existence", detail_desaccord: `aucun item apparié dans la sortie de ${MODELE_A}` },
      { modeles: [MODELE_A, MODELE_B], accord: "desaccord_existence", detail_desaccord: `aucun item apparié dans la sortie de ${MODELE_A}` },
    ]);
    expect(resultat.rejets).toEqual([]);
  });
});

describe("cas 4 : une sortie rejetée en entier, l'autre valide (décision D53 (2))", () => {
  const resultat = extraire(entreeHtml(TEXTE, "```json\n{\"items\": []}\n```", sortie(propose(C_SANTE))));

  it("la source est refusée : aucun item, aucune mesure, l'extraction double n'a pas eu lieu", () => {
    expect(resultat.items).toEqual([]);
    expect(resultat.mesures).toEqual([]);
  });

  it("le journal nomme la sortie rejetée et le refus de la source", () => {
    expect(resultat.rejets).toEqual([
      { portee: "sortie", modele: MODELE_A, motif: "bloc_de_code", detail: expect.any(String) as string },
      {
        portee: "source",
        motif: "extraction_double_incomplete",
        detail: `sortie de ${MODELE_A} rejetée en entier : la source n'a pas été extraite deux fois (§4), aucun item déposé`,
      },
    ]);
  });

  it("les deux sorties rejetées ⇒ deux rejets de sortie et le refus de la source", () => {
    const deux = extraire(entreeHtml(TEXTE, "pas du JSON", '{"items": [], "items": []}'));
    expect(deux.rejets.map((rejet) => [rejet.portee, rejet.motif])).toEqual([
      ["sortie", "json_invalide"],
      ["sortie", "cle_dupliquee"],
      ["source", "extraction_double_incomplete"],
    ]);
  });
});

describe("lecture illisible : rejet de sortie lecture_illisible, avec la raison reçue", () => {
  // HTTP 400 : hors de la liste des échecs de transport (408, 429, 5xx — §4, D54 (2), constat 2 du
  // 2026-10-17) ; ce test exerce le cœur, qui ne voit jamais le statut HTTP, mais le choix du
  // statut dans la raison doit rester cohérent avec ce que le pipeline y laisse vraiment arriver.
  const HTTP_400 = "réponse HTTP 400 : aucun texte du modèle n'est lu hors 2xx.";
  const refus = (modeles: string): Rejet => ({
    portee: "source",
    motif: "extraction_double_incomplete",
    detail: `sortie de ${modeles} rejetée en entier : la source n'a pas été extraite deux fois (§4), aucun item déposé`,
  });

  it("1. premier modèle illisible (HTTP 400), second conforme ⇒ lecture_illisible, refus de la source, rien déposé", () => {
    const resultat = extraire(entreeHtml(TEXTE, illisible(HTTP_400), sortie(propose(C_SANTE))));
    expect(resultat.items).toEqual([]);
    expect(resultat.mesures).toEqual([]);
    expect(resultat.rejets).toEqual([{ portee: "sortie", modele: MODELE_A, motif: "lecture_illisible", detail: HTTP_400 }, refus(MODELE_A)]);
  });

  it("2. second modèle illisible, premier conforme ⇒ le même rejet, au nom du second", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE)), illisible(HTTP_400)));
    expect(resultat.items).toEqual([]);
    expect(resultat.mesures).toEqual([]);
    expect(resultat.rejets).toEqual([{ portee: "sortie", modele: MODELE_B, motif: "lecture_illisible", detail: HTTP_400 }, refus(MODELE_B)]);
  });

  it("3. les deux illisibles ⇒ deux rejets lecture_illisible, chacun avec sa raison, un seul refus de la source", () => {
    const resultat = extraire(entreeHtml(TEXTE, illisible(HTTP_400), illisible("sortie coupée : finish_reason « length ».")));
    expect(resultat.items).toEqual([]);
    expect(resultat.rejets).toEqual([
      { portee: "sortie", modele: MODELE_A, motif: "lecture_illisible", detail: HTTP_400 },
      { portee: "sortie", modele: MODELE_B, motif: "lecture_illisible", detail: "sortie coupée : finish_reason « length »." },
      refus(`${MODELE_A} et de ${MODELE_B}`),
    ]);
  });

  it("4. un illisible, l'autre lisible mais pas du JSON ⇒ lecture_illisible, json_invalide, refus de la source", () => {
    const resultat = extraire(entreeHtml(TEXTE, "pas du JSON", illisible(HTTP_400)));
    expect(resultat.items).toEqual([]);
    expect(resultat.rejets.map((rejet) => [rejet.portee, "modele" in rejet ? rejet.modele : null, rejet.motif])).toEqual([
      ["sortie", MODELE_A, "json_invalide"],
      ["sortie", MODELE_B, "lecture_illisible"],
      ["source", null, "extraction_double_incomplete"],
    ]);
  });

  it("5. lisible dont le texte est la chaîne vide ⇒ json_invalide, le chemin lisible n'a pas changé", () => {
    const resultat = extraire(entreeHtml(TEXTE, lisible(""), sortie(propose(C_SANTE))));
    expect(resultat.items).toEqual([]);
    expect(resultat.rejets).toEqual([
      { portee: "sortie", modele: MODELE_A, motif: "json_invalide", detail: expect.any(String) as string },
      refus(MODELE_A),
    ]);
  });

  it("6. raison à guillemets typographiques et retour à la ligne ⇒ recopiée à l'identique dans detail", () => {
    const raison = "refus du modèle : « je ne peux pas » —\n“stop_reason” : ‘refusal’.  ";
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE)), illisible(raison)));
    const [rejet] = resultat.rejets;
    expect(rejet).toEqual({ portee: "sortie", modele: MODELE_B, motif: "lecture_illisible", detail: raison });
  });

  it("7. constat 17 : model servi différent de l'épinglé ⇒ motif modele_different, refus de la source, rien déposé", () => {
    const raison = `model servi "un-autre-modele", épinglé ${JSON.stringify(MODELE_A)}.`;
    const resultat = extraire(entreeHtml(TEXTE, illisible(raison, "modele_different"), sortie(propose(C_SANTE))));
    expect(resultat.items).toEqual([]);
    expect(resultat.mesures).toEqual([]);
    expect(resultat.rejets).toEqual([{ portee: "sortie", modele: MODELE_A, motif: "modele_different", detail: raison }, refus(MODELE_A)]);
  });
});

describe("rejets d'items, avant l'appariement", () => {
  it("cas 16 : candidat_id différent de celui de la source ⇒ item rejeté, l'autre modèle en desaccord_existence", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE, { candidat_id: "candidat-b" })), sortie(propose(C_SANTE))));
    expect(resultat.rejets).toEqual([
      {
        portee: "item",
        modele: MODELE_A,
        index: 0,
        motif: "candidat_different",
        detail: `candidat_id « candidat-b », la source est rattachée à « ${CANDIDAT} »`,
      },
    ]);
    expect(seul(resultat.items).assertion?.extraction).toMatchObject({ accord: "desaccord_existence" });
  });

  it("citation introuvable : rejetée avec le modèle, l'index et le motif, jamais rapprochée", () => {
    const corrigee = "Nous créerons une prime de 150 euros pour chaque apprenti de première année.";
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE), propose(corrigee, PRIME)), sortie(propose(C_SANTE))));
    expect(resultat.rejets).toEqual([
      { portee: "item", modele: MODELE_A, index: 1, motif: "introuvable", detail: expect.any(String) as string },
    ]);
    expect(seul(resultat.items).assertion?.citation_verbatim).toBe(C_SANTE);
  });

  it("citation contenant U+000C ⇒ rejetée (saut_de_page)", () => {
    const pages = ["Nous fermerons la centrale.", "Nous ouvrirons des écoles."];
    const resultat = extraire(entreePdf(pages, sortie(propose(pages.join("\f"))), VIDE));
    expect(resultat.rejets.map((rejet) => rejet.motif)).toEqual(["saut_de_page"]);
    expect(resultat.items).toEqual([]);
  });

  it("citation faite d'espaces ⇒ rejetée (citation_vide)", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose("   ")), VIDE));
    expect(resultat.rejets.map((rejet) => rejet.motif)).toEqual(["citation_vide"]);
  });
});

describe("item déposé depuis une paire (D52 (3))", () => {
  it("champs du modèle nommé en premier ; desaccord_contenu nomme les champs qui divergent", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE)), sortie(propose(C_SANTE, { position: "contre", paraphrase: "Autre." }))));
    const item = seul(resultat.items);
    expect(item.assertion?.position).toBe("pour");
    expect(item.assertion?.paraphrase).toBe("Ouvrir les centres de santé le dimanche.");
    expect(item.assertion?.extraction).toEqual({
      modeles: [MODELE_A, MODELE_B],
      accord: "desaccord_contenu",
      detail_desaccord: "champs divergents : position",
    });
  });

  it("l'ordre de la configuration décide quel modèle fournit les champs", () => {
    const entree = entreeHtml(TEXTE, sortie(propose(C_SANTE)), sortie(propose(C_SANTE, { position: "contre" })));
    const inverse = { ...entree, configuration: { ...entree.configuration, modeles: [MODELE_B, MODELE_A] as const } };
    const item = seul(extraire(inverse).items);
    expect(item.assertion?.position).toBe("contre");
    expect(item.assertion?.extraction).toMatchObject({ modeles: [MODELE_B, MODELE_A] });
  });

  it("item O retenu : non déposable sans son état antérieur, porté au journal (non tranché, signalé à l'auteur)", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE, { type: "O" })), sortie(propose(C_SANTE))));
    expect(resultat.items).toEqual([]);
    expect(resultat.mesures).toEqual([]);
    expect(resultat.rejets).toEqual([
      {
        portee: "depot",
        modele: MODELE_A,
        index: 0,
        motif: "etat_o_sans_etat_anterieur",
        accord: "desaccord_contenu",
        detail: expect.any(String) as string,
      },
    ]);
  });

  it("item O du second modèle face à un P du premier ⇒ le P est déposé, desaccord_contenu sur type", () => {
    const resultat = extraire(entreeHtml(TEXTE, sortie(propose(C_SANTE)), sortie(propose(C_SANTE, { type: "O" }))));
    expect(seul(resultat.items).assertion?.extraction).toMatchObject({
      accord: "desaccord_contenu",
      detail_desaccord: "champs divergents : type",
    });
  });
});

describe("cas 9 : citation présente deux fois (décision D53 (3))", () => {
  const TEXTE_REPETE = `${C_SANTE}\nRappel : ${C_SANTE}`;

  it("rejetée des deux côtés, motif citation_ambigue : aucun item, rien n'est apparié", () => {
    const resultat = extraire(entreeHtml(TEXTE_REPETE, sortie(propose(C_SANTE)), sortie(propose(C_SANTE))));
    expect(resultat.items).toEqual([]);
    expect(resultat.rejets).toEqual([
      { portee: "item", modele: MODELE_A, index: 0, motif: "citation_ambigue", detail: expect.any(String) as string },
      { portee: "item", modele: MODELE_B, index: 0, motif: "citation_ambigue", detail: expect.any(String) as string },
    ]);
  });

  it("la citation ambiguë n'entre pas dans l'appariement : l'autre modèle, qui cite un passage unique, est seul", () => {
    const large = `Rappel : ${C_SANTE}`;
    const resultat = extraire(entreeHtml(TEXTE_REPETE, sortie(propose(C_SANTE)), sortie(propose(large))));
    expect(resultat.rejets.map((rejet) => [rejet.portee, rejet.motif])).toEqual([["item", "citation_ambigue"]]);
    const item = seul(resultat.items);
    expect(item.assertion?.citation_verbatim).toBe(large);
    expect(item.assertion?.extraction).toMatchObject({ accord: "desaccord_existence" });
  });
});

describe("cas 10 : pages d'un programme PDF", () => {
  const PAGES = ["Constat : les hôpitaux ferment.", "Nous ouvrirons des hôpitaux.", "Nous recruterons des infirmiers."];

  it("la page est calculée depuis les offsets et les pages de la fiche, item conforme", () => {
    const resultat = extraire(entreePdf(PAGES, sortie(propose("Nous recruterons des infirmiers.")), sortie(propose("des infirmiers."))));
    const item = seul(resultat.items);
    expect(item.assertion?.source.page).toBe(3);
    expect(() => valider("item", item, item.id)).not.toThrow();
  });

  it("citation à cheval sur deux pages ⇒ rejetée (citation_sans_page_unique)", () => {
    const resultat = extraire(entreePdf(PAGES, sortie(propose("hôpitaux. Nous recruterons")), VIDE));
    expect(resultat.rejets.map((rejet) => rejet.motif)).toEqual(["citation_sans_page_unique"]);
  });

  it("programme PDF dont la fiche n'a pas pages ⇒ PagesAbsentes, rien n'est extrait", () => {
    const entree = entreePdf(PAGES, VIDE, VIDE);
    const texte = PAGES.join("\f");
    const sansPages = { ...entree, extracteur_epingle: HTML, fiches: [fiche(texte, HTML, { encodage: { nom: "utf-8", origine: "bom" } })] };
    expect(() => extraire(sansPages)).toThrow(PagesAbsentes);
  });
});

describe("cas 11 : enregistrement vidéo T2", () => {
  const CUES = [
    { debut: "00:42:10.000", fin: "00:42:14.500", texte: "Bonjour à tous." },
    { debut: "00:42:14.500", fin: "00:42:19.000", texte: "Nous recruterons des infirmiers," },
    { debut: "00:42:19.000", fin: "00:42:21.250", texte: "partout en France." },
  ];
  const CITATION = "Nous recruterons des infirmiers, partout en France.";

  it("l'extrait de la source couvre les cues de la citation, item conforme et sans attestation d'écoute", () => {
    const item = seul(extraire(entreeVideo(CUES, sortie(propose(CITATION)), sortie(propose(CITATION)))).items);
    expect(item.assertion?.source.extrait).toEqual({ debut: "00:42:14", fin: "00:42:22" });
    expect(item.assertion?.source.transcription_verifiee_par).toBeUndefined();
    expect(() => valider("item", item, item.id)).not.toThrow();
  });

  it("transcription absente pour une vidéo ⇒ TranscriptionIncoherente", () => {
    expect(() => extraire({ ...entreeVideo(CUES, VIDE, VIDE), vtt: null })).toThrow(TranscriptionIncoherente);
  });

  it("transcription dont l'empreinte n'est pas celle de la fiche ⇒ TranscriptionIncoherente", () => {
    const entree = entreeVideo(CUES, VIDE, VIDE);
    expect(() => extraire({ ...entree, vtt: `${entree.vtt ?? ""}\n` })).toThrow(TranscriptionIncoherente);
  });
});

describe("cas 13 : ordre des items permuté", () => {
  const A = [propose(C_SANTE), propose(C_PRIME, PRIME), propose("les centres de santé ferment trop tôt.", { position: "contre" })] as const;
  const B = [propose(C_PRIME, PRIME), propose("tous les centres de santé municipaux"), propose(C_SANTE, { position: "conditionnel" })] as const;

  it("résultat identique octet pour octet, quelle que soit la sortie permutée", () => {
    const attendu = JSON.stringify(extraire(entreeHtml(TEXTE, sortie(...A), sortie(...B))));
    expect(JSON.stringify(extraire(entreeHtml(TEXTE, sortie(...[...A].reverse()), sortie(...B))))).toBe(attendu);
    expect(JSON.stringify(extraire(entreeHtml(TEXTE, sortie(...A), sortie(...[...B].reverse()))))).toBe(attendu);
    expect(JSON.stringify(extraire(entreeHtml(TEXTE, sortie(A[1], A[2], A[0]), sortie(B[2], B[0], B[1]))))).toBe(attendu);
  });
});

describe("refus de l'entrée", () => {
  it("cas 14 : deux identifiants de modèle identiques ⇒ ModelesIdentiques", () => {
    const entree = entreeHtml(TEXTE, VIDE, VIDE);
    const memes = { ...entree, configuration: { ...entree.configuration, modeles: [MODELE_A, MODELE_A] as const } };
    expect(() => extraire(memes)).toThrow(ModelesIdentiques);
  });

  it("une sortie manquante pour un modèle configuré ⇒ SortiesIncompletes", () => {
    const entree = entreeHtml(TEXTE, VIDE, VIDE);
    expect(() => extraire({ ...entree, sorties: new Map([[MODELE_A, lisible(VIDE)]]) })).toThrow(SortiesIncompletes);
  });

  it("cas 15 : aucune fiche de la version épinglée ⇒ AucunTexteEpingle", () => {
    const entree = entreeHtml(TEXTE, VIDE, VIDE);
    expect(() => extraire({ ...entree, extracteur_epingle: { ...HTML, version: "3.13.0" } })).toThrow(AucunTexteEpingle);
  });

  it("texte qui ne donne pas l'empreinte de la fiche épinglée ⇒ TexteNeCorrespondPas", () => {
    expect(() => extraire({ ...entreeHtml(TEXTE, VIDE, VIDE), texte: `${TEXTE} ` })).toThrow(TexteNeCorrespondPas);
  });

  it("source d'un autre texte que la fiche épinglée ⇒ SourceIncoherente", () => {
    const entree = entreeHtml(TEXTE, VIDE, VIDE);
    expect(() => extraire({ ...entree, source: { ...entree.source, texte_sha256: "c".repeat(64) } })).toThrow(SourceIncoherente);
  });

  it("source qui porte déjà une page ⇒ SourceDejaLocalisee : la page vient de la citation", () => {
    const entree = entreeHtml(TEXTE, VIDE, VIDE);
    expect(() => extraire({ ...entree, source: { ...entree.source, page: 1 } })).toThrow(SourceDejaLocalisee);
  });

  it("candidat_id de l'entrée non conforme ⇒ refus à la frontière", () => {
    expect(() => extraire({ ...entreeHtml(TEXTE, VIDE, VIDE), candidat_id: "Candidat A" })).toThrow(/identifiant_court/);
  });
});
