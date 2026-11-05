# Prompt de fixture — version 1.0.0

Fixture des tests de `pipeline/notation/rendu-prompt-juge.ts`. Ce n'est pas un prompt de juge et
rien ne l'envoie à un modèle : il a la forme de `prompts/judge-*.md` (titre versionné, en-tête,
variables d'entrée, bloc « Texte du prompt »), porte chacune des quatorze variables de la charge une
fois, plus des accolades qui ne sont pas des variables.

| Champ | Valeur |
| --- | --- |
| Version | `tests/notation/fixtures/prompt-juge/prompt-juge-fixture` |
| Charge | `charge-juge-v6` (`VERSION_CHARGE_JUGE`) |

## Variables d'entrée

Un champ absent de la charge est rendu par le mot `ABSENT` : seulement sur les lignes qui le disent.

| Variable | Champ de la charge | Rendu |
| --- | --- | --- |
| `{question.premisse_fausse}` | `question.premisse_fausse` | `true` ou `false` ; `ABSENT` hors formulation orientée |
| `{reponse.citations}` | `reponse.citations` | tableau JSON de `{url, texte}`, ou `ABSENT` |
| `{reponse.troncature}` | `reponse.troncature` | `true` ou `false` ; `ABSENT` sur une saisie de l'application |
| `{reponse.texte}` | `reponse.texte` | texte projeté (peut être vide) |

## Texte du prompt

```text
DATE : {date_run}
GABARIT : {question.gabarit}
REGISTRE : {question.registre}
PREMISSE : {question.premisse_fausse}
QUESTION : {question.texte}
ATTENDUE : {reponse_attendue}
<<<
{reponse.texte}
>>>
LIENS : {reponse.liens}
CITATIONS : {reponse.citations}
TRONQUEE : {reponse.troncature}
REFUS : {reponse.refus_api}
BORNE : {longueur_max_texte_page}
PAGES : {pages_citees}
REFERENCES : {references}
SORTIE : {"categorie": "…", "drapeaux": [ … ]} ou { … comme ci-dessus … }
```
