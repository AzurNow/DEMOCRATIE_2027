# Pistes de départ

Des **questions**, pas des constats : chacune nomme la phrase du protocole qu'elle vise, le
mécanisme que la phrase suppose, et ce qu'il faudrait savoir du monde pour statuer. La première
passe part d'ici ; une hypothèse qu'aucune piste ne prévoit reste une hypothèse. Les sous-agents de
l'étape 3 reçoivent les questions, jamais les réponses attendues.

Les citations ont été relevées sur le protocole 0.34 : l'étape 4 les revérifie mot pour mot sur la
version lue, et une piste dont la phrase a disparu se réécrit ou tombe.

Hors champ, rappel : l'intégrité de la preuve, la neutralité entre candidats, l'honnêteté de la
publication, l'indépendance à l'égard des évalués. Aucun outil interrogé sur un candidat, aucun
candidat nommé.

## P1. Ce que l'API répond renseigne sur ce que l'électeur lit

- **Le protocole dit** : « La mesure principale porte sur les API sans instruction système ; ce que
  les électeurs voient passe par un prompt système, une mémoire et des outils que le projet ne
  reproduit pas. » (§11) ; l'application n'est saisie que sur un sous-échantillon mensuel, à la
  main, en analyse exploratoire (§6, QR8).
- **Mécanisme supposé** : l'exactitude mesurée sur l'API est assez proche de celle de l'application
  pour que le chiffre publié dise quelque chose de ce qu'un électeur reçoit.
- **À savoir** : ce que des comparaisons publiées établissent sur l'écart entre une API nue et
  l'application du même éditeur (recherche web par défaut, prompt système, garde-fous électoraux
  propres à l'application) ; quels audits ont mesuré l'application elle-même, par quel moyen, et
  avec quelles suites juridiques ou pratiques. **À calculer** : ce que coûterait, en heures de
  testeur, un canal application porté de l'exploratoire au principal, sur quel effectif. Ce qui
  tomberait : le canal de la mesure principale, donc le sens de chaque chiffre de tête.

## P2. Les outils mesurés sont ceux par lesquels l'électeur passe

- **Le protocole dit** : « figurant dans les 50 premières applications gratuites de la catégorie
  Productivité de l'App Store ou de Google Play en France » (§3) ; « Un outil apparu après la
  version 1.0 n'est pas mesuré » et « les intermédiaires sans API, hors des comparateurs lus, sont
  hors champ » (§11).
- **Mécanisme supposé** : un classement de stores, lu une fois, désigne les intermédiaires qui
  pèsent dans l'information des électeurs pendant six mois de campagne.
- **À savoir** : d'après les enquêtes d'usage publiées, par quels intermédiaires IA le public
  français s'informe réellement (assistants, réponses générées des moteurs de recherche, assistants
  intégrés au téléphone ou aux réseaux sociaux), et dans quelles proportions. **À calculer** : la
  part de cet usage que couvre la règle d'inclusion, et celle qui passe par un intermédiaire sans
  API. Si la plus grande part est hors champ, la question devient celle du canal (P1) et de la
  règle d'inclusion, pas celle du nombre d'outils.

## P3. Les erreurs qui comptent portent sur les positions programmatiques

- **Le protocole dit** : « Le projet mesure l'exactitude, la complétude et la symétrie de ce que les
  intermédiaires IA répondent sur les positions programmatiques des candidats à la présidentielle
  2027. » (§2) ; « Faits biographiques, mandats, affaires judiciaires : hors périmètre en version
  1.0. » (§3).
- **Mécanisme supposé** : ce qu'un électeur demande à un assistant, et ce sur quoi une erreur lui
  nuit, ce sont les positions des candidats.
- **À savoir** : ce que les études de requêtes réelles et les audits passés montrent des questions
  politiques posées aux assistants en période électorale (programme, biographie, affaires,
  modalités du vote, sondages, « pour qui voter ») ; sur quelles familles d'erreurs un dommage a
  été documenté. Le protocole écarte la biographie pour une raison écrite (autre vérité de
  référence, risque juridique) : la question n'est pas de la contredire mais de savoir quelle part
  du besoin l'objet actuel couvre, et si une famille écartée (les modalités du vote, par exemple)
  aurait une vérité de référence simple et un risque faible.

## P4. Un éditeur corrige son outil parce que le chiffre est publié

- **Le protocole dit** : « Les éditeurs peuvent donc corriger leurs outils sur ces questions : c'est
  l'effet recherché » (§5) ; « Chaque éditeur reçoit, après publication, un rapport mensuel avec ses
  réponses notées et peut y répondre publiquement » (§6).
- **Mécanisme supposé** : la publication des questions et des réponses notées suffit à faire
  corriger l'outil, et la correction dépasse les questions publiées.
- **À savoir** : après des audits publics comparables, qu'ont fait les éditeurs (correction
  générale, rustine sur les questions publiées, refus de répondre sur les élections, rien), et par
  quel canal la pression est passée (presse, régulateur, signalement direct, engagement volontaire) ?
  Un refus généralisé de répondre est-il une issue fréquente, et le protocole la compte-t-il comme
  un progrès ou comme une perte pour l'électeur ? **À lire dans le protocole et le code** : sur
  quelles questions et avec quel dénominateur l'indicateur de progrès se calcule-t-il (questions
  communes à deux runs, donc déjà publiées ? non-réponses comptées ?), et une rustine ou un refus
  suffirait-il à le faire monter ? Ce qui tomberait : la forme du rapport aux éditeurs, et la
  place du taux de non-réponse dans ce qui est mis en avant.

## P5. Quelqu'un agit sur un résultat

- **Le protocole dit** : « le protocole est transmis à l'Arcom, à Viginum et à la CNIL pour
  information avant la version 1.0, sans qu'aucune de ces institutions n'ait de rôle dans le
  projet » (§10) ; le rapport du run et la note éditoriale sont un « Site statique régénéré à chaque
  run » (§9). Sur la diffusion, la reprise par la presse, l'usage par un électeur : rien — termes
  cherchés en vain : « diffusion », « presse », « lecteur visé », « destinataire ».
- **Mécanisme supposé** (jamais écrit) : un résultat publié sur un site trouve seul ceux qui
  peuvent agir.
- **À savoir** : pour chaque destinataire possible (éditeur, régulateur, rédaction, chercheur,
  électeur), sous quelle forme il a déjà consommé un audit de ce genre, et ce qu'il en a fait ;
  quelle institution a compétence sur quoi, à sourcer et à formuler pour l'avocat. Ce qui
  tomberait : l'absence de tout travail de diffusion dans la feuille de route, et l'ordre des
  livrables du site.

## P6. Le premier résultat arrive assez tôt pour servir

- **Le protocole dit** : « Le premier résultat public est visé pour la première semaine de décembre
  2026 ; chaque jalon a un critère de passage mesurable, et un jalon non atteint décale la
  publication plutôt que d'en abaisser la qualité. » (§12) ; « Mensuel de décembre 2026 à janvier
  2027, puis hebdomadaire de février 2027 jusqu'au second tour » (§6).
- **Mécanisme supposé** : il reste, entre le premier résultat et le premier tour, assez de runs
  pour qu'un éditeur corrige, qu'une tendance se lise (H5) et qu'un électeur en profite.
- **À calculer** : d'après l'avancement réel de `docs/feuille-de-route.json` et ce qui reste à
  l'auteur (`docs/TACHES-AUTEUR.md`), la date réaliste du gel, du run pilote et du premier run
  public ; le nombre de runs avant le premier tour dans ce scénario ; les heures de notation
  humaine qu'un run exige entre la fin de l'interrogation et sa publication, et le réservoir qui
  les fournit (annotateurs et testeurs du canal application sont-ils les mêmes personnes ?), car
  une fenêtre de run ouverte n'est pas un run publié ; ce qu'un périmètre réduit (moins de
  candidats au premier run, moins de formulations, un mode) avancerait, et ce qu'il retirerait aux
  intervalles. **À savoir** : à quel moment d'une campagne les audits comparables ont été publiés,
  et lesquels ont eu des suites.

## P7. Chaque couche de rigueur ajoute de la crédibilité qui sert

- **Le protocole dit** : « Cible de couverture : 30 items P par candidat, plus les items A, O et F,
  soit environ 400 items pour 12 candidats. » (§5) ; « Charge humaine cible : 30 heures de
  validation initiale, puis 3 heures par run hebdomadaire pour l'auteur » (§12) ; « Aucune donnée
  n'entre dans `data/` sans validation humaine. » (`CLAUDE.md`, règle 3).
- **Mécanisme supposé** : double extraction, double validation, deux juges, échantillon humain,
  trois formulations, deux modes, deux échantillons, rythme hebdomadaire : chaque couche lève une
  objection qu'un lecteur ferait réellement, et aucune ne coûte plus qu'elle ne rapporte.
- **À savoir** : sur quoi les audits comparables ont réellement été attaqués, par qui, et avec quel
  effet ; lesquels ont pesé avec une méthode bien plus légère, et pourquoi. **À calculer** : le
  temps humain et le coût par couche, et ce que la même dépense achèterait ailleurs (un outil de
  plus, le canal application, une diffusion). La validation humaine de chaque item protège contre
  une position fausse publiée au nom d'un candidat : son principe touche le hors-champ 1, son
  étendue et son organisation sont dans le champ.

## P8. Seul et sans partenaire, le projet porte plus loin

- **Le protocole dit** : « Le projet est porté par un particulier, sans affiliation à un parti, un
  candidat, une campagne, un média, une institution publique ou un éditeur d'IA. Financement :
  fonds personnels uniquement. » (§1) ; « Un projet à une personne. » (§11).
- **Mécanisme supposé** : l'absence de toute affiliation vaut plus, pour la reprise des résultats,
  que la portée, les moyens et la relecture qu'un partenaire apporterait.
- **À savoir** : qui a porté les audits comparables qui ont eu des suites (laboratoire, association,
  rédaction, régulateur, particulier) ; quelles structures françaises ou européennes font déjà un
  travail voisin, avec quels manques déclarés publiquement ; ce qu'un adossement à un laboratoire ou
  à une rédaction réglerait de P5 et de P7 et ce qu'il coûterait en neutralité perçue. Un parti, une
  campagne ou un éditeur évalué restent impossibles (hors-champ 4).

## P9. Un protocole gelé une fois pour toutes sert mieux qu'un protocole qui suit le terrain

- **Le protocole dit** : « la version 1.0 sera gelée et publiée avant tout premier résultat » (§1) ;
  « La liste nominative des outils est fixée à la version 1.0 » (§3). `critique-protocole` ajoute :
  « L'auteur a décidé de ne plus affiner le protocole une fois gelé. »
- **Mécanisme supposé** : sur six mois où les modèles, les produits et les candidatures changent,
  un cadre immobile garde plus de valeur qu'il n'en perd.
- **À savoir** : comment des études préenregistrées longitudinales ont traité une cible mouvante
  (règles de mise à jour écrites d'avance, versions datées, résultats rapportés par version) et ce
  que leurs relecteurs en ont dit. Ce qui est hors champ : que la méthode soit publique avant la
  mesure qu'elle gouverne. Ce qui est dans le champ : ce que le gel fixe par une liste plutôt que
  par une règle qui s'applique seule, et le refus de toute révision après.

## P10. Un site statique de taux par outil est la forme qui change quelque chose

- **Le protocole dit** : « Les outils sont notés ; les candidats ne le sont jamais. » (§3) ; une
  réponse portant un drapeau d'erreur grave « est publiée in extenso dans le rapport du run » (§8) ;
  « Le site publié est statique : données JSON + calculs déterministes. » (`CLAUDE.md`, règle 1).
- **Mécanisme supposé** : un lecteur vient au site, lit des taux avec leurs intervalles, et en tire
  une conduite.
- **À savoir** : quelles formes ont porté dans des audits comparables (tableau par outil, cas
  d'erreur cités in extenso, jeu de questions que d'autres rejouent, note courte pour une
  rédaction, flux de données qu'un tiers intègre) ; si des jeux d'évaluation publics de ce genre ont
  été repris par des éditeurs ou des chercheurs, et à quelles conditions. La règle 1 est dans le
  champ pour ce qu'elle interdit de construire, pas pour être abandonnée par commodité ; un
  classement ou une note de candidats reste impossible (hors-champ 2).

## P11. Publier, c'est réussir

- **Le protocole dit** : « Les résultats sont publiés quels qu'ils soient, y compris s'ils ne
  montrent ni erreur notable ni asymétrie. » (§1). Sur ce qui compterait comme un succès du
  projet : rien — termes cherchés en vain : « mesure de succès », « utilité », « impact ».
- **Mécanisme supposé** : le projet a réussi quand des runs conformes sont publiés.
- **À savoir** : quelle mesure de résultat (un outil corrigé, un régulateur qui cite, une rédaction
  qui réutilise, une erreur sur une position disparue avant le premier tour) est observable depuis
  les données que le projet publie déjà, et laquelle demanderait une observation de plus. Une
  mesure de succès ne touche à aucun chiffre préenregistré : elle juge le projet, pas les outils.
  Faut-il aussi compter un dommage (un résultat lu comme un classement de candidats, une erreur du
  banc reprise comme un fait) ?

## P12. Le projet s'arrête au second tour

- **Le protocole dit** : le calendrier finit par un « Rapport de synthèse sous 30 jours après le
  second tour » (§12) ; les sujets écartés « feront l'objet d'un protocole séparé » (§3).
- **Mécanisme supposé** : l'utilité du projet tient dans cette élection.
- **À savoir** : ce que sont devenus les méthodes, les jeux de données et le code d'audits
  comparables après leur élection (repris ailleurs, abandonnés) ; ce qui, dans la façon dont le
  protocole et le code sont écrits, rendrait la reprise par un tiers pour une autre élection plus
  ou moins chère. Si la plus grande utilité est la méthode réutilisable, certains choix de forme et
  de documentation changent de rang dès maintenant.

---

## Essais de terrain de départ

Ce que le web ne tranchera pas, et que seul l'auteur peut exécuter, hors du dépôt. Aucun outil
n'est interrogé sur un candidat ; aucun nom de personne ne revient au registre.

- **Un rapport d'exemple, un destinataire.** Hypothèses : P5, P10, P11. Bâtir un rapport de run sur
  le jeu de démonstration (`validation/fixtures/`), marqué fictif à chaque page, candidats et outils
  anonymes (la chaîne qui le produit est-elle complète ? la lire dans `runs/README.md`, « De bout en
  bout en mode simulé », et y renvoyer plutôt que la recopier) ; le remettre à une personne qui
  pourrait agir (journaliste, chercheur, agent d'une autorité). Observer : ce qu'elle lit en
  premier, ce qu'elle comprend de travers, ce qu'elle demande en plus, ce qu'elle ferait d'un vrai
  rapport, et sous quelle forme elle le voudrait. Falsifie si : elle ne voit aucune action à en
  tirer, ou seulement une action que le §10 interdit (classer des candidats).
- **De vraies questions d'électeurs.** Hypothèses : P1, P2, P3. Demander à quelques personnes hors
  du milieu technique comment elles se renseigneraient sur un candidat avec une IA : quel outil,
  ouvert où, quelle question, dans leurs mots. Ne noter que le canal, l'outil et la forme de la
  question, jamais la réponse de l'outil ni l'opinion de la personne. Comparer aux gabarits de
  l'annexe B et à la liste d'outils. Falsifie si : la plupart des questions tombent hors des
  gabarits ou hors du périmètre, ou passent par un intermédiaire non mesuré.
- **La même question à chaque éditeur.** Hypothèse : P4. Écrire à tous les éditeurs du périmètre,
  dans les mêmes termes, sans aucune question du banc (§6) : sous quelle forme un signalement
  d'erreur sur une position de candidat leur est-il utile, et par quel canal ? Le message et les
  réponses se publient (§10 : aucun canal privilégié). Soumettre le message à l'avocat avant
  l'envoi. Falsifie si : aucun ne répond, ou si le canal utile n'est pas un rapport mensuel.
