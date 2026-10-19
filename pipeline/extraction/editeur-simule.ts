/**
 * Les éditeurs d'extraction simulés : un adaptateur et un transport sans réseau par enveloppe, pour
 * les tests et le futur `pnpm extraire --simule`.
 *
 * Deux enveloppes : celle de l'API Messages d'Anthropic, lue par `texteDesMessages`, et celle de
 * l'API de chat de Mistral, lue par `texteDuChatTermine` — les mêmes lecteurs que les adaptateurs
 * réels. Les deux adaptateurs portent des identifiants distincts, préfixés `simule/` : aucune sortie
 * simulée ne passe pour celle d'un modèle réel.
 *
 * Aucun contenu réel : la sortie conforme porte un item dont le libellé et la paraphrase sont des
 * marques de simulation, jamais une affirmation plausible sur un candidat ; sa citation est la
 * première ligne du texte canonique reçu qui n'y figure qu'une fois (test verbatim), pour que le
 * cœur la localise. Un texte sans ligne unique lève une erreur : l'issue n'est jamais remplacée en
 * silence par une sortie vide.
 *
 * L'issue de chaque demande est déterministe : choisie par `choisir`, par exemple d'après
 * l'empreinte de la demande et de l'enveloppe (`choixParEmpreinte`). Issues : sortie conforme,
 * `{"items": []}`, JSON entouré d'un bloc de code, 500, 200 dont le corps n'est pas du JSON, sortie
 * coupée (`max_tokens` côté Anthropic, `length` côté Mistral), refus (`refusal`, Anthropic seulement).
 */

import { canoniser, sha256 } from "../../validation/domaine/empreinte.ts";
import { testerVerbatim } from "../../validation/domaine/verbatim.ts";
import type { Contenu, ReponseHttp, RequeteHttp, Transport } from "../interrogation/editeur.ts";
import { modeleDuCorps, type AdaptateurExtraction, type EditeurExtraction, type LectureTexteModele, type NomEditeur } from "./editeur.ts";
import { texteDesMessages } from "./editeur-anthropic.ts";
import { texteDuChatTermine } from "./editeur-mistral.ts";
import { rendrePromptExtraction, type VariablesExtraction } from "./prompt.ts";

export const MODELE_SIMULE_ANTHROPIC = "simule/extraction-enveloppe-anthropic";
export const MODELE_SIMULE_MISTRAL = "simule/extraction-enveloppe-mistral";

export const ISSUES_SIMULEES = ["conforme", "vide", "bloc_de_code", "http_500", "non_json", "coupee", "refus"] as const;
export type IssueSimulee = (typeof ISSUES_SIMULEES)[number];
export type Choix = (demande: VariablesExtraction) => IssueSimulee;

/* -------------------------------------------------------------- enveloppes */

interface Enveloppe {
  readonly modele: string;
  readonly endpoint: string;
  readonly lecteur: (contenu: Contenu) => LectureTexteModele;
  /** Le corps d'une réponse terminée normalement qui porte ce texte du modèle. */
  readonly terminee: (texte: string, prompt: string) => string;
  /** Le corps d'une réponse coupée par `max_tokens` qui porte ce début de texte. */
  readonly coupee: (texte: string, prompt: string) => string;
  /** Le corps d'un refus du modèle, ou `null` si l'enveloppe n'en a pas. */
  readonly refus: ((prompt: string) => string) | null;
  readonly corps_500: string;
}

function identifiant(prompt: string): string {
  return sha256(prompt).slice(0, 12);
}

function messageAnthropic(prompt: string, content: readonly unknown[], stop_reason: string, enPlus: Record<string, unknown> = {}): string {
  return JSON.stringify({
    id: `msg_simule_${identifiant(prompt)}`,
    type: "message",
    role: "assistant",
    model: MODELE_SIMULE_ANTHROPIC,
    content,
    stop_reason,
    stop_sequence: null,
    ...enPlus,
    usage: { input_tokens: 0, output_tokens: 0 },
  });
}

/** Un bloc `thinking` au texte vide précède le texte, comme le mode adaptatif peut le rendre. */
function blocsAnthropic(texte: string): readonly unknown[] {
  return [
    { type: "thinking", thinking: "", signature: "simule" },
    { type: "text", text: texte },
  ];
}

function chatMistral(prompt: string, contenu: string, finish_reason: string): string {
  return JSON.stringify({
    id: `simule-${identifiant(prompt)}`,
    object: "chat.completion",
    created: 0,
    model: MODELE_SIMULE_MISTRAL,
    choices: [{ index: 0, message: { role: "assistant", content: contenu }, finish_reason }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  });
}

const ENVELOPPES: Readonly<Record<NomEditeur, Enveloppe>> = {
  anthropic: {
    modele: MODELE_SIMULE_ANTHROPIC,
    endpoint: "simule://anthropic.invalid/v1/messages",
    lecteur: texteDesMessages,
    terminee: (texte, prompt) => messageAnthropic(prompt, blocsAnthropic(texte), "end_turn"),
    coupee: (texte, prompt) => messageAnthropic(prompt, blocsAnthropic(texte), "max_tokens"),
    refus: (prompt) =>
      messageAnthropic(prompt, [], "refusal", { stop_details: { type: "refusal", explication: "Refus simulé, sans réseau." } }),
    corps_500: JSON.stringify({ type: "error", error: { type: "api_error", message: "Erreur interne simulée." } }),
  },
  mistral: {
    modele: MODELE_SIMULE_MISTRAL,
    endpoint: "simule://mistral.invalid/v1/chat/completions",
    lecteur: texteDuChatTermine,
    terminee: (texte, prompt) => chatMistral(prompt, texte, "stop"),
    coupee: (texte, prompt) => chatMistral(prompt, texte, "length"),
    refus: null,
    corps_500: JSON.stringify({ object: "error", message: "Erreur interne simulée.", type: "internal_error", code: "simule_500" }),
  },
};

/** Les issues que chaque enveloppe sait produire : le refus n'existe que chez Anthropic. */
export const ISSUES_PAR_ENVELOPPE: Readonly<Record<NomEditeur, readonly IssueSimulee[]>> = {
  anthropic: ISSUES_SIMULEES,
  mistral: ISSUES_SIMULEES.filter((issue) => issue !== "refus"),
};

/* ------------------------------------------------------------------ issues */

/** L'issue d'une demande, lue dans l'empreinte de l'enveloppe et des variables : la même demande, la même issue. */
export function choixParEmpreinte(enveloppe: NomEditeur): Choix {
  const issues = ISSUES_PAR_ENVELOPPE[enveloppe];
  return (demande) => {
    const empreinte = sha256(canoniser({ modele: ENVELOPPES[enveloppe].modele, demande }));
    const issue = issues[Number.parseInt(empreinte.slice(0, 8), 16) % issues.length];
    if (issue === undefined) throw new Error("Indice d'issue simulée hors bornes.");
    return issue;
  };
}

/** La première ligne non vide du texte qui n'y figure qu'une fois après normalisation (test verbatim). */
function citationUnique(texte: string): string {
  for (const ligne of texte.split(/[\n\f]/u)) {
    const citation = ligne.trim();
    if (citation.length > 0 && testerVerbatim(citation, texte).occurrences === 1) return citation;
  }
  throw new Error("Éditeur simulé : aucune ligne du texte canonique n'y figure une seule fois, aucune citation simulée n'est possible.");
}

function sortieConforme(demande: VariablesExtraction): string {
  return JSON.stringify({
    items: [
      {
        type: "P",
        candidat_id: demande.candidat_id,
        mesure_proposee: { libelle: "[simulé] mesure sans contenu réel", theme: "institutions_democratie" },
        position: "pour",
        citation_verbatim: citationUnique(demande.texte_canonique),
        paraphrase: "[simulé] aucune position réelle n'est affirmée.",
      },
    ],
  });
}

interface Corps {
  readonly statut: number;
  readonly texte: string;
}

function refusDe(enveloppe: Enveloppe, prompt: string): Corps {
  if (enveloppe.refus === null) throw new Error(`Éditeur simulé : l'enveloppe de ${enveloppe.modele} n'a pas d'issue « refus ».`);
  return { statut: 200, texte: enveloppe.refus(prompt) };
}

/** Le corps de chaque issue, en données : une issue ajoutée sans production ne compile pas. */
const PRODUCTIONS: Readonly<Record<IssueSimulee, (enveloppe: Enveloppe, demande: VariablesExtraction, prompt: string) => Corps>> = {
  conforme: (enveloppe, demande, prompt) => ({ statut: 200, texte: enveloppe.terminee(sortieConforme(demande), prompt) }),
  vide: (enveloppe, _demande, prompt) => ({ statut: 200, texte: enveloppe.terminee(JSON.stringify({ items: [] }), prompt) }),
  bloc_de_code: (enveloppe, demande, prompt) => ({
    statut: 200,
    texte: enveloppe.terminee(`\`\`\`json\n${sortieConforme(demande)}\n\`\`\``, prompt),
  }),
  http_500: (enveloppe) => ({ statut: 500, texte: enveloppe.corps_500 }),
  non_json: () => ({ statut: 200, texte: "<html><body>Réponse simulée qui n'est pas du JSON.</body></html>" }),
  coupee: (enveloppe, demande, prompt) => {
    const complete = sortieConforme(demande);
    return { statut: 200, texte: enveloppe.coupee(complete.slice(0, Math.floor(complete.length / 2)), prompt) };
  },
  refus: (enveloppe, _demande, prompt) => refusDe(enveloppe, prompt),
};

/* --------------------------------------------------------------- transport */

function promptDeLaRequete(requete: RequeteHttp): string {
  const messages = requete.corps["messages"];
  const premier: unknown = Array.isArray(messages) ? (messages as readonly unknown[])[0] : undefined;
  const contenu: unknown = typeof premier === "object" && premier !== null ? (premier as Record<string, unknown>)["content"] : undefined;
  if (typeof contenu !== "string") throw new Error("Éditeur simulé : requête sans messages[0].content textuel.");
  return contenu;
}

export class TransportSimuleExtraction implements Transport {
  /** Chaque requête reçue, dans l'ordre : ce que le serveur simulé a vu. */
  readonly recues: RequeteHttp[] = [];
  private readonly enveloppe: Enveloppe;
  private readonly demandes: ReadonlyMap<string, VariablesExtraction>;
  private readonly choisir: Choix;

  constructor(enveloppe: Enveloppe, demandes: ReadonlyMap<string, VariablesExtraction>, choisir: Choix) {
    this.enveloppe = enveloppe;
    this.demandes = demandes;
    this.choisir = choisir;
  }

  envoyer(requete: RequeteHttp): Promise<ReponseHttp> {
    this.recues.push(requete);
    const prompt = promptDeLaRequete(requete);
    const demande = this.demandes.get(prompt);
    if (demande === undefined) throw new Error("Éditeur simulé : prompt reçu pour aucune demande connue.");
    const { statut, texte } = PRODUCTIONS[this.choisir(demande)](this.enveloppe, demande, prompt);
    return Promise.resolve({ statut, corps: new TextEncoder().encode(texte) });
  }
}

function adaptateurSimule(enveloppe: Enveloppe): AdaptateurExtraction {
  return {
    modele: enveloppe.modele,
    construireRequete: (prompt) => ({
      endpoint: enveloppe.endpoint,
      entetes: { "content-type": "application/json" },
      corps: { model: enveloppe.modele, messages: [{ role: "user", content: prompt }] },
    }),
    texteDuModele: enveloppe.lecteur,
    modeleServiPar: modeleDuCorps,
  };
}

/** L'éditeur simulé de cette enveloppe pour ces demandes, rendues avec ce texte de prompt. */
export function editeurSimule(
  enveloppe: NomEditeur,
  texte_prompt: string,
  demandes: readonly VariablesExtraction[],
  choisir: Choix,
): EditeurExtraction & { readonly transport: TransportSimuleExtraction } {
  const parPrompt = new Map(demandes.map((demande) => [rendrePromptExtraction(texte_prompt, demande), demande]));
  const lue = ENVELOPPES[enveloppe];
  return { adaptateur: adaptateurSimule(lue), transport: new TransportSimuleExtraction(lue, parPrompt, choisir) };
}
