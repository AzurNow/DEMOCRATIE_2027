/**
 * Délibération du panel sans majorité (§10 et annexe E, protocole 0.29, D71 (8)) : « À égalité des
 * voix, rien ne change : l'item reste contesté et hors du tirage, et les opinions de chaque membre
 * sont publiées à côté de l'item, en ajout seul, avec la contestation qu'elles tranchent. »
 *
 * Chaque délibération sans majorité s'ajoute à `contestations[].deliberations_sans_majorite[]` de
 * la contestation qu'elle tranche : opinion motivée de chaque membre votant, membres déportés
 * nommés à part. Elle ne change ni le statut, ni la version, ni le contenu de l'item ; une
 * délibération déjà écrite n'est jamais modifiée ni retirée (`verifierAjoutSeul`).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { contestationPermetLeTirage } from "../pipeline/questions/contestation.ts";
import { itemEngendreDesQuestions } from "../pipeline/questions/engendrement.ts";
import { EcritureNonAjoutSeule, verifierAjoutSeul } from "../validation/domaine/ajout-seul.ts";
import {
  ajouterContestation,
  appliquerDecisionPanel,
  ContestationDejaDecidee,
  type Contestation,
} from "../validation/domaine/contestation-item.ts";
import type { AccesTexte } from "../validation/domaine/corrections.ts";
import {
  DeliberationRefusee,
  enregistrerDeliberationSansMajorite,
  type DeliberationSansMajorite,
} from "../validation/domaine/deliberation-sans-majorite.ts";
import type { Item } from "../validation/domaine/types.ts";
import { creerItem } from "../validation/io/data-items.ts";
import { valider } from "../outils/schemas/valider.ts";
import { creerBac, type Bac } from "./aides/bac.ts";
import { itemPromu } from "./aides/data.ts";
import { commiterTout, executerOutil, initialiserDepot } from "./aides/depot.ts";
import { mesure } from "./aides/fabriques.ts";

const TRACE = { date: "2026-11-01T10:00:00+01:00", commit: "c".repeat(40) };
const TRACE_DELIBERATION = { date: "2026-11-10T10:00:00+01:00", commit: "d".repeat(40) };
const TRACE_SECONDE = { date: "2026-11-12T10:00:00+01:00", commit: "e".repeat(40) };
const PREMIERE = "01JBANCESSA1C0NTESTAT10N01";

const ACCES: AccesTexte = {
  texteSource: () => "Préambule. Nous ramènerons la TVA sur l'énergie à 5,5 %. Et nous ferons plus encore.",
  offsetsActuels: () => ({ debut: null, fin: null }),
};

function contestation(id: string): Contestation {
  return {
    id,
    date_reception: "2026-11-01T09:00:00+01:00",
    texte: "La source ne dit pas cela.",
    contestataire_type: "campagne",
    caviardage: false,
  };
}

function conteste(): Item {
  return ajouterContestation(itemPromu(), contestation(PREMIERE), TRACE);
}

function deliberation(surcharges: Partial<DeliberationSansMajorite> = {}): DeliberationSansMajorite {
  return {
    contestation_id: PREMIERE,
    version_jugee: 1,
    date: TRACE_DELIBERATION.date,
    opinions: [
      { membre: "Membre A", vote: "maintien", motivation: "La citation figure dans la source." },
      { membre: "Membre B", vote: "maintien", motivation: "Le contexte ne change pas le sens." },
      { membre: "Membre C", vote: "retrait", motivation: "La citation est sortie de son contexte." },
      { membre: "Membre D", vote: "retrait", motivation: "La phrase suivante la conditionne." },
    ],
    deportes: [],
    ...surcharges,
  };
}

function deliberationsDe(item: Item, rang = 0): readonly Record<string, unknown>[] {
  const contestations = item.contestations as readonly Record<string, unknown>[];
  return contestations[rang]?.["deliberations_sans_majorite"] as readonly Record<string, unknown>[];
}

function horsDuTirage(item: Item): void {
  expect(item.statut_contestation).toBe("contestee");
  expect(contestationPermetLeTirage(item)).toBe(false);
  expect(itemEngendreDesQuestions(item)).toBe(false);
}

describe("délibération sans majorité (§10, annexe E, D71 (8))", () => {
  it("égalité ⇒ délibération enregistrée, item toujours contesté et hors tirage", () => {
    const avant = conteste();
    const { item, autorisation } = enregistrerDeliberationSansMajorite(avant, deliberation(), TRACE_DELIBERATION);
    horsDuTirage(item);
    expect(autorisation).toEqual({ corrections: false });
    expect(item.version).toBe(avant.version);
    expect(item.statut_validation).toBe(avant.statut_validation);
    expect(item.empreinte).toBe(avant.empreinte);
    expect(deliberationsDe(item)).toEqual([
      {
        date: TRACE_DELIBERATION.date,
        version_jugee: 1,
        opinions: deliberation().opinions,
        deportes: [],
      },
    ]);
    const contestations = item.contestations as readonly Record<string, unknown>[];
    expect(contestations[0]?.["decision_panel"]).toBeUndefined();
    expect(item.historique?.at(-1)).toMatchObject({ changement: "délibération du panel sans majorité", version_resultante: 1, commit: TRACE_DELIBERATION.commit });
    expect(() => valider("item", item, "item à égalité des voix")).not.toThrow();
    expect(() => verifierAjoutSeul(avant, item, autorisation)).not.toThrow();
  });

  it("majorité ⇒ aucune délibération sans majorité ajoutée", () => {
    const { item } = appliquerDecisionPanel(
      conteste(),
      {
        contestation_id: PREMIERE,
        decision: "maintien",
        version_jugee: 1,
        motivation: "La citation figure dans la source.",
        opinions_dissidentes: ["Un membre tient pour le retrait."],
        arbitre_seul: false,
        corrections: [],
        date: TRACE_DELIBERATION.date,
      },
      TRACE_DELIBERATION,
      ACCES,
    );
    expect(deliberationsDe(item)).toBeUndefined();
    expect(item.statut_contestation).toBe("arbitree");
  });

  it("majorité ⇒ une délibération dont une décision réunit la majorité des votants est refusée, l'item inchangé", () => {
    const avant = conteste();
    const copie = structuredClone(avant);
    const majoritaire = deliberation({
      opinions: [
        { membre: "Membre A", vote: "maintien", motivation: "Un." },
        { membre: "Membre B", vote: "maintien", motivation: "Deux." },
        { membre: "Membre C", vote: "retrait", motivation: "Trois." },
      ],
    });
    expect(() => enregistrerDeliberationSansMajorite(avant, majoritaire, TRACE_DELIBERATION)).toThrow(/majorité/);
    expect(avant).toEqual(copie);
  });

  it("deux égalités successives sur la même contestation ⇒ deux entrées, la première intacte", () => {
    const premiere = enregistrerDeliberationSansMajorite(conteste(), deliberation(), TRACE_DELIBERATION).item;
    const seconde = enregistrerDeliberationSansMajorite(
      premiere,
      deliberation({ date: TRACE_SECONDE.date }),
      TRACE_SECONDE,
    );
    const deliberations = deliberationsDe(seconde.item);
    expect(deliberations).toHaveLength(2);
    expect(deliberations[0]).toEqual(deliberationsDe(premiere)[0]);
    expect(deliberations[1]?.["date"]).toBe(TRACE_SECONDE.date);
    horsDuTirage(seconde.item);
    expect(() => verifierAjoutSeul(premiere, seconde.item, seconde.autorisation)).not.toThrow();
    expect(() => valider("item", seconde.item, "deux égalités")).not.toThrow();
  });

  it("tentative de réécrire une délibération ⇒ refus", () => {
    const avant = enregistrerDeliberationSansMajorite(conteste(), deliberation(), TRACE_DELIBERATION).item;
    const contestations = avant.contestations as readonly Record<string, unknown>[];
    const reecrite = deliberation({
      opinions: deliberation().opinions.map((opinion) => ({ ...opinion, motivation: `${opinion.motivation} (revue)` })),
    });
    const { contestation_id: _id, ...publiee } = reecrite;
    const historique = [...(avant.historique ?? []), { ...TRACE_SECONDE, changement: "réécriture", version_resultante: 1 }];
    const remplacee: Item = {
      ...avant,
      contestations: [{ ...contestations[0], deliberations_sans_majorite: [publiee] }],
      historique,
    };
    const retiree: Item = {
      ...avant,
      contestations: [{ ...contestations[0], deliberations_sans_majorite: [] }],
      historique,
    };
    expect(() => verifierAjoutSeul(avant, remplacee, { corrections: false })).toThrow(EcritureNonAjoutSeule);
    expect(() => verifierAjoutSeul(avant, remplacee, { corrections: false })).toThrow(/deliberations_sans_majorite/);
    expect(() => verifierAjoutSeul(avant, retiree, { corrections: false })).toThrow(/deliberations_sans_majorite/);
  });

  it("membre déporté ⇒ absent des opinions, et le nombre de votants reflète le déport", () => {
    const avecDeport = deliberation({ deportes: ["Membre E"] });
    const { item } = enregistrerDeliberationSansMajorite(conteste(), avecDeport, TRACE_DELIBERATION);
    const publiee = deliberationsDe(item)[0];
    expect(publiee?.["deportes"]).toEqual(["Membre E"]);
    const opinions = publiee?.["opinions"] as readonly { membre: string }[];
    expect(opinions).toHaveLength(4);
    expect(opinions.map((opinion) => opinion.membre)).not.toContain("Membre E");
    expect(() => valider("item", item, "égalité avec un déport")).not.toThrow();
  });

  it("membre déporté ⇒ un déporté qui vote est refusé", () => {
    const votant = deliberation({ deportes: ["Membre D"] });
    expect(() => enregistrerDeliberationSansMajorite(conteste(), votant, TRACE_DELIBERATION)).toThrow(DeliberationRefusee);
    expect(() => enregistrerDeliberationSansMajorite(conteste(), votant, TRACE_DELIBERATION)).toThrow(/déporté/);
  });

  it("refus : membre en double, vote hors énumération, motivation vide, moins de deux votants", () => {
    const [a, b] = deliberation().opinions as [DeliberationSansMajorite["opinions"][number], DeliberationSansMajorite["opinions"][number]];
    const cas: readonly [string, DeliberationSansMajorite, RegExp][] = [
      ["double", deliberation({ opinions: [a, { ...b, membre: a.membre, vote: "retrait" }] }), /en double/],
      ["hors énumération", deliberation({ opinions: [a, { ...b, vote: "egalite" as "retrait" }] }), /hors énumération/],
      ["motivation vide", deliberation({ opinions: [a, { ...b, vote: "retrait", motivation: "  " }] }), /motivation/],
      ["un seul votant", deliberation({ opinions: [a] }), /deux votants/],
    ];
    for (const [nom, refusee, motif] of cas) {
      expect(() => enregistrerDeliberationSansMajorite(conteste(), refusee, TRACE_DELIBERATION), nom).toThrow(motif);
    }
  });

  it("refus : contestation déjà décidée, version jugée périmée", () => {
    const decide = appliquerDecisionPanel(
      conteste(),
      {
        contestation_id: PREMIERE,
        decision: "maintien",
        version_jugee: 1,
        motivation: "Maintenu.",
        opinions_dissidentes: [],
        arbitre_seul: false,
        corrections: [],
        date: TRACE_DELIBERATION.date,
      },
      TRACE_DELIBERATION,
      ACCES,
    ).item;
    expect(() => enregistrerDeliberationSansMajorite(decide, deliberation(), TRACE_SECONDE)).toThrow(ContestationDejaDecidee);
    expect(() => enregistrerDeliberationSansMajorite(conteste(), deliberation({ version_jugee: 2 }), TRACE_SECONDE)).toThrow(/version 2/);
  });

  it("une décision à la majorité reste possible après une délibération sans majorité, qui reste publiée", () => {
    const egalite = enregistrerDeliberationSansMajorite(conteste(), deliberation(), TRACE_DELIBERATION).item;
    const { item, autorisation } = appliquerDecisionPanel(
      egalite,
      {
        contestation_id: PREMIERE,
        decision: "maintien",
        version_jugee: 1,
        motivation: "Maintenu à trois voix contre une.",
        opinions_dissidentes: ["Un membre tient pour le retrait."],
        arbitre_seul: false,
        corrections: [],
        date: TRACE_SECONDE.date,
      },
      TRACE_SECONDE,
      ACCES,
    );
    expect(deliberationsDe(item)).toEqual(deliberationsDe(egalite));
    expect(() => verifierAjoutSeul(egalite, item, autorisation)).not.toThrow();
    expect(() => valider("item", item, "décision après égalité")).not.toThrow();
  });
});

describe("schéma : deliberations_sans_majorite (item.schema.json)", () => {
  function avecOpinions(opinions: readonly unknown[]): Item {
    const item = enregistrerDeliberationSansMajorite(conteste(), deliberation(), TRACE_DELIBERATION).item;
    const contestations = item.contestations as readonly Record<string, unknown>[];
    const publiee = deliberationsDe(item)[0];
    return { ...item, contestations: [{ ...contestations[0], deliberations_sans_majorite: [{ ...publiee, opinions }] }] };
  }

  it("schéma invalide sans opinion d'un votant", () => {
    const opinions = deliberation().opinions.map((opinion, rang) => {
      if (rang !== 2) return opinion;
      const { motivation: _sans, ...reste } = opinion;
      return reste;
    });
    expect(() => valider("item", avecOpinions(opinions), "votant sans opinion")).toThrow(/motivation/);
  });

  it("schéma invalide : une opinion sans membre, ou un vote hors énumération", () => {
    const sansMembre = deliberation().opinions.map(({ membre: _m, ...reste }) => reste);
    expect(() => valider("item", avecOpinions(sansMembre), "opinion sans membre")).toThrow(/membre/);
    const horsEnum = deliberation().opinions.map((opinion) => ({ ...opinion, vote: "egalite" }));
    expect(() => valider("item", avecOpinions(horsEnum), "vote hors énumération")).toThrow();
  });
});

/* ------------------------------------------------------------- pnpm panel */

interface Banc {
  readonly bac: Bac;
  readonly item: Item;
  readonly fichier: (nom: string, contenu: string) => string;
  readonly lire: () => Item;
}

function preparer(suffixe: string): Banc {
  const bac = creerBac();
  const item = itemPromu({ id: `01JBANCESSA1000000000TEM${suffixe}`, candidat_id: `demo-${suffixe}` });
  bac.ecrireItem({ ...item, statut_validation: "en_attente", validations: [] });
  bac.ecrireMesure(mesure({ id: item.mesure_id, version: 1 }));
  creerItem(join(bac.racine, "data/items"), item);
  initialiserDepot(bac.racine);
  return {
    bac,
    item,
    fichier: (nom, contenu) => {
      const chemin = join(bac.racine, nom);
      writeFileSync(chemin, contenu, "utf8");
      commiterTout(bac.racine, nom);
      return chemin;
    },
    lire: () => JSON.parse(readFileSync(join(bac.racine, "data/items", `${item.id}.json`), "utf8")) as Item,
  };
}

describe("pnpm panel --sans-majorite", () => {
  const banc = preparer("73");
  const racine = [`--racine=${banc.bac.racine}`, `--data=${join(banc.bac.racine, "data/items")}`];
  const texte = banc.fichier("contestation.txt", "La citation est incomplète.\n");
  executerOutil("contester.ts", [...racine, `--item=${banc.item.id}`, `--texte-fichier=${texte}`, "--recu-le=2026-10-01T09:00:00+02:00", "--type=parti", "--ecrire"]);
  commiterTout(banc.bac.racine, "contestation");
  const contestation_id = (banc.lire().contestations?.[0] as { id: string }).id;
  const motifs = ["Maintenir : la citation figure.", "Maintenir : le sens est fidèle.", "Retirer : le contexte manque.", "Retirer : la phrase suivante conditionne."].map(
    (motif, rang) => banc.fichier(`opinion-${rang}.txt`, `${motif}\n`),
  );
  const votes = ["maintien", "maintien", "retrait", "retrait"];
  const fichierDeliberation = banc.fichier(
    "deliberation.json",
    JSON.stringify({
      opinions: votes.map((vote, rang) => ({ membre: `Membre ${rang + 1}`, vote, motivation_fichier: motifs[rang] })),
      deportes: ["Membre 5"],
    }),
  );
  const base = [...racine, `--item=${banc.item.id}`, `--contestation=${contestation_id}`, "--version-jugee=1"];
  const avecDecision = executerOutil("panel.ts", [...base, `--sans-majorite=${fichierDeliberation}`, "--decision=maintien", "--ecrire"]);
  const simulation = executerOutil("panel.ts", [...base, `--sans-majorite=${fichierDeliberation}`]);
  const apresSimulation = banc.lire();
  const ecriture = executerOutil("panel.ts", [...base, `--sans-majorite=${fichierDeliberation}`, "--ecrire"]);
  afterAll(() => banc.bac.detruire());

  it("--sans-majorite et --decision ensemble sont refusés", () => {
    expect(avecDecision.status).toBe(1);
    expect(avecDecision.erreur).toMatch(/--sans-majorite/);
  });

  it("simule par défaut", () => {
    expect(simulation.status, simulation.erreur).toBe(0);
    expect(deliberationsDe(apresSimulation)).toBeUndefined();
  });

  it("--ecrire publie les opinions de chaque membre votant à côté de la contestation, l'item reste contesté", () => {
    expect(ecriture.status, ecriture.erreur).toBe(0);
    const item = banc.lire();
    horsDuTirage(item);
    const publiee = deliberationsDe(item)[0];
    expect(publiee?.["deportes"]).toEqual(["Membre 5"]);
    expect(publiee?.["opinions"]).toEqual([
      { membre: "Membre 1", vote: "maintien", motivation: "Maintenir : la citation figure." },
      { membre: "Membre 2", vote: "maintien", motivation: "Maintenir : le sens est fidèle." },
      { membre: "Membre 3", vote: "retrait", motivation: "Retirer : le contexte manque." },
      { membre: "Membre 4", vote: "retrait", motivation: "Retirer : la phrase suivante conditionne." },
    ]);
    expect(ecriture.sortie).toMatch(/sans majorité/);
  });
});
