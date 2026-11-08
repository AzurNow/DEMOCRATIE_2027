---
name: complexite-maitrisee
description: Découper une fonction trop complexe dans le Banc d'essai 2027, sans violer les règles du dépôt. À utiliser quand une fonction approche ou dépasse une complexité cyclomatique de 10, quand un linter signale complexity ou C901, quand une fonction de notation, de métrique, de tirage ou de validation accumule les branches, ou avant d'écrire une fonction dont on pressent qu'elle branchera beaucoup. Contient la façon de mesurer, les quatre découpes admises et les trois pièges propres à ce projet.
---

# Complexité maîtrisée

La règle est dans `CLAUDE.md` : toute fonction reste strictement sous 10 (McCabe), soit 9 au plus.
Ce document ne répète pas la règle, il dit **comment s'y conformer ici** — parce que la découpe
naïve entre en collision avec deux règles déjà posées dans ce dépôt.

## Mesurer avant de découper

Ne pas estimer à l'œil : `pnpm lint` (règles `complexity` et `sonarjs/cognitive-complexity`
d'ESLint) et `pnpm check:py` (`C901` de Ruff) mesurent, et `pnpm check` bloque. Les deux outils ne
comptent pas les mêmes formes : côté TypeScript, `&&`, `||`, `??`, le ternaire, `?.` et un paramètre
par défaut comptent chacun ; côté Python, `and`, `or`, l'expression conditionnelle et les
compréhensions ne comptent pas. Le détail, vérifié sur des cas témoins, est dans
`references/outillage.md`, « Mesurer à la main ».

## Les quatre découpes admises, dans cet ordre de préférence

1. **Déplacer les cas dans les données.** C'est la première à essayer dans ce projet, pas la
   dernière. Une table `gabarit × position → réponse attendue` dans `config/` remplace six branches
   par une lecture. Le `if` par candidat ou par outil est déjà un anti-pattern du dépôt : la
   complexité n'est souvent que le symptôme d'un cas particulier codé en dur.
2. **Extraire des prédicats nommés.** `est_obsolete_au_gel(item, date_gel)`,
   `a_couverture_suffisante(candidat)`. Une condition composée de trois `&&` devient un nom qui dit
   la règle du protocole, et le test de cette règle devient possible isolément.
3. **Séparer les phases.** Valider, puis calculer, puis formater. Une fonction qui fait les trois
   branche pour les trois. Les frontières de phase sont les frontières naturelles de découpe.
4. **Remonter la garde à l'appelant.** Une fonction qui commence par cinq `if` de rejet fait en
   réalité deux métiers : filtrer et calculer. Le filtre remonte, le calcul reste pur.

## Trois pièges propres à ce dépôt

**Ne pas éparpiller une métrique en la découpant.** `CLAUDE.md` interdit qu'une métrique vive à deux
endroits. Découper le calcul d'un taux en quatre fonctions privées du même module reste une seule
définition — c'est licite. Le devient illicite dès qu'un morceau est réutilisé ailleurs, ou qu'une
des fonctions extraites recalcule une valeur déjà stockée. La règle réelle : **une définition, un
module** ; le nombre de fonctions à l'intérieur est libre.

**Ne pas transformer une garde en valeur par défaut.** En remontant des gardes à l'appelant, la
tentation est de terminer la fonction extraite par un `?? 0` ou un `return "inconnu"`. C'est
l'anti-pattern numéro un du dépôt. Une donnée absente reste absente : la fonction extraite renvoie
l'absence, elle ne la comble pas.

**Ne pas découper les fonctions de schéma et de symétrie en perdant leur caractère bloquant.** Les
tests de symétrie (§5) et le test verbatim (§4) sont des refus, pas des scores. Après découpe, il
doit rester impossible qu'un sous-résultat faux se perde dans un agrégat permissif. Vérifier que le
refus remonte jusqu'en haut.

## Ce qui n'est jamais une réponse

- Relever le seuil, localement ou globalement.
- `// eslint-disable-next-line complexity`, `# noqa: C901`.
- Remplacer dix `if` par une chaîne de ternaires ou un dictionnaire de lambdas illisible : la
  complexité mesurée baisse, la complexité réelle monte. Si la découpe ne rend pas le code plus
  clair, c'est que la bonne découpe n'a pas encore été trouvée.
- Fusionner des branches en trichant sur les cas limites. Les cas limites sont le sujet de ce
  projet, pas le détail.

## Quand la découpe résiste

Une fonction qui refuse de descendre sous 10 sans devenir illisible signale presque toujours une
règle du protocole mal modélisée — un cas particulier qui devrait être une donnée, ou une
responsabilité qui appartient à un autre étage du flux. Le dire plutôt que de contourner, comme pour
un trou du protocole.

`references/outillage.md` — réglage des deux linters, et comment mesurer à la main ce que chacun
compte.
