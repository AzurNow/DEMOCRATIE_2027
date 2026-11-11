# Hypothèses structurantes — registre

Dernière passe : [2026-11-10](2026-11-10.md). Critère : l'utilité réelle du projet, dont la
crédibilité est un moyen (décision de l'auteur, 2026-11-10). Hors champ : intégrité de la preuve,
neutralité entre candidats, honnêteté de la publication, indépendance à l'égard des évalués (D104).

Les sources sont numérotées S1 à S43 dans la passe du 2026-11-10, section
[Sources](2026-11-10.md#sources), avec leur adresse et leur date de consultation (2026-11-10) ; les
calculs C1 à C7 sont les scripts de `scratch/fondations/2026-11-10/`. La force d'un fait est notée
entre parenthèses : 1 calcul, 2 usage révélé, 3 littérature, 4 analogue. Les numéros d'hypothèse et
de source ne sont jamais réattribués. Les lentilles citées au prix d'une alternative sont celles de
`.claude/skills/critique-protocole/references/lentilles.md` : A1 méthodologie et statistique, B1
évaluation des modèles de langage, C1 science politique et neutralité, C2 lecteur hostile, D2
droit, éthique et gouvernance, D3 faisabilité. « H2 du protocole », « H5 du protocole » désignent
les hypothèses préenregistrées du §2, pas celles de ce registre.

## La chaîne d'utilité, telle que les textes la laissent lire

| Maillon | Ce que les textes disent | Hypothèses |
| --- | --- | --- |
| mesure | Exactitude, fabrication, symétrie et sourçage des réponses d'API « sans instruction système » à des questions engendrées depuis des positions programmatiques ; outils × 2 modes × 3 formulations × 2 échantillons (§2, §5, §6). L'application : 5 questions par candidat, une fois par mois, exploratoire (§6). | H1, H2, H3, H7, H9 |
| publication | Site statique régénéré à chaque run, rapport et note éditoriale ; données, réponses brutes, notations, code, dépôt Zenodo (§9) ; erreurs graves in extenso (§8). | H6, H10 |
| destinataire | Éditeurs : « un rapport mensuel avec ses réponses notées » (§6). Arcom, Viginum, CNIL : « pour information » (§10). Page pédagogique : « un électeur, un journaliste ou un éditeur d'outil ». Rien d'autre — cherchés en vain dans le protocole : « diffusion », « presse », « destinataire », « lecteur visé ». | H5, H8 |
| action | « Les éditeurs peuvent donc corriger leurs outils sur ces questions : c'est l'effet recherché » (§5) ; réponse publique de l'éditeur (§6) ; droit de réponse des campagnes (§4). Rien sur ce que ferait un régulateur, une rédaction ou un électeur. | H4 |
| effet pour l'électeur | Rien — cherchés en vain : « utilité », « impact », « mesure de succès ». | H11, H12 |

## Hypothèses

| # | Hypothèse | Maillon | Statut | Depuis | Décision |
| --- | --- | --- | --- | --- | --- |
| H1 | Ce que l'API répond renseigne sur ce que l'électeur lit | mesure | à tester | 2026-11-10 | D105 en attente |
| H2 | Les outils mesurés sont ceux par lesquels l'électeur passe | mesure | à tester | 2026-11-10 | aucune avant l'essai E2 |
| H3 | Les erreurs qui comptent portent sur les positions programmatiques | mesure | confirmée | 2026-11-10 | aucune |
| H4 | Un éditeur corrige son outil parce que le chiffre est publié | action | à tester | 2026-11-10 | D106 en attente |
| H5 | Quelqu'un agit sur un résultat publié sur un site | destinataire | à tester | 2026-11-10 | D107 en attente |
| H6 | Le premier résultat arrive assez tôt pour servir | publication | infirmée | 2026-11-10 | D108 en attente |
| H7 | Chaque couche de rigueur ajoute de la crédibilité qui sert | mesure | infirmée | 2026-11-10 | D109 en attente |
| H8 | Seul et sans partenaire, le projet porte plus loin | destinataire | infirmée | 2026-11-10 | D110 en attente |
| H9 | Un protocole gelé une fois pour toutes sert mieux qu'un protocole qui suit le terrain | mesure, publication | pari assumé | 2026-11-10 | décision antérieure de l'auteur |
| H10 | Un site statique de taux par outil est la forme qui change quelque chose | publication | à tester | 2026-11-10 | D107 en attente |
| H11 | Publier, c'est réussir | effet pour l'électeur | infirmée | 2026-11-10 | D111 en attente |
| H12 | Le projet s'arrête au second tour | effet pour l'électeur | infirmée | 2026-11-10 | tranché par l'auteur le 2026-11-03 |

## Destinataires : comment chacun est observé

| Destinataire | Observé par | Biais |
| --- | --- | --- |
| éditeur d'outil | traces directes : réponses publiques d'éditeurs à des audits, 2023 à 2026, hors de France (S2, S3, S5, S6, S20, S22) | on ne voit que ce qu'un éditeur a dit à la presse ; aucune trace d'un éditeur qui aurait traité un rapport reçu directement |
| régulateur, institution | traces directes pour la Commission européenne et l'autorité néerlandaise (S18, S24, S26) ; analogie pour la France | aucun acte d'une autorité française sur des réponses d'assistants n'a été trouvé : absence de trace, pas preuve d'inaction |
| rédaction | traces directes hors de France : audits coproduits ou repris (S20, S27) ; analogie pour la France | le web sur-représente les audits qui ont été repris |
| chercheur | traces directes faibles : compteurs de dépôts (S34) | une réutilisation non publiée est invisible |
| électeur | pas du tout : seulement des enquêtes d'usage (S9, S13, S15, S38) | l'électeur ne laisse aucune trace publique de sa question |

## Entrées

### H1. Ce que l'API répond renseigne sur ce que l'électeur lit

- **Le protocole dit** : « La mesure principale porte sur les API sans instruction système ; ce que
  les électeurs voient passe par un prompt système, une mémoire et des outils que le projet ne
  reproduit pas. L'écart est mesuré, mais sur un petit échantillon manuel. » (§11).
- **Mécanisme supposé** : jamais écrit. L'exactitude mesurée sur l'API serait assez proche de celle
  de l'application pour que le chiffre de tête dise ce qu'un électeur reçoit.
- **Maillon** : mesure.
- **Ce qui la falsifierait** : sur les questions du projet, une application qui refuse ou répond
  autrement là où l'API du même éditeur répond ; ou des garde-fous électoraux propres aux
  applications.
- **Ce qui tomberait avec elle** : le canal de la mesure principale, donc le sens de chaque chiffre
  de tête.
- **Statut** : à tester — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (2) AI Forensics, 2024 : « Gemini's web safeguards are absent in its API version » (S1).
  - (2) Quatre audits passés en tout ou partie par l'API ont reçu d'un éditeur la même objection,
    que l'API n'est pas le produit de l'électeur : Meta en 2024 (« meaningless », S2), Google en
    2024 (les réponses de l'API « could not have been reproduced via their app and browser », S3),
    OpenAI en 2026 (« This study tested a developer API », S5), Anthropic en 2026 (garde-fous
    peut-être inactifs par l'API, S6). Pour le cinquième (S1), la page lue ne rapporte aucune
    réaction d'éditeur.
  - (2) En 2026, sur une même consigne, « The consumer apps refused to answer » là où deux API
    répondaient (S5). La bannière électorale et les consignes de neutralité d'un éditeur sont
    décrites pour son application seulement (S4) ; son encart de 2024 n'apparaissait pas par l'API
    (S2).
  - (2) Fait contraire : un auditeur dit avoir trouvé l'API et le web « comparable » dans une étude
    interne (S6).
  - (2) 86 % des utilisateurs de ChatGPT et 88 % de ceux de Gemini n'utilisent que la version
    gratuite (S10) ; un audit de 22 médias publics a choisi ses versions « to replicate the default
    (and likely most common) » expérience (S27).
  - Ces faits portent sur la logistique du vote, le conseil de vote ou l'information générale sur
    un scrutin, aux États-Unis, en Allemagne et dans l'Union. Sur des positions programmatiques, la
    passe n'a trouvé aucune comparaison publiée entre une API et l'application du même éditeur.
- **Argument contraire** : les écarts documentés tiennent à des garde-fous qui se déclenchent sur
  « comment voter » et « pour qui voter », pas sur « que propose X » ; le protocole déclare la
  limite (§11) et mesure l'écart (QR8). Il tient en partie, et c'est pourquoi le statut est « à
  tester » et non « infirmée ». Il ne suffit pas : en 2025, une application « refused to answer
  political questions entirely » (S21), au-delà de la logistique ; et le §6 écarte le pilote de la
  saisie (« ni le run pilote ni un run supplémentaire »), si bien que l'écart ne sera connu qu'après
  le gel.
- **Test ou essai** : une saisie réduite de l'application au run pilote, par les deux testeurs et
  selon la procédure du §6 : 2 questions par candidat × 12 candidats × 7 assistants × 2 testeurs =
  336 saisies, soit 17 à 34 h de saisie et 5 à 17 h de notation humaine (C6.4). Falsifie si, pour
  un outil au moins, l'application ne répond pas à plus de la moitié des questions auxquelles l'API
  a répondu, ou si la catégorie de la note diffère sur plus du tiers des paires (seuils proposés
  par la passe). L'essai E2 dit en plus par quel canal de vrais électeurs passeraient.
- **Alternative** : faire cette saisie réduite au pilote, et écrire avant le gel que le taux d'un
  outil sur l'API n'est jamais cité en titre sans son taux sur l'application à côté.
  - protocole : §6 (une saisie au pilote), §8 (« Mode de tête »), §11 ; révision avant gel ;
  - code : rien d'inutile ; lot `gel` (désignation au pilote), lot `site` (T0, présentation) ;
  - calendrier : aucun run en moins ; 22 à 50 h de testeurs et d'annotateurs au pilote, contre 54
    à 126 h pour un passage complet du §6 (C6.4) ;
  - crédibilité : lentilles A1 (un choix de conception éclairé par le pilote se déclare) et C2 ;
  - effet attendu : maillon mesure, et maillon action : le chiffre de l'application est celui que
    l'objection des éditeurs ne touche pas (S2, S3, S5, S6).
- **Décision** : D105 en attente.

### H2. Les outils mesurés sont ceux par lesquels l'électeur passe

- **Le protocole dit** : « figurant dans les 50 premières applications gratuites de la catégorie
  Productivité de l'App Store ou de Google Play en France » (§3) ; « les intermédiaires sans API,
  hors des comparateurs lus, sont hors champ » (§11).
- **Mécanisme supposé** : un classement de stores, lu une fois, et la présence d'une API désignent
  les intermédiaires qui pèsent dans l'information des électeurs.
- **Maillon** : mesure.
- **Ce qui la falsifierait** : la plus grande part des questions politiques posées à une IA passe
  par un intermédiaire que la règle écarte.
- **Ce qui tomberait avec elle** : la condition « par API » de la règle d'inclusion (§3), D36 (4).
- **Statut** : à tester — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (1) 14 assistants figurent dans le top 50 d'un store au relevé du 15 octobre 2026 ; la règle
    en retient 7. Les deux mieux classés qu'elle ne retient pas devancent trois outils retenus :
    Meta AI (rangs 5 et 5), écarté faute d'API accessible prouvée (D36 (4)), et Microsoft Copilot
    (11 et 19), faute d'API du produit grand public (C4).
  - (3) Outils déjà utilisés en France, décembre 2025 : ChatGPT 50 %, Gemini 42 %, Meta AI 37 %,
    Microsoft Copilot 28 % (S38). 63 % des utilisateurs d'IA générative ont principalement recours
    à ChatGPT (S8).
  - (3) 57 % des répondants de neuf pays, dont la France, ont vu une réponse générée dans un moteur
    de recherche la semaine passée ; 38 % se servent d'une IA générative pour « getting
    information », 9 % pour l'actualité (S13). Les réponses générées de Google sont déployées en
    France depuis le 22 juillet 2026 (S11) ; Meta AI est annoncé depuis le 20 mars 2025 dans 41
    pays européens, dans Facebook, Instagram, WhatsApp et Messenger (S12, qui ne liste pas les
    pays).
  - (1) Deux lancements de ce genre vérifiés en 24 mois : au même rythme, 0,5 attendu sur six mois
    de campagne (C7, borne basse).
- **Argument contraire** : la règle retient l'outil principal de 63 % des utilisateurs, et « déjà
  utilisé » ne dit rien d'un usage politique ; rien n'établit qu'une réponse générée de moteur
  s'affiche sur une question de programme en France. Il tient : aucun fait ne montre que la majorité
  des questions passe hors règle. Le statut reste « à tester », pas « infirmée ».
- **Test ou essai** : essai E2 (auteur, environ 4 h). Falsifie si plus de la moitié des
  intermédiaires nommés par de vrais électeurs sont hors de la règle.
- **Alternative** : si E2 falsifie, faire de « par API » la condition du canal API et non de
  l'inclusion : un assistant qui remplit le reste de la règle (au relevé : Meta AI, Copilot) est
  mesuré sur le seul canal application.
  - protocole : §3, §6, §8 (publication d'un outil mesuré sur la seule application), §11 ; D36 (4)
    rouverte ; révision avant gel ;
  - code : rien d'inutile ; lots `perimetre-prompts` (outil sans mode API), `analyse` (taux par
    outil sur l'application seule), `site` ;
  - calendrier : 16 à 36 h de plus par mois pour deux assistants (C6.4), sur un pool qui ne suffit
    déjà pas (H6) ;
  - crédibilité : lentilles C2 (deux classes d'outils) et A1 (60 questions par outil) ;
  - effet attendu : maillon mesure ; et maillon action : Microsoft est l'éditeur dont les
    réactions à des audits sont les plus documentées (S3, S6, S20).
- **Décision** : aucune avant le retour de l'essai E2.

### H3. Les erreurs qui comptent portent sur les positions programmatiques

- **Le protocole dit** : « Le projet mesure l'exactitude, la complétude et la symétrie de ce que
  les intermédiaires IA répondent sur les positions programmatiques des candidats à la
  présidentielle 2027. » (§2) ; « Faits biographiques, mandats, affaires judiciaires : hors
  périmètre en version 1.0. » (§3).
- **Mécanisme supposé** : ce qu'un électeur demande à un assistant, et ce sur quoi une erreur lui
  nuit, ce sont les positions des candidats.
- **Maillon** : mesure.
- **Ce qui la falsifierait** : des usages mesurés où les positions sont minoritaires, ou des
  dommages documentés qui portent tous ailleurs.
- **Ce qui tomberait avec elle** : l'objet (§2), les exclusions (§3).
- **Statut** : confirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (3) France, décembre 2025, déclaratif : en tête de ce que les répondants chercheraient auprès
    d'une IA viennent les mesures d'un programme (39 %) et les prises de position (31 %) ; 25 % ont
    déjà interrogé une IA sur une personnalité ou un parti, 28 % comptent le faire pour 2027 (S38).
  - (4) États-Unis, octobre 2026, usage déclaré de ceux qui s'informent par une IA : positions des
    candidats 76 %, vie et carrière 65 %, choix de vote 40 %, logistique 40 % (S15).
  - (2) Des erreurs sur l'objet même sont documentées : des informations attribuées à tort à des
    partis (S3) ; des écarts aux positions d'une boussole officielle dans 25 % à plus de 50 % des
    cas selon l'application (S19) ; 12 % de 1 053 réponses portant une citation directe avec un
    problème significatif (S27).
  - (2) Ce qui nuance : au premier tour des municipales de 2026, 16 % des inscrits disent avoir
    utilisé une IA pour les aider à choisir, contre 11 % pour s'informer (S9) ; une autorité a
    mesuré des conseils de vote concentrés sur deux partis (S18).
- **Argument contraire** : le dommage le mieux documenté en Europe est le conseil de vote, que le
  protocole ne mesure pas. Il ne renverse pas le statut : mesurer un conseil de vote obligerait à
  publier, avec les réponses brutes (règle 8), quel candidat chaque outil recommande, ce qui
  affaiblit le hors-champ 2 ; et un conseil faux repose d'abord sur des positions fausses (S19).
- **Test ou essai** : aucun requis ; l'essai E2 dira en passant quelle part des questions de vrais
  électeurs tombe hors de l'objet.
- **Alternative** : aucune. Mesurer le conseil de vote : impossible (hors-champ 2).
- **Décision** : aucune.

### H4. Un éditeur corrige son outil parce que le chiffre est publié

- **Le protocole dit** : « Les éditeurs peuvent donc corriger leurs outils sur ces questions :
  c'est l'effet recherché » (§5) ; « Chaque éditeur reçoit, après publication, un rapport mensuel
  avec ses réponses notées et peut y répondre publiquement » (§6).
- **Mécanisme supposé** : la publication des questions et des réponses notées fait corriger
  l'outil, et la correction dépasse les questions publiées.
- **Maillon** : action.
- **Ce qui la falsifierait** : après des audits comparables, rien, une rustine sur les seules
  questions publiées, ou un refus généralisé de répondre.
- **Ce qui tomberait avec elle** : la forme du rapport aux éditeurs, et la lecture de la tendance
  (QR7, H5 du protocole).
- **Statut** : à tester — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (2) Rustine : en 2023, un éditeur dit avoir corrigé « some of the answers the report cites » ;
    l'auditeur constate qu'il « has only corrected the answers to the specific questions we
    asked », et qu'un nouvel échantillon un mois plus tard « showed that little had changed »
    (S20).
  - (2) Refus : en 2024, un éditeur « had addressed this problem » en ne répondant plus ; en 2025,
    deux applications ne répondent à aucune question de processus électoral, et l'auditeur écrit
    que l'une « delivered the best performance, as it refused to answer political questions
    entirely » (S21). Un autre outil bloquait environ 35 % des questions pendant la collecte (29
    juillet au 12 août 2024) et 75 % au 31 août (S3).
  - (2) Le canal : dans les cas vérifiés, la presse, une autorité, ou l'auditeur qui demande une
    réaction ; aucun cas d'un rapport périodique adressé à l'éditeur. Une lettre de cinq autorités
    électorales, le 5 août 2024, a obtenu un renvoi vers un site officiel, rapporté le 26 août
    (S22) ; sur 27 signataires d'un engagement volontaire, 12 ont répondu à une demande de bilan
    (S23).
  - (1) Dans le protocole, la tendance se calcule « sur le seul canal API, sur les questions
    communes aux deux runs » (§8), donc sur des questions déjà publiées ; elle porte sur
    l'exactitude seule (`analysis/analyse-du-run.ts`, `calculerTendance`), dont le dénominateur
    exclut les non-réponses (§8). Une rustine ou une hausse des refus peut donc suffire à
    confirmer H5 du protocole.
- **Argument contraire** : dans presque chaque cas documenté, un éditeur a réagi. Il tient pour le
  fait de réagir, pas pour le mécanisme : la réaction passe par la presse ou une autorité, et prend
  la forme d'une rustine ou d'un refus. Aucun de ces cas ne porte sur des positions programmatiques
  dans une présidentielle.
- **Test ou essai** : essai E3 (auteur, 3 h, plus la relecture de l'avocat). Falsifie si aucun
  éditeur ne répond en 30 jours ou si aucun ne désigne un canal où un rapport serait traité.
- **Alternative** : publier, à côté de la tendance de l'exactitude, celle du taux de non-réponse
  et l'exactitude sur les seules questions neuves du dernier run, en analyse exploratoire annoncée ;
  H5 du protocole reste telle quelle.
  - protocole : §8 (« Tendance »), §11 (« La mesure est réactive ») ; révision avant gel ;
  - code : rien d'inutile ; lot `analyse` (deux différences de plus), lot `site` ;
  - calendrier : aucun effet ;
  - crédibilité : aucune lentille rouverte (deux chiffres exploratoires de plus, annoncés) ;
  - effet attendu : maillon action : une correction par rustine ou par refus se lit comme telle
    (S20, S21) au lieu de compter comme un progrès.
- **Décision** : D106 en attente.

### H5. Quelqu'un agit sur un résultat publié sur un site

- **Le protocole dit** : « le protocole est transmis à l'Arcom, à Viginum et à la CNIL pour
  information avant la version 1.0, sans qu'aucune de ces institutions n'ait de rôle dans le
  projet » (§10) ; le rapport est un « Site statique régénéré à chaque run » (§9). Sur la
  diffusion : rien — termes cherchés en vain : « diffusion », « presse », « destinataire »,
  « lecteur visé ».
- **Mécanisme supposé** : jamais écrit. Un résultat publié sur un site trouverait seul ceux qui
  peuvent agir.
- **Maillon** : destinataire.
- **Ce qui la falsifierait** : des audits comparables qui n'ont eu de suite que portés vers un
  destinataire précis ; ou des personnes en position d'agir qui ne voient rien à faire du rapport.
- **Ce qui tomberait avec elle** : l'absence de tout travail de diffusion dans la feuille de route ;
  la liste des institutions du §10.
- **Statut** : à tester — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (2) Chaque suite que la passe a vérifiée est passée par un porteur ou par la presse : deux
    diffuseurs publics partenaires (S20), cinq autorités électorales (S22), une recommandation
    adressée à la Commission (S21), une plainte déposée auprès d'autorités nationales et transmise
    à la Commission (S26), un rapport remis à un ministre (S18), un auditeur ou une rédaction qui
    demande leur réaction aux éditeurs (S2, S3, S5, S6). La passe n'a trouvé aucune suite à un
    audit seulement mis en ligne.
  - (2) Qui a un pouvoir : la Commission a demandé en 2024 à huit services des informations sur les
    risques de l'IA générative, dont des électeurs induits en erreur (S24), et dit en 2026 avoir
    envoyé des demandes au titre du règlement sur l'IA (S26) ; ChatGPT est désigné très grand
    moteur de recherche, avec une conformité attendue d'ici janvier 2027, des audits annuels et une
    évaluation des risques systémiques (S25) ; l'Arcom est le coordinateur national (S39). Une
    autorité de protection des données dit de ses propres constats : « Daarop handhaven kan AP
    niet » (S18).
  - (3) Le décret de Viginum vise la détection d'ingérences étrangères dans des « contenus
    accessibles publiquement sur les plateformes en ligne » ; il ne nomme ni l'IA ni les agents
    conversationnels (S40). Le communiqué de la Commission des sondages ne parle pas de l'IA (S41).
- **Argument contraire** : le web ne montre que les audits qui ont été repris ; un audit resté sur
  son site et pourtant suivi d'effet serait invisible. Il tient pour l'inférence, pas pour la
  conduite à tenir : ce que le destinataire français fera ne se lit sur aucune page.
- **Test ou essai** : essai E1 (auteur, environ 6 h). Falsifie si aucune des trois personnes ne
  nomme une action qu'elle ferait vraiment.
- **Alternative** : un plan de diffusion écrit, après E1 : un destinataire nommé par type, une
  forme par destinataire, le même envoi à tous après publication, la liste des destinataires
  publiée. Questions pour l'avocat : une réponse d'assistant entre-t-elle dans le champ du décret de
  Viginum ; par quelle voie un tiers porte-t-il un constat au coordinateur national ?
  - protocole : §10 (« Institutions »), hors des sections 3 à 8 ; révision avant gel ;
  - code : rien d'inutile ; lot `site` (T0) : une note courte engendrée depuis `runs/` ;
  - calendrier : aucun run en moins ; temps d'auteur par run non mesuré ;
  - crédibilité : lentilles C1 (un envoi à la presse n'est pas une affiliation, à écrire) et D2 ;
  - effet attendu : maillon destinataire (les suites documentées ont toutes eu un porteur).
- **Décision** : D107 en attente (commune avec H10).

### H6. Le premier résultat arrive assez tôt pour servir

- **Le protocole dit** : « Le premier résultat public est visé pour la première semaine de décembre
  2026 ; chaque jalon a un critère de passage mesurable, et un jalon non atteint décale la
  publication plutôt que d'en abaisser la qualité. » (§12) ; « Mensuel de décembre 2026 à janvier
  2027, puis hebdomadaire de février 2027 jusqu'au second tour » (§6).
- **Mécanisme supposé** : il resterait, entre le premier résultat et le premier tour, assez de runs
  publiés pour qu'un éditeur corrige, qu'une tendance se lise et qu'un électeur en profite.
- **Maillon** : publication.
- **Ce qui la falsifierait** : un calendrier réaliste qui laisse moins de deux runs publiés avant le
  premier tour.
- **Ce qui tomberait avec elle** : le rythme hebdomadaire (§6), la table du §12, le format du run.
- **Statut** : infirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (1) Le premier tour est le 18 avril 2027 (S37), 159 jours après le 10 novembre 2026. Le jalon
    du gel (15 octobre, §12) est passé sans gel : la 0.35 n'est pas écrite, `config/perimetre.yaml`
    n'est pas rempli, la relecture par un avocat et le recrutement des annotateurs ne sont pas
    cochés dans `docs/TACHES-AUTEUR.md`.
  - (1) Au format complet, la fenêtre du premier run public s'ouvre entre le 5 janvier et le 23
    mars 2027 avec 200 items et les bornes basses, mais sa publication, une fois l'échantillon
    humain noté, tombe entre le 3 juin 2027 et le 17 janvier 2028 ; avec 400 items et les bornes
    hautes, la fenêtre elle-même s'ouvre après le premier tour (C1).
  - (1) Un run au format complet (32 340 réponses) demande 481 à 1 627 h d'annotateurs avant de
    pouvoir être publié, 536 à 1 752 h avec le canal application. Avec un pool de 10 à 40 h par
    semaine, aucun n'est publié avant le premier tour ; à 80 h, un seul, aux bornes basses (C6).
  - (1) Au format le plus réduit (un échantillon, une formulation, le seul mode de tête : 3 430
    réponses), canal application compris : 111 à 319 h par run. Runs mensuels publiés avant le
    premier tour si le premier ouvre le 2 février : 0 à 10 h par semaine, 1 à 20 h, 2 à 40 h (bornes
    basses) ; 0, 0 et 1 aux bornes hautes (C6).
  - (2) Les réactions d'éditeurs documentées ont été constatées de trois semaines à deux mois après
    l'audit ou le signalement (S3, S21, S22) : un run publié en avril ne laisse à personne le temps
    d'agir avant le vote.
- **Argument contraire** : la capacité des annotateurs est un paramètre, pas un fait ; il suffit de
  recruter. Il ne tient pas : publier chaque semaine au format complet demande 48 à 163 annotateurs
  à 10 h par semaine, soit 7 215 à 48 810 € par run à 15 à 30 € l'heure (C6, paramètres de C3),
  contre un financement sur fonds personnels (§1). Le pilote mesurera les minutes par notation et le
  taux de désaccord des juges ; aucune valeur de la fourchette ne ferme un écart de cet ordre.
- **Test ou essai** : aucun ; le run pilote remplacera les fourchettes par des mesures (§12).
- **Alternative** : écrire au §12 une date butoir pour le premier run public (proposée : la fenêtre
  du mardi 2 février 2027), un rythme mensuel jusqu'au second tour, runs supplémentaires gardés, et
  y subordonner le format par l'échelle de H7. Ce n'est pas abaisser la qualité d'un chiffre :
  chaque taux garde ses deux juges, ses humains et son intervalle ; ce sont des conditions en
  moins.
  - protocole : §6 (calendrier), §12 (table, date butoir) ; D66 complétée ; révision avant gel ;
  - code : rien d'inutile (le rythme est une donnée du gel) ;
  - calendrier : au barreau le plus bas de l'échelle, application comprise, 1 run publié avant le
    premier tour (bornes basses) ou 0 (hautes) avec 20 h par semaine, 2 ou 1 avec 40 h ; au format
    complet, 0 dans les deux cas (C6.3) ;
  - crédibilité : lentille D3 refermée plutôt que rouverte ; A1 (tendance sur deux ou trois runs) ;
  - effet attendu : maillon publication : un résultat existe avant le vote (C6).
- **Décision** : D108 en attente.

### H7. Chaque couche de rigueur ajoute de la crédibilité qui sert

- **Le protocole dit** : « Charge humaine cible : 30 heures de validation initiale, puis 3 heures
  par run hebdomadaire pour l'auteur » ; « Coût cible : sous 600 € par mois d'appels API en rythme
  hebdomadaire » ; « Les leviers d'ajustement préenregistrés sont le nombre d'échantillons par
  question (2 → 1) et la reprise de note d'une lecture de comparateur » (§12).
- **Mécanisme supposé** : deux échantillons, trois formulations, deux modes, deux juges, un
  échantillon humain, un rythme hebdomadaire : chaque couche lèverait une objection qu'un lecteur
  ferait vraiment, et aucune ne coûterait plus qu'elle ne rapporte.
- **Maillon** : mesure.
- **Ce qui la falsifierait** : des couches dont le coût dépasse toute capacité plausible, pour
  parer une objection que personne n'a faite à des audits comparables.
- **Ce qui tomberait avec elle** : le plan 3 × 2 × 2 du §6, le rythme, les leviers du §12.
- **Statut** : infirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (1) Par run au format complet : 1 317 à 1 408 € d'API, dont 1 092 € pour les juges (78 à
    83 %), soit 9,5 à 10,2 fois la cible mensuelle au rythme hebdomadaire ; 639 à 730 € avec les
    juges en lot et le cache du prompt, sans rien changer au protocole (C2, C6.1).
  - (1) Des deux leviers préenregistrés, celui qui touche le volume (un échantillon) le divise par
    deux : 244 à 825 h par run ; l'autre ne porte que sur les lectures de comparateur (4 à 10 h
    par run, C2). Le seul mode de tête ramène ensuite à 157 à 534 h ; une formulation, à 57 à
    194 h (C6.1).
  - (1) L'intervalle d'un candidat dépend du nombre d'items, peu du nombre de réponses par item :
    à 30 items, 9,2 points de demi-largeur avec 18 réponses par item et par couple, 11,7 avec 3 ;
    à 10 items, 15,6 points avec 18 réponses (C1d, exactitude 0,7, corrélation intra-item 0,3).
  - (2) Les objections d'éditeurs que la passe a vérifiées visent le canal et la représentativité
    (S2, S3, S5, S6 ; « not representative of how most voters use ChatGPT », S6), que le protocole
    ne couvre que par sa plus petite couche (60 questions par outil et par mois, §6). Le relevé
    rapportait aussi une contestation de la notation par deux éditeurs en août 2026 ; sa page n'a
    pas pu être rouverte, le fait est retiré, et rien ne permet d'écrire que la notation n'est
    jamais attaquée.
  - (2) Des méthodes légères ont pesé : 400 questions et des captures d'écran (S21), des résultats
    intermédiaires (S20), une lettre sans étude (S22).
- **Argument contraire** : ces audits ne publiaient pas de symétrie entre candidats dans une
  présidentielle française ; l'attaque viendra d'une campagne, et c'est la notation qu'elle visera.
  Il tient pour les couches de neutralité et de fiabilité (double validation, deux familles de
  juges, échantillon humain, test contrefactuel), que l'alternative ne touche pas. Il ne tient pas
  pour les multiplicateurs de volume, dont l'intervalle par candidat dépend peu (C1d).
- **Test ou essai** : aucun ; le pilote mesure les heures par run (§12, D66).
- **Alternative** : écrire au §12 une échelle de repli préenregistrée, appliquée d'après la charge
  mesurée au pilote, dans cet ordre : un échantillon ; le seul mode de tête de chaque outil ; une
  formulation, la neutre. Juges en lot avec cache dans tous les cas.
  - protocole : §6, §8 (ce qui devient « sans objet »), §12 ; D66 complétée ; révision avant gel ;
  - code : rien d'inutile tant qu'un barreau n'est pas descendu ; lots `interrogation` (mode par
    outil, une formulation), `analyse` et `go-no-go` (sans objet), `questions-tirage-symetrie` ;
  - calendrier : voir H6 (C6) ;
  - crédibilité : lentilles A1 et B1 : au deuxième barreau, H2 du protocole et la part du mode dans
    QR6 sont sans objet ; au troisième, H3, la part de la formulation dans QR6 et la métrique
    primaire « confirmation de prémisse » (C1d) ;
  - effet attendu : maillon mesure : la dépense suit les objections documentées (S2 à S6).
- **Décision** : D109 en attente.

### H8. Seul et sans partenaire, le projet porte plus loin

- **Le protocole dit** : « Le projet est porté par un particulier, sans affiliation à un parti, un
  candidat, une campagne, un média, une institution publique ou un éditeur d'IA. Financement : fonds
  personnels uniquement. » (§1) ; « Un projet à une personne. » (§11).
- **Mécanisme supposé** : l'absence de toute affiliation vaudrait plus, pour la reprise des
  résultats, que la portée, les moyens et la relecture qu'un partenaire apporterait.
- **Maillon** : destinataire.
- **Ce qui la falsifierait** : des audits comparables tous portés par une structure ; un plan que
  les moyens d'une personne ne peuvent pas exécuter.
- **Ce qui tomberait avec elle** : « fonds personnels uniquement » et « institution publique »
  (§1) pour ce qui n'est pas le hors-champ 4 ; l'organisation des annotateurs (§7, §10).
- **Statut** : infirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (1) Le format le plus réduit demande 111 à 319 h d'annotateurs et de testeurs par run ; deux
    personnes à 5 à 10 h par semaine en fournissent 43 à 87 par mois (C6, paramètres de C1).
  - (2) Les audits vérifiés dont le porteur est établi l'étaient tous par une structure : une
    association avec deux diffuseurs publics (S20), une organisation qui écrit à la Commission
    (S21), 22 médias publics et 271 journalistes évaluateurs (S27), une autorité (S18), une
    organisation de défense de la presse (S26), un média avec plus de 40 experts (S2), une
    université (S33). Pour un autre (S5), la page lue parle de chercheurs sans dire leur
    structure.
  - (3) L'agrément des chercheurs par l'Arcom, pour l'accès aux données des plateformes (article
    40 du DSA), prend jusqu'à 80 jours ouvrés (S42), soit seize semaines : engagé mi-novembre, il
    aboutirait au plus tard début mars 2027. Savoir si le projet y est éligible est une question
    pour l'avocat.
  - La passe n'a trouvé aucun audit français des réponses d'assistants sur des positions de
    candidats (recherches du relevé, question 8) : absence de trace, pas preuve d'absence.
- **Argument contraire** : dans une présidentielle, un partenaire média serait dit partisan et une
  institution, l'État ; aucune convention ne se signe en quelques semaines. Il tient pour un
  partenariat de méthode ou de marque. Il ne tient pas pour de la capacité sans rôle : des
  annotateurs rémunérés, recrutés par une école ou un laboratoire, de sensibilités déclarées
  différentes, sont ce que le §7 demande déjà.
- **Test ou essai** : la question est posée au chercheur de l'essai E1.
- **Alternative** : chercher un partenaire de capacité, sans rôle dans la méthode ni accès
  anticipé (§10) : un vivier d'annotateurs rémunérés, et un relecteur académique nommé pour la 1.0.
  Un parti, une campagne, un éditeur évalué : impossible (hors-champ 4).
  - protocole : §1 (partenaire déclaré), §7 et §10 (annotateurs) ; révision avant gel ;
  - code : aucun ;
  - calendrier : le délai d'un accord est inconnu ; au barreau le plus bas, application comprise,
    2 runs publiés avant le premier tour (bornes basses) ou 1 (hautes) avec 40 h par semaine,
    contre 0 avec 10 h et 1 ou 0 avec 20 h (C6.3) ;
  - crédibilité : lentilles C1 et C2 (qui est le partenaire), D2 (sensibilités déclarées, RGPD) ;
  - effet attendu : maillon publication (la capacité) et maillon destinataire (S20, S27).
- **Décision** : D110 en attente.

### H9. Un protocole gelé une fois pour toutes sert mieux qu'un protocole qui suit le terrain

- **Le protocole dit** : « la version 1.0 sera gelée et publiée avant tout premier résultat » (§1) ;
  « La liste nominative des outils est fixée à la version 1.0 » (§3) ; le modèle interrogé est
  « L'identifiant de modèle par défaut du produit grand public de l'éditeur à la date du run, tel
  que documenté publiquement » (§6).
- **Mécanisme supposé** : sur six mois où les modèles, les produits et les candidatures changent,
  un cadre immobile garderait plus de valeur qu'il n'en perd.
- **Maillon** : mesure, publication.
- **Ce qui la falsifierait** : un changement du terrain que ni une règle écrite d'avance ni un
  amendement ne permettent de suivre.
- **Ce qui tomberait avec elle** : la liste figée (§3, §11), le refus d'affiner après le gel.
- **Statut** : pari assumé — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (1) Sur les seuls changements qu'une page officielle date, trois outils sur sept ont changé
    quatre fois de modèle par défaut en douze mois (S28, S31, S32) : 2 changements attendus en six
    mois, 86 % de chances d'en voir au moins un. Borne basse : quatre outils ne sont pas comptés,
    faute de page (C7).
  - (2) Le protocole suit déjà le modèle par une règle, et publie le modèle de chaque run avec la
    tendance (§6, §8). Un éditeur reconnaît que ses retraits de modèles font que « Researchers lose
    access to models for ongoing and comparative studies » (S29).
  - (2) Deux suivis continus disent la limite d'une cible mouvante : « What we cannot yet say is
    how stable those differences are » (S33) ; rejouer plus tard « will likely produce different
    outputs » (S43).
- **Argument contraire** : un cadre gelé ne peut pas apprendre de ses premiers runs. Il tient, et
  c'est le pari : le prix d'une erreur de cadre est écrit au §9 (amendement, résultats rapportés
  séparément). Le pari est tenable si l'échelle de H7 est écrite avant le gel ; sans elle, le
  premier contact avec la charge mesurée force un amendement.
- **Test ou essai** : aucun avant la réalité. Le run pilote et le premier run public trancheront.
- **Alternative** : aucune.
- **Décision** : l'auteur a décidé de ne plus affiner le protocole une fois gelé (rapporté par
  `.claude/skills/critique-protocole/SKILL.md`, « Jamais après le gel »). Aucune décision nouvelle.

### H10. Un site statique de taux par outil est la forme qui change quelque chose

- **Le protocole dit** : « Les outils sont notés ; les candidats ne le sont jamais. » (§3) ; une
  erreur grave « est publiée in extenso dans le rapport du run » (§8) ; « Le site publié est
  statique : données JSON + calculs déterministes. » (`CLAUDE.md`, règle 1).
- **Mécanisme supposé** : un lecteur viendrait au site, lirait des taux avec leurs intervalles, et
  en tirerait une conduite.
- **Maillon** : publication.
- **Ce qui la falsifierait** : des formes qui ont porté ailleurs et qui ne sont pas un tableau ;
  des lecteurs qui ne tirent rien d'un tableau.
- **Ce qui tomberait avec elle** : l'ordre des livrables du lot `site`, encore à T0.
- **Statut** : à tester — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (2) Ce qu'un éditeur a corrigé, ce sont des réponses citées : « some of the answers the report
    cites » (S20) ; une fausse information précise, répétée dix jours (S22).
  - (2) Les jeux de données publiés sont peu repris : 129 vues et 235 téléchargements au 10
    novembre 2026 pour l'un, 4 étoiles et aucune copie pour l'autre (S34). La passe n'a trouvé
    aucune adoption documentée d'un kit destiné aux éditeurs (S27). La base d'une boussole
    officielle interdit toute réutilisation hors analyse scientifique ou journalistique (S35).
  - (1) Le site de résultats n'est pas écrit (lot `site`, T0) : choisir sa forme ne défait rien.
- **Argument contraire** : un tableau de taux est ce que la presse a repris des audits comparables.
  Il tient, et l'alternative garde le tableau ; elle change ce qui vient en premier.
- **Test ou essai** : essai E1 (auteur, environ 6 h), qui montre deux présentations du même contenu
  fictif. Falsifie si aucun lecteur ne tire d'action du tableau seul.
- **Alternative** : après E1, bâtir le rapport d'un run dans cet ordre : les erreurs graves in
  extenso par outil (le §8 les exige déjà toutes), les taux avec leurs intervalles, une note d'une
  page, puis les données. Pari, à sonder en E1 et E3 : le jeu de positions vérifiées sous licence
  ouverte est peut-être le livrable le plus réutilisable.
  - protocole : aucun changement (hors protocole) ;
  - code : rien d'inutile ; lot `site` (T0), dans cet ordre ;
  - calendrier : aucun effet ;
  - crédibilité : lentille C2 (ouvrir sur des erreurs se lit comme un choix : le §8 interdit la
    sélection, toutes y figurent) ;
  - effet attendu : maillons destinataire et action (S20, S22).
- **Décision** : D107 en attente (commune avec H5).

### H11. Publier, c'est réussir

- **Le protocole dit** : « Les résultats sont publiés quels qu'ils soient, y compris s'ils ne
  montrent ni erreur notable ni asymétrie. » (§1). Sur ce qui compterait comme un succès : rien —
  termes cherchés en vain : « mesure de succès », « utilité », « impact ».
- **Mécanisme supposé** : le projet aurait réussi quand des runs conformes sont publiés.
- **Maillon** : effet pour l'électeur.
- **Ce qui la falsifierait** : des projets comparables qui définissent un résultat et le suivent ;
  un critère de l'auteur que la publication seule ne remplit pas.
- **Ce qui tomberait avec elle** : l'absence de toute mesure de résultat au §12 et au jalon J6.
- **Statut** : infirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - Décision de l'auteur du 2026-11-10 : un résultat irréprochable que personne n'utilise est un
    échec.
  - (2) Des projets comparables ont suivi un résultat : la part de réponses à problème « improved
    from 51% to 37% » entre deux mesures du même porteur (S27) ; un nouvel échantillon un mois
    après (S20) ; un suivi deux mois après le rapport (S21) ; un taux de réponse des signataires
    (S23).
  - (1) Le seul indicateur de progrès du protocole, H5, peut être confirmé par une rustine ou par
    des refus (H4).
- **Argument contraire** : s'engager sur un effet qu'on ne maîtrise pas invite à tordre la mesure
  pour l'obtenir. Il ne renverse pas le statut : des indicateurs de résultat jugent le projet, pas
  les outils, et ne touchent à aucun chiffre préenregistré.
- **Test ou essai** : essai E1, pour savoir quelle action un destinataire nommerait.
- **Alternative** : écrire avant le gel quatre indicateurs, suivis dans un journal public sourcé :
  une réponse publique d'éditeur (§6) ; une reprise par une rédaction, une autorité ou un
  chercheur ; l'exactitude sur les questions neuves (H4) ; et un dommage : un résultat lu comme un
  classement de candidats, une erreur du banc reprise comme un fait.
  - protocole : §12 (jalon du rapport de synthèse), hors des sections 3 à 8 ; révision avant gel ;
  - code : rien d'inutile ; lot `site` (un journal en JSON, ajout seul, et sa page) ;
  - calendrier : aucun effet ; temps d'auteur par run non mesuré ;
  - crédibilité : lentille C2 (un projet qui se note lui-même), faible ;
  - effet attendu : maillon effet pour l'électeur : le rapport de synthèse dit si le projet a servi
    (S20, S21, S27).
- **Décision** : D111 en attente.

### H12. Le projet s'arrête au second tour

- **Le protocole dit** : le calendrier finit par un « Rapport de synthèse sous 30 jours après le
  second tour » (§12) ; les sujets écartés « feront l'objet d'un protocole séparé » (§3).
- **Mécanisme supposé** : l'utilité du projet tiendrait dans cette élection.
- **Maillon** : effet pour l'électeur.
- **Ce qui la falsifierait** : des audits comparables dont la valeur a duré au-delà de leur scrutin.
- **Ce qui tomberait avec elle** : rien de plus que ce que porte déjà le lot
  `generalisation-politique-francaise`.
- **Statut** : infirmée — 2026-11-10, passe du 2026-11-10.
- **Faits** :
  - (2) Ce qui a duré, c'est une méthode rejouée par son porteur : trois études en moins de deux
    ans, dont une au Sénégal avec un partenaire (S21, S36), deux mesures à moins de cinq mois
    d'écart (S18), un diffuseur puis 22 (S27), un jeu fixe de questions relancé « every few days »
    (S33).
  - (2) Ce que la passe n'a pas trouvé : une reprise des données ou du code par des tiers (S34).
  - (1) Si aucun run n'est publié avant le premier tour (H6), ce qui reste du projet est sa
    méthode, son jeu de positions et son code.
- **Argument contraire** : préparer la suite prend du temps à une campagne qui n'en a pas. Il
  tient, et l'auteur a tranché en ce sens.
- **Test ou essai** : aucun.
- **Alternative** : ne rien changer de plus. La généralisation est estimée à 3 à 5 semaines pour la
  politique française (note du lot) ; l'avancer la paierait sur les 159 jours qui restent, pour une
  reprise par des tiers que rien ne documente. La discipline déjà écrite suffit : ne rien coder en
  dur de propre à 2027.
- **Décision** : tranché par l'auteur le 2026-11-03 : la présidentielle d'abord, la généralisation
  ensuite, sous un protocole distinct (lot `generalisation-politique-francaise`).

## Essais de terrain en attente

| Essai | Hypothèses testées | Exécutant | Coût | Décrit dans |
| --- | --- | --- | --- | --- |
| E1. Un rapport d'exemple, trois destinataires | H5, H8, H10, H11 | auteur | environ 6 h | [passe du 2026-11-10](2026-11-10.md#e1-un-rapport-dexemple-trois-destinataires) |
| E2. De vraies questions d'électeurs | H1, H2, H3 | auteur | environ 4 h | [passe du 2026-11-10](2026-11-10.md#e2-de-vraies-questions-délecteurs) |
| E3. La même question à chaque éditeur | H4, H10 | auteur, après relecture de l'avocat | environ 3 h | [passe du 2026-11-10](2026-11-10.md#e3-la-même-question-à-chaque-éditeur) |
