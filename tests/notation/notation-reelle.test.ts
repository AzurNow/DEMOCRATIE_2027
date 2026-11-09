/**
 * Les juges réels d'un run gelé (`pipeline/notation/juges-reels.ts`) et la commande `pnpm
 * notation:reelle` (`pipeline/notation/notation-reelle.ts`), sur des doubles de transport
 * seulement : aucun test ne touche le réseau (`doubles-juges-reels.ts:interdireLeReseau`).
 *
 * Cas limites nommés : déclaration qui ne couvre pas les juges du run ; `version_prompt` illisible ;
 * prompt introuvable ; clé d'API absente ; réglages non déclarés (production) ; gel simulé ; test des
 * liens absent ; nombre de répertoires de run. De bout en bout, la chaîne avec des juges réels doublés
 * qui rendent la sortie du juge simulé donne le même bilan que la chaîne simulée.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dispositionRunNote, type RunLu } from "../../analysis/lecture-run.ts";
import { AccesApiRefuse } from "../../pipeline/notation/appel-juge.ts";
import type { NomEditeur } from "../../pipeline/extraction/editeur.ts";
import { VARIABLES_CLES } from "../../pipeline/extraction/commande.ts";
import { RefusDePartir } from "../../pipeline/reformulation/commande.ts";
import { transportFetch, type Envoi } from "../../pipeline/reformulation/transport-fetch.ts";
import { bilanNotation, type BilanNotation } from "../../pipeline/notation/bilan-notation.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import { construireCharge, type ChargeJuge, type PromptDeJuge } from "../../pipeline/notation/charge-juge.ts";
import { noterRun } from "../../pipeline/notation/chaine.ts";
import { nomResultat, REPERTOIRE_EXTRACTIONS, REPERTOIRE_PAGES, repertoireLiens, repertoirePages } from "../../pipeline/notation/fournisseur-fichiers.ts";
import type { ExistenceEtablie } from "../../pipeline/notation/vue-annotateur.ts";
import { JugeDefaillant, type Juge, type SortieJuge } from "../../pipeline/notation/juge.ts";
import { JugesReelsRefuses, jugesReelsDuRun, type DeclarationAppelJuge, type JugeDeclareAuRun, type MoyensDesJuges } from "../../pipeline/notation/juges-reels.ts";
import { archiveAppelsJuge, repertoireAppelsJuges } from "../../pipeline/notation/archive-appels-juge.ts";
import { declarationsNonDeclarees, notationReelle, ReglagesDesJugesNonDeclares, type DependancesNotationReelle } from "../../pipeline/notation/notation-reelle.ts";
import { environnementSimule, preparerNotationSimulee, type RunSimulePrepare } from "../../pipeline/notation/notation-simulee.ts";
import { lireSourcePromptJuge, rendrePromptJuge } from "../../pipeline/notation/rendu-prompt-juge.ts";
import { estUnRefusAttendu } from "../../outils/refus-attendu.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { attenteDeTest, CLE_DE_TEST, DELAI_ABANDON_MS, enveloppeAnthropic, enveloppeMistral, envoiDouble, http, interdireLeReseau, json } from "./doubles-juges-reels.ts";
import { ALIAS_CANDIDATS_TEST, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";
import { ITEM_P } from "./run-fictif.ts";
import { nettoyerSorties, nouvelleSortie, options, parametresDeReference } from "./simulation.ts";

interdireLeReseau();
afterEach(nettoyerSorties);

const VERSION_PROMPT = "prompts/judge-1.0.0@1.0.0";
const PROMPT: PromptDeJuge = { chemin: "prompts/judge-1.0.0", version: "1.0.0" };
const SOURCE = lireSourcePromptJuge(join(RACINE_PROJET, "prompts", "judge-1.0.0.md"));
const EXEMPLE = JSON.parse(readFileSync(join(RACINE_PROJET, "schema/exemples/reponse/valide-01-api-obtenue.json"), "utf8")) as ReponseObtenue;
const ENDPOINT_ANTHROPIC ="https://api.anthropic.com/v1/messages";
const ENDPOINT_MISTRAL = "https://api.mistral.ai/v1/chat/completions";
const TENTATIVES = { tentatives_max: 2, attentes_avant_reprise_ms: [1_000] };

/** Des déclarations de test : aucune valeur de production n'est supposée (§7.57). */
function declarations(juge_a: string, juge_b: string): readonly DeclarationAppelJuge[] {
  return [
    { juge_id: juge_a, appel: { editeur: "anthropic", reglages: { max_tokens: 4_096, effort: "high", delai_abandon_ms: DELAI_ABANDON_MS }, tentatives: TENTATIVES } },
    { juge_id: juge_b, appel: { editeur: "mistral", reglages: { temperature: 0, max_tokens: 4_096, random_seed: 7, delai_abandon_ms: DELAI_ABANDON_MS }, tentatives: TENTATIVES } },
  ];
}

const JUGES_DU_RUN: readonly JugeDeclareAuRun[] = [
  { juge_id: "juge-a", famille_modele: "famille-a", modele: "modele-a", version_prompt: VERSION_PROMPT },
  { juge_id: "juge-b", famille_modele: "famille-b", modele: "modele-b", version_prompt: VERSION_PROMPT },
];

/** Une charge ordinaire, construite comme la chaîne la construit, sur le vrai prompt. */
function chargeDeTest(): ChargeJuge {
  const liens = ["https://source-simulee.invalid/page"];
  return construireCharge({
    reponse: { ...EXEMPLE, normalise: { ...EXEMPLE.normalise, texte: "Réponse simulée, sans contenu réel.", liens, citations: [] } },
    question: { gabarit: "Q-DIR", registre: "neutre", texte: "Question simulée, sans contenu réel." },
    references: [{ item: ITEM_P, role: "principal" }],
    date_run: GEL_DES_TESTS,
    prompt: PROMPT,
    resolu_au_gel: RESOLU_POSITION_POUR,
    pages_citees: pagesSansTexte(liens),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  });
}

function moyens(envoi: Envoi, cle: MoyensDesJuges["cle"] = () => CLE_DE_TEST): MoyensDesJuges {
  return { racine: RACINE_PROJET, cle, transport: transportFetch(envoi), attendre: attenteDeTest().attendre, archive: archiveAppelsJuge(nouvelleSortie(), () => 0) };
}

describe("juges réels d'un run gelé", () => {
  it("identité lue du run, dans son ordre ; chaque juge appelle l'API de l'éditeur déclaré, avec le modèle du run", async () => {
    const { envoi, envois } = envoiDouble([http(500, "")]);
    const juges = jugesReelsDuRun(JUGES_DU_RUN, [...declarations("juge-a", "juge-b")].reverse(), moyens(envoi));

    expect(juges.map((j) => j.identite)).toEqual(JUGES_DU_RUN.map((j) => ({ juge_id: j.juge_id, famille_modele: j.famille_modele, modele: j.modele, prompt: PROMPT })));
    for (const juge of juges) await expect(juge.noter(chargeDeTest())).rejects.toBeInstanceOf(JugeDefaillant);
    const appels = [ENDPOINT_ANTHROPIC, ENDPOINT_ANTHROPIC, ENDPOINT_MISTRAL, ENDPOINT_MISTRAL];
    expect(envois.map((e) => e.url)).toEqual(appels);
    expect(envois.map((e) => e.corps["model"])).toEqual(["modele-a", "modele-a", "modele-b", "modele-b"]);
  });

  it("une déclaration qui ne couvre pas exactement les juges du run (manquant, en trop) : JugesReelsRefuses, aucun appel", () => {
    const { envoi, envois } = envoiDouble([http(500, "")]);
    const [seule] = declarations("juge-a", "juge-b");
    expect(() => jugesReelsDuRun(JUGES_DU_RUN, seule === undefined ? [] : [seule], moyens(envoi))).toThrow(JugesReelsRefuses);
    expect(() => jugesReelsDuRun(JUGES_DU_RUN, [...declarations("juge-a", "juge-b"), ...declarations("juge-c", "juge-d")], moyens(envoi))).toThrow(JugesReelsRefuses);
    expect(() => jugesReelsDuRun(JUGES_DU_RUN, [], moyens(envoi))).toThrow(/aucun juge/);
    expect(envois).toEqual([]);
  });

  it.each(["prompts/judge-1.0.0", "prompts/judge-1.0.0@", "@1.0.0"])("version_prompt illisible (%s) : JugesReelsRefuses", (version_prompt) => {
    const juges = JUGES_DU_RUN.map((j) => ({ ...j, version_prompt }));
    expect(() => jugesReelsDuRun(juges, declarations("juge-a", "juge-b"), moyens(envoiDouble([]).envoi))).toThrow(JugesReelsRefuses);
  });

  it("prompt introuvable sous la racine : JugesReelsRefuses", () => {
    const juges = JUGES_DU_RUN.map((j) => ({ ...j, version_prompt: "prompts/judge-0.0.0@0.0.0" }));
    expect(() => jugesReelsDuRun(juges, declarations("juge-a", "juge-b"), moyens(envoiDouble([]).envoi))).toThrow(/introuvable/);
  });

  it("clé absente : le refus de la clé remonte avant la construction du premier juge", () => {
    const lues: NomEditeur[] = [];
    const cle = (editeur: NomEditeur): string => {
      lues.push(editeur);
      if (editeur === "mistral") throw new RefusDePartir(`${VARIABLES_CLES[editeur]} absente`);
      return CLE_DE_TEST;
    };
    expect(() => jugesReelsDuRun(JUGES_DU_RUN, declarations("juge-a", "juge-b"), moyens(envoiDouble([]).envoi, cle))).toThrow(RefusDePartir);
    expect(lues).toEqual(["anthropic", "mistral"]);
  });
});

/* ------------------------------------------------------------------ commande */

/** Le run de référence de `pnpm run:dry`, préparé hors de `runs/`, ses juges pointant le vrai prompt. */
async function runPrepare(options_: { readonly test_des_liens: boolean } = { test_des_liens: true }): Promise<RunSimulePrepare> {
  const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
  const chemin = join(prepare.repertoire_run, "run.json");
  const run = JSON.parse(readFileSync(chemin, "utf8")) as { juges: { version_prompt: string }[] };
  writeFileSync(chemin, `${JSON.stringify({ ...run, juges: run.juges.map((j) => ({ ...j, version_prompt: VERSION_PROMPT })) }, null, 2)}\n`, "utf8");
  if (options_.test_des_liens) poserTestDesLiens(prepare.repertoire_run);
  return prepare;
}

/**
 * `volume/liens/` : le verdict que la table simulée de référence donne à chacun de ses liens, sous la
 * forme qu'écrit `pnpm liens`. Un lien qui existe porte sa copie conservée (`pages-citees/`), sa fiche
 * d'extraction et son texte, repris de `textes_copies` : sans eux, le fichier serait refusé par
 * `schema/existence-lien.schema.json` ou le lien jugé sans texte, et le bilan ne serait plus celui de
 * la chaîne simulée.
 */
function poserTestDesLiens(repertoire_run: string): void {
  mkdirSync(repertoireLiens(repertoire_run), { recursive: true });
  const { existences, textes_copies } = parametresDeReference();
  for (const existence of existences) {
    const resultat = {
      url_citee: existence.url_citee,
      verdict_existence: existence.verdict_existence,
      date_test: existence.date_test,
      url_finale: existence.url_citee,
      code_http: existence.code_http,
      version_table: "table-liens-v3",
      tentatives: [{ numero: 1, horodatage: existence.date_test, issue: "reponse_http", code_http: existence.code_http }],
      ...(existence.verdict_existence === "existe" ? copieConserveeDe(repertoire_run, existence, textes_copies) : { wayback: { operation: "aucune" } }),
    };
    writeFileSync(join(repertoireLiens(repertoire_run), nomResultat(existence.url_citee)), `${JSON.stringify(resultat, null, 2)}
`, "utf8");
  }
}

function empreinte(texte: string): string {
  return createHash("sha256").update(texte, "utf8").digest("hex");
}

/** La page conservée d'un lien qui existe, sa fiche d'extraction et son texte ; les champs qu'ils ajoutent au résultat. */
function copieConserveeDe(repertoire_run: string, existence: ExistenceEtablie, textes: ReturnType<typeof parametresDeReference>["textes_copies"]): Record<string, unknown> {
  const sha = existence.sha256_contenu;
  const texte = textes.find((t) => t.sha256_contenu === sha);
  if (sha === undefined || texte?.issue !== "extrait") throw new Error(`table de référence : ${existence.url_citee} existe sans copie extraite (${String(sha)}).`);
  const page = "<html><body>Page simulée.</body></html>";
  mkdirSync(join(repertoirePages(repertoire_run), "textes"), { recursive: true });
  writeFileSync(join(repertoirePages(repertoire_run), `${sha}.html`), page, "utf8");
  writeFileSync(join(repertoirePages(repertoire_run), "textes", `${empreinte(texte.texte)}.txt`), texte.texte, "utf8");
  const doree = JSON.parse(readFileSync(join(RACINE_PROJET, "tests/liens/dore-textes/extraction-html.json"), "utf8")) as Record<string, unknown>;
  const fiche = { ...doree, sha256_contenu: sha, texte_sha256: empreinte(texte.texte), longueur: Array.from(texte.texte).length };
  mkdirSync(join(repertoireLiens(repertoire_run), REPERTOIRE_EXTRACTIONS), { recursive: true });
  writeFileSync(join(repertoireLiens(repertoire_run), REPERTOIRE_EXTRACTIONS, `${sha}.json`), `${JSON.stringify(fiche, null, 2)}
`, "utf8");
  const archive_url = `https://web.archive.org/web/20261204080000/${existence.url_citee}`;
  return {
    sha256_contenu: sha,
    archive_url,
    page: { chemin: `${REPERTOIRE_PAGES}/${sha}.html`, type_contenu_recu: "text/html; charset=utf-8", taille_octets: Buffer.byteLength(page, "utf8") },
    wayback: { operation: "wayback_save_page_now", issue: "reussi", archive_url },
  };
}

const ENV_COMPLET = { ANTHROPIC_API_KEY: CLE_DE_TEST, MISTRAL_API_KEY: CLE_DE_TEST };

function dependances(prepare: RunSimulePrepare, envoi: Envoi, surcharges: Partial<DependancesNotationReelle> = {}): DependancesNotationReelle {
  return {
    env: ENV_COMPLET,
    envoi,
    attendre: attenteDeTest().attendre,
    maintenant_ms: () => 0,
    maintenant: () => parametresDeReference().date_notation,
    depot: RACINE_PROJET,
    chargerReponses: () => prepare.reponses,
    declarationsDesJuges: (run: RunLu) => declarations(run.juges[0]?.juge_id as string, run.juges[1]?.juge_id as string),
    ...surcharges,
  };
}

async function refus(promesse: Promise<unknown>): Promise<Error> {
  const leve: unknown = await promesse.then(
    () => new Error("la commande aurait dû refuser de partir"),
    (erreur: unknown) => erreur,
  );
  if (leve instanceof RefusDePartir || leve instanceof JugesReelsRefuses) return leve;
  throw leve;
}

describe("pnpm notation:reelle : refus de partir", () => {
  it.each(Object.keys(ENV_COMPLET))("%s absente : RefusDePartir, avant toute lecture des réponses et tout appel", async (variable) => {
    const prepare = await runPrepare();
    const { envoi, envois } = envoiDouble([http(500, "")]);
    const chargerReponses = vi.fn(() => prepare.reponses);
    const env = { ...ENV_COMPLET, [variable]: "" };
    const leve = await refus(notationReelle([prepare.repertoire_run], dependances(prepare, envoi, { env, chargerReponses })));
    expect(leve.message).toContain(variable);
    expect(chargerReponses).not.toHaveBeenCalled();
    expect(envois).toEqual([]);
  });

  it("production : les réglages des juges ne sont déclarés nulle part (§7.57), ReglagesDesJugesNonDeclares, un refus attendu", async () => {
    const prepare = await runPrepare();
    const { envoi, envois } = envoiDouble([http(500, "")]);
    const leve = await refus(notationReelle([prepare.repertoire_run], dependances(prepare, envoi, { declarationsDesJuges: declarationsNonDeclarees })));
    expect(leve).toBeInstanceOf(ReglagesDesJugesNonDeclares);
    expect(leve.message).toContain("§7.57");
    expect(estUnRefusAttendu(leve)).toBe(true);
    expect(envois).toEqual([]);
    expect(existsSync(repertoireAppelsJuges(prepare.repertoire_run))).toBe(false);
  });

  it("gel simulé (simule: true) : refusé, il se note avec pnpm notation:dry --run", async () => {
    const prepare = await runPrepare();
    const chemin = join(prepare.repertoire_run, "run.json");
    writeFileSync(chemin, JSON.stringify({ ...(JSON.parse(readFileSync(chemin, "utf8")) as object), simule: true }), "utf8");
    const { envoi, envois } = envoiDouble([http(500, "")]);
    const leve = await refus(notationReelle([prepare.repertoire_run], dependances(prepare, envoi)));
    expect(leve.message).toContain("notation:dry");
    expect(envois).toEqual([]);
  });

  it("test des liens absent (volume/liens) : refusé, avant toute lecture des réponses", async () => {
    const prepare = await runPrepare({ test_des_liens: false });
    const chargerReponses = vi.fn(() => prepare.reponses);
    const leve = await refus(notationReelle([prepare.repertoire_run], dependances(prepare, envoiDouble([]).envoi, { chargerReponses })));
    expect(leve.message).toContain("pnpm liens");
    expect(chargerReponses).not.toHaveBeenCalled();
  });

  it("aucun répertoire de run, ou deux : RefusDePartir", async () => {
    const prepare = await runPrepare();
    await refus(notationReelle([], dependances(prepare, envoiDouble([]).envoi)));
    await refus(notationReelle([prepare.repertoire_run, prepare.repertoire_run], dependances(prepare, envoiDouble([]).envoi)));
  });
});

/* ------------------------------------------------------------------ de bout en bout */

interface Enregistrement {
  readonly sorties: Map<string, SortieJuge>;
}

function cleDeSortie(juge_id: string, contenu: string): string {
  return `${juge_id}\u0000${contenu}`;
}

/** Les juges simulés, qui consignent, pour le texte que le vrai prompt rendrait de chaque charge, la sortie rendue. */
function consignants(juges: readonly Juge[], enregistrement: Enregistrement): readonly Juge[] {
  return juges.map((juge) => ({
    identite: juge.identite,
    noter: async (charge: ChargeJuge) => {
      const sortie = await juge.noter(charge);
      enregistrement.sorties.set(cleDeSortie(juge.identite.juge_id, rendrePromptJuge(SOURCE, { ...charge, prompt: PROMPT })), sortie);
      return sortie;
    },
  }));
}

/** La chaîne simulée de référence, ses sorties consignées. */
async function chaineSimulee(): Promise<{ readonly repertoire_run: string; readonly bilan: BilanNotation; readonly enregistrement: Enregistrement }> {
  const prepare = await preparerNotationSimulee(options(nouvelleSortie()));
  const enregistrement: Enregistrement = { sorties: new Map() };
  const environnement = environnementSimule(prepare.repertoire_run, parametresDeReference());
  const resultat = await noterRun(prepare.reponses, { ...environnement, juges: consignants(environnement.juges, enregistrement) });
  return { repertoire_run: prepare.repertoire_run, bilan: bilanNotation(prepare.repertoire_run, resultat, prepare.reponses.map((r) => r.reponse.id)), enregistrement };
}

/** Les fichiers d'un dossier, triés ; aucun si le dossier n'existe pas. */
function fichiers(dossier: string): readonly string[] {
  return existsSync(dossier) ? readdirSync(dossier).sort() : [];
}

/** L'API doublée : chaque éditeur rend, dans son enveloppe, la sortie que le juge simulé de même rôle a rendue pour ce texte. */
function apiDoublee(run: { juges: readonly { juge_id: string; modele: string }[] }, enregistrement: Enregistrement, inconnus: string[]): Envoi {
  const [a, b] = run.juges;
  if (a === undefined || b === undefined) throw new Error("deux juges attendus au run de référence");
  const parEndpoint = new Map([
    [ENDPOINT_ANTHROPIC, { juge: a, enveloppe: enveloppeAnthropic }],
    [ENDPOINT_MISTRAL, { juge: b, enveloppe: enveloppeMistral }],
  ]);
  return (url, init) => {
    const [message] = (JSON.parse(init.body as string) as { messages: readonly { content: string }[] }).messages;
    const voie = parEndpoint.get(url);
    const sortie = voie === undefined || message === undefined ? undefined : enregistrement.sorties.get(cleDeSortie(voie.juge.juge_id, message.content));
    if (voie === undefined || sortie === undefined) {
      inconnus.push(`${url} : ${JSON.stringify(message).slice(0, 200)}`);
      return http(400, "texte inconnu du double")(init);
    }
    return json(200, voie.enveloppe(JSON.stringify(sortie), voie.juge.modele))(init);
  };
}

// Bout en bout : gel, chaîne et archive D100 (deux fichiers synchronisés par envoi) sur disque ;
// 4,7 à 5,8 s sous Windows, au-dessus des 5 s par défaut quand la suite tourne en parallèle.
describe("pnpm notation:reelle de bout en bout, sur l'API doublée", { timeout: 30_000 }, () => {
  it("juges réels doublés qui rendent la sortie du juge simulé : même bilan que la chaîne simulée, aucun renvoi de défaillance", async () => {
    const reference = await chaineSimulee();
    const prepare = await runPrepare();
    const run = JSON.parse(readFileSync(join(prepare.repertoire_run, "run.json"), "utf8")) as { juges: { juge_id: string; modele: string }[] };
    const inconnus: string[] = [];

    const faite = await notationReelle([prepare.repertoire_run], dependances(prepare, apiDoublee(run, reference.enregistrement, inconnus)));

    expect(inconnus).toEqual([]);
    expect(reference.enregistrement.sorties.size).toBeGreaterThan(0);
    expect(faite.bilan).toEqual(reference.bilan);
    expect(faite.bilan.verdicts).toBeGreaterThan(0);
  });

  it("D100 : chaque envoi aux juges laisse ses métadonnées et ses octets reçus sous volume/appels-juges, un couple par envoi", async () => {
    const reference = await chaineSimulee();
    const prepare = await runPrepare();
    const run = JSON.parse(readFileSync(join(prepare.repertoire_run, "run.json"), "utf8")) as { juges: { juge_id: string; modele: string }[] };
    const api = apiDoublee(run, reference.enregistrement, []);
    let envois = 0;
    const compte: Envoi = (url, init) => {
      envois += 1;
      return api(url, init);
    };

    await notationReelle([prepare.repertoire_run], dependances(prepare, compte));

    const archive = fichiers(repertoireAppelsJuges(prepare.repertoire_run));
    expect(envois).toBeGreaterThan(0);
    expect(archive.filter((nom) => nom.endsWith(".json"))).toHaveLength(envois);
    expect(archive.filter((nom) => nom.endsWith(".octets"))).toHaveLength(envois);
  });

  it.each([401, 403])("statut %i chez un juge : la notation s'arrête au premier, aucun renvoi écrit ; la relance après correction reprend sans doublon", async (statut) => {
    const reference = await chaineSimulee();
    const prepare = await runPrepare();
    const run = JSON.parse(readFileSync(join(prepare.repertoire_run, "run.json"), "utf8")) as { juges: { juge_id: string; modele: string }[] };
    const inconnus: string[] = [];
    const corrigee = apiDoublee(run, reference.enregistrement, inconnus);
    const appelsRefuses: string[] = [];
    const refusee: Envoi = (url, init) => {
      if (url !== ENDPOINT_MISTRAL) return corrigee(url, init);
      appelsRefuses.push(url);
      return json(statut, { error: { message: "clé invalide" } })(init);
    };
    const disposition = dispositionRunNote(prepare.repertoire_run);

    await expect(notationReelle([prepare.repertoire_run], dependances(prepare, refusee))).rejects.toBeInstanceOf(AccesApiRefuse);
    expect(appelsRefuses).toHaveLength(1);
    expect(fichiers(disposition.renvois)).toEqual([]);
    const ecritesAvant = fichiers(disposition.notations);
    // D100 : la réponse refusée est gardée, et la relance ne la remplace pas.
    const archive = repertoireAppelsJuges(prepare.repertoire_run);
    const refusees = fichiers(archive).filter((nom) => nom.endsWith(".json") && (JSON.parse(readFileSync(join(archive, nom), "utf8")) as { statut_http?: number }).statut_http === statut);
    expect(refusees).toHaveLength(1);
    const gardees = new Map(fichiers(archive).map((nom) => [nom, readFileSync(join(archive, nom)).toString("hex")]));

    const faite = await notationReelle([prepare.repertoire_run], dependances(prepare, corrigee));
    expect(inconnus).toEqual([]);
    expect(faite.bilan).toEqual(reference.bilan);
    const ecritesApres = fichiers(disposition.notations);
    expect(ecritesApres).toEqual(expect.arrayContaining([...ecritesAvant]));
    // Sans doublon : autant de notations et de renvois que la chaîne simulée en une seule exécution.
    expect(ecritesApres).toHaveLength(fichiers(dispositionRunNote(reference.repertoire_run).notations).length);
    expect(fichiers(disposition.renvois)).toHaveLength(fichiers(dispositionRunNote(reference.repertoire_run).renvois).length);
    for (const [nom, hex] of gardees) expect(readFileSync(join(archive, nom)).toString("hex")).toBe(hex);
    const [gardeeRefusee] = refusees;
    expect(gardeeRefusee).toMatch(/\.1\.1\.json$/u);
    expect(fichiers(archive)).toContain((gardeeRefusee as string).replace(/\.1\.1\.json$/u, ".2.1.json"));
  });
});
