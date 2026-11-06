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

## État au 2026-11-06 (nuit)

- Protocole **0.34** dans le dépôt. **La 0.35 est tranchée mais pas écrite** : l'auteur a dit « prends
  les décisions recommandées » ; D81 à D97 sont tranchées dans `docs/feuille-de-route.json` (#361), et
  les dix remplacements exacts de la 0.35 sont dans `docs/TACHES-AUTEUR.md` (section 1, Protocole).
  Le classifieur du mode auto refuse à l'agent l'écriture dans `docs/PROTOCOLE.md` (zone d'arrêt de
  CLAUDE.md) : l'auteur l'écrit, ou autorise l'agent explicitement.
- Fusionnées le 2026-11-06 : #338 à #358, #360 (clôture), #361 (décisions). Lancées en fusion
  automatique (CI verte puis `gh pr merge --merge`) : #362 (canal application refusé par les
  métriques secondaires), #363 (test du partage unique de `pnpm analyze`), #364 (D82, troncature
  « non renseignée »), #365 (D83, textes des pages citées hors du volume). Vérifier qu'elles sont
  fusionnées.
- Encore en cours à l'écriture de cet état, dans des worktrees d'agents (`.claude/worktrees/agent-*`) :
  lecture de comparateur confrontée à la version de l'item au gel (DETTE 2026-10-02 n° 2) et D86
  (`verifierOutils` relâché). S'ils ont rendu sans PR : relire leur diff, commiter, PR, fusionner.
- **#359 en brouillon, rouge volontairement** jusqu'à la 0.35 (D97) ; ensuite fusionner `main` dedans.
- Après la 0.35 : coder D85 (contrefactuel d'outil absent pour tout outil hors dérangement du même
  éditeur), D94 (recopie du kappa avec contrôle d'identité du juge), D95 (motif
  `juge_retire_sans_calibration`, schéma compris).
- Le texte nouveau du site attend la relecture de l'auteur ; aucun rendu vérifié sur un vrai appareil.
- `site/site/` (cache `.astro` non suivi) fait échouer `pnpm check` en local, pas en CI : à supprimer
  avec l'accord de l'auteur. Worktree `agent-a0e98d279de57a40f` gardé (`scratch/maquette-habillage.html`).
- Rien n'a jamais tourné sur un appel réel. Avant le prochain gel, l'auteur renseigne
  `juges[].outils_de_son_editeur` dans `config/gel.json`.

## Ce qui était en cours

Voir l'État : deux agents, quatre PR en fusion automatique.

## Prochaines tâches, par priorité

1. Décisions de l'auteur (D94 à D97 d'abord : jeu d'or et graines), puis leur code.
2. Relecture du texte du site par l'auteur ; vérification sur un vrai téléphone et une vraie tablette.
3. Suite des lots de notation et des décisions en attente, d'après `docs/feuille-de-route.json`.
4. **Site** généré depuis `runs/` : seulement après la passe d'optimisation et la revue de code
   (`docs/PLAN-PAGE-PEDAGOGIQUE.md`).
5. Agents en parallèle : tests ciblés en local, suite complète en CI (`LESSONS.md`, Méthode).

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
