/**
 * `schema/run.schema.json` : les règles du périmètre d'un run que la passe de conformité du
 * 2026-09-24 signalait comme non gardées.
 *
 * - n° 21 : une symétrie rouge n'admet que `planifie` ou `invalide` (§5, §12 en 0.11) ;
 * - n° 19 : `sous_seuil` est lié à `items_p_verifies` dans les deux sens (§4) ;
 * - n° 10 : le régime d'inclusion est déclaré ; avant la liste officielle, un candidat non retiré
 *   porte sa déclaration et au moins deux preuves de sondage ; après, la liste archivée (§3) ;
 * - un assistant inclus d'un run publié, même provisoire, déclare `par_mode` (§8, §12 en 0.11).
 *
 * Chaque cas part de l'exemple valide réel et n'en change qu'un point ; un cas invalide vérifie
 * que TOUTES les erreurs rapportées portent sur le point changé ou sur un de ses ancêtres.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { erreurDeSchema } from "../outils/schemas/valider.ts";

type Objet = Record<string, unknown>;

const EXEMPLE = resolve(import.meta.dirname, "../schema/exemples/run/valide-01-mensuel-publie.json");

const LISTE_OFFICIELLE = {
  url: "https://conseil.invalid/liste-officielle-2027",
  date_publication: "2027-03-10",
  sha256: "a".repeat(64),
  archive_url: "https://web.archive.org/web/20270310/https://conseil.invalid/liste-officielle-2027",
};

function runValide(): Objet {
  return JSON.parse(readFileSync(EXEMPLE, "utf8")) as Objet;
}

/** Le go/no-go de l'exemple valide, décidé provisoire avec le critère `rouge` au rouge (D24 (3)). */
function goNoGoProvisoire(rouge: string): Objet {
  const go = runValide()["go_no_go"] as { criteres: Objet[] };
  const criteres = go.criteres.map((critere) => (critere["code"] === rouge ? { ...critere, statut: "rouge" } : critere));
  return { criteres, decision: "publie_provisoire", motif: `Critère(s) go/no-go du §12 au rouge : ${rouge}.` };
}

function perimetre(run: Objet): Objet {
  return run["perimetre"] as Objet;
}

function candidat(run: Objet, indice: number): Objet {
  return (perimetre(run)["candidats"] as Objet[])[indice] as Objet;
}

function outil(run: Objet, indice: number): Objet {
  return (perimetre(run)["outils"] as Objet[])[indice] as Objet;
}

function chemins(run: Objet): readonly string[] {
  const erreur = erreurDeSchema("run", run, "test");
  return erreur === null ? [] : erreur.chemins;
}

/** Au moins une erreur sur `cible` ou sous elle, et toutes les autres sur elle ou un ancêtre. */
function toutesSous(cible: string): (liste: readonly string[]) => boolean {
  const sous = (c: string) => c === cible || c.startsWith(`${cible}/`);
  const ancetre = (c: string) => c === "" || cible.startsWith(`${c}/`);
  return (liste) => liste.some(sous) && liste.every((c) => sous(c) || ancetre(c));
}

/** Symétrie rouge, sans go/no-go : un run qui n'a pas atteint la décision de publication. */
function rougeAvecStatut(statut: string): Objet {
  const run = runValide();
  run["statut"] = statut;
  (run["symetrie"] as Objet)["statut_global"] = "rouge";
  delete run["go_no_go"];
  return run;
}

describe("conformité n° 21 : symétrie rouge ⇒ planifié ou invalide", () => {
  it("accepte un run planifié dont la symétrie est rouge (il ne part pas)", () => {
    expect(chemins(rougeAvecStatut("planifie"))).toEqual([]);
  });

  it("accepte un run invalide dont la symétrie est rouge, avec sa raison", () => {
    const run = rougeAvecStatut("invalide");
    run["invalidation"] = { motif: "Tests de symétrie rouges : répartition des gabarits non conforme.", date: "2026-12-02T10:00:00+01:00" };
    expect(chemins(run)).toEqual([]);
  });

  it("refuse un run invalide pour symétrie rouge sans sa raison (règle existante)", () => {
    const erreur = erreurDeSchema("run", rougeAvecStatut("invalide"), "test");
    expect(erreur?.chemins).toEqual(["", ""]);
    expect(erreur?.message).toContain("must have required property 'invalidation'");
  });

  it("refuse un run en cours dont la symétrie est rouge", () => {
    expect(chemins(rougeAvecStatut("en_cours"))).toSatisfy(toutesSous("/statut"));
  });

  it("refuse un run publié dont la symétrie est rouge", () => {
    expect(chemins(rougeAvecStatut("publie"))).toSatisfy(toutesSous("/statut"));
  });

  it("refuse un run publié provisoire dont la symétrie est rouge (ancienne lecture, avant 0.11)", () => {
    const run = rougeAvecStatut("publie_provisoire");
    run["motif_provisoire"] = "Tests de symétrie rouges.";
    // Modifié ouvertement (lot go-no-go, D24 (3)) : un provisoire porte au moins un critère rouge,
    // ici celui de la symétrie, pour que la seule erreur reste le statut.
    run["go_no_go"] = { ...goNoGoProvisoire("tests_symetrie") };
    expect(chemins(run)).toSatisfy(toutesSous("/statut"));
  });

  it("n'impose rien au statut quand la symétrie est un écart toléré", () => {
    const run = runValide();
    (run["symetrie"] as Objet)["statut_global"] = "ecart_tolere";
    expect(chemins(run)).toEqual([]);
  });
});

describe("conformité n° 19 : sous_seuil lié à items_p_verifies dans les deux sens", () => {
  function avecCouverture(items: number, sousSeuil: boolean): Objet {
    const run = runValide();
    candidat(run, 0)["items_p_verifies"] = items;
    candidat(run, 0)["sous_seuil"] = sousSeuil;
    return run;
  }

  it("accepte 10 items P et sous_seuil faux", () => {
    expect(chemins(avecCouverture(10, false))).toEqual([]);
  });

  it("refuse 10 items P et sous_seuil vrai", () => {
    expect(chemins(avecCouverture(10, true))).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("refuse 9 items P et sous_seuil faux", () => {
    expect(chemins(avecCouverture(9, false))).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("accepte 9 items P et sous_seuil vrai", () => {
    expect(chemins(avecCouverture(9, true))).toEqual([]);
  });

  it("refuse 25 items P et sous_seuil vrai", () => {
    expect(chemins(avecCouverture(25, true))).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("accepte 0 item P et sous_seuil vrai", () => {
    expect(chemins(avecCouverture(0, true))).toEqual([]);
  });
});

describe("conformité n° 11 : la liste des items P au gel est figée dans le run", () => {
  it("l'exemple réel porte, pour chaque candidat, autant d'identifiants que items_p_verifies", () => {
    for (const c of perimetre(runValide())["candidats"] as Objet[]) {
      expect((c["items_p_au_gel"] as unknown[]).length).toBe(c["items_p_verifies"]);
    }
  });

  it("refuse un candidat sans items_p_au_gel", () => {
    const run = runValide();
    delete candidat(run, 0)["items_p_au_gel"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("refuse un identifiant listé deux fois", () => {
    const run = runValide();
    const liste = candidat(run, 1)["items_p_au_gel"] as string[];
    liste.push(liste[0] as string);
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/1/items_p_au_gel"));
  });

  it("refuse un identifiant qui n'est pas un ULID", () => {
    const run = runValide();
    (candidat(run, 1)["items_p_au_gel"] as string[])[0] = "item-lisible";
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/1/items_p_au_gel/0"));
  });
});

describe("conformité n° 10 : régime avant la liste officielle", () => {
  it("l'exemple réel déclare le régime avant la liste", () => {
    expect(perimetre(runValide())["regime_inclusion"]).toBe("avant_liste_officielle");
  });

  it("refuse un run qui ne déclare pas son régime", () => {
    const run = runValide();
    delete perimetre(run)["regime_inclusion"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });

  it("refuse un candidat actif avec une seule preuve de sondage", () => {
    const run = runValide();
    (candidat(run, 0)["preuves_inclusion"] as unknown[]).pop();
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("refuse un candidat actif sans aucune preuve", () => {
    const run = runValide();
    delete candidat(run, 0)["preuves_inclusion"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("refuse un candidat actif sans déclaration de candidature", () => {
    const run = runValide();
    delete candidat(run, 0)["declaration_candidature"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/0"));
  });

  it("refuse un candidat nouveau sans déclaration de candidature", () => {
    const run = runValide();
    expect(candidat(run, 1)["statut_au_gel"]).toBe("nouveau");
    delete candidat(run, 1)["declaration_candidature"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/candidats/1"));
  });

  it("n'exige aucune preuve d'un candidat retiré (règle préservée)", () => {
    const run = runValide();
    const retire = candidat(run, 2);
    expect(retire["statut_au_gel"]).toBe("retire");
    expect(retire).not.toHaveProperty("preuves_inclusion");
    expect(retire).not.toHaveProperty("declaration_candidature");
    expect(chemins(run)).toEqual([]);
  });

  it("accepte un candidat retiré qui garde une seule preuve", () => {
    const run = runValide();
    candidat(run, 2)["preuves_inclusion"] = [(candidat(run, 0)["preuves_inclusion"] as unknown[])[0]];
    expect(chemins(run)).toEqual([]);
  });

  it("refuse la liste officielle dans le régime avant la liste", () => {
    const run = runValide();
    perimetre(run)["liste_officielle"] = LISTE_OFFICIELLE;
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });
});

describe("conformité n° 10 : régime de la liste officielle", () => {
  function regimeListe(): Objet {
    const run = runValide();
    perimetre(run)["regime_inclusion"] = "liste_officielle";
    perimetre(run)["liste_officielle"] = LISTE_OFFICIELLE;
    for (const indice of [0, 1]) {
      delete candidat(run, indice)["preuves_inclusion"];
      delete candidat(run, indice)["declaration_candidature"];
    }
    return run;
  }

  it("accepte des candidats sans sondage ni déclaration quand la liste archivée est jointe", () => {
    expect(chemins(regimeListe())).toEqual([]);
  });

  it("refuse le régime de la liste sans la liste archivée", () => {
    const run = regimeListe();
    delete perimetre(run)["liste_officielle"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });

  it("refuse une liste officielle sans empreinte, sans archive, sans date ou sans URL", () => {
    for (const champ of ["sha256", "archive_url", "date_publication", "url"]) {
      const run = regimeListe();
      const liste = { ...LISTE_OFFICIELLE } as Objet;
      delete liste[champ];
      perimetre(run)["liste_officielle"] = liste;
      expect(chemins(run), champ).toSatisfy(toutesSous("/perimetre/liste_officielle"));
    }
  });
});

const PROCLAMATION = {
  url: "https://conseil.invalid/proclamation-premier-tour-2027",
  date_publication: "2027-04-14",
  sha256: "b".repeat(64),
  archive_url: "https://web.archive.org/web/20270414/https://conseil.invalid/proclamation-premier-tour-2027",
};

/*
 * D68, protocole 0.27 (§3) : régime `entre_deux_tours`, le périmètre est exactement les deux
 * qualifiés ; la seule preuve d'inclusion exigée est la proclamation du premier tour, archivée.
 */
describe("D68 : régime entre les deux tours", () => {
  /** Les candidats 0 et 1 de l'exemple sont non retirés : les deux finalistes ; le 2, retiré, tient lieu d'éliminé. */
  function regimeEntreDeuxTours(): Objet {
    const run = runValide();
    perimetre(run)["regime_inclusion"] = "entre_deux_tours";
    perimetre(run)["proclamation_premier_tour"] = PROCLAMATION;
    for (const indice of [0, 1]) {
      delete candidat(run, indice)["preuves_inclusion"];
      delete candidat(run, indice)["declaration_candidature"];
    }
    return run;
  }

  it("accepte deux finalistes sans sondage ni déclaration et un éliminé retiré, avec la proclamation", () => {
    expect(chemins(regimeEntreDeuxTours())).toEqual([]);
  });

  it("refuse le régime sans la proclamation archivée", () => {
    const run = regimeEntreDeuxTours();
    delete perimetre(run)["proclamation_premier_tour"];
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });

  it("refuse un seul candidat non retiré", () => {
    const run = regimeEntreDeuxTours();
    candidat(run, 1)["statut_au_gel"] = "retire";
    candidat(run, 1)["interroge"] = false;
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });

  it("refuse trois candidats non retirés", () => {
    const run = regimeEntreDeuxTours();
    candidat(run, 2)["statut_au_gel"] = "actif";
    candidat(run, 2)["interroge"] = true;
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre"));
  });

  it("refuse la proclamation dans le régime avant la liste et dans celui de la liste", () => {
    const avant = runValide();
    perimetre(avant)["proclamation_premier_tour"] = PROCLAMATION;
    expect(chemins(avant)).toSatisfy(toutesSous("/perimetre"));
    const liste = runValide();
    perimetre(liste)["regime_inclusion"] = "liste_officielle";
    perimetre(liste)["liste_officielle"] = LISTE_OFFICIELLE;
    perimetre(liste)["proclamation_premier_tour"] = PROCLAMATION;
    expect(chemins(liste)).toSatisfy(toutesSous("/perimetre"));
  });

  it("admet la liste officielle à côté de la proclamation, sans l'exiger", () => {
    const run = regimeEntreDeuxTours();
    perimetre(run)["liste_officielle"] = LISTE_OFFICIELLE;
    expect(chemins(run)).toEqual([]);
  });
});

describe("par_mode obligatoire pour un assistant inclus d'un run publié", () => {
  function sansParMode(statut: string): Objet {
    const run = runValide();
    run["statut"] = statut;
    delete outil(run, 0)["par_mode"];
    return run;
  }

  it("refuse un run publié dont l'assistant inclus n'a pas de par_mode", () => {
    expect(chemins(sansParMode("publie"))).toSatisfy(toutesSous("/perimetre/outils/0"));
  });

  it("refuse un run publié provisoire dont l'assistant inclus n'a pas de par_mode", () => {
    const run = sansParMode("publie_provisoire");
    run["motif_provisoire"] = "Erreurs graves pas toutes revues.";
    // Modifié ouvertement (conformité 2026-09-29, n° 15) : la décision du go/no-go suit le statut,
    // pour que la seule erreur reste l'absence de par_mode. Modifié ouvertement (lot go-no-go,
    // D24 (3)) : un provisoire porte au moins un critère rouge, celui que dit motif_provisoire.
    run["go_no_go"] = goNoGoProvisoire("erreurs_graves_revues");
    expect(chemins(run)).toSatisfy(toutesSous("/perimetre/outils/0"));
  });

  it("n'exige pas par_mode d'un run en cours", () => {
    expect(chemins(sansParMode("en_cours"))).toEqual([]);
  });

  it("n'exige pas par_mode d'un assistant exclu d'un run publié", () => {
    const run = sansParMode("publie");
    outil(run, 0)["inclus"] = false;
    outil(run, 0)["motif_exclusion"] = "Absent du top des applications à la date de gel.";
    expect(chemins(run)).toEqual([]);
  });

  it("n'exige pas par_mode d'un comparateur d'un run publié", () => {
    const run = runValide();
    expect(outil(run, 1)["famille"]).toBe("comparateur");
    expect(outil(run, 1)).not.toHaveProperty("par_mode");
    expect(chemins(run)).toEqual([]);
  });
});
