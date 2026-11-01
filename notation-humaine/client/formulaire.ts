/**
 * Le formulaire de la grille du §7. Il ne porte aucune règle de la grille : les règles (drapeaux
 * seulement sur une réponse inexacte, extrait hors note exacte, soutien d'un lien mort…) sont celles
 * du schéma et du domaine, que le serveur applique et dont il rend chaque motif de refus. Le client
 * ne choisit **aucune valeur par défaut** : un choix non fait est dit, pas comblé.
 */

import { champ, el, liste } from "./dom.ts";
import { extraitDemande } from "./extrait.ts";
import { nomsParLigne } from "./noms.ts";
import { erreurDeProvenance, valeurChoisie } from "./provenance.ts";
import { motifSansSoutien, soutiensAdmis } from "./soutiens.ts";
import type { Existence, Grille, Saisie, SaisieAttribution, Vue } from "./types.ts";

export type LectureFormulaire =
  | { readonly ok: true; readonly saisie: Saisie }
  | { readonly ok: false; readonly erreurs: readonly string[] };

export interface Formulaire {
  readonly racine: HTMLFormElement;
  lire(): LectureFormulaire;
  /**
   * D30 (2) : sur une Q-ATT que la règle d'ensembles rend indécidable (refus `attribution_indecidable`
   * du serveur), montre la catégorie, les drapeaux et le motif que l'humain décide. Hors de ce cas,
   * ils restent cachés et ne sont jamais envoyés.
   */
  revelerNoteDecidee(): void;
}

function radios(nom: string, valeurs: readonly string[]): HTMLElement {
  return el(
    "div",
    { class: "choix" },
    ...valeurs.map((valeur) => el("label", {}, el("input", { type: "radio", name: nom, value: valeur }), ` ${valeur}`)),
  );
}

function selection(valeurs: readonly string[]): HTMLSelectElement {
  return el("select", {}, el("option", { value: "" }, "— choisir —"), ...valeurs.map((valeur) => el("option", { value: valeur }, valeur)));
}

function choisi(racine: HTMLElement, nom: string): string | null {
  const coche = racine.querySelector<HTMLInputElement>(`input[name="${nom}"]:checked`);
  return coche === null ? null : coche.value;
}

function cochees(racine: HTMLElement, nom: string): readonly string[] {
  return [...racine.querySelectorAll<HTMLInputElement>(`input[name="${nom}"]:checked`)].map((c) => c.value);
}

interface Controles {
  readonly soutiens: readonly HTMLSelectElement[];
  readonly motif: HTMLSelectElement;
  readonly extrait: HTMLTextAreaElement;
  readonly provenance: HTMLSelectElement;
  /** Q-ATT seulement (D29) : les noms cités, un par ligne. */
  readonly noms: HTMLTextAreaElement | null;
  /** Q-ATT seulement (D30 (2)) : la note décidée, cachée tant que le serveur ne l'exige pas. */
  readonly decidee: { readonly bloc: HTMLFieldSetElement; readonly motif: HTMLSelectElement } | null;
}

/** D30 (3) : trois natures exclusives de la réponse à une Q-ATT ; la note se calcule dans le premier cas. */
const NATURE_REPOND = "répond";
const NATURE_NON_REPONSE = "refuse ou ne répond pas";
const NATURE_INDETERMINEE = "contradictoire, indéterminée";

/** D29 : sur une Q-ATT, l'annotateur relève les noms cités et la non-réponse ; la note se calcule. */
function blocAttribution(noms: HTMLTextAreaElement): HTMLElement {
  return el(
    "fieldset",
    {},
    el("legend", {}, "Question d'attribution : la note se calcule à partir de votre relevé"),
    champ("Noms que la réponse cite comme proposant la mesure, tels qu'écrits, un par ligne (facultatifs si la réponse est indéterminée)", noms),
    el("fieldset", {}, el("legend", {}, "Nature de la réponse"), radios("nature", [NATURE_REPOND, NATURE_NON_REPONSE, NATURE_INDETERMINEE])),
  );
}

/** D30 (2) : la note que l'humain décide quand aucun texte ne la détermine ; cachée par défaut d'affichage. */
function blocNoteDecidee(grille: Grille, motif: HTMLSelectElement): HTMLFieldSetElement {
  const bloc = el(
    "fieldset",
    {},
    el("legend", {}, "Cas indécidable : décidez la note (catégorie, drapeaux, motif)"),
    radios("decidee_categorie", ["exacte", "inexacte"]),
    el("div", {}, ...grille.drapeaux.map((d) => el("label", {}, el("input", { type: "checkbox", name: "decidee_drapeau", value: d }), ` ${d}`))),
    champ("Motif d'inexactitude (réponse inexacte)", motif),
  );
  bloc.hidden = true;
  return bloc;
}

/** Hors Q-ATT : la catégorie, les drapeaux et le motif du §7. */
function blocsGrille(grille: Grille, motif: HTMLSelectElement): readonly HTMLElement[] {
  return [
    el("fieldset", {}, el("legend", {}, "Catégorie"), radios("categorie", grille.categories)),
    el("fieldset", {}, el("legend", {}, "Drapeaux (réponse inexacte)"), ...grille.drapeaux.map((d) => el("label", {}, el("input", { type: "checkbox", name: "drapeau", value: d }), ` ${d}`))),
    champ("Motif d'inexactitude (réponse inexacte)", motif),
  ];
}

function ligneLien(lien: Existence, soutien: HTMLSelectElement): HTMLElement {
  const motif = motifSansSoutien(lien);
  return el(
    "div",
    { class: "lien-a-noter" },
    champ(`Soutien de ${lien.url_citee} (existence : ${lien.verdict_existence})`, soutien),
    ...(lien.archive_url === undefined ? [] : [el("p", { class: "archive" }, `Copie archivée : ${lien.archive_url}`)]),
    ...(motif === null ? [] : [el("p", { class: "motif-soutien" }, motif)]),
  );
}

function blocLiens(vue: Vue, grille: Grille): { readonly noeud: HTMLElement; readonly soutiens: readonly HTMLSelectElement[] } {
  const soutiens = vue.reponse.liens.map((lien) => selection(soutiensAdmis(lien, grille.verdicts_soutien)));
  const lignes = vue.reponse.liens.map((lien, rang) => ligneLien(lien, soutiens[rang] as HTMLSelectElement));
  return { noeud: el("fieldset", {}, el("legend", {}, "Liens : la page citée contient-elle l'affirmation ?"), ...lignes), soutiens };
}

/**
 * Hors Q-ATT, pas d'extrait sur une note exacte ; sur une Q-ATT, la note n'est connue qu'au serveur.
 * D33 : sur un refus de l'API, l'extrait n'est ni demandé ni envoyé.
 */
function lireExtrait(c: Controles, categorie: string | null, vue: Vue): Pick<Saisie, "extrait"> {
  const provenance = valeurChoisie(c.provenance);
  if (!extraitDemande(vue) || categorie === "exacte" || c.extrait.value.length === 0 || provenance === null) return {};
  return { extrait: { texte: c.extrait.value, provenance } };
}

/** Un extrait saisi sans provenance choisie n'est jamais envoyé avec une provenance devinée. */
function erreursDExtrait(racine: HTMLElement, c: Controles): readonly string[] {
  const erreur = erreurDeProvenance(c.extrait.value, valeurChoisie(c.provenance));
  return erreur === null || choisi(racine, "categorie") === "exacte" ? [] : [erreur];
}

function erreursDeChoix(racine: HTMLElement, c: Controles): readonly string[] {
  const propre = c.noms === null ? ["categorie", "Choisissez une catégorie."] : ["nature", "Dites la nature de la réponse."];
  return [
    ...(choisi(racine, propre[0] as string) === null ? [propre[1] as string] : []),
    ...(c.decidee !== null && !c.decidee.bloc.hidden && choisi(racine, "decidee_categorie") === null ? ["Décidez la catégorie du cas indécidable."] : []),
    ...(choisi(racine, "cite") === null ? ["Dites si la réponse cite une source."] : []),
    ...(c.soutiens.some((s) => valeurChoisie(s) === null) ? ["Choisissez un soutien pour chaque lien."] : []),
    ...erreursDExtrait(racine, c),
  ];
}

function communDe(racine: HTMLElement, c: Controles, vue: Vue, categorie: string | null): Pick<Saisie, "cite" | "soutiens" | "extrait"> {
  return {
    cite: choisi(racine, "cite") === "oui",
    soutiens: vue.reponse.liens.map((lien, rang) => ({ url_citee: lien.url_citee, verdict_soutien: (c.soutiens[rang] as HTMLSelectElement).value })),
    ...lireExtrait(c, categorie, vue),
  };
}

function saisieOrdinaire(racine: HTMLElement, c: Controles, categorie: string, vue: Vue): Saisie {
  const motif = valeurChoisie(c.motif);
  const inexacte = categorie === "inexacte";
  return {
    categorie,
    drapeaux: inexacte ? cochees(racine, "drapeau") : [],
    ...(inexacte && motif !== null ? { motif_inexactitude: motif } : {}),
    ...communDe(racine, c, vue, categorie),
  };
}

function saisieAttribution(racine: HTMLElement, noms: HTMLTextAreaElement, c: Controles, vue: Vue): Saisie {
  const nature = choisi(racine, "nature");
  return {
    noms_cites: nomsParLigne(noms.value),
    non_reponse: nature === NATURE_NON_REPONSE,
    indeterminee: nature === NATURE_INDETERMINEE,
    ...noteDecideeDe(racine, c),
    ...communDe(racine, c, vue, null),
  };
}

/** Envoyée seulement quand le bloc est montré (refus `attribution_indecidable`) et une catégorie choisie. */
function noteDecideeDe(racine: HTMLElement, c: Controles): Pick<SaisieAttribution, "note_decidee"> {
  const categorie = choisi(racine, "decidee_categorie");
  if (c.decidee === null || c.decidee.bloc.hidden || categorie === null) return {};
  const motif = valeurChoisie(c.decidee.motif);
  const inexacte = categorie === "inexacte";
  return { note_decidee: { categorie, drapeaux: inexacte ? cochees(racine, "decidee_drapeau") : [], ...(inexacte && motif !== null ? { motif_inexactitude: motif } : {}) } };
}

/** D30 (2) : le bloc de la note décidée, sur une Q-ATT seulement. */
function decideeDe(vue: Vue, grille: Grille): Controles["decidee"] {
  if (vue.question.gabarit !== "Q-ATT") return null;
  const motif = selection(grille.motifs_inexactitude);
  return { bloc: blocNoteDecidee(grille, motif), motif };
}

export function construireFormulaire(vue: Vue, grille: Grille): Formulaire {
  const liens = blocLiens(vue, grille);
  const decidee = decideeDe(vue, grille);
  const controles: Controles = {
    soutiens: liens.soutiens,
    motif: selection(grille.motifs_inexactitude),
    extrait: el("textarea", { rows: "3" }),
    provenance: selection(grille.provenances),
    noms: vue.question.gabarit === "Q-ATT" ? el("textarea", { rows: "4" }) : null,
    decidee,
  };
  const racine = el(
    "form",
    { class: "volet volet-grille" },
    el("h2", {}, "Votre notation"),
    ...(controles.noms === null ? blocsGrille(grille, controles.motif) : [blocAttribution(controles.noms)]),
    ...(decidee === null ? [] : [decidee.bloc]),
    el("fieldset", {}, el("legend", {}, "La réponse cite-t-elle une source ?"), radios("cite", ["oui", "non"])),
    liens.noeud,
    ...(extraitDemande(vue)
      ? [el("fieldset", {}, el("legend", {}, "Extrait justificatif (toute note autre qu'exacte) : copié de la réponse ou d'une citation de référence"), controles.extrait, champ("Provenance", controles.provenance))]
      : [el("p", { class: "alerte" }, "Refus de l'API : aucun extrait justificatif n'est demandé.")]),
    el("button", { type: "submit" }, "Enregistrer la notation"),
  );
  return {
    racine,
    lire: () => lire(racine, controles, vue),
    revelerNoteDecidee: () => {
      if (decidee !== null) decidee.bloc.hidden = false;
    },
  };
}

function lire(racine: HTMLFormElement, controles: Controles, vue: Vue): LectureFormulaire {
  const erreurs = erreursDeChoix(racine, controles);
  if (erreurs.length > 0) return { ok: false, erreurs };
  if (controles.noms !== null) return { ok: true, saisie: saisieAttribution(racine, controles.noms, controles, vue) };
  const categorie = choisi(racine, "categorie");
  if (categorie === null) return { ok: false, erreurs: ["Choisissez une catégorie."] };
  return { ok: true, saisie: saisieOrdinaire(racine, controles, categorie, vue) };
}

export function afficherErreurs(erreurs: readonly string[]): HTMLElement {
  return el("div", { class: "refus", role: "alert" }, el("strong", {}, "La notation n'est pas enregistrée :"), liste(erreurs));
}
