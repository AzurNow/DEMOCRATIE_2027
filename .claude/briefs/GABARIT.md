# Gabarit de brief pour un sous-agent codeur

Rédigé par la session principale pour `codeur-opus` ou `codeur-sonnet`. Le sous-agent
démarre à froid : il ne voit ni la conversation, ni les décisions prises, ni les fichiers déjà
lus. Tout ce qu'il doit savoir est dans le brief. Un brief qu'on ne pourrait pas confier à un
contributeur humain nouveau sur le dépôt n'est pas prêt.

Ce fichier n'est pas une définition d'agent : il vit hors de `.claude/agents/` pour ne pas être
chargé comme tel.

---

## Agent

`codeur-opus` (logique de mesure, refactoring délicat) ou `codeur-sonnet` (routine, interface,
site, outils, docs). Isolation : `worktree` si un autre sous-agent travaille en parallèle.

## Objectif

Une phrase : ce qui doit exister à la fin et qui n'existe pas maintenant.

## Contexte que le sous-agent ne peut pas deviner

- Décisions métier déjà prises, avec le paragraphe du protocole qui les fonde (§n).
- Pourquoi cette tâche maintenant, et ce qui en dépend ensuite.
- Vocabulaire du dépôt utile ici (item, lot, run, notation…), si le nom seul ne suffit pas.

## Fichiers

- À lire d'abord : chemins exacts, et ce qu'il faut y chercher.
- À créer : chemins exacts.
- À modifier : chemins exacts, et la nature de la modification.
- À ne pas toucher : ce qui est proche mais hors périmètre.

## Contraintes du protocole applicables

Les règles de `CLAUDE.md` et du protocole qui mordent sur cette tâche précise, citées, pas
paraphrasées. Exemple : « §5, symétrie : le tirage ne dépend d'aucun attribut du candidat. »

## Cas limites à tester

Liste fermée. Chaque ligne devient au moins un test. Exemples de la maison : item obsolète
exactement à la date du run, candidat sous le seuil de couverture, réponse manquante, réponse
tronquée, guillemets typographiques, lien mort, schéma invalide en entrée.

## Ce qui ne doit pas bouger

Comportements, signatures, fichiers ou tests existants que le diff ne doit pas modifier. Le
sous-agent le vérifie avant de rendre.

## Définition de terminé

- `pnpm check && pnpm test` passent, lancés par le sous-agent.
- Chaque cas limite ci-dessus a un test nommé.
- Rien d'écrit hors des fichiers listés.
- Aucun commit.
- Rapport dans l'ordre demandé par la définition d'agent.

## Questions déjà tranchées

Ce que le sous-agent pourrait être tenté de redemander, avec la réponse. Évite qu'il s'arrête
pour une hésitation déjà levée.
