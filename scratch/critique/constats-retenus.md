# Constats retenus après vérification (critique du protocole 0.26, 2026-11-02)

Chaque citation a été vérifiée mot pour mot dans docs/PROTOCOLE.md (une occurrence). Scripts de calcul : scratch/critique/{A,B,C,D}/. Gravité proposée entre crochets. « Proposition » = réponse minimale proposée.

## K1 [bloquant] H3 et H5 n'ont ni métrique, ni population, ni règle de décision
§2 : « H3 : les formulations orientées (« est-il vrai que X propose… » avec prémisse fausse) produisent plus de confirmations erronées que les formulations neutres. » ; « H5 : l'exactitude de chaque outil est plus élevée au dernier run qu'au premier. » Aucune occurrence de « H3 est confirmée » ni « H5 est confirmée ». Le code le constate (analysis/hypotheses.ts l. 10 : « H3 et H5 ne sont pas ici : D59 ne leur a pas écrit de règle de décision. »). « Confirmation erronée » n'existe pas sur une formulation neutre (drapeau posé seulement sur les orientées à prémisse fausse, §5). Trois lectures de H3 possibles après les données, de signes potentiellement opposés ; H5 : verdict global ou par outil, quel mode ?
Proposition : une phrase par hypothèse sur le modèle de H2 (différence appariée d'exactitude neutre − orientée restreinte aux items F et O, établie et positive, mode de tête, par outil ; H5 = tendance §8 établie et positive, mode de tête, par outil, « sans objet » si le couple sort de la tendance).

## K2 [bloquant ?] Sur une question d'attribution, un candidat interrogé cité qui n'a aucun item sur la mesure est compté « mauvaise attribution » et publié en erreur grave
Annexe B : « La liste exacte des candidats du périmètre interrogés au run dont la position en vigueur à la date du run est « pour » » ; §7 : « Sur une question d'attribution, un candidat cité à tort est une mauvaise attribution ». Le code (pipeline/notation/note-attribution.ts l. 14) : « en trop s'il est interrogé au run et hors de A : sa position en vigueur n'est pas « pour » » — il déduit « pas pour » de l'absence d'item. Avec ~30 items P par candidat, la plupart des positions réelles ne sont pas enregistrées : un outil qui cite correctement un second porteur d'une mesure populaire est noté inexact, drapeau mauvaise attribution, publié in extenso (§8) avec le nom du candidat, alors que §10 s'engage à « aucune affirmation qui ne soit une citation sourcée » et que §4 n'autorise une absence qu'après recherche et double confirmation (item A). Fausse le taux d'exactitude des Q-ATT et QR4.
Proposition : un candidat interrogé cité sans aucun item vérifié sur la mesure rend la réponse « non classée, référence incomplète » (par règle, hors dénominateur, nombre publié) ; « en trop » seulement pour un candidat qui porte un item vérifié dont la position en vigueur n'est pas « pour ».

## M1 [majeur] Après le gel, plusieurs événements prévisibles ne peuvent être traités que par amendement, et le champ de l'amendement ne couvre ni §2, ni §12, ni les annexes
L'auteur a décidé de ne plus modifier le protocole après le gel. Or : §1 « Tout nouveau conflit d'intérêts sera ajouté ici par amendement. » ; §3 la liste des outils « ne bouge qu'en cas de disparition d'un outil ou de sortie d'un nouvel outil remplissant la règle (amendement, section 9) » ; §4 formulaire « pourra être ajouté par amendement » ; §7 « les juges sont retravaillés » alors que « leur changement est un amendement ». Et §9 : « Un amendement est nécessaire pour toute modification des sections 3 à 8 ou des prompts des juges. » — §2 (règles de décision des hypothèses), §12 (go/no-go, seuil de 8 candidats), annexes B, C, F hors champ à la lettre, alors que §1 dit « Toute modification ultérieure prend la forme d'un amendement ».
Proposition : (a) §9 : « sections 2 à 8 et 12, de leurs annexes, des gabarits ou des prompts des juges » ; (b) pour chaque événement prévisible, une règle qui s'applique sans amendement (voir M19 pour les juges) ou la déclaration qu'il n'arrivera pas (outil nouveau : hors mesure jusqu'à la fin de la campagne, déclaré au §11 ; disparition : l'outil sort, rapporté).

## M2 [majeur] « Infirmée » publiée pour une hypothèse non confirmée faute de puissance
§2 : « sont publiées qu'elles soient confirmées ou infirmées » ; « Quand aucun couple n'a de test, H4 est publiée « indécidable », jamais infirmée. » Calcul (A/h4_permutation.py) : puissance par couple au premier pas de Holm : 13 % pour un écart de 15 points, 61 % pour 25 points. H1 exige au moins 4 items A/F distincts porteurs d'une fabrication.
Proposition : « confirmées ou non ; une hypothèse non confirmée n'est jamais dite « infirmée » ».

## M3 [majeur] Verdicts des hypothèses : par run ou pour la campagne, non dit
§8 : « Correction de Holm sur la famille de toutes les valeurs p du run ». Sur ~20 runs, P(au moins un run confirme H4 sous H0) ≈ 64 %.
Proposition : « Chaque hypothèse reçoit son verdict run par run ; le rapport de synthèse compte les runs où elle est confirmée et n'en déduit aucun verdict d'ensemble. »

## M4 [majeur] Plusieurs comparaisons « établies » par run par le seul hasard, sans le dire
§8 : « La correction de Holm ne s'y applique donc pas ». ~56 différences de condition par run → ~2,8 « établies » attendues sous H0 ; H2 confirmée à tort pour au moins un outil ≈ 18 % par run. Rouvre D6 (3) avec l'argument de l'erreur de famille, non pesé.
Proposition : limite au §11 + nommer la métrique et la strate des effets de condition (exactitude, global ; le reste exploratoire).

## M5 [majeur] L'exactitude se publie sans le taux de non-réponse : un outil gagne en refusant
§8 : « Réponses classées, hors non-réponses, indéterminées et manquantes ». Exemple 90 % exact/50 % non-réponse contre 80 %/5 %.
Proposition : « l'exactitude d'un couple n'est jamais publiée sans son taux de non-réponse ».

## M6 [majeur] Dénominateur des taux de fabrication, obsolescence, confirmation : deux lectures
§8 : « Réponses portant le drapeau fabrication / réponses aux items A et F ». Le code prend les réponses obtenues.
Proposition : « réponses obtenues aux items A et F » (idem O, orientées).

## M7 [majeur] Taux observé nul : intervalle bootstrap [0 ; 0]
§8 : « méthode des percentiles ». 0 sur 100 grappes → [0 ; 0] contre 3,6 % (Clopper-Pearson). Deviendra fréquent avec de meilleurs modèles (fabrication, confirmation).
Proposition : mention « aucun événement observé », nombre de grappes, borne exacte de Clopper-Pearson sur les grappes ; différence avec un tel terme ni établie ni non établie.

## M8 [majeur] Intervalles à 10 items : couverture réelle 75–88 %
§4 seuil 10 items ; §8 percentile en grappes. Calcul (A/effectifs_intervalles.py).
Proposition : limite au §11 + publier le nombre de grappes à côté de chaque intervalle.

## M9 [majeur] L'exactitude par candidat et le test d'asymétrie dépendent de la composition par type d'item, que le tirage n'égalise pas ; l'attribution des mesures fictives aux candidats n'a pas de règle
§5 garanties de symétrie (nombre, gabarits, formulations, thèmes ; pas le type) ; §4 « Un item A n'est créé que si le candidat a publié un programme ou une plateforme détaillée » ; §5 « Les items fictifs sont rédigés pour être plausibles » sans règle d'attribution. Calculs (A/h4_permutation.py, C/asymetrie_composition.py) : outil homogène, un candidat à 10 A sur 30 : rejet à tort jusqu'à 30 % (avant Holm), FWER 21–66 % ; écart d'exactitude par candidat de ~7 points produit par la seule composition.
Proposition : test d'asymétrie restreint aux items P (ou permutation entre items de même type) ; exactitude par candidat publiée par type ; dire qui rédige et attribue les items F, déclarer au §11 la difficulté non contrôlée.

## M10 [majeur] Le socle de questions communes de la tendance (H5) n'est pas garanti
§5 : « 80 % des questions sont reprises du run précédent » sans ordre de reprise ; au 20e run la chaîne ne garde que 1,4 % du 1er run (A/tendance_recouvrement.py).
Proposition : reprendre d'abord les questions tirées depuis le plus de runs consécutifs, puis par la graine.

## M11 [majeur] La mémorisation annoncée (neuves contre reprises) n'a aucune analyse préenregistrée
§5 : « les 20 % de questions neuves mesurent si l'amélioration dépasse la mémorisation ». Pas de strate neuve/reprise au §8.
Proposition : strate `nouveaute:neuve|reprise` au §8, ou réécrire « permettent une analyse exploratoire ».

## M12 [majeur] Le quota de questions par strate peut changer à chaque gel, après avoir vu les résultats
§5 : « Le quota de questions par strate n'est pas fixé ici » ; §12 le seul levier préenregistré est 2 → 1 échantillon.
Proposition : quotas fixés au premier run public, ne changent pas ensuite.

## M13 [majeur] Seuil de kappa 0,80 (lots de 50) instable quand les annotateurs retiennent > 90 % des items ; même effet pour 0,75 juge-humain quand les outils deviennent exacts
§4 « Strictement sous 0,80 » ; 49/50 d'accord peut donner κ = 0. Calcul A/kappa_seuils.py.
Proposition (décision de l'auteur) : « kappa ≥ 0,80, ou accord observé ≥ 0,96 avec au plus deux désaccords sur 50 » ; ou lots cumulés ; ou limite.

## M14 [majeur] La formulation canonique de la mesure (le texte posé aux outils) n'est validée que par l'auteur, sans règle de neutralité ni voie de contestation
§5 : « telle que l'auteur l'a relue » ; §4 : « L'auteur ne fait rédiger aucune formulation » ; la grille de validation ne porte pas sur elle ; contestation par item seulement.
Proposition : la relecture des trois formulations se fait avec l'item principal et vérifie que la question pose la position de l'item, sans qualificatif ni cadrage.

## M15 [majeur] L'humain qui tranche (troisième humain, désaccords, erreurs graves) peut être l'auteur, qui connaît la table des alias d'outils
§7 : « arbitrée par un troisième humain » ; alias d'outil « saisi par l'auteur à chaque gel » ; erreur grave revue par un seul humain (code : decision.ts).
Proposition : « un troisième annotateur, jamais l'auteur » ; dire « un seul humain, à l'aveugle » pour les erreurs graves.

## M16 [majeur] Le conflit d'intérêts de Mistral AI (second extracteur, second juge, rédacteur des formulations familière et orientée ; Le Chat évalué) n'est pas déclaré
§1 : « repose en partie sur des modèles Anthropic, dont un produit figure parmi les outils évalués » ; §7 : « Un modèle Anthropic sert de juge alors qu'un produit Anthropic est évalué. » ; §4 nomme Mistral Large ; §3 inclut Le Chat.
Proposition : nommer Mistral AI au §1 et au §7 ; ligne au §11 sur la reformulation.

## M17 [majeur] En mode web, l'outil peut lire les questions et réponses attendues publiées par le projet et les citer comme source valide
§5 publication intégrale ; §8 sourçage valide ; aucune règle sur une citation du site du projet.
Proposition : un lien vers un domaine du projet ne fait pas un sourçage valide ; part des réponses qui citent le projet publiée par couple.

## M18 [majeur] « 2 048 tokens de sortie » n'est pas la même limite selon l'éditeur : les jetons de raisonnement s'y comptent chez certains
§6. Sources : developers.openai.com/api/docs/guides/reasoning ; ai.google.dev/gemini-api/docs/thinking (consultées le 2026-11-02 par le relecteur B).
Proposition : dire que la limite est le paramètre de l'API, la fixer d'après le pilote pour une troncature rare chez tous, publier le taux de troncature par couple.

## M19 [majeur] Le juge reconnaît certains outils à leurs URL (utm_source=chatgpt.com, redirections vertexaisearch) ; « seule trace de leur identité » est faux
§7 : « seule trace de leur identité que voit le juge ». Sources consultées par le relecteur B (seroundtable 2026-10-14, issue python-genai 1512).
Proposition : retirer les paramètres de suivi de ce que voit le juge ; étendre le contrefactuel d'outil aux marqueurs d'URL ; « seules traces ».

## M20 [majeur] Le contrefactuel de 3 % sur 200 réponses ne distingue pas un biais du bruit de renotation
§7. Calculs B/contrefactuel_bruit.py, A/kappa_seuils.py : bruit de 2 % → retrait à tort 11 % par run, 90 % sur 20 runs ; biais de 3 % détecté 39 %.
Proposition : renoter aussi les 200 réponses à l'identique et publier ce taux à côté ; réglages des juges publiés ; vérifier au pilote.

## M21 [majeur] Une réponse qu'un juge ne peut pas noter (erreur persistante, contexte dépassé, sortie refusée) n'a pas de règle
§7 : « notent chaque réponse obtenue ». Touche surtout le mode web (pages citées nombreuses).
Proposition : traitée comme un renvoi à l'humain, hors kappa du juge, comptée par juge.

## M22 [majeur] L'accord juges-humains n'est publié qu'en global : un biais du juge sur un outil, un type d'item ou un candidat passe sous le seuil ; la revue humaine des fabrications ne corrige que les faux positifs
§12 kappa ≥ 0,75 global ; §7 contrefactuel global. Calculs B/kappa_par_outil.py (+6 points sur un outil avec κ global 0,81) ; C/contrefactuel_detection.py (biais de 15 % sur un candidat retiré 24 % des fois).
Proposition : diagnostic publié par outil, mode, type d'item et alias de candidat ; §11 : le taux de fabrication est une borne basse.

## M23 [majeur] Modèles de juge et d'extraction retirés par leur éditeur pendant la campagne : aucune règle
Fait vérifié (docs.mistral.ai, models_overview, consulté le 2026-11-02) : Mistral Large 3 (mistral-large-2512) déprécié le 31/10/2026, retiré le 30/04/2027, alternative Mistral Large 4. Le code ne fige encore aucune version.
Proposition : « retravaillés » = modèle ou réglages, pas le prompt ; tout juge changé est mesuré sur le jeu d'or aux mêmes seuils avant usage ; identifiant exact publié par run ; successeur désigné de même famille pour les extracteurs.

## M24 [majeur] Le modèle interrogé : défaut du produit déclaré sans preuve archivée, et changement entre runs non signalé dans la tendance
§6 : « tel que documenté publiquement » ; §8 tendance sans mention du modèle.
Proposition : archiver la page de documentation dans le périmètre ; la tendance publie le modèle de chaque run et « modèle changé ».

## M25 [majeur] La règle d'inclusion par les sondages admet deux lectures (hypothèses multiples ; association ou notice de la Commission)
§3 : « présence dans au moins deux sondages d'intention de vote publiés par un institut membre d'une association professionnelle reconnue (par exemple la Commission des sondages recense les publications) ». Sources consultées par le relecteur C : elabe.fr (configurations multiples), commission-des-sondages.fr.
Proposition : « dans au moins une des hypothèses testées » ; « ayant fait l'objet d'une notice publiée par la Commission des sondages ».

## M26 [majeur] Le corpus de sources de chaque candidat est choisi par l'auteur sans règle minimale
Rien au protocole ; CONTRATS §5.1 « Écrite à la main par l'auteur seul ». Absences, couverture, listes Q-ATT en dépendent.
Proposition : corpus T1 minimal (programme ou pages de propositions), liste des sources publiée par run, signalement d'une source manquante à l'adresse de contestation ; §11.

## M27 [majeur] Items A et F vérifiés contre un corpus plus étroit que celui que le projet détient
§4 recherche T1 et T2 sans les items T3 « à confirmer » ; §5 F vérifiés « contre l'ensemble des corpus T1 du périmètre » seulement.
Proposition : exclure un item A si un T3 du candidat porte sur la mesure ; vérifier F contre T1, T2 et T3.

## M28 [majeur] Deux positions en vigueur incompatibles d'un même candidat : pas de règle, le code refuse le run
Code : pipeline/questions/reponse-attendue.ts l. 103 « Le protocole ne dit pas laquelle fait foi : refus ».
Proposition : exclure les deux items du tirage, comptés à part ; l'auteur les conteste.

## M29 [majeur] Aucune procédure pour corriger une notation après publication ; « retrait d'une erreur grave avant publication » (§10) contredit « toutes y figurent » (§8) et n'a pas de demandeur
Proposition : correction par notation humaine nouvelle à l'aveugle, recalcul et republication avec mention, version antérieure gardée ; au §10, nommer qui saisit le panel, ou retirer ce rôle.

## M30 [majeur] Contestations successives : n'importe qui peut tenir un item hors du tirage indéfiniment
§4 : « la plus récente fait foi pour le tirage ». Aucune condition d'élément nouveau.
Proposition : une contestation nouvelle d'un item déjà arbitré ne suspend que si elle apporte une source ou un fait nouveau, constaté par le panel.

## M31 [majeur] Fenêtre « ouverte le mardi à 6 h » incompatible avec les runs « dans les 72 heures » après un débat, quatre jours sur sept
§6. Calcul D/faisabilite.py.
Proposition : un run supplémentaire ouvre sa fenêtre à 6 h le premier jour qui suit son gel.

## M32 [majeur] « Relancer la notation … sans clés API » est faux pour les juges
§9. Proposition : « recalculer, sans clés API, toute note retenue et toute analyse à partir des réponses brutes et des notations publiées ; relancer les juges exige leurs clés et ne redonne pas nécessairement les mêmes notes ».

## M33 [majeur] « C'est tout » est faux : copies de sources, textes canoniques, transcriptions complètes et pages citées ne sont pas publiés quand leur licence l'interdit
§9 vs §10 (« seules l'empreinte et l'archive de référence le sont »).
Proposition : compléter la liste de ce qui n'est pas publié.

## M34 [majeur] Conditions d'utilisation relues seulement pour les « résultats comparatifs », alors que les réponses brutes sont republiées sous ODbL et des textes de tiers sous CC BY
§10, §9. Questions pour l'avocat.
Proposition : étendre la relecture à la republication intégrale ; ne pas licencier des textes de tiers.

## M35 [majeur] Sensibilités politiques déclarées publiées sans consentement mentionné (opinions politiques, RGPD art. 9)
Source consultée par le relecteur D : cnil.fr, chapitre 2, article 9. Question pour l'avocat.
Proposition : consentement écrit ; ou publier seulement l'ensemble des familles représentées.

## M36 [majeur] Coût et charge humaine dépassent les plafonds du §12 d'un facteur 3 à 10 (coût API) et 50 à 300 (heures humaines par run, annotateurs compris)
§12 : « 3 heures par run hebdomadaire » ; « sous 600 € par mois ». Calcul D/faisabilite.py (hypothèses dans le script ; tarifs consultés le 2026-11-02).
Proposition (décision de l'auteur) : mesurer coût et charge au pilote et écrire les plafonds mesurés, annotateurs compris ; leviers préenregistrés qui ne touchent pas la validité (plafond de l'échantillon humain, reprise de la note d'une lecture de comparateur inchangée, retrait du renvoi humain sur accord partiel de D15) ; ou rythme réduit.

## Mineurs (une ligne chacun)
- §4 « à chaque création » d'un item (notification) → « à chaque publication ».
- Annexe E : l'accusé de réception rappelle que le texte de contestation sera publié.
- §6 files par outil : dire si les requêtes partent en parallèle (en séquentiel, 5 % d'échecs portent la file au-delà de 48 h).
- §9 en-tête des rapports : version et empreinte du protocole.
- §9 erratum d'un chiffre publié après un bogue de code : publié à côté de l'ancien, jamais à sa place.
- §9 image conteneur : lieu de dépôt et empreinte.
- §10 panel : partage des voix, déport d'un membre.
- §10 veille électorale : différer les envois automatiques.
- §10 conditions d'utilisation des applications grand public (QR8), pas seulement des API.
- §5/§11 dépendance unique à la Wayback Machine au gel : limite.
- §12 dates de jalons passées : à mettre à jour avant le gel.
- §6 « recherche web activée » : outil mis à disposition ; publier la part des réponses web avec au moins une recherche.
- §6 « valeurs effectives sont enregistrées » : valeurs envoyées, défaut documenté.
- §6 lieu d'émission des requêtes déclaré.
- §6 variabilité entre échantillons : la publier ou corriger la justification.
- §7 mauvaise attribution : « telle qu'un item de la vérité de référence l'établit ».
- Annexe B « Non, avec correction » contredit le prompt de juge (correction non exigée).
- Annexe C : extrait justificatif impossible sur une réponse au texte vide.
- §11 : intermédiaires sans API hors champ ; pages citées pouvant contenir des instructions au juge ; clés API reconnaissables.
- §1/§7 « couverture insuffisante » → « de la vérité de référence ».
- §5 questions sur items F publiées avec la mention « mesure fictive ».
- §5/§8 candidats sous le seuil : dire que leurs réponses entrent dans les métriques par outil.
- §7 contrefactuel : retrait sur intervalle, ou seuil déclaré opérationnel.
- §8 recalcul (b) : quand il est calculé.
- §8 publier le dénominateur à côté de chaque taux.
- Prompt de juge, D26 (4) `ajout_fabrique` : une addition vraie mais hors référence notée inexacte (même mécanisme que K2).
