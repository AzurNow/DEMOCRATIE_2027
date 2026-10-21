/**
 * Les schémas de `schema/` (voir `schema/README.md`, « Les fichiers »), nommés une seule fois ici :
 * tout le reste du module en dérive, jamais d'un `if` par nom. Les paragraphes qui suivent disent,
 * dans l'ordre d'arrivée, pourquoi chacun a rejoint le registre.
 *
 * `decision` (journal de validation, §4) et `decision-mesure` (arbitrage des corrections de
 * thème, §4) rejoignent ce registre avec ce lot : les deux objets sont publiés au titre du §9 et
 * doivent donc, comme les autres, porter des exemples dans `schema/exemples/manifeste.json`
 * et être vérifiés par `pnpm check`. Avant ce lot, ils en étaient absents — un défaut nommé dans
 * `docs/DETTE.md` (2026-09-19, points 2 et 3 ; 2026-09-18, point 5), fermé ici.
 *
 * `gabarits` décrit la table des gabarits versionnée dans `prompts/` (§5, protocole 0.3). Ses
 * exemples sont vérifiés ici comme les autres ; le fichier réel `prompts/gabarits-1.0.0.json`
 * l'est par `tests/questions/gabarits.test.ts`, et par le chargeur à chaque import.
 *
 * `collecte`, `fiche-source` et `reprise-archivage` décrivent les trois fichiers écrits par
 * `pipeline/collecte` (Python, `docs/CONTRATS.md` §5) : manifeste de contenu, fiche par source,
 * reprise d'archivage. Python ne valide pas contre le schéma : les fichiers dorés de
 * `tests/collecte/dore/`, reproduits octet pour octet par pytest, sont validés ici par
 * `tests/collecte/dores.test.ts`, qui vérifie aussi que les exemples valides leur sont identiques.
 *
 * `extraction-texte` décrit la fiche d'extraction écrite par `pipeline/collecte/textes` (sous-lot C2,
 * `docs/CONTRATS.md` §1.1), vérifiée de la même façon.
 *
 * `transcription` décrit la fiche de transcription écrite par `pipeline/collecte/transcription`
 * (sous-lot C3, `docs/CONTRATS.md` §2.2), vérifiée de la même façon.
 *
 * `diagnostic-lot` décrit un calcul du kappa d'un lot, écrit en ajout seul par `pnpm diagnostics`
 * dans `validation/diagnostics/` et publié au titre du §9 (conformité 2026-09-24, n° 16) : le
 * dix-neuvième schéma.
 *
 * `decision-arbitrage` décrit une entrée du registre des décisions d'arbitrage,
 * `validation/arbitrage/decisions.json`, écrite en ajout seul par `pnpm arbitrer` et relue par
 * `pnpm promote` (§4, règle de concordance, protocole 0.10 ; conformité n° 18) : le vingtième.
 *
 * `notification-due` et `envoi-notification` décrivent les deux fichiers en ajout seul des
 * notifications aux campagnes (§4, droit de réponse, protocole 0.10) : la file
 * `validation/notifications/dues.jsonl`, écrite par promote, contester et panel, et le journal
 * `validation/notifications/envois.jsonl`, écrit par `pnpm notifier` (Python) seul. Ils
 * remplacent `item.notifications[]`, retiré du schéma d'item.
 *
 * `perimetre` décrit `config/perimetre.yaml` tel que l'auteur le saisit (conformité 2026-09-29, n° 23
 * et 25) : lu et validé par `pipeline/questions/charger-perimetre.ts`, qui en tire l'instantané
 * `run.perimetre` et les paramètres du tirage. Le vingt-troisième.
 *
 * `existence-lien` décrit le résultat du test HTTP d'un lien cité (§7, décision D20), écrit par
 * `pipeline/liens` (Python) dans `runs/<date>/volume/liens/` et lu par la notation
 * (`pipeline/notation/fournisseur-fichiers.ts`). Vérifié comme les fichiers de la collecte : fichiers
 * dorés de `tests/liens/dore/`, validés par `tests/liens/dores-liens.test.ts`. Le vingt-quatrième.
 *
 * `checklist` décrit `runs/<date>/checklist.json`, la checklist de run de l'annexe F, écrite par
 * `pnpm go-no-go` et contresignée par `pnpm go-no-go:contresigner` (décision D24 (4) de l'auteur) :
 * le vingt-cinquième.
 *
 * `extraction-page-lien` décrit la fiche d'extraction du texte d'une copie conservée par le test des
 * liens (décision D27 (E), charge-juge-v3), écrite par `pipeline/liens/textes.py` dans
 * `runs/<date>/volume/liens/extractions/` et lue par la notation (`fournisseur-fichiers.ts`).
 * Vérifiée comme la collecte : fichiers dorés de `tests/liens/dore-textes/`. Le vingt-sixième.
 *
 * `renvoi-humain` décrit le renvoi d'une question d'attribution indécidable vers la notation humaine
 * (décision D30 (2)), écrit par la chaîne dans `runs/<date>/volume/renvois/` à la place de la note du
 * juge. Le vingt-septième.
 *
 * `proposition-formulation` décrit une proposition de formulations familière et orientée (décisions
 * D39 et D42), écrite une fois par `pnpm reformuler` dans `staging/formulations/<question_id>/`, avec
 * le corps HTTP du modèle tel que reçu et l'issue du contrôle déterministe ; lue par la relecture de
 * l'interface de validation. Le vingt-huitième.
 *
 * `formulations-validees` et `refus-formulation` décrivent les deux sorties de cette relecture
 * (décisions D39 et D42) : `data/formulations/<question_id>.json`, les trois formulations relues
 * d'une question, écrites par le seul `validation/io/data-formulations.ts` et lues par le gel ; et
 * une ligne de `validation/formulations/refus.jsonl`, journal en ajout seul des propositions
 * refusées, relu par `pnpm reformuler`. Le vingt-neuvième et le trentième.
 *
 * `config-gel` décrit `config/gel.json`, les paramètres du gel d'un run que run.json exige et
 * qu'aucune autre source ne porte (version du protocole, début de fenêtre, juges, alias aveugles),
 * saisis par l'auteur et lus par `pnpm geler` (décision D41). Le trente et unième.
 *
 * `sortie-extraction` décrit la sortie brute de chacun des deux modèles de l'extraction double
 * (§4, décision D52), dans la forme exacte de `prompts/extraction-1.0.0.md` ; lue par
 * `pipeline/extraction/lecture-sortie.ts`, qui rejette en entier une sortie non conforme. Le
 * trente-deuxième.
 *
 * `entree-extraction`, `reponse-extraction` et `journal-extraction` décrivent les trois fichiers de
 * `pnpm extraire` (§4, décisions D52 et D53, PR 3 du lot extraction) : l'entrée d'une source, écrite
 * par `pnpm extraction:entrees` (Python, vérifiée comme la collecte par un fichier doré de
 * `tests/collecte/dore/entrees-extraction/`) ; chaque réponse HTTP d'un extracteur, gardée telle
 * quelle (règle 7) ; et le journal d'une source, écrit en dernier, qui la marque traitée. Les
 * trente-troisième à trente-cinquième.
 *
 * `relecture-mesure` décrit une entrée du registre des relectures de mesure,
 * `validation/mesures/relectures.json`, publié en ajout seul et relu par `pnpm promote`, qui refuse
 * d'écrire dans `data/mesures/` toute mesure dont le contenu exact n'a pas été relu par l'auteur
 * (décision D53 (1)). Le trente-sixième.
 *
 * `rattachement-item` décrit une entrée du registre des rattachements d'item,
 * `validation/mesures/rattachements.json`, publié en ajout seul et écrit par
 * `pnpm mesures --rattacher`, qui réécrit un item de staging sur une autre mesure existante
 * (décision D53 (1)). Le trente-septième.
 *
 * `lot` décrit le manifeste d'un lot de validation, `validation/lots/<lot_id>.json`, écrit une
 * fois par `pnpm lots` et jamais réécrit (§4). Revue du 2026-10-12, constat 4 (D55 (3)) :
 * `lireLot`, `lireLots`, `ecrireLot` et `ecrireLots` le valident désormais, à la lecture comme
 * avant toute écriture. Le trente-huitième.
 */
export const NOMS_SCHEMAS = [
  "commun",
  "item",
  "question",
  "reponse",
  "notation",
  "verdict",
  "mesure",
  "run",
  "tirage",
  "lecture-comparateur",
  "decision",
  "decision-mesure",
  "gabarits",
  "collecte",
  "fiche-source",
  "reprise-archivage",
  "extraction-texte",
  "transcription",
  "diagnostic-lot",
  "decision-arbitrage",
  "notification-due",
  "envoi-notification",
  "perimetre",
  "existence-lien",
  "checklist",
  "extraction-page-lien",
  "renvoi-humain",
  "proposition-formulation",
  "formulations-validees",
  "refus-formulation",
  "config-gel",
  "sortie-extraction",
  "entree-extraction",
  "reponse-extraction",
  "journal-extraction",
  "relecture-mesure",
  "rattachement-item",
  "lot",
] as const;

export type NomSchema = (typeof NOMS_SCHEMAS)[number];

export function cheminSchema(racineSchema: string, nom: NomSchema): string {
  return `${racineSchema}/${nom}.schema.json`;
}

export function urnSchema(nom: NomSchema): string {
  return `urn:banc-essai-2027:schema:${nom}`;
}

export function estNomSchema(valeur: string): valeur is NomSchema {
  return (NOMS_SCHEMAS as readonly string[]).includes(valeur);
}
