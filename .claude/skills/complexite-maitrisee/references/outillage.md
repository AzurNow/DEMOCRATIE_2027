# Outillage

Les deux seuils sont branchés et bloquants : `complexity` et `sonarjs/cognitive-complexity` dans
`eslint.config.js` (lancé par `pnpm lint` et `pnpm check`), `C901` dans `pyproject.toml` (lancé par
`pnpm check:py`). La CI les fait tourner sur chaque PR. Ce fichier dit comment ils sont réglés et
comment mesurer à la main avant de lancer le linter.

## TypeScript — règle `complexity` d'ESLint

Seuil à 9 : la règle ESLint signale **au-dessus** de `max`, donc `max: 9` refuse 10 et laisse passer
9, ce qui est exactement « strictement sous 10 ». Elle est en `error` et non en `warn` : un
avertissement qui ne casse pas le build n'est pas une règle, c'est un souhait.

## TypeScript — complexité cognitive

Seconde règle, bloquante elle aussi, via `eslint-plugin-sonarjs` (seuil 15). Elle mesure autre
chose : McCabe compte les chemins, la cognitive compte ce qu'il faut tenir en tête. Une répartition
plate et exhaustive sur les six gabarits marque 1 en cognitive et 7 en McCabe ; trois `if` imbriqués
marquent 6 en cognitive et 4 en McCabe. Prises ensemble, elles attrapent des défauts disjoints — et
la seconde protège l'idiome que `CLAUDE.md` réclame, le cas particulier traité en donnée plutôt
qu'en branche.

Côté Python, il n'existe pas d'équivalent dans Ruff : `C901` seul garde le pipeline, dont les
fonctions sont plus plates que celles du site. Ajouter un outil de complexité cognitive pour Python
serait une dépendance de plus, donc une décision de l'auteur.

## Python — `C901` de Ruff

Ruff signale quand la complexité est **strictement supérieure** à `max-complexity`, donc la même
valeur de 9 (`[tool.ruff.lint.mccabe]` de `pyproject.toml`).

## Mesurer à la main

Les deux outils ne comptent pas les mêmes formes. Comptes vérifiés le 2026-11-08 sur des fonctions
témoins, avec ESLint 10.10.0 et ruff 0.16.8.

**TypeScript (ESLint `complexity`)** : `1` de base, puis `+1` pour chacun de

- `if`, `else if` (mais pas `else` seul)
- `for`, `while`, `do`
- chaque `case` d'un `switch` (pas `default`, pas le `switch`)
- `catch`
- chaque `&&`, `||`, `??`
- chaque ternaire
- chaque `?.`
- chaque paramètre avec valeur par défaut

**Python (Ruff `C901`)** : `1` de base, puis `+1` par `if` et `elif`, par `for` et `while`, par
`except`, et `n − 1` pour un `match` à `n` branches. Ruff ne compte **ni** `and`/`or`, **ni**
l'expression conditionnelle, **ni** les compréhensions.

Exemple, une fonction TypeScript à `1 + 3 if + 1 for + 2 &&` vaut 7 : conforme, mais proche. Au-delà
de 7, ne pas attendre le linter — c'est le moment de regarder si un cas particulier ne devrait pas
être une donnée.
