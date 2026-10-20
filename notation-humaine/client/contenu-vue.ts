/**
 * Le contenu textuel de la vue annotateur, sans DOM : une fonction pure de `Vue` vers une structure
 * de blocs. `affichage.ts` la projette en DOM sans relire la vue ; c'est donc le seul endroit où un
 * champ de la vue devient du texte, et le test `completude-affichage.test.ts` y vérifie que chaque
 * champ de la `VueAnnotateur` du pipeline y figure (D18 : un humain reçoit ce que reçoit un juge).
 */

import type { Citation, EtatItem, Existence, ItemSoumis, PageCitee, ReponseAttendue, Vue } from "./types.ts";

export type ClasseParagraphe = "note" | "alerte" | "question" | "reponse" | "page";

export type Bloc =
  | { readonly genre: "titre"; readonly niveau: 2 | 3; readonly texte: string }
  | { readonly genre: "paragraphe"; readonly classe: ClasseParagraphe; readonly texte: string }
  | { readonly genre: "liste"; readonly classe: string | null; readonly lignes: readonly string[] }
  | { readonly genre: "groupe"; readonly element: "section" | "div"; readonly classe: string; readonly blocs: readonly Bloc[] };

/**
 * Les champs de la vue volontairement non affichés : identifiants de version purement techniques,
 * sans information sur le contenu à noter. Clé : chemin de feuille (`[]` pour un élément de liste) ;
 * valeur : la raison. Tout autre champ de la vue est affiché ; le test compare cette liste aux
 * feuilles réelles.
 */
export const CHAMPS_NON_AFFICHES: Readonly<Record<string, string>> = {
  version_vue: "version du format de la vue : identifiant technique, aucune information sur la réponse",
  version_grille: "la session la montre déjà (Session.version_grille), à côté de la grille",
  version_normalisation_verbatim: "version de la normalisation du test verbatim : sert au contrôle de l'extrait, pas au jugement",
};

const paragraphe = (classe: ClasseParagraphe, texte: string): Bloc => ({ genre: "paragraphe", classe, texte });
const titre = (niveau: 2 | 3, texte: string): Bloc => ({ genre: "titre", niveau, texte });

function ligneEtat(e: EtatItem): readonly string[] {
  return [
    `Position : ${e.position}`,
    `Paraphrase : ${e.paraphrase}`,
    `Citation : « ${e.citation_verbatim} »`,
    ...(e.quantification === undefined ? [] : [`Quantification : ${JSON.stringify(e.quantification)}`]),
  ];
}

function etat(libelle: string, e: EtatItem): Bloc {
  return {
    genre: "groupe",
    element: "div",
    classe: "etat",
    blocs: [paragraphe("note", libelle), { genre: "liste", classe: null, lignes: ligneEtat(e) }],
  };
}

function blocsObsolescence(item: ItemSoumis): readonly Bloc[] {
  const o = item.obsolescence;
  if (o === undefined) return [];
  return [
    paragraphe("note", `Changement de position le ${o.date_changement}`),
    etat("Avant le changement", o.etat_anterieur),
    etat("Après le changement", o.etat_posterieur),
  ];
}

function reference(item: ItemSoumis): Bloc {
  const fin = item.valide_au === null ? "sans fin" : item.valide_au;
  return {
    genre: "groupe",
    element: "section",
    classe: "reference",
    blocs: [
      titre(3, `Item ${item.type} · ${item.role} · candidat ${item.candidat_id}`),
      paragraphe("note", `Identifiant ${item.item_id} · version ${item.item_version} · empreinte ${item.item_empreinte}`),
      paragraphe("note", `Valide du ${item.valide_du} au ${fin}`),
      ...(item.assertion === undefined ? [] : [etat("Assertion", item.assertion)]),
      ...blocsObsolescence(item),
    ],
  };
}

/** Le code HTTP : `null` est l'absence de réponse HTTP, dite comme telle, jamais un nombre. */
function codeHttp(code: number | null): string {
  return code === null ? "pas de réponse HTTP" : `code HTTP ${code}`;
}

function detailsLien(lien: Existence): readonly string[] {
  return [
    ...(lien.url_finale === undefined ? [] : [`URL finale : ${lien.url_finale}`]),
    ...(lien.code_http === undefined ? [] : [codeHttp(lien.code_http)]),
    ...(lien.sha256_contenu === undefined ? [] : [`empreinte du contenu : ${lien.sha256_contenu}`]),
    ...(lien.archive_url === undefined ? [] : [`archive : ${lien.archive_url}`]),
  ];
}

function ligneLien(lien: Existence): string {
  const base = `${lien.url_citee} — existence : ${lien.verdict_existence} (testé le ${lien.date_test})`;
  return [base, ...detailsLien(lien)].join(" · ");
}

function blocsLiens(vue: Vue): readonly Bloc[] {
  if (vue.reponse.liens.length === 0) return [paragraphe("note", "La réponse ne cite aucun lien.")];
  return [{ genre: "liste", classe: "liens", lignes: vue.reponse.liens.map(ligneLien) }];
}

function ligneCitation(c: Citation): string {
  return `${c.url ?? "(sans lien)"} — ${c.texte ?? "(sans texte)"}`;
}

function blocsCitations(vue: Vue): readonly Bloc[] {
  const citations = vue.reponse.citations;
  if (citations === undefined || citations.length === 0) return [];
  return [titre(3, "Citations de la réponse"), { genre: "liste", classe: null, lignes: citations.map(ligneCitation) }];
}

/** D27 (F) : la prémisse résolue au gel n'existe que sur la formulation orientée. */
function blocsPremisse(vue: Vue): readonly Bloc[] {
  const fausse = vue.question.premisse_fausse;
  if (fausse === undefined) return [];
  return [paragraphe("note", `Prémisse de la formulation, résolue au gel : ${fausse ? "fausse" : "vraie"}`)];
}

/** D27 (G) : la réponse attendue que le tirage a résolue au gel, champ par champ. */
function lignesAttendue(a: ReponseAttendue): readonly string[] {
  const t = a.resolution_temporelle;
  return [
    `Nature : ${a.nature}`,
    ...(a.position === undefined ? [] : [`Position : ${a.position}`]),
    ...(a.etat_attendu === undefined ? [] : [`État qui fait foi : ${a.etat_attendu}`]),
    ...(a.candidats_attendus === undefined ? [] : [`Candidats attendus : ${a.candidats_attendus.length === 0 ? "aucun" : a.candidats_attendus.join(", ")}`]),
    `Résolue au gel du ${t.date_gel}${t.date_changement === undefined ? "" : `, changement du ${t.date_changement}`} (règle ${t.regle})`,
  ];
}

/** D27 (E) : le texte de chaque page citée, tel que le juge le reçoit, ou la raison de son absence. */
function blocPage(page: PageCitee, borne: number): Bloc {
  if (!page.texte_disponible) {
    return { genre: "groupe", element: "div", classe: "page-citee", blocs: [paragraphe("note", `Page citée ${page.url_citee} — pas de texte : ${page.raison}`)] };
  }
  const longueur = `${page.longueur_totale} points de code${page.tronque ? `, tronqué aux ${borne} premiers` : ""}`;
  return {
    genre: "groupe",
    element: "div",
    classe: "page-citee",
    blocs: [
      paragraphe("note", `Page citée ${page.url_citee} — texte de la copie (${page.origine}) · empreinte du texte ${page.texte_sha256} · ${longueur}`),
      ...(page.tronque ? [paragraphe("alerte", "Texte de la page tronqué à la borne de la charge.")] : []),
      paragraphe("page", page.texte),
    ],
  };
}

function blocsPages(vue: Vue): readonly Bloc[] {
  const borne = paragraphe("note", `Borne du texte transmis par page : ${vue.longueur_max_texte_page} points de code`);
  if (vue.pages_citees.length === 0) return [borne, paragraphe("note", "Aucune page citée.")];
  return [borne, ...vue.pages_citees.map((page) => blocPage(page, vue.longueur_max_texte_page))];
}

function blocsAvertissements(vue: Vue): readonly Bloc[] {
  return [
    ...(vue.reponse.troncature ? [paragraphe("alerte", "Réponse tronquée par l'outil.")] : []),
    ...(vue.reponse.refus_api ? [paragraphe("alerte", "Refus de modération de l'API.")] : []),
  ];
}

/**
 * Le contenu du volet gauche, dans l'ordre d'affichage : question (registre, prémisse), réponse
 * attendue, réponse, avertissements, liens, citations, pages citées, références.
 */
export function contenuVue(vue: Vue): readonly Bloc[] {
  return [
    paragraphe("note", `Question ${vue.question.gabarit} · registre ${vue.question.registre} · run du ${vue.date_run} · réponse ${vue.reponse_id}`),
    titre(2, "Question posée"),
    paragraphe("question", vue.question.texte),
    ...blocsPremisse(vue),
    titre(3, "Réponse attendue"),
    { genre: "liste", classe: null, lignes: lignesAttendue(vue.reponse_attendue) },
    titre(2, "Réponse"),
    ...blocsAvertissements(vue),
    paragraphe("reponse", vue.reponse.texte),
    titre(3, "Liens cités"),
    ...blocsLiens(vue),
    ...blocsCitations(vue),
    titre(3, "Pages citées"),
    ...blocsPages(vue),
    titre(2, "Items de référence"),
    ...vue.references.map(reference),
  ];
}

/** Le texte de la structure, une ligne par texte : ce que lit l'annotateur, et ce que le test compare. */
export function aplatir(blocs: readonly Bloc[]): string {
  return blocs.map(texteDe).join("\n");
}

function texteDe(bloc: Bloc): string {
  switch (bloc.genre) {
    case "titre":
    case "paragraphe":
      return bloc.texte;
    case "liste":
      return bloc.lignes.join("\n");
    case "groupe":
      return aplatir(bloc.blocs);
  }
}
