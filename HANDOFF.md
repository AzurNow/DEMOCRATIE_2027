# Passation entre sessions

Pour une session Claude Code qui reprend le dépôt sans la mémoire de la précédente : dans le cloud
(claude.ai/code), où la mémoire locale de l'auteur n'existe pas, ou en local sur une autre machine.
L'auteur la pilote parfois depuis son téléphone. Lire dans l'ordre : `CLAUDE.md` (règles et
installation), ce fichier, `docs/PROTOCOLE.md` (fait autorité sur tout), `docs/feuille-de-route.json`
(état qui fait foi).

Les consignes durables de l'auteur, qui ne vivent sinon que dans la mémoire locale de Claude Code,
sont recopiées dans « Façon de travailler », en bas de ce fichier. Elles font foi. Les passations
précédentes sont dans l'historique Git de ce fichier ; la section « État » est réécrite à chaque
clôture, jamais empilée.

## Installation dans le cloud

Suivre « Démarrer depuis un clone neuf » de `README.md` : Node 22 (`.nvmrc`), pnpm par corepack,
uv puis `uv sync --frozen`. Sur une machine Linux neuve (Debian/Ubuntu), avant : `sudo apt install
git python3-venv curl`, nvm (script d'installation du README de https://github.com/nvm-sh/nvm),
`git config --global user.name …` et `user.email …`, GitHub CLI (https://cli.github.com) puis
`gh auth login` pour pousser des branches et ouvrir des PR ; uv télécharge lui-même Python 3.12
s'il manque. Vérifier avant tout : `pnpm check && pnpm test` et `pnpm check:py && pnpm test:py`
verts sur `main`. Sous Node 23, six tests de ligne de commande qui lisent stderr échouent sur
l'avertissement `ExperimentalWarning: Type Stripping` (`tests/run/invalidation.test.ts` cas 4,
`tests/promote-texte-errone.test.ts` ×2, `tests/promote-renvoi-reextraction.test.ts`,
`tests/analysis/recalcul-b.test.ts`, `tests/go-no-go/metriques.test.ts`, constat du 2026-11-05),
sans effet ; la CI tourne sous Node 22 et fait foi.

## Fusion

Décision de l'auteur du 2026-11-01 :
- **Code, tests, documentation technique** : la session fusionne elle-même ses PR, dans l'ordre,
  une fois la CI `check-et-test` verte (`gh pr merge <n> --merge`). Jamais de push direct sur
  `main`. Si le contrôle automatique de Claude Code refuse la fusion, le dire à l'auteur et ne pas
  contourner.
- **Zones d'arrêt de `CLAUDE.md`** (`docs/PROTOCOLE.md`, `prompts/judge-*`, `data/`,
  `config/perimetre.yaml`, et toute décision métier) : la session **propose** une PR à part, qui ne
  touche que ces fichiers, et l'auteur la fusionne lui-même. Le code qui l'applique part dans une PR
  suivante, tirée de `main` après la fusion.
- Description de PR lisible sur téléphone, dans cet ordre : décision attendue (ou « aucune »), ce
  qui change, ce qui pourrait casser, comment c'est testé.
- Une PR en conflit se met à jour par un commit de fusion de `main`, jamais par rebase : le mode
  auto refuse le force-push.

## État au 2026-11-06 (après-midi)

- Protocole **0.34**. Fusionnées le 2026-11-06 au matin : #343 (conformité 0.34,
  `docs/conformite/2026-11-06.md`, aucun constat haut), #344 (D92 (c)), #345 (D93), #346 (suite de
  D90), #347 (jeu d'or hors de `decider`). Les décisions en attente de l'auteur et le reste des lots
  de notation sont dans `docs/feuille-de-route.json`, qui fait foi.
- **Page pédagogique du site**, sur demande de l'auteur (lisibilité, détails dépliables, cas exemple,
  interactivité, mobile et tablette) :
  - fusionnées : #348 (sections hors parcours : « En bref », détails en `<details>`), #349 (cadre
    mobile et tablette, en-tête, survol, retour en haut), #350 (parcours : vue d'ensemble, phrase-clé,
    points-clés, cas fictif suivi sur sept étapes), #351 puis #352 (le décor passe sous le texte : voile
    tiré de `--fond-courant` sous chaque bloc, plus de fondu en diagonale) ;
  - en cours à l'écriture de cet état : #353 (page `/exemple/` : « un banc à chaque arrêt de bus »,
    animée au défilement en CSS seul ; les gardes de `tests/site` lisent chaque page) et #354
    (`animation-timeline` fusionnée par le minificateur dans le raccourci `animation:` : l'apparition
    des sections et le retour en haut ne tournaient jamais). #354 se fusionne après #353.
  - **Le texte nouveau de la page (phrases-clés, « En bref », page `/exemple/`) attend la relecture
    de l'auteur avant tout déploiement** (`docs/PLAN-PAGE-PEDAGOGIQUE.md`).
  - Aucun rendu vérifié dans un vrai navigateur ni sur un vrai téléphone : seulement des captures
    Chrome sans tête. Le serveur de développement d'Astro ne démarre pas dans le bac à sable de
    Claude Code ; le site local se sert par `python3 -m http.server` sur `site/dist`.
- Worktree `.claude/worktrees/agent-a0e98d279de57a40f` (`site/habillage`, fusionnée) gardé : fichier
  non suivi `scratch/maquette-habillage.html`, à supprimer seulement avec l'accord de l'auteur.
- Rien n'a jamais tourné sur un appel réel. Avant le prochain gel, l'auteur renseigne
  `juges[].outils_de_son_editeur` dans `config/gel.json`.
- `docs/DETTE.md` et `LESSONS.md` ne sont pas encore à jour pour la session du 2026-11-06 : la
  clôture (`cloture-de-session`) reste à faire.

## Ce qui était en cours

#353 et #354 (voir ci-dessus) : vérifier qu'elles sont fusionnées, sinon les reprendre (CI, fusion
de `main` par commit de fusion, puis `gh pr merge --merge`).

## Prochaines tâches, par priorité

1. Fusion de #353 puis #354 ; clôture de session (`docs/DETTE.md`, `LESSONS.md`).
2. Relecture du texte du site par l'auteur ; vérification sur un vrai téléphone et une vraie tablette.
3. Suite des lots de notation et des décisions en attente, d'après `docs/feuille-de-route.json`.
4. **Site** généré depuis `runs/` : seulement après la passe d'optimisation et la revue de code
   (`docs/PLAN-PAGE-PEDAGOGIQUE.md`).

Hors mission sans accord explicite de l'auteur : appels d'API réels, collecte réelle, écriture dans
`data/` ou `config/perimetre.yaml`, déploiement, `pnpm run:live`, gel de la 1.0.

## Quand il faut l'auteur

Une décision métier, une ambiguïté du protocole, un plan qui dépasse un fichier : ne rien supposer.
Poser la question dans la conversation (l'auteur la lit sur son téléphone), formulée complètement,
ou ouvrir une PR en brouillon si du texte de protocole est proposé.

## Façon de travailler (consignes durables de l'auteur)

- Une décision qui revient à l'auteur se pose **complètement** : contexte, options réelles, coût de
  chacune, recommandation en premier. Jamais une demi-ligne.
- Depuis le 2026-11-01 : sur une décision d'outillage ou de code qui ne touche pas une zone d'arrêt,
  retenir l'option recommandée sans demander, et le dire. Paralléliser les lots indépendants.
- La session principale orchestre ; le code de mesure part à l'agent `codeur-opus`, le code de
  routine à `codeur-sonnet`, avec un brief autonome d'après `.claude/briefs/GABARIT.md`. Ces agents
  ne commitent pas : la session principale relit leur diff, commite, pousse et ouvre la PR. Lancer
  deux agents en parallèle dans des worktrees séparés ; un conflit sur `docs/conformite/` se
  résout à la fusion.
- Qualité avant dates : un code propre et complet vaut mieux qu'un jalon tenu.
- CI obligatoire sur `main`, administrateurs compris.
- Ménage : branches fusionnées et worktrees d'agents supprimés avec `-d`, jamais `-D`.
- Chaque PR dit ce qui pourrait casser ; une question laissée ouverte dans une PR entre le jour même
  dans la feuille de route (`LESSONS.md`, section Méthode).
- Fin de session : compétence `cloture-de-session` (`docs/DETTE.md`, `LESSONS.md`,
  `docs/feuille-de-route.json` puis `pnpm feuille-de-route`). Réécrire la section « État » de ce
  fichier avant de s'arrêter : c'est le point de reprise de la session suivante, en local comme dans
  le cloud.
