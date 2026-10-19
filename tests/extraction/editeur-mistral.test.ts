/**
 * Adaptateur Mistral de l'extraction (décision D52 (1)) : même requête que la reformulation, avec
 * les réglages de l'extraction ; lecture qui exige en plus `finish_reason` = `stop`.
 * Cas limites 4, 5 et 6 du brief de la PR 2.
 */

import { describe, expect, it } from "vitest";
import type { Contenu, ReponseHttp } from "../../pipeline/interrogation/editeur.ts";
import { lireContenu } from "../../pipeline/interrogation/editeur.ts";
import { ENDPOINT_MISTRAL } from "../../pipeline/reformulation/editeur-mistral.ts";
import {
  adaptateurMistralExtraction,
  texteDuChatTermine,
  type ReglagesMistral,
} from "../../pipeline/extraction/editeur-mistral.ts";

const REGLAGES: ReglagesMistral = {
  modele: "modele-mistral-test",
  temperature: 0,
  max_tokens: 8000,
  random_seed: 7,
  delai_abandon_ms: 120_000,
};

function chat(content: unknown, finish: Record<string, unknown> = { finish_reason: "stop" }): Contenu {
  const brut = { object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", content }, ...finish }] };
  return { forme: "objet", brut };
}

function reponse(statut: number, texte: string): ReponseHttp {
  return { statut, corps: new TextEncoder().encode(texte) };
}

describe("requête Mistral de l'extraction", () => {
  const requete = adaptateurMistralExtraction(REGLAGES, "cle-factice").construireRequete("Le prompt rendu.");

  it("POST sur l'API de chat, clé dans Authorization", () => {
    expect(requete.endpoint).toBe(ENDPOINT_MISTRAL);
    expect(requete.entetes["authorization"]).toBe("Bearer cle-factice");
  });

  it("corps : le prompt seul, et exactement les réglages envoyés de l'extraction", () => {
    expect(requete.corps).toEqual({
      model: REGLAGES.modele,
      messages: [{ role: "user", content: "Le prompt rendu." }],
      temperature: REGLAGES.temperature,
      max_tokens: REGLAGES.max_tokens,
      random_seed: REGLAGES.random_seed,
    });
  });

  it("clé vide ⇒ refus avant toute requête", () => {
    expect(() => adaptateurMistralExtraction(REGLAGES, "")).toThrow(/vide/u);
  });

  it("lit avec le lecteur de l'extraction, pas celui de la reformulation", () => {
    const adaptateur = adaptateurMistralExtraction(REGLAGES, "x");
    expect(adaptateur.texteDuModele(chat("x", { finish_reason: "length" })).lisible).toBe(false);
  });
});

describe("cas limite 4 : finish_reason", () => {
  it("stop ⇒ le texte", () => {
    expect(texteDuChatTermine(chat('{"items": []}'))).toEqual({ lisible: true, texte: '{"items": []}' });
  });

  it("length ⇒ illisible, sortie coupée, la valeur est nommée", () => {
    const lecture = texteDuChatTermine(chat('{"items": [', { finish_reason: "length" }));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) expect(lecture.raison).toMatch(/^corps\.choices\[0\]\.finish_reason vaut "length", attendu "stop"/u);
  });

  it("une autre valeur ⇒ illisible, nommée telle quelle", () => {
    expect(texteDuChatTermine(chat("x", { finish_reason: "model_length" }))).toEqual({
      lisible: false,
      raison: 'corps.choices[0].finish_reason vaut "model_length", attendu "stop".',
    });
  });

  it("finish_reason absent ⇒ illisible", () => {
    expect(texteDuChatTermine(chat("x", {}))).toEqual({
      lisible: false,
      raison: "corps.choices[0].finish_reason absent : la fin de la sortie n'est pas attestée.",
    });
  });

  it("les cas de texteDuChat restent couverts : content nul", () => {
    expect(texteDuChatTermine(chat(null))).toEqual({
      lisible: false,
      raison: "corps.choices[0].message.content n'est pas un texte (null).",
    });
  });

  it("les cas de texteDuChat restent couverts : liste de morceaux, jamais recomposée", () => {
    expect(texteDuChatTermine(chat([{ type: "text", text: "x" }])).lisible).toBe(false);
  });

  it("les cas de texteDuChat restent couverts : choices absent ou vide", () => {
    const sans = { forme: "objet", brut: { object: "chat.completion" } } as const;
    expect(texteDuChatTermine(sans)).toEqual({ lisible: false, raison: "corps.choices absent." });
    const vide = { forme: "objet", brut: { choices: [] } } as const;
    expect(texteDuChatTermine(vide)).toEqual({ lisible: false, raison: "corps.choices[0] absent." });
  });
});

describe("cas limite 5 : texte du modèle rendu tel quel, octet pour octet", () => {
  const textes = ['```json\n{"items": []}\n```', '   {"items": []}\n\n', '{"items": []}\r\n'];

  for (const texte of textes) {
    it(`${JSON.stringify(texte)} ⇒ identique, depuis les octets du corps`, () => {
      const corps = JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: texte }, finish_reason: "stop" }] });
      expect(texteDuChatTermine(lireContenu(reponse(200, corps)))).toEqual({ lisible: true, texte });
    });
  }
});

describe("cas limite 6 : corps 2xx non JSON", () => {
  it("un corps HTML ⇒ illisible", () => {
    expect(texteDuChatTermine(lireContenu(reponse(200, "<html>pas du JSON</html>")))).toEqual({
      lisible: false,
      raison: "réponse 2xx dont le corps n'est pas un objet JSON.",
    });
  });
});

describe("constat 17 : model servi par l'enveloppe", () => {
  const adaptateur = adaptateurMistralExtraction(REGLAGES, "cle-factice");

  function chatAvecModel(model: unknown): Contenu {
    return { forme: "objet", brut: { object: "chat.completion", model, choices: [] } };
  }

  it("corps.model, tel quel", () => {
    expect(adaptateur.modeleServiPar(chatAvecModel("un-autre-modele"))).toBe("un-autre-modele");
    expect(adaptateur.modeleServiPar(chatAvecModel(REGLAGES.modele))).toBe(REGLAGES.modele);
  });

  it("corps non JSON, ou model absent ⇒ null : rien n'est affirmé sans le lire", () => {
    expect(adaptateur.modeleServiPar(lireContenu(reponse(200, "<html></html>")))).toBeNull();
    expect(adaptateur.modeleServiPar({ forme: "objet", brut: { object: "chat.completion", choices: [] } })).toBeNull();
  });
});
