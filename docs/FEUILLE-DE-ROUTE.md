# Feuille de route — Banc d'essai 2027

> Fichier généré par `pnpm feuille-de-route` depuis `docs/feuille-de-route.json`. Ne pas éditer à la main. Mis à jour le 2026-10-19.

## Décisions en attente

Aucune décision en attente.

## Décisions tranchées

### D1 — Brancher une intégration continue GitHub Actions qui exécute `pnpm check` et `pnpm test` sur chaque PR ?

**Décision du 2026-09-20 :** GitHub Actions sur chaque PR : `pnpm check` et `pnpm test`, un seul fichier de workflow, aucune dépendance npm. C'est la seule preuve publique que les tests bloquants du §5 le sont réellement.

### D10 — Valider chaque donnée contre son JSON Schema à l'exécution, ce qui fait passer ajv dans les dépendances d'exécution ?

**Décision du 2026-09-24 :** ajv et ajv-formats en dependencies (8.20.0, 3.0.1), valider(nom, valeur, provenance) sur le registre existant à chaque frontière qui a un schéma. Manifestes de lot et brouillons, sans schéma, restent hors champ.

### D11 — pnpm symmetry peut-il sortir en succès sans avoir contrôlé l'invariant « item F ⇒ mesure fictive » ?

**Décision du 2026-09-24 :** --mesures obligatoire, l'état « non contrôlé » disparaît ; --items désigne un répertoire, un fichier par item, lu en ordre de nom.

### D12 — Comment l'interrogation traite-t-elle les refus de l'API, les délais entre tentatives, l'ordre des requêtes et les requêtes restées hors de la fenêtre de 48 h ?

**Décision du 2026-10-02 :** Option 1, texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md (un agent n'écrit pas le protocole). Schéma reponse : normalise.refus_api et motif_manquante (echecs | hors_fenetre). Suite du même jour : un corps qui n'est pas un objet JSON est stocké dans brut_texte (exclusif de brut) ; brut_octets_sha256 hache les octets reçus avant tout parse ; requete.entetes garde les en-têtes sauf l'authentification ; runs/<date>/ est la date du gel à Paris.

### D13 — Après le retrait d'un juge (§7, conformité n° 18), « ses notations sont écartées de tout le run » vaut-il aussi pour l'accord juges-humains et le kappa des juges publiés avec le run ?

**Décision du 2026-10-03 :** Option 1 : les notations d'un juge retiré sont écartées aussi de l'accord juges-humains et du kappa des juges publiés avec le run. Si un juge est retiré en cours de run, l'accord ne porte plus que sur le juge restant, ce que le texte de la 0.16 doit dire. À coder au lot notation avec le contrôle croisé du n° 18.

### D14 — Quatre points du §7 que le protocole ne tranche pas, rencontrés en préparant le lot notation : ordre du test contrefactuel et de l'échantillon de 25 %, forme de la permutation des candidats, ce qu'est un changement de note, et contrefactuel outil.

**Décision du 2026-10-05 :** Option 1 sur les quatre points. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md (un agent n'écrit pas le protocole). À coder au lot notation.

### D15 — Cinq points laissés ouverts par la PR A du lot notation : accord partiel des notations, citations transmises au juge, motif de l'humain appelé sur un extrait refusé, population et arrondi de l'échantillon humain, identifiant du candidat dans la charge.

**Décision du 2026-10-05 :** Option 1 sur les cinq points, codée dans la PR #79. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D16 — Quatre points du test contrefactuel des candidats que le §7 ne tranche pas : permutation de la question, extrait invalide dans une paire, retrait des deux juges, contrefactuel outil.

**Décision du 2026-10-06 :** Option 1 sur les quatre points. À coder dans la PR B du lot notation. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D17 — L'égalité des notations (notationsConcordent) est plus stricte que ce que lisent les métriques primaires : faut-il la restreindre ou amender le §7 ?

**Décision du 2026-10-06 :** Option 1. Schémas de notation et de verdict : obsolescence_fraiche absente sans le drapeau obsolescence (PR #82). Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D18 — Trois points de la notation humaine des réponses que le §7 ne tranche pas : ce que voit l'humain appelé, ce que fait le troisième humain de l'échantillon, le tirage du jeu d'or.

**Décision du 2026-10-06 :** Option 1 sur les trois points. À coder au lot notation-humaine. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D19 — Deux points laissés ouverts par la PR D du lot notation (#89) : un refus de l'API est-il éligible au test contrefactuel ; que fait la chaîne quand un juge dit « soutient » sur un lien que le test HTTP dit mort ?

**Décision du 2026-10-06 :** Option 1 sur les deux points. Exclusion des refus déjà codée (#89) ; forçage de non_applicable à coder au lot notation. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D2 — Quelles dépendances autoriser pour la collecte et l'archivage (lot collecte) ?

**Décision du 2026-09-20 :** yt-dlp, faster-whisper en local, pymupdf et appel HTTP direct à l'API Wayback. Tout tourne sur la machine, aucune clé, transcription rejouable hors ligne par un tiers.

### D20 — Comment le lot test-liens établit-il l'existence d'un lien cité (§7, « test HTTP déterministe ») : méthode, table résultat → verdict, moment et tentatives, copie conservée ?

**Décision du 2026-10-08 :** Option 1 sur les quatre points. Table : 2xx après redirections ⇒ existe ; 404, 410, domaine inexistant ⇒ mort ; 401, 403, 429, 451, autres 4xx, 5xx, délai, connexion refusée, erreur TLS ⇒ inaccessible ; robots interdit, schéma non http(s), URL malformée, plus de 5 redirections ou boucle ⇒ non_testable ; une page « introuvable » servie en 200 ⇒ existe. À coder au lot test-liens. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D21 — Quatre points laissés ouverts par le lot test-liens (PR #95) : cas que la table de D20 ne classe pas, URL non ASCII, soutien d'après copie archivée sans empreinte, instantané Wayback d'une page d'erreur.

**Décision du 2026-10-08 :** Option 1 sur les quatre points. À coder dans la PR #95 du lot test-liens. Texte proposé pour la 0.16 dans docs/TACHES-AUTEUR.md.

### D22 — Quatre points laissés ouverts par D21 dans la PR #95 : saisie humaine d'un soutien impossible, instantané Wayback servi à une autre date, instantané sans statut, encodage d'une URL non ASCII pour la recherche Wayback.

**Décision du 2026-10-08 :** Option 1 sur les quatre points. Points 2 à 4 dans la PR #95 ; point 1 (formulaire) dans une PR de notation-humaine. Seul le point 2 touche au texte proposé pour la 0.16 (docs/TACHES-AUTEUR.md).

### D23 — Deux points laissés ouverts par D22 dans la PR #95 : recherche Wayback pour une IRI inconvertible ; instantané servi après une redirection rejouée par Wayback.

**Décision du 2026-10-08 :** Option 1 sur les deux points, déjà le comportement de la PR #95.

### D24 — Quatre points que le §12 laisse ouverts pour le lot go-no-go : kappa juges-humains de l'échantillon de 10 % ; critère d'un kappa indéfini ; run tout vert déclaré provisoire ; enregistrement du contreseing de l'annexe F.

**Décision du 2026-10-09 :** Option 1 sur les quatre points. Le point 1 est à écrire en 0.16 (§7 et §12).

### D25 — Points laissés ouverts par D24 dans la PR #100 : note humaine retenue « indéterminée » dans le kappa de l'échantillon ; test contrefactuel indéfini ; cases de l'annexe F vérifiées en partie ; trois choix déduits.

**Décision du 2026-10-09 :** Option 1 sur les quatre points. Le point 1 est à écrire en 0.16 avec D24 (1).

### D26 — Quatre points du lot perimetre-prompts que le protocole laisse ouverts : date d'application de la règle pour la liste publiée à J1 ; « top des applications de la catégorie » des stores ; choix des deux juges ; note d'une réponse juste qui ajoute une position inventée non contradictoire (schema/README.md, point ouvert 3).

**Décision du 2026-10-09 :** Option 1 sur les quatre points (l'auteur a d'abord envisagé GPT pour (3), puis retenu Mistral Large). Points 1 et 2 à écrire au §3 en 0.16, point 4 au §7 et dans le prompt juge. Point 4 RÉVISÉ par l'auteur le 2026-10-09 : « exacte » avec drapeau fabrication contredisait le §7 (drapeaux sur les seules réponses inexactes, fabrication réservée aux items A et F) et schema/notation.schema.json ; retenu : « inexacte », motif d'inexactitude ajout_fabrique, que le schéma prévoyait déjà. Aucun texte du §7 à écrire pour ce point.

### D27 — Ce que la charge du juge doit transmettre et ce que le code calcule à sa place, pour que le prompt juge ne fasse rien deviner de ce qu'un fichier sait déjà.

**Décision du 2026-10-09 :** Option 1, les cinq points. Le §7 doit énumérer en 0.16 ce que reçoit le juge (réponse attendue, prémisse, texte de la page citée), et l'annexe D s'aligner sur la charge.

### D28 — Quatre trous du §3, du §6 et du §10 relevés par le dossier de recherche du périmètre au 15 octobre (scratch/perimetre/dossier-2026-10-15.md) : candidat éliminé au premier tour d'une primaire ; intention de candidature ; outil sans recherche web par API ; clause restrictive de l'API Gemini en mode web.

**Décision du 2026-10-09 :** Option 1 sur les quatre points. Points 1 à 3 à écrire en 0.16 (§3 et §8) ; point 4 : question ajoutée à la relecture de l'avocat.

### D29 — Points ouverts par la PR #106 (charge-juge-v3) : qui décide la note d'une Q-ATT ; pages citées dans le test contrefactuel ; borne du texte d'une page ; rattachement des noms, ambigus, saisie humaine d'une Q-ATT, version de la charge enregistrée.

**Décision du 2026-10-09 :** Option 1 sur les quatre points. Points 1 et 2 à écrire au §7 en 0.16. Point 2 précisé par D30 (1) : la formulation « catégorie, drapeaux et motif » ajoutait par erreur le motif, contre D14 (3).

### D3 — Quels SDK d'API autoriser pour l'extraction, l'interrogation et la notation ?

**Décision du 2026-09-20 :** SDK officiels, un par éditeur, versions épinglées. La réponse brute stockée reste le corps HTTP tel que reçu, jamais l'objet du SDK (règle 7).

### D30 — Points ouverts par le codage de D29 dans la PR #106 : définition d'un changement contrefactuel ; trois cas de Q-ATT qu'aucun texte ne tranche ; « indéterminée » humaine sur une Q-ATT ; version de la charge d'une lecture de comparateur.

**Décision du 2026-10-09 :** Option 1 sur les quatre points.

### D31 — Renvoi d'un juge (Q-ATT indécidable, D30) dans le test contrefactuel et dans le kappa juge-humain de l'échantillon.

**Décision du 2026-10-10 :** Option 1 sur les deux points.

### D32 — Notation d'un refus de l'API : D12 le classe non-réponse, mais l'annexe C exige un extrait justificatif pour toute note autre qu'exacte, et sur un item A ou F (ou une Q-ATT dont la référence n'a que des items F) il n'y a ni texte de réponse ni citation à recopier ; la chaîne s'arrêtait (schéma de notation, SortieJugeIncoherente).

**Décision du 2026-10-10 :** Option 1. À écrire au §7 en 0.16 : un refus de l'API est noté non-réponse sans juge.

### D33 — Deux points ouverts par la PR #108 (D32) : extrait humain d'un refus de l'API tiré dans l'échantillon sur un item A ou F ; refus de l'échantillon dans le kappa juge-humain.

**Décision du 2026-10-10 :** Option 1 sur les deux points. À écrire en 0.16 avec D32 (§7, annexe C).

### D34 — Sept choix de rédaction du prompt juge 1.0.0 (scratch/prompts/judge-1.0.0.md, charge-juge-v3) : verdict de soutien sur une page tronquée et sur une extraction refusée ; contenu de noms_cites ; ordre de priorité des motifs d'inexactitude ; extrait toujours demandé sur une Q-ATT ; « personne ne la propose » sur une Q-ATT ; confirmation_premisse.

**Décision du 2026-10-12 :** Option 1 sur les sept points. Le prompt est prêt à être recopié par l'auteur dans prompts/judge-1.0.0.md. À écrire en 0.16 (§7) : les deux verdicts indetermine (1, 2) et l'ordre des motifs (6), qui influent sur une mesure publiée.

### D35 — Relecture de la PR #104 (prompts extraction et reformulation 1.0.0) : page d'une citation demandée au modèle ; item O proposé depuis une seule source ; positions du candidat rapportées par la presse (T3) ; contraction « à le », « à les » dans le gabarit Q-NEG.

**Décision du 2026-10-12 :** Option 1 sur les quatre points. (1) et (3) appliqués au prompt d'extraction dans la PR #104 ; (4) remplissage codé dans la PR #111 (majuscule « Le »/« Les » après « à » ⇒ erreur, décision du 2026-10-12) ; contrôle de la reformulation sur la mesure contractée à écrire avec ce contrôle.

### D36 — Points ouverts par les relevés du périmètre du 2026-10-15 (scratch/perimetre/dossier-2026-10-15-final.md) : clôture du relevé ; perdants de la primaire PS–Place publique–GRS ; preuve de la proclamation ; trois assistants incertains (Gemini Notebook, Grok Bot, Meta AI).

**Décision du 2026-10-15 :** (1) L'auteur : « La date initiale du 15 est repoussable, le plus important est que le code soit propre et parfaitement complet ! » Lecture retenue par l'agent, à confirmer : la date de référence de la liste reste le 2026-10-15 (D26), le relevé des faits datés du 15 au plus tard est complété sans urgence, et la publication de la liste suit le gel effectif de la 1.0. (2), (3), (4) : option 1.

### D37 — Outil dont l'API n'offre que le mode avec recherche web (cas possible de Perplexity : désactivation du web attestée en secondaire seulement, migration de Sonar vers une « Agent API »). D28 (3) ne couvre que le cas inverse.

**Décision du 2026-10-15 :** Option 1. À écrire en 0.16 au §8, avec D28 (3).

### D38 — Où vivent les mesures validées que lit le gel d'un run ?

**Décision du 2026-10-15 :** Option 1.

### D39 — Où vivent les formulations familière et orientée relues qu'exige chaque question ?

**Décision du 2026-10-15 :** Option 1.

### D4 — Comment offrir le formulaire public de contestation (§4, droit de réponse) sur un site statique sans traceur ?

**Décision du 2026-09-20 :** Adresse mail dédiée seule pour la v1.0, phrase du §4 ajustée avant gel — révision de texte, pas amendement. Un service de formulaire pourra s'ajouter par amendement quand le volume le justifiera.

### D40 — D'où viennent les graines publiées d'un run (tirage, échantillon humain, contrefactuel, bootstrap, permutation) ? Le protocole ne dit ni qui les choisit ni quand.

**Décision du 2026-10-15 :** Option 1. Nouveau service tiers et appel réseau autorisés pour le gel. À écrire au §5 en 0.16.

### D41 — Qui lance le gel d'un vrai run (écriture de runs/<date>/) ?

**Décision du 2026-10-15 :** Option 1.

### D42 — Quatre points du lot reformulation que ni le §5 ni D39 ne tranchent : modèle qui reformule ; production et relecture de la formulation neutre, écrite par le gabarit ; position affirmée par la formulation orientée selon le type d'item ; forme de la mesure exigée par le contrôle quand le gabarit la contracte (D35 (4)).

**Décision du 2026-10-15 :** Option 1 sur les quatre points. Points 2 et 3 à écrire au §5 à la prochaine révision (0.17), car ils influent sur une mesure (dénominateur de la confirmation de prémisse). Identifiant exact du modèle épinglé fourni par l'auteur avant le premier appel réel.

### D43 — Une formulation relue reste-t-elle valable quand une validation corrige la position de l'item sans changer le texte neutre (position d'un item P, état antérieur d'un item O) ?

**Décision du 2026-10-15 :** Option 1.

### D44 — Quatre points du gel que le §5 (0.16) ne règle pas : origine de engendree_le, chaîne drand, règle de dérivation des cinq graines, vérification de la réponse de la balise.

**Décision du 2026-10-15 :** Option 1 sur les quatre points. Règle de dérivation et chaîne à écrire au §5 en 0.17.

### D45 — Quatre points du gel soulevés par la PR 1 (#127) : identifiant du run et reproductibilité du tirage, origine des alias aveugles, run précédent de la reprise à 80 %, ordre entre l'instant du gel, date_gel et la fenêtre.

**Décision du 2026-10-15 :** Option 1 sur les quatre points. Alias (§7), run précédent (§5) et ordre des instants (§5, §6) à écrire en 0.17. Identifiant et run précédent dans la PR 2 du lot gel, refus d'ordre et alias dans la PR 2 également.

### D46 — Le tour drand est fixé par date_gel (D44, D45) et devient public dès date_gel passée : un auteur qui gèle plus tard peut lire l’aléa, rejouer le tirage, puis modifier data/ avant de geler. Comment l’exclure ?

**Décision du 2026-10-16 :** Option 1. Appel Wayback au gel autorisé, lancé par l’auteur seul. À écrire au §5 en 0.17. Dans la PR 2a du lot gel.

### D47 — Quatre points laissés par la PR 2a du lot gel (#130) : source de l’URL d’engagement, dispense du pilote, archivage de la réponse Wayback, délai des appels réseau du gel.

**Décision du 2026-10-16 :** Option 1 sur les quatre points. Paramètre --engagement et archive Wayback à écrire au §5 en 0.17 avec D46. Dans la PR 2a (#130).

### D48 — Cinq points laissés par la PR 2b du lot gel (#131) : gel exécuté après l’ouverture de sa fenêtre, champs comparés aux alias aveugles, variantes proches d’un nom, empreinte des questions du run précédent, statuts admis pour un run précédent.

**Décision du 2026-10-16 :** Option 1 sur les cinq points. Gel tardif (§5, §6), alias (§7), empreinte des questions et statut du précédent (§5) à écrire en 0.17. Dans une PR 2c du lot gel, après #131.

### D49 — D48 (5) refuse le gel quand le run le plus récent n’est ni publié ni invalidé. Or un run supplémentaire doit partir dans les 72 h d’un débat ou de la liste officielle (§6), pendant qu’un run peut encore être en notation : le gel serait refusé et l’engagement des 72 h intenable.

**Décision du 2026-10-16 :** Option 1. Remplace le « tout autre refusé nommément » de D48 (5). Dans la PR 2c du lot gel ; à écrire au §5 en 0.17. Même jour : la question sur le changement de position suit la règle de l’item O (D42 (3)) ; D43 écrite au §5 en 0.17 ; format des alias écrit au §7.

### D5 — Quelle est la liste nominative des outils et des candidats du premier run, et où vit-elle ?

**Décision du 2026-09-20 :** L'auteur applique les règles du §3 à la date du jour, archive les preuves d'inclusion et écrit config/perimetre.yaml, avec révision au gel du 15 octobre. Les lots dépendants démarrent sur un périmètre provisoire dès que le format est fixé.

### D50 — Deux points laissés par la PR 2c du lot gel (#134) : fenêtre ouverte exactement à date_gel, que D45 (4) accepte mais où D48 (1) ne laisse aucun instant de gel possible ; longueur minimale de la forme collée d’un nom comparée aux alias.

**Décision du 2026-10-16 :** Option 1 sur les deux points. Dans la PR 2c (#134) ; écrit au texte 0.17 (§5 Gel, §7 alias).

### D51 — Statuts du run (PR 3 du lot gel) : qui écrit en_cours, comment enregistrer une invalidation connue avant le dépôt Zenodo, comment relier une réexécution au run invalidé, depuis quels statuts invalider.

**Décision du 2026-10-16 :** Option 1 sur les quatre points. Dans la PR 3 du lot gel ; à écrire aux §6 et §12.

### D52 — Quatre points du lot extraction que le §4 ne tranche pas : les deux modèles extracteurs ; la règle d'appariement des deux extractions ; ce qui est déposé dans staging/ pour une paire appariée ; le texte canonique lu quand une source en a plusieurs, et le sort des items validés sur un texte plus ancien.

**Décision du 2026-10-16 :** Option 1 sur les quatre points. Lot extraction, PR 1 (cœur) et PR 2 (éditeurs). Points 2 à 4 à écrire au §4 à la prochaine révision, car ils influent sur ce qui est proposé à la validation.

### D53 — Quatre points laissés par la PR 1 du lot extraction : mesure d'un item extrait ; une des deux sorties illisible ; citation présente plusieurs fois dans le texte ; extrait minuté d'une source T2.

**Décision du 2026-10-16 :** Option 1 sur les quatre points. (2) à (4) dans la PR 1 du lot extraction ; (1) demande une PR de l'interface de validation avant toute promotion d'un item extrait. (2) à (4) à écrire au §4 avec D52. Écrit au §4 par la 0.17 (#148) ; (1) livré par #146, #147 et #150.

### D54 — Huit points laissés par la revue de code du 2026-10-17 (docs/revues/2026-10-17.md, constats 1, 2, 4, 5, 8, 16, 17, 23) : précédence des décisions de thème ; erreur HTTP passagère à l'extraction ; entrée d'extraction après montée de version de l'extracteur de texte ; position affirmée par l'orientée d'un état « sans_objet » ; relance de run:invalider ; description du thème dans commun.schema.json ; modèle servi par l'API d'extraction ; fichiers parasites en staging.

**Décision du 2026-10-17 :** Option 1 sur les huit points. (2) précise D53 (2) et (4) amende D42 (3) : à écrire au §4 et au §5 à la prochaine révision (TACHES-AUTEUR). (7) avant le premier appel réel. Le reste est du code, sans amendement.

### D55 — Onze décisions laissées par la revue de code du 2026-10-12 (docs/revues/2026-10-12.md, constats 1, 2, 4, 5, 6, 13, 17, 20, 24, 42, 54), reprises par la revue du 2026-10-17 : normalisation dans la charge du juge ; décodage de Location ; schéma du manifeste de lot ; interroges sous permutation d'une Q-ATT ; réponse reçue non stockée ; retrait d'un item contesté sur un GET ; qui écrit par_mode ; plomberie HTTP partagée ; opacité de candidat_id ; amorce « attribution » ; mise à jour de CLAUDE.md.

**Décision du 2026-10-17 :** Option 1 sur les onze points. (4) précise le §7 (« un dérangement des candidats interrogés au run »), (5) le §6, (9) le §7 (alias aveugles des candidats dans la charge du juge) : à écrire à la prochaine révision (TACHES-AUTEUR). (1), (2), (9) et (10) avant le premier appel réel ou le premier tirage réel ; (7) avant le premier run publié.

### D6 — Six précisions du §8 remontées par le lot analyse, à écrire dans le protocole avant gel.

**Décision du 2026-09-20 :** Option 1 sur les six points : tronquées incluses dans les métriques primaires plus un quatrième recalcul de robustesse « hors tronquées » ; texte du dénominateur gardé et premisse_fausse interdite sur un item P dès l'engendrement ; Holm retiré de la famille des effets de condition, intervalles et qualificatif seuls publiés ; trois paires pour la famille des formulations ; exactitude globale dans la permutation ; comparateurs alignés sur les assistants.

### D7 — Sept conventions du tirage que le protocole n'écrit pas, retenues au plus restrictif par le lot questions.

**Décision du 2026-09-20 :** Option 1 sur les sept points : item arbitré tirable si la dernière décision du panel vaut maintien ou correction ; Q-ORI sur un item O résolue par l'état en vigueur ; ni Q-FER ni Q-NEG pour une position conditionnelle ; quota par strate fixé dans config/perimetre.yaml ; budget de reprise 80 % étendu aux Q-ATT, stratifiées par thème ; date civile comparée à date_gel à minuit UTC ; gabarits déplacés vers prompts/gabarits-1.0.0.json.

### D8 — Trois points que le §4 ne tranche pas, rencontrés en implémentant la réannotation et le registre des mesures.

**Décision du 2026-09-20 :** Option 1 sur les trois points : héritage des annotateurs gardé, une autre paire supposerait un amendement au §4 disant quel kappa compte ; clé du registre élargie seulement si le §4 ouvre un jour la correction d'autre chose que le thème ; conventions d'identifiant de réannotation et de date par défaut entérinées dans schema/README.md.

### D9 — Durcir le lint au-delà des deux règles de complexité fixées le 2026-09-18 ?

**Décision du 2026-09-23 :** Option 1 : typescript-eslint typé (no-unused-vars, no-floating-promises, no-misused-promises, await-thenable, only-throw-error, switch-exhaustiveness-check, no-unnecessary-type-assertion, no-unnecessary-condition, no-explicit-any, no-non-null-assertion, eqeqeq, no-fallthrough) et ruff C901, F, B. Toujours aucune règle de style.

## Arbre

Légende : couleur par niveau de preuve — T0 gris, T1 ambre, T2 bleu, T3 vert, T4 bleu foncé ; une décision en attente est un hexagone rouge. Arête pleine (`-->`) = dépendance bloquante ; arête pointillée (`-.->`) = dépendance informative seulement.

```mermaid
flowchart LR
  subgraph jalon_J1["J1 · 15 oct. 2026"]
    lot_perimetre_prompts["perimetre-prompts<br/>config/perimetre.yaml et prompts/ versionnés<br/>T1"]:::T1
    lot_protocole["protocole<br/>Protocole (0.20 au 2026-10-19), à geler en v1.0<br/>T1"]:::T1
  end
  subgraph jalon_J2["J2 · 31 oct. 2026"]
    lot_ci["ci<br/>Intégration continue : check et test sur chaque PR<br/>T3"]:::T3
    lot_collecte["collecte<br/>Collecte et archivage : crawl, PDF, yt-dlp, transcription, SHA-256, Wayback<br/>T2"]:::T2
    lot_extraction["extraction<br/>Extraction double, test verbatim, écriture dans staging/<br/>T3"]:::T3
    lot_feuille_de_route["feuille-de-route<br/>Feuille de route générée depuis ce fichier<br/>T2"]:::T2
    lot_mesures_validees["mesures-validees<br/>data/mesures/ promues par pnpm promote, lues en répertoire par symmetry et le gel<br/>T2"]:::T2
    lot_outillage["outillage<br/>ajv sur les exemples de schéma, ESLint à deux règles de complexité<br/>T3"]:::T3
    lot_questions_tirage_symetrie["questions-tirage-symetrie<br/>Gabarits, reformulations, tirage stratifié à graine, pnpm symmetry, invariants inter-fichiers<br/>T2"]:::T2
    lot_schemas["schemas<br/>Schémas JSON et leurs exemples<br/>T2"]:::T2
    lot_validation_interface["validation-interface<br/>Interface de validation humaine, pnpm lots, pnpm promote<br/>T3"]:::T3
  end
  subgraph jalon_J3["J3 · 15 nov. 2026"]
    lot_contestation_notification["contestation-notification<br/>Arbitrage, contestation, décision du panel et notification des campagnes (conformité n° 18)<br/>T2"]:::T2
    lot_dette_validation["dette-validation<br/>Réannotation supersédante, pnpm mesures, logique client extraite vers domaine/<br/>T2"]:::T2
    lot_hors_code["hors-code<br/>Avocat, Zenodo, institutions, annotateurs, panel, image conteneur §9<br/>T0"]:::T0
    lot_reformulation["reformulation<br/>Formulations familière et orientée : staging, relecture humaine, data/formulations/<br/>T2"]:::T2
  end
  subgraph jalon_J4["J4 · 22 nov. 2026"]
    lot_alignement_0_3["alignement-0-3<br/>Aligner analysis/ et pipeline/questions/ sur le protocole 0.3 (D6, D7)<br/>T2"]:::T2
    lot_gel["gel<br/>Écrivain du gel (pnpm geler), graines par balise publique, transitions de statut du run (run:invalider)<br/>T3"]:::T3
    lot_interrogation["interrogation<br/>Appels API, fenêtre 48 h, trois tentatives au plus, réponses brutes immuables, archive Zenodo<br/>T3"]:::T3
    lot_notation["notation<br/>Deux juges, désaccords, échantillon 10 %, test contrefactuel, revue humaine des erreurs graves<br/>T3"]:::T3
    lot_notation_humaine["notation-humaine<br/>Interface locale de notation humaine des réponses : échantillon 10 % / 25 %, arbitrage, désaccord des juges, extrait invalide, erreurs graves, jeu d'or<br/>T2"]:::T2
    lot_test_liens["test-liens<br/>Test HTTP déterministe de l'existence des liens cités (§7, sourçage)<br/>T3"]:::T3
  end
  subgraph jalon_J5["J5 · 1 déc. 2026"]
    lot_analyse["analyse<br/>Métriques §8, bootstrap en grappes, permutation, Holm, robustesse<br/>T2"]:::T2
    lot_go_no_go["go-no-go<br/>Critères go/no-go du §12 et contreseing de la checklist de l'annexe F<br/>T3"]:::T3
    lot_site["site<br/>Site statique généré depuis runs/<br/>T0"]:::T0
  end
  lot_validation_interface --> lot_contestation_notification
  lot_collecte -.-> lot_extraction
  lot_perimetre_prompts --> lot_extraction
  lot_mesures_validees --> lot_gel
  lot_questions_tirage_symetrie --> lot_gel
  lot_reformulation --> lot_gel
  lot_analyse --> lot_go_no_go
  lot_interrogation --> lot_go_no_go
  lot_notation --> lot_go_no_go
  lot_validation_interface -.-> lot_go_no_go
  lot_protocole --> lot_hors_code
  lot_perimetre_prompts --> lot_interrogation
  lot_questions_tirage_symetrie --> lot_interrogation
  lot_dette_validation --> lot_mesures_validees
  lot_interrogation -.-> lot_notation
  lot_perimetre_prompts --> lot_notation
  lot_test_liens --> lot_notation
  lot_notation --> lot_notation_humaine
  lot_test_liens --> lot_notation_humaine
  lot_validation_interface -.-> lot_notation_humaine
  lot_mesures_validees --> lot_reformulation
  lot_perimetre_prompts --> lot_reformulation
  lot_analyse --> lot_site
  lot_go_no_go --> lot_site
  lot_interrogation -.-> lot_test_liens
  classDef T0 fill:#78716c,color:#ffffff,stroke:#44403c
  classDef T1 fill:#b45309,color:#ffffff,stroke:#78350f
  classDef T2 fill:#0369a1,color:#ffffff,stroke:#0c4a6e
  classDef T3 fill:#15803d,color:#ffffff,stroke:#14532d
  classDef T4 fill:#1d4ed8,color:#ffffff,stroke:#1e3a8a
  classDef decision fill:#b91c1c,color:#ffffff,stroke:#7f1d1d
```

## Lots

| Lot | Titre | Jalon | Niveau | État | Agent | Taille | Temps auteur (h) | Dépend de |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| perimetre-prompts | config/perimetre.yaml et prompts/ versionnés | J1 | T1 | débloqué | auteur avec fable | S | 5 | — |
| protocole | Protocole (0.20 au 2026-10-19), à geler en v1.0 | J1 | T1 | débloqué | auteur | S | 4 | — |
| ci | Intégration continue : check et test sur chaque PR | J2 | T3 | atteint | sonnet | S | 0.25 | — |
| collecte | Collecte et archivage : crawl, PDF, yt-dlp, transcription, SHA-256, Wayback | J2 | T2 | débloqué | sonnet | L | 1 | — |
| extraction | Extraction double, test verbatim, écriture dans staging/ | J2 | T3 | atteint | opus | L | 1 | collecte (informe), perimetre-prompts |
| feuille-de-route | Feuille de route générée depuis ce fichier | J2 | T2 | débloqué | sonnet | S | 0.5 | — |
| mesures-validees | data/mesures/ promues par pnpm promote, lues en répertoire par symmetry et le gel | J2 | T2 | bloqué par dette-validation | opus | M | 0.5 | dette-validation |
| outillage | ajv sur les exemples de schéma, ESLint à deux règles de complexité | J2 | T3 | atteint | sonnet puis opus | M | 0.5 | — |
| questions-tirage-symetrie | Gabarits, reformulations, tirage stratifié à graine, pnpm symmetry, invariants inter-fichiers | J2 | T2 | débloqué | opus | L | 2 | — |
| schemas | Schémas JSON et leurs exemples | J2 | T2 | débloqué | fait | S | 0 | — |
| validation-interface | Interface de validation humaine, pnpm lots, pnpm promote | J2 | T3 | atteint | fait | L | 0 | — |
| contestation-notification | Arbitrage, contestation, décision du panel et notification des campagnes (conformité n° 18) | J3 | T2 | débloqué | opus | L | 2 | validation-interface |
| dette-validation | Réannotation supersédante, pnpm mesures, logique client extraite vers domaine/ | J3 | T2 | débloqué | opus pour promote, sonnet pour le reste | M | 1 | — |
| hors-code | Avocat, Zenodo, institutions, annotateurs, panel, image conteneur §9 | J3 | T0 | bloqué par protocole | auteur | L | 24 | protocole |
| reformulation | Formulations familière et orientée : staging, relecture humaine, data/formulations/ | J3 | T2 | bloqué par mesures-validees, perimetre-prompts | opus | L | 2 | mesures-validees, perimetre-prompts |
| alignement-0-3 | Aligner analysis/ et pipeline/questions/ sur le protocole 0.3 (D6, D7) | J4 | T2 | débloqué | opus | M | 0.5 | — |
| gel | Écrivain du gel (pnpm geler), graines par balise publique, transitions de statut du run (run:invalider) | J4 | T3 | atteint | opus | L | 1 | mesures-validees, questions-tirage-symetrie, reformulation |
| interrogation | Appels API, fenêtre 48 h, trois tentatives au plus, réponses brutes immuables, archive Zenodo | J4 | T3 | atteint | opus | M | 1 | perimetre-prompts, questions-tirage-symetrie |
| notation | Deux juges, désaccords, échantillon 10 %, test contrefactuel, revue humaine des erreurs graves | J4 | T3 | atteint | opus | L | 2 | interrogation (informe), perimetre-prompts, test-liens |
| notation-humaine | Interface locale de notation humaine des réponses : échantillon 10 % / 25 %, arbitrage, désaccord des juges, extrait invalide, erreurs graves, jeu d'or | J4 | T2 | débloqué | sonnet | L | 2 | notation, test-liens, validation-interface (informe) |
| test-liens | Test HTTP déterministe de l'existence des liens cités (§7, sourçage) | J4 | T3 | atteint | opus | M | 1 | interrogation (informe) |
| analyse | Métriques §8, bootstrap en grappes, permutation, Holm, robustesse | J5 | T2 | débloqué | opus | L | 1 | — |
| go-no-go | Critères go/no-go du §12 et contreseing de la checklist de l'annexe F | J5 | T3 | atteint | opus | M | 1 | analyse, interrogation, notation, validation-interface (informe) |
| site | Site statique généré depuis runs/ | J5 | T0 | bloqué par analyse | sonnet | M | 2 | analyse, go-no-go |

## Jalons

| Jalon | Date | Titre | Critère |
| --- | --- | --- | --- |
| J1 | 2026-10-15 | Protocole v1.0 gelé, relu par un avocat, déposé sur Zenodo, transmis aux institutions | Empreinte et DOI publiés ; liste nominative des outils et des candidats du premier run publiée |
| J2 | 2026-10-31 | Schéma, interface de validation, collecte et archivage en production | 100 items T1 archivés et extraits ; test verbatim et tests de symétrie verts en intégration continue |
| J3 | 2026-11-15 | Annotateurs formés ; 200 items vérifiés ; panel constitué ou faiblesse déclarée | Kappa ≥ 0,80 sur les deux derniers lots |
| J4 | 2026-11-22 | Run pilote complet ; jeu d'or de 300 réponses | Kappa juge-humain ≥ 0,75 ; taux de changement contrefactuel ≤ 3 % |
| J5 | 2026-12-01 | Premier run public mensuel | Tous les critères précédents ; au moins 8 candidats au-dessus du seuil de couverture |

### J1

- perimetre-prompts (T1)
- protocole (T1)

### J2

- ci (T3)
- collecte (T2)
- extraction (T3)
- feuille-de-route (T2)
- mesures-validees (T2)
- outillage (T3)
- questions-tirage-symetrie (T2)
- schemas (T2)
- validation-interface (T3)

### J3

- contestation-notification (T2)
- dette-validation (T2)
- hors-code (T0)
- reformulation (T2)

### J4

- alignement-0-3 (T2)
- gel (T3)
- interrogation (T3)
- notation (T3)
- notation-humaine (T2)
- test-liens (T3)

### J5

- analyse (T2)
- go-no-go (T3)
- site (T0)

## Échelle de preuve

| Niveau | Définition |
| --- | --- |
| T0 | absent : rien n'existe |
| T1 | écrit, sans vérification automatique |
| T2 | testé unitairement, cas limites couverts |
| T3 | testé de bout en bout sur fixtures |
| T4 | exercé sur données réelles |

## Anomalies relevées

- README.md est encodé en UTF-16 avec BOM et ne contient qu'un titre. Encodage réglé le 2026-09-23 (bc6b3e7, lot 1 de la revue : UTF-8, fins de ligne LF) ; le contenu reste un titre seul (revue du 2026-10-12, constat 55).
- CLAUDE.md promet cinq commandes absentes de package.json : symmetry, run:dry, run:live, analyze, build:site. Au 2026-10-12, symmetry et run:dry existent ; run:live, analyze et build:site manquent toujours (revue du 2026-10-12, constat 54).
- L'annexe A du protocole montre l'identifiant 2027-LEP-FISC-0012, contredit par la convention d'identifiants opaques de schema/README.md. Réglé le 2026-09-25 par le protocole 0.11 (7f60986), et gardé depuis par tests/protocole-annexe-a.test.ts.
- Le suivi du taux de « non évaluable » par annotateur était donné pour manquant par docs/DETTE.md alors qu'il était implémenté depuis le 2026-09-17 : entrée corrigée le 2026-09-19.
- schema/commun.schema.json, $defs/theme : la description dit qu'une position hors des dix thèmes « est enregistrée mais n'entre pas dans le tirage », alors que le §3 (0.11) dit qu'elle n'est pas enregistrée. Relevé le 2026-10-12.
