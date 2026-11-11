# Étape 2 — chaîne d'utilité et hypothèses (session, 2026-11-10)

Commit `4f51416` (main), protocole 0.34, non gelé. Session : Fable 5.1 (claude-fable-5-1), effort max
(variable CLAUDE_CODE_EFFORT_LEVEL non définie). Première passe : aucun registre.

## La chaîne d'utilité, telle que les textes la laissent lire

| Maillon | Ce que les textes disent |
| --- | --- |
| mesure | Exactitude, fabrication, symétrie, sourçage de réponses d'API « sans instruction système » à des questions engendrées mécaniquement depuis des positions programmatiques, N outils × 2 modes × 3 formulations × 2 échantillons (§2, §5, §6). Application : 5 questions par candidat, une fois par mois, exploratoire (§6). |
| publication | Site statique régénéré à chaque run, rapport et note éditoriale ; données, réponses brutes, notations, code, Zenodo (§9) ; erreurs graves in extenso (§8) ; phrase « Ce que les résultats ne disent pas » en tête (§8). |
| destinataire | Éditeurs : « rapport mensuel avec ses réponses notées » (§6). Arcom, Viginum, CNIL : « pour information », « sans qu'aucune … n'ait de rôle » (§10). Page pédagogique : « un électeur, un journaliste ou un éditeur d'outil » (PLAN-PAGE-PEDAGOGIQUE). Rien d'autre — cherchés en vain dans PROTOCOLE.md : « diffusion », « presse », « destinataire », « lecteur visé ». |
| action | « Les éditeurs peuvent donc corriger leurs outils sur ces questions : c'est l'effet recherché » (§5) ; réponse publique de l'éditeur (§6) ; droit de réponse des campagnes (§4). Rien sur ce qu'un régulateur, une rédaction ou un électeur ferait. |
| effet pour l'électeur | Rien — cherchés en vain : « utilité », « impact », « mesure de succès ». |

Le protocole est complet sur le premier maillon, précis sur le deuxième, et presque muet sur les trois
derniers. Chaque hypothèse ci-dessous porte un maillon.

## Hypothèses (H1 à H12 = pistes P1 à P12 de references/pistes.md)

| # | Hypothèse (telle que le protocole la pose) | Maillon | Falsification | Tomberait |
| --- | --- | --- | --- | --- |
| H1 | Ce que l'API répond renseigne sur ce que l'électeur lit | mesure | écart API/application grand et systématique documenté ailleurs ; garde-fous électoraux propres aux applications | canal principal, sens des chiffres de tête |
| H2 | Les outils mesurés sont ceux par lesquels l'électeur passe | mesure | la majorité de l'usage d'IA pour s'informer passe par des intermédiaires hors règle (réponses générées des moteurs, assistants intégrés) | règle d'inclusion §3, liste figée |
| H3 | Les erreurs qui comptent portent sur les positions programmatiques | mesure | les requêtes réelles et les dommages documentés portent surtout ailleurs (modalités du vote, biographie, « pour qui voter ») | objet §2, exclusions §3 |
| H4 | Un éditeur corrige son outil parce que le chiffre est publié | action | après des audits comparables : rien, ou rustine, ou refus généralisé de répondre | forme du rapport aux éditeurs, place du taux de non-réponse |
| H5 | Quelqu'un agit sur un résultat publié sur un site | destinataire | les audits comparables n'ont eu d'effet que portés vers un destinataire précis, sous une forme adaptée | absence de travail de diffusion dans la feuille de route |
| H6 | Le premier résultat arrive assez tôt pour servir | publication | le calendrier réaliste laisse trop peu de runs avant le premier tour pour une correction, une tendance, un usage | §12, §6 calendrier, étendue du premier run |
| H7 | Chaque couche de rigueur ajoute de la crédibilité qui sert | mesure | des audits plus légers ont pesé autant ; les attaques réelles ne visaient pas ce que les couches coûteuses protègent | étendue de la règle 3, §4 double validation, §7 échantillon, §6 2×3×2 |
| H8 | Seul et sans partenaire, le projet porte plus loin | destinataire | les audits qui ont eu des suites étaient portés ou relayés par une structure ; des structures françaises font déjà ce travail avec des manques déclarés | §1 « particulier », §11 « une personne », gouvernance |
| H9 | Un protocole gelé une fois pour toutes sert mieux qu'un protocole qui suit le terrain | mesure/publication | les modèles par défaut changent plusieurs fois en six mois ; les études longitudinales comparables ont des règles de mise à jour écrites d'avance | liste figée §3, refus d'affiner après gel |
| H10 | Un site statique de taux par outil est la forme qui change quelque chose | publication | les formes qui ont porté ailleurs sont d'autres (cas in extenso, jeu de questions rejouable, note courte, jeu de données de positions) | lot site, ordre des livrables, règle 1 pour son étendue |
| H11 | Publier, c'est réussir | effet | aucune mesure de résultat n'est définie ; des projets comparables en ont une et l'ont suivie | §1 engagements, feuille de route J6 |
| H12 | Le projet s'arrête au second tour | effet | la valeur durable des audits comparables fut la méthode et les données réutilisées | lot generalisation (T0, 2026-11-03), forme du code et des docs |

## Ce que le protocole répond déjà (à revérifier à l'étape 4)

- H1 : §11 déclare la limite (« API et application ne sont pas la même chose ») et §6 mesure l'écart sur un petit échantillon. Déclarer n'est pas répondre à la question d'utilité : si l'écart est grand, la mesure principale renseigne peu l'électeur.
- H2 : §11 « La liste des outils dépend d'un classement de stores », « les intermédiaires sans API … sont hors champ ». Même remarque.
- H3 : §3 justifie l'exclusion de la biographie (autre vérité de référence, risque juridique). Ne dit rien de la part du besoin couverte.
- H4 : §5 et §11 « La mesure est réactive ». La correction est supposée, jamais observée.
- H6 : §12 « un jalon non atteint décale la publication plutôt que d'en abaisser la qualité » : la tension est tranchée dans un sens, sans chiffre.
- H7 : §12 cibles de charge, D66 (plafonds mesurés au pilote). Le pilote mesurera le coût, pas le rendement.
- H9 : §9 procédure d'amendement ; §3 amendement pour disparition ou sortie d'un outil ; critique 2026-11-02 a écarté la réapplication automatique de la règle des stores (casse la tendance).
- H12 : lot generalisation-politique-francaise (décidé le 2026-11-03, après 2027, protocole distinct).
