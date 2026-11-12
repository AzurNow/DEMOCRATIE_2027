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

## État au 2026-11-11

- **Passe `hypotheses-structurantes` du 2026-11-10 terminée et fusionnée (#410)** ; session close
  le 2026-11-11 (dette, leçons, tâches de l'auteur). Registre `docs/fondations/registre.md` (H1 à
  H12), passe datée `docs/fondations/2026-11-10.md`, scripts `c1` à `c7` et fichiers de travail
  dans `scratch/fondations/2026-11-10/` (`verification.md` est la seule base de faits admise ;
  `verif_citations.py` recontrôle les citations, à relancer après chaque révision du protocole,
  DETTE 2026-11-11 n° 3 ; ne pas nettoyer ce répertoire, DETTE n° 2). Statuts :
  H3 confirmée ; H1, H2, H4, H5 et H10 à tester ; H6, H7 (couches de volume), H8 et H11 infirmées ;
  H9 pari assumé ; H12 infirmée, rien à changer. La passe n'a touché ni au protocole, ni à une
  règle, ni à un jalon. **À l'auteur** : huit décisions `en_attente`, D105 à D112 (application
  saisie dès le pilote, tendance des non-réponses, plan de diffusion, date butoir et rythme
  mensuel, échelle de repli, partenaire de capacité d'annotation, indicateurs de succès, cinq
  points à confier à `critique-protocole`), et trois essais de terrain E1 à E3 (environ 6 h, 4 h,
  3 h plus l'avocat), décrits dans la passe. D105 à D111 demandent chacune une révision du
  protocole avant gel : les trancher avant d'écrire la 0.35 éviterait une version de plus
  (suggestion de la session). Si le périmètre ou un quota change avant ces décisions, relancer
  d'abord les scripts (DETTE n° 1). Après les décisions : étape 8 de la compétence (texte de
  révision dans une PR que l'auteur fusionne, puis `critique-protocole` et
  `conformite-protocole`).
- `site/site/` (cache Astro non suivi daté du 2026-11-06 : `.astro/`, `node_modules/.vite`) fait
  échouer `pnpm check` en local (« site/site/.astro/types.d.ts was not found by the project
  service ») ; la CI n'est pas touchée. Non supprimé par la session : à supprimer ou à ignorer,
  au choix de l'auteur.
- Protocole **0.34** dans le dépôt. **La 0.35 est tranchée mais pas écrite** : textes exacts dans
  `docs/TACHES-AUTEUR.md` (section 1, Protocole), items 1 à 18. L'auteur l'écrit ; le classifieur
  refuse cette écriture à l'agent.
- Fusionnées l'après-midi du 2026-11-09 : #399 à #405 (constats bas de la revue et de la conformité
  du jour : item principal à l'écran des formulations, constats 8/10/18/25 de la revue, niveaux
  balayés d'une mesure fictive, `redige_par` d'un item F, empreinte du protocole d'un run publié,
  garde des cycles étendue à `analysis/`, raison d'un changement de quota). Statuts mis à jour dans
  `docs/revues/2026-11-09.md` et `docs/conformite/2026-11-09.md` (pas dans `exigences.json` : à la
  prochaine passe de conformité).
- **#406 fusionnée** : l'auteur ne peut pas arbitrer (conformité n° 13). **D102** et **D103**
  tranchées par l'auteur (option recommandée). **À faire par l'auteur avant le prochain gel** :
  `annotateur_auteur` (son pseudonyme) dans `config/gel.json`, sinon `pnpm geler` refuse.
  Possible lot suivant (codeur-opus) : faire revérifier ce pseudonyme par les lecteurs d'arbitrage
  (`analysis/robustesse.ts`, `lectures-comparateur.ts`, `file-humaine.ts`).
- **#359 en brouillon, rouge volontairement** jusqu'à la 0.35 (D97).
- Après la 0.35 : coder D85, **D94 (sinon tout run après le pilote sort provisoire)**, D95 ;
  séparer la population API seul / avec application (DETTE 2026-11-09 n° 1) ; réglages des juges au
  gel (Q1, D98) ; constat 14 de la revue (`charge-juge-v7`).
- Restent de la conformité du 2026-11-09 : les écarts « amendement requis » (n° 2 à 8, 14, 15, 18 à
  24), tous à l'auteur. Plus aucun écart « code à aligner ».
- Node local 22.23.3 sous le minimum d'Astro (22.23.4) : `pnpm test` complet ne démarre pas en
  local ; les agents lancent `pnpm check` et Vitest ciblé, la CI fait foi.
- Ménage fait : worktrees et branches fusionnés supprimés (`core.longpaths` activé). Avant de
  supprimer un worktree d'agent, retirer d'abord sa jonction `node_modules` (`cmd /c rmdir`, sans
  `/s`) : elle pointe sur celui du dépôt principal. Reste `.claude/worktrees/cloture/`, non
  enregistré et d'origine inconnue, laissé tel quel.
- Rien n'a jamais tourné sur un appel réel. Interrogation réelle et `pnpm run:live` attendent
  `config/perimetre.yaml` (auteur).

## Ce qui était en cours

Rien hors #359 (brouillon, 0.35).

## Faisabilité et démarchage (discussion du 2026-11-12, rien de tranché)

Discussion sans code, recopiée ici parce que l'auteur reprend depuis une autre machine.

- **Constat.** 0 item dans `data/items/`, protocole non gelé, annotateurs non recrutés : les jalons
  du 15 nov., du 22 nov. et du 1er déc. ne tiennent plus. Le modèle de la critique
  (`scratch/critique/D/faisabilite.py`) donne, au périmètre réaliste (≈ 490 questions, 11 couples,
  1 échantillon), ≈ 456 € d'API et **256 à 499 h d'annotation par run**. La charge vient de deux
  règles du §7 (échantillon proportionnel de 10 %, renvoi humain de chaque désaccord), pas du
  périmètre ; retirer des candidats ne gagne presque rien.
- **Brouillon d'amendement** : `scratch/amendement-charge/BROUILLON.md` (pas le protocole).
  Échantillon humain fixe de 400 réponses et strate de désaccord échantillonnée à 400, pondérée ;
  80 à 142 h par run. Pas de troisième juge (le §7 impose deux juges, et le renvoi humain des
  désaccords est un garde-fou de conflit d'intérêts déclaré). Trous ouverts : poids dans le
  bootstrap du §8, puissance de la robustesse (a), taille 400 à simuler. Décisions à l'auteur, en
  fin de brouillon.
- **Autres pistes** : 4 à 5 runs événementiels au lieu de l'hebdomadaire ; ~5 couples outil × mode
  en gardant des paires web / sans web (H2) ; association loi 1901 ; partenaires (laboratoire,
  rédaction, ONG) qui apportent leurs propres annotateurs. L'auteur ne finance pas l'annotation de
  sa poche : ne jamais proposer de mission rémunérée non financée.
- **Démarchage préparé, pas envoyé.** Liste de cibles, page de présentation et courriels sont
  **hors du dépôt** (dossier privé de l'auteur : noms de personnes), à copier par l'auteur d'une
  machine à l'autre. Concurrents 2027 vérifiés (Fondation Jean-Jaurès et Onclusive,
  Angie/Meteoria, La Voix des IA, T. Mendès France) : aucun ne vérifie l'exactitude contre des
  citations sourcées, c'est le positionnement du projet.
- **Ordre convenu avant tout envoi** : (1) l'auteur écrit la 0.35 ; (2) il tranche le principe de
  l'amendement de charge ; (3) deuxième passe `/critique-protocole` sur la 0.35 et le brouillon,
  lancée par l'auteur, avec deux lentilles à ajouter (faisabilité opérationnelle ; sobriété et
  lisibilité pour un lecteur extérieur) ; (4) guide de lecture de 3 à 4 pages, FR et EN ; (5)
  courriels corrigés : « une heure suffit » est faux tant que le protocole fait ≈ 23 000 mots en
  français ; (6) envoi, sans nouvelle passe interne avant les retours extérieurs.
- **Code restant estimé** : 4 à 6 semaines agentiques (0.35 et D85/D94/D95/D98 ; adaptateurs réels
  et `run:live` ; poids de l'amendement dans `analysis/` ; site de résultats), plus 1 à 3 semaines
  au premier contact avec le réel. Le goulot est le temps de l'auteur et le hors-code.

## Prochaines tâches, par priorité

1. Protocole 0.35 par l'auteur, puis D94, D85, D95 et la séparation des populations.
2. `config/perimetre.yaml` par l'auteur, puis adaptateurs d'interrogation réels et `pnpm run:live`.
3. Relecture du texte du site par l'auteur ; vérification sur un vrai téléphone et une vraie tablette.
4. **Site** de résultats généré depuis `runs/` (`docs/PLAN-PAGE-PEDAGOGIQUE.md`).
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
