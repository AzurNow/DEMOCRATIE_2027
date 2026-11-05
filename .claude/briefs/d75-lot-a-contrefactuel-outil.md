# Brief — D75 lot A : contrefactuel d'outil, points (2), (6), (7)

Agent : `codeur-opus`, worktree. Lis d'abord le fichier commun
`/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.

## Objectif

Le contrefactuel d'outil applique les trois lectures retenues par D75.

- **(2)** Un juge qui renvoie (vers un humain) une réponse du contrefactuel d'outil : même règle que
  pour les candidats, la réponse est écartée du numérateur et du dénominateur de ce juge. Le code
  l'a peut-être déjà : vérifier dans `pipeline/notation/contrefactuel-outils.ts` et ajouter le test
  nommé ; corriger s'il ne le fait pas.
- **(6)** `pipeline/notation/derangement-outils.ts` : un comparateur du même éditeur qu'un outil
  permuté ne lève plus `FormesOutilsAmbigues` (bloquant) ; le dérangement est rendu absent, avec son
  motif, comme les autres absences du contrefactuel (« étendre absent avec motif »).
- **(7)** L'absence du contrefactuel d'outil est publiée : un bloc dans `schema/run.schema.json`
  (avec exemples valide et invalide), et le branchement dans la chaîne qui écrit le run, sur le
  modèle de la publication du contrefactuel des candidats et de ses absences. Trouve par `grep`
  comment le contrefactuel des candidats est publié et suis la même forme.

## Hors périmètre

`analysis/ecart-juge-editeur.ts`, `analysis/analyse-du-run.ts`, `pipeline/gel/`,
`pipeline/run/`, `outils/contestations-posterieures.ts`, `pipeline/notation/file-humaine.ts`,
`note-retenue.ts`, `charge-juge.ts`, `vue-annotateur.ts` : autres lots.

## Cas limites (au moins)

1. Renvoi d'un seul juge sur une réponse du sous-ensemble d'outil : hors numérateur et dénominateur
   de ce juge seulement ; l'autre juge garde la réponse.
2. Renvoi des deux juges sur la même réponse.
3. Comparateur du même éditeur que l'outil permuté : absent avec motif, plus d'exception.
4. Deux comparateurs du même éditeur, un seul permuté.
5. Absence du contrefactuel d'outil (aucune réponse éligible ; sous-ensemble vide) : bloc publié,
   valide au schéma ; exemple invalide refusé (motif manquant).
6. Le contrefactuel des candidats ne change pas (tests existants verts sans modification).
