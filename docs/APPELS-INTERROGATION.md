# Appels de l'interrogation

<!-- Fichier engendré par `pnpm appels-interrogation` depuis le code de `pipeline/interrogation/`. Ne pas éditer à la main. -->

§9 du protocole : relancer l'interrogation exige les clés de chaque éditeur ; ce document dit exactement quels appels faire. Il est engendré depuis le code, et `tests/appels-interrogation.test.ts` échoue s'il n'est pas à jour.

## Conditions figées (§6)

Valeurs lues dans `pipeline/interrogation/conditions.ts`, identiques pour tous les outils.

| Condition | Valeur |
| --- | --- |
| Tentatives par requête, au plus | 3 |
| Attente avant la tentative 2, puis 3 | 30 s, puis 120 s |
| Abandon d'une tentative sans réponse | 180 s |
| Tokens de sortie, au plus | 2048 |
| Échantillons par question, formulation et mode | 2 |
| Fenêtre | 48 h, semi-ouverte, ouverte le jour `Tue` à 6 h, fuseau `Europe/Paris` |
| Modes | `web_activee`, `web_desactivee`, ceux que l'outil déclare dans `perimetre.outils[].modes` |

## Plan d'interrogation (`pipeline/interrogation/plan.ts`)

- Sont interrogés les assistants inclus du périmètre du run ; un comparateur est lu, pas interrogé.
- Une file par outil, indépendante des autres. Tous les échantillons 1 partent avant les échantillons 2.
- Dans un échantillon : ordre croissant de l'identifiant de question, puis du mode, puis de l'identifiant de formulation (comparaison de chaînes, `outils/ordre-chaines.ts`). Aucune graine.
- Une requête est une conversation neuve : un seul message, le texte exact de la formulation, sans instruction système ni historique.

## Ce qui est enregistré

La requête complète est enregistrée avec la réponse (`schema/reponse.schema.json`), en-têtes compris, à l'exception des en-têtes d'authentification, retirés par nom sans égard à la casse : `authorization`, `x-api-key`, `api-key`, et ceux que déclare l'adaptateur de l'éditeur (ci-dessous). C'est le seul retrait autorisé (règle 7).

## Appels, par adaptateur

Requêtes construites par l'adaptateur lui-même, avec `<CLE_API_DE_L_EDITEUR>` à la place de la clé, `<modele_demande de config/perimetre.yaml>` à la place du modèle et `<texte exact de la formulation, tel que dans questions.json>` à la place du texte.

Aucun adaptateur d'éditeur réel n'est encore écrit : les appels ci-dessous sont ceux de l'éditeur simulé, sans réseau.

### `editeur-simule` (simulé)

Usage : `pnpm run:dry` et les tests ; aucun appel réseau, aucune réponse réelle.

Normalisation : `normaliser_editeur_simule`, version `1.1.0`.

En-têtes d'authentification propres à l'éditeur, retirés à l'enregistrement : `x-jeton-simule`.

#### Mode `web_activee`

Point d'accès : `simule://editeur-simule.invalid/v1/messages`

En-têtes envoyés :

```json
{
  "content-type": "application/json",
  "x-version-api-simulee": "2026-12-01",
  "authorization": "Bearer <CLE_API_DE_L_EDITEUR>",
  "X-Jeton-Simule": "<CLE_API_DE_L_EDITEUR>"
}
```

Corps :

```json
{
  "model": "<modele_demande de config/perimetre.yaml>",
  "max_tokens": 2048,
  "messages": [
    {
      "role": "user",
      "content": "<texte exact de la formulation, tel que dans questions.json>"
    }
  ],
  "outils": [
    {
      "type": "recherche_web"
    }
  ]
}
```

Paramètres effectifs enregistrés (`metadonnees.parametres_effectifs`) :

```json
{
  "max_tokens": 2048,
  "instruction_systeme": "aucune",
  "temperature": 1,
  "top_p": 1
}
```

#### Mode `web_desactivee`

Point d'accès : `simule://editeur-simule.invalid/v1/messages`

En-têtes envoyés :

```json
{
  "content-type": "application/json",
  "x-version-api-simulee": "2026-12-01",
  "authorization": "Bearer <CLE_API_DE_L_EDITEUR>",
  "X-Jeton-Simule": "<CLE_API_DE_L_EDITEUR>"
}
```

Corps :

```json
{
  "model": "<modele_demande de config/perimetre.yaml>",
  "max_tokens": 2048,
  "messages": [
    {
      "role": "user",
      "content": "<texte exact de la formulation, tel que dans questions.json>"
    }
  ]
}
```

Paramètres effectifs enregistrés (`metadonnees.parametres_effectifs`) :

```json
{
  "max_tokens": 2048,
  "instruction_systeme": "aucune",
  "temperature": 1,
  "top_p": 1
}
```
