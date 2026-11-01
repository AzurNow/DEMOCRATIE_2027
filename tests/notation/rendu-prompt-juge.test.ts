/**
 * Rendu du texte du prompt de juge depuis le fichier versionné et la charge (§7, annexe D, D.02).
 *
 * Le prompt de fixture (`fixtures/prompt-juge/prompt-juge-fixture.md`) a la forme d'un
 * `prompts/judge-*.md` (titre versionné, en-tête, phrase du marqueur d'absence, lignes de variables
 * optionnelles) et porte chacune des quatorze variables une fois. Le vrai prompt
 * (`prompts/judge-1.0.0.md`) n'est lu qu'en mémoire, jamais modifié : son en-tête annonce encore
 * `charge-juge-v3` (correction en PR de protocole séparée), il est donc refusé tel quel.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { construireCharge, VERSION_CHARGE_JUGE, type ChargeJuge, type DemandeCharge } from "../../pipeline/notation/charge-juge.ts";
import {
  CHAMPS_NON_RENDUS,
  lireSourcePromptJuge,
  rendrePromptJuge,
  RenduPromptJugeRefuse,
  VARIABLES_DE_CHARGE,
  versionDeChargeDuPrompt,
  type MotifRefusRendu,
} from "../../pipeline/notation/rendu-prompt-juge.ts";
import type { ReponseObtenue } from "../../pipeline/interrogation/types.ts";
import type { PageCitee } from "../../pipeline/notation/pages-citees.ts";
import type { ReponseAttendue } from "../../pipeline/questions/types.ts";
import { valider } from "../../outils/schemas/valider.ts";
import { RACINE_PROJET } from "../aides/depot.ts";
import { itemP } from "../aides/fabriques.ts";
import { ALIAS_CANDIDATS_TEST, aliasDeTest, CANDIDATS_DU_RUN, GEL_DES_TESTS, pagesSansTexte, RESOLU_POSITION_POUR } from "./fabriques.ts";

const FIXTURE = join(import.meta.dirname, "fixtures", "prompt-juge", "prompt-juge-fixture.md");
const PROMPT_REEL = join(RACINE_PROJET, "prompts", "judge-1.0.0.md");
const EXEMPLE = join(RACINE_PROJET, "schema", "exemples", "reponse", "valide-01-api-obtenue.json");

const LIEN_A = "https://exemple.invalid/programme";
const LIEN_B = "https://exemple.invalid/entretien";

/** Une citation telle qu'un éditeur la renvoie : la forme commune noyée dans des champs propres. */
const CITATION_EDITEUR = { type: "url_citation", url: LIEN_A, texte: "la TVA à 5,5 %", start_index: 3, cited_text: "propre-editeur" };

/** Identité d'un outil connu, posée sur chaque champ qui la porte dans la réponse stockée. */
const IDENTITE_OUTIL = {
  outil_id: "chatgpt",
  alias_aveugle: "QX42",
  editeur: "openai",
  modele: "gpt-5-chat-latest",
  normalisation: "normaliser_openai",
  endpoint: "https://api.openai.com/v1/responses",
};

function source(): string {
  return lireSourcePromptJuge(FIXTURE);
}

function reponse(normalise: Partial<ReponseObtenue["normalise"]> = {}): ReponseObtenue {
  const lue = valider<ReponseObtenue>("reponse", JSON.parse(readFileSync(EXEMPLE, "utf8")), EXEMPLE);
  return valider<ReponseObtenue>(
    "reponse",
    {
      ...lue,
      outil_id: IDENTITE_OUTIL.outil_id,
      alias_aveugle: IDENTITE_OUTIL.alias_aveugle,
      metadonnees: { ...lue.metadonnees, modele_demande: IDENTITE_OUTIL.modele, modele_renvoye: IDENTITE_OUTIL.modele },
      requete: { ...lue.requete, endpoint: IDENTITE_OUTIL.endpoint },
      normalisation: { fonction: IDENTITE_OUTIL.normalisation, version: "1.0.0" },
      normalise: {
        ...lue.normalise,
        texte: "Le candidat propose la TVA à 5,5 % sur l'énergie.",
        liens: [LIEN_A, LIEN_B, LIEN_A],
        citations: [CITATION_EDITEUR, { texte: "seul" }],
        ...normalise,
      },
    },
    "réponse de test",
  );
}

function pages(r: ReponseObtenue): readonly PageCitee[] {
  return pagesSansTexte([...new Set(r.normalise.liens)]);
}

/** Une demande complète : formulation orientée (prémisse présente) et citations présentes. */
function demande(r: ReponseObtenue = reponse()): DemandeCharge {
  return {
    reponse: r,
    question: { gabarit: "Q-ORI", registre: "oriente", texte: "Pourquoi Alix Martinez veut-elle la TVA à 5,5 % ?" },
    references: [{ item: itemP(), role: "principal" }],
    date_run: GEL_DES_TESTS,
    prompt: { chemin: "tests/notation/fixtures/prompt-juge/prompt-juge-fixture", version: "1.0.0" },
    resolu_au_gel: { ...RESOLU_POSITION_POUR, premisse_fausse: true },
    pages_citees: pages(r),
    alias_candidats: ALIAS_CANDIDATS_TEST,
  };
}

function charge(d: DemandeCharge = demande()): ChargeJuge {
  return construireCharge(d);
}

/** La charge qui désigne le vrai prompt (`notateur.version_prompt` : `prompts/judge-1.0.0@1.0.0`). */
function chargeDuVraiPrompt(d: DemandeCharge = demande()): ChargeJuge {
  return construireCharge({ ...d, prompt: { chemin: "prompts/judge-1.0.0", version: "1.0.0" } });
}

/** Le vrai prompt, son en-tête de charge aligné sur le code en mémoire seulement (le fichier reste intact). */
function vraiPromptAligne(): string {
  return readFileSync(PROMPT_REEL, "utf8").replace(/^(\| Charge \| `)[^`]+`/m, `$1${VERSION_CHARGE_JUGE}\``);
}

/** Une réponse dont la projection n'a pas de citations (champ absent, pas tableau vide). */
function reponseSansCitations(): ReponseObtenue {
  const avec = reponse();
  const { citations: _retirees, ...normalise } = avec.normalise;
  return { ...avec, normalise };
}

/** Une demande en formulation neutre (prémisse non transmise) et sans citations. */
function demandeNeutreSansCitations(): DemandeCharge {
  const d = demande(reponseSansCitations());
  return { ...d, question: { ...d.question, registre: "neutre" } };
}

/** Le refus levé par `rendre`, ou un échec du test s'il n'y en a pas. */
function refus(rendre: () => string): RenduPromptJugeRefuse {
  try {
    rendre();
  } catch (erreur) {
    if (erreur instanceof RenduPromptJugeRefuse) return erreur;
    throw erreur;
  }
  throw new Error("le rendu aurait dû être refusé");
}

function attendreRefus(rendre: () => string, motif: MotifRefusRendu, champs: readonly string[]): void {
  const leve = refus(rendre);
  expect(leve.name).toBe("RenduPromptJugeRefuse");
  expect(leve.motif).toBe(motif);
  expect(leve.champs).toEqual(champs);
  for (const champ of champs) expect(leve.message).toContain(champ);
}

function ligne(rendu: string, etiquette: string): string {
  const trouvee = rendu.split("\n").find((l) => l.startsWith(`${etiquette} : `));
  if (trouvee === undefined) throw new Error(`ligne ${etiquette} absente du rendu`);
  return trouvee.slice(etiquette.length + 3);
}

describe("rendu de la fixture : chaque variable remplacée par son champ", () => {
  it("scalaires recopiés tels quels, objets et tableaux en JSON compact dans l'ordre de la charge", () => {
    const c = charge();
    const rendu = rendrePromptJuge(source(), c);
    expect(ligne(rendu, "DATE")).toBe(GEL_DES_TESTS);
    expect(ligne(rendu, "GABARIT")).toBe("Q-ORI");
    expect(ligne(rendu, "REGISTRE")).toBe("oriente");
    expect(ligne(rendu, "PREMISSE")).toBe("true");
    expect(ligne(rendu, "QUESTION")).toBe("Pourquoi Alix Martinez veut-elle la TVA à 5,5 % ?");
    expect(ligne(rendu, "ATTENDUE")).toBe(JSON.stringify(c.reponse_attendue));
    expect(ligne(rendu, "TRONQUEE")).toBe("false");
    expect(ligne(rendu, "REFUS")).toBe("false");
    expect(ligne(rendu, "BORNE")).toBe(String(c.longueur_max_texte_page));
    expect(ligne(rendu, "PAGES")).toBe(JSON.stringify(c.pages_citees));
    expect(ligne(rendu, "REFERENCES")).toBe(JSON.stringify(c.references));
    expect(rendu).toContain("<<<\nLe candidat propose la TVA à 5,5 % sur l'énergie.\n>>>");
  });

  it("le texte rendu est le bloc « Texte du prompt » seul : ni l'en-tête, ni les clôtures", () => {
    const rendu = rendrePromptJuge(source(), charge());
    expect(rendu.startsWith("DATE : ")).toBe(true);
    expect(rendu.endsWith("{ … comme ci-dessus … }")).toBe(true);
    expect(rendu).not.toContain("```");
    expect(rendu).not.toContain("charge-juge-v5");
  });

  it("une réponse tronquée est rendue true ; un texte vide est rendu vide, jamais refusé comme absent", () => {
    const rendu = rendrePromptJuge(source(), charge(demande(reponse({ texte: "", troncature: true }))));
    expect(ligne(rendu, "TRONQUEE")).toBe("true");
    expect(rendu).toContain("<<<\n\n>>>");
  });

  it("déterministe : deux charges construites séparément donnent les mêmes octets", () => {
    const premier = Buffer.from(rendrePromptJuge(source(), charge()), "utf8");
    const second = Buffer.from(rendrePromptJuge(lireSourcePromptJuge(FIXTURE), construireCharge(demande())), "utf8");
    expect(premier.equals(second)).toBe(true);
  });

  it("aucune normalisation Unicode n'est appliquée : la charge ne l'est pas, le rendu non plus", () => {
    const decompose = "Le candidat a été clair.";
    const rendu = rendrePromptJuge(source(), charge(demande(reponse({ texte: decompose }))));
    expect(rendu).toContain(decompose);
    expect(rendu).not.toContain(decompose.normalize("NFC"));
  });
});

describe("liens, citations, question d'attribution", () => {
  it("doublons de liens conservés, dans l'ordre ; une page par lien distinct", () => {
    const rendu = rendrePromptJuge(source(), charge());
    expect(ligne(rendu, "LIENS")).toBe(JSON.stringify([LIEN_A, LIEN_B, LIEN_A]));
    expect(JSON.parse(ligne(rendu, "PAGES"))).toHaveLength(2);
  });

  it("citations projetées telles quelles sur { url, texte } : un champ absent reste absent", () => {
    const rendu = rendrePromptJuge(source(), charge());
    expect(ligne(rendu, "CITATIONS")).toBe(JSON.stringify([{ url: LIEN_A, texte: "la TVA à 5,5 %" }, { texte: "seul" }]));
    for (const cle of ["url_citation", "start_index", "cited_text", "propre-editeur"]) expect(rendu).not.toContain(cle);
  });

  it("une liste de citations vide est rendue [] : elle est présente, pas absente", () => {
    const rendu = rendrePromptJuge(source(), charge(demande(reponse({ citations: [] }))));
    expect(ligne(rendu, "CITATIONS")).toBe("[]");
  });

  it("Q-ATT : la liste attendue est rendue par alias, aucun identifiant ni libellé de candidat", () => {
    const reponse_attendue: ReponseAttendue = {
      nature: "liste_candidats",
      candidats_attendus: CANDIDATS_DU_RUN.map((c) => c.candidat_id),
      resolution_temporelle: { date_gel: GEL_DES_TESTS, regle: "semi_ouvert" },
    };
    const d: DemandeCharge = {
      ...demande(),
      question: { gabarit: "Q-ATT", registre: "oriente", texte: "Quels candidats proposent la prime aux marcheurs ?" },
      resolu_au_gel: { reponse_attendue, premisse_fausse: false },
    };
    const rendu = rendrePromptJuge(source(), charge(d));
    expect(ligne(rendu, "GABARIT")).toBe("Q-ATT");
    expect(ligne(rendu, "PREMISSE")).toBe("false");
    expect(JSON.parse(ligne(rendu, "ATTENDUE"))).toMatchObject({ candidats_attendus: CANDIDATS_DU_RUN.map((c) => aliasDeTest(c.candidat_id)) });
    for (const candidat of CANDIDATS_DU_RUN) {
      expect(rendu).not.toContain(`"${candidat.candidat_id}"`);
      expect(rendu).not.toContain(candidat.libelle);
    }
  });
});

describe("substitution en une passe : le contenu n'est jamais réinterprété", () => {
  it("des variables, des accolades et des motifs de remplacement dans la réponse restent tels quels", () => {
    const piege = "Voir {reponse.liens}, {date_run}, {outil_id}, {{references}} et $& $1 $$ $`.";
    const rendu = rendrePromptJuge(source(), charge(demande(reponse({ texte: piege, citations: [{ texte: "{question.texte}" }] }))));
    expect(rendu).toContain(`<<<\n${piege}\n>>>`);
    expect(ligne(rendu, "CITATIONS")).toBe(JSON.stringify([{ texte: "{question.texte}" }]));
    expect(ligne(rendu, "DATE")).toBe(GEL_DES_TESTS);
  });

  it("les accolades du gabarit qui ne sont pas des variables (exemples JSON) sont recopiées", () => {
    const rendu = rendrePromptJuge(source(), charge());
    expect(ligne(rendu, "SORTIE")).toBe('{"categorie": "…", "drapeaux": [ … ]} ou { … comme ci-dessus … }');
  });
});

describe("aveuglement : l'identité de l'outil n'apparaît jamais dans le rendu", () => {
  it("ni l'identifiant, ni l'alias, ni l'éditeur, ni le modèle, ni la normalisation, ni le point d'accès", () => {
    const rendu = rendrePromptJuge(source(), charge()).toLowerCase();
    for (const valeur of Object.values(IDENTITE_OUTIL)) expect(rendu).not.toContain(valeur.toLowerCase());
  });

  it("le même rendu sur le texte du vrai prompt, son en-tête aligné en mémoire seulement", () => {
    for (const d of [demande(), demandeNeutreSansCitations()]) {
      const rendu = rendrePromptJuge(vraiPromptAligne(), chargeDuVraiPrompt(d)).toLowerCase();
      for (const valeur of Object.values(IDENTITE_OUTIL)) expect(rendu).not.toContain(valeur.toLowerCase());
      expect(rendu).not.toMatch(/\{[a-z_]+(?:\.[a-z_]+)*\}/);
    }
  });
});

describe("champ absent : le marqueur que déclare le prompt, sur ses seuls champs optionnels", () => {
  it("formulation neutre (prémisse non transmise) : rendue ABSENT", () => {
    const d: DemandeCharge = { ...demande(), question: { ...demande().question, registre: "neutre" } };
    expect(ligne(rendrePromptJuge(source(), charge(d)), "PREMISSE")).toBe("ABSENT");
  });

  it("réponse sans citations : rendue ABSENT (et un tableau vide reste [], testé plus haut)", () => {
    expect(ligne(rendrePromptJuge(source(), charge(demande(reponseSansCitations()))), "CITATIONS")).toBe("ABSENT");
  });

  it("les deux absents à la fois, sur le vrai prompt aussi", () => {
    const rendu = rendrePromptJuge(source(), charge(demandeNeutreSansCitations()));
    expect(ligne(rendu, "PREMISSE")).toBe("ABSENT");
    expect(ligne(rendu, "CITATIONS")).toBe("ABSENT");
    const reel = rendrePromptJuge(vraiPromptAligne(), chargeDuVraiPrompt(demandeNeutreSansCitations()));
    expect(reel).toContain("- Prémisse de la formulation orientée, fausse à la date du run : ABSENT\n");
    expect(reel).toContain("- Citations jointes par l'outil : ABSENT\n");
  });

  it("un champ que le prompt ne déclare pas optionnel, absent : refus nommé champ_absent", () => {
    const c = charge();
    const { texte: _texte, ...question } = c.question;
    const { troncature: _troncature, ...reponseSansTroncature } = c.reponse;
    const sansTexte = { ...c, question } as ChargeJuge;
    const sansTroncature = { ...c, reponse: reponseSansTroncature } as ChargeJuge;
    const { date_run: _date, ...sansDate } = c;
    attendreRefus(() => rendrePromptJuge(source(), sansTexte), "champ_absent", ["question.texte"]);
    attendreRefus(() => rendrePromptJuge(source(), sansTroncature), "champ_absent", ["reponse.troncature"]);
    attendreRefus(() => rendrePromptJuge(source(), sansDate as ChargeJuge), "champ_absent", ["date_run"]);
  });

  it("une ligne de variable qui ne prévoit pas le marqueur rend le champ obligatoire", () => {
    const stricte = source().replace(" ; `ABSENT` hors formulation orientée", "");
    attendreRefus(() => rendrePromptJuge(stricte, charge(demandeNeutreSansCitations())), "champ_absent", ["question.premisse_fausse"]);
    expect(ligne(rendrePromptJuge(stricte, charge(demande(reponseSansCitations()))), "CITATIONS")).toBe("ABSENT");
  });

  it("un prompt qui ne déclare aucun marqueur : tout champ absent est refusé, aucun mot inventé", () => {
    const sansMarqueur = source().replace(/^Un champ absent de la charge est rendu par le mot .*\n/m, "");
    attendreRefus(() => rendrePromptJuge(sansMarqueur, charge(demandeNeutreSansCitations())), "champ_absent", ["question.premisse_fausse", "reponse.citations"]);
  });

  it("un prompt qui déclare deux marqueurs : refus nommé, jamais départagé", () => {
    const deux = source().replace("## Variables d'entrée\n", "## Variables d'entrée\n\nUn champ absent de la charge est rendu par le mot `VIDE`.\n");
    attendreRefus(() => rendrePromptJuge(deux, charge()), "marqueur_absence_ambigu", ["VIDE", "ABSENT"]);
  });
});

/**
 * Choix : distinguable par construction. Le marqueur n'est admis que sur les champs optionnels, dont
 * la valeur présente est un booléen (`premisse_fausse`) ou un tableau JSON (`citations`) : elle ne
 * peut pas s'écrire ABSENT. Un texte (réponse, question) qui vaut « ABSENT » est recopié tel quel,
 * et ce champ ne peut jamais être absent. Une valeur d'un champ optionnel qui se rendrait comme le
 * marqueur est refusée.
 */
describe("valeur réelle égale à la chaîne ABSENT", () => {
  it("un texte de réponse ou de question qui vaut ABSENT est recopié : ces champs ne sont jamais absents", () => {
    const d = demande(reponse({ texte: "ABSENT" }));
    const rendu = rendrePromptJuge(source(), charge({ ...d, question: { ...d.question, texte: "ABSENT" } }));
    expect(rendu).toContain("<<<\nABSENT\n>>>");
    expect(ligne(rendu, "QUESTION")).toBe("ABSENT");
  });

  it("une citation dont le texte vaut ABSENT reste un tableau JSON, distinct du marqueur", () => {
    const rendu = rendrePromptJuge(source(), charge(demande(reponse({ citations: [{ texte: "ABSENT" }] }))));
    expect(ligne(rendu, "CITATIONS")).toBe('[{"texte":"ABSENT"}]');
  });

  it("un champ optionnel dont la valeur présente se rendrait ABSENT : refus nommé", () => {
    const c = charge();
    const confondue = { ...c, reponse: { ...c.reponse, citations: "ABSENT" } } as unknown as ChargeJuge;
    attendreRefus(() => rendrePromptJuge(source(), confondue), "valeur_confondue_avec_marqueur", ["reponse.citations"]);
  });
});

describe("le fichier lu est celui que désigne la charge (chemin et version)", () => {
  it("chemin différent de charge.prompt.chemin : refus nommé, les deux identités citées", () => {
    const autre = construireCharge({ ...demande(), prompt: { chemin: "prompts/judge-1.0.0", version: "1.0.0" } });
    attendreRefus(() => rendrePromptJuge(source(), autre), "prompt_discordant", [
      "tests/notation/fixtures/prompt-juge/prompt-juge-fixture@1.0.0",
      "prompts/judge-1.0.0@1.0.0",
    ]);
  });

  it("version différente de charge.prompt.version : refus nommé", () => {
    const autre = construireCharge({ ...demande(), prompt: { chemin: "tests/notation/fixtures/prompt-juge/prompt-juge-fixture", version: "1.0.1" } });
    attendreRefus(() => rendrePromptJuge(source(), autre), "prompt_discordant", [
      "tests/notation/fixtures/prompt-juge/prompt-juge-fixture@1.0.0",
      "tests/notation/fixtures/prompt-juge/prompt-juge-fixture@1.0.1",
    ]);
  });

  it("le vrai prompt sous une charge qui désigne la fixture : refus nommé", () => {
    attendreRefus(() => rendrePromptJuge(vraiPromptAligne(), charge()), "prompt_discordant", [
      "prompts/judge-1.0.0@1.0.0",
      "tests/notation/fixtures/prompt-juge/prompt-juge-fixture@1.0.0",
    ]);
  });

  it("ligne Version ou titre versionné absents, ou en double : refus nommé, jamais d'identité par défaut", () => {
    const sansVersion = source().replace(/^\| Version \|.*\n/m, "");
    const sansTitre = source().replace("# Prompt de fixture — version 1.0.0", "# Prompt de fixture");
    const deuxTitres = source().replace("## Texte du prompt", "# Autre — version 2.0.0\n\n## Texte du prompt");
    for (const fautive of [sansVersion, sansTitre, deuxTitres]) {
      attendreRefus(() => rendrePromptJuge(fautive, charge()), "en_tete_sans_identite_prompt", []);
    }
  });
});

describe("rien ne se perd en silence", () => {
  it("variable du prompt inconnue de la charge : refus nommé", () => {
    const avec = source().replace("REFERENCES : {references}", "REFERENCES : {references}\nOUTIL : {outil_id} {reponse.normalisation}");
    attendreRefus(() => rendrePromptJuge(avec, charge()), "variable_inconnue", ["outil_id", "reponse.normalisation"]);
  });

  it("champ non rendu par la charge (exclu par le prompt) employé comme variable : refus nommé", () => {
    const avec = source().replace("DATE : {date_run}", "DATE : {date_run} {reponse_id}");
    attendreRefus(() => rendrePromptJuge(avec, charge()), "variable_inconnue", ["reponse_id"]);
  });

  it("champ de la charge que le prompt n'utilise pas : refus nommé", () => {
    const sans = source().replace("REFERENCES : {references}\n", "").replace("TRONQUEE : {reponse.troncature}\n", "");
    attendreRefus(() => rendrePromptJuge(sans, charge()), "champ_non_rendu", ["reponse.troncature", "references"]);
  });

  it("champ de la charge inconnu du rendu (ajouté sans mettre le rendu à jour) : refus nommé", () => {
    const enrichie = { ...charge(), outil_id: IDENTITE_OUTIL.outil_id } as ChargeJuge;
    const enrichieReponse = { ...charge(), reponse: { ...charge().reponse, modele: IDENTITE_OUTIL.modele } } as ChargeJuge;
    attendreRefus(() => rendrePromptJuge(source(), enrichie), "champ_non_rendu", ["outil_id"]);
    attendreRefus(() => rendrePromptJuge(source(), enrichieReponse), "champ_non_rendu", ["reponse.modele"]);
  });

  it("la liste des champs exclus est celle que déclare le prompt, sans recouvrement avec les variables", () => {
    expect([...CHAMPS_NON_RENDUS].sort()).toEqual(["prompt", "reponse_id", "version_charge", "version_normalisation_verbatim"]);
    expect(VARIABLES_DE_CHARGE).toHaveLength(14);
    for (const champ of CHAMPS_NON_RENDUS) expect(VARIABLES_DE_CHARGE).not.toContain(champ);
  });
});

describe("version de la charge annoncée par le prompt", () => {
  it("lit la version de l'en-tête de la fixture", () => {
    expect(versionDeChargeDuPrompt(source())).toBe(VERSION_CHARGE_JUGE);
  });

  it("en-tête ≠ VERSION_CHARGE_JUGE : refus nommé, les deux versions citées", () => {
    const ancienne = source().replace("`charge-juge-v5`", "`charge-juge-v3`");
    attendreRefus(() => rendrePromptJuge(ancienne, charge()), "version_charge_discordante", ["charge-juge-v3", VERSION_CHARGE_JUGE]);
  });

  it("charge d'une autre version que le code : refus nommé", () => {
    const autre = { ...charge(), version_charge: "charge-juge-v4" };
    attendreRefus(() => rendrePromptJuge(source(), autre), "version_charge_discordante", ["charge-juge-v4", VERSION_CHARGE_JUGE]);
  });

  it("en-tête sans ligne Charge, ou avec deux : refus nommé, jamais de version par défaut", () => {
    const sans = source().replace(/^\| Charge \|.*\n/m, "");
    attendreRefus(() => rendrePromptJuge(sans, charge()), "en_tete_sans_version_charge", []);
    const deux = source().replace(/^(\| Charge \|.*\n)/m, "$1| Charge | `charge-juge-v5` |\n");
    attendreRefus(() => rendrePromptJuge(deux, charge()), "en_tete_sans_version_charge", []);
  });

  // Au 2026-11-01, l'en-tête annonce charge-juge-v3 : le vrai prompt est refusé. Quand la PR de
  // protocole l'aura aligné, le même test exige qu'il soit rendu, sans retouche ici.
  it("le vrai prompt tel qu'inscrit est rendu si et seulement si son en-tête annonce VERSION_CHARGE_JUGE", () => {
    const reel = readFileSync(PROMPT_REEL, "utf8");
    const annoncee = versionDeChargeDuPrompt(reel);
    expect(annoncee).toMatch(/^charge-juge-v\d+$/);
    const rendre = (): string => rendrePromptJuge(reel, chargeDuVraiPrompt());
    if (annoncee === VERSION_CHARGE_JUGE) expect(rendre).not.toThrow();
    else attendreRefus(rendre, "version_charge_discordante", [annoncee, VERSION_CHARGE_JUGE]);
  });
});

describe("bloc « Texte du prompt »", () => {
  it("absent, ou sans clôture : refus nommé", () => {
    attendreRefus(() => rendrePromptJuge(source().replace("## Texte du prompt", "## Autre titre"), charge()), "texte_du_prompt_introuvable", []);
    const sansCloture = source().replace(/\n```\n?$/, "\n");
    attendreRefus(() => rendrePromptJuge(sansCloture, charge()), "texte_du_prompt_introuvable", []);
  });
});
