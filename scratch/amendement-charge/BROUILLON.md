# Brouillon d'amendement — charge d'annotation humaine (§7, §8, §11, §12, annexe F)

Brouillon du 2026-11-12, rédigé par Claude Code à la demande de l'auteur. **Ce n'est pas le
protocole** : `docs/PROTOCOLE.md` fait foi et ne change que par une révision écrite par l'auteur
(zone d'arrêt). Révision visée : celle qui suit la 0.35 (tranchée, pas encore écrite).

## 1. Le problème

D66 (critique du 2026-11-02, constat 4) a renvoyé au run pilote la mesure de la charge humaine.
Le modèle de la critique (`scratch/critique/D/faisabilite.py`) l'estime déjà à **256 à 499 heures
d'annotation par run** (490 questions, 11 couples outil × mode, 1 échantillon par question).
Deux règles du §7 en sont la cause, bien plus que la taille du périmètre :

1. l'échantillon humain **proportionnel** (10 % des réponses, 25 % si un juge est retiré) ;
2. le renvoi à un humain de **chaque** désaccord entre juges, et de chaque accord partiel.

Aucun levier du §12 n'y touche (le passage de 2 à 1 échantillon est déjà compté ; la reprise de
note d'une lecture de comparateur fait gagner au plus ~18 h). Une règle intenable sera tournée en
silence, ce que la critique annonçait.

## 2. Ce que propose ce brouillon

| Règle | Aujourd'hui | Proposé |
|---|---|---|
| Échantillon humain | 10 % des réponses obtenues, arrondi au supérieur | **400 réponses** (toutes si moins) |
| Après retrait d'un juge au contrefactuel | 25 %, contenant les 10 % | **1 000 réponses** (toutes si moins), contenant les 400 |
| Désaccord entre juges, accord partiel | notation humaine de chaque réponse | **strate de désaccord** : un échantillon aléatoire de **400 réponses** (toutes si moins) est noté par un humain ; les métriques pondèrent ces réponses par l'inverse de leur probabilité de tirage |
| Fabrication, mauvaise attribution, extrait invalide, renvoi d'un juge | humain sur chaque réponse | **inchangé** |
| Nombre de juges | exactement deux | **inchangé** |

### Chiffrage (même modèle, mêmes hypothèses non mesurées)

| Périmètre | Aujourd'hui | Proposé |
|---|---|---|
| 490 questions, 11 couples | 256 à 499 h par run | **80 à 142 h** par run |
| 490 questions, 5 couples | 126 à 237 h par run | **70 à 110 h** par run |

Le terme principal devient la revue humaine des erreurs graves (fabrication, mauvaise
attribution) : 255 à 1 193 réponses par run selon le périmètre et les hypothèses. Le brouillon n'y
touche pas : c'est la mesure de H1 et un critère du go/no-go. Les chiffres absolus reposent sur des
taux jamais mesurés (désaccord des juges, 2 à 3 minutes par notation) ; seul l'ordre de grandeur de
la réduction est robuste. Le modèle compte un peu deux fois les erreurs graves qui sont aussi des
désaccords : il surestime légèrement.

## 3. Pourquoi pas un troisième juge

C'était la piste du 2026-11-12. Elle est écartée par ce brouillon, pour trois raisons :

1. le §7 dit qu'« un run déclare exactement deux juges, ni plus ni moins, la combinaison des notes
   n'étant écrite que pour deux » : un troisième juge réécrit la combinaison, le contrefactuel, le
   kappa de la paire et le code qui les porte ;
2. le paragraphe « Conflit d'intérêts » du §7 cite comme garde-fou qu'« un désaccord suffit à
   déclencher l'humain ». Un troisième modèle qui tranche seul les désaccords supprime ce
   garde-fou sans le remplacer ;
3. les erreurs de juges automatiques peuvent être corrélées précisément sur les cas difficiles ;
   un échantillon humain des désaccords les mesure, un troisième juge les reproduit.

**Écarté aussi : exclure les désaccords des métriques.** Les désaccords sont les cas difficiles ;
les retirer biaiserait l'exactitude vers le haut, différemment selon l'outil et le candidat.

## 4. Textes proposés

Les passages cités sont ceux de la 0.34. Les numéros de ligne renvoient à `docs/PROTOCOLE.md` au
commit `ccfe558`.

### 4.1 §7, règle de décision, deuxième puce (ligne 271)

Remplacer : « Désaccord : notation humaine, dont la note est retenue. »

Par : « Désaccord : la réponse entre dans la strate de désaccord. Y entrent aussi les réponses
dont les deux juges s'accordent sur la catégorie, tous les drapeaux, la fraîcheur de
l'obsolescence et le sourçage valide mais diffèrent sur un autre champ que porte la note retenue
(première puce). Un échantillon aléatoire de 400 réponses de cette strate, toutes si elle en
compte moins, tiré avec une graine dérivée de la graine publiée et de la clé
« echantillon_desaccord », est noté par un humain dans les conditions de l'échantillon ; sa note
est retenue. Une réponse de la strate qui n'est pas tirée n'a pas de note retenue : elle entre dans
les métriques par la pondération de la section 8, jamais par la note d'un juge. L'effectif de la
strate et celui de son échantillon sont publiés. Une réponse de la strate qui relève aussi d'une
autre règle de renvoi à un humain (fabrication, mauvaise attribution, extrait invalide, renvoi
d'un juge) est notée par un humain à ce titre, et sort de la strate. »

Et dans la première puce, remplacer « la réponse est notée par un humain » par « la réponse entre
dans la strate de désaccord ».

### 4.2 §7, troisième puce (ligne 272)

Remplacer : « Échantillon aléatoire de 10 % des réponses de chaque run, parmi les réponses
obtenues, sa taille arrondie à l'entier supérieur, tiré avec une graine publiée »

Par : « Échantillon aléatoire de 400 réponses de chaque run, parmi les réponses obtenues, toutes
quand le run en compte moins, tiré avec une graine publiée »

### 4.3 §7, test contrefactuel (ligne 280)

Remplacer « l'échantillon humain passe à 25 % » par « l'échantillon humain passe à 1 000 réponses,
toutes quand le run en compte moins », et « l'échantillon de 25 % prolonge l'ordre de tirage de
celui de 10 % et le contient » par « l'échantillon de 1 000 réponses prolonge l'ordre de tirage de
celui de 400 et le contient ».

### 4.4 §7, calibration (ligne 278) et §12 go/no-go (ligne 423)

Remplacer « l'échantillon de 10 % » par « l'échantillon humain ».

### 4.5 §7, conflit d'intérêts (ligne 282)

Remplacer : « le second juge est d'une autre famille et un désaccord suffit à déclencher
l'humain »

Par : « le second juge est d'une autre famille ; aucun juge ne tranche seul un désaccord : la
réponse entre dans la strate de désaccord, dont un échantillon aléatoire est noté par des humains
et porte seul le poids de la strate dans les métriques »

### 4.6 §8, estimation pondérée (texte à écrire — QUESTION OUVERTE)

Il faut une phrase de principe et une règle de calcul :

- principe : une réponse de l'échantillon de la strate de désaccord compte dans chaque métrique
  avec le poids D / m, D étant l'effectif de la strate et m celui de son échantillon ; toute autre
  réponse compte avec le poids 1 ;
- **non résolu** : la façon dont le bootstrap en grappes de la section 8 reproduit ce second tirage
  (rééchantillonner aussi la strate dans chaque réplique, ou fixer les poids), et la façon dont un
  dénominateur restreint (par candidat, par type d'item, par formulation) lit une strate dont
  l'échantillon peut y être vide. Ces deux points changent les intervalles, donc les verdicts
  « établi » : ils doivent être écrits avant le gel, testés d'abord (règle « les tests d'abord »
  sur la logique de calcul), et relus par un statisticien — une demande naturelle de la vague 1 du
  démarchage.

### 4.7 §8, robustesse (a) (ligne 323)

Remplacer « sur la seule notation humaine de l'échantillon de 10 % » par « sur la seule notation
humaine de l'échantillon humain ».

**Conséquence à assumer** : avec 400 réponses au lieu d'environ 1 600, le recalcul (a) perd
beaucoup de puissance ; davantage de résultats seront qualifiés de « fragiles », non parce qu'ils
le sont, mais parce que le recalcul ne peut plus les établir. Options : (i) l'accepter et le dire
au §11 ; (ii) dire qu'un résultat n'est fragile au recalcul (a) que si la différence y change de
signe, et non s'il n'est plus établi. Choix de l'auteur.

### 4.8 §11, limite nouvelle

« Les réponses sur lesquelles les deux juges divergent ne sont pas toutes notées par un humain :
un échantillon aléatoire les représente, et les métriques les pondèrent. Une métrique portant sur
un sous-groupe où cet échantillon est petit a un intervalle plus large que si chaque désaccord
avait été noté. »

### 4.9 §12, charge et coût

Ajouter aux leviers préenregistrés : la taille des deux échantillons (400 et 400) n'est pas un
levier : elle ne baisse pas pour tenir un plafond. Les plafonds écrits à la version 1.0 (D66)
partent du chiffrage de ce brouillon, recalé au pilote.

### 4.10 Annexe F, checklist (ligne 566)

Remplacer « désaccords, échantillon de 10 % et erreurs graves notés par des humains » par
« échantillon de la strate de désaccord, échantillon humain et erreurs graves notés par des
humains ».

## 5. Pourquoi 400

La précision d'un kappa dépend du nombre de réponses notées, pas de leur part du run. Sous des
hypothèses non calibrées (accord observé 0,9, accord attendu 0,5), l'erreur type d'un kappa sur
400 réponses est d'environ 0,03, soit un intervalle de ±0,06 environ : assez pour lire un seuil de
0,75. Le même raisonnement, à vérifier par simulation avant le gel, vaut pour la strate de
désaccord. **Ce chiffre est un ordre de grandeur, pas un calcul de puissance** : un calcul propre
(simulation sur les effectifs du pilote) doit le confirmer ou le remplacer avant le gel.

## 6. Ce que cela casse, côté code (estimation, à confirmer par une lecture du code)

- tirage de l'échantillon humain (taille fixe au lieu de 10 %) et de l'échantillon de 25 % ;
- file humaine : nouvelle strate, nouvelle graine, nouveau motif de renvoi ;
- `analysis/` : poids dans toutes les métriques primaires et dans le bootstrap en grappes ;
  c'est le gros du travail, et le plus risqué ;
- go/no-go et annexe F (libellés) ; tests de la notation et des métriques à réécrire d'abord ;
- page pédagogique : `site/src/lib/parametres.ts` formate une fraction en pourcentage (« 10 % ») ;
  une taille fixe ne s'y exprime plus en fraction, à adapter.

## 7. Décisions demandées à l'auteur

1. Adopter le principe (échantillon fixe + strate de désaccord échantillonnée), ou rester au texte
   actuel.
2. Les tailles : 400 / 1 000 / 400, ou d'autres, après simulation.
3. Robustesse (a) : option (i) ou (ii).
4. Ordre : faire écrire la règle de calcul du §8 (4.6) et la simulation avant ou après la relecture
   externe.
