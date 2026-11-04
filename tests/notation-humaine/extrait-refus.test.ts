/**
 * D33 : l'écran ne demande pas l'extrait justificatif sur un refus de l'API ; annexe C (protocole
 * 0.27) : ni sur une réponse au texte vide. Il le demande partout ailleurs. Le test d'alignement
 * confronte la règle de l'écran au schéma de notation : une non-réponse humaine sans extrait n'est
 * valide que marquée sur_refus_api ou sur_texte_vide, marqueurs que le serveur pose d'après la
 * réponse, et à la définition du texte vide du serveur (`reponseAuTexteVide`).
 */

import { describe, expect, it } from "vitest";
import { extraitDemande } from "../../notation-humaine/client/extrait.ts";
import { reponseAuTexteVide } from "../../pipeline/notation/extrait.ts";
import { erreurDeSchema } from "../../outils/schemas/valider.ts";
import { notationHumaine } from "../notation/fabriques.ts";

type VueReduite = Parameters<typeof extraitDemande>[0];
const vue = (refus_api: boolean, texte: string): VueReduite => ({ reponse: { refus_api, texte } }) as VueReduite;

describe("D33 et annexe C : extrait justificatif sur l'écran de notation humaine", () => {
  it("n'est pas demandé sur un refus de l'API ni sur un texte vide, l'est sur toute autre réponse", () => {
    expect(extraitDemande(vue(true, ""))).toBe(false);
    expect(extraitDemande(vue(false, ""))).toBe(false);
    expect(extraitDemande(vue(false, "Une réponse."))).toBe(true);
    expect(extraitDemande(vue(false, "   "))).toBe(true);
  });

  it("s'aligne sur la définition du serveur du texte vide", () => {
    for (const texte of ["", " ", "\n", "x"]) expect(extraitDemande(vue(false, texte))).toBe(!reponseAuTexteVide(texte));
  });

  it("s'aligne sur le schéma : sans extrait, une non-réponse humaine passe si et seulement si elle porte un marqueur", () => {
    for (const refus_api of [true, false]) {
      const notation = notationHumaine("a1", "echantillon_aleatoire_10", { categorie: "non_reponse", ...(refus_api ? { sur_refus_api: true as const } : {}) });
      const valide = erreurDeSchema("notation", notation, "non-réponse humaine sans extrait") === null;
      expect(valide).toBe(!extraitDemande(vue(refus_api, refus_api ? "" : "Une réponse.")));
    }
    const surTexteVide = notationHumaine("a1", "echantillon_aleatoire_10", { categorie: "non_reponse", sur_texte_vide: true });
    expect(erreurDeSchema("notation", surTexteVide, "non-réponse humaine au texte vide") === null).toBe(!extraitDemande(vue(false, "")));
  });
});
