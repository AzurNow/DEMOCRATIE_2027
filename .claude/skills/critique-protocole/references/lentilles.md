# Lentilles de lecture

Chaque lentille est le regard d'un spécialiste qui relirait le protocole pour une revue exigeante,
ou d'un adversaire qui chercherait à en faire tomber les conclusions. Les questions sont des
**pistes de lecture**, pas une liste à cocher : une question sans objet pour ce protocole ne produit
rien, et un problème qu'aucune question ne prévoit reste un constat. Chaque piste se termine par la
même épreuve : **quel chiffre publié, ou quelle conclusion, en dépend ?**

Les sous-agents de l'étape 3 reçoivent leur groupe (A, B, C ou D) en entier.

---

## Groupe A

### A1. Méthodologie et statistique

- **Questions et hypothèses.** Chaque QR et chaque H a-t-elle une métrique, une population, un
  dénominateur et une règle de décision écrits avant toute donnée ? Une hypothèse peut-elle être
  déclarée confirmée de deux façons selon la lecture du texte ? Les verdicts « sans objet »,
  « indécidable », « run incomplet » couvrent-ils tous les cas, et un cas peut-il tomber dans deux à
  la fois ?
- **Degrés de liberté restants.** Lister chaque choix que l'auteur pourrait encore faire après avoir
  vu les données : exclusion d'un outil, d'un candidat, d'un thème, d'une question ; date de gel ;
  choix du mode de tête ; seuils ; recodage d'une note ; ordre des opérations. Chacun est-il fermé
  par le texte ?
- **Unité d'analyse et dépendance.** La grappe du bootstrap (l'item ; la mesure pour une question
  d'attribution) capte-t-elle toutes les dépendances : échantillons d'une même question,
  formulations d'un même item, items d'une même mesure, items d'un même candidat, réponses d'un même
  juge ? Une dépendance non captée rétrécit les intervalles : laquelle, de combien (calcul) ?
- **Puissance et effectifs.** Avec les effectifs que le protocole implique (seuil de 10 items P par
  candidat, nombre de questions tirées, deux échantillons, deux modes, trois formulations), quelle
  est la demi-largeur attendue des intervalles par outil, par candidat, par condition ? Quelle taille
  d'effet H2, H3, H4 et H5 peuvent-elles détecter ? Une hypothèse vouée à « non établie » faute
  d'effectif est-elle annoncée comme telle ? **Calculer, avec un script de `scratch/`.**
- **Tests.** Le test de permutation d'homogénéité (statistique d'écart maximal à l'exactitude
  globale) est-il valide quand les candidats ont des effectifs très inégaux ? Les étiquettes
  permutées entre items respectent-elles l'échangeabilité sous l'hypothèse nulle ? La famille de
  Holm est-elle bien définie (quels tests, combien, et ce nombre est-il fixé avant les données) ?
  Les autres familles (formulations, modes, tendance) ont-elles un contrôle de multiplicité, ou
  une raison écrite de ne pas en avoir ?
- **Bootstrap.** Percentile en grappes avec 2 000 tirages : adapté aux taux proches de 0 (taux de
  fabrication) ou de 1 ? Le rejet des rééchantillons au dénominateur nul biaise-t-il les bornes ?
  Une borne inférieure strictement positive (H1) est-elle atteignable par un taux observé de 0 ?
- **Métriques.** Chaque dénominateur exclut-il ce qu'il faut et seulement cela (non-réponses,
  indéterminées, manquantes, tronquées) ? Un outil peut-il améliorer son exactitude en refusant de
  répondre plus souvent, et le lecteur le voit-il ? Les métriques primaires se lisent-elles
  ensemble sans contradiction ?
- **Tendance.** Comparer le premier et le dernier run seulement : que fait-on des runs
  intermédiaires, des changements de version des modèles interrogés, des questions renouvelées
  (20 % neuves) ? Une hausse peut-elle venir de la seule composition des questions communes ?
- **Robustesse.** Les quatre recalculs couvrent-ils les choix les plus fragiles ? Lequel manque
  (exemple : un seul juge au lieu de deux, une autre grappe) ?

### A2. Mesure et annotation humaine

- **Validité de construit.** « Exact », « inexact », « non-réponse », « indéterminé » : un annotateur
  formé classe-t-il de la même façon une réponse partiellement juste, nuancée, juste mais datée,
  juste sur le fond avec une erreur de détail ? La grille dit-elle quoi faire d'une réponse qui
  mêle une position juste et une position fabriquée ?
- **Vérité de référence.** Ce qui entre comme item (T1, T2, explicite seulement) biaise-t-il la
  mesure vers les candidats qui publient beaucoup d'écrits ? Les items A (absence) et F (fictifs)
  sont-ils construits de façon à ne pas être reconnaissables par un modèle ? Qui écrit les items F,
  avec quelle règle, et qu'est-ce qui empêche qu'ils soient plus faciles pour un candidat que pour
  un autre ?
- **Accord.** Le kappa à 0,80 (validation) et à 0,75 (juge-humain) est-il calculé sur une
  distribution de catégories où il a un sens ? Avec une catégorie très majoritaire, le kappa peut
  être bas malgré un accord observé élevé, ou l'inverse : le protocole publie-t-il l'accord observé
  et les effectifs par catégorie à côté ? Les seuils sont-ils justifiés, ou seulement posés ?
- **Aveuglement.** Les annotateurs voient-ils l'outil, le mode, le candidat, la formulation ? Ce qui
  doit être caché l'est-il, et ce qui ne peut pas l'être est-il déclaré ?
- **Jeu d'or, formation, dérive.** Comment le jeu d'or est-il construit, par qui, et est-il
  indépendant de l'échantillon mesuré ? La dérive d'un annotateur entre runs est-elle suivie ?
- **Sensibilités déclarées.** Le recrutement « de sensibilités différentes » est-il vérifiable, et
  l'effet d'une sensibilité sur la note est-il mesuré ou seulement prévenu ?

---

## Groupe B

### B1. Évaluation des modèles de langage

- **Ce qui est interrogé.** API sans instruction système, une version de modèle épinglée : la
  version, la date, les paramètres (température, longueur maximale, outils de recherche) sont-ils
  fixés et publiés ? Que fait le protocole si l'éditeur change le modèle derrière un même nom au
  milieu d'un run, ou entre deux runs comparés par H5 ?
- **Non-déterminisme.** Deux échantillons par question suffisent-ils à séparer la variabilité
  propre de l'outil de la différence entre conditions ? La variance intra-question est-elle
  publiée ?
- **Sensibilité au prompt.** Trois formulations : la mesure est-elle dominée par le choix des
  gabarits ? Les résultats sont-ils annoncés comme valant pour ces gabarits (§11 le dit), et les
  gabarits sont-ils publiés avant les données ?
- **Mode web.** La recherche web d'un outil dépend de l'index, de la date, de la géolocalisation :
  ces conditions sont-elles fixées ou déclarées ? Une source citée qui a changé entre la réponse et
  la vérification est-elle traitée ?
- **Contamination et réactivité.** Les questions publiées peuvent entrer dans l'entraînement ou
  être corrigées par les éditeurs (§11). Les 20 % de questions neuves suffisent-ils à mesurer
  l'effet, et l'analyse les sépare-t-elle explicitement ?
- **Refus et formats.** Un refus de l'API, une réponse vide, une réponse tronquée, une réponse dans
  une autre langue : chaque cas a-t-il un classement unique ?
- **Écart API / application.** QR8 est exploratoire sur un petit échantillon : le protocole
  empêche-t-il qu'un lecteur en tire une conclusion confirmatoire ?

### B2. Juges automatiques

- **Indépendance.** Un juge d'un éditeur note-t-il les outils de ce même éditeur ? Si oui, l'écart
  est-il mesuré et publié, et la règle est-elle écrite ?
- **Information transmise.** Le juge reçoit-il le nom de l'outil, du candidat, la formulation, ce
  qui n'est pas nécessaire à la note (CLAUDE.md, anti-patterns) ? Chaque champ transmis est-il
  justifié ?
- **Biais connus des juges.** Préférence pour les réponses longues, pour la position de la
  référence dans le prompt, pour un style : le test contrefactuel les couvre-t-il, et lesquels
  restent non mesurés ?
- **Validation.** Kappa juge-humain sur 10 % : l'échantillon est-il tiré avant de voir les notes,
  stratifié sur ce qui compte (outil, candidat, catégorie rare comme la fabrication) ? Une catégorie
  rare peut-elle être mal jugée sans que le kappa global le montre ?
- **Désaccords et retrait.** La règle de résolution des désaccords entre juges, et le retrait d'un
  juge en cours de run, gardent-ils les chiffres comparables d'un run à l'autre ?
- **Prompts de juge.** Le prompt publié (`prompts/judge-*`) dit-il exactement ce que dit la grille
  du §7, ni plus ni moins ? Un écart est un constat.

### B3. Pérennité face aux modèles futurs

Le protocole ne sera plus modifié après le gel, alors que des modèles bien plus capables sortiront
pendant la campagne et après. Tout ce que leur arrivée rend prévisible doit donc être réglé **dans
la 1.0**, par une règle qui s'appliquera ensuite mécaniquement, sans amendement. La question de
cette lentille est : **qu'est-ce qui casse, ou perd son sens, quand un modèle bien meilleur sort ?**

- **Saturation.** Si l'exactitude approche 1 et la fabrication 0, les métriques, les intervalles
  (percentile près des bornes), les tests et les hypothèses discriminent-ils encore ? Une
  hypothèse devenue inatteignable (H1 : borne inférieure strictement positive) est-elle publiée
  comme un résultat, et non comme un échec de la mesure ? La part de la mesure qui ne dépend pas de
  la capacité brute (items d'absence et fictifs, prémisses fausses, obsolescence, sourçage, refus)
  pèse-t-elle assez pour que le projet reste informatif quand les connaissances deviennent justes ?
- **Changement de modèle derrière un outil.** Le §6 interroge le modèle par défaut du produit à la
  date du run : l'identifiant exact, sa date de changement et les runs concernés sont-ils publiés,
  pour qu'une tendance (H5) se lise « même outil, autre modèle » et non comme un progrès inexpliqué ?
- **Nouveaux outils et nouvelles formes.** Le §3 fixe la liste des outils à la 1.0 et ne la change
  que par amendement : que se passe-t-il quand un outil nouveau remplit la règle d'inclusion en
  cours de campagne, alors qu'aucun amendement n'est prévu ? La règle d'inclusion peut-elle
  s'appliquer seule, à des dates écrites d'avance ? Les intermédiaires sans API (réponses intégrées
  aux moteurs de recherche, assistants du système, agents, voix) sont-ils déclarés hors champ au
  §11, avec ce que cela retire à la représentativité ?
- **Juges et modèles du pipeline qui disparaissent.** Un éditeur retire le modèle d'un juge, de
  l'extracteur ou de la reformulation au milieu de la campagne : le protocole dit-il quoi faire
  sans amendement (successeur désigné d'avance, validé sur le même jeu d'or aux mêmes seuils avant
  usage, runs avant et après rapportés séparément) ? Un juge sous le seuil de kappa doit « être
  retravaillé » (§7) : comment, si changer son prompt est un amendement ?
- **Renotation future.** Les réponses brutes sont immuables et le jeu d'or humain est publié : un
  juge futur bien meilleur pourra-t-il renoter les runs passés ? Tout ce qu'il faudrait est-il
  publié (question exacte, réponse normalisée, contenu notant de l'item, grille) ? Le protocole
  dit-il qu'une telle renotation est une analyse à part, étiquetée, qui ne remplace jamais un
  chiffre publié ?
- **Contamination.** Questions, items fictifs et réponses publiés entrent dans les corpus
  d'entraînement des modèles suivants : les items fictifs restent-ils efficaces d'un run à l'autre,
  et le renouvellement prévu suffit-il ?
- **Lisibilité dans dix ans.** Chaque chiffre publié porte-t-il de quoi être compris hors de son
  contexte : date, identifiant exact du modèle interrogé, version du protocole ? La méthode
  est-elle réutilisable pour une autre élection sans réécrire le code, puisque les cas
  particuliers sont des données ?

---

## Groupe C

### C1. Science politique et neutralité

- **Ce qu'est une position.** La définition d'une position, d'une mesure, d'un changement de
  position (item O) tient-elle face à une position conditionnelle, graduelle, contradictoire entre
  le programme et une déclaration orale, ou portée par le parti et non par le candidat ?
- **Symétrie réelle, pas formelle.** Un tirage symétrique (même nombre de questions par candidat)
  peut produire une mesure asymétrique si la difficulté des items diffère selon les candidats
  (programme plus détaillé, plus ancien, plus médiatisé). Le protocole le mesure-t-il, le
  contrôle-t-il, ou le déclare-t-il ?
- **Périmètre.** La règle d'inclusion des candidats (seuils, sondages) et des thèmes peut-elle
  favoriser un camp ? Un candidat déclaré tard, retiré, ou qui change de parti est-il traité ?
- **Effets sur la campagne.** Une publication peut-elle être lue comme un classement des candidats
  (« l'IA se trompe plus sur X ») alors que le projet s'interdit tout classement ? La présentation
  imposée (ordre alphabétique ou aléatoire, rappel de la phrase du §8) suffit-elle ?
- **Utilité.** Chaque QR répond-elle à une question que se posent un régulateur, une rédaction, un
  éditeur ou un électeur ? Une QR qui ne sert personne coûte sans rapporter : la retirer est une
  proposition légitime. Une question essentielle manque-t-elle ?

### C2. Lecteur hostile

Lire trois fois le protocole, en se mettant chaque fois à la place de quelqu'un qui veut contester
un résultat **défavorable pour lui**, de bonne foi mais sans indulgence :

- **un éditeur d'outil mal classé** : « vos questions sont piégeuses », « votre juge est biaisé
  contre nous », « vous avez interrogé la mauvaise version », « l'API n'est pas notre produit » ;
- **une campagne dont le candidat est mal servi** : « vous avez choisi les items qui nous
  desservent », « notre position a été mal résumée », « votre item est obsolète » ;
- **un journaliste ou un chercheur sceptique** : « qu'est-ce qui prouve que l'auteur n'a pas choisi
  ses seuils après coup ? », « refaites-le sans vous : que trouve-t-on ? ».

Pour chaque attaque, le texte du protocole fournit-il **une réponse publique, écrite avant les
données** ? Une attaque sans réponse écrite est un constat ; une attaque déjà couverte ne produit
rien.

---

## Groupe D

### D1. Science ouverte et reproductibilité

- **Préenregistrement.** L'ordre « méthode publique, puis mesures » est-il prouvable par un tiers
  (dépôt horodaté, empreinte, DOI) avant le premier run ? Qu'est-ce qui empêche une révision
  silencieuse entre le dépôt et le premier run ?
- **Refaire sans l'auteur.** Un tiers peut-il, avec ce qui est publié, recalculer chaque chiffre à
  l'identique ? Lister ce qui ne serait pas reproductible (transcriptions, réponses des outils,
  archives web), et vérifier que chaque exception est déclarée.
- **Ce qui n'est pas publié.** Les données personnelles exclues de la publication empêchent-elles
  la vérification d'un chiffre ?
- **Écarts au protocole.** Comment un écart découvert pendant un run (incident, erreur) est-il
  déclaré dans le rapport du run ?

### D2. Droit, éthique et gouvernance

Cette lentille formule des **questions pour l'avocat** (§10), jamais des avis juridiques. Elle ne
cite un texte de loi que vérifié en ligne, avec l'URL.

- Les engagements du §10 (période de réserve, diffamation, droit d'auteur, données personnelles,
  conditions d'utilisation des API) couvrent-ils chaque objet publié par le §9 ?
- Le panel d'arbitrage a-t-il les moyens de son rôle (délais, règles de conflit d'intérêts,
  publication des opinions dissidentes) ? Que se passe-t-il s'il n'est jamais constitué ?
- Un candidat, une campagne ou un éditeur peut-il bloquer une publication, et doit-il le pouvoir ?
- Les annotateurs et les testeurs : consentement, rémunération, protection de leurs sensibilités
  déclarées.

### D3. Faisabilité

- **Une règle qu'on ne peut pas exécuter est pire qu'une règle absente** : elle sera tournée en
  silence. Chaque exigence est-elle tenable avec une personne, le budget du §12 (600 € par mois
  en rythme hebdomadaire, 3 heures humaines par run), et le calendrier jusqu'au second tour ?
- Les critères go/no-go peuvent-ils tous être évalués dans les délais d'un run hebdomadaire ?
- Le levier d'ajustement préenregistré (échantillons 2 → 1) suffit-il si les coûts doublent ?
  Qu'est-ce que la réduction ferait aux intervalles (calcul) ?
- Quelles règles pourraient être **retirées** sans perte de validité, pour libérer du temps humain
  vers ce qui en a le plus besoin ?
