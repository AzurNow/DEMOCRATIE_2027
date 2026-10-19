# Passation — 2026-10-17

Pour une personne ou un agent qui reprend le dépôt sans contexte, pendant deux semaines d'absence
de l'auteur. Lire dans l'ordre : `CLAUDE.md` (règles et installation), ce fichier,
`docs/PROTOCOLE.md` (fait autorité sur tout), `docs/feuille-de-route.json` (état qui fait foi).

## Mission pendant l'absence

Deux choses seulement :

1. **Rendre le code pleinement fonctionnel** : les lots de correction ci-dessous, dans l'ordre.
   Tout travail au-delà de cette liste (par exemple ce qui manque pour une chaîne simulée de bout
   en bout) commence par un plan soumis à l'auteur (voir « Quand il faut l'auteur »), jamais par du
   code.
2. **Relire et mettre à jour le protocole, puis le code en conséquence.** `docs/PROTOCOLE.md` et
   `prompts/judge-*` restent des zones d'arrêt de `CLAUDE.md` : une modification se **propose**
   dans une PR à part, qui ne touche que ces fichiers (et le journal des révisions en tête du
   protocole). La fusion par l'auteur vaut accord. Le code qui applique la révision part dans une
   PR suivante, tirée de `main` une fois la révision fusionnée. Avant la 1.0, une modification est
   une révision listée en tête du protocole, pas un amendement (§9). Ne jamais mélanger texte du
   protocole et code dans une même PR. Après chaque révision fusionnée, repasser la compétence
   `conformite-protocole` (rapport dans `docs/conformite/`), qui dit quel code doit suivre.
   Première révision faite : la 0.19 (#163, 2026-10-19) reporte au protocole les textes de
   D54 (2), (4) et D55 (4), (5), (9) rédigés dans `docs/TACHES-AUTEUR.md` (section 1, entrées
   datées du 2026-10-17).

Hors mission : collecte réelle, appels d'API réels, écriture dans `data/` ou dans
`config/perimetre.yaml`, site, déploiement, signature et gel de la 1.0 (l'auteur seul).

**Revue et fusion** : l'auteur relit et fusionne les PR lui-même depuis GitHub, en voyage. Donc :
des PR petites, une par lot, avec une description qui se lit sur téléphone, dans cet ordre :
décision attendue (ou « aucune »), ce qui change, ce qui pourrait casser, comment c'est testé.

**Accès** : l'assistant pousse ses branches sur `origin` et ouvre des PR ; il ne pousse **jamais**
sur `main` et ne fusionne jamais, même si ses droits GitHub le permettent.

## Quand il faut l'auteur

Une décision métier, une ambiguïté du protocole, un plan qui dépasse un fichier : ne rien
supposer. Ouvrir une issue GitHub (ou une PR en brouillon si du texte est proposé) qui pose la
question **complètement** : contexte, options réelles, coût de chacune, recommandation en
premier. Puis passer à un autre lot indépendant en attendant la réponse. Une question posée coûte
un jour d'attente ; une hypothèse inventée dans un pipeline de mesure coûte la crédibilité du
projet.

## Branche de départ

**`main`.** Ce fichier y arrive par la PR #156 (`wip/handoff-2026-10-17`, docs et configuration
seulement). Vérifier d'abord : `gh pr view 156 --json state` doit dire `MERGED`. Si elle ne l'est
pas encore, partir de `wip/handoff-2026-10-17` et le signaler dans chaque PR.

Chaque lot part d'une branche neuve tirée de `main` à jour (`git switch main && git pull`) et
vise `main`. Noms de branche : `lots/<sujet>` pour le code, `protocole/<sujet>` pour une
révision. Ne **jamais** baser une PR sur la branche d'une autre PR non fusionnée (c'est ainsi que
#54 a manqué `main`, `LESSONS.md`) : si un lot dépend d'un autre, attendre la fusion du premier.

## État actuel

- Protocole en **version 0.19** (#163, 2026-10-19), pas encore gelé en 1.0. Le jalon J1 (15 octobre) est dépassé :
  les jalons sont repoussables, la qualité passe avant les dates.
- Code livré, de T2 à T3 selon les lots : schémas, interface de validation, collecte et
  archivage, extraction double, questions/tirage/symétrie, interrogation simulée, notation et
  notation humaine, test des liens, analyse §8, contestation/notification, go/no-go, gel, mesures
  validées, reformulation. **Pas encore écrits** : le site statique (T0), `pnpm run:live`,
  `pnpm analyze`, `pnpm build:site`.
- Aucune donnée réelle : `data/`, `staging/`, `site/` n'existent pas dans un clone. Le pipeline
  n'a encore fait aucun appel d'API réel.
- Vérifié le 2026-10-17 sur un clone neuf, Node 22.23.3 : `pnpm install --frozen-lockfile`,
  `pnpm check`, `pnpm test` (207 fichiers, 3 711 tests), `pnpm build`, `uv sync --frozen`, ruff,
  `pytest` (607 tests) : tout vert. La CI Linux (ubuntu, Node 22) est verte sur `main` (82c8374)
  et sur la PR #156. `pnpm dev`, `pnpm run:dry`, `pnpm notation:dry`, `pnpm proprete` et
  `pnpm feuille-de-route` tournent sans argument ; les autres commandes exigent les leurs.
- Toutes les décisions D1 à D55 sont tranchées ; aucune n'attend l'auteur dans la feuille de route.

## Ce qui était en cours

La revue de code du 2026-10-17 (`docs/revues/2026-10-17.md`) a relevé 44 constats. L'auteur a
tranché le même jour ses 8 décisions (**D54**) et les 11 restées de la revue du 2026-10-12
(**D55**), option recommandée partout. Il restait à **coder les lots de correction**, une petite PR
chacune, en commençant par les gardes de sortie. Le texte au protocole de D54 (2), (4) et
D55 (4), (5), (9) est reporté au protocole en 0.19 (#163, 2026-10-19), première révision de la
mission (voir « Mission », point 2) ; la règle UTF-8 de `Location` (D55 (2)) attend la nouvelle
version de la table des liens.

## Prochaines tâches, par priorité

Critères communs à toutes : une PR par lot ; `pnpm check && pnpm test` (et `pnpm check:py &&
pnpm test:py` si du Python bouge) verts en local et en CI ; tests écrits **avant** le correctif
pour toute logique de mesure ; aucun écart aux huit règles ni écriture dans les zones d'arrêt de
`CLAUDE.md` ; colonne « Statut » du constat passée à « corrigé (#PR) » dans
`docs/revues/2026-10-17.md` ; entrée de dette ajoutée à la clôture (`cloture-de-session`).
Les numéros « Lot n » sont ceux du rapport de revue ; l'ordre ci-dessous est celui à suivre. Le
détail de chaque constat (fichier, ligne, scénario) est dans le rapport, section « Détail des
constats hauts et moyens » et tableau « Constats ».

1. **Lot 1 — gardes de sortie** (constats 6, 32). Acceptation : `pnpm reformuler --simule
   --sortie=data/...` et `pnpm extraire --simule` vers `data/` sont refusés par un refus nommé,
   testé ; un seul `cheminReel` partagé, l'extraction n'importe plus ses gardes d'un module de
   commande.
2. **Lot 4 — petites robustesses** (constats 7, 8, 18, 19, 20, 21, 23, 25, 27, 28 ; D54 (5) et
   (8)). Acceptation, entre autres : l'écran de notation humaine refuse un run invalidé ; relancer
   `run:invalider` sur le même motif répond « déjà inscrite », code 0 ; seul `.DS_Store` est
   ignoré en `staging/formulations/<id>/` (liste fermée en données) ; `run:dry` refuse une option
   inconnue ; chaque cas a son test.
3. **Lot 2 — registres de mesures** (constats 9, 11, 33, 26, puis 1 selon D54 (1)). Acceptation :
   écriture atomique avec contrôle de modification concurrente pour les trois registres, une
   frontière commune, précédence par l'ordre du registre et date contrôlée comme vraie date civile.
4. **Lot 5 — extraction, reprise** (constat 3, puis 2, 4, 17 selon D54 (2), (3), (7)).
   Acceptation : relance après arrêt sans doublon d'items ; 408/429/5xx = échec de transport,
   source reprise ; entrée à l'épinglage périmé refusée ; `model` servi ≠ épinglé ⇒
   `modele_different`.
5. **Lot reformulation** (constat 10 avec D54 (4), constat 5). Acceptation : une seule règle
   « formulation en vigueur » et un test d'accord reprise/relecture ; un état `sans_objet`
   n'affirme aucune position et ne bloque plus `tachesDe`.
6. **Lot 6 — structure du gel et du run** (constats 29, 30, 31, 34).
7. **Lot 7 — documentation** (constats 12 à 16, 35, 37 à 42), dont la description du thème dans
   `schema/commun.schema.json` (D54 (6), texte seul).
8. **Décisions D55 (1) à (10)** : un lot par point ou par groupe cohérent, tests d'abord ; détail
   dans `docs/feuille-de-route.json` (décision D55, champ `options`).
9. **Lot 8** : repris de la revue du 2026-10-12 (liste en fin de section « Lots de correction
   proposés » du rapport du 2026-10-17).

Le diff de `CLAUDE.md` demandé par D55 (11) (commandes réelles, dossiers manquants, exception
d'import `pipeline/` → `analysis/`) est fait dans la PR #156.

## Ce qu'il ne faut pas faire pendant l'absence

- Écrire dans `data/` ou `config/perimetre.yaml`. Changer une métrique, un seuil, une règle
  d'inclusion ou la grille de notation autrement que par une révision du protocole proposée dans
  sa propre PR. Ajouter une dépendance ou un appel réseau ; déployer ; lancer un appel d'API réel.
  Proposer, documenter dans une issue ou une PR, attendre l'auteur.
- Pousser sur `main`, fusionner, réécrire l'historique (`push --force`, `rebase` d'une branche
  déjà poussée et relue), proposer à la fusion une PR à la CI rouge. Supprimer une branche
  autrement que par `git branch -d`.
- Rendre un test vert en affaiblissant son assertion, ou le marquer `skip`/`todo`.

## Questions ouvertes

1. **Brouillons rendus publics** (`scratch/protocole-0.16/`, `scratch/prompts/judge-1.0.0*.md`,
   `scratch/perimetre/`) : acceptés pour l'instant, l'auteur les retirera de l'historique Git plus
   tard. Ne pas les supprimer d'ici là, ne pas en ajouter d'autres du même genre.
2. **Gel du protocole 1.0** (J1) : signature, avocat, Zenodo, transmission aux institutions,
   fournisseur SMTP — tâches de l'auteur seul (`docs/TACHES-AUTEUR.md` §1).
3. **Linux** : vérifié par la CI ubuntu, pas sur une machine Linux interactive. La transcription
   (faster-whisper, 1,6 Go de poids) n'a pas été rejouée sur un clone neuf.

## Façon de travailler (consignes durables de l'auteur)

- Une décision qui revient à l'auteur se pose **complètement** : contexte, options réelles, coût
  de chacune, recommandation en premier. Jamais une demi-ligne. Pendant l'absence, par une issue
  ou une PR GitHub (voir « Quand il faut l'auteur »).
- Avec Claude Code, la session principale orchestre ; le code de mesure part à l'agent
  `codeur-opus`, le code de routine à `codeur-sonnet`, avec un brief autonome d'après
  `.claude/briefs/GABARIT.md`. Un autre assistant suit les mêmes règles sans ces agents.
- Qualité avant dates : un code propre et complet vaut mieux qu'un jalon tenu.
- CI obligatoire sur `main`, administrateurs compris.
- Ménage : branches fusionnées et worktrees d'agents supprimés avec `-d`, jamais `-D`.
- Fin de session : compétence `cloture-de-session` (`docs/DETTE.md`, `LESSONS.md`,
  `docs/feuille-de-route.json` puis `pnpm feuille-de-route`).
