# Brief — D75 lot G : pages citées hors de `volume/`, point (4)

Agent : `codeur-opus` (le passage touche Python et TypeScript), worktree. Lis d'abord le fichier
commun `/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.
Python touché : lance aussi `uv sync --frozen --offline` puis `pnpm check:py && pnpm test:py`.

## Objectif

**(4)** Les pages citées par les réponses (copies des liens qui existent, droits d'autrui) vivent
sous `volume/liens/pages/` et sont aujourd'hui exclues nommément de l'archive Zenodo du volume
(`pipeline/run/depot.ts`, `SEGMENTS_HORS_DEPOT`). Retenu : un lot dédié qui les **sort de
`volume/`**, pour que « le volume part en entier sur Zenodo » redevienne vrai sans exception.

Choisis l'emplacement le plus simple hors de `volume/` dans le répertoire du run (par exemple
`runs/<date>/pages-citees/`), ignoré par Git comme le volume, et justifie-le dans le rapport. Tous
les écrivains et lecteurs suivent :
- écriture : `pipeline/liens/sortie.py` (`REPERTOIRE_PAGES`), `pipeline/liens/__main__.py`,
  `pipeline/liens/__init__.py` (docstrings) ;
- lecture : `pipeline/liens/textes.py`, `pipeline/notation/fournisseur-fichiers.ts`
  (`REPERTOIRE_PAGES`) et tout autre lecteur trouvé par `grep` ;
- dépôt : `pipeline/run/depot.ts` perd l'exception (`SEGMENTS_HORS_DEPOT` vide ou retiré, au plus
  simple) et `tests/run/depot.test.ts` vérifie que l'archive du volume n'a plus d'exclusion et ne
  contient aucune page ;
- `.gitignore` si le nouvel emplacement n'est pas déjà ignoré ; `runs/README.md`, sections de la
  disposition du run et de `volume/liens/` (le lot D touche aussi `runs/README.md`, aux sections
  des contestations postérieures et de `pnpm analyze` : ne touche pas à celles-là) ;
- `docs/CONTRATS.md` si la disposition y est écrite (contrat, pas zone d'arrêt ; signale-le).
- Si le protocole (§9) nomme `volume/liens/pages/`, ne l'écris pas : signale la phrase à réviser.

Pas de migration de runs existants : aucun run réel n'existe ; les fixtures et tests suivent.

## Hors périmètre

`contrefactuel-outils.ts`, `derangement-outils.ts`, `file-humaine.ts`, `note-retenue.ts`,
`charge-juge.ts`, `vue-annotateur.ts`, `rendu-prompt-juge.ts`, `analysis/analyse-du-run.ts`,
`analysis/ecart-juge-editeur.ts`, `outils/contestations-posterieures.ts` : autres lots en cours.

## Cas limites (au moins)

1. Le test des liens écrit une page au nouvel emplacement, plus jamais sous `volume/`.
2. Relance sur un run déjà testé : reprise sans réécriture, au nouvel emplacement.
3. Le texte d'une page est relu depuis le nouvel emplacement (Python et TypeScript).
4. Page absente au nouvel emplacement alors que la fiche du lien la déclare : erreur nommée, pas
   de texte vide.
5. Archive du volume : aucune exclusion, aucune page dedans.
6. Le nouvel emplacement est ignoré par Git (test ou vérification `git check-ignore`).
