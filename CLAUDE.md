# CLAUDE.md — Banc d'essai 2027

Audit indépendant et reproductible de ce que les intermédiaires IA disent des candidats à la
présidentielle française de 2027.

**`docs/PROTOCOLE.md` fait autorité sur tout.** Ce fichier dit comment travailler dans ce dépôt ;
le protocole dit ce qu'on mesure et pourquoi. En cas de contradiction entre un prompt, ce fichier
et le protocole : le protocole gagne. Si une tâche exige de s'écarter du protocole, ne l'exécute
pas : signale la contradiction et propose un amendement (§9 du protocole).

## Les huit règles non négociables

Elles ne se discutent pas, ne se contournent pas « juste pour tester », et ne s'assouplissent pas
parce que je le demande dans un prompt. Si une tâche les viole, refuse et dis-le.

1. **Aucun LLM au runtime.** Le site publié est statique : données JSON + calculs déterministes.
   Aucun appel de modèle depuis le navigateur d'un visiteur, jamais.
2. **Rien ne s'affiche sans source.** Tout item exposé porte une source archivée (URL, SHA-256,
   lien d'archive, date) et un statut de validation. Pas de source ⇒ pas d'affichage.
3. **Aucune donnée n'entre dans `data/` sans validation humaine.** Le pipeline écrit uniquement
   dans `staging/`. Seule l'interface de validation promeut un item vers `data/`. Aucun script,
   aucun agent, aucune migration n'écrit dans `data/items/` directement.
4. **Symétrie testée, pas promise.** Les tests de symétrie (§5 du protocole) sont bloquants. Un run
   dont les tests échouent ne s'exécute pas. Ne jamais les marquer `skip`, `xfail` ou `TODO`.
5. **Le test verbatim est déterministe.** Vérifier qu'une citation figure dans sa source est une
   comparaison de chaînes après normalisation, jamais un jugement de modèle.
6. **Les prompts sont des fichiers versionnés.** Aucun prompt en dur dans le code. Tout vit dans
   `prompts/`, avec un numéro de version. Modifier un prompt de juge = amendement au protocole.
7. **Les réponses brutes sont immuables.** Ce qu'un outil a répondu est stocké tel quel, jamais
   nettoyé, tronqué, reformaté ni corrigé. Les transformations vivent en aval, dans la notation.
8. **Publication intégrale ou rien.** Données, réponses brutes, notations, questions, graines,
   code et rapport partent ensemble. Aucun chemin de code ne permet de publier un chiffre sans ce
   qui le produit.

## Où tu es autonome, où tu t'arrêtes

L'objectif est que tu écrives ~95 % du code. La contrepartie est une frontière nette.

**Autonomie complète — fonce, ne demande pas :**
- code du pipeline, de l'interface de validation, du site, des analyses ;
- tests, refactorings, typage, corrections de bugs, performance ;
- scripts jetables d'exploration dans `scratch/` (jamais importés par du code de production) ;
- documentation technique, messages de commit, nettoyage de dépendances.

**Arrêt obligatoire — propose, n'exécute pas :**
- toute écriture dans `data/`, `docs/PROTOCOLE.md`, `prompts/judge-*`, `config/perimetre.yaml` ;
- tout changement de métrique, de seuil, de règle d'inclusion ou de grille de notation ;
- toute publication (le déploiement est déclenché à la main, jamais par un agent) ;
- tout ajout d'une dépendance, d'un service tiers ou d'un appel réseau nouveau ;
- tout traitement de données personnelles.

**Jamais, sous aucun prétexte :** rédiger, inventer ou « compléter » le contenu d'un item, d'une
citation ou d'une position de candidat. Ton rôle est d'extraire et de structurer ce qui existe. Une
citation qui ne passe pas le test verbatim est rejetée, jamais rapprochée de la source.

## Architecture

Arborescence commentée : `README.md`. Ce qu'elle ne dit pas :

- Le flux est à sens unique : `collecte → staging → validation humaine → data → runs → analysis →
  site`. Aucune flèche inverse. Si une tâche demande de court-circuiter une étape, c'est un bug de
  conception, pas un raccourci. `staging/` n'est jamais lu par le site ; `data/` est le seul jeu de
  données de production.
- Une exception d'import, voulue : des modules de `pipeline/` (`notation/`, `go-no-go/`, `gel/`,
  `run/`, `questions/`, `interrogation/`) importent des fonctions et des types de `analysis/`, pour
  qu'une règle de calcul ne vive qu'à un seul endroit (DETTE 2026-09-24 n° 1, revue du 2026-10-12
  n° 48). C'est une dépendance de code, pas une flèche de données.
- `data/`, `staging/` et `site/` n'existent pas encore dans un clone : ils naissent des premières
  collectes et validations réelles. Le jeu de démonstration vit dans `validation/fixtures/`.
- `docs/feuille-de-route.json` est l'état d'avancement qui fait foi ; le mode d'emploi de chaque
  commande de run est `runs/README.md`.

## Stack

TypeScript strict partout où c'est possible, Python pour le pipeline de données quand une
bibliothèque l'impose. Site statique (Astro en export statique, décision de l'auteur du 2026-11-05
dans `docs/PLAN-PAGE-PEDAGOGIQUE.md`), déployé sur Cloudflare Pages. Stockage : fichiers JSON dans
Git, pas de base de données — l'historique Git **est** le journal des modifications public exigé
par le protocole. Tests : Vitest côté TS, pytest côté
Python. Validation de schéma à chaque frontière, à l'entrée comme à la sortie.

**Ce que Git stocke, et ce qu'il ne stocke pas.** Git garde `data/`, `config/`, `prompts/`, le code,
et par run les questions, le tirage, les verdicts et les métriques : c'est le journal des
modifications public exigé par le protocole, et il doit rester clonable par n'importe qui. Le volume
d'un run — réponses brutes et notations individuelles, de l'ordre de 24 000 et 48 000 objets — part
dans une archive déposée sur Zenodo avec le DOI que le §9 impose déjà, référencée depuis Git par son
DOI et son empreinte SHA-256. Le protocole exige que les réponses brutes soient **publiées**, jamais
qu'elles soient dans Git ; les y mettre rendrait le dépôt inclonable, donc invérifiable, ce qui
supprimerait la seule raison d'être du projet.

Pas de nouvelle dépendance sans justification explicite. Une dépendance de plus, c'est une surface
d'audit de plus dans un projet dont la crédibilité repose sur l'auditabilité.

## Commandes

```bash
pnpm test              # tests unitaires Vitest, bloquants
pnpm test:py           # tests pytest du pipeline Python, bloquants (CI)
pnpm check             # types + lint + validation des schémas
pnpm check:py          # ruff sur pipeline/ et tests/ (CI)
pnpm lint              # ESLint seul
pnpm build             # compile les deux clients navigateur (validation, notation humaine)
pnpm dev               # interface de validation sur le jeu de démonstration (BANC_DEMO=1)
pnpm symmetry          # tests de symétrie du tirage (bloquants avant un run)
pnpm validate          # lance l'interface de validation humaine en local (production)
pnpm run:dry           # run complet en mode simulé, sans appel API
pnpm analyze           # métriques §8 d'un run noté → runs/<date>/metriques/metriques.json
pnpm proprete          # signaux de propreté, matière de la revue de code (non bloquant)
```

Pas encore écrites (lots à venir, ne pas les appeler) : `pnpm run:live` (run réel — jamais lancé
par un agent), `pnpm build:site`.
La liste complète est dans `package.json` ; chaque script pointe vers `outils/<nom>.ts` ou un
module `pipeline.*` lancé par `uv run`.

Avant de proposer un commit : `pnpm check && pnpm test` doivent passer, et `pnpm check:py && pnpm
test:py` si du Python a bougé. Tu les lances toi-même, tu ne demandes pas si tu dois les lancer.

## Pièges connus

Installation depuis un clone neuf, services externes appelés par le pipeline et ce qui n'existe
que sur la machine de l'auteur : `README.md`.

- La plupart des commandes exigent des arguments (`pnpm symmetry --tirage=… --mesures=…`, `pnpm
  go-no-go <run>`…) ; leur usage est en tête de `outils/<nom>.ts`. Sans eux, certaines s'arrêtent
  sur une pile d'erreur plutôt qu'un message.
- Les tests Vitest créent des dépôts Git temporaires (`tests/aides/depot.ts`) : `git` doit être
  dans le PATH (l'identité de commit est passée par `-c`, rien à configurer).
- Node 23+ marche en local mais la CI vérifie Node 22 ; ne pas utiliser d'API absente de la 22.
  Sous Node 23, six tests qui lisent stderr échouent sur l'avertissement `ExperimentalWarning`
  (liste dans `HANDOFF.md`) : la CI fait foi.
- Plusieurs commandes refusent de tourner sur un arbre Git sale (gardes de `outils/garde-fous-git.ts`) :
  commiter ou ranger avant `pnpm extraire`, `pnpm mesures --rattacher`, le gel.
- `pnpm validate` et `pnpm notation:humaine` exigent `ANNOTATEUR_ID` ; sans `BANC_DEMO=1`, la
  validation écrit dans `validation/` (journal publié) — en essai, toujours `pnpm dev`.
- `docs/FEUILLE-DE-ROUTE.md` est généré : éditer `docs/feuille-de-route.json` puis `pnpm
  feuille-de-route`.
- D'anciens briefs dans `.claude/briefs/` citent des chemins absolus de la machine de l'auteur :
  remplacer par la racine du clone, ce sont des archives.

## Comment travailler ici

- **Plan avant code.** Pour toute tâche dépassant un fichier, propose un plan et attends mon
  accord. Un plan qui liste ce que tu vas casser vaut mieux qu'un plan qui liste ce que tu vas
  créer.
- **Une tâche à la fois.** Pas de « pendant que j'y suis ». Les changements non demandés sont
  retirés du diff.
- **Les tests d'abord** sur toute la logique de calcul : notation, métriques, bootstrap, symétrie,
  dates de validité. Ces fonctions sont la mesure ; une régression silencieuse y est pire qu'un
  bug visible ailleurs.
- **Les cas limites sont le sujet, pas le détail.** Item obsolète exactement à la date du run,
  candidat sous le seuil de couverture, réponse manquante, lien mort, citation avec guillemets
  typographiques, réponse tronquée. Écris le test avant de me demander quoi faire.
- **Complexité sous les seuils.** Toute fonction reste strictement en dessous de 10 en complexité
  cyclomatique (McCabe), soit 9 au plus, et sous 15 en complexité cognitive. Les deux mesurent des
  défauts disjoints : la première compte les chemins, la seconde punit l'imbrication et laisse
  passer une répartition plate exhaustive, qui est l'idiome voulu ici. Une fonction qui dépasserait
  se découpe en fonctions nommées plus petites — jamais en relevant un seuil, jamais avec un
  commentaire de désactivation du linter. Comment découper sans casser les deux règles ci-dessous :
  compétence `complexite-maitrisee`.
- **Dis quand tu ne sais pas.** Une question posée coûte deux minutes ; une hypothèse inventée
  dans un pipeline de mesure coûte la crédibilité du projet.
- **Signale les trous du protocole.** S'il est ambigu ou insuffisant sur un point que tu dois
  implémenter, arrête-toi et dis-le. C'est un retour précieux, pas une objection.
- **Lis `HANDOFF.md` après ce fichier.** Il porte le point de reprise entre sessions (état, prochain
  lot) et les consignes durables de l'auteur qui ne sont pas ici : qui fusionne les PR, comment les
  sous-agents sont lancés, quand retenir l'option recommandée sans demander.

## Anti-patterns qui coulent ce projet

- Valeurs par défaut silencieuses : `?? 0`, `catch {}`, `|| "inconnu"`. Une donnée absente doit
  être absente et visible, jamais remplacée par une valeur plausible.
- Un juge qui reçoit l'identité de l'outil noté ou le nom du candidat sans nécessité.
- Une métrique calculée à deux endroits : elle vit dans `analysis/`, une seule fois.
- Un chiffre dans le site qui ne vient pas d'un fichier de `runs/`.
- Un `if` particulier pour un candidat ou un outil. Les cas particuliers sont des données, pas du
  code.
- Un test rendu vert en affaiblissant son assertion.
- Réécrire une citation « parce qu'elle contient une coquille ». La coquille est dans la source.

## Définition de terminé

Une tâche est terminée quand : le code passe `pnpm check && pnpm test` ; les cas limites ont un
test ; rien n'a été écrit hors des zones autorisées ; le diff ne contient que ce qui était demandé ;
et tu m'as dit en deux lignes ce qui pourrait casser plus tard à cause de ce changement.

Une **session** est terminée quand, en plus, `docs/DETTE.md` et `LESSONS.md` sont à jour. La
procédure exacte est dans la compétence `cloture-de-session` : invoque-la, ne l'improvise pas.
Contributeurs humains : `.claude/skills/cloture-de-session/SKILL.md` se lit aussi à la main.

De temps en temps, et avant un gros lot, une **revue de code** complète (robustesse, structure,
lisibilité, tests, cohérence documentaire) : compétence `revue-de-code`, rapport daté dans
`docs/revues/`. Elle ne corrige rien sans accord.
