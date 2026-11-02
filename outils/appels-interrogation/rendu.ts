/**
 * Le rendu de `docs/APPELS-INTERROGATION.md` (§9, « Reproductibilité » ; D59 (16), protocole 0.24) :
 * « Relancer l'interrogation elle-même exige des clés de chaque éditeur ; le protocole renvoie à
 * `docs/APPELS-INTERROGATION.md`, document engendré depuis le code de l'interrogation, qui documente
 * exactement quels appels faire. »
 *
 * Rien n'y est recopié à la main : les conditions viennent de `pipeline/interrogation/conditions.ts`,
 * les en-têtes retirés de `editeur.ts`, et chaque requête est **construite par l'adaptateur
 * lui-même** (`construireRequete`, `parametresEffectifs`), avec une clé fictive, un modèle et un
 * texte en marque-place. Un adaptateur qui change sa requête change le document ; le test
 * `tests/appels-interrogation.test.ts` échoue tant que le fichier n'est pas réengendré.
 *
 * Pur : aucune lecture, aucune écriture, aucun appel réseau. `outils/appels-interrogation.ts` écrit.
 */

import {
  ATTENTES_AVANT_RELANCE_MS,
  DELAI_TENTATIVE_MS,
  DUREE_FENETRE_MS,
  ECHANTILLONS,
  FUSEAU_DU_RUN,
  HEURE_OUVERTURE_FENETRE,
  JOUR_OUVERTURE_FENETRE,
  TENTATIVES_MAX,
  TOKENS_SORTIE_MAX,
} from "../../pipeline/interrogation/conditions.ts";
import { EN_TETES_AUTHENTIFICATION, type Adaptateur } from "../../pipeline/interrogation/editeur.ts";
import { adaptateurSimule } from "../../pipeline/interrogation/editeur-simule.ts";
import { MODES, type Mode } from "../../pipeline/interrogation/types.ts";

/** La clé mise à la place de celle de l'éditeur : jamais une vraie clé dans un fichier publié (§9). */
export const CLE_FICTIVE = "<CLE_API_DE_L_EDITEUR>";
const MODELE_FICTIF = "<modele_demande de config/perimetre.yaml>";
const TEXTE_FICTIF = "<texte exact de la formulation, tel que dans questions.json>";

export interface AdaptateurDocumente {
  readonly nom: string;
  /** `simule` : sans réseau (`pnpm run:dry`) ; `reel` : l'API d'un éditeur. */
  readonly nature: "simule" | "reel";
  readonly usage: string;
  readonly fabrique: (cle_api: string) => Adaptateur;
}

/**
 * Les adaptateurs d'interrogation du code. Un adaptateur d'éditeur réel s'ajoute ici le jour où il
 * est écrit (D3) : c'est ce qui le fait entrer dans le document.
 */
export const ADAPTATEURS_DOCUMENTES: readonly AdaptateurDocumente[] = [
  {
    nom: "editeur-simule",
    nature: "simule",
    usage: "`pnpm run:dry` et les tests ; aucun appel réseau, aucune réponse réelle",
    fabrique: adaptateurSimule,
  },
];

function secondes(ms: number): string {
  return `${ms / 1000} s`;
}

function blocJson(valeur: unknown): string {
  return ["```json", JSON.stringify(valeur, null, 2), "```"].join("\n");
}

function conditions(): string {
  const [avant2, avant3] = ATTENTES_AVANT_RELANCE_MS;
  return [
    "## Conditions figées (§6)",
    "",
    "Valeurs lues dans `pipeline/interrogation/conditions.ts`, identiques pour tous les outils.",
    "",
    "| Condition | Valeur |",
    "| --- | --- |",
    `| Tentatives par requête, au plus | ${TENTATIVES_MAX} |`,
    `| Attente avant la tentative 2, puis 3 | ${secondes(avant2)}, puis ${secondes(avant3)} |`,
    `| Abandon d'une tentative sans réponse | ${secondes(DELAI_TENTATIVE_MS)} |`,
    `| Tokens de sortie, au plus | ${TOKENS_SORTIE_MAX} |`,
    `| Échantillons par question, formulation et mode | ${ECHANTILLONS} |`,
    `| Fenêtre | ${DUREE_FENETRE_MS / 3_600_000} h, semi-ouverte, ouverte le jour \`${JOUR_OUVERTURE_FENETRE}\` à ${HEURE_OUVERTURE_FENETRE} h, fuseau \`${FUSEAU_DU_RUN}\` |`,
    `| Modes | ${MODES.map((mode) => `\`${mode}\``).join(", ")}, ceux que l'outil déclare dans \`perimetre.outils[].modes\` |`,
    "",
  ].join("\n");
}

function ordre(): string {
  return [
    "## Plan d'interrogation (`pipeline/interrogation/plan.ts`)",
    "",
    "- Sont interrogés les assistants inclus du périmètre du run ; un comparateur est lu, pas interrogé.",
    "- Une file par outil, indépendante des autres. Tous les échantillons 1 partent avant les échantillons 2.",
    "- Dans un échantillon : ordre croissant de l'identifiant de question, puis du mode, puis de l'identifiant de formulation (comparaison de chaînes, `outils/ordre-chaines.ts`). Aucune graine.",
    "- Une requête est une conversation neuve : un seul message, le texte exact de la formulation, sans instruction système ni historique.",
    "",
  ].join("\n");
}

function enregistrement(): string {
  const noms = EN_TETES_AUTHENTIFICATION.map((nom) => `\`${nom}\``).join(", ");
  return [
    "## Ce qui est enregistré",
    "",
    `La requête complète est enregistrée avec la réponse (\`schema/reponse.schema.json\`), en-têtes compris, à l'exception des en-têtes d'authentification, retirés par nom sans égard à la casse : ${noms}, et ceux que déclare l'adaptateur de l'éditeur (ci-dessous). C'est le seul retrait autorisé (règle 7).`,
    "",
  ].join("\n");
}

function requeteDansLeMode(adaptateur: Adaptateur, mode: Mode): string {
  const requete = adaptateur.construireRequete({ texte: TEXTE_FICTIF, mode, modele_demande: MODELE_FICTIF });
  return [
    `#### Mode \`${mode}\``,
    "",
    `Point d'accès : \`${requete.endpoint}\``,
    "",
    "En-têtes envoyés :",
    "",
    blocJson(requete.entetes),
    "",
    "Corps :",
    "",
    blocJson(requete.corps),
    "",
    "Paramètres effectifs enregistrés (`metadonnees.parametres_effectifs`) :",
    "",
    blocJson(adaptateur.parametresEffectifs(requete)),
    "",
  ].join("\n");
}

function sectionAdaptateur(documente: AdaptateurDocumente): string {
  const adaptateur = documente.fabrique(CLE_FICTIVE);
  const propres = adaptateur.entetes_authentification.map((nom) => `\`${nom}\``).join(", ");
  return [
    `### \`${documente.nom}\` (${documente.nature === "simule" ? "simulé" : "réel"})`,
    "",
    `Usage : ${documente.usage}.`,
    "",
    `Normalisation : \`${adaptateur.normalisation.fonction}\`, version \`${adaptateur.normalisation.version}\`.`,
    "",
    `En-têtes d'authentification propres à l'éditeur, retirés à l'enregistrement : ${propres === "" ? "aucun" : propres}.`,
    "",
    ...MODES.map((mode) => requeteDansLeMode(adaptateur, mode)),
  ].join("\n");
}

function adaptateurs(): string {
  const reels = ADAPTATEURS_DOCUMENTES.filter((a) => a.nature === "reel");
  const avertissement =
    reels.length === 0
      ? ["Aucun adaptateur d'éditeur réel n'est encore écrit : les appels ci-dessous sont ceux de l'éditeur simulé, sans réseau.", ""]
      : [];
  return [
    "## Appels, par adaptateur",
    "",
    `Requêtes construites par l'adaptateur lui-même, avec \`${CLE_FICTIVE}\` à la place de la clé, \`${MODELE_FICTIF}\` à la place du modèle et \`${TEXTE_FICTIF}\` à la place du texte.`,
    "",
    ...avertissement,
    ...ADAPTATEURS_DOCUMENTES.map(sectionAdaptateur),
  ].join("\n");
}

export function genererAppelsInterrogation(): string {
  const entete = [
    "# Appels de l'interrogation",
    "",
    "<!-- Fichier engendré par `pnpm appels-interrogation` depuis le code de `pipeline/interrogation/`. Ne pas éditer à la main. -->",
    "",
    "§9 du protocole : relancer l'interrogation exige les clés de chaque éditeur ; ce document dit exactement quels appels faire. Il est engendré depuis le code, et `tests/appels-interrogation.test.ts` échoue s'il n'est pas à jour.",
    "",
  ].join("\n");
  return `${[entete, conditions(), ordre(), enregistrement(), adaptateurs()].join("\n").trimEnd()}\n`;
}
