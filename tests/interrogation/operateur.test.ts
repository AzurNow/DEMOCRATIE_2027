/**
 * Ce que la commande dit d'une requête en attente de l'opérateur (§6, D55 (5)) : le code de sortie
 * documenté dans l'en-tête de `pnpm run:dry` (`outils/run-dry.ts`), et le message qui nomme la
 * requête, la tentative, la cause et le fichier d'octets gardé.
 */

import { describe, expect, it } from "vitest";
import type { EnAttenteOperateur } from "../../pipeline/interrogation/executer.ts";
import { CODE_RECUE_NON_STOCKEE, messageAttenteOperateur } from "../../pipeline/interrogation/operateur.ts";

const ITEM: EnAttenteOperateur = {
  genre: "en_attente_operateur",
  requete: {
    outil_id: "outil-alpha",
    mode: "web_desactivee",
    question_id: "q_test",
    formulation_id: "formulation-test",
    echantillon: 1,
  },
  numero: 2,
  chemin_octets: "/tmp/exemple.2.octets",
  cause: "Corps HTTP 200 qui n'est pas de l'UTF-8 valide.",
};

describe("opérateur : requête en attente (§6, D55 (5))", () => {
  it("le code de sortie est non nul, documenté dans l'en-tête de outils/run-dry.ts", () => {
    expect(CODE_RECUE_NON_STOCKEE).toBe(4);
  });

  it("le message nomme la requête, la tentative, la cause et le fichier d'octets gardé", () => {
    const message = messageAttenteOperateur(ITEM);
    expect(message).toContain("outil-alpha");
    expect(message).toContain("web_desactivee");
    expect(message).toContain("q_test");
    expect(message).toContain("formulation-test");
    expect(message).toContain("tentative 2");
    expect(message).toContain("/tmp/exemple.2.octets");
    expect(message).toContain(ITEM.cause);
    expect(message).toContain("opérateur");
    expect(message).toContain("n'est pas renvoyée");
  });
});
