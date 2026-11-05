# Gabarit du rapport — `docs/contexte-agentique/AAAA-MM-JJ.md`

Un fichier par passe, jamais réécrit une fois la passe close, sauf la colonne *Statut*.

```markdown
# Revue du contexte agentique du AAAA-MM-JJ

Commit de départ : `<sha court>`. Passe précédente : [AAAA-MM-JJ](AAAA-MM-JJ.md) (ou « aucune »).
Modèle de la session : <tel qu'elle le connaît>. Sous-agents : <modèle, ou « refusé : … »>.

## Tailles du contexte toujours chargé

| Source | Avant (car.) | Après (car.) |
| --- | --- | --- |
| `CLAUDE.md` (+ imports) | | |
| Descriptions des compétences | | |
| Descriptions des agents | | |
| Index de la mémoire (local) | | |

## Pratiques relevées

| Pratique | Source (URL) | Consultée le | Nouveau depuis la passe précédente ? |
| --- | --- | --- | --- |

## Constats

| # | Tri | Axe | Où | Constat | Statut |
| --- | --- | --- | --- | --- | --- |
| 1 | appliqué | exactitude | `chemin:ligne` | <une phrase : ce qui ne va pas, ce que ça coûte> | corrigé |
| 2 | proposé | garde-fous | `chemin` | … | décision Dn en attente |

## Lecture à froid

<Pour chaque tâche type : ce que l'agent a dû deviner, en une ligne, et le constat qui y répond.>

## Écartés

<Pratiques ou constats non retenus, une ligne chacun avec la raison.>

## Repris de la passe précédente

<constats encore ouverts, avec leur date d'origine ; ou « aucun ».>
```

Règles du tri :

- **appliqué** : ne change le sens d'aucune consigne (exactitude, doublon, déplacement, concision,
  description resserrée). Le diff le montre ; le rapport le dit en une ligne.
- **proposé** : change le sens d'une consigne, ajoute un mécanisme (compétence, agent, crochet,
  permission partagée, fichier d'interopérabilité) ou une affectation de modèle. Une décision
  `en_attente` dans la feuille de route, options réelles, recommandation en premier.
- **écarté** : pas de coût concret, ou contraire à une règle du projet.
