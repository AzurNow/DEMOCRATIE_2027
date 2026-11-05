# Brief — D79 : ordre de la file humaine indépendant du motif

## Agent

`codeur-opus`, isolation `worktree`. Une autre session écrit en parallèle dans `CLAUDE.md`,
`README.md`, `HANDOFF.md`, `.claude/`, `docs/feuille-de-route.json` et `docs/PROTOCOLE.md` : ne
touche à aucun de ces fichiers.

## Objectif

L'ordre dans lequel `pipeline/notation/file-humaine.ts` présente les tâches à un annotateur ne
dépend plus du motif de la tâche : il suit un tirage à graine sur toutes les réponses du run.

## Contexte que tu ne peux pas deviner

- Aujourd'hui, `construireFile` trie par groupe (`cleDeTri`) : l'échantillon humain d'abord, au rang
  de son tirage ; puis le jeu d'or, au rang de son tirage ; puis le reste, par identifiant. Le code
  est public : un annotateur qui voit une réponse servie après le bloc échantillon sait qu'elle
  vient d'un désaccord des juges, d'un drapeau grave, d'un extrait invalide ou d'un renvoi. C'est une
  fuite de « la note des juges », que le §7 interdit (« travaillant à l'aveugle (sans voir l'outil,
  ni l'autre annotateur, ni la note des juges : un humain reçoit exactement ce que reçoit un juge) »).
- Décision D79 de l'auteur (2026-11-05, option 1) : une seule file par annotateur, mélangée par une
  graine publiée au gel, sans bloc par motif ; test nommé que l'ordre ne dépend pas du motif. Coût
  accepté : l'échantillon n'est plus noté en premier, le kappa du §12 arrive avec la fin de la file.
- Texte de protocole 0.34 proposé dans une PR à part (§7, à la suite de la phrase citée ci-dessus) :
  « L'ordre dans lequel les réponses sont présentées à un annotateur ne dépend pas du motif qui les
  lui envoie : il est tiré parmi les réponses obtenues du run, avec une graine dérivée de la graine
  publiée de l'échantillon humain et de la clé « ordre_file_humaine ». »
- Précédent exact : le jeu d'or tire avec `CLE_JEU_OR = ["jeu_or"]` dérivée de
  `run.graines.echantillon_humain` (`pipeline/notation/echantillons.ts`, `ordreTire`).

## Fichiers

- À lire d'abord : `pipeline/notation/file-humaine.ts` (en-tête, `construireFile`, `cleDeTri`,
  `comparerTaches`), `pipeline/notation/echantillons.ts` (`ordreTire`, clés `CLE_*`),
  `tests/notation/file-humaine.test.ts` (bloc « ordre des tâches »),
  `tests/notation-humaine/aveuglement.test.ts`, le §7 de `docs/PROTOCOLE.md` (grep « Annotateurs
  humains » et « jeu_or »).
- À modifier : `pipeline/notation/echantillons.ts` (nouvelle clé exportée
  `CLE_ORDRE_FILE_HUMAINE = ["ordre_file_humaine"]`, documentée comme les autres, et une fonction
  exportée qui rend l'ordre tiré) ; `pipeline/notation/file-humaine.ts` (tri et en-tête) ;
  `tests/notation/file-humaine.test.ts`. Tout autre fichier qui décrit l'ordre ancien (grep
  « d'abord l'échantillon », « puis le jeu d'or », `cleDeTri`, dans `notation-humaine/`,
  `runs/README.md`, `docs/CONTROLE-MANUEL.md`, `docs/CONTRATS.md`) : mettre le texte à jour.
- À ne pas toucher : le tirage de l'échantillon et du jeu d'or, `decider`, les comptes par motif,
  les zones d'arrêt de `CLAUDE.md`, et les fichiers de la section « Agent ».

## Règle à implémenter

Rang d'une tâche = rang de sa réponse dans `ordreTire(ids des réponses obtenues reçues par
construireFile, run.graines.echantillon_humain, CLE_ORDRE_FILE_HUMAINE)`. À rang égal (même
réponse, deux motifs), l'ordre de `MOTIFS_HUMAINS` départage, comme aujourd'hui. Une tâche dont la
réponse n'est pas dans ce tirage lève `FileIncoherente`, comme aujourd'hui.

## Cas limites à tester (liste fermée)

1. Le rang d'une tâche est celui de sa réponse dans l'ordre tiré, quel que soit son motif.
2. Test nommé « l'ordre ne dépend pas du motif » : deux entrées identiques sauf le motif qui envoie
   une même réponse à l'humain (échantillon dans l'une, désaccord des juges dans l'autre, en
   changeant les notations des juges) donnent à cette réponse la même position relative face aux
   autres réponses communes.
3. Une tâche hors échantillon peut précéder une tâche d'échantillon (fixture où c'est le cas).
4. Déterministe quel que soit l'ordre des réponses et des notations reçues (test existant gardé).
5. Une même réponse sous deux motifs (échantillon et jeu d'or) : tâches adjacentes, départagées par
   `MOTIFS_HUMAINS`.
6. La clé est distincte de celles de l'échantillon et du jeu d'or : sur un même jeu de réponses,
   l'ordre de la file diffère de l'ordre de tirage de l'échantillon (graine fixée dans le test), et
   le texte haché est `<valeur>␀ordre_file_humaine`.
7. Une tâche dont la réponse n'est pas parmi les réponses obtenues : `FileIncoherente`.
8. Run sans aucune tâche humaine : file vide, aucune erreur.
9. `tests/notation-humaine/aveuglement.test.ts` reste vert sans modification de ses assertions.

## Ce qui ne doit pas bouger

Les tâches elles-mêmes (qui, quel motif, combien de places), les comptes, `attend_juge`,
`sans_motif_admis`, la vue de l'annotateur, et les assertions des tests d'aveuglement. Seul l'ordre
change, et les tests de l'ordre ancien sont réécrits pour la nouvelle règle, pas affaiblis.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par toi (sous Node 23, six tests de ligne de commande
  échouent déjà sur `ExperimentalWarning` lu sur stderr, liste dans `HANDOFF.md` : ignorer ceux-là
  seulement, et le dire).
- Chaque cas limite a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Aucun commit.

## Questions déjà tranchées

- Faut-il garder l'échantillon en premier pour avoir le kappa tôt ? Non, coût accepté par D79.
- La graine dépend-elle de l'annotateur ? Non : un seul ordre par run, chaque annotateur voit les
  tâches qui lui restent dans cet ordre.
- Faut-il un nouveau champ de graine dans `run.json` ? Non : graine dérivée de
  `graines.echantillon_humain` par clé, comme le jeu d'or ; aucun schéma ne change.
