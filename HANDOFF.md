# Passation — 2026-11-02

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

## État au 2026-11-02 (soir)

- Protocole **0.26** (#241). Décisions D1 à D61 tranchées ; **D62 en attente** (`docs/feuille-de-route.json`).
- Le 2026-11-02, #224 à #242 ont été fusionnées : D58 (deux juges, kappa de la paire, kappa des deux
  humains), D59 (vingt et un trous des plans analyse, extraction, interrogation et notation), D60
  (onze points laissés par la 0.24) et D61 (H2 sans objet sur une différence indéfinie, portée du
  retour en attente après un texte extrait erroné), avec leur code.
- Dette : `docs/DETTE.md`, entrée du 2026-11-02. Deux points hauts : les modules d'analyse ne sont
  assemblés par aucun appelant (`pnpm analyze` manque), et `rechercheAbsence` ne voit pas une
  proposition non rattachée (fausse absence). Le point 3 du 2026-11-01 (`Location` latin-1) reste ouvert.
- Rien n'a jamais tourné sur un appel réel : extraction, reformulation, interrogation, liens et
  notation ne sont exercés que sur doubles et fixtures.
- Le 2026-11-02, le mode auto de Claude Code a refusé `gh pr merge` sur la machine Windows de
  l'auteur, malgré la consigne de fusion : l'auteur a fusionné à la main.

## Mise à jour du 2026-11-04

- `main` en est au protocole 0.30 et à D73 (tranchée). Huit PR ouvertes le 2026-11-04, toutes à
  fusionner par l'auteur (le mode auto refuse `gh pr merge`), ordre dans `docs/TACHES-AUTEUR.md` §0 :
  #274 protocole 0.31 (D73) ; #275, #276, #279, #280, #281 constats de conformité n° 1 à 9 et 11 du
  2026-11-03 ; #277, #278 code de D73 (9), (10), (2), (4), après #274.
- **D74 en attente** : questions ouvertes de ces PR.
- Code de D73 restant (pas lancé, à la demande de l'auteur) : (5) libellés de courriel (table à
  rédiger par l'auteur), (6) accord-echantillons, (7) et (8) `juges[]`, (11) application testée,
  (12) dépôt → réponse, (13) à (15) notation, (16) H5, (17) modèles dans la tendance. Constats de
  conformité encore ouverts : n° 10, 12 à 37 hors réglés, et n° 25 (question D74 (5)).
- Pousser vers `https://github.com/AzurNow/DEMOCRATIE_2027.git` tant qu'`origin` n'est pas mis à jour.

## Ce qui était en cours

Rien, hormis les PR du 2026-11-04 ci-dessus.

## Prochaines tâches, par priorité

1. **Faire trancher D62** par l'auteur, en commençant par #233 (3) (fausse absence) et #233 (2)
   (aucun mécanisme ne consomme la liste des renvois à la réextraction). Poser les questions
   complètement, puis écrire la 0.27 dans une PR à part, et le code dans des PR suivantes.
2. **Lot `pnpm analyze`** : assembler les modules d'`analysis/` sur un partage unique (DETTE
   2026-11-02, point 1). Soumettre un plan à l'auteur avant d'écrire du code.
3. **Passe `conformite-protocole`** sur la 0.26 : la matrice date du 2026-11-01 (0.21), et les
   lots D58 à D61 l'ont fait bouger. Y ajouter le test des clés de graine (DETTE 2026-11-02, point 3).
4. **Site** (25 exigences) : pas avant que l'analyse existe.

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
