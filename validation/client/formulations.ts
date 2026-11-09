/**
 * Écran de relecture des formulations (décisions D39 et D42) : la liste des questions qui ont une
 * proposition relisible, puis, pour une question, les trois textes côte à côte et quatre cases que
 * l'annotateur coche lui-même. Le texte n'est jamais modifiable : on promeut ou on refuse.
 *
 * L'identité de l'annotateur n'est pas demandée ici : elle vient de l'environnement du serveur,
 * comme dans les écrans de validation des items.
 */

import { api } from "./api.ts";
import { elementParId } from "./dom-type.ts";
import { messagesDErreur } from "./erreurs.ts";
import { lignesItemPrincipal, SANS_ITEM_PRINCIPAL } from "./item-principal.ts";
import { lancer } from "./signalement.ts";
import { actionsPermises, etatInitial, libellePremisse, relectureDe, type EtatCases } from "./cases-formulations.ts";
import type { ItemPrincipalFormulations, ResumeFormulations, VueFormulations } from "./types.ts";

const LIBELLES_REGISTRE: Readonly<Record<string, string>> = {
  neutre: "Neutre",
  familier: "Familière",
  oriente: "Orientée",
};

/** La question ouverte : sa vue, l'état de ses cases, et le chemin du retour à l'accueil. */
interface Relecture {
  readonly vue: VueFormulations;
  etat: EtatCases;
  readonly retour: () => void;
}

const ecran = (): HTMLElement => elementParId("ecran", HTMLElement);

/* --------------------------------------------------------------- liste */

export async function ouvrirRelectureFormulations(retour: () => void): Promise<void> {
  const zone = ecran();
  zone.replaceChildren();
  const bloc = element("div", "centre");
  bloc.append(texte("h1", "Formulations à relire"), bouton("Retour à l'accueil", retour));
  zone.append(bloc);
  try {
    const liste = await api.formulations();
    bloc.append(liste.questions.length === 0 ? texte("p", "Aucune proposition à relire.", "avis") : tableau(liste.questions, retour));
  } catch (echec) {
    bloc.append(texte("p", messageDEchec(echec), "alerte"));
  }
}

function tableau(questions: readonly ResumeFormulations[], retour: () => void): HTMLElement {
  const table = element("table");
  const entetes = element("tr");
  for (const libelle of ["Question", "Gabarit", "Candidat", "Mesure", ""]) entetes.append(texte("th", libelle));
  table.append(entetes);
  for (const question of questions) {
    const ligne = element("tr");
    ligne.append(
      texte("td", question.question_id),
      texte("td", question.gabarit),
      texte("td", question.candidat ?? "—"),
      texte("td", question.mesure),
    );
    const cellule = element("td");
    cellule.append(bouton("Relire", () => lancer(ouvrirQuestion(question.question_id, retour))));
    ligne.append(cellule);
    table.append(ligne);
  }
  return table;
}

/* ------------------------------------------------------------ question */

async function ouvrirQuestion(question_id: string, retour: () => void): Promise<void> {
  try {
    const vue = await api.formulation(question_id);
    rendreQuestion({ vue, etat: etatInitial(vue), retour }, null);
  } catch (echec) {
    const bloc = element("div", "centre");
    bloc.append(texte("p", messageDEchec(echec), "alerte"), retourALaListe(retour));
    ecran().replaceChildren(bloc);
  }
}

function rendreQuestion(relecture: Relecture, message: string | null): void {
  const { vue } = relecture;
  const bloc = element("div", "relecture-formulations");
  bloc.append(
    texte("h1", `Relecture — ${vue.question_id}`),
    contexteDeLaQuestion(vue),
    rendreItemPrincipal(vue.item_principal),
    colonnes(relecture),
    champCommentaire(relecture),
    actions(relecture),
  );
  if (message !== null) bloc.append(texte("p", message, "alerte"));
  bloc.append(retourALaListe(relecture.retour));
  ecran().replaceChildren(bloc);
}

function contexteDeLaQuestion(vue: VueFormulations): HTMLElement {
  const liste = element("dl", "contexte-formulations");
  const lignes: [string, string][] = [["Gabarit", vue.gabarit]];
  if (vue.candidat !== null) lignes.push(["Candidat", vue.candidat]);
  lignes.push(["Mesure", vue.mesure], ["Position demandée", vue.position_demandee]);
  for (const [terme, definition] of lignes) liste.append(texte("dt", terme), texte("dd", definition));
  return liste;
}

/** L'item principal (§5) : une question d'attribution n'en a pas, et l'écran le dit. Texte posé par `textContent`. */
function rendreItemPrincipal(principal: ItemPrincipalFormulations | null): HTMLElement {
  const bloc = element("section", "item-principal-formulations");
  bloc.append(texte("h2", "Item principal de la question"));
  if (principal === null) {
    bloc.append(texte("p", SANS_ITEM_PRINCIPAL, "avis"));
    return bloc;
  }
  const liste = element("dl");
  for (const ligne of lignesItemPrincipal(principal)) {
    liste.append(texte("dt", ligne.libelle), texte("dd", ligne.valeur, ligne.citation === true ? "citation" : undefined));
  }
  bloc.append(liste);
  return bloc;
}

/** Une case cochée ou décochée redessine l'écran : l'état des boutons en découle. */
function changer(relecture: Relecture, etat: EtatCases): void {
  relecture.etat = etat;
  rendreQuestion(relecture, null);
}

function colonnes(relecture: Relecture): HTMLElement {
  const { vue, etat } = relecture;
  const grille = element("div", "formulations-cote-a-cote");
  for (const { registre, texte: contenu } of vue.textes) {
    const colonne = element("section", "formulation");
    colonne.append(texte("h2", LIBELLES_REGISTRE[registre] ?? registre), texte("p", contenu, "texte-formulation"));
    colonne.append(
      caseACocher("Sens préservé", etat.sens.get(registre) === true, (coche) =>
        changer(relecture, { ...etat, sens: new Map(etat.sens).set(registre, coche) }),
      ),
    );
    if (registre === "oriente") {
      colonne.append(
        caseACocher(libellePremisse(vue.position_demandee), etat.premisse, (coche) =>
          changer(relecture, { ...etat, premisse: coche }),
        ),
      );
    }
    grille.append(colonne);
  }
  return grille;
}

/** Le commentaire ne redessine pas l'écran à chaque frappe (le focus serait perdu) : seuls les boutons suivent. */
function champCommentaire(relecture: Relecture): HTMLElement {
  const bloc = element("label", "commentaire-formulations");
  bloc.append(texte("span", "Commentaire (obligatoire pour refuser)"));
  const zone = document.createElement("textarea");
  zone.value = relecture.etat.commentaire;
  zone.rows = 3;
  zone.addEventListener("input", () => {
    relecture.etat = { ...relecture.etat, commentaire: zone.value };
    majBoutons(relecture.etat);
  });
  bloc.append(zone);
  return bloc;
}

function actions(relecture: Relecture): HTMLElement {
  const bloc = element("div", "actions-formulations");
  const promouvoir = bouton("Promouvoir les trois formulations", () => lancer(envoyer("promouvoir", relecture)));
  promouvoir.id = "bouton-promouvoir";
  const refuser = bouton("Refuser la proposition", () => lancer(envoyer("refuser", relecture)));
  refuser.id = "bouton-refuser";
  bloc.append(promouvoir, refuser);
  appliquer(actionsPermises(relecture.etat), promouvoir, refuser);
  return bloc;
}

function appliquer(permises: ReturnType<typeof actionsPermises>, promouvoir: HTMLButtonElement, refuser: HTMLButtonElement): void {
  promouvoir.disabled = !permises.promouvoir;
  refuser.disabled = !permises.refuser;
}

function majBoutons(etat: EtatCases): void {
  appliquer(
    actionsPermises(etat),
    elementParId("bouton-promouvoir", HTMLButtonElement),
    elementParId("bouton-refuser", HTMLButtonElement),
  );
}

async function envoyer(action: "promouvoir" | "refuser", relecture: Relecture): Promise<void> {
  const requete = relectureDe(relecture.vue, relecture.etat);
  try {
    if (action === "promouvoir") await api.promouvoirFormulations(requete);
    else await api.refuserFormulations(requete);
  } catch (echec) {
    rendreQuestion(relecture, messageDEchec(echec));
    return;
  }
  await ouvrirRelectureFormulations(relecture.retour);
}

/* ------------------------------------------------------------ fabriques */

function retourALaListe(retour: () => void): HTMLButtonElement {
  return bouton("Retour à la liste", () => lancer(ouvrirRelectureFormulations(retour)));
}

function messageDEchec(echec: unknown): string {
  return messagesDErreur(echec).join(" ; ");
}

function element(balise: string, classe?: string): HTMLElement {
  const noeud = document.createElement(balise);
  if (classe !== undefined) noeud.className = classe;
  return noeud;
}

function texte(balise: string, contenu: string, classe?: string): HTMLElement {
  const noeud = element(balise, classe);
  noeud.textContent = contenu;
  return noeud;
}

function bouton(libelle: string, agir: () => void): HTMLButtonElement {
  const noeud = document.createElement("button");
  noeud.type = "button";
  noeud.textContent = libelle;
  noeud.addEventListener("click", agir);
  return noeud;
}

function caseACocher(libelle: string, coche: boolean, basculer: (coche: boolean) => void): HTMLElement {
  const etiquette = element("label", "case-formulation");
  const entree = document.createElement("input");
  entree.type = "checkbox";
  entree.checked = coche;
  entree.addEventListener("change", () => {
    basculer(entree.checked);
  });
  etiquette.append(entree, document.createTextNode(` ${libelle}`));
  return etiquette;
}
