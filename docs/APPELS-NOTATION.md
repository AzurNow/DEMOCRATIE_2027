# Appels de la notation

<!-- Fichier engendré par `pnpm appels-notation` depuis le code de `pipeline/notation/`. Ne pas éditer à la main. -->

§7 du protocole : deux juges automatiques notent chaque réponse obtenue ; leurs prompts et les réponses brutes sont publics, pour que n'importe qui puisse renoter. Ce document dit exactement quels appels font les juges réels. Il est engendré depuis le code, et `tests/appels-notation.test.ts` échoue s'il n'est pas à jour.

## Réglages et tentatives

Le modèle est celui que déclare `run.json#/juges[].modele`, recopié du gel. Les réglages d'échantillonnage (§7 : « fixés et publiés »), le délai d'abandon et la politique de tentatives ne sont encore déclarés nulle part (exigence §7.57) : ils figurent ci-dessous en marque-place, et `pnpm notation:reelle` refuse de partir tant qu'ils ne le sont pas.

## Lecture d'une réponse (`pipeline/notation/appel-juge.ts`)

Une réponse qu'un juge ne peut pas noter est renvoyée à un humain (§7), sous l'un des motifs `erreur_api_persistante`, `contexte_depasse`, `sortie_refusee`, `sortie_illisible`, et la notation du run continue.

| Ce qui arrive | Motif |
| --- | --- |
| échec passager à chaque tentative (réseau, délai d'abandon, 408, 429, 5xx) | `erreur_api_persistante` |
| statut que l'adaptateur déclare de charge trop longue | `contexte_depasse` |
| tout autre statut hors 2xx, sauf 401 et 403 | `erreur_api_persistante` |
| refus de modération du fournisseur, dit par l'enveloppe | `sortie_refusee` |
| corps non UTF-8 ; `model` absent ou différent de `run.json#/juges[].modele` ; enveloppe inattendue ; sortie coupée ; texte non JSON ; sortie hors format | `sortie_illisible` |

Statuts `401`, `403` (clé invalide, accès refusé) : défaut du banc, pas du juge. La notation s'arrête au premier rencontré (`AccesApiRefuse`), sans écrire de renvoi pour la réponse en cours ; une relance après correction reprend sans rien réécrire.

Le texte du modèle doit être un seul objet JSON de la forme que lit `pipeline/notation/juge.ts` ; rien n'est réparé ni complété.

## Appels, par adaptateur

Requêtes construites par l'adaptateur lui-même, avec `<CLE_API_DE_L_EDITEUR>` à la place de la clé, `<modele de run.json#/juges[]>` à la place du modèle et `<texte du prompt de prompts/judge-*.md, variables remplacées par la charge>` à la place du prompt rendu. Le prompt rendu est le seul message, sans instruction système.

### `juge-anthropic` (éditeur `anthropic`, clé `ANTHROPIC_API_KEY`)

Point d'accès : `https://api.anthropic.com/v1/messages`

En-têtes envoyés :

```json
{
  "x-api-key": "<CLE_API_DE_L_EDITEUR>",
  "anthropic-version": "2023-06-01",
  "content-type": "application/json"
}
```

Corps :

```json
{
  "model": "<modele de run.json#/juges[]>",
  "max_tokens": "<max_tokens : valeur déclarée>",
  "messages": [
    {
      "role": "user",
      "content": "<texte du prompt de prompts/judge-*.md, variables remplacées par la charge>"
    }
  ],
  "output_config": {
    "effort": "<effort : valeur déclarée>"
  }
}
```

Statuts lus comme une charge trop longue (`contexte_depasse`) : `413`.

### `juge-mistral` (éditeur `mistral`, clé `MISTRAL_API_KEY`)

Point d'accès : `https://api.mistral.ai/v1/chat/completions`

En-têtes envoyés :

```json
{
  "content-type": "application/json",
  "accept": "application/json",
  "authorization": "Bearer <CLE_API_DE_L_EDITEUR>"
}
```

Corps :

```json
{
  "model": "<modele de run.json#/juges[]>",
  "messages": [
    {
      "role": "user",
      "content": "<texte du prompt de prompts/judge-*.md, variables remplacées par la charge>"
    }
  ],
  "temperature": "<temperature : valeur déclarée>",
  "max_tokens": "<max_tokens : valeur déclarée>",
  "random_seed": "<random_seed : valeur déclarée>"
}
```

Statuts lus comme une charge trop longue (`contexte_depasse`) : aucun.
