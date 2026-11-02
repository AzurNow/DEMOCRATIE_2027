# Format des constats et du rapport — `docs/critiques/AAAA-MM-JJ.md`

## Format d'un constat (sous-agents et rapport)

```markdown
### <n>. <Le constat, en une phrase affirmative>

- **Lentille** : <A1, B2…>. **Gravité** : bloquant | majeur | mineur. **Coût** : texte seul |
  texte et code | texte, code et temps humain | données ou ressources nouvelles.
- **Le protocole dit** : « <citation exacte> » (§x). Ou, pour une absence : « rien » — termes
  cherchés en vain : <termes>.
- **Ce qui en dépend** : <le chiffre publié ou la conclusion, le scénario concret, le sens de
  l'erreur, qui peut l'exploiter>.
- **Calcul** : <s'il y a lieu : hypothèses, résultat, chemin du script dans `scratch/`>.
- **Sources extérieures** : <URL consultée et date, ou « aucune »>.
- **Réponse minimale** : rien | limite au §11 | précision | suppression | ajout.
  <Pour un texte : « ancien » → « nouveau », section. Pour une question à l'auteur : options
  réelles, coût de chacune, recommandation en premier.>
- **Défense** : <ce que la défense a opposé, et pourquoi le constat tient quand même>.
```

## Gravité

- **Bloquant** : un chiffre publié serait faux ou trompeur, une conclusion ne pourrait pas être
  tirée comme le protocole l'annonce, un tiers ne pourrait pas reproduire un résultat qu'on dit
  reproductible, ou le risque juridique est sérieux. À régler avant le gel.
- **Majeur** : un spécialiste exigerait la correction pour accepter la conclusion, mais le chiffre
  reste juste si le lecteur connaît la limite. À régler avant le gel, ou à déclarer au §11 par
  décision écrite de l'auteur.
- **Mineur** : une ambiguïté ou un manque sans effet sur un chiffre. Une ligne chacun, regroupés ;
  jamais de texte proposé au-delà d'une phrase.

Dans le doute entre deux gravités, prendre la plus basse et dire pourquoi : surestimer pousse à
réécrire.

## Gabarit du rapport

Un fichier par passe, jamais réécrit une fois la passe close, sauf la colonne *Statut*, que les PR
de révision mettent à jour. La passe suivante le lit en premier.

```markdown
# Critique du protocole du AAAA-MM-JJ

Commit : `<sha court>`. Protocole : version <x.y>, empreinte `<sha256 court>` ; CONTRATS :
`<sha256 court>`. Modèles : session <tel qu'elle le connaît> ; sous-agents `fable`, effort `max`.
Passe précédente : [AAAA-MM-JJ](AAAA-MM-JJ.md) (ou « aucune, première passe »).

## Prêt à geler ?

**<Oui | Non>.** <Si non : ce qui manque, dans l'ordre où le faire, en une ligne par point.>

## Bilan

| Gravité | Nombre | Dont questions à l'auteur | Repris de la passe précédente |
| --- | ---: | ---: | ---: |
| bloquant | | | |
| majeur | | | |
| mineur | | | |

<Trois phrases au plus : ce qui menace le plus la crédibilité du résultat, et ce qui est solide.>

## Tableau des constats

| # | Gravité | Lentille | § | Constat | Réponse minimale | Coût | Statut |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Constats bloquants et majeurs

<Un bloc au format ci-dessus par constat, numérotés par gravité puis par section.>

## Constats mineurs

<Une ligne chacun : § — constat — réponse minimale.>

## Écartés par la vérification ou la défense

<Une ligne chacun : constat proposé par une lentille — raison de l'écart (déjà traité au §x,
décision Dn, conséquence non démontrée, coût sans gain). Cette liste montre que la passe a lu sans
complaisance et n'a rien gardé par complaisance non plus.>

## Ce qui est solide

<Les choix du protocole qu'un spécialiste approuverait, en quelques lignes, avec la section : la
passe ne sert pas qu'à trouver des fautes, et ce qui tient doit pouvoir être défendu tel quel.>

## Décisions ajoutées à la feuille de route

<Dn, Dn+1… avec leur question en une ligne ; ou « aucune ».>
```

Règles :
- Le titre d'un constat est une **affirmation** (« Le kappa à 0,75 peut être atteint alors que le
  juge rate la moitié des fabrications »), pas un thème (« Kappa »).
- Un constat repris d'une passe précédente garde son numéro d'origine entre parenthèses.
- Le statut est `ouvert`, `tranché : <décision>`, `révisé en <version>` ou `déclaré au §11`.
