# Passation — 2026-11-01 (session cloud)

Pour une session Claude Code dans le cloud (claude.ai/code) qui reprend le dépôt pendant que la
machine de l'auteur est éteinte. L'auteur la pilote depuis son téléphone. Lire dans l'ordre :
`CLAUDE.md` (règles et installation), ce fichier, `docs/PROTOCOLE.md` (fait autorité sur tout),
`docs/feuille-de-route.json` (état qui fait foi).

La passation précédente (absence d'octobre, 2026-10-17) est dans l'historique Git de ce fichier.
Deux pièges de `CLAUDE.md` sont périmés depuis le retour de l'auteur : l'absence d'octobre est
finie, et `gh pr merge` fonctionne (voir « Fusion » ci-dessous).

## Installation dans le cloud

Suivre « Démarrer depuis un clone neuf » de `CLAUDE.md` : Node 22 (`.nvmrc`), pnpm par corepack,
uv puis `uv sync --frozen`. Vérifier avant tout : `pnpm check && pnpm test` et
`pnpm check:py && pnpm test:py` verts sur `main`. Sous Node 23, un seul échec est connu et sans
effet (`tests/run/invalidation.test.ts`, cas 4 : `ExperimentalWarning` sur stderr) ; la CI tourne
sous Node 22.

La mémoire locale de Claude Code de l'auteur n'existe pas dans le cloud : ses consignes durables
sont recopiées dans « Façon de travailler », en bas de ce fichier. Elles font foi.

## Fusion

Décision de l'auteur du 2026-11-01 :
- **Code, tests, documentation technique** : la session fusionne elle-même ses PR, dans l'ordre,
  une fois la CI `check-et-test` verte (`gh pr merge <n> --merge`). Jamais de push direct sur
  `main`.
- **Zones d'arrêt de `CLAUDE.md`** (`docs/PROTOCOLE.md`, `prompts/judge-*`, `data/`,
  `config/perimetre.yaml`, et toute décision métier) : la session **propose** une PR à part, qui ne
  touche que ces fichiers, et l'auteur la fusionne lui-même. Le code qui l'applique part dans une PR
  suivante, tirée de `main` après la fusion.
- Description de PR lisible sur téléphone, dans cet ordre : décision attendue (ou « aucune »), ce
  qui change, ce qui pourrait casser, comment c'est testé.

## État au 2026-11-01 (soir)

- Protocole **0.22** (#217). Décisions D1 à D57 tranchées (`docs/feuille-de-route.json`).
- Passe de conformité du 2026-11-01 sur la 0.21 (`docs/conformite/2026-11-01.md`) : ses quatre
  constats sont clos (#217, #218, #219).
- Matrice remise à jour (#221, `docs/conformite/2026-11-01-matrice.md`) : 467 exigences, aucune
  contredite, 48 « à implémenter » (site 25, analyse 10, extraction 4, interrogation 4,
  notation 4, hors code 1).
- Dette : `docs/DETTE.md`, entrée du 2026-11-01. Points hauts 1 et 2 réglés (#216, #220) ; reste
  le point 3 (`Location` latin-1 relu en UTF-8), à vérifier seulement au premier test des liens
  réel.
- Rien n'a jamais tourné sur un appel réel : extraction, reformulation, interrogation, liens et
  notation ne sont exercés que sur doubles et fixtures.

## Ce qui était en cours

Rien : tout le travail du 2026-11-01 est fusionné (`main` à `fdd1a36`, #214 à #223). Les constats
n° 5, 6, 8 et 10 de la matrice sont corrigés (#222, #223) ; le n° 9 est accepté par l'auteur. Le
tableau de bilan de `docs/conformite/2026-11-01-matrice.md` n'a pas été recompté après ces deux PR :
la prochaine passe `conformite-protocole` le refera.

## Prochaines tâches, par priorité

1. **Attendre la décision de l'auteur sur le kappa** (constat n° 7 de la matrice, et le reliquat du
   n° 8). Le protocole ne définit ni le « kappa de la paire » sur le jeu d'or (§7.22, §7.23 :
   moyenne des deux juges, minimum, ou accord du verdict combiné ?) ni, au §7.30, si l'accord des
   deux humains publié est un kappa ou la seule part d'accord. Ne rien coder avant : poser la
   question complètement à l'auteur, puis proposer la révision du protocole en PR à part. Ce qui
   est publié aujourd'hui (#223) : `run.json#/accord_humains_echantillon`, compte et part de
   l'accord défini au §7, sans kappa.
2. **Trois questions laissées par #223** (constat n° 6), à poser à l'auteur :
   - `run.schema.json#/juges` n'exige qu'un juge (`minItems: 1`) : un run à un seul juge passe la
     règle des familles. Recommandé : exiger deux juges (règle d'inclusion, donc décision de
     l'auteur).
   - Le gel n'appelle pas `exigerFamillesDistinctes` (`pipeline/notation/familles-juges.ts`) : deux
     juges de même famille sont gelés puis refusés à la notation. Recommandé : l'appeler aussi au
     gel (code seul, petit lot ; option recommandée retenue sans demander).
   - Aucune exclusion d'une famille d'Anthropic n'est écrite au protocole : rien à coder sans texte.
3. **Lot analyse** (10 exigences, `pnpm analyze`, règle de décision H1/H2/H4) : commencer par un
   plan soumis à l'auteur, jamais par du code (`CLAUDE.md`, « Plan avant code »).
4. **Extraction, interrogation, notation** (4 exigences chacune, liste dans le rapport de la
   matrice) : même règle, un plan d'abord.
5. **Site** (25 exigences) : pas avant que l'analyse existe.

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
  `docs/feuille-de-route.json` puis `pnpm feuille-de-route`). Mettre à jour ce fichier avant de
  s'arrêter, pour la session suivante.
