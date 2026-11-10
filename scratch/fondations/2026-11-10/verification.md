# Étape 4 — vérification des sources (session, 2026-11-10)

Chaque URL a été rouverte le 2026-11-10 par un lecteur de pages (agent `web-fetch`, modèle `fable`,
effort `max`), avec pour consigne un verdict par affirmation et le passage cité mot pour mot. Un fait
« non trouvé » ou « inaccessible » est **retiré** du registre ; il n'est pas gardé « à vérifier ».
Aucun assistant interrogé ; aucun candidat ni parti nommé (remplacés par [parti A], [parti B]).

Mécanique (faite avant) : les six scripts `c1` à `c5` rejoués donnent des sorties identiques ; toutes
les citations du protocole 0.34 existent mot pour mot.

## Corrections au relevé du sous-agent (ce que la page ne dit pas)

| Fait du relevé | Verdict | Ce que la page dit |
| --- | --- | --- |
| Arcom, baromètre IA : « ChatGPT trois quarts du temps », Médiamétrie, publication annuelle | non trouvé sur la page | la page ne nomme aucun service ; 33 M de visiteurs uniques en **mars** 2026, 57,1 % |
| Baromètre du numérique : « 20 % deux ans plus tôt » | non trouvé | « 48 % de la population, soit une hausse de 15 points en seulement un an » (communiqué Arcep du 2026-02-09) |
| AP néerlandaise : « plus de 56 % » pour deux partis, « 21 000 demandes » | non trouvé (nos.nl) | un parti « in ruim 30 procent » en premier, un autre « in bijna 25 procent » ; pas de nombre de requêtes |
| AP néerlandaise 2026 : « 36 communes », discussions ministère–fournisseurs | non trouvé (nos.nl) | cinq outils ; partis locaux conseillés dans moins de 1 % des cas ; rapport remis au ministre |
| Liberties : 96 %, 90 %, « indicative rather than definitive », versions gratuites, courtoisie | non trouvé sur la page | chiffres peut-être dans le rapport lié, non ouvert : retirés |
| AI Forensics : recommandation « research APIs », données non fournies par les plateformes, RFI à Bing | non trouvé sur la fiche-projet | retirés ; le mémo de la Commission du 2024-11-20 cite des travaux sur les réseaux sociaux, pas ce rapport |
| EBU, page du rapport : versions gratuites, dates de collecte, 45/31/20 % | non trouvé sur la page | « Almost half », « A third », « A fifth » ; détails dans le PDF (voir plus bas) |
| ChatGPT VLOSE : « 31 août 2026 », 159,1 M d'utilisateurs, accès chercheurs, risques électoraux | non trouvé (Pinsent Masons) | désignation confirmée « on Monday » (article du 2026-09-01) ; conformité « until January 2027 » ; audits annuels |
| MIT Observatory : « une douzaine de modèles », 19 000 combinaisons, lancement en septembre | non trouvé | jeu fixe de questions relancé « every few days », tableau de bord public |
| OpenAI : gpt-5.1 remplacé par gpt-6-luna | non trouvé | remplacé par gpt-6-sol (retrait le 2027-04-01 confirmé) |
| Mistral Large 4 : préversion ou disponibilité générale | non trouvé sur la page des modèles | listé « v26.10 », statut non écrit |
| « Le Chat renommé Vibe » | non trouvé sur les pages Mistral lues | Euronews (2026-09-23) écrit « Vibe (ex-Le Chat, Mistral) » |
| DeepSeek : V3.2 et V4 ont changé l'application | non trouvé | entrées API seulement ; l'application est nommée le 2026-08-13 et le 2026-10-17 |
| Clubic : France exclue d'une extension antérieure d'AI Mode | non trouvé | « la France le découvre pour la première fois » |
| Meta AI : « dont la France », « texte seulement », « dont le français » | non trouvé | 41 pays européens, six langues, Facebook, Instagram, WhatsApp, Messenger (2025-03-20) |
| Perplexity, modèle par défaut (help center 10354930) | inaccessible (404) | retiré |
| ISD, PDF 2026 | inaccessible (> 10 Mo) | retiré |

## Faits confirmés (passage cité par le lecteur)

### Écart API / application (H1)
- AI Forensics, 2024-07-31, https://aiforensics.org/work/chatbots-moderation : « Implementation inconsistencies exist between web and API versions: Gemini's web safeguards are absent in its API version. » ; « Gemini achieved 98% moderation consistency, Copilot only reached 50% » ; « OpenAI's web version of ChatGPT showed no additional election-related moderation ».
- Proof News, 2024-02-27, https://www.proofnews.org/seeking-election-information-dont-trust-ai/ : API (« backend interfaces ») ; 130 réponses, 26 questions, plus de 40 experts ; 51 % inexactes, 40 % nocives, 38 % incomplètes ; Meta : « meaningless », « Llama 2 is a model for developers » ; Anthropic : le pop-up n'apparaît pas par l'API.
- AlgorithmWatch + CASM, 2024-08-29, https://algorithmwatch.org/en/chatbots-are-still-spreading-falsehoods/ : 512 prompts, 107 021 réponses (29 juil.–12 août) ; Google : « The answers from the AlgorithmWatch investigation (via the API) could not have been reproduced via their app and browser. » ; Copilot bloque ~35 % puis 75 % au 31 août ; OpenAI sans réponse ; informations attribuées à tort à des partis, politiciens déclarés fictifs.
- Anthropic, 2026-04-24, https://www.anthropic.com/news/election-safeguards-update : bannière et consignes de neutralité décrites « on Claude.ai » ; le mot « API » n'apparaît pas ; 600 prompts d'évaluation.
- TechCrunch, 2026-10-24 (URL dans `releve-monde.md`, Q1) : API, près de 500 courses, consigne « Name one candidate… » ; un modèle choisit [parti A] dans 92 % des réponses, l'autre [parti B] dans 97 %, accord < 10 % ; « The consumer apps refused to answer » ; OpenAI : « This study tested a developer API with a prompt explicitly demanding a candidate recommendation. » ; ~1 240 jetons d'entrée non écrits par les chercheurs sur l'API xAI ; le chercheur dit avoir contourné les refus des applications.
- NPR, 2026-11-02, https://www.wunc.org/2026-11-02/ai-chatbots-are-becoming-political-advisers-their-answers-can-mislead-voters : étude IFPG / Dewey Square, sept chatbots, en partie par API ; Anthropic : garde-fous peut-être inactifs ; IFPG : API et web « comparable » (étude interne) ; 13,9 % / 5,9 % / 5,1 % ; « pour qui voter » ≈ 0,01 % des conversations Claude aux États-Unis (21–27 sept. 2026) ; OpenAI : « not representative of how most voters use ChatGPT » ; Microsoft : améliorations de Copilot ; test NPR de cinq applications, « leaky refusals ».

### Usages en France (H2, H3)
- Arcom, 2026-06-16, baromètre d'audience des services d'IA (URL dans le relevé, Q2) : 33 M de visiteurs uniques en mars 2026, 57,1 % de la population ; 7 fois avril 2023 ; 69,2 % des 15–24 ans par mois en 2025.
- Arcep, 2026-02-09, Baromètre du numérique 2026 : 48 % de la population (+15 points en un an) ; « 63 % des utilisateurs d'IA générative ont principalement eu recours à ChatGPT » ; moteurs 59 % contre IA générative 28 % pour rechercher de l'information ; 4 145 personnes, juin 2025 (communiqué https://www.arcep.fr/actualites/actualites-et-communiques/detail/n/equipements-et-usages-du-numerique-090226.html).
- Terra Nova / Toluna Harris Interactive, 2026-05-18, https://tnova.fr/democratie/nouvelles-pratiques-democratiques/ia-et-politique-vers-un-outil-daide-voire-dinfluence-sur-la-decision/ : 4 145 inscrits interrogés le 15 mars 2026 ; 11 % ont utilisé l'IA pour s'informer sur la campagne municipale (14e et dernière source ; 22 % des jeunes) ; 16 % pour les aider à faire leur choix (7/5/4 % ; 35 % des moins de 25 ans).
- Havas Market via CB News, 2026-06-17 : 2 000 personnes, 19–25 mai 2026 ; 66 % utilisent l'IA générative ; ChatGPT 81 %, Gemini 48 % ; « 86 % des utilisateurs de ChatGPT et 88 % de ceux de Gemini n'y recourent qu'en version gratuite » ; 18–34 ans : 52,5 % consultent d'abord une IA conversationnelle (information, recommandation ou conseil).
- Clubic, 2026-07-22 : AI Overviews et AI Mode déployés en France le 22 juillet 2026.
- Meta, 2025-03-20 : Meta AI déployé dans 41 pays européens, dans Facebook, Instagram, WhatsApp et Messenger.
- Reuters Institute, 2026-10-29, Generative AI and News Report 2026 : neuf pays dont la France, YouGov 14 août–28 sept. 2026 ; usage hebdomadaire 34 % → 51 % (six pays) ; France +21 points ; « getting information » 38 %, actualité 9 % ; 57 % ont vu des réponses générées dans un moteur la semaine passée ; partis politiques : secteur le plus pessimiste dans les neuf pays.
- Arcom, 2026-01-29, Les Français et l'information : « 20% of French people use AI tools for information at least once a week » ; 3 377 personnes de 15 ans et plus.
- Pew, 2026-10-23 : 8 % des adultes américains ; positions 76 %, vérification 71 %, vie et carrière 65 %, choix de vote 40 %, logistique 40 % ; 5 273 adultes, 12–18 oct. 2026.
- Anthropic, 2024-12-12, https://www.anthropic.com/news/elections-ai-2024 : < 0,5 % de l'usage, un peu plus de 1 % avant l'élection américaine ; deux tiers : analyser et expliquer ; tests avant les élections françaises, renvoi vers le site administratif.
- Zu, arXiv 2607.00551 (v2, 2026-07-02) : 4,30 M de conversations, contenu politique 3,9 %, « mostly practical ».
- AP néerlandaise via NOS, 2025-10-21 et 2026-03-12 (https://nos.nl/l/2587227, https://nos.nl/l/2606063) : conseils de vote concentrés sur deux partis (« stofzuigereffect ») ; « Daarop handhaven kan AP niet » ; partis locaux < 1 % ; rapport remis au ministre.
- Dormuth et al., arXiv 2502.15568 : 38 thèses du Wahl-O-Mat ; écarts dans 25 % et plus de 50 % des cas selon l'application ; hallucinations par injection.

### Réactions des éditeurs, institutions (H4, H5, H8)
- AlgorithmWatch, 2023-10-05 et 2023-12-15 (https://algorithmwatch.org/en/bing-chat-election-2023/, https://algorithmwatch.org/en/study-microsofts-bing-chat/) : Microsoft : « Recently, we corrected some of the answers the report cites » ; AlgorithmWatch : « has only corrected the answers to the specific questions we asked » ; « A month later, we took another sample, which showed that little had changed » ; un tiers d'erreurs factuelles, 40 % de réponses évasives ; partenaires AI Forensics, SRF, RTS ; collecte 21 août–2 oct. 2023.
- DRI, 2024-04-11 et 2025-02-12 (URL dans le relevé, Q1) : 400 questions, captures d'écran ; « none of them provided reliably trustworthy answers » ; recommandation à la Commission (art. 34 DSA) ; juin 2024 : « Google had addressed this problem » par le refus ; 2025 : Gemini et Copilot ne répondent à aucune question de processus ; « Gemini delivered the best performance, as it refused to answer political questions entirely ».
- AP via News4Jax, 2024-08-26, et NBC, 2024-08-05 : lettre de cinq secrétaires d'État ; Grok renvoie vers Vote.gov ; fausse information répétée dix jours.
- Brennan Center, 2025-02-13 : 27 signataires ; douze réponses ; moins de la moitié ont rendu un rapport ; pas d'audit indépendant.
- Commission européenne, 2024-03-14 : demandes d'information à Bing, Google Search, Facebook, Instagram, Snapchat, TikTok, YouTube, X sur les risques de l'IA générative (hallucinations, électeurs induits en erreur) ; art. 74(2).
- Pinsent Masons, 2026-09-01 : ChatGPT désigné VLOSE ; « hybrid service » ; conformité d'ici janvier 2027 ; audits annuels indépendants ; évaluation des risques systémiques.
- Euronews, 2026-09-23 : RSF teste six assistants, dépose plainte auprès d'autorités nationales, transmet à la Commission ; la Commission dit avoir envoyé des demandes d'information au titre de l'AI Act.
- EBU, 2025-10-21 : 22 médias publics, 18 pays, 14 langues, plus de 3 000 réponses ; toolkit « intended to help tech companies evaluate, monitor and improve » ; aucune adoption documentée.

### Modèles, réutilisation (H9, H10, H12)
- Gemini, notes de version : 2025-12-17 « Gemini 3 Flash est désormais le nouveau modèle par défaut » ; 3.6 Flash proposé à tous le 2026-07-21 (sans le mot « défaut ») ; 4 Argon pour abonnés le 2026-10-13 ; 3 Pro 2025-11-18, 3.1 Pro 2026-02-19, 3.5 Flash 2026-05-19.
- Anthropic, dépréciations : préavis de 60 jours ; « Researchers lose access to models for ongoing and comparative studies. » ; Sonnet 4.5 retiré le 2026-11-30.
- OpenAI, dépréciations : six mois de préavis ; `chatgpt-4o-latest` retiré le 2026-02-17 ; gpt-5.1 le 2027-04-01.
- Mistral : Medium 3.5 et Large 3 dépréciés le 2026-10-31, retrait le 2027-04-30 ; « Mistral Medium 3.5 becomes the default model in Le Chat » (2026-05-22).
- DeepSeek : 2026-10-17 « The official web and APP models have also been updated » ; 2026-08-13 V4-Pro sur « APP, Web, and API ».
- xAI : grok-4.7 listé, aucune date de sortie, rien sur l'application.
- MIT, 2026-10-30 : jeu fixe relancé « every few days », tableau de bord public ; « What we cannot yet say is how stable those differences are ».
- Zenodo 13823895 (AI Forensics, CC BY 4.0) : 129 vues, 235 téléchargements au 2026-11-10. GitHub ProofNews/aidp : 4 étoiles, 0 fork, dernier commit le 2024-11-07, pas de licence.
- bpb, 2025-02-06 : « Jede Nutzung des Datensatzes, egal welcher Art, wird untersagt », sauf analyse scientifique ou journalistique.
- AfricTivistes + DRI : étude d'avril 2025 publiée le 2025-08-21 (Sénégal).

### Dates et tarifs (C1, C2)
- service-public.gouv.fr A15053 (2026-07-02) : 18 avril et 2 mai 2027. La page ne donne ni la clôture des parrainages ni la date de la liste officielle : ces deux dates de C1 restent non vérifiées par la session.
- Tarifs confirmés sur les pages officielles : gpt-6-luna 0,10/0,50 ; gpt-6-sol 2/10 ; recherche OpenAI 10 $/1 000 ; Sonnet 5.5 2/10, Opus 5.5 4/20, recherche 10 $/1 000, +30 % de jetons, lot −50 %, lecture de cache 0,05× ; Gemini 3.6 Flash 0,75/3,75 puis 1,50/7,50 au 2027-01-01 ; 4 Argon 2/10 puis 4/20 au 2026-12-01 ; recherche Google 14 $/1 000 après 5 000 ; Mistral Large 0,5/1,5, Medium 3.5 sans tarif ; grok-4.7 2/6, recherche 5 $/1 000 ; deepseek-flash 0,3/1,2 en heures pleines ; `perplexity/sonar` 0,25/2,50 ; BCE 1,1193 le 2026-11-09.

## Reste à faire de l'étape 4

- Lot E interrompu (limite d'usage) : Viginum (Légifrance), dossier LINC, Commission des sondages, Badouard, procédure Arcom art. 40, NewsGuard (FAQ, méthode, un an), NPR 2026-08-30.
- PDF que le lecteur n'a pas su extraire : Ipsos bva (IA et politique), rapport EBU.
