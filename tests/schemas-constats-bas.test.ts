/**
 * Constats bas de la passe de conformité du 2026-09-24 portés par les schémas :
 *
 * - n° 59 (§5.28) : les deux quotas du tirage sont inscrits dans le fichier de tirage publié ;
 * - n° 61 (§6.10) : `modele_renvoye` et `latence_ms` sont des clés obligatoires d'une réponse d'API ;
 * - n° 62 (§6.19) : une lecture de comparateur respecte toujours robots.txt ;
 * - n° 64 (§7.11) : un lien mort ne « soutient » rien, et le sourçage retenu porte sur un même lien ;
 * - n° 66 (§9.16) : la version des données figure dans tout run publié.
 *
 * Chaque cas part d'un exemple valide réel et n'en change qu'un point ; un cas invalide vérifie que
 * TOUTES les erreurs rapportées portent sur le point changé ou sur un de ses ancêtres.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { NomSchema } from "../outils/schemas/noms.ts";
import { erreurDeSchema } from "../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLES = resolve(import.meta.dirname, "../schema/exemples");

function lire(fichier: string): Objet {
  return JSON.parse(readFileSync(resolve(EXEMPLES, fichier), "utf8")) as Objet;
}

function chemins(nom: NomSchema, objet: Objet): readonly string[] {
  const erreur = erreurDeSchema(nom, objet, "test");
  return erreur === null ? [] : erreur.chemins;
}

/** Au moins une erreur sur `cible` ou sous elle, et toutes les autres sur elle ou un ancêtre. */
function toutesSous(cible: string): (liste: readonly string[]) => boolean {
  const sous = (c: string) => c === cible || c.startsWith(`${cible}/`);
  const ancetre = (c: string) => c === "" || cible.startsWith(`${c}/`);
  return (liste) => liste.length > 0 && liste.some(sous) && liste.every((c) => sous(c) || ancetre(c));
}

/* ------------------------------------------------------------------ n° 59 */

describe("conformité n° 59 : les quotas du tirage sont publiés avec lui", () => {
  const tirage = (): Objet => lire("tirage/valide-01-tirage-nominal.json");

  it("l'exemple nominal porte ses deux quotas et reste valide", () => {
    expect(tirage()["parametres"]).toEqual({ questions_par_strate: 1, questions_attribution_par_theme: 1 });
    expect(chemins("tirage", tirage())).toEqual([]);
  });

  it("un tirage sans quota est invalide", () => {
    const objet = tirage();
    delete objet["parametres"];
    expect(chemins("tirage", objet)).toEqual([""]);
  });

  it("un tirage sans quota d'attribution est invalide", () => {
    const objet = tirage();
    objet["parametres"] = { questions_par_strate: 1 };
    expect(chemins("tirage", objet)).toSatisfy(toutesSous("/parametres"));
  });

  it("un quota nul n'est pas un quota", () => {
    const objet = tirage();
    objet["parametres"] = { questions_par_strate: 0, questions_attribution_par_theme: 1 };
    expect(chemins("tirage", objet)).toSatisfy(toutesSous("/parametres/questions_par_strate"));
  });
});

/* ------------------------------------------------------------------ n° 61 */

describe("conformité n° 61 : modèle renvoyé et latence d'une réponse d'API", () => {
  const reponse = (): Objet => lire("reponse/valide-01-api-obtenue.json");
  const metadonnees = (objet: Objet): Objet => objet["metadonnees"] as Objet;

  it("une réponse d'API sans la clé modele_renvoye est invalide", () => {
    const objet = reponse();
    delete metadonnees(objet)["modele_renvoye"];
    expect(chemins("reponse", objet)).toSatisfy(toutesSous("/metadonnees"));
  });

  it("modele_renvoye null reste admis : le schéma prévoit que l'API ne le renvoie pas", () => {
    const objet = reponse();
    metadonnees(objet)["modele_renvoye"] = null;
    expect(chemins("reponse", objet)).toEqual([]);
  });

  it("une réponse d'API sans la clé latence_ms est invalide", () => {
    const objet = reponse();
    delete metadonnees(objet)["latence_ms"];
    expect(chemins("reponse", objet)).toSatisfy(toutesSous("/metadonnees"));
  });

  it("une latence null est invalide : le client la mesure toujours", () => {
    const objet = reponse();
    metadonnees(objet)["latence_ms"] = null;
    expect(chemins("reponse", objet)).toSatisfy(toutesSous("/metadonnees/latence_ms"));
  });

  it("une réponse du canal application, sans API, n'exige ni l'un ni l'autre", () => {
    const objet = lire("reponse/invalide-04-application-sans-saisie-manuelle.json");
    objet["saisie_manuelle"] = {
      testeur_id: "t1",
      horodatage_saisie: "2026-12-05T10:00:00+01:00",
      captures: [{ sha256: "a".repeat(64), chemin_local: "captures/t1-0001.png" }],
    };
    // §6 (0.31, D73 (12)) : une saisie de l'application ne porte pas de troncature.
    delete (objet["normalise"] as Record<string, unknown>)["troncature"];
    delete metadonnees(objet)["modele_renvoye"];
    delete metadonnees(objet)["latence_ms"];
    expect(chemins("reponse", objet)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ n° 62 */

describe("conformité n° 62 : la lecture d'un comparateur respecte robots.txt", () => {
  function lecturePages(robots: boolean): Objet {
    return {
      ...lire("lecture-comparateur/valide-01-position-affichee.json"),
      methode_acces: "lecture_pages",
      robots_respecte: robots,
      cadence_max_pages_par_seconde: 1,
    };
  }

  it("une lecture de pages qui respecte robots.txt est valide", () => {
    expect(chemins("lecture-comparateur", lecturePages(true))).toEqual([]);
  });

  it("robots_respecte: false est invalide", () => {
    expect(chemins("lecture-comparateur", lecturePages(false))).toSatisfy(toutesSous("/robots_respecte"));
  });
});

/* ------------------------------------------------------------------ n° 64 */

describe("conformité n° 64 : un lien mort ne soutient rien", () => {
  function notationAvecLien(existence: string, soutien: string): Objet {
    return {
      ...lire("notation/valide-01-juge-exacte.json"),
      sourcage: {
        cite: true,
        liens: [
          {
            url_citee: "https://exemple-candidat.fr/programme",
            verdict_existence: existence,
            verdict_soutien: soutien,
            date_test: "2026-12-03T10:00:00+01:00",
          },
        ],
      },
    };
  }

  it("un lien mort qui « soutient » est invalide", () => {
    expect(chemins("notation", notationAvecLien("mort", "soutient"))).toSatisfy(
      toutesSous("/sourcage/liens/0"),
    );
  });

  it("un lien mort sans objet de soutien est valide", () => {
    expect(chemins("notation", notationAvecLien("mort", "non_applicable"))).toEqual([]);
  });

  it("un lien vivant qui soutient est valide", () => {
    expect(chemins("notation", notationAvecLien("existe", "soutient"))).toEqual([]);
  });

  function verdictAvec(cite: boolean, existant: boolean, soutenant: boolean): Objet {
    return {
      ...lire("verdict/valide-01-accord-des-deux-juges.json"),
      sourcage_retenu: { cite, au_moins_un_lien_existant: existant, au_moins_un_lien_soutenant: soutenant },
    };
  }

  it("un verdict qui conclut au soutien sans lien vivant est invalide", () => {
    expect(chemins("verdict", verdictAvec(true, false, true))).toSatisfy(toutesSous("/sourcage_retenu"));
  });

  it("un verdict qui trouve un lien vivant sans en citer aucun est invalide", () => {
    expect(chemins("verdict", verdictAvec(false, true, false))).toSatisfy(toutesSous("/sourcage_retenu"));
  });

  it("un même lien vivant et soutenant : le verdict conclut au soutien", () => {
    expect(chemins("verdict", verdictAvec(true, true, true))).toEqual([]);
  });

  it("un lien vivant non soutenant : le verdict ne conclut pas au soutien, et reste valide", () => {
    expect(chemins("verdict", verdictAvec(true, true, false))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ n° 66 */

describe("conformité n° 66 : la version des données figure dans tout run, publié ou non", () => {
  function runSansDonnees(statut: string): Objet {
    const objet = lire("run/valide-01-mensuel-publie.json");
    delete (objet["versions"] as Objet)["donnees_commit"];
    objet["statut"] = statut;
    return objet;
  }

  it("un run publié sans donnees_commit est invalide", () => {
    expect(chemins("run", runSansDonnees("publie"))).toSatisfy(toutesSous("/versions"));
  });

  it("un run publié provisoire sans donnees_commit est invalide", () => {
    const objet: Objet = { ...runSansDonnees("publie_provisoire"), motif_provisoire: "kappa de la paire sous 0,75" };
    // Modifié ouvertement (conformité 2026-09-29, n° 15) : la décision du go/no-go suit le statut,
    // pour que la seule erreur reste l'absence de donnees_commit.
    (objet["go_no_go"] as Objet)["decision"] = "publie_provisoire";
    // Modifié ouvertement (lot go-no-go, D24 (3)) : un provisoire porte au moins un critère rouge,
    // celui que dit motif_provisoire.
    const go = objet["go_no_go"] as { criteres: Objet[] };
    go.criteres = go.criteres.map((critere) => (critere["code"] === "kappa_juges_humains" ? { ...critere, statut: "rouge" } : critere));
    expect(chemins("run", objet)).toSatisfy(toutesSous("/versions"));
  });

  it("un run invalidé, publié lui aussi (§6), sans donnees_commit est invalide", () => {
    const objet = { ...runSansDonnees("invalide"), invalidation: { motif: "panne du fournisseur", date: "2026-12-02T10:00:00+01:00" } };
    // Modifié ouvertement (protocole 0.13, §12) : un run invalide ne porte pas de go/no-go. Celui de
    // valide-01 est retiré pour que la seule erreur reste l'absence de donnees_commit.
    delete (objet as Objet)["go_no_go"];
    expect(chemins("run", objet)).toSatisfy(toutesSous("/versions"));
  });

  it("un run planifié l'exige aussi : la barrière recoupe les items avec ce commit dès le gel", () => {
    // Modifié ouvertement (décision de l'auteur du 2026-10-01, conformité 2026-09-29, n° 9) : avant,
    // un run planifié pouvait omettre donnees_commit ; `pnpm symmetry` le refusait pourtant au gel.
    expect(chemins("run", runSansDonnees("planifie"))).toSatisfy(toutesSous("/versions"));
  });
});
