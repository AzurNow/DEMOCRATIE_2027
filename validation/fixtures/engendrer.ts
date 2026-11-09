/**
 * `pnpm fixtures` — jeu de démonstration de l'interface de validation.
 *
 * Il existe pour que l'interface soit utilisable, et testable de bout en bout, avant que le
 * pipeline de collecte n'existe. Il couvre les **quatre types d'item** (P, A, O, F) et les
 * **trois types de source** (PDF, page web archivée, enregistrement vidéo avec transcription).
 *
 * **Tout y est ouvertement fictif.** Candidats `demo-alpha` à `demo-epsilon`, mesures inventées,
 * sources fabriquées ici même. Attribuer une position inventée à une personne réelle est
 * interdit sans réserve par CLAUDE.md, et un jeu de démonstration n'est pas une exception :
 * un fichier de démonstration finit toujours par être lu comme une donnée.
 *
 * Les sources étant fabriquées ici, les citations y figurent réellement : le test verbatim
 * passe pour de bon, offsets compris, et l'écran de validation est exercé dans les mêmes
 * conditions qu'avec une vraie source.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { empreinteContenuNotant } from "../domaine/empreinte.ts";
import { composerLots } from "../domaine/lot.ts";
import { testerVerbatim } from "../domaine/verbatim.ts";
import type { Item, ItemDuLot, Lot, Mesure, Source } from "../domaine/types.ts";
import { ecrireLot } from "../io/lots-fichier.ts";
import { construirePdf } from "./pdf.ts";

const RACINE = resolve(import.meta.dirname, "../..");
const FIXTURES = resolve(RACINE, "validation/fixtures");
const ARCHIVES = join(FIXTURES, "archives");
const STAGING = join(FIXTURES, "staging-demo");
const LOTS = join(FIXTURES, "lots-demo");

const CANDIDATS = ["demo-alpha", "demo-beta", "demo-gamma", "demo-delta", "demo-epsilon"];
const DATE = "2026-09-17T10:00:00+02:00";
const COMMIT = "0".repeat(40);

/* --------------------------------------------------------------- archives */

const PAGES_PDF = [
  {
    titre: "Programme de demonstration — page 1",
    lignes: [
      "Ce document est une fixture du Banc d'essai 2027. Il ne provient",
      "d'aucune campagne reelle et n'engage personne.",
      "",
      "Les positions ci-apres sont attribuees a des candidats fictifs,",
      "designes par les identifiants demo-alpha a demo-epsilon.",
    ],
  },
  {
    titre: "Fiscalite et energie — page 2",
    lignes: [
      "Nous ramenerons la TVA sur les produits energetiques de 20 % a 5,5 %,",
      "des la premiere loi de finances.",
      "",
      "Le gel des tarifs reglementes sera prolonge de deux ans.",
    ],
  },
  {
    titre: "Retraites — page 3",
    lignes: [
      "Nous retablirons le depart a la retraite a 60 ans pour toutes et tous,",
      "sans condition de duree de cotisation.",
      "",
      "Les regimes speciaux existants seront maintenus en l'etat.",
    ],
  },
];

const TEXTE_PDF = PAGES_PDF.map((page) => [page.titre, ...page.lignes].join("\n")).join("\n\n");

const PAGE_HTML = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8"><title>Plateforme de demonstration</title></head>
  <body>
    <h1>Plateforme programmatique — fixture</h1>
    <p>Document fabrique pour la demonstration de l'interface de validation. Aucune campagne
    reelle n'est concernee.</p>
    <h2>Sante</h2>
    <p>Nous ouvrirons trente maisons de sante pluriprofessionnelles par departement d'ici 2030,
    en priorite dans les zones sous-dotees.</p>
    <h2>Education</h2>
    <p>Le nombre d'eleves par classe sera plafonne a vingt-quatre en zone prioritaire.</p>
  </body>
</html>
`;

const TEXTE_HTML = [
  "Plateforme programmatique — fixture",
  "Document fabrique pour la demonstration de l'interface de validation. Aucune campagne reelle n'est concernee.",
  "Sante",
  "Nous ouvrirons trente maisons de sante pluriprofessionnelles par departement d'ici 2030, en priorite dans les zones sous-dotees.",
  "Education",
  "Le nombre d'eleves par classe sera plafonne a vingt-quatre en zone prioritaire.",
].join("\n");

const CUES: readonly { debut: string; fin: string; texte: string }[] = [
  { debut: "00:00:02.000", fin: "00:00:08.000", texte: "Enregistrement de demonstration du Banc d'essai 2027." },
  { debut: "00:00:08.000", fin: "00:00:14.000", texte: "La position a change : ce sera 62 ans, et non plus 60." },
  { debut: "00:00:14.000", fin: "00:00:20.000", texte: "Les carrieres longues conservent un depart anticipe." },
];

const VTT = `WEBVTT\n\n${CUES.map((cue) => `${cue.debut} --> ${cue.fin}\n${cue.texte}`).join("\n\n")}\n`;
const TEXTE_VIDEO = CUES.map((cue) => cue.texte).join("\n");

function empreinte(contenu: Buffer | string): string {
  return createHash("sha256").update(contenu).digest("hex");
}

interface Archives {
  readonly pdf: { sha256: string; texte_sha256: string; chemin: string };
  readonly page: { sha256: string; texte_sha256: string; chemin: string };
  readonly video: { sha256: string; texte_sha256: string; chemin: string };
}

function ecrireArchives(): Archives {
  mkdirSync(ARCHIVES, { recursive: true });
  mkdirSync(join(STAGING, "textes"), { recursive: true });
  mkdirSync(join(STAGING, "transcriptions"), { recursive: true });

  const pdf = construirePdf(PAGES_PDF);
  writeFileSync(join(ARCHIVES, "programme-demo.pdf"), pdf);
  writeFileSync(join(ARCHIVES, "plateforme-demo.html"), PAGE_HTML, "utf8");
  const video = engendrerVideo(join(ARCHIVES, "declaration-demo.mp4"));

  const textes = {
    pdf: TEXTE_PDF.normalize("NFC"),
    page: TEXTE_HTML.normalize("NFC"),
    video: TEXTE_VIDEO.normalize("NFC"),
  };
  const empreintes = {
    pdf: empreinte(textes.pdf),
    page: empreinte(textes.page),
    video: empreinte(textes.video),
  };
  for (const [cle, texte] of Object.entries(textes)) {
    const nom = empreintes[cle as keyof typeof empreintes];
    writeFileSync(join(STAGING, "textes", `${nom}.txt`), texte, "utf8");
  }
  writeFileSync(join(STAGING, "transcriptions", `${empreinte(video)}.vtt`), VTT, "utf8");

  return {
    pdf: {
      sha256: empreinte(pdf),
      texte_sha256: empreintes.pdf,
      chemin: relative(RACINE, join(ARCHIVES, "programme-demo.pdf")),
    },
    page: {
      sha256: empreinte(PAGE_HTML),
      texte_sha256: empreintes.page,
      chemin: relative(RACINE, join(ARCHIVES, "plateforme-demo.html")),
    },
    video: {
      sha256: empreinte(video),
      texte_sha256: empreintes.video,
      chemin: relative(RACINE, join(ARCHIVES, "declaration-demo.mp4")),
    },
  };
}

/**
 * Vidéo courte engendrée par ffmpeg quand il est disponible. À défaut, un fichier MP4 minimal
 * est écrit : le chemin de code de l'écran est le même, seule la lecture ne donnera rien, et
 * c'est dit plutôt que masqué.
 */
function engendrerVideo(chemin: string): Buffer {
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "color=c=gray:s=320x180:d=20", "-r", "5", "-pix_fmt", "yuv420p", chemin],
      { stdio: "ignore" },
    );
  } catch {
    process.stdout.write("ffmpeg absent : la vidéo de démonstration ne sera pas lisible.\n");
    writeFileSync(chemin, Buffer.from("ftypisom", "latin1"));
  }
  return readFileSync(chemin);
}

/* ------------------------------------------------------------- référentiel */

function source(
  archive: { sha256: string; texte_sha256: string; chemin: string },
  surcharges: Partial<Source>,
): Source {
  return {
    tier: "T1",
    url: "https://demonstration.invalid/programme.pdf",
    type_document: "programme_pdf",
    // Protocole 0.13 (n° 54) : format relevé par la collecte ; chaque surcharge d'un autre type le redonne.
    format: "pdf",
    sha256: archive.sha256,
    texte_sha256: archive.texte_sha256,
    archive_url: "https://archive.invalid/demonstration/programme.pdf",
    date_source: "2026-09-01",
    date_collecte: DATE,
    chemin_local: archive.chemin,
    publication: "publique",
    ...surcharges,
  };
}

function mesure(indice: number, parametres: Partial<Mesure>): Mesure {
  const socle: Mesure = {
    id: identifiant("MESURE", indice),
    version: 1,
    empreinte: "0".repeat(64),
    libelle: "Mesure de démonstration",
    theme: "fiscalite_pouvoir_achat",
    formulation_canonique: "une mesure de démonstration",
    fictive: false,
    historique: [{ date: DATE, changement: "création", commit: COMMIT, version_resultante: 1 }],
    ...parametres,
  } as Mesure;
  return socle;
}

/**
 * Identifiant de démonstration : lisible, mais valide au regard du motif ULID du schéma.
 * Le numéro est cadré à droite sur une largeur fixe — sans cela, l'item 1 et l'item 10
 * produisent le même identifiant, et l'un écrase l'autre en silence.
 */
function identifiant(prefixe: string, indice: number): string {
  const tete = prefixe.toUpperCase().replace(/[^0-9A-HJKMNP-TV-Z]/g, "0").slice(0, 6);
  return tete + String(indice).padStart(26 - tete.length, "0");
}

/** Les offsets sont calculés par le vrai test verbatim : rien n'est écrit à la main. */
function testVerbatim(citation: string, texte: string) {
  const resultat = testerVerbatim(citation, texte);
  if (!resultat.passe) {
    throw new Error(`Fixture incohérente : la citation « ${citation} » n'est pas dans sa source.`);
  }
  return {
    passe: true,
    date: DATE,
    version_normalisation: resultat.version_normalisation,
    offset_debut: resultat.offset_debut as number,
    offset_fin: resultat.offset_fin as number,
  };
}

interface Plan {
  readonly items: Item[];
  readonly mesures: Mesure[];
}

interface Fabrique {
  readonly mesures: Mesure[];
  readonly items: Item[];
  readonly socle: (numero: number, type: Item["type"], mesure_id: string) => Omit<Item, "empreinte" | "type"> & { type: Item["type"] };
  ajouter(partiel: Omit<Item, "empreinte">): void;
  ajouterMesure(indice: number, parametres: Partial<Mesure>): string;
}

function fabrique(): Fabrique {
  const mesures: Mesure[] = [];
  const items: Item[] = [];

  return {
    mesures,
    items,
    socle: (numero, type, mesure_id) => ({
      id: identifiant("ITEM", numero),
      version: 1,
      type,
      candidat_id: CANDIDATS[numero % CANDIDATS.length] as string,
      mesure_id,
      mesure_version: 1,
      statut_validation: "en_attente",
      statut_contestation: "aucune",
      valide_du: "2026-09-01",
      valide_au: null,
      validations: [],
      contestations: [],
      historique: [{ date: DATE, changement: "création", commit: COMMIT, version_resultante: 1 }],
    }),
    // L'empreinte est calculée par la fonction de production : une fixture dont l'empreinte
    // serait écrite à la main mentirait au premier changement de contenu.
    ajouter(partiel) {
      const provisoire: Item = { ...partiel, empreinte: "0".repeat(64) };
      items.push({ ...provisoire, empreinte: empreinteContenuNotant(provisoire) });
    },
    ajouterMesure(indice, parametres) {
      const identifiantMesure = identifiant("MESURE", indice);
      mesures.push(mesure(indice, { ...parametres, id: identifiantMesure }));
      return identifiantMesure;
    },
  };
}

const CITATIONS_P = [
  "Nous ramenerons la TVA sur les produits energetiques de 20 % a 5,5 %",
  "Le gel des tarifs reglementes sera prolonge de deux ans.",
  "Nous retablirons le depart a la retraite a 60 ans pour toutes et tous",
  "Les regimes speciaux existants seront maintenus en l'etat.",
];

const THEMES_P = ["fiscalite_pouvoir_achat", "fiscalite_pouvoir_achat", "retraites", "retraites"];

/** Quatre items P, tous sourcés sur le PDF, dont un portant une quantification. */
function ajouterItemsP(atelier: Fabrique, archives: Archives, depart: number): number {
  let indice = depart;
  CITATIONS_P.forEach((citation, rang) => {
    indice += 1;
    const mesure_id = atelier.ajouterMesure(indice, {
      libelle: `Mesure P${rang + 1} (démonstration)`,
      theme: THEMES_P[rang] as string,
      formulation_canonique: citation.toLowerCase().slice(0, 60),
    });
    atelier.ajouter({
      ...atelier.socle(indice, "P", mesure_id),
      assertion: {
        position: rang === 3 ? "contre" : "pour",
        paraphrase: `Paraphrase de démonstration n° ${rang + 1}.`,
        citation_verbatim: citation,
        ...(rang === 0 ? { quantification: QUANTIFICATION_DEMO } : {}),
        source: source(archives.pdf, { page: rang < 2 ? 2 : 3 }),
        test_verbatim: testVerbatim(citation, TEXTE_PDF),
      },
    });
  });
  return indice;
}

const QUANTIFICATION_DEMO = {
  dimensions: [{ type: "taux", valeur: 5.5, unite: "%", operateur: "exact" }],
};

/** Deux items A, sur la page web archivée, avec leur corpus examiné. */
function ajouterItemsA(atelier: Fabrique, archives: Archives, depart: number): number {
  let indice = depart;
  const libelles = [
    { libelle: "la gratuité totale des soins dentaires", theme: "sante" },
    { libelle: "la fin des notes au collège", theme: "education" },
  ];
  libelles.forEach((description, rang) => {
    indice += 1;
    const mesure_id = atelier.ajouterMesure(indice, {
      libelle: `Mesure absente A${rang + 1} (démonstration)`,
      theme: description.theme,
      formulation_canonique: description.libelle,
    });
    atelier.ajouter({
      ...atelier.socle(indice, "A", mesure_id),
      absence: {
        source_couverture_theme: source(archives.page, {
          type_document: "site_officiel",
          format: "html",
          url: "https://demonstration.invalid/plateforme",
        }),
        corpus_examine: [
          { url: "https://demonstration.invalid/plateforme", sha256: archives.page.sha256, tier: "T1" },
          { url: "https://demonstration.invalid/programme.pdf", sha256: archives.pdf.sha256, tier: "T1" },
        ],
        date_examen: DATE,
        reverifications: [],
      },
    });
  });
  return indice;
}

const CITATION_ANTERIEURE = "Nous retablirons le depart a la retraite a 60 ans pour toutes et tous";
const CITATION_POSTERIEURE = "La position a change : ce sera 62 ans, et non plus 60.";

/** Deux items O : état antérieur au PDF, état postérieur à la vidéo, comme l'exige le §4. */
function ajouterItemsO(atelier: Fabrique, archives: Archives, depart: number): number {
  let indice = depart;
  for (let rang = 0; rang < 2; rang += 1) {
    indice += 1;
    const mesure_id = atelier.ajouterMesure(indice, {
      libelle: `Mesure modifiée O${rang + 1} (démonstration)`,
      theme: "retraites",
      formulation_canonique: "l'âge légal de départ à la retraite",
    });
    atelier.ajouter({
      ...atelier.socle(indice, "O", mesure_id),
      obsolescence: {
        date_changement: "2026-11-03",
        etat_anterieur: {
          position: "pour",
          paraphrase: "Rétablir le départ à 60 ans sans condition.",
          citation_verbatim: CITATION_ANTERIEURE,
          source: source(archives.pdf, { page: 3 }),
          test_verbatim: testVerbatim(CITATION_ANTERIEURE, TEXTE_PDF),
        },
        etat_posterieur: {
          position: "conditionnel",
          paraphrase: "Départ à 62 ans, sauf carrières longues.",
          citation_verbatim: CITATION_POSTERIEURE,
          source: source(archives.video, {
            tier: "T2",
            type_document: "enregistrement_video",
            format: "video",
            url: "https://demonstration.invalid/declaration",
            extrait: { debut: "00:00:08", fin: "00:00:14" },
            // Conformité n° 12 : plus d'attestation d'écoute en staging. Le pipeline n'écoute
            // rien ; les deux annotateurs répondent à la question d'écoute, et `pnpm promote`
            // écrit l'attestation. Le schéma d'item l'interdit désormais sur un item en attente.
          }),
          test_verbatim: testVerbatim(CITATION_POSTERIEURE, TEXTE_VIDEO),
        },
        remplace_item_id: null,
      },
    });
  }
  return indice;
}

const MESURES_FICTIVES = [
  {
    theme: "ecologie_energie",
    formulation: "un péage urbain national sur le modèle de Stockholm",
    origine: "Mesure existante en Suède, proposée par aucun candidat du périmètre.",
  },
  {
    theme: "travail_emploi",
    formulation: "une semaine de quatre jours obligatoire dans le secteur public",
    origine: "Mesure proposée lors d'une élection précédente par un parti hors périmètre.",
  },
];

/** Deux items F : leur substance est dans la mesure fictive et sa vérification. */
function ajouterItemsF(atelier: Fabrique, depart: number): number {
  let indice = depart;
  MESURES_FICTIVES.forEach((description, rang) => {
    indice += 1;
    const mesure_id = atelier.ajouterMesure(indice, {
      libelle: `Mesure fictive F${rang + 1} (démonstration)`,
      theme: description.theme,
      formulation_canonique: description.formulation,
      fictive: true,
      origine_fictive: description.origine,
      verification_fictivite: {
        date: DATE,
        corpus_verifies: CANDIDATS,
        operateur: "a1",
        resultat: "aucune_occurrence",
      },
    });
    atelier.ajouter({ ...atelier.socle(indice, "F", mesure_id), redige_par: "a1" });
  });
  return indice;
}

function construireItems(archives: Archives): Plan {
  const atelier = fabrique();
  let indice = 0;
  indice = ajouterItemsP(atelier, archives, indice);
  indice = ajouterItemsA(atelier, archives, indice);
  indice = ajouterItemsO(atelier, archives, indice);
  ajouterItemsF(atelier, indice);
  return { items: atelier.items, mesures: atelier.mesures };
}

/* ------------------------------------------------------------------ écriture */

function ecrireStaging(plan: Plan): void {
  mkdirSync(join(STAGING, "items"), { recursive: true });
  mkdirSync(join(STAGING, "mesures"), { recursive: true });
  for (const item of plan.items) {
    writeFileSync(join(STAGING, "items", `${item.id}.json`), `${JSON.stringify(item, null, 2)}\n`, "utf8");
  }
  for (const mesureItem of plan.mesures) {
    writeFileSync(
      join(STAGING, "mesures", `${mesureItem.id}.json`),
      `${JSON.stringify(mesureItem, null, 2)}\n`,
      "utf8",
    );
  }
}

function ecrireLots(plan: Plan): void {
  rmSync(LOTS, { recursive: true, force: true });
  const references: ItemDuLot[] = plan.items.map((item) => ({
    item_id: item.id,
    item_version: item.version,
    item_empreinte: item.empreinte,
    candidat_id: item.candidat_id,
  }));
  const paquets = composerLots(references, 5, "graine-demonstration").lots;
  const natures: readonly Lot["nature"][] = ["entrainement", "reel"];

  paquets.forEach((items, index) => {
    const nature = natures[Math.min(index, natures.length - 1)] as Lot["nature"];
    ecrireLot(LOTS, {
      lot_id: `${nature === "entrainement" ? "ent" : "lot"}-${String(index + 1).padStart(3, "0")}`,
      nature,
      graine_maitresse: "graine-demonstration",
      algorithme_ordre: "ordre-annotateur-v1",
      // Date figée, et non l'heure courante : un jeu de démonstration qui change à chaque
      // exécution produit un diff Git pour rien, et fait douter qu'il soit reproductible.
      date_creation: DATE,
      annotateurs: ["a1", "a2"],
      items,
    });
  });
}

function principal(): void {
  rmSync(STAGING, { recursive: true, force: true });
  const archives = ecrireArchives();
  const plan = construireItems(archives);
  ecrireStaging(plan);
  ecrireLots(plan);
  process.stdout.write(
    `Jeu de démonstration écrit :\n` +
      `  ${plan.items.length} items (P, A, O, F) et ${plan.mesures.length} mesures dans ${STAGING}\n` +
      `  3 archives (PDF, page web, vidéo) dans ${ARCHIVES}\n` +
      `  lots dans ${LOTS}\n\n` +
      `Lancer :  ANNOTATEUR_ID=a1 BANC_DEMO=1 pnpm validate\n`,
  );
}

principal();
