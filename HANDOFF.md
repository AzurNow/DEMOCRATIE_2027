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

## État au 2026-11-05 (nuit)

- Protocole **0.34** (#309, D79). Décisions D1 à D92 inscrites ; **D81, D82, D83, D85, D86, D88,
  D91 attendent l'auteur** (D85 et D88 se tranchent ensemble). D89, D90, D92 tranchées par la règle
  du 2026-11-01.
- Fusionnées le 2026-11-05 au soir : #327 (revue de code, `docs/revues/2026-11-05.md`), #328 (D75 (8)
  et commentaires), #329 (D87, verdicts de lecture), #330 (CLAUDE.md, accord de l'auteur), #331 (gel :
  D75 (14), (20), (21), (27), D84), #332 (écriture atomique de `metriques.json`), #333 (site : gardes,
  `pnpm test` construit le site), #334 (`analysis/` n'importe plus `pipeline/`, règle ESLint), #335
  (`analysis/parametres-protocole.ts`), #336 (D80, chaîne simulée continue). Code de D75 terminé.
- Revue du 2026-11-05 : constats 1 à 5, 7 à 9 corrigés ; constat 6 (journaux en retard) réglé par
  cette clôture et #330.
- Worktree `.claude/worktrees/agent-a0e98d279de57a40f` (`site/habillage`, fusionnée) gardé : il porte
  un fichier non suivi `scratch/maquette-habillage.html` ; à supprimer seulement avec l'accord de
  l'auteur.
- Rien n'a jamais tourné sur un appel réel. Avant le prochain gel, l'auteur renseigne
  `juges[].outils_de_son_editeur` dans `config/gel.json`.
- Dette : `docs/DETTE.md`, entrée du 2026-11-05 (soir). Dernière passe de conformité :
  `docs/conformite/2026-11-03.md` (0.30).

## Ce qui était en cours

Rien : toutes les PR de la session sont fusionnées. L'auteur a demandé de ne plus lancer d'agents en
fin de session.

## Prochaines tâches, par priorité

1. **Passe `conformite-protocole`** sur la 0.34 (code de D75 terminé).
2. **D89** (commande qui écrit le kappa juge-humain et `comptes_jeu_or`) et **D90** (test
   contrefactuel d'outil tiré), lots de notation ; **D92 (c)** : `run:dry --run` exige `simule: true`.
3. Dette du 2026-11-05 (soir) n° 2 : exception nommée du filet de la règle 3 pour `gel-simule.ts`.
4. **Site** généré depuis `runs/` : après la passe de conformité (`docs/PLAN-PAGE-PEDAGOGIQUE.md`).

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
