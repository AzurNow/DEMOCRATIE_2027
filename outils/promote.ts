/**
 * `pnpm promote` — la seule écriture vers `data/`, et elle est manuelle.
 *
 * Par défaut la commande **simule** : elle affiche ce qu'elle ferait et n'écrit rien. L'écriture
 * réelle exige `--ecrire`, saisi par un humain, et ne démarre pas si l'arbre Git n'est pas
 * propre — le commit courant est inscrit dans l'historique de chaque item promu, et il ne
 * décrirait pas l'état du dépôt si des modifications traînaient à côté.
 *
 * La commande ne commite pas : elle imprime la commande de commit, avec la liste des
 * identifiants promus. C'est l'humain qui signe.
 *
 * Chaque item à promouvoir est confronté à `item.schema.json` **après** application des
 * corrections et **avant** toute écriture. Un seul item non conforme est nommé au rapport, avec
 * les chemins fautifs, et bloque l'écriture comme un item introuvable : code de sortie non nul,
 * rien n'est écrit dans `data/`.
 *
 * Les mesures citées par les items écrits entrent dans `data/mesures/` avec eux, un fichier par
 * mesure dans sa version courante (décision D38, option (a) ; `validation/io/data-mesures.ts`) :
 * créée si elle est absente, laissée telle quelle si elle est identique, réécrite si la version du
 * staging est supérieure. Même version et contenu différent, ou version du staging inférieure : la
 * mesure est nommée au rapport et rien n'est écrit, ni item ni mesure. Tous les contrôles passent
 * avant la première écriture. Une mesure dont le champ `empreinte` ne suit pas son contenu est
 * refusée (`empreinte_incoherente`), avec l'empreinte attendue : la promotion ne la recalcule pas.
 *
 * Décision D53 (1) : une mesure à créer ou à réécrire n'entre dans `data/mesures/` que si une
 * relecture de l'auteur couvre exactement son identifiant, sa version et l'empreinte de son contenu,
 * au registre publié en ajout seul `validation/mesures/relectures.json` (répertoire `--mesures`,
 * celui du registre des corrections de thème). Sinon, refus `sans_relecture`, et rien n'est écrit.
 * Une mesure identique à sa version publiée passe sans relecture. Le registre est lu, jamais écrit
 * ici ; un registre illisible ou une entrée malformée arrêtent la commande.
 *
 * Protocole 0.24 (§4, D59 (9)) : les sources que des rejets sous le motif « texte extrait erroné »
 * renvoient à la réextraction sont nommées au rapport, recalculées depuis les journaux ; rien n'est
 * écrit pour elles (`validation/domaine/renvoi-reextraction.ts`).
 *
 * Protocole 0.25 (§4, D60 (9b)) : les autres items validés sur un texte ainsi renvoyé
 * (`validation/domaine/renvoi-texte-errone.ts`). Un item non publié jugé jusqu'au bout par son lot
 * n'est pas promu : `--ecrire` le réécrit en `staging/` de retour en attente (version + 1, entrée
 * d'historique), avant toute écriture dans `data/`, et son lot ne le juge plus ; c'est la seule
 * écriture de la commande dans `staging/`. Un item dont le lot n'a pas fini attend la fin de son lot.
 * Un item publié n'est pas touché : il est listé à contester par l'auteur (`pnpm contester`), la
 * contestation étant un acte de l'auteur.
 *
 * Protocole 0.27 (§4, D62 #233 (3), D67) : un item A à écrire n'est pas promu tant qu'une
 * proposition de position du candidat sur son corpus examiné n'est pas rattachée à sa mesure (sa
 * mesure relue, ou l'item porté vers elle au registre des rattachements), ni quand un item T3 du
 * candidat, « à confirmer », porte sur sa mesure (`validation/domaine/absence.ts`). Le refus est
 * nommé avec son motif, et rien n'est écrit.
 *
 *   pnpm promote
 *   pnpm promote --ecrire
 */

import { analyserArguments, drapeau, texte } from "./arguments.ts";
import { existsSync } from "node:fs";
import { commandeGit, commitCourant, ecriturePermise } from "./garde-fous-git.ts";
import { ItemFictifEnDouble, verifierFictifUnique } from "../validation/domaine/fictif-unique.ts";
import { resolve } from "node:path";
import { refusPromotionAbsence, type RefusPromotionAbsence } from "../validation/domaine/absence.ts";
import { tauxNonEvaluable } from "../validation/domaine/analyse-lot.ts";
import { DecisionArbitrageRefusee } from "../validation/domaine/arbitrage.ts";
import { CorrectionMesureIncoherente } from "../validation/domaine/corrections-mesure.ts";
import { decrireEcart, ecartsDeDates } from "../validation/domaine/dates-sources.ts";
import type { LotEffectif } from "../validation/domaine/lot.ts";
import { VersionMesureEcart, type Issue } from "../validation/domaine/promotion.ts";
import { renvoisAReextraction, type RenvoisReextraction } from "../validation/domaine/renvoi-reextraction.ts";
import { decrireRejetsArbitresSansMotif, rejetsArbitresSansMotif } from "../validation/domaine/rejet-arbitre-sans-motif.ts";
import {
  jugementsDesVerdicts,
  planifierTexteErrone,
  porteUnTexteRenvoye,
  renvoyerEnAttente,
  type PlanTexteErrone,
  type RetourEnAttente,
} from "../validation/domaine/renvoi-texte-errone.ts";
import type { Item, Lot } from "../validation/domaine/types.ts";
import { lireRegistreArbitrage } from "../validation/io/arbitrage-fichier.ts";
import { cheminItem, creerItem, lireItemsData } from "../validation/io/data-items.ts";
import {
  creerMesure,
  lireMesuresData,
  planifierMesures,
  reecrireMesure,
  type PlanMesures,
} from "../validation/io/data-mesures.ts";
import { ecrireFileArbitrage } from "../validation/io/file-arbitrage.ts";
import { ajouterDues, controlerAjout, notificationDue } from "../validation/io/notifications-dues.ts";
import { etatsDuLot } from "../validation/io/lecture-croisee.ts";
import { lireLots } from "../validation/io/lots-fichier.ts";
import { lireRegistre } from "../validation/io/mesures-fichier.ts";
import { lireRattachements } from "../validation/io/rattachements-fichier.ts";
import { lireRelectures } from "../validation/io/relectures-fichier.ts";
import { chargerStaging, type Staging } from "../validation/io/staging.ts";
import { reecrireItemStaging } from "../validation/io/staging-renvoi.ts";
import { instantLocal } from "../validation/serveur/contexte.ts";
import { evaluerLots, type Introuvable, type RenvoyeDuLot, type Verdict } from "./evaluation-lots.ts";
import { erreurDeSchema } from "./schemas/valider.ts";

const OPTIONS: readonly string[] = [
  "racine",
  "ecrire",
  "staging",
  "lots",
  "decisions",
  "mesures",
  "data",
  "data-mesures",
  "arbitrage",
  "notifications",
];

interface Options {
  readonly ecrire: boolean;
  readonly racine: string;
  readonly staging: string;
  readonly lots: string;
  readonly decisions: string;
  readonly mesures: string;
  readonly data: string;
  readonly data_mesures: string;
  readonly arbitrage: string;
  readonly notifications: string;
}

/** Un item à promouvoir que ses corrections ont rendu non conforme à `item.schema.json`. */
interface NonConforme {
  readonly lot_id: string;
  readonly item_id: string;
  readonly erreur: string;
}

function lireOptions(): Options {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  // `--racine` : le dépôt dont l'arbre doit être propre et dont HEAD est inscrit (bac d'essai des tests).
  const racine = texte(table, "racine", resolve(import.meta.dirname, ".."));
  return {
    ecrire: drapeau(table, "ecrire"),
    racine,
    staging: texte(table, "staging", resolve(racine, "staging")),
    lots: texte(table, "lots", resolve(racine, "validation/lots")),
    decisions: texte(table, "decisions", resolve(racine, "validation/decisions")),
    mesures: texte(table, "mesures", resolve(racine, "validation/mesures")),
    data: texte(table, "data", resolve(racine, "data/items")),
    data_mesures: texte(table, "data-mesures", resolve(racine, "data/mesures")),
    arbitrage: texte(table, "arbitrage", resolve(racine, "validation/arbitrage")),
    notifications: texte(table, "notifications", resolve(racine, "validation/notifications")),
  };
}

/**
 * Un item déjà présent dans `data/` n'est jamais réécrit : ce qui y a changé depuis sa promotion
 * (décision du panel, correction) ne doit pas être écrasé par son état de `staging/`. Relancer
 * la promotion est donc sans effet sur lui.
 */
function dejaDansData(verdict: Verdict, options: Options): boolean {
  return existsSync(cheminItem(options.data, verdict.item.id));
}

function imprimerEcriturePrevue(promus: readonly Verdict[], options: Options): void {
  const deja = promus.filter((verdict) => dejaDansData(verdict, options));
  process.stdout.write(`\nÀ écrire par --ecrire : ${promus.length - deja.length}\n`);
  process.stdout.write(`Déjà dans data/, non réécrits : ${deja.length}\n`);
  for (const verdict of deja) process.stdout.write(`  ${verdict.item.id}  [${verdict.lot_id}]\n`);
}

function imprimerIntrouvables(introuvables: readonly Introuvable[]): void {
  if (introuvables.length === 0) return;
  process.stdout.write(`\nItems des lots introuvables dans staging : ${introuvables.length}\n`);
  for (const introuvable of introuvables) {
    process.stdout.write(`  ${introuvable.item_id}  [${introuvable.lot_id}]\n`);
  }
}

/**
 * Protocole 0.13, §4 : un item renvoyé en attente après une correction de thème n'est plus jugé par
 * son lot. Il n'est ni promu ni perdu : il est nommé ici, et rentre dans un prochain lot.
 */
function imprimerRenvoyes(renvoyes: readonly RenvoyeDuLot[]): void {
  if (renvoyes.length === 0) return;
  process.stdout.write(`\nRenvoyés en attente, que leur lot ne juge plus : ${renvoyes.length}\n`);
  for (const renvoye of renvoyes) {
    process.stdout.write(
      `  ${renvoye.item.id}  [${renvoye.lot_id}]  jugé en version ${renvoye.version_du_lot}, ` +
        `en attente en version ${renvoye.item.version} (mesure en version ${renvoye.item.mesure_version})\n`,
    );
  }
}

/**
 * §4 (protocole 0.24, D59 (9)) : un item rejeté sous le motif « texte extrait erroné » renvoie sa
 * source à la réextraction. Le renvoi se recalcule à chaque lancement depuis les journaux ; il est
 * nommé ici, n'écrit rien et ne bloque rien. Depuis le protocole 0.27, toute décision de rejet qui
 * fonde le rejet et porte le motif renvoie toutes les sources de contenu de l'item
 * (`renvoi-reextraction.ts`) : aucun rejet sous ce motif ne reste sans renvoi.
 */
function imprimerRenvoisReextraction({ sources }: RenvoisReextraction): void {
  if (sources.length === 0) return;
  process.stdout.write(`\nSources renvoyées à la réextraction (motif « texte extrait erroné ») : ${sources.length}\n`);
  for (const source of sources) {
    const texte = source.texte_sha256 === undefined ? "sans texte_sha256" : `texte ${source.texte_sha256}`;
    process.stdout.write(`  ${source.sha256}  ${texte}  ${source.url}  items : ${source.items.join(", ")}\n`);
  }
}

/** Décision D74 (7) : information seule, qui n'écrit rien et ne bloque rien. */
function imprimerRejetsArbitresSansMotif(verdicts: readonly Verdict[]): void {
  for (const ligne of decrireRejetsArbitresSansMotif(rejetsArbitresSansMotif(verdicts))) {
    process.stdout.write(`${ligne}\n`);
  }
}

/* ------------------------------------------- texte extrait erroné (protocole 0.25) */

/** Ce que les rejets sous le motif « texte extrait erroné » font aux autres items du même texte. */
interface TexteErrone {
  readonly renvois: RenvoisReextraction;
  readonly plan: PlanTexteErrone;
  /** Les items à réécrire de retour en attente : jugés jusqu'au bout, ils ne sont pas promus. */
  readonly a_renvoyer: readonly RetourEnAttente[];
}

interface EvaluationLue {
  readonly verdicts: readonly Verdict[];
  readonly effectifs: readonly LotEffectif[];
}

/**
 * Calculé sur **tous** les verdicts : le renvoi d'une source se lit dans les rejets, et ce sont les
 * verdicts qui disent quel lot juge encore chaque item.
 */
function texteErrone(evaluation: EvaluationLue, staging: Staging, data: ReadonlyMap<string, Item>): TexteErrone {
  const renvois = renvoisAReextraction(evaluation.verdicts);
  const annotateurs = new Map(evaluation.effectifs.map((effectif) => [effectif.lot.lot_id, effectif.lot.annotateurs]));
  const concernes = evaluation.verdicts.filter((verdict) => porteUnTexteRenvoye(verdict.item, renvois.sources));
  const plan = planifierTexteErrone({
    renvois: renvois.sources,
    items: [...staging.items.values()],
    publies: data,
    jugements: jugementsDesVerdicts(concernes, annotateurs),
  });
  return { renvois, plan, a_renvoyer: plan.retours.filter((retour) => retour.sort === "renvoyer") };
}

/** Les verdicts que la promotion traite : un item qui retourne en attente n'est ni promu ni arbitré. */
function sansRetours(verdicts: readonly Verdict[], texte: TexteErrone): readonly Verdict[] {
  const renvoyes = new Set(texte.a_renvoyer.map((retour) => retour.item.id));
  return verdicts.filter((verdict) => !renvoyes.has(verdict.item.id));
}

/** Un texte qui rapproche des items porte toujours son empreinte de texte (`RenvoiIdentifie`). */
function textesAffiches(textes: RetourEnAttente["textes"]): string {
  return textes.map((renvoi) => `${renvoi.sha256} texte ${renvoi.texte_sha256}`).join(", ");
}

function imprimerListeRetours(titre: string, retours: readonly RetourEnAttente[]): void {
  if (retours.length === 0) return;
  process.stdout.write(`\n${titre} : ${retours.length}\n`);
  for (const retour of retours) {
    process.stdout.write(`  ${retour.item.id}  [${retour.lot_id}]  ${textesAffiches(retour.textes)}\n`);
  }
}

function imprimerAContester(plan: PlanTexteErrone): void {
  if (plan.a_contester.length === 0) return;
  process.stdout.write(
    `\nPubliés sur un texte extrait erroné, à contester par l'auteur (pnpm contester), non modifiés ici : ${plan.a_contester.length}\n`,
  );
  for (const { item, textes } of plan.a_contester) {
    process.stdout.write(
      `  ${item.id}  ${item.statut_validation}  contestation ${item.statut_contestation}  ${textesAffiches(textes)}\n`,
    );
  }
}

function imprimerSansTexte(plan: PlanTexteErrone): void {
  if (plan.sans_texte.length === 0) return;
  process.stdout.write(`\nSources renvoyées sans empreinte de texte, aucun autre item rapproché : ${plan.sans_texte.length}\n`);
  for (const renvoi of plan.sans_texte) process.stdout.write(`  ${renvoi.sha256}  ${renvoi.url}\n`);
}

/**
 * §4 (protocole 0.25) : les items de retour en attente, ceux qui attendent la fin de leur lot, les
 * items publiés que l'auteur conteste, et les renvois dont le texte n'est pas identifié.
 */
function imprimerTexteErrone({ plan, a_renvoyer }: TexteErrone): void {
  imprimerListeRetours("De retour en attente (texte extrait erroné), réécrits dans staging/ par --ecrire", a_renvoyer);
  imprimerListeRetours(
    "Sur un texte extrait erroné, dans un lot en cours : retour en attente à la fin du lot",
    plan.retours.filter((retour) => retour.sort === "decisions_incompletes"),
  );
  imprimerAContester(plan);
  imprimerSansTexte(plan);
}

/** Réécrit en `staging/` les items de retour en attente ; rend leur trace pour le commit. */
function ecrireRetours(texte: TexteErrone, options: Options): readonly string[] {
  const trace = { commit: commitCourant(options.racine), horodatage: instantLocal(new Date()) };
  for (const retour of texte.a_renvoyer) {
    reecrireItemStaging(options.staging, retour.item, renvoyerEnAttente(retour.item, retour.textes, trace));
  }
  return texte.a_renvoyer.map((retour) => `retour en attente ${retour.item.id}`);
}

function cheminsACommiter(retours: readonly string[]): readonly string[] {
  const promotion = ["data/items", "data/mesures", "validation/notifications/dues.jsonl"];
  return retours.length === 0 ? promotion : [...promotion, "staging/items"];
}

function cheminDansData(item: Item, options: Options): string {
  return cheminItem(options.data, item.id);
}

/** Les items que `--ecrire` écrirait, confrontés au schéma dans l'état exact où ils le seraient. */
function nonConformes(verdicts: readonly Verdict[], options: Options): readonly NonConforme[] {
  const trouves: NonConforme[] = [];
  for (const verdict of verdicts) {
    if (verdict.issue.sort !== "promouvoir" || dejaDansData(verdict, options)) continue;
    const item = verdict.issue.item;
    const erreur = erreurDeSchema("item", item, cheminDansData(item, options));
    if (erreur !== null) trouves.push({ lot_id: verdict.lot_id, item_id: item.id, erreur: erreur.message });
  }
  return trouves;
}

/**
 * Frontière d'entrée : les items déjà dans `data/`, chacun confronté à `item.schema.json`. Un
 * répertoire absent est un `data/` vide ; un fichier non conforme arrête la commande.
 */
function itemsDeData(options: Options): readonly Item[] {
  return [...lireItemsData(options.data).values()];
}

/**
 * §5 (protocole 0.9) : « Une mesure fictive porte un seul item fictif. » Les items que `--ecrire`
 * écrirait, ajoutés à ceux de `data/`, ne donnent à aucune mesure fictive un second item F vérifié ;
 * sinon `ItemFictifEnDouble` arrête la commande, en simulation comme à l'écriture.
 */
function controlerFictifUnique(verdicts: readonly Verdict[], options: Options): void {
  verifierFictifUnique(itemsAEcrire(verdicts, options), itemsDeData(options));
}

/** Les items que `--ecrire` écrirait, dans l'état exact où ils le seraient. */
function itemsAEcrire(verdicts: readonly Verdict[], options: Options): readonly Item[] {
  return verdicts
    .filter((verdict) => verdict.issue.sort === "promouvoir" && !dejaDansData(verdict, options))
    .map((verdict) => (verdict.issue as Extract<Issue, { sort: "promouvoir" }>).item);
}

/**
 * Les mesures citées par les items à écrire, face à `data/mesures/` (frontière d'entrée : chaque
 * fichier y est confronté à `mesure.schema.json`). Rien n'est écrit ici.
 */
function planDesMesures(verdicts: readonly Verdict[], staging: Staging, options: Options): PlanMesures {
  const publiees = lireMesuresData(options.data_mesures);
  // Décision D53 (1) : registre des relectures de l'auteur, lu à côté de celui des corrections de
  // thème (`--mesures`). Absent : registre vide. Illisible ou malformé : la commande s'arrête.
  const relectures = lireRelectures(options.mesures);
  return planifierMesures(itemsAEcrire(verdicts, options), staging.mesures, publiees, options.data_mesures, relectures);
}

function imprimerPlanMesures(plan: PlanMesures): void {
  process.stdout.write(`\nMesures à créer : ${plan.creer.length}\n`);
  for (const mesure of plan.creer) process.stdout.write(`  ${mesure.id}  version ${mesure.version}\n`);
  process.stdout.write(`Mesures à réécrire : ${plan.reecrire.length}\n`);
  for (const { lu, apres } of plan.reecrire) {
    process.stdout.write(`  ${apres.id}  version ${lu.mesure.version} → ${apres.version}\n`);
  }
  process.stdout.write(`Mesures déjà dans data/, identiques : ${plan.identiques.length}\n`);
  if (plan.refus.length === 0) return;
  process.stdout.write(`\nMesures qui ne peuvent pas entrer dans data/mesures/ : ${plan.refus.length}\n`);
  for (const refus of plan.refus) {
    process.stdout.write(`  ${refus.mesure_id}  ${refus.motif}\n${refus.detail.replace(/^/gm, "    ")}\n`);
  }
}

/**
 * §4 (conformité n° 17) : les items que `--ecrire` écrirait, corrections comprises, dont une date de
 * validité ne suit pas la date de sa source sans motif écrit. JSON Schema ne compare pas deux
 * champs : le contrôle est `ecartsDeDates`, et un seul écart bloque l'écriture.
 */
function datesIncoherentes(verdicts: readonly Verdict[], options: Options): readonly NonConforme[] {
  const trouves: NonConforme[] = [];
  for (const verdict of verdicts) {
    if (verdict.issue.sort !== "promouvoir" || dejaDansData(verdict, options)) continue;
    const item = verdict.issue.item;
    for (const ecart of ecartsDeDates(item)) {
      trouves.push({ lot_id: verdict.lot_id, item_id: item.id, erreur: decrireEcart(item.id, ecart) });
    }
  }
  return trouves;
}

/** Un item A à promouvoir que la règle du §4 (protocole 0.27) refuse, avec ses motifs. */
interface AbsenceRefusee {
  readonly lot_id: string;
  readonly item_id: string;
  readonly refus: readonly RefusPromotionAbsence[];
}

/**
 * §4 (protocole 0.27, D62 #233 (3), D67) : les items A que `--ecrire` écrirait, confrontés aux
 * items connus (`staging/` et `data/`, celui de `data/` l'emportant) et aux registres des relectures
 * et des rattachements, lus ici et jamais écrits. Un registre illisible arrête la commande.
 */
function absencesRefusees(verdicts: readonly Verdict[], staging: Staging, data: ReadonlyMap<string, Item>, options: Options): readonly AbsenceRefusee[] {
  const items = [...new Map([...staging.items, ...data]).values()];
  const relectures = lireRelectures(options.mesures);
  const rattachements = lireRattachements(options.mesures);
  return verdicts.flatMap((verdict) => {
    if (verdict.issue.sort !== "promouvoir" || verdict.issue.item.type !== "A" || dejaDansData(verdict, options)) return [];
    const refus = refusPromotionAbsence({ item: verdict.issue.item, items, relectures, rattachements });
    return refus.length === 0 ? [] : [{ lot_id: verdict.lot_id, item_id: verdict.item.id, refus }];
  });
}

function decrireRefusAbsence(refus: RefusPromotionAbsence): string {
  return refus.motif === "corpus_vide" ? refus.motif : `${refus.motif} : ${refus.items.join(", ")}`;
}

function imprimerAbsencesRefusees(liste: readonly AbsenceRefusee[]): void {
  if (liste.length === 0) return;
  process.stdout.write(`\nItems A à promouvoir que la règle d'absence refuse (§4) : ${liste.length}\n`);
  for (const absence of liste) {
    for (const refus of absence.refus) {
      process.stdout.write(`  ${absence.item_id}  [${absence.lot_id}]  ${decrireRefusAbsence(refus)}\n`);
    }
  }
}

function imprimerDatesIncoherentes(liste: readonly NonConforme[]): void {
  if (liste.length === 0) return;
  const items = new Set(liste.map((ecart) => ecart.item_id));
  process.stdout.write(`\nItems à promouvoir dont les dates ne suivent pas leurs sources : ${items.size}\n`);
  for (const ecart of liste) process.stdout.write(`  ${ecart.erreur}  [${ecart.lot_id}]\n`);
}

function imprimerNonConformes(liste: readonly NonConforme[]): void {
  if (liste.length === 0) return;
  process.stdout.write(`\nItems à promouvoir non conformes au schéma : ${liste.length}\n`);
  for (const nonConforme of liste) {
    process.stdout.write(`  ${nonConforme.item_id}  [${nonConforme.lot_id}]\n`);
    process.stdout.write(`${nonConforme.erreur.replace(/^/gm, "    ")}\n`);
  }
}

function imprimerRapport(
  verdicts: readonly Verdict[],
  effectifs: readonly LotEffectif[],
  options: Options,
): void {
  const promus = verdicts.filter((verdict) => verdict.issue.sort === "promouvoir");
  const arbitrages = verdicts.filter((verdict) => verdict.issue.sort === "arbitrage");
  const attentes = verdicts.filter((verdict) => verdict.issue.sort === "attente");

  process.stdout.write(`\nÀ promouvoir : ${promus.length}\n`);
  for (const verdict of promus) {
    const issue = verdict.issue as Extract<Issue, { sort: "promouvoir" }>;
    const correction = issue.corrections_appliquees ? ", corrections appliquées" : "";
    process.stdout.write(`  ${verdict.item.id}  ${issue.statut}${correction}  [${verdict.lot_id}]\n`);
  }

  process.stdout.write(`\nVers l'arbitrage : ${arbitrages.length}\n`);
  for (const verdict of arbitrages) {
    const issue = verdict.issue as Extract<Issue, { sort: "arbitrage" }>;
    process.stdout.write(`  ${verdict.item.id}  ${issue.motif}${motifDuRefus(issue)}  [${verdict.lot_id}]\n`);
    imprimerDecisionInapplicable(issue);
  }

  process.stdout.write(`\nEn attente : ${attentes.length}\n`);
  const parMotif = new Map<string, number>();
  for (const verdict of attentes) {
    const motif = (verdict.issue as Extract<Issue, { sort: "attente" }>).motif;
    parMotif.set(motif, (parMotif.get(motif) ?? 0) + 1);
  }
  for (const [motif, nombre] of [...parMotif].sort()) {
    process.stdout.write(`  ${motif} : ${nombre}\n`);
  }

  imprimerEcriturePrevue(promus, options);
  imprimerDemandesDeCorrection(attentes);
  imprimerSupersessions(effectifs);
  imprimerNonEvaluables(
    effectifs.map((effectif) => effectif.lot),
    options,
  );
}

/** Une décision d'arbitrage qui vise l'item sans s'y appliquer : l'item reste en arbitrage, et on dit pourquoi. */
function imprimerDecisionInapplicable(issue: Extract<Issue, { sort: "arbitrage" }>): void {
  if (issue.decision_inapplicable === undefined) return;
  process.stdout.write(`    décision d'arbitrage ${issue.decision_inapplicable.decision_id} inapplicable :\n`);
  for (const motif of issue.decision_inapplicable.motifs) process.stdout.write(`      ${motif}\n`);
}

/** §4 : « Une demande refusée envoie l'item en arbitrage, avec le motif du refus. » */
function motifDuRefus(issue: Extract<Issue, { sort: "arbitrage" }>): string {
  if (issue.motif_refus === undefined) return "";
  return ` — ${issue.motif_refus}`;
}

/**
 * §4 : les demandes de correction de thème sans décision sont rapportées avec leur ancienneté,
 * **à part** du reste. L'écoulement du temps ne vaut jamais refus : l'âge est publié pour que
 * l'auteur tranche, jamais comparé à un délai au terme duquel la demande expirerait.
 */
function imprimerDemandesDeCorrection(attentes: readonly Verdict[]): void {
  const demandes = attentes.filter(
    (verdict) => (verdict.issue as Extract<Issue, { sort: "attente" }>).demande !== undefined,
  );
  process.stdout.write(`\nCorrections de mesure sans décision au registre : ${demandes.length}\n`);
  for (const verdict of demandes) {
    const issue = verdict.issue as Extract<Issue, { sort: "attente" }>;
    const demande = issue.demande as NonNullable<typeof issue.demande>;
    process.stdout.write(
      `  ${verdict.item.id}  mesure ${demande.mesure_id}  ${demande.chemin} → ` +
        `${demande.valeur_demandee}  ${demande.anciennete_jours} jour(s)  [${verdict.lot_id}]\n`,
    );
  }
}

/**
 * Le lot supersédé reste publié et son kappa reste calculé : il ne compte simplement plus pour
 * le §12. La distinction est portée par la donnée `supersede_par`, pas par un tri à l'affichage.
 */
function imprimerSupersessions(effectifs: readonly LotEffectif[]): void {
  const supersedes = effectifs.filter((effectif) => effectif.supersede_par !== null);
  if (supersedes.length === 0) return;
  process.stdout.write("\nSupersession (§4) :\n");
  for (const effectif of supersedes) {
    process.stdout.write(
      `  ${effectif.lot.lot_id} supersédé par ${effectif.supersede_par} — ` +
        `${effectif.items.length} item(s) encore jugés par lui\n`,
    );
  }
}

/**
 * §4, garde-fou : le taux de « non évaluable » par annotateur est publié par lot. Il apparaît
 * ici, dans le rapport lu par l'auteur, et **jamais** dans l'interface — un annotateur qui
 * verrait le taux de l'autre ne serait plus à l'aveugle.
 */
function imprimerNonEvaluables(lots: readonly Lot[], options: Options): void {
  process.stdout.write("\nTaux de « non évaluable » par annotateur et par lot :\n");
  for (const lot of lots) {
    const etats = etatsDuLot(options.decisions, lot);
    const parts = [...etats]
      .map(([annotateur, etat]) => {
        const taux = tauxNonEvaluable(etat, lot);
        return `${annotateur} ${taux === null ? "—" : `${(taux * 100).toFixed(1)} %`}`;
      })
      .join("   ");
    process.stdout.write(`  ${lot.lot_id} : ${parts}\n`);
  }
}

/** Les mesures avant les items : un item publié ne cite jamais une mesure absente de `data/`. */
function ecrireMesures(plan: PlanMesures, options: Options): readonly string[] {
  for (const mesure of plan.creer) creerMesure(options.data_mesures, mesure);
  for (const { lu, apres } of plan.reecrire) reecrireMesure(options.data_mesures, lu, apres);
  return [
    ...plan.creer.map((mesure) => `mesure ${mesure.id} version ${mesure.version}, créée`),
    ...plan.reecrire.map(({ lu, apres }) => `mesure ${apres.id} version ${lu.mesure.version} → ${apres.version}, réécrite`),
  ];
}

function ecrire(verdicts: readonly Verdict[], plan: PlanMesures, texte: TexteErrone, options: Options): void {
  const promus: string[] = [];
  // §4 (0.10) : tout ce qui est publié est notifié, rejeté et non évaluable compris. Toutes les
  // notifications sont préparées et la file contrôlée avant le premier item écrit : une file
  // illisible arrête la commande quand rien n'est encore publié.
  const aPromouvoir = verdicts.flatMap((verdict) =>
    verdict.issue.sort === "promouvoir" && !dejaDansData(verdict, options) ? [{ item: verdict.issue.item, due: notificationDue(verdict.issue.item, "creation") }] : [],
  );
  controlerAjout(options.notifications, aPromouvoir.map(({ due }) => due));
  // §4 (protocole 0.25) : les retours en attente, avant la première écriture dans `data/`.
  const retours = ecrireRetours(texte, options);
  const mesures = ecrireMesures(plan, options);
  for (const { item, due } of aPromouvoir) {
    // Seule écriture vers `data/items/` : `creerItem` revalide contre le schéma, quel que soit le
    // chemin qui y mène, et refuse d'écraser un item déjà publié.
    creerItem(options.data, item);
    ajouterDues(options.notifications, [due]);
    promus.push(item.id);
  }

  const file = verdicts
    .filter((verdict) => verdict.issue.sort === "arbitrage")
    .map((verdict) => ({
      item_id: verdict.item.id,
      lot_id: verdict.lot_id,
      motif: (verdict.issue as Extract<Issue, { sort: "arbitrage" }>).motif,
    }));
  ecrireFileArbitrage(options.arbitrage, instantLocal(new Date()), file);

  process.stdout.write(
    `\n${promus.length} item(s) écrit(s) dans ${options.data}\n` +
      `${retours.length} item(s) de retour en attente dans ${options.staging}\n` +
      `${plan.creer.length} mesure(s) créée(s), ${plan.reecrire.length} réécrite(s) dans ${options.data_mesures}\n` +
      `${file.length} entrée(s) dans la file d'arbitrage.\n\n` +
      commandeGit(cheminsACommiter(retours), `data: promotion de ${promus.length} item(s)`, [...promus, ...mesures, ...retours]),
  );
}

function principal(): void {
  const options = lireOptions();
  if (options.ecrire && !ecriturePermise(options.racine)) return;

  // Les registres sont **lus**, jamais écrits ici : `pnpm mesures --ecrire` et `pnpm arbitrer
  // --ecrire` y ajoutent les décisions ; le registre des relectures est lu par `planDesMesures`.
  const staging = chargerStaging(options.staging);
  const data = lireItemsData(options.data);
  const evaluation = evaluerLots({
    staging,
    data,
    lots: lireLots(options.lots),
    repertoire_decisions: options.decisions,
    registre_mesures: lireRegistre(options.mesures),
    registre_arbitrage: lireRegistreArbitrage(options.arbitrage),
    commit: commitCourant(options.racine),
    horodatage: instantLocal(new Date()),
  });
  const { effectifs, introuvables, renvoyes } = evaluation;
  // §4 (protocole 0.25) : un item dont la validation ne tient plus n'est ni promu ni arbitré.
  const texte = texteErrone(evaluation, staging, data);
  const verdicts = sansRetours(evaluation.verdicts, texte);

  const fautifs = nonConformes(verdicts, options);
  const dates = datesIncoherentes(verdicts, options);
  const plan = planDesMesures(verdicts, staging, options);
  const absences = absencesRefusees(verdicts, staging, data, options);

  imprimerRapport(verdicts, effectifs, options);
  imprimerIntrouvables(introuvables);
  imprimerRenvoyes(renvoyes);
  imprimerRenvoisReextraction(texte.renvois);
  imprimerRejetsArbitresSansMotif(verdicts);
  imprimerTexteErrone(texte);
  imprimerNonConformes(fautifs);
  imprimerDatesIncoherentes(dates);
  imprimerAbsencesRefusees(absences);
  imprimerPlanMesures(plan);
  controlerFictifUnique(verdicts, options);

  if (introuvables.length > 0) {
    process.stderr.write(
      "\nDes items jugés sont introuvables dans staging/ : rien n'est écrit tant qu'ils ne sont pas\n" +
        "retrouvés ou retirés de leur lot.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (fautifs.length > 0) {
    process.stderr.write(
      "\nDes items à promouvoir ne sont pas conformes à schema/item.schema.json : rien n'est écrit\n" +
        "dans data/ tant que leurs corrections ne sont pas reprises.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (dates.length > 0) {
    process.stderr.write(
      "\nDes items à promouvoir ont une date de validité qui ne suit pas leur source (§4) : rien n'est\n" +
        "écrit dans data/ tant que la date n'est pas celle de la source ou que son motif n'est pas écrit.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (absences.length > 0) {
    process.stderr.write(
      "\nDes items A à promouvoir ont une proposition du candidat non rattachée à sa mesure ou un item\n" +
        "T3 sur leur mesure (§4, voir ci-dessus) : rien n'est écrit dans data/.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (plan.refus.length > 0) {
    process.stderr.write(
      "\nDes mesures citées par les items à promouvoir ne peuvent pas entrer dans data/mesures/ (voir\n" +
        "ci-dessus) : rien n'est écrit, ni item ni mesure.\n",
    );
    process.exitCode = 1;
    return;
  }
  if (!options.ecrire) {
    process.stdout.write("\nSimulation : rien n'a été écrit. Ajouter --ecrire pour écrire dans data/.\n");
    return;
  }
  ecrire(verdicts, plan, texte, options);
}

try {
  principal();
} catch (erreur) {
  // §4 : « une acceptation enregistrée sans mesure modifiée est une erreur bloquante ». Elle
  // arrête la commande plutôt que de promouvoir un item validé contre un thème inexistant.
  // §5 (protocole 0.9) : un second item F vérifié sur une mesure fictive déjà portée, de même.
  // Conformité n° 69 : un item vérifié qui épinglerait une version dépassée de sa mesure, de même.
  const attendues = [CorrectionMesureIncoherente, ItemFictifEnDouble, DecisionArbitrageRefusee, VersionMesureEcart];
  if (!attendues.some((classe) => erreur instanceof classe)) throw erreur;
  process.stderr.write(`\n${(erreur as Error).message}\n`);
  process.exitCode = 1;
}
