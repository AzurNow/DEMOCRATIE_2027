/**
 * Adaptateur Anthropic de l'extraction (décision D52 (1)) : la requête envoyée à l'API Messages et la
 * lecture de l'unique bloc `text`, jamais concaténé. Cas limites 1, 2, 3, 5 et 6 du brief de la PR 2.
 * Aucun réseau : les réponses sont des objets construits ici.
 */

import { describe, expect, it } from "vitest";
import type { Contenu, ReponseHttp } from "../../pipeline/interrogation/editeur.ts";
import { lireContenu } from "../../pipeline/interrogation/editeur.ts";
import {
  adaptateurAnthropic,
  ENDPOINT_ANTHROPIC,
  texteDesMessages,
  type ReglagesAnthropic,
} from "../../pipeline/extraction/editeur-anthropic.ts";

const REGLAGES: ReglagesAnthropic = { modele: "modele-anthropic-test", max_tokens: 8000, effort: "high", delai_abandon_ms: 120_000 };

function objet(brut: Record<string, unknown>): Contenu {
  return { forme: "objet", brut };
}

function message(content: unknown, enPlus: Record<string, unknown> = {}): Contenu {
  return objet({ id: "msg_test", type: "message", role: "assistant", content, stop_reason: "end_turn", ...enPlus });
}

function reponse(statut: number, texte: string): ReponseHttp {
  return { statut, corps: new TextEncoder().encode(texte) };
}

describe("cas limite 1 : requête Anthropic", () => {
  const requete = adaptateurAnthropic(REGLAGES, "cle-factice").construireRequete("Le prompt rendu.");

  it("POST sur /v1/messages", () => {
    expect(requete.endpoint).toBe("https://api.anthropic.com/v1/messages");
    expect(requete.endpoint).toBe(ENDPOINT_ANTHROPIC);
  });

  it("en-têtes exacts : clé, version d'API, type de contenu, aucun en-tête beta", () => {
    expect(requete.entetes).toEqual({
      "x-api-key": "cle-factice",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
  });

  it("le corps n'a que model, max_tokens, messages et output_config : ni temperature, ni thinking, ni fallbacks, ni system", () => {
    expect(Object.keys(requete.corps).sort()).toEqual(["max_tokens", "messages", "model", "output_config"]);
    for (const interdite of ["temperature", "top_p", "top_k", "thinking", "fallbacks", "system"]) {
      expect(Object.hasOwn(requete.corps, interdite)).toBe(false);
    }
  });

  it("corps : le prompt seul en message utilisateur, les réglages tels quels", () => {
    expect(requete.corps).toEqual({
      model: REGLAGES.modele,
      max_tokens: REGLAGES.max_tokens,
      messages: [{ role: "user", content: "Le prompt rendu." }],
      output_config: { effort: REGLAGES.effort },
    });
  });

  it("la clé n'est jamais dans le corps", () => {
    expect(JSON.stringify(requete.corps)).not.toContain("cle-factice");
  });

  it("clé vide ⇒ refus avant toute requête", () => {
    expect(() => adaptateurAnthropic(REGLAGES, "")).toThrow(/vide/u);
  });

  it("l'identifiant du modèle est celui des réglages, tel quel", () => {
    expect(adaptateurAnthropic(REGLAGES, "x").modele).toBe(REGLAGES.modele);
  });
});

describe("cas limite 2 : lecture des blocs de content", () => {
  it("un bloc thinking au texte vide puis un bloc text ⇒ le texte exact du bloc text", () => {
    const lecture = texteDesMessages(message([{ type: "thinking", thinking: "", signature: "s" }, { type: "text", text: '{"items": []}' }]));
    expect(lecture).toEqual({ lisible: true, texte: '{"items": []}' });
  });

  it("aucun bloc text ⇒ illisible, la raison le dit", () => {
    const lecture = texteDesMessages(message([{ type: "thinking", thinking: "", signature: "s" }]));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) expect(lecture.raison).toMatch(/aucun bloc de type "text"/u);
  });

  it("deux blocs text ⇒ illisible, jamais concaténés", () => {
    const lecture = texteDesMessages(message([{ type: "text", text: '{"items": ' }, { type: "text", text: "[]}" }]));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) {
      expect(lecture.raison).toMatch(/2 blocs de type "text"/u);
      expect(lecture.raison).not.toContain('{"items": []}');
    }
  });

  it("text non chaîne ⇒ illisible, le type est nommé", () => {
    expect(texteDesMessages(message([{ type: "text", text: 42 }]))).toEqual({
      lisible: false,
      raison: "corps.content[0].text n'est pas un texte (number).",
    });
    expect(texteDesMessages(message([{ type: "text" }]))).toEqual({
      lisible: false,
      raison: "corps.content[0].text n'est pas un texte (absent).",
    });
  });

  it("content absent ⇒ illisible", () => {
    expect(texteDesMessages(objet({ type: "message", stop_reason: "end_turn" }))).toEqual({
      lisible: false,
      raison: "corps.content absent.",
    });
  });

  it("content non liste ⇒ illisible", () => {
    expect(texteDesMessages(message("du texte"))).toEqual({ lisible: false, raison: "corps.content n'est pas une liste (string)." });
    expect(texteDesMessages(message(null))).toEqual({ lisible: false, raison: "corps.content n'est pas une liste (null)." });
  });
});

describe("cas limite 3 : stop_reason", () => {
  const texte = [{ type: "text", text: '{"items": []}' }];

  it("max_tokens ⇒ illisible, sortie coupée, la valeur est nommée", () => {
    const lecture = texteDesMessages(message(texte, { stop_reason: "max_tokens" }));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) expect(lecture.raison).toMatch(/^corps\.stop_reason vaut "max_tokens", attendu "end_turn"/u);
  });

  it("refusal ⇒ illisible, stop_details recopié dans la raison", () => {
    const stop_details = { type: "refusal", category: "valeur-de-test" };
    const lecture = texteDesMessages(message([], { stop_reason: "refusal", stop_details }));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) {
      expect(lecture.raison).toContain('"refusal"');
      expect(lecture.raison).toContain(JSON.stringify(stop_details));
    }
  });

  it("pause_turn ⇒ illisible, la valeur est nommée", () => {
    const lecture = texteDesMessages(message(texte, { stop_reason: "pause_turn" }));
    expect(lecture.lisible).toBe(false);
    if (!lecture.lisible) expect(lecture.raison).toContain('"pause_turn"');
  });

  it("une valeur inconnue ⇒ illisible, nommée telle quelle", () => {
    const lecture = texteDesMessages(message(texte, { stop_reason: "valeur_future" }));
    expect(lecture).toEqual({ lisible: false, raison: 'corps.stop_reason vaut "valeur_future", attendu "end_turn".' });
  });

  it("stop_reason absent ⇒ illisible", () => {
    expect(texteDesMessages(objet({ type: "message", content: texte }))).toEqual({
      lisible: false,
      raison: "corps.stop_reason absent : la fin de la sortie n'est pas attestée.",
    });
  });

  it("stop_reason null ⇒ illisible, nommé null", () => {
    const lecture = texteDesMessages(message(texte, { stop_reason: null }));
    expect(lecture).toEqual({ lisible: false, raison: 'corps.stop_reason vaut null, attendu "end_turn".' });
  });
});

describe("cas limite 5 : texte du modèle rendu tel quel, octet pour octet", () => {
  const textes = [
    '```json\n{"items": []}\n```',
    '   {"items": []}\n\n',
    '{"items": []}\r\n',
    '\t{"items":\r\n[]}  ',
  ];

  for (const texte of textes) {
    it(`${JSON.stringify(texte)} ⇒ identique, depuis les octets du corps`, () => {
      const corps = JSON.stringify({ type: "message", content: [{ type: "text", text: texte }], stop_reason: "end_turn" });
      const lecture = texteDesMessages(lireContenu(reponse(200, corps)));
      expect(lecture).toEqual({ lisible: true, texte });
    });
  }
});

describe("cas limite 6 : corps 2xx non JSON", () => {
  it("un corps HTML ⇒ illisible", () => {
    const lecture = texteDesMessages(lireContenu(reponse(200, "<html>pas du JSON</html>")));
    expect(lecture).toEqual({ lisible: false, raison: "réponse 2xx dont le corps n'est pas un objet JSON." });
  });

  it("un tableau JSON ⇒ illisible : seul un objet porte une enveloppe", () => {
    expect(texteDesMessages(lireContenu(reponse(200, "[1, 2]"))).lisible).toBe(false);
  });
});

describe("constat 17 : model servi par l'enveloppe", () => {
  const adaptateur = adaptateurAnthropic(REGLAGES, "cle-factice");
  const content = [{ type: "text", text: '{"items": []}' }];

  it("corps.model, tel quel", () => {
    expect(adaptateur.modeleServiPar(message(content, { model: "un-autre-modele" }))).toBe("un-autre-modele");
    expect(adaptateur.modeleServiPar(message(content, { model: REGLAGES.modele }))).toBe(REGLAGES.modele);
  });

  it("corps non JSON, ou model absent ⇒ null : rien n'est affirmé sans le lire", () => {
    expect(adaptateur.modeleServiPar(lireContenu(reponse(200, "<html></html>")))).toBeNull();
    expect(adaptateur.modeleServiPar(message(content))).toBeNull();
  });
});
