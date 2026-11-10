# Format du registre et de la passe — `docs/fondations/`

Deux fichiers. Le **registre** (`registre.md`) est vivant : une entrée par hypothèse, réécrite à
chaque passe, jamais empilée ; il dit où en est chaque pari. La **passe datée** (`AAAA-MM-JJ.md`)
n'est jamais réécrite : elle dit ce qui a changé ce jour-là, sur quels faits, et porte les calculs,
les sources et les essais de terrain.

## Entrée du registre

```markdown
### H<n>. <L'hypothèse, en une phrase affirmative, telle que le protocole la pose>

- **Le protocole dit** : « <citation exacte> » (§x, ou fichier et section). Pour une absence :
  « rien » — termes cherchés en vain : <termes>.
- **Mécanisme supposé** : <par quel chemin cette phrase produit l'utilité attendue, en une ou deux
  phrases ; s'il n'est écrit nulle part, le dire>.
- **Maillon** : <mesure | publication | destinataire | action | effet pour l'électeur>.
- **Ce qui la falsifierait** : <l'observation ou le chiffre qui obligerait à l'abandonner>.
- **Ce qui tomberait avec elle** : <objet, canal, outils, destinataires, forme, calendrier,
  gouvernance, règle 1 ou 3, décision Dn>.
- **Statut** : confirmée | infirmée | à tester | pari assumé — <date>, <passe>.
- **Faits** : <une ligne par fait, avec sa force (1 calcul, 2 usage révélé, 3 littérature, 4
  analogue), sa source (URL, date consultée) ou son script (`scratch/fondations/AAAA-MM-JJ/…`)>.
- **Argument contraire** : <le plus fort que la passe a pu écrire, et pourquoi il ne renverse pas le
  statut — ou pourquoi il l'a renversé>.
- **Test ou essai** : <pour « à tester » : la procédure, qui l'exécute (agent / auteur), le coût en
  heures, le résultat qui falsifierait ; renvoi à la passe qui le décrit>.
- **Alternative** : <une seule, la meilleure, si le statut est infirmée ou à tester ; sinon
  « aucune ». Recommandation en premier, puis son prix :>
  - protocole : <sections touchées ; révision avant gel | amendement §9 | hors protocole> ;
  - code : <lots de la feuille de route rendus inutiles, lots nouveaux> ;
  - calendrier : <runs publiés avant le premier tour, avec et sans> ;
  - crédibilité : <lentille de critique-protocole rouverte, ou « aucune »> ;
  - effet attendu : <sur quel maillon, fondé sur quel fait>.
- **Décision** : <aucune | Dn en attente | tranché par l'auteur le AAAA-MM-JJ : …>.
```

Règles :
- Le titre est l'hypothèse **telle que le protocole la pose**, pas sa négation ni sa critique :
  « Ce que l'API répond renseigne sur ce que l'électeur lit », pas « L'API ne dit rien de
  l'application ».
- Une hypothèse qui exigerait d'affaiblir un des quatre hors-champ ne reçoit pas d'alternative :
  son champ « Alternative » dit « impossible (hors-champ n) ».
- Un fait sans URL ni script n'est pas un fait ; il n'est pas écrit.
- « Pari assumé » n'est pas un échec de la passe : c'est la reconnaissance écrite qu'aucune preuve
  n'existe avant la réalité. Son entrée dit quelle réalité le tranchera (quel essai, quel run).
- « Ne rien changer » s'écrit dans « Alternative » quand le prix dépasse le gain, avec le calcul :
  l'hypothèse reste infirmée ou à tester, et le lecteur sait pourquoi le projet continue.
- Aucun candidat nommé, aucune personne nommée.

## Statuts

| Statut | Signifie | Change quand |
| --- | --- | --- |
| confirmée | des faits pour, aucun contre | un fait contraire apparaît |
| infirmée | des faits contre ; l'alternative attend la décision de l'auteur | l'auteur tranche |
| à tester | un test ou un essai est défini, pas encore exécuté | le résultat revient |
| pari assumé | aucune preuve possible avant la réalité ; l'auteur parie, par écrit | la réalité parle |

## Gabarit du registre

```markdown
# Hypothèses structurantes — registre

Dernière passe : [AAAA-MM-JJ](AAAA-MM-JJ.md). Critère : l'utilité réelle du projet, dont la
crédibilité est un moyen (décision de l'auteur, 2026-11-10). Hors champ : intégrité de la preuve,
neutralité entre candidats, honnêteté de la publication, indépendance à l'égard des évalués (D104).

## La chaîne d'utilité, telle que les textes la laissent lire

| Maillon | Ce que les textes disent | Hypothèses |
| --- | --- | --- |
| mesure | | |
| publication | | |
| destinataire | | |
| action | | |
| effet pour l'électeur | | |

## Hypothèses

| # | Hypothèse | Maillon | Statut | Depuis | Décision |
| --- | --- | --- | --- | --- | --- |

## Destinataires : comment chacun est observé

| Destinataire | Observé par | Biais |
| --- | --- | --- |
| éditeur d'outil | <traces directes | analogie | pas du tout> | <…> |
| régulateur, institution | | |
| rédaction | | |
| chercheur | | |
| électeur | | |

## Entrées

<Une entrée au format ci-dessus par hypothèse, dans l'ordre des numéros ; les numéros ne sont jamais
réattribués.>

## Essais de terrain en attente

| Essai | Hypothèses testées | Exécutant | Coût | Décrit dans |
| --- | --- | --- | --- | --- |
```

## Gabarit de la passe datée

```markdown
# Hypothèses structurantes — passe du AAAA-MM-JJ

Commit : `<sha court>`. Protocole : version <x.y>, <gelé | non gelé>. Modèles : session <tel
qu'elle le connaît> ; sous-agents `fable`, effort `max`. Passe précédente :
[AAAA-MM-JJ](AAAA-MM-JJ.md) ou « aucune, première passe ». Déclencheur : <avant le gel | après le
run pilote | après le run <id> | essai revenu : … | pari rencontré : H<n>>.

## Ce qui a changé

<Une ligne par hypothèse dont le statut, les faits ou l'alternative ont changé : H<n> — ancien
statut → nouveau — le fait qui l'a fait bouger. Puis les hypothèses nouvelles, et celles retirées
(avec la raison : détail renvoyé à critique-protocole, tranchée par l'auteur).>

## Le biais de cette passe

<Ce que les sources consultées sur-représentent ; quels destinataires n'ont été observés que par
analogie ou pas du tout ; ce que ça interdit de conclure.>

## Faits relevés

<Par hypothèse : les faits avec leur force, leur source (URL, date) ou leur calcul (hypothèses,
résultat, chemin du script). Ce que le relevé du monde a trouvé et que la vérification a écarté,
avec la raison, en une ligne chacun.>

## Essais de terrain préparés

<Par essai : hypothèse(s) testée(s), procédure pas à pas pour l'auteur, ce qu'il faut observer, le
résultat qui falsifierait, le coût en heures, ce que le §10 impose, la façon de rapporter le
résultat sans nommer personne.>

## Décisions demandées à l'auteur

<Une ligne par décision ajoutée à la feuille de route : Dn, question, recommandation, et le prix
de l'alternative en une phrase.>

## Ce qui tient

<Les hypothèses confirmées, en quelques lignes : la passe ne sert pas qu'à ébranler, et ce qui
tient doit pouvoir être défendu sur pièces.>
```
