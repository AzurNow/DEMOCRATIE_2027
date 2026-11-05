# Brief — D75 lot D : contestations postérieures et run hors clone, points (12), (13), (17)

Agent : `codeur-opus`, worktree. Lis d'abord le fichier commun
`/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.

## Objectif

- **(12)** `pnpm contestations-posterieures` (`outils/contestations-posterieures.ts`) accepte encore
  `--data`, `--racine`, `--runs` : l'aligner sur la règle de la dette du 2026-11-04 n° 1, à savoir
  que les items se déduisent du dépôt du run (`pipeline/run/contestations-posterieures.ts`,
  `repertoireDesItemsDuRun`). Ces options sont refusées avec un message, pas ignorées.
- **(13)** Un run analysé hors de son clone Git (archive Zenodo) est aujourd'hui refusé
  (`DepotDuRunIntrouvable`, `ItemsDuDepotAbsents`). Ajouter un chemin explicite pour la vérification
  par des tiers : une option qui désigne le dépôt des items, utilisée par `pnpm analyze` et
  `pnpm contestations-posterieures`. Sans l'option, le comportement actuel est inchangé. Avec
  l'option, le contrôle des contestations postérieures garde son caractère bloquant : un répertoire
  vide ou sans item est toujours refusé (la docstring de `repertoireDesItemsDuRun` explique pourquoi
  un répertoire désigné à la main rendrait le contrôle muet : réponds à ce risque, par exemple en
  exigeant que le dépôt désigné contienne le commit des données gelé du run).
- **(17)** Commentaire de `pipeline/run/champs-posterieurs-au-gel.ts` : « le §9 ne nomme pas ces
  champs » est périmé depuis la 0.33, qui a révisé le §9. Le mettre à jour en citant le texte.

## Hors périmètre

`analysis/analyse-du-run.ts` (sauf l'appel de l'option, au plus petit), `analysis/ecart-juge-editeur.ts`,
`pipeline/notation/`, `pipeline/gel/`, `schema/run.schema.json` : autres lots. Mettre à jour
`runs/README.md` pour les deux commandes.

## Cas limites (au moins)

1. (12) Chacune des trois options : refus, code 2, message qui nomme l'option.
2. (13) Run dans son clone : inchangé. Run hors clone sans option : refus inchangé.
3. (13) Option vers un dépôt qui contient le commit gelé : accepté, mêmes résultats que dans le clone.
4. (13) Option vers un dépôt sans ce commit, vers un répertoire vide, vers un dépôt sans item : refus.
5. (17) Aucun test : commentaire seul.
