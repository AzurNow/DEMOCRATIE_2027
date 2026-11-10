# Calculs de la passe « hypotheses-structurantes » — 2026-11-10

Sous-agent « calculs ». Dépôt : `/Users/azur_now/Code/PROJETS_CODE/DEMOCRACIE_2027`, branche `docs/fondations-2026-11-10`, protocole 0.34
(numéros de ligne du 2026-11-10). Scripts : `scratch/fondations/2026-11-10/` (stdlib Python 3.12, un fichier par calcul, paramètres communs
dans `parametres.py`, chaque hypothèse avec sa source). Sorties brutes recopiées dans ce répertoire (`c1_sortie.txt`, …). Aucun assistant IA
interrogé ; aucun nom de candidat ni de parti.

Conventions : **PARAMÈTRE** = chiffre inconnu posé en fourchette (min, max), jamais une valeur silencieuse ; « jeu bas » = bornes basses de
toutes les fourchettes, « jeu haut » = bornes hautes (les deux extrêmes sont donc peu probables ensemble) ; « lu » = lu sur la page officielle le
2026-11-10 ; « extrait » = page officielle refusée au fetch (HTTP 403), lue dans l'extrait du moteur de recherche.

---

## C1. Calendrier réaliste et runs avant le premier tour (H6)

**Question.** Quand le premier run public peut-il avoir lieu, selon la disponibilité de l'auteur, et combien de runs du calendrier du §6 restent
alors avant le premier tour et le second tour ?

**Données et hypothèses.**
- Dates vérifiées le 2026-11-10 : premier tour **dimanche 18 avril 2027**, second tour **dimanche 2 mai 2027** (service-public.gouv.fr, actualité
  A15053, publiée le 2026-07-02 après le Conseil des ministres du 2026-07-01 ; la page ne dit rien du décret ni de la liste officielle). Clôture des
  parrainages **vendredi 12 mars 2027 à 18 h** et liste officielle **au plus tard le vendredi 26 mars 2027** (info.gouv.fr, page
  « election-presidentielle-2027 », lue en extrait, fetch refusé ; maire-info.com du 2026-09-04, lu : « au plus tard le quatrième vendredi avant le
  scrutin, soit le 26 mars »). Décret de convocation au plus tard le 7 février 2027 (maire-info : « au moins dix semaines avant »). Campagne
  officielle le 5 avril 2027 (info.gouv.fr, extrait). Le protocole §3 (ligne 94) dit seulement « mars 2027 » ; borne basse posée en PARAMÈTRE :
  13 mars (lendemain de la clôture).
- Veille électorale §10 (ligne 374) : aucune publication du 17 avril 0 h au 18 avril au soir, ni du 1er mai 0 h au 2 mai au soir.
- Calendrier §6 (lignes 234 et 247) : fenêtres de 48 h ouvertes le mardi à 6 h ; mensuel décembre–janvier (PARAMÈTRE de lecture : premier mardi du
  mois), hebdomadaire de février au second tour ; runs supplémentaires sous 72 h après la liste officielle et après chaque débat (PARAMÈTRE : 1 à 3
  débats, le débat d'entre-deux-tours étant le seul certain).
- Heures de l'auteur : `temps_auteur_h` de chaque lot non T4 de `docs/feuille-de-route.json` (58,25 h au total, dont `hors-code` 24 h,
  `perimetre-prompts` 5 h, `protocole` 4 h, `creation-items-f` 3 h), plus des PARAMÈTRES pour ce qu'aucun lot ne porte (décisions en attente 2–4 h,
  clés API et corps d'erreur 2–4 h, `CONTROLE-MANUEL` 3–6 h, pilote 4–8 h, premier run 4–8 h, sources 2–4 h, relecture des mesures du §4 à 1–2 min
  par mesure). Total simulé : 77 h (bas) à 108 h (haut).
- Heures d'annotateurs : 5 à 15 min par item et par annotateur (brief), 2 à 5 min par notation de réponse (faisabilite.py posait 2–3), 1 à 2 min
  par question relue sous ses trois formulations ; 200 items (J3) ou 400 (§5) à valider, 20 % de lots réannotés au pire ; 300 réponses du jeu
  d'or × 2 humains + 20 % d'arbitrage ; échantillon de 10 % du premier run × 2 humains. Capacité : 2 annotateurs × 5 ou 10 h/semaine (PARAMÈTRE).
- Délais incompressibles (PARAMÈTRES) : avocat 14–42 j (démarre quand la 0.35 est écrite), recrutement 14–28 j (démarre maintenant), adaptateurs
  réels 7–14 j, site de résultats (lot `site` T0) 7–21 j, code de D85/D94/D95 3–7 j, Wayback + Zenodo 1–2 j, liens + juges 1–3 j après la fenêtre.
- Ordonnanceur : l'auteur et le pool d'annotateurs font une chose à la fois ; une tâche démarre quand ses dépendances sont finies ; un run démarre le
  mardi suivant. Le pilote exige items validés, formulations relues, adaptateurs, décisions codées ; le premier run public exige le pilote, le jeu
  d'or, le gel 1.0 (donc l'avocat) et le site ; sa publication exige l'échantillon humain de 10 % (go/no-go §12).

**Scripts.** `scratch/fondations/2026-11-10/c1_calendrier.py` (sortie : `c1_sortie.txt`).

**Résultat C1a (dates et calendrier complet).** 159 jours (22,7 semaines) entre le 2026-11-10 et le premier tour. Le calendrier du §6 compte, à
partir du 1er décembre, **15 runs réguliers** : 2 mensuels (2026-12-01, 2027-01-05) et 13 hebdomadaires (2027-02-02 → 2027-04-27), dont **13 dont
la fenêtre ferme avant la veille du premier tour** ; le dernier avant le premier tour ouvre le mardi 13 avril (fermeture jeudi 15 avril 6 h,
publication possible jusqu'au vendredi 16 avril minuit). Les runs supplémentaires possibles : 1 (liste officielle, entre le 13 et le 26 mars) + 1 à
3 (débats).

**Résultat C1c (dates simulées).** Colonnes : disponibilité de l'auteur (h/semaine), capacité des annotateurs (h/semaine, pool), items validés
avant le pilote, jeu d'hypothèses, heures totales, mardi du pilote, mardi du premier run public, date de publication de ce run, runs réguliers
dont la fenêtre ferme avant le premier tour / le second tour, runs supplémentaires, runs disponibles pour H5, runs qui suivent la première
publication (occasions de correction pour un éditeur).

| auteur h/sem | annot h/sem | items | jeu | h auteur | h annot | pilote (mardi) | 1er run public (mardi) | publication | runs rég. avant T1 | avant T2 | supp. | runs pour H5 | runs pour un éditeur |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 10 | 200 | bas | 77 | 493 | 2027-02-23 | 2027-03-23 | 2028-01-17 | 4 | 6 | 1 | 7 (H5 possible) | 6 |
| 5 | 10 | 400 | haut | 108 | 1658 | 2027-09-14 | 2027-11-09 | 2030-05-11 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |
| 5 | 20 | 200 | bas | 77 | 493 | 2027-02-02 | 2027-02-23 | 2027-07-27 | 8 | 10 | 2 | 12 (H5 possible) | 11 |
| 5 | 20 | 400 | haut | 108 | 1658 | 2027-05-25 | 2027-06-29 | 2028-10-05 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |
| 10 | 10 | 200 | bas | 77 | 493 | 2027-01-12 | 2027-02-02 | 2027-11-25 | 11 | 13 | 2 | 15 (H5 possible) | 14 |
| 10 | 10 | 400 | haut | 108 | 1658 | 2027-08-10 | 2027-09-28 | 2030-03-22 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |
| 10 | 20 | 200 | bas | 77 | 493 | 2026-12-29 | 2027-01-12 | 2027-06-11 | 11 | 13 | 2 | 15 (H5 possible) | 14 |
| 10 | 20 | 400 | haut | 108 | 1658 | 2027-04-20 | 2027-05-18 | 2028-08-16 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |
| 20 | 10 | 200 | bas | 77 | 493 | 2027-01-05 | 2027-01-26 | 2027-11-17 | 11 | 13 | 2 | 15 (H5 possible) | 14 |
| 20 | 10 | 400 | haut | 108 | 1658 | 2027-08-03 | 2027-09-21 | 2030-03-15 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |
| 20 | 20 | 200 | bas | 77 | 493 | 2026-12-22 | 2027-01-05 | 2027-06-03 | 12 | 14 | 2 | 16 (H5 possible) | 15 |
| 20 | 20 | 400 | haut | 108 | 1658 | 2027-04-13 | 2027-05-11 | 2028-08-09 | 0 | 0 | 0 | 0 (H5 sans objet) | 0 |

Chemin critique détaillé (auteur 10 h/sem, annotateurs 16 h/sem, jeu haut, 400 items) : 0.35 écrite le 12 nov. ; avocat jusqu'au 24 déc. ;
recrutement jusqu'au 8 déc. ; formation jusqu'au 5 janv. ; **validation des 400 items du 5 janv. au 20 avril (240 h d'annotateurs)** ; items F et
reformulations jusqu'au 16 mai ; pilote le mardi 18 mai ; jeu d'or (55 h) jusqu'au 19 juin ; premier run public le mardi 22 juin 2027 ;
**échantillon humain de 10 % du premier run : 3 234 réponses × 2 humains + arbitrages = 1 285 h**, publication en janvier 2029. Dans le jeu bas,
la même couche vaut 417 h (3 234 × 2,2 × 2 min + 15 % de désaccords × 2 min + 18 h de comparateurs).

**Borne de capacité (C1c ter).** Au périmètre complet et au quota 1 (490 questions × 3 formulations × 2 échantillons × 11 couples =
**32 340 réponses par run**), la notation humaine exigée par le §7 vaut par run : 453 h (jeu bas : 2 min par notation, 15 % de désaccords des
juges, 5 % d'accords partiels) à 1 536 h (jeu haut : 5 min, 25 %, 10 %), plus 18 h de lectures de comparateurs. Avec 10 à 20 h d'annotateurs par
semaine : **0,01 à 0,04 run publiable par semaine**, contre 1 run par semaine exigé à partir de février (§6).

**Ce que le résultat permet de conclure.**
- La date de la *fenêtre* du premier run public dépend surtout de la capacité des annotateurs (validation des items, 33 à 240 h) et du jeu
  d'hypothèses, moins des heures de l'auteur : à 200 items et jeu bas, elle tombe entre le 5 janvier (20 h/sem auteur, 20 h/sem annotateurs) et le
  23 mars 2027 (5 et 10 h/sem) ; à 400 items et jeu haut, après le premier tour dans tous les scénarios (11 mai → 9 novembre 2027).
- La *publication* de ce premier run est gouvernée par l'échantillon humain de 10 % : 417 à 1 285 h pour un seul run, soit 5 à 8 mois au jeu bas
  avec 10 à 20 h/sem. Les colonnes « runs avant T1 » comptent donc des fenêtres d'interrogation possibles, pas des publications : avec la capacité
  posée, aucun run n'est publiable avant le premier tour au périmètre complet, et le rythme hebdomadaire du §6 exige 25 à 150 fois la capacité posée.
- H5 (premier contre dernier run) et la correction par un éditeur supposent au moins deux runs *publiés* : au périmètre complet, le calcul ne les
  rend possibles dans aucun scénario avant le second tour.

**Ce qu'il ne permet pas de conclure.** Les deux jeux cumulent toutes les bornes basses ou hautes à la fois ; la vérité est entre les lignes. La
capacité des annotateurs (5 à 10 h/sem chacun) et les 2 à 5 min par notation sont des PARAMÈTRES que le pilote mesurera (§12). L'ordonnanceur
sérialise le travail ; un troisième annotateur, ou des annotateurs à plein temps, change l'échelle linéairement (les heures, elles, ne changent
pas). Rien ici ne dit quel levier retenir.

### C1d. Premier run à périmètre réduit

**Question.** Que gagne et que perd un premier run à 10 items P par candidat, une formulation, un échantillon, un seul mode ?

**Données.** Mêmes paramètres ; coûts d'API aux tarifs du 2026-11-10 (modèle gratuit de chaque outil ; Le Chat et sa recherche web au milieu de
leur fourchette, tarifs non affichés) ; heures au jeu haut ; jours = (heures une fois + heures par run) / 16 h/sem (PARAMÈTRE). Intervalles :
approximation binomiale 1,96·√(p(1−p)/n) demandée par le brief, puis réécriture stdlib du modèle en grappes de
`scratch/critique/A/effectifs_intervalles.py` (bêta-binomiale, percentile en grappes, B = 1 000, 200 jeux ; m = 3 gabarits × F × E réponses
classées par item et par couple), parce que le §8 fait de l'item la grappe et que l'approximation binomiale ignore la corrélation intra-item.

**Script.** `scratch/fondations/2026-11-10/c1d_perimetre_reduit.py` (sortie : `c1d_sortie.txt`, 49 s).

| configuration | items | questions (quota 1) | couples | réponses/run | h annot. une fois (validation + relecture) | h annot. par run (échantillon + désaccords) | € API par run | jours annot. (16 h/sem) | gain vs complet |
|---|---|---|---|---|---|---|---|---|---|
| complet (30 P, 3 F, 2 E, 2 modes) | 448 | 490 | 11 | 32 340 | 269 | 1 536 | 1 312 | 790 | — |
| 10 items P par candidat | 208 | 490 | 11 | 32 340 | 125 | 1 536 | 1 312 | 727 | −144 h, −0 €, −63 j |
| 1 formulation | 448 | 490 | 11 | 10 780 | 224 | 512 | 446 | 322 | −1 069 h, −866 €, −468 j |
| 1 échantillon | 448 | 490 | 11 | 16 170 | 269 | 768 | 662 | 454 | −768 h, −649 €, −336 j |
| sans web seul (6 couples) | 448 | 490 | 6 | 17 640 | 269 | 838 | 392 | 484 | −698 h, −920 €, −305 j |
| web seul (5 couples) | 448 | 490 | 5 | 14 700 | 269 | 698 | 933 | 423 | −838 h, −379 €, −367 j |
| cumul : 10 P, 1 F, 1 E, sans web seul | 208 | 490 | 6 | 2 940 | 104 | 140 | 76 | 107 | −1 561 h, −1 235 €, −683 j |

Au quota 1 par strate, passer de 30 à 10 items P ne change ni le nombre de questions (une par strate candidat × thème × gabarit peuplée : 12 × 10 ×
3 = 360 questions nommant un candidat dans les deux cas) ni le coût par run : il ne réduit que la validation (144 h au jeu haut). Les trois autres
réductions agissent sur le volume de réponses, donc sur tout ce qui est « par run ».

Demi-largeurs d'intervalle à 95 % d'exactitude (points), approximation binomiale, n par couple = 360 × F × E, par candidat = n / 12 :

| configuration | n par couple | couple p=0,7 | p=0,85 | n par candidat | candidat p=0,7 | p=0,85 |
|---|---|---|---|---|---|---|
| complet (et 10 P, et un seul mode) | 2 160 | 1,9 | 1,5 | 180 | 6,7 | 5,2 |
| 1 formulation | 720 | 3,3 | 2,6 | 60 | 11,6 | 9,0 |
| 1 échantillon | 1 080 | 2,7 | 2,1 | 90 | 9,5 | 7,4 |
| cumul : 10 P, 1 F, 1 E, sans web seul | 360 | 4,7 | 3,7 | 30 | 16,4 | 12,8 |

En grappes (grappe = item), demi-largeur médiane et couverture réelle de l'intervalle nominal à 95 % :

| cas | items | m | p | rho | demi-largeur | couverture |
|---|---|---|---|---|---|---|
| candidat au seuil (10 items), complet | 10 | 18 | 0,7 / 0,85 | 0,3 | 15,6 / 11,9 pts | 0,91 / 0,91 |
| candidat au seuil, complet | 10 | 18 | 0,7 / 0,85 | 0,5 | 19,5 / 13,1 pts | 0,89 / 0,81 |
| candidat cible (30 items), complet | 30 | 18 | 0,7 / 0,85 | 0,3 | 9,2 / 7,2 pts | 0,91 / 0,92 |
| candidat cible, complet | 30 | 18 | 0,7 / 0,85 | 0,5 | 11,6 / 9,2 pts | 0,95 / 0,90 |
| candidat cible, 1 échantillon | 30 | 9 | 0,7 / 0,85 | 0,3–0,5 | 9,6–12,0 / 7,6–9,4 pts | 0,90–0,94 |
| candidat cible, 1 formulation | 30 | 6 | 0,7 / 0,85 | 0,3–0,5 | 10,3–12,2 / 7,8–9,4 pts | 0,93–0,95 |
| candidat au seuil, 1 F et 1 E | 10 | 3 | 0,7 / 0,85 | 0,3–0,5 | 18,4–21,7 / 15,0–16,7 pts | 0,84–0,90 |
| candidat cible, 1 F et 1 E | 30 | 3 | 0,7 / 0,85 | 0,3–0,5 | 11,7–13,3 / 8,9–10,6 pts | 0,91–0,97 |
| couple, strate globale, 12 × 10 items P | 120 | 18 | 0,7 / 0,85 | 0,3–0,5 | 4,8–6,0 / 3,7–4,6 pts | 0,88–1,00 |
| couple, strate globale, 12 × 30 items P | 360 | 18 | 0,7 / 0,85 | 0,3–0,5 | 2,7–3,4 / 2,1–2,7 pts | 0,88–0,95 |

Lecture : la corrélation intra-item fait que l'intervalle par candidat dépend bien plus du **nombre d'items** (10 → 30 : 15,6 → 9,2 pts à rho 0,3)
que du nombre de formulations ou d'échantillons (30 items : 9,2 pts à 18 réponses par item, 11,7 pts à 3) ; l'approximation binomiale (6,7 pts)
sous-estime la demi-largeur d'un candidat cible d'un facteur 1,4 à 1,7. À 10 items, la couverture réelle tombe à 0,81–0,91 (le §11, ligne 396, le
dit déjà). Passer à 10 items P épargne 144 h de validation et élargit l'intervalle de chaque candidat de 9–12 à 16–20 points ; passer à 1 F et 1 E
épargne 1 400 h par run et 1 000 € par run et n'élargit l'intervalle d'un candidat cible que de 9–12 à 12–13 points.

QR et H du §2 rendues sans objet (texte 0.34) : **1 formulation** → QR6 (part formulation), H3, métrique « confirmation de prémisse » (§8 ligne 298)
et le drapeau correspondant de QR4 ; **1 échantillon** → seule la « variabilité entre échantillons » (§8 ligne 307) devient absente, levier déjà
prévu au §12 ; **sans web seul** → QR6 (part mode) et H2 sans objet, Perplexity (web intrinsèque) sort, QR5 ne mesure que des liens cités de
mémoire ; **web seul** → H2 sans objet, DeepSeek (D28-3) et Gemini (D28-4) sortent : 5 outils sur 7 ; **10 items P** → aucune QR ne disparaît,
mais chaque candidat est exactement au seuil du §4 : un seul item contesté ou exclu du tirage le sort des comparaisons (QR3, H4), et la compensation
de symétrie du §5 n'a plus de réserve. Cumul : restent QR1, QR2, QR4 (sans prémisse), QR5, QR7 (dès le deuxième run), QR8, QR9 ; H1, H4, H5
calculables ; H2 et H3 sans objet.

**Ce qu'il ne permet pas de conclure.** Les heures « par run » sont au jeu haut ; au jeu bas elles valent environ un tiers (C1c ter). Les
intervalles en grappes supposent une corrélation intra-item de 0,3 à 0,5 que seul le pilote mesurera. Aucun levier n'est recommandé ici.

---

## C2. Coût et heures par couche de rigueur, par run (H7)

**Question.** Au périmètre du 15 octobre et au rythme hebdomadaire, que coûte chaque couche du protocole en euros d'API et en heures humaines,
et que rapporterait le retrait de chaque couche optionnelle ?

**Données et hypothèses.**
- Périmètre : 7 outils, 11 couples outil × mode (ChatGPT 2, Claude 2, Gemini 1 — web suspendu D28-4 —, Le Chat 2, Grok 2, Perplexity 1 — web
  intrinsèque —, DeepSeek 1 — pas de recherche web D28-3), soit 5 couples web (faisabilite.py en comptait 4, sans Perplexity) ; 12 candidats ;
  448 items (12 × 30 P + 40 A + 36 F + 12 O) ; 1 502 questions engendrées ; 490 questions tirées au quota 1 ; **32 340 réponses par run**, dont
  14 700 en mode web ; 52/12 runs par mois.
- Modèle par défaut de chaque produit grand public et tarifs (parametres.py, vérifiés le 2026-11-10) : ChatGPT → GPT-6 Luna (Free, Go : 0,10 / 0,50 $)
  ou GPT-6 Sol (payant : 2 / 10 $) [help center OpenAI, extrait, page 403] ; Claude → Sonnet 5.5 (2 / 10 $) ou Opus 5.5 (4 / 20 $) [PARAMÈTRE : aucune
  page ne nomme le défaut de l'application ; l'offre gratuite n'a pas Opus] ; Gemini → 3.6 Flash (0,75 / 3,75 $, **1,50 / 7,50 $ à partir du
  2027-01-01**) ou 4 Argon (2 / 10 $, **4 / 20 $ à partir du 2026-12-01**) ; Le Chat → Mistral Medium 3.5 (« default model in Le Chat », 2026-05-22 ;
  **tarif non affiché**, PARAMÈTRE 0,40–0,50 / 1,50–2,00 $) ; Grok → grok-4.7 (2 / 6 $) [PARAMÈTRE : défaut de l'application non documenté] ; Perplexity →
  « modèle par défaut » non nommé par le help center, équivalent posé `perplexity/sonar` (0,25 / 2,50 $) ; DeepSeek → deepseek-flash = V4.1-Flash-1017
  (0,30 / 1,20 $ en heures pleines UTC, qui couvrent la fenêtre du mardi ; moitié prix en heures creuses).
- Recherche web, pour 1 000 appels : OpenAI 10 $ (+ jetons de contenu au tarif du modèle), Anthropic 10 $ (+ jetons), Google 14 $ au-delà de 5 000
  requêtes gratuites par mois, xAI 5 $, Perplexity 2,50 $ (outil `web_search` de l'Agent API, pris en borne haute), Mistral non affiché (PARAMÈTRE
  0–10 $).
- Juges : Claude Sonnet 5.5 (2 / 10 $ ; lot −50 % ; lecture de cache 0,05× ; tokeniseur +30 % « Claude 4.7 and later ») et Mistral Large (0,5 / 1,5 $ ;
  Large 4 en préversion publique depuis le 2026-10-06, tarif non affiché). Jetons par réponse jugée (hypothèses de faisabilite.py : 400 jetons de
  réponse, 600 de référence, 3 liens de 15 000 caractères en mode web, 0,5 sans web, prompt juge de 12 800 caractères) : Sonnet 22 469 (web) /
  8 540 (sans web), Mistral 17 514 / 6 800.
- Écarts avec le 2026-11-02 (faisabilite.py) : Sonnet 5.5 2 / 10 inchangé ; Mistral Large 0,5 / 1,5 inchangé ; gpt-5.1 1,25 / 10 encore affiché mais
  **retiré le 2027-04-01** (page des dépréciations), et ce n'est plus le défaut de ChatGPT ; recherche OpenAI 10 $/1k inchangée ; taux de change
  0,9 → 1/1,1193 (BCE, 2026-11-09).

**Script.** `scratch/fondations/2026-11-10/c2_couts_par_couche.py` (sortie : `c2_sortie.txt`).

**C2.1 Couches « une fois », avant le premier run.**

| couche | € API bas | € API haut | h annotateurs bas | haut | h auteur bas | haut |
|---|---|---|---|---|---|---|
| extraction double (Sonnet 5.5 + Mistral Large, 12 corpus de 150–600 k caractères, réextraction 25 %) | 5 | 12 | 0 | 0 | 0 | 0 |
| double validation humaine de 448 items (5–15 min/item/annotateur) + arbitrages de l'auteur (10–20 % des items, 3–5 min) | 0 | 0 | 75 | 224 | 2,2 | 7,5 |
| relecture des mesures par l'auteur (§4 ; 0,5–0,8 mesure par item P, 1–2 min) | 0 | 0 | 0 | 0 | 3,0 | 9,6 |
| reformulations par l'API Mistral Large (1 502 questions × 2 formulations) | 2 | 2 | 0 | 0 | 0 | 0 |
| relecture humaine des trois formulations (1 502 questions, 1–2 min) | 0 | 0 | 25 | 50 | 0 | 0 |
| jeu d'or du pilote (300 réponses × 2 humains + 3e humain sur 20 %, 2–5 min) | 0 | 0 | 22 | 55 | 0 | 0 |

**C2.2 Interrogation par run** (3 formulations × 2 échantillons × 490 questions, par couple) : ChatGPT 1 € sans web / 41 € web (Luna) ou 11 / 66 €
(Sol) ; Claude 14 / 74 € (Sonnet 5.5) ou 28 / 109 € (Opus 5.5) ; Gemini 4 € (3.6 Flash) ou 11 € (Argon) ; Le Chat 2 / 25 € ; Grok 7 / 42 € ;
Perplexity 14 € ; DeepSeek 1 €. **Total 225 € (modèles gratuits) à 316 € (modèles payants) par run.** En mode web, le prix des appels de recherche
(1,5 par réponse) pèse plus que les jetons pour les modèles bon marché.

**C2.3 Deux juges par run** (contrefactuel compris : 2 × 200 renotations par juge) :

| tarification | juge Sonnet 5.5 | dont contrefactuel | juge Mistral Large | dont contrefactuel | total juges |
|---|---|---|---|---|---|
| standard | 904 | 12 | 174 | 2 | **1 092 €** |
| lot (−50 %) | 452 | 6 | 87 | 1 | 546 € |
| lot + cache du prompt (0,05×) | 322 | 4 | 87 | 1 | 414 € |

**C2.4 Couches humaines par run, puis par mois (× 52/12).**

| couche | h/run bas | h/run haut | h/mois bas | h/mois haut |
|---|---|---|---|---|
| échantillon 10 % : 3 234 réponses × 2 humains + 3e humain sur 20 % (2–5 min) | 237 | 593 | 1 028 | 2 569 |
| désaccords des juges (15–25 %), accords partiels (5–10 %), erreurs graves : 22 à 37 % des réponses, 1 humain | 238 | 1 010 | 1 030 | 4 377 |
| lectures des comparateurs : 720 lectures, 2 humains + 3e, reprise de 50–80 % (levier §12) | 4,0 | 9,9 | 17 | 43 |
| revérification des items A (40 items, 25 % avec source neuve, 3 min) | 0,5 | 0,5 | 2,2 | 2,2 |
| items nouveaux ou revalidés (2–5 % des items) + relecture de leurs formulations | 1,9 | 13,4 | 8 | 58 |
| auteur : audit, arbitrages, note éditoriale (cible §12) | 3 | 3 | 13 | 13 |
| **total annotateurs** | **481** | **1 627** | **2 086** | **7 049** |

Capacité posée en C1 : 2 annotateurs × 5–10 h/semaine = 43 à 87 h par mois.

**C2.5 Total API par run et par mois contre la cible du §12 (600 €/mois).** Outils gratuits, juges standard : 225 + 1 092 = **1 317 €/run, 5 707 €/mois,
×9,5 la cible** ; outils payants : 1 408 €/run, 6 101 €/mois (×10,2) ; outils gratuits, juges en lot avec cache : 639 €/run, 2 768 €/mois (×4,6). Les
juges font 83 % du coût d'API standard.

**C2.6 Couches optionnelles : coût évité et équivalences.** « Outils de plus » = coût évité / coût d'API d'un outil de plus (253 €/run : deux modes au
tarif grok-4.7 avec recherche à 5 $/1k, jugé par les deux juges ; il coûte aussi 86 à 291 h d'annotateurs par run). « Questions du canal application
par mois » = heures d'annotateurs évitées par mois converties en saisies (7 assistants × 2 testeurs × 3–6 min). « Runs de plus » = coût évité / coût
d'API d'un run complet (1 317 à 1 408 €).

| couche retirée | € API évités/run (bas–haut) | €/mois | h annot. évitées/run | h/mois | = outils de plus | = questions du canal application / mois | = runs de plus |
|---|---|---|---|---|---|---|---|
| 3 formulations → 1 | 869–929 | 3 765–4 027 | 317–1 069 | 1 372–4 631 | 3,4–3,7 | 980–6 615 | 0,66 |
| 2 échantillons → 1 (levier §12) | 652–697 | 2 823–3 020 | 237–801 | 1 029–3 473 | 2,6–2,8 | 735–4 961 | 0,49–0,50 |
| 2 modes → sans web seul | 924–984 | 4 006–4 265 | 216–729 | 935–3 157 | 3,7–3,9 | 668–4 510 | 0,70 |
| 2 juges → 1 juge (Sonnet), humain inchangé | 176 | 763 | 238–1 010 | 1 030–4 377 | 0,7 | 736–6 253 | 0,13 |
| échantillon humain 10 % → 5 % | 0 | 0 | 119–296 | 514–1 285 | 0 | 367–1 835 | 0 |

Autre lecture de la ligne « 2 juges → 1 + humain » : si un humain remplace le second juge sur chaque réponse obtenue, la couche humaine **augmente**
de 1 078 à 2 695 h par run (4 671 à 11 678 h par mois) pour 176 €/run d'API évités. Les heures « évitées » de la première lecture viennent de la
disparition du déclencheur « désaccord des juges » : plus rien ne renvoie alors une réponse à un humain hors de l'échantillon et des erreurs graves.

Le canal application actuel (60 questions × 7 assistants × 2 testeurs) vaut 42 à 84 h/mois, soit 630 à 2 520 €/mois à 15–30 €/h (PARAMÈTRE).

**Ce que le résultat permet de conclure.** Les trois leviers de volume (formulations, échantillons, modes) agissent de concert sur les euros et les
heures, à hauteur de 650 à 980 € et de 220 à 1 070 h par run chacun ; les deux leviers de notation (un seul juge, échantillon à 5 %) n'agissent que
sur l'un des deux. La couche la plus coûteuse en argent est le juge Sonnet (904 €/run, réductible à 322 € par lot et cache, sans changer le
protocole) ; la plus coûteuse en heures est la notation humaine déclenchée par les juges (238–1 010 h/run), devant l'échantillon de 10 %
(237–593 h/run). Au périmètre complet, la cible de 600 €/mois du §12 est dépassée d'un facteur 4,6 à 10,2 et la cible de 3 h d'auteur par run laisse
de côté 480 à 1 630 h d'annotateurs par run.

**Ce qu'il ne permet pas de conclure.** Les hypothèses de jetons (400 jetons de réponse, 3 pages citées de 15 000 caractères, 1,5 recherche par
réponse) viennent de faisabilite.py et n'ont jamais été mesurées sur un appel réel ; le pilote les remplacera. Les taux de désaccord des juges
(15–25 %) et le temps par notation (2–5 min) gouvernent les heures à un facteur 4 près. Le tarif de Mistral Medium 3.5 et celui de sa recherche
web ne sont pas affichés ; le choix « gratuit ou payant » du modèle par défaut est une lecture du §6 que le protocole ne tranche pas.

---

## C3. Le canal application (H1)

**Question.** Combien d'heures de testeur demande le dispositif du §6 (ligne 241), et chacune de trois variantes ?

**Données.** 7 assistants inclus (« tous les assistants inclus y sont saisis »), 2 testeurs qui saisissent chacun tout le sous-échantillon, 5 questions
par candidat × 12 candidats = 60 questions, une fois par mois ; 3 à 6 min par saisie (saisie, copie, capture : paramètre du brief) ; 490 questions
tirées au quota 1 (980 au quota 2, approximation : le quota multiplie les questions nommant un candidat). Le §12 ne fixe pas encore de plafond
d'heures (« les plafonds écrits à la version 1.0 sont fixés d'après ces mesures ») : heures absolues.

**Script.** `scratch/fondations/2026-11-10/c3_canal_application.py` (sortie : `c3_sortie.txt`).

| variante | questions par passage | saisies par passage | passages/mois | h testeurs/mois (3 min) | (6 min) | h par testeur et par mois | €/mois à 15–30 €/h |
|---|---|---|---|---|---|---|---|
| §6 actuel : 5 questions par candidat, mensuel | 60 | 840 | 1 | 42 | 84 | 21–42 | 630–2 520 |
| mêmes 60 questions chaque semaine | 60 | 840 | 4,33 | 182 | 364 | 91–182 | 2 730–10 920 |
| 10 % des questions du run (quota 1 : 49), mensuel | 49 | 686 | 1 | 34 | 69 | 17–34 | 514–2 058 |
| 10 % des questions du run (quota 1), chaque semaine | 49 | 686 | 4,33 | 149 | 297 | 74–149 | 2 230–8 918 |
| toutes les questions neutres de l'échantillon 1 (quota 1), mensuel | 490 | 6 860 | 1 | 343 | 686 | 172–343 | 5 145–20 580 |
| toutes les questions neutres de l'échantillon 1 (quota 1), chaque semaine | 490 | 6 860 | 4,33 | 1 486 | 2 973 | 743–1 486 | 22 295–89 180 |
| 10 % des questions du run (quota 2 : 98), mensuel | 98 | 1 372 | 1 | 69 | 137 | 34–69 | 1 029–4 116 |
| toutes les questions neutres (quota 2), chaque semaine | 980 | 13 720 | 4,33 | 2 973 | 5 945 | 1 486–2 973 | 44 590–178 360 |

Chaque saisie produit une réponse notée par les deux juges puis soumise à l'échantillon humain de 10 % (§6 : « notées comme celles de l'API ») :
840 réponses de plus par mois au dispositif actuel, qui s'ajoutent aux heures de C2.4 (84 réponses × 2,2 humains × 2–5 min = 6 à 15 h/mois).

**Ce que le résultat permet de conclure.** Au dispositif actuel, 60 questions saisies dans 7 applications par 2 testeurs font 840 saisies et 42 à 84 h
par mois, comparables aux 43 à 87 h mensuelles de la capacité d'annotateurs posée en C1. « 10 % des questions du run » au quota 1 (49 questions) est
*moins* que les 60 questions actuelles ; porté à la semaine, le dispositif passe de 42–84 h à 149–364 h par mois ; saisir toutes les questions neutres
multiplie les heures par 8 (mensuel) à 35 (hebdomadaire).

**Ce qu'il ne permet pas de conclure.** Le temps par saisie (3–6 min) est le paramètre dominant ; il n'a pas été mesuré. Le nombre d'assistants
saisis dépend des incertains (Meta AI, Grok Bot, Gemini Notebook : C4) : chaque assistant de plus ajoute 1/7 des heures.

---

## C4. Couverture de la liste d'outils (H2)

**Question.** Combien d'assistants le top 50 relevé contient-il, combien la règle du §3 en retient-elle, pour quels motifs écarte-t-elle les autres, et
quels intermédiaires sont hors règle par construction ?

**Données.** `scratch/perimetre/dossier-2026-10-15-final.md` (§2.1 relevés des deux stores le 2026-10-15, §2.2 fiches, §5.2 synthèse) ; protocole
§3 (ligne 100) et §11 (lignes 393, 404) ; pages officielles lues le 2026-11-10 (colonne source). Aucune part d'usage (autre agent).

**Script.** `scratch/fondations/2026-11-10/c4_couverture_outils.py` (sortie : `c4_sortie.txt`, tableau complet avec URL).

| assistant | éditeur | App Store | Google Play | verdict (dossier) | motif | API publique du même modèle |
|---|---|---|---|---|---|---|
| Claude | Anthropic | 1 | 4 | inclus | règle remplie, 2 modes | oui (claude-sonnet-5-5 / claude-opus-5-5) ; défaut de l'application non documenté |
| Gemini | Google | 2 | 9 | inclus | règle remplie ; web suspendu (D28-4) | oui (gemini-3.6-flash / gemini-4-argon) |
| ChatGPT | OpenAI | 3 | 1 | inclus | règle remplie, 2 modes | oui (gpt-6-luna Free et Go / gpt-6-sol payant), help center en extrait |
| Meta AI | Meta | 5 | 5 | incertain | ouverture de l'API en France/UE et conditions non établies | incertain : Meta Model API (Muse Wonder en préversion, Muse Spark), rien sur l'UE ni sur l'identité avec l'application |
| Grok | xAI | 10 | 25 | inclus | règle remplie, 2 modes | oui (grok-4.7) ; défaut de l'application non documenté |
| Microsoft Copilot | Microsoft | 11 | 19 | exclu | pas d'API du produit grand public | non : seules des API Microsoft 365 Copilot (préversion, licence, sans choix de modèle) |
| Gemini Notebook | Google | 27 | 33 | incertain | catégorie discutable | préversion publique de la Gemini Notebook API (comptes personnels, pré-GA) |
| Genie AI | Appnation (tiers) | 35 | 43 | exclu | tiers, pas d'API officielle | non |
| Perplexity | Perplexity AI | 36 | 55 | inclus | règle remplie (App Store) ; mode sans web à vérifier | partiel : Agent API et Search API ; le « modèle par défaut » de l'application n'est pas nommé |
| DeepSeek | DeepSeek | 43 | 52 | inclus | règle remplie ; sans web seul (D28-3) | oui (deepseek-flash = V4.1-Flash-1017, « official web and APP models updated ») |
| Vibe (ex-Le Chat) | Mistral AI | 44 | 40 | inclus d'office | §3 | oui (mistral-medium-3-5, « default model in Le Chat ») ; tarif non affiché |
| Grok Bot | xAI | 47 | 57 | incertain | doublon ou produit distinct | même API que Grok |
| Open Chat | AceTools (tiers) | — | 42 | exclu | tiers, pas d'API officielle | non |
| Chatbot App | TapSuite (tiers) | — | 50 | exclu | tiers, pas d'API officielle (rang 50 lu comme inclus) | non |

**Décompte.** 14 assistants dans le top 50 d'au moins un store ; **7 retenus** (dont 1 d'office) ; 3 incertains ; 4 exclus ; 4 autres sortis du top 50
entre le 9 et le 15 octobre ou jamais entrés (AI Chat App, ChatOn, Genora AI, Chat Smith). Motifs d'écart : pas d'API officielle du produit : 4 ;
pas gratuit : 0 ; pas de français : 0 (le lookup Apple donne « Gratuit » et « FR » pour les 12 applications d'éditeur) ; catégorie discutable : 2 ;
ouverture de l'API non établie (UE) : 1. Part couverte : 7/14 = 50 % des assistants classés ; deux des trois incertains ou exclus les mieux classés
(Meta AI 5 et 5, Copilot 11 et 19) devancent Perplexity, DeepSeek et Le Chat dans les classements.

**Intermédiaires structurellement hors règle** (catégories ; les exemples nommés sont des produits, pas des personnes) : réponses générées des
moteurs de recherche (Google, Bing, Qwant, DuckDuckGo, Brave, Ecosia : §11 lignes 393 et 404, « outil très utilisé hors stores », « intermédiaires sans
API … hors champ ») ; assistants intégrés aux messageries (Meta AI dans WhatsApp, Messenger, Instagram ; My AI de Snapchat ; Le Chat dans WhatsApp) ;
assistants des téléphones et systèmes (Siri et Apple Intelligence, Gemini sur Android, Galaxy AI et Bixby) ; applications d'opérateurs classées en
Productivité (l'application « Free » au rang 7 du relevé Google Play, qui n'est pas un assistant) ; assistants vocaux (Alexa+, Google Home) ;
interfaces conversationnelles des comparateurs et des médias (un « chat Live 2027 » relevé par le dossier, « probablement exclu ») ; applications
tierces réemballant un modèle d'autrui ; assistants de bureautique et de navigateur (Copilot dans Windows, Edge et Office ; Gemini dans Workspace ;
Leo de Brave). Statut : les deux premières bases sont dans le protocole ou le dossier ; les noms d'exemples sont un ajout de l'agent, non relevés.

**Ce que le résultat permet de conclure.** La règle du §3 retient la moitié des assistants classés et, parmi ceux qu'elle écarte, les deux mieux
classés (Meta AI, Copilot) le sont faute d'API du produit ou d'API ouverte en Europe, pas faute d'usage. Pour quatre des sept retenus, une page de
l'éditeur nomme le modèle par défaut ou son équivalent API (ChatGPT en extrait, Gemini, Le Chat, DeepSeek) ; pour Claude, Grok et Perplexity, aucune
page lue ne le fait.

**Ce qu'il ne permet pas de conclure.** Rien sur l'usage réel de chaque intermédiaire ni sur l'écart entre une interface intégrée et l'API de son
éditeur ; les fiches du dossier marquées « relevé du 9, non relu » n'ont pas été refaites ici.

---

## C5. Changements de modèle par défaut (H9)

**Question.** Combien de fois le modèle par défaut du produit grand public de chaque éditeur a-t-il changé entre le 2025-11-01 et le 2026-11-01, à quel
rythme, combien de changements attendre sur une campagne de six mois (décembre 2026 → mai 2027), et que prévoit le texte du protocole ?

**Données.** Pages officielles lues le 2026-11-10 : notes de version de l'application Gemini ; changelog et annonces Mistral ; notes de version et
tarifs xAI ; changelog Perplexity et help center (article 10354930) ; changelog DeepSeek (`/updates/`) ; pages d'Anthropic (tarifs, modèles,
dépréciations) ; page des dépréciations OpenAI. **Le help center OpenAI et x.ai/news refusent le fetch (HTTP 403)** : leurs phrases sont lues dans les
extraits du moteur de recherche (statut « extrait »). Les dates de sortie des modèles Anthropic sont **déduites** de la colonne « retrait au plus tôt »
de la page des dépréciations (hypothèse : retrait au plus tôt = sortie + 12 mois, cohérente avec l'instantané `20251101` d'Opus 4.5 et avec les mois
du changelog Perplexity). Deux comptages : « bas » = changements qu'une page officielle appelle « par défaut » du produit grand public ; « haut » =
toute sortie d'un modèle généraliste plausiblement servi par l'application (hors changement de nom et hors préversion réservée à l'API).
Modèle de comptage sur six mois : rythme constant, loi de Poisson.

**Script.** `scratch/fondations/2026-11-10/c5_changements_modele.py` (sortie : `c5_sortie.txt`, avec le détail daté de chaque événement et son statut).

| éditeur / produit | changements « par défaut » documentés (bas) | sorties offertes à tous (haut) | intervalle médian (j), haut | attendus sur 6 mois, bas–haut | P(≥ 1 changement), bas–haut | statut des dates |
|---|---|---|---|---|---|---|
| ChatGPT (OpenAI) : 5.1 (13 nov. 2025), 5.2 (déc.), 5.4 (5 mars), 5.5 Instant (printemps), 5.6 (9 juil.), Luna défaut Free (août), GPT-6 (7–8 oct.) | 7 | 7 | 56 | 3,5 | 0,97 | déduit, extrait, paramètre (jours de 5.2, 5.5 et Luna non lus) |
| Claude (Anthropic), ligne Sonnet (l'offre gratuite a Sonnet et Haiku) : 4.6, 5, 5.5 | 0 | 3 | 112 | 0–1,5 | 0–0,78 | déduit |
| Claude (Anthropic), ligne Opus (offres payantes) : 4.5, 4.6, 4.7, 4.8, 5, 5.5 | 0 | 6 | 60 | 0–3,0 | 0–0,95 | déduit |
| Gemini (Google), application : 3 Pro, **3 Flash « par défaut » (17 déc. 2025)**, 3.1 Pro, 3.5 Flash, 3.6 Flash, 4 Argon (payant) | 1 | 6 | 64 | 0,5–3,0 | 0,39–0,95 | lu |
| Le Chat / Vibe (Mistral) : Large 3 (2 déc. 2025, rien sur Le Chat), **Medium 3.5 « default model in Le Chat » (22 mai 2026)** | 1 | 2 | 171 | 0,5–1,0 | 0,39–0,63 | lu, extrait |
| Grok (xAI), application : 4.1 (17 nov. 2025, tous les utilisateurs), 4.20 (fiche système du 7 avr. 2026), puis 4.5, 4.6, 4.7 sur l'API (juil., août, sept.) | 2 | 5 | 65 | 1,0–2,5 | 0,63–0,92 | extrait, lu |
| Perplexity, application : « modèle par défaut » jamais nommé (help center) ; l'Agent API a changé 4 fois de préréglages par défaut (juil., août, sept., oct.) | 0 | 0 | — | 0 | 0 | lu |
| DeepSeek, application et site : V3.2 (1er déc. 2025, API), V4 (24 avr. 2026, API), **V4-Pro GA « APP, Web, and API » (13 août)**, **V4.1-Flash-1017 « official web and APP models updated » (17 oct.)** | 2 | 4 | 111 | 1,0–2,0 | 0,63–0,86 | lu |

Somme sur les sept outils : **6,5 (bas) à 13,5 (haut, ligne Sonnet pour Claude) changements attendus** pendant les six mois de campagne, soit, au bas
mot, un changement de modèle chez l'un des outils chaque mois ; ChatGPT seul en attend 3 à 4 (un tous les 56 jours).

**Ce que le protocole 0.34 prévoit, mot pour mot.**
- §6, tableau « Modèle » (ligne 227) : « L'identifiant de modèle par défaut du produit grand public de l'éditeur à la date du run, tel que documenté
  publiquement ; la page qui le documente est archivée avec le run | Mesurer ce que les gens utilisent, pas le meilleur modèle du catalogue ».
- §6, « Enregistré » (ligne 235) : « … identifiant de version renvoyé par l'API … ».
- §8, « Tendance (QR7, H5) » (ligne 319) : « Le modèle de chaque outil à chaque run est publié avec la tendance. C'est le modèle demandé, inscrit au
  gel, avec les identifiants de modèle renvoyés par l'API et leurs effectifs, comptés par outil sur toutes les réponses obtenues du run sur le canal
  API, les deux modes confondus ; les réponses sans identifiant renvoyé sont comptées à part. Toute autre analyse temporelle est exploratoire. »
- §7, « Calibration et fiabilité publiée » (ligne 278), juges seulement : « Tout juge dont le modèle ou les réglages changent, qu'il soit retravaillé ou
  que son éditeur retire son modèle, est mesuré à nouveau sur le jeu d'or, aux seuils de la section 12, avant son premier run ; la tendance (section 8)
  qui compare des runs notés par des juges différents porte la mention de ce changement. »
- §4, « Extraction double » (ligne 149) : le modèle Mistral de l'extraction et du juge « est figé à la version 1.0 : c'est Mistral Large 4 si, au gel de
  la version 1.0, il est en disponibilité générale et qu'aucun retrait n'en est annoncé avant le second tour ; sinon, c'est le plus récent des modèles
  Mistral en disponibilité générale qui remplit la même condition. » (Large 4 est en préversion publique depuis le 2026-10-06.)
- §9, « Procédure d'amendement » (ligne 351) : « Un amendement est nécessaire pour toute modification des sections 3 à 8 ou des prompts des juges. …
  Les résultats produits avant et après un amendement sont rapportés séparément et ne sont comparés qu'avec la mention de l'amendement. »
- §3 (ligne 103) : « La liste nominative des outils est fixée à la version 1.0, publiée, et ne bouge qu'en cas de disparition d'un outil ou de sortie
  d'un nouvel outil remplissant la règle (amendement, section 9). » ; §11 (ligne 404) : « La liste des outils est figée. Un outil apparu après la
  version 1.0 n'est pas mesuré, et un outil qui ne répond plus est marqué « run incomplet » (section 8) ».

**Ce que ces textes disent, sans interprétation.** (1) Le modèle interrogé suit le défaut de l'éditeur à chaque run et la page qui le documente est
archivée. (2) La tendance publie le modèle de chaque run, mais aucun passage ne demande de rapporter séparément les résultats d'avant et d'après un
changement de modèle d'un **outil** : la séparation « avant et après » du §9 ne vaut que pour un amendement du protocole. (3) Le changement du modèle
d'un **juge** impose une nouvelle mesure sur le jeu d'or et une mention sur la tendance. (4) Pour Perplexity, et pour Claude et Grok tant qu'aucune
page ne nomme le défaut de l'application, la case « tel que documenté publiquement » du §6 n'a pas de source à archiver ; pour ChatGPT, le défaut
diffère selon l'offre (Luna pour Free et Go, Sol pour les offres payantes), et le §6 ne dit pas laquelle est « le produit grand public ».

**Ce que le résultat permet de conclure.** Sur les douze derniers mois, les éditeurs documentés ont changé le modèle par défaut de leur application
entre une fois (Le Chat, Gemini au sens strict) et sept fois (ChatGPT) ; au même rythme, une campagne de six mois verrait 6 à 14 changements répartis
sur les sept outils, et H5 (premier run contre dernier run, §2) comparerait presque sûrement des modèles différents pour ChatGPT (P ≈ 0,97) et
probablement pour Grok et DeepSeek (0,63 et plus).

**Ce qu'il ne permet pas de conclure.** Les comptes « haut » de Claude et de Grok sont des bornes (aucune page ne dit quel modèle sert l'application),
celui de DeepSeek suppose que V3.2 et V4 ont aussi changé l'application (entrées du changelog muettes sur ce point), et quatre dates d'OpenAI
sont lues dans des extraits de recherche faute d'accès à la page. Le rythme passé n'est pas une prévision : il sert de base de calcul, pas de loi.

---

## Récapitulatif des paramètres dont les résultats dépendent le plus

| calcul | paramètre | fourchette posée | effet |
|---|---|---|---|
| C1, C2 | minutes par notation humaine d'une réponse | 2–5 | heures par run ×2,5 (481 → 1 627 h) |
| C1, C2 | taux de désaccord des juges + accord partiel | 20–35 % | heures déclenchées ×4 (238 → 1 010 h/run) |
| C1 | heures d'annotateurs disponibles par semaine | 10–20 | date du premier run, nombre de runs publiables (0,01–0,04 par semaine) |
| C1 | minutes par item validé et par annotateur | 5–15 | validation 33–240 h selon 200 ou 400 items |
| C1 | délais avocat et recrutement | 14–42 j, 14–28 j | gel 1.0 entre fin novembre et fin décembre 2026 |
| C2 | jetons par réponse jugée (pages citées) | 8 500–22 500 | coût des juges 414–1 092 €/run selon lot et cache |
| C2 | modèle par défaut retenu (offre gratuite ou payante) | Luna/Sol, Sonnet/Opus, 3.6 Flash/Argon | interrogation 225 → 316 €/run |
| C3 | minutes par saisie dans l'application | 3–6 | 42 → 84 h/mois au dispositif actuel |
| C5 | lecture de « par défaut » (documenté ou sortie offerte à tous) | bas/haut | 6,5 → 13,5 changements attendus sur six mois |

