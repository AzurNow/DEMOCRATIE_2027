# Brief — D75 lot B : analyse, points (16), (25), (26)

Agent : `codeur-opus`, worktree. Lis d'abord le fichier commun
`/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.

## Objectif

- **(16)** `analysis/analyse-du-run.ts` refuse encore un verdict de lecture
  (`VerdictDeLectureNonDefini`) : `sectionComparateurs` lit le verdict de lecture
  (`mode_resolution`, voir D74 et les lectures de comparateur) au lieu de refuser.
- **(25)** `analysis/ecart-juge-editeur.ts` lève sur une réponse renvoyée par un seul juge, donc
  `pnpm analyze` échouerait au premier renvoi réel : sortir ces réponses du calcul et les nommer
  dans la sortie (identifiants, motif), sans valeur par défaut.
- **(26)** Test nommé de la population de l'écart juge-éditeur, telle que la 0.33 l'écrit (§7) :
  canal API, tous modes, couples incomplets compris ; sans objet si un juge est retiré. Vérifier que
  le code fait cela ; corriger s'il s'en écarte.

## Hors périmètre

`pipeline/notation/`, `pipeline/gel/`, `pipeline/run/`, `outils/contestations-posterieures.ts`,
`outils/analyze.ts` (sauf si (16) l'exige au plus petit), `schema/run.schema.json` : autres lots.

## Cas limites (au moins)

1. (16) Verdict de lecture présent : la section des comparateurs le lit ; absent : absent avec
   motif, pas d'exception.
2. (25) Réponse renvoyée par un seul juge : hors du calcul, nommée ; renvoyée par les deux : idem ;
   aucune renvoyée : sortie inchangée.
3. (25) Toutes les réponses d'un couple renvoyées : l'écart est absent avec motif, pas zéro.
4. (26) Population : réponse d'application exclue ; tous modes inclus ; couple incomplet inclus ;
   juge retiré : écart sans objet.
5. `pnpm analyze` de bout en bout sur fixtures avec un renvoi d'un seul juge : code 0.
