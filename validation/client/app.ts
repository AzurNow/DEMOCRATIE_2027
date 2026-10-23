/**
 * Interface de validation — écran par écran, tout au clavier.
 *
 * Le point sensible est la **symétrie de friction** : accepter, rejeter et non évaluable
 * coûtent le même nombre de gestes, et le serveur calcule ce nombre et l'envoie avec chaque
 * item (`vue.gestes`). L'écran l'affiche. Si un jour une décision devenait moins chère qu'une
 * autre, cela se verrait à l'écran avant même que le test ne tombe.
 */

import { api, urlSource, type RequeteDecision } from "./api.ts";
import { champsEditables, corrections, type ChampEditable } from "./edition.ts";
import { CLES_GRILLE } from "../domaine/grille.ts";
import { ouvrirRelectureFormulations } from "./formulations.ts";
import { rendreSource } from "./source.ts";
import type {
  Brouillon,
  Correction,
  Decision,
  Diagnostic,
  QuestionAffichee,
  Raccourcis,
  ResultatKappa,
  Session,
  VueItem,
} from "./types.ts";

interface Etat {
  session: Session | null;
  raccourcis: Raccourcis | null;
  lot_id: string | null;
  vue: VueItem | null;
  reponses: Map<string, boolean>;
  specifiques: Map<string, boolean>;
  saisies: Map<string, string>;
  champs: readonly ChampEditable[];
  commentaire: string;
  decision: Decision | null;
  question: number;
  source: number;
  chrono: { debut: number; actifDepuis: number | null; cumul: number };
  message: string | null;
}

const etat: Etat = {
  session: null,
  raccourcis: null,
  lot_id: null,
  vue: null,
  reponses: new Map(),
  specifiques: new Map(),
  saisies: new Map(),
  champs: [],
  commentaire: "",
  decision: null,
  question: 0,
  source: 0,
  chrono: { debut: 0, actifDepuis: null, cumul: 0 },
  message: null,
};

const ecran = () => document.getElementById("ecran") as HTMLElement;

/* ------------------------------------------------------------- démarrage */

async function demarrer(): Promise<void> {
  etat.session = await api.session();
  etat.raccourcis = await api.raccourcis();
  remplirAide();
  suivreActivite();
  document.addEventListener("keydown", auClavier);
  (document.getElementById("bouton-aide") as HTMLButtonElement).addEventListener("click", ouvrirAide);
  (document.getElementById("fermer-aide") as HTMLButtonElement).addEventListener("click", () =>
    (document.getElementById("aide") as HTMLDialogElement).close(),
  );
  void rendreAccueil();
}

function rendreBandeau(fil: string, avancement: string): void {
  const session = etat.session as Session;
  (document.getElementById("identite") as HTMLElement).textContent = `Annotateur ${session.annotateur_id}`;
  (document.getElementById("fil") as HTMLElement).textContent = fil;
  (document.getElementById("avancement") as HTMLElement).textContent = avancement;
}

/* --------------------------------------------------------------- accueil */

async function rendreAccueil(): Promise<void> {
  etat.session = await api.session();
  etat.lot_id = null;
  etat.vue = null;
  const session = etat.session;
  rendreBandeau("Accueil", "");

  const zone = ecran();
  zone.replaceChildren();
  const bloc = element("div", "centre");
  bloc.append(titre("Lots à valider"));

  if (session.lots.length === 0) {
    bloc.append(
      avis(
        "Aucun lot ne vous est affecté. Les lots se composent avec « pnpm lots » à partir de " +
          "staging/, et le manifeste enregistre la graine du tirage.",
      ),
    );
  } else {
    bloc.append(tableauDesLots(session));
  }
  bloc.append(accesFormulations());
  zone.append(bloc);
}

/** Relecture des formulations (D39, D42) : un écran à part, qui ne touche ni aux lots ni au journal. */
function accesFormulations(): HTMLElement {
  const section = element("section");
  section.append(sousTitre("Formulations à relire"));
  const bouton = element("button") as HTMLButtonElement;
  bouton.type = "button";
  bouton.textContent = "Relire les formulations";
  bouton.addEventListener("click", () => {
    rendreBandeau("Formulations", "");
    void ouvrirRelectureFormulations(() => void rendreAccueil());
  });
  section.append(bouton);
  return section;
}

function tableauDesLots(session: Session): HTMLElement {
  const table = element("table");
  table.append(
    ligneEntetes(["Lot", "Nature", "Items", "Décidés", "Restants", ""]),
  );
  for (const lot of session.lots) {
    const ligne = element("tr");
    ligne.append(
      cellule(lot.lot_id),
      cellule(lot.nature === "entrainement" ? "entraînement" : lot.nature),
      cellule(String(lot.taille)),
      cellule(String(lot.progression.decides)),
      cellule(String(lot.progression.restants)),
    );
    ligne.append(celluleAction(lot));
    table.append(ligne);
  }
  return table;
}

function celluleAction(lot: Session["lots"][number]): HTMLElement {
  const cellule = element("td");
  if (!lot.accessible) {
    const note = element("span", "note");
    note.textContent = lot.motif_inaccessible ?? "Indisponible";
    cellule.append(note);
    return cellule;
  }
  const bouton = element("button") as HTMLButtonElement;
  bouton.textContent = lot.progression.termine ? "Voir le bilan" : "Reprendre";
  bouton.addEventListener("click", () => {
    void ouvrirLot(lot.lot_id);
  });
  cellule.append(bouton);
  return cellule;
}

/* ------------------------------------------------------------------- lot */

async function ouvrirLot(lot_id: string): Promise<void> {
  etat.lot_id = lot_id;
  const lot = await api.lot(lot_id);
  if (lot.item_courant === null) {
    await rendreFinDeLot(lot_id);
    return;
  }
  await ouvrirItem(lot_id, lot.item_courant);
}

async function ouvrirItem(lot_id: string, item_id: string): Promise<void> {
  try {
    etat.vue = await api.item(lot_id, item_id);
  } catch (echec) {
    await traiterEchecItem(lot_id, echec);
    return;
  }
  reinitialiserSaisie();
  rendreItem();
}

async function traiterEchecItem(lot_id: string, echec: unknown): Promise<void> {
  const detail = echec as { statut?: number; corps?: { retire?: boolean; motif?: string } };
  if (detail.statut === 409 && detail.corps?.retire === true) {
    etat.message = detail.corps.motif ?? "Item retiré du lot.";
    await ouvrirLot(lot_id);
    return;
  }
  etat.message = `Erreur ${detail.statut ?? "?"} : ${JSON.stringify(detail.corps)}`;
  await rendreAccueil();
}

/**
 * Remet l'écran à l'état où l'annotateur l'avait laissé. Un brouillon absent n'est pas une
 * erreur : c'est un item qu'on ouvre pour la première fois.
 */
function reinitialiserSaisie(): void {
  const vue = etat.vue as VueItem;
  const brouillon = vue.brouillon;
  etat.reponses = reponsesDuBrouillon(brouillon);
  etat.specifiques = new Map(Object.entries(brouillon?.questions_specifiques ?? {}));
  etat.commentaire = brouillon?.commentaire ?? "";
  etat.saisies = new Map();
  etat.champs = champsEditables(vue.item, etat.session as Session);
  etat.decision = null;
  etat.question = 0;
  etat.source = 0;
  etat.chrono = chronoDepuis(brouillon);
}

function reponsesDuBrouillon(brouillon: Brouillon | null): Map<string, boolean> {
  const reponses = new Map(Object.entries(brouillon?.reponses ?? {}));
  for (const [nom, grille] of Object.entries(brouillon?.reponses_par_etat ?? {})) {
    for (const [cle, valeur] of Object.entries(grille)) reponses.set(`${nom}.${cle}`, valeur);
  }
  return reponses;
}

/** Le temps déjà passé sur l'item est repris : fermer la fenêtre ne remet pas le compteur à zéro. */
function chronoDepuis(brouillon: Brouillon | null): Etat["chrono"] {
  return {
    debut: performance.now() - (brouillon?.duree_affichage_ms ?? 0),
    actifDepuis: document.hasFocus() ? performance.now() : null,
    cumul: brouillon?.duree_active_ms ?? 0,
  };
}

/* -------------------------------------------------------------- écran item */

function rendreItem(): void {
  const vue = etat.vue as VueItem;
  rendreBandeau(
    `${vue.lot_id} · item ${vue.position.index + 1} / ${vue.position.total}`,
    `${vue.item.type} · ${vue.item.candidat_id}`,
  );

  const volets = element("div", "volets");
  volets.append(voletSource(vue), voletItem(vue));
  ecran().replaceChildren(volets);
}

function voletSource(vue: VueItem): HTMLElement {
  if (vue.sources.length === 0) {
    const vide = element("div", "volet");
    vide.append(
      avis(
        "Cet item ne porte aucune source à afficher : un item fictif se juge sur la mesure et " +
          "sa vérification de fictivité, présentées à droite.",
      ),
    );
    return vide;
  }

  const conteneur = element("div", "volet volet-source");
  if (vue.sources.length > 1) conteneur.append(ongletsSource(vue));
  const active = vue.sources[Math.min(etat.source, vue.sources.length - 1)];
  if (active !== undefined) {
    const rendu = rendreSource(vue, active);
    conteneur.append(...Array.from(rendu.childNodes));
  }
  return conteneur;
}

function ongletsSource(vue: VueItem): HTMLElement {
  const barre = element("div", "onglets");
  vue.sources.forEach((source, index) => {
    const bouton = element("button") as HTMLButtonElement;
    bouton.textContent = source.libelle;
    bouton.setAttribute("aria-selected", String(index === etat.source));
    bouton.addEventListener("click", () => {
      etat.source = index;
      rendreItem();
    });
    barre.append(bouton);
  });
  return barre;
}

function voletItem(vue: VueItem): HTMLElement {
  const volet = element("div", "volet");
  volet.append(enteteItem(vue));
  if (etat.message !== null) {
    volet.append(avis(etat.message));
    etat.message = null;
  }
  volet.append(...contenuItem(vue));
  volet.append(sousTitre("Grille de validation"));
  volet.append(...questions(vue));
  volet.append(champCommentaire());
  volet.append(blocDecisions(vue));
  if (etat.decision !== null) volet.append(blocConfirmation(vue));
  return volet;
}

function enteteItem(vue: VueItem): HTMLElement {
  const entete = element("div", "entete-item");
  entete.append(
    pastille(`Type ${vue.item.type}`),
    pastille(vue.item.candidat_id),
    pastille(vue.item.mesure.theme),
    pastille(`v${vue.item.version}`),
  );
  const mesure = element("h2");
  mesure.textContent = vue.item.mesure.libelle;
  entete.append(mesure);
  return entete;
}

function contenuItem(vue: VueItem): readonly HTMLElement[] {
  if (vue.item.assertion !== null) return [blocEtat("Position", vue.item.assertion)];
  if (vue.item.obsolescence !== null) return [blocObsolescence(vue)];
  if (vue.item.absence !== null) return [blocAbsence(vue)];
  return [blocFictif(vue)];
}

function blocEtat(titreEtat: string, etatPositionnel: NonNullable<VueItem["item"]["assertion"]>): HTMLElement {
  const bloc = element("div", "etat");
  bloc.append(sousTitre(titreEtat));
  bloc.append(champ("Position", etatPositionnel.position));
  bloc.append(champ("Paraphrase", etatPositionnel.paraphrase));
  bloc.append(champ("Citation", etatPositionnel.citation_verbatim, "citation"));
  if (etatPositionnel.quantification !== null) {
    bloc.append(champ("Quantification", JSON.stringify(etatPositionnel.quantification)));
  }
  bloc.append(champ("Source", `${etatPositionnel.source.tier} · ${etatPositionnel.source.date_source}`));
  return bloc;
}

/** §4 : un item O porte ses deux états sourcés. Ils sont donc montrés côte à côte. */
function blocObsolescence(vue: VueItem): HTMLElement {
  const obsolescence = vue.item.obsolescence as NonNullable<VueItem["item"]["obsolescence"]>;
  const bloc = element("div");
  bloc.append(champ("Date du changement", obsolescence.date_changement));
  const paire = element("div", "etats");
  paire.append(
    blocEtat("État antérieur", obsolescence.etat_anterieur),
    blocEtat("État postérieur", obsolescence.etat_posterieur),
  );
  bloc.append(paire);
  return bloc;
}

/** §4 : un item A n'existe qu'avec la liste des recherches menées, et une confirmation explicite. */
function blocAbsence(vue: VueItem): HTMLElement {
  const absence = vue.item.absence as NonNullable<VueItem["item"]["absence"]>;
  const bloc = element("div");
  bloc.append(
    avis(
      "Item d'absence : il affirme qu'aucune position du candidat sur cette mesure ne figure " +
        "dans le corpus ci-dessous, à la date de l'examen. Prouver qu'un candidat n'a rien dit " +
        "est impossible ; seul cet examen-là est affirmé.",
    ),
  );
  bloc.append(champ("Mesure recherchée", vue.item.mesure.formulation_canonique));
  bloc.append(champ("Examen mené le", absence.date_examen));
  const liste = element("table");
  liste.append(ligneEntetes(["Source balayée", "Niveau"]));
  for (const entree of absence.corpus_examine) {
    const ligne = element("tr");
    ligne.append(cellule(entree.url), cellule(entree.tier));
    liste.append(ligne);
  }
  bloc.append(sousTitre("Corpus examiné"), liste);
  return bloc;
}

function blocFictif(vue: VueItem): HTMLElement {
  const bloc = element("div");
  bloc.append(
    avis(
      "Item fictif : une mesure plausible qu'aucun candidat du périmètre ne propose. Elle sert " +
        "à mesurer la fabrication chez les outils — une mesure faussement fictive transformerait " +
        "une réponse correcte en fabrication comptabilisée.",
    ),
  );
  bloc.append(champ("Formulation", vue.item.mesure.formulation_canonique));
  if (vue.item.mesure.origine_fictive !== null) {
    bloc.append(champ("Origine", vue.item.mesure.origine_fictive));
  }
  const verification = vue.item.mesure.verification_fictivite;
  if (verification !== null) {
    bloc.append(champ("Corpus balayés", verification.corpus_verifies.join(", ")));
    bloc.append(champ("Résultat", verification.resultat));
  }
  return bloc;
}

/* ------------------------------------------------------------- questions */

function questions(vue: VueItem): readonly HTMLElement[] {
  const toutes = [...vue.questions, ...vue.questions_specifiques];
  return toutes.map((question, index) => ligneQuestion(question, index));
}

function cleDe(question: QuestionAffichee): string {
  return question.etat === null ? question.cle : `${question.etat}.${question.cle}`;
}

function estSpecifique(question: QuestionAffichee): boolean {
  const vue = etat.vue as VueItem;
  return vue.questions_specifiques.some((autre) => autre.cle === question.cle && question.etat === null);
}

function ligneQuestion(question: QuestionAffichee, index: number): HTMLElement {
  const ligne = element("div", index === etat.question ? "question courante" : "question");
  const libelle = element("span");
  libelle.textContent = question.etat === null ? question.libelle : `[${question.etat}] ${question.libelle}`;
  const reponses = element("span", "reponses");
  reponses.append(
    boutonReponse(question, true, "Oui"),
    boutonReponse(question, false, "Non"),
  );
  ligne.append(libelle, reponses);
  return ligne;
}

function boutonReponse(question: QuestionAffichee, valeur: boolean, texte: string): HTMLElement {
  const bouton = element("button") as HTMLButtonElement;
  bouton.textContent = texte;
  bouton.setAttribute("aria-pressed", String(valeurCourante(question) === valeur));
  bouton.addEventListener("click", () => repondre(question, valeur));
  return bouton;
}

function valeurCourante(question: QuestionAffichee): boolean | undefined {
  return estSpecifique(question) ? etat.specifiques.get(question.cle) : etat.reponses.get(cleDe(question));
}

function repondre(question: QuestionAffichee, valeur: boolean): void {
  if (estSpecifique(question)) etat.specifiques.set(question.cle, valeur);
  else etat.reponses.set(cleDe(question), valeur);
  avancerQuestion();
  enregistrerBrouillon();
  rendreItem();
}

function avancerQuestion(): void {
  const vue = etat.vue as VueItem;
  const total = vue.questions.length + vue.questions_specifiques.length;
  etat.question = Math.min(etat.question + 1, Math.max(total - 1, 0));
}

/* ------------------------------------------------------------- décisions */

function blocDecisions(vue: VueItem): HTMLElement {
  const bloc = element("div");
  const grille = element("div", "decisions");
  const libelles: Record<Decision, string> = {
    accepter: "Accepter",
    corriger: "Corriger",
    rejeter: "Rejeter",
    non_evaluable: "Non évaluable",
  };
  const touches = (etat.raccourcis as Raccourcis).touches_decision;

  for (const decision of ["accepter", "corriger", "rejeter", "non_evaluable"] as Decision[]) {
    const bouton = element("button") as HTMLButtonElement;
    const gestes = vue.gestes[decision];
    bouton.textContent = `${libelles[decision]} (${touches[decision]})`;
    bouton.title = `${gestes === "variable" ? "nombre de gestes variable" : `${gestes} gestes`}`;
    bouton.setAttribute("aria-pressed", String(etat.decision === decision));
    bouton.addEventListener("click", () => choisir(decision));
    grille.append(bouton);
  }

  const note = element("p", "note");
  note.textContent =
    `Accepter, rejeter et non évaluable : ${vue.gestes.accepter} gestes chacune. ` +
    `Corriger ouvre l'édition, son coût varie.`;
  bloc.append(grille, note);
  return bloc;
}

function choisir(decision: Decision): void {
  etat.decision = etat.decision === decision ? null : decision;
  rendreItem();
}

function blocConfirmation(vue: VueItem): HTMLElement {
  const bloc = element("div", "confirmation");
  const manquantes = questionsManquantes(vue);
  if (manquantes.length > 0) {
    bloc.append(
      avis(
        `Réponses manquantes : ${manquantes.join(", ")}. La grille est exigée pour les quatre ` +
          `décisions — c'est ce qui les rend également coûteuses.`,
      ),
    );
    return bloc;
  }
  if (etat.decision === "corriger") bloc.append(blocEdition());

  const bouton = element("button") as HTMLButtonElement;
  bouton.textContent = `Confirmer « ${etat.decision} » (Entrée)`;
  bouton.addEventListener("click", () => {
    void soumettre();
  });
  bloc.append(bouton);
  return bloc;
}

function questionsManquantes(vue: VueItem): readonly string[] {
  const manquantes: string[] = [];
  for (const question of vue.questions) {
    if (etat.reponses.get(cleDe(question)) === undefined) manquantes.push(cleDe(question));
  }
  for (const question of vue.questions_specifiques) {
    if (etat.specifiques.get(question.cle) === undefined) manquantes.push(question.cle);
  }
  return manquantes;
}

function blocEdition(): HTMLElement {
  const bloc = element("div");
  bloc.append(sousTitre("Champs à corriger"));
  for (const champEditable of etat.champs) bloc.append(ligneEdition(champEditable));
  return bloc;
}

function ligneEdition(champEditable: ChampEditable): HTMLElement {
  const bloc = element("div", "champ");
  const etiquette = element("label");
  etiquette.textContent = champEditable.libelle;
  bloc.append(etiquette);
  bloc.append(controleEdition(champEditable));
  if (champEditable.avertissement !== undefined) {
    const note = element("p", "note");
    note.textContent = champEditable.avertissement;
    bloc.append(note);
  }
  return bloc;
}

function controleEdition(champEditable: ChampEditable): HTMLElement {
  const valeur = valeurTexte(champEditable);
  if (champEditable.forme === "choix") {
    const liste = element("select") as HTMLSelectElement;
    for (const option of champEditable.choix ?? []) {
      const balise = element("option") as HTMLOptionElement;
      balise.value = option;
      balise.textContent = option;
      balise.selected = option === valeur;
      liste.append(balise);
    }
    liste.addEventListener("change", () => etat.saisies.set(champEditable.chemin, liste.value));
    return liste;
  }

  const zone = element(champEditable.forme === "ligne" ? "input" : "textarea") as HTMLTextAreaElement;
  zone.value = valeur;
  if (champEditable.forme !== "ligne") zone.rows = 3;
  zone.addEventListener("input", () => etat.saisies.set(champEditable.chemin, zone.value));
  return zone;
}

function valeurTexte(champEditable: ChampEditable): string {
  const saisie = etat.saisies.get(champEditable.chemin);
  if (saisie !== undefined) return saisie;
  if (champEditable.valeur === null || champEditable.valeur === undefined) return "";
  if (typeof champEditable.valeur === "string") return champEditable.valeur;
  return JSON.stringify(champEditable.valeur, null, 2);
}

/* ------------------------------------------------------------- soumission */

async function soumettre(): Promise<void> {
  const vue = etat.vue as VueItem;
  const decision = etat.decision;
  if (decision === null) return;

  const charge: RequeteDecision = {
    lot_id: vue.lot_id,
    item_id: vue.item.id,
    decision,
    ...grillesSoumises(vue),
    questions_specifiques: Object.fromEntries(etat.specifiques),
    corrections: decision === "corriger" ? corrections(etat.champs, etat.saisies) : ([] as Correction[]),
    commentaire: etat.commentaire.trim().length === 0 ? null : etat.commentaire,
    duree_affichage_ms: Math.round(performance.now() - etat.chrono.debut),
    duree_active_ms: Math.round(dureeActive()),
  };

  try {
    await api.decider(charge);
  } catch (echec) {
    etat.message = messageDEchec(echec);
    rendreItem();
    return;
  }
  await ouvrirLot(vue.lot_id);
}

type ReponsesSoumises =
  | { reponses_grille: Record<string, boolean | null> }
  | {
      reponses_par_etat: {
        anterieur: Record<string, boolean | null>;
        posterieur: Record<string, boolean | null>;
      };
    };

function grillesSoumises(vue: VueItem): ReponsesSoumises {
  if (vue.item.type !== "O") return { reponses_grille: grilleComplete(null) };
  return {
    reponses_par_etat: {
      anterieur: grilleComplete("anterieur"),
      posterieur: grilleComplete("posterieur"),
    },
  };
}

/**
 * Les clés de `CLES_GRILLE` sont toujours envoyées ; une question sans objet vaut `null`,
 * jamais `false`. La liste vient de `domaine/grille.ts`, source unique de vérité — jamais
 * recopiée ici, pour qu'une clé qui y serait ajoutée se répercute sans toucher à ce fichier.
 */
function grilleComplete(prefixe: string | null): Record<string, boolean | null> {
  const grille: Record<string, boolean | null> = {};
  for (const cle of CLES_GRILLE) {
    const complete = prefixe === null ? cle : `${prefixe}.${cle}`;
    grille[cle] = etat.reponses.get(complete) ?? null;
  }
  return grille;
}

function messageDEchec(echec: unknown): string {
  const detail = echec as { statut?: number; corps?: { manquements?: unknown; refus?: unknown } };
  if (detail.corps?.refus !== undefined) {
    return `Correction refusée : ${JSON.stringify(detail.corps.refus)}`;
  }
  if (detail.corps?.manquements !== undefined) {
    return `Décision incomplète : ${JSON.stringify(detail.corps.manquements)}`;
  }
  return `Erreur ${detail.statut ?? "?"}`;
}

/* ------------------------------------------------------------ fin de lot */

async function rendreFinDeLot(lot_id: string): Promise<void> {
  const diagnostic = await api.diagnostic(lot_id);
  rendreBandeau(`${lot_id} · terminé`, "");
  const bloc = element("div", "centre");
  bloc.append(titre(`Lot ${lot_id} : terminé`));

  if (!diagnostic.les_deux_ont_fini) {
    bloc.append(
      avis(
        "Vos décisions sont enregistrées. Le kappa du lot sera calculé quand le second " +
          "annotateur aura terminé le sien.",
      ),
    );
  } else {
    bloc.append(...bilanKappa(diagnostic));
  }

  const retour = element("button") as HTMLButtonElement;
  retour.textContent = "Retour aux lots";
  retour.addEventListener("click", () => {
    void rendreAccueil();
  });
  bloc.append(retour);
  ecran().replaceChildren(bloc);
}

function bilanKappa(diagnostic: Diagnostic): readonly HTMLElement[] {
  const blocs: HTMLElement[] = [];
  const kappa = diagnostic.kappa as ResultatKappa;
  blocs.push(champ("Kappa de Cohen (retenu / rejeté / non évaluable)", formaterKappa(kappa)));
  blocs.push(champ("Accord observé", formaterTaux(kappa.accord_observe)));
  blocs.push(champ("Items comparés", String(kappa.n)));

  if (diagnostic.alerte_reannotation === true) {
    blocs.push(
      alerte(
        "Kappa sous 0,80 : le §4 prévoit une séance de calibration, puis une réannotation du " +
          "lot. La réannotation crée un nouveau lot ; les deux kappas restent au journal.",
      ),
    );
  }

  const parQuestion = diagnostic.kappa_par_question;
  if (parQuestion !== undefined) {
    const table = element("table");
    table.append(ligneEntetes(["Question", "Kappa", "Items comparés"]));
    for (const [cle, resultat] of Object.entries(parQuestion)) {
      const ligne = element("tr");
      ligne.append(cellule(cle), cellule(formaterKappa(resultat)), cellule(String(resultat.n)));
      table.append(ligne);
    }
    blocs.push(sousTitre("Diagnostic par question"), table);
  }

  if (diagnostic.taux_double_correction_divergente !== null && diagnostic.taux_double_correction_divergente !== undefined) {
    blocs.push(
      champ("Doubles corrections divergentes", formaterTaux(diagnostic.taux_double_correction_divergente)),
    );
  }
  return blocs;
}

/** Un kappa indéfini s'affiche comme indéfini, avec son motif. Jamais 0, jamais 1. */
function formaterKappa(resultat: ResultatKappa): string {
  if (resultat.kappa !== null) return resultat.kappa.toFixed(3);
  if (resultat.motif_indefini === "accord_attendu_maximal") {
    return "non défini (accord observé parfait : l'accord attendu par hasard vaut 1)";
  }
  return "non défini (aucun item commun)";
}

function formaterTaux(valeur: number | null | undefined): string {
  return valeur === null || valeur === undefined ? "—" : `${(valeur * 100).toFixed(1)} %`;
}

/* -------------------------------------------------------------- clavier */

function auClavier(evenement: KeyboardEvent): void {
  if (estDansUnChamp(evenement.target)) return;
  if (evenement.key === "?") {
    ouvrirAide();
    return;
  }
  if (evenement.ctrlKey && evenement.key.toLowerCase() === "z") {
    evenement.preventDefault();
    void annulerDerniere();
    return;
  }
  if (etat.vue === null) return;
  traiterToucheItem(evenement);
}

function traiterToucheItem(evenement: KeyboardEvent): void {
  const raccourcis = etat.raccourcis as Raccourcis;
  const touche = evenement.key;

  if (touche === raccourcis.touches_reponse.oui || touche === raccourcis.touches_reponse.non) {
    const question = questionCourante();
    if (question !== null) repondre(question, touche === raccourcis.touches_reponse.oui);
    return;
  }
  for (const [decision, cle] of Object.entries(raccourcis.touches_decision)) {
    if (touche === cle) {
      choisir(decision as Decision);
      return;
    }
  }
  if (touche === raccourcis.touche_confirmation && etat.decision !== null) {
    evenement.preventDefault();
    void soumettre();
    return;
  }
  traiterNavigation(evenement);
}

function traiterNavigation(evenement: KeyboardEvent): void {
  const vue = etat.vue as VueItem;
  if (evenement.key === "Escape") {
    etat.decision = null;
    rendreItem();
  } else if (evenement.key === "Tab") {
    evenement.preventDefault();
    deplacerQuestion(evenement.shiftKey ? -1 : 1);
  } else if (evenement.key === "g") {
    document.getElementById("citation-surlignee")?.scrollIntoView({ block: "center" });
  } else if (evenement.key === "k") {
    evenement.preventDefault();
    (document.getElementById("commentaire") as HTMLTextAreaElement | null)?.focus();
  } else if (evenement.key === "s") {
    etat.source = (etat.source + 1) % Math.max(vue.sources.length, 1);
    rendreItem();
  }
}

function deplacerQuestion(pas: number): void {
  const vue = etat.vue as VueItem;
  const total = vue.questions.length + vue.questions_specifiques.length;
  if (total === 0) return;
  etat.question = (etat.question + pas + total) % total;
  rendreItem();
}

function questionCourante(): QuestionAffichee | null {
  const vue = etat.vue as VueItem;
  const toutes = [...vue.questions, ...vue.questions_specifiques];
  return toutes[etat.question] ?? null;
}

async function annulerDerniere(): Promise<void> {
  if (etat.lot_id === null) return;
  try {
    const resultat = await api.annuler(etat.lot_id);
    etat.message = `Décision annulée. Une entrée d'annulation a été ajoutée au journal ; l'ancienne y reste.`;
    await ouvrirItem(etat.lot_id, resultat.item_id);
  } catch {
    etat.message = "Aucune décision à annuler dans ce lot.";
    rendreItem();
  }
}

function estDansUnChamp(cible: EventTarget | null): boolean {
  const element = cible as HTMLElement | null;
  if (element === null) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

/* ------------------------------------------------------ durées et brouillon */

function suivreActivite(): void {
  window.addEventListener("focus", () => {
    etat.chrono.actifDepuis = performance.now();
  });
  window.addEventListener("blur", () => {
    etat.chrono.cumul = dureeActive();
    etat.chrono.actifDepuis = null;
  });
  window.addEventListener("beforeunload", () => enregistrerBrouillon());
}

function dureeActive(): number {
  if (etat.chrono.actifDepuis === null) return etat.chrono.cumul;
  return etat.chrono.cumul + (performance.now() - etat.chrono.actifDepuis);
}

let minuterieBrouillon: number | undefined;

function enregistrerBrouillon(): void {
  const vue = etat.vue;
  if (vue === null) return;
  window.clearTimeout(minuterieBrouillon);
  minuterieBrouillon = window.setTimeout(() => {
    void api.ecrireBrouillon({
      item_id: vue.item.id,
      lot_id: vue.lot_id,
      reponses: Object.fromEntries([...etat.reponses].filter(([cle]) => !cle.includes("."))),
      reponses_par_etat: {
        anterieur: sousGrille("anterieur"),
        posterieur: sousGrille("posterieur"),
      },
      questions_specifiques: Object.fromEntries(etat.specifiques),
      commentaire: etat.commentaire,
      duree_affichage_ms: Math.round(performance.now() - etat.chrono.debut),
      duree_active_ms: Math.round(dureeActive()),
    });
  }, 400);
}

function sousGrille(prefixe: string): Record<string, boolean> {
  const grille: Record<string, boolean> = {};
  for (const [cle, valeur] of etat.reponses) {
    if (cle.startsWith(`${prefixe}.`)) grille[cle.slice(prefixe.length + 1)] = valeur;
  }
  return grille;
}

function champCommentaire(): HTMLElement {
  const bloc = element("div", "champ");
  const etiquette = element("label");
  etiquette.textContent = "Commentaire libre (k) — toujours disponible";
  const zone = element("textarea") as HTMLTextAreaElement;
  zone.id = "commentaire";
  zone.rows = 2;
  zone.value = etat.commentaire;
  zone.addEventListener("input", () => {
    etat.commentaire = zone.value;
    enregistrerBrouillon();
  });
  bloc.append(etiquette, zone);
  return bloc;
}

/* ------------------------------------------------------------------- aide */

function ouvrirAide(): void {
  (document.getElementById("aide") as HTMLDialogElement).showModal();
}

function remplirAide(): void {
  const table = element("table");
  table.append(ligneEntetes(["Touche", "Action"]));
  for (const raccourci of (etat.raccourcis as Raccourcis).raccourcis) {
    const ligne = element("tr");
    ligne.append(cellule(raccourci.touche), cellule(raccourci.libelle));
    table.append(ligne);
  }
  (document.getElementById("table-raccourcis") as HTMLElement).replaceChildren(table);
}

/* ------------------------------------------------------------- fabriques */

function element(balise: string, classe?: string): HTMLElement {
  const noeud = document.createElement(balise);
  if (classe !== undefined) noeud.className = classe;
  return noeud;
}

function titre(texte: string): HTMLElement {
  const noeud = element("h1");
  noeud.textContent = texte;
  return noeud;
}

function sousTitre(texte: string): HTMLElement {
  const noeud = element("h3");
  noeud.textContent = texte;
  return noeud;
}

function champ(libelle: string, valeur: string, classe = ""): HTMLElement {
  const bloc = element("div", "champ");
  const etiquette = element("label");
  etiquette.textContent = libelle;
  const contenu = element("div", `valeur ${classe}`.trim());
  contenu.textContent = valeur;
  bloc.append(etiquette, contenu);
  return bloc;
}

function pastille(texte: string): HTMLElement {
  const noeud = element("span", "pastille");
  noeud.textContent = texte;
  return noeud;
}

function avis(texte: string): HTMLElement {
  const noeud = element("p", "avis");
  noeud.textContent = texte;
  return noeud;
}

function alerte(texte: string): HTMLElement {
  const noeud = element("p", "alerte");
  noeud.textContent = texte;
  return noeud;
}

function cellule(texte: string): HTMLElement {
  const noeud = element("td");
  noeud.textContent = texte;
  return noeud;
}

function ligneEntetes(textes: readonly string[]): HTMLElement {
  const ligne = element("tr");
  for (const texte of textes) {
    const entete = element("th");
    entete.textContent = texte;
    ligne.append(entete);
  }
  return ligne;
}

void demarrer();

export { urlSource };
