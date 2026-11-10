"""Paramètres et hypothèses nommées, communs aux calculs de la passe « hypotheses-structurantes » du 2026-11-10.

Script hors production (scratch/). Stdlib seulement. Chaque valeur porte sa source : ligne du protocole 0.34
(docs/PROTOCOLE.md, numéros de ligne du 2026-11-10), fichier du dépôt, ou URL vérifiée le 2026-11-10.
Un chiffre inconnu est un PARAMÈTRE à fourchette (min, max), jamais une valeur par défaut silencieuse.
Aucun nom de candidat ni de parti : les candidats sont comptés, jamais nommés.

Ce module est importé par les scripts c1_*.py à c5_*.py du même répertoire ; il ne calcule rien seul.
"""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]  # scratch/fondations/2026-11-10 -> racine du dépôt
DATE_DU_JOUR = date(2026, 11, 10)

# =============================================================================== 1. Dates (vérifiées le 2026-11-10)
# service-public.gouv.fr, actualité A15053 (publiée le 2026-07-02, Conseil des ministres du 2026-07-01), lue le
# 2026-11-10 : « le dimanche 18 avril 2027 pour le premier tour », « le dimanche 2 mai 2027 pour le second tour ».
PREMIER_TOUR = date(2027, 4, 18)
SECOND_TOUR = date(2027, 5, 2)
# maire-info.com, article du 2026-09-04 (lu le 2026-11-10) : décret de convocation « au moins dix semaines avant la
# date du premier tour » (soit le 7 février 2027) ; info.gouv.fr/actualite/election-presidentielle-2027 : « à
# confirmer » (page refusée au fetch, HTTP 403 ; lue dans l'extrait du moteur de recherche le 2026-11-10).
DECRET_CONVOCATION_AU_PLUS_TARD = date(2027, 2, 7)
# info.gouv.fr (extrait) et maire-info (lu) : clôture des parrainages « au plus tard le sixième vendredi avant le
# premier tour », le vendredi 12 mars 2027 à 18 h.
FIN_PARRAINAGES = date(2027, 3, 12)
# info.gouv.fr (extrait) et maire-info (lu) : publication de la liste officielle « au plus tard le quatrième vendredi
# avant le scrutin, soit le 26 mars ». Le protocole §3 (ligne 94) dit seulement « mars 2027 ».
LISTE_OFFICIELLE_AU_PLUS_TARD = date(2027, 3, 26)
# PARAMÈTRE : borne basse = lendemain de la clôture des parrainages ; aucune source officielle ne fixe le jour.
LISTE_OFFICIELLE_AU_PLUS_TOT = date(2027, 3, 13)
CAMPAGNE_OFFICIELLE = date(2027, 4, 5)  # info.gouv.fr (extrait de recherche, page 403)
# §10 (ligne 374) : « aucune publication ni communication du projet de la veille de chaque tour à 0 h jusqu'à la
# fermeture des derniers bureaux de vote ».
VEILLES_ELECTORALES = [(date(2027, 4, 17), date(2027, 4, 18)), (date(2027, 5, 1), date(2027, 5, 2))]
# PARAMÈTRE : débats télévisés entre candidats du périmètre avant le second tour. 1 = le seul débat d'entre-deux-
# tours ; 3 = deux débats de premier tour en plus. §6 (ligne 247) : un run supplémentaire sous 72 h après chacun.
DEBATS_TELEVISES = (1, 3)
DEBAT_ENTRE_DEUX_TOURS = date(2027, 4, 28)  # PARAMÈTRE : mercredi de l'entre-deux-tours, par analogie, non vérifié
# §6 (ligne 247) : « Mensuel de décembre 2026 à janvier 2027, puis hebdomadaire de février 2027 jusqu'au second
# tour ». §6 (ligne 234) : fenêtre « ouverte le mardi à 6 h, heure de Paris », 48 h.
DEBUT_HEBDO = date(2027, 2, 1)
MOIS_MENSUELS = [(2026, 12), (2027, 1)]
FENETRE_HEURES = 48
# §12 (ligne 409) : « Le premier résultat public est visé pour la première semaine de décembre 2026 ».
J5_PROTOCOLE = date(2026, 12, 1)


def mardis(debut: date, fin: date) -> list[date]:
    """Tous les mardis de [debut, fin], bornes comprises."""
    d = debut + timedelta(days=(1 - debut.weekday()) % 7)
    out = []
    while d <= fin:
        out.append(d)
        d += timedelta(days=7)
    return out


def premier_mardi_du_mois(annee: int, mois: int) -> date:
    return mardis(date(annee, mois, 1), date(annee, mois, 28))[0]


def runs_reguliers(premier_run: date, fin: date = SECOND_TOUR) -> list[date]:
    """Dates d'ouverture de fenêtre des runs réguliers du §6 à partir du premier run public (inclus).

    PARAMÈTRE de lecture : le §6 ne dit pas quel mardi porte le run mensuel ; on prend le premier mardi du mois.
    Le premier run public ouvre le premier mardi ≥ premier_run ; s'il tombe en décembre ou janvier, les runs
    suivants sont mensuels jusqu'en janvier puis hebdomadaires à partir de février.
    """
    dates = []
    for annee, mois in MOIS_MENSUELS:
        m = premier_mardi_du_mois(annee, mois)
        if m >= premier_run:
            dates.append(m)
    for m in mardis(max(DEBUT_HEBDO, premier_run), fin):
        if m not in dates:
            dates.append(m)
    return sorted(d for d in dates if d >= premier_run)


# =============================================================================== 2. Périmètre (§3 à §6, dossier du 15 oct.)
CANDIDATS = 12  # §5 Tailles (ligne 215) : « environ 400 items pour 12 candidats »
CANDIDATS_RELEVES_15_OCT = 13  # scratch/perimetre/dossier-2026-10-15-final.md, §5.1 : « 13 inclus »
THEMES = 10  # §3 (ligne 105)
ITEMS_P_CIBLE = 30  # §4 Couverture minimale (ligne 177)
SEUIL_COUVERTURE = 10  # §4 (ligne 177) : « moins de 10 items P vérifiés … rapporté à part »
GABARITS_PAR_ITEM_P = 3  # §5 (lignes 185-192) : directe, fermée, négative s'appliquent à un item P
FORMULATIONS = 3  # §5 (ligne 194)
ECHANTILLONS = 2  # §6 (ligne 233) ; levier §12 (ligne 425) : 2 -> 1
ITEMS_A = 40  # hypothèse reprise de scratch/critique/D/faisabilite.py (ITEMS_A = 40)
ITEMS_F_PAR_CANDIDAT = (2, 3)  # PARAMÈTRE ; lot creation-items-f : « nombre d'items F égal par candidat »
ITEMS_O = 12  # PARAMÈTRE (faisabilite.py : « q_o = 12 »)
PART_QUESTIONS_A_F_MIN = 0.20  # §5 (ligne 198)
QUOTA_ATTRIBUTION_PAR_THEME = 2  # hypothèse faisabilite.py (quota déclaré dans config/perimetre.yaml, encore null)
COMPARATEURS = 2  # dossier §5.3 : iFRAP et France-Vote retenus (2 autres sous réserve)
ANNOTATEURS = 2  # §7 (ligne 284) : « Au moins deux annotateurs rémunérés » ; le 3e humain d'arbitrage n'est jamais l'auteur (ligne 272)
TESTEURS = 2  # §6 (ligne 241)
QUESTIONS_APPLICATION_PAR_CANDIDAT = 5  # §6 (ligne 241) : « cinq par candidat interrogé (60 pour 12 candidats) »
REPONSES_JEU_OR = 300  # §7 (ligne 278), §12 J4
REPONSES_CONTREFACTUEL = 200  # §7 (ligne 280) candidats ; 200 de plus pour les outils (ligne 282)
PART_ECHANTILLON_HUMAIN = 0.10  # §7 (ligne 272)
SEUIL_MANQUANTES = 0.20  # §8 (ligne 325)

# Outils retenus par la règle au 15 octobre 2026 (dossier §5.2) et leurs modes (D28-3, D28-4).
# (outil, modes, modèle par défaut du produit grand public : offre gratuite, offre payante, statut de la preuve)
OUTILS = [
    # OpenAI, help center « GPT-6 and other models in ChatGPT » : lu dans l'extrait du moteur de recherche le
    # 2026-11-10 (page refusée au fetch, HTTP 403) : « Plus, Pro, Business, and Enterprise use GPT-6 Sol, while Free
    # and Go use GPT-6 Luna » ; déploiement du 2026-10-07 (payant) et 2026-10-08 (Free, Go).
    ("ChatGPT", ["sans_web", "web"], "gpt-6-luna", "gpt-6-sol", "extrait de recherche (page 403)"),
    # Anthropic : aucune page trouvée qui nomme le modèle par défaut de l'application. claude.com/pricing (extrait) :
    # l'offre gratuite comprend Sonnet et Haiku, pas Opus ; platform.claude.com, models/overview (lu) : « start with
    # Claude Opus 5.5 for most workloads ». PARAMÈTRE : Sonnet 5.5 (gratuit) / Opus 5.5 (payant).
    ("Claude", ["sans_web", "web"], "claude-sonnet-5-5", "claude-opus-5-5", "PARAMÈTRE (non documenté)"),
    # gemini.google/release-notes (lu) : 2025-12-17 « Gemini 3 Flash est désormais le nouveau modèle par défaut » ;
    # 2026-07-21 Gemini 3.6 Flash « offert à tous les utilisateurs » (sans le mot « défaut ») ; 2026-10-13 Gemini 4
    # Argon « pour les abonnés Google AI Pro et Ultra ». Mode web suspendu (D28-4). PARAMÈTRE : 3.6 Flash / 4 Argon.
    ("Gemini", ["sans_web"], "gemini-3.6-flash", "gemini-4-argon", "déduit des notes de version"),
    # mistral.ai/news/vibe-remote-agents-mistral-medium-3-5 (2026-05-22, lu) : « Mistral Medium 3.5 becomes the
    # default model in Le Chat ». Inclus d'office (§3).
    ("Le Chat", ["sans_web", "web"], "mistral-medium-3-5", "mistral-medium-3-5", "page officielle lue"),
    # docs.x.ai/developers/models et /pricing (lus) : grok-4.7 « flagship » ; aucune page lue ne nomme le modèle par
    # défaut de l'application. PARAMÈTRE : grok-4.7.
    ("Grok", ["sans_web", "web"], "grok-4.7", "grok-4.7", "PARAMÈTRE (non documenté)"),
    # perplexity.ai help center, article 10354930 (lu) : « Perplexity's default model is optimized for quick searches
    # and web browsing » ; le modèle n'est pas nommé. Équivalent API posé : `perplexity/sonar` (Agent API, docs lue).
    ("Perplexity", ["web"], "sonar", "sonar", "PARAMÈTRE (défaut non nommé)"),
    # api-docs.deepseek.com/updates (lu) : 2026-10-17 « official web and APP models updated », `deepseek-flash`
    # pointe sur DeepSeek-V4.1-Flash-1017. Pas de recherche web dans l'API (D28-3).
    ("DeepSeek", ["sans_web"], "deepseek-flash", "deepseek-flash", "page officielle lue"),
]
COUPLES_OUTIL_MODE = sum(len(modes) for _, modes, *_ in OUTILS)  # 11
COUPLES_WEB = sum(1 for _, modes, *_ in OUTILS if "web" in modes)  # 5 (faisabilite.py en comptait 4, sans Perplexity)
OUTILS_RETENUS = len(OUTILS)  # 7

# =============================================================================== 3. Tarifs API (USD par million de jetons), vérifiés le 2026-11-10
# (entrée, sortie). Tarif « lot » (Batch) : -50 % chez OpenAI, Anthropic, Google et Mistral (pages lues).
PRIX_USD_PAR_M = {
    # developers.openai.com/api/docs/pricing (lu le 2026-11-10)
    "gpt-6-luna": (0.10, 0.50),
    "gpt-6-sol": (2.00, 10.00),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6-astra": (10.00, 50.00),
    "gpt-5.1": (1.25, 10.00),  # encore listé ; retrait annoncé pour le 2027-04-01 (developers.openai.com/api/docs/deprecations, lu)
    # platform.claude.com/docs/en/about-claude/pricing (lu le 2026-11-10)
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-opus-5-5": (4.00, 20.00),
    "claude-haiku-5-5": (0.10, 0.50),
    "claude-fable-5-2": (8.00, 40.00),
    # aistudio.google.com/docs/pricing (lu le 2026-11-10) ; hausses annoncées : 3.6 Flash 1,50/7,50 au 2027-01-01,
    # 4 Argon 4/20 au 2026-12-01
    "gemini-3.6-flash": (0.75, 3.75),
    "gemini-3.6-flash-2027": (1.50, 7.50),
    "gemini-4-argon": (2.00, 10.00),
    "gemini-4-argon-dec2026": (4.00, 20.00),
    # mistral.ai/pricing (lu le 2026-11-10) : « Mistral Large costs $0.5 /M tokens in and $1.5 /M tokens out » ;
    # aucun tarif affiché pour Medium 3.5 ni Large 4 (préversion publique depuis le 2026-10-06, changelog lu)
    "mistral-large": (0.50, 1.50),
    # docs.x.ai/developers/pricing (lu le 2026-11-10)
    "grok-4.7": (2.00, 6.00),
    # docs.perplexity.ai/getting-started/models (lu le 2026-11-10)
    "sonar": (0.25, 2.50),
    # api-docs.deepseek.com/quick_start/pricing (lu le 2026-11-10) : heures pleines 01-04 h et 06-10 h UTC en semaine ;
    # la fenêtre du mardi 6 h Paris (05 h UTC) couvre des heures pleines : tarif plein retenu en borne haute
    "deepseek-flash": (0.30, 1.20),
    "deepseek-flash-creuses": (0.15, 0.60),
}
# PARAMÈTRE : Mistral Medium 3.5, tarif non affiché sur la page de tarifs. Fourchette bornée par le tarif de Large
# (0,5/1,5) et par le souvenir du tarif de Medium 3 en 2025 (0,4/2, non vérifié en ligne).
PRIX_PARAMETRE = {"mistral-medium-3-5": ((0.40, 0.50), (1.50, 2.00))}
# Recherche web, USD pour 1 000 appels (pages lues le 2026-11-10). Les jetons du contenu de recherche sont facturés
# au tarif du modèle chez OpenAI (« Search content tokens billed at model rates ») et Anthropic (« plus standard
# token costs for search-generated content »).
PRIX_RECHERCHE_WEB_PAR_1000 = {
    "ChatGPT": 10.0,  # developers.openai.com/api/docs/pricing : « $10.00 / 1k calls »
    "Claude": 10.0,  # platform.claude.com pricing : « $10 USD per 1,000 searches »
    "Gemini": 14.0,  # aistudio.google.com/docs/pricing : Gemini 3+ « 5,000 free search requests per month », puis « $14 per 1,000 »
    "Grok": 5.0,  # docs.x.ai/developers/pricing : « $5 per 1,000 calls »
    "Perplexity": 2.5,  # docs.perplexity.ai pricing : Agent API `web_search` « $0.0025 per invocation » (recherche intrinsèque à sonar : borne haute)
}
PRIX_RECHERCHE_WEB_PARAMETRE = {"Le Chat": (0.0, 10.0)}  # mistral.ai/pricing : « Tool APIs are priced per call », montant non affiché
# Tarifs des juges (§4 ligne 149, §7 ligne 266, D26) : Claude Sonnet 5.5 et Mistral Large.
JUGES = {"sonnet-5.5": ("claude-sonnet-5-5", True), "mistral-large": ("mistral-large", False)}
# Écarts avec le 2026-11-02 (scratch/critique/D/faisabilite.py) : Sonnet 5.5 2/10 inchangé ; Mistral Large 0,5/1,5
# inchangé ; gpt-5.1 1,25/10 inchangé mais retiré le 2027-04-01 ; recherche OpenAI 10 $/1k inchangée. Nouveau :
# le modèle par défaut de ChatGPT n'est plus gpt-5.1 mais GPT-6 Luna (gratuit) / GPT-6 Sol (payant).

# =============================================================================== 4. Jetons et volumes (hypothèses reprises de faisabilite.py)
JETONS_PAR_CARACTERE_FR = 1 / 3.5  # ordre de grandeur pour du français (tokeniseurs BPE récents)
SURCOUT_TOKENISEUR_CLAUDE = 1.30  # platform.claude.com pricing (lu) : « approximately 30% more tokens for the same text »
SORTIE_OUTIL_JETONS = 400  # réponse moyenne d'un assistant (plafond §6 ligne 230 : 2 048)
ENTREE_OUTIL_JETONS = 60  # la question seule, sans instruction système (§6 ligne 228)
RECHERCHES_PAR_REPONSE_WEB = 1.5
JETONS_CONTENU_RECHERCHE = 3000
LIENS_PAR_REPONSE_WEB = 3.0
LIENS_PAR_REPONSE_SANS_WEB = 0.5
CARACTERES_PAR_PAGE_CITEE = 15000  # borne §7 / annexe D : 50 000
JETONS_REFERENCES = 600
JETONS_SORTIE_JUGE = 120
JETONS_SORTIE_REFORMULATION = 120  # PARAMÈTRE : deux formulations courtes
CARACTERES_CORPUS_T1_PAR_CANDIDAT = (150_000, 600_000)  # PARAMÈTRE : programme + site, 50 à 200 pages
JETONS_SORTIE_EXTRACTION_PAR_CANDIDAT = 15_000  # PARAMÈTRE : ~50 propositions structurées par modèle
PART_SOURCES_REEXTRAITES = 0.25  # PARAMÈTRE : §4 « texte extrait erroné » renvoie la source à la réextraction
RUNS_PAR_MOIS_HEBDO = 52 / 12
# Taux de change : ecb.europa.eu, taux de référence USD/EUR lu le 2026-11-10 (voir TAUX_CHANGE_SOURCE) ;
# faisabilite.py posait 0,9 en ordre de grandeur.
TAUX_CHANGE_SOURCE = ("BCE, taux de référence du 9 novembre 2026 : 1 EUR = 1,1193 USD "
                      "(ecb.europa.eu, eurofxref-graph-usd, lu le 2026-11-10)")
TAUX_CHANGE_EUR_PAR_USD = 1 / 1.1193


def jetons(caracteres: float, claude: bool = False) -> float:
    t = caracteres * JETONS_PAR_CARACTERE_FR
    return t * SURCOUT_TOKENISEUR_CLAUDE if claude else t


def caracteres_prompt(nom: str) -> int:
    """Longueur du prompt versionné dans prompts/ (texte du prompt pour le juge, fichier entier sinon)."""
    texte = (RACINE / "prompts" / nom).read_text(encoding="utf-8")
    if nom.startswith("judge"):
        import re

        m = re.search(r"## Texte du prompt.*?```text\n(.*?)```", texte, re.S)
        assert m, "prompt juge introuvable"
        return len(m.group(1))
    return len(texte)


# =============================================================================== 5. Charge humaine (fourchettes)
MIN_PAR_ITEM_VALIDATION = (5, 15)  # brief de la passe : 5 à 15 min par item et par annotateur
MIN_PAR_NOTATION_REPONSE = (2, 5)  # faisabilite.py posait (2, 3) ; élargi à 5 (lecture des pages citées)
MIN_PAR_LECTURE_COMPARATEUR = 0.75  # faisabilite.py
MIN_PAR_RELECTURE_FORMULATION = (1, 2)  # PARAMÈTRE : les trois formulations relues ensemble avec l'item (§5 ligne 194)
MIN_PAR_RELECTURE_MESURE_AUTEUR = (1, 2)  # PARAMÈTRE : §4 (ligne 165), relecture de chaque mesure par l'auteur
MESURES_PAR_ITEM_P = (0.5, 0.8)  # PARAMÈTRE : part de mesures distinctes parmi les items P (mesures partagées entre candidats)
TAUX_DESACCORD_VALIDATION = (0.10, 0.20)  # PARAMÈTRE : items en arbitrage (cohérent avec kappa ≥ 0,80, §4 ligne 161)
MIN_PAR_ARBITRAGE_AUTEUR = (3, 5)  # PARAMÈTRE
ITEMS_ENTRAINEMENT = 30  # §4 (ligne 153)
TAUX_DESACCORD_JUGES = (0.15, 0.25)  # faisabilite.py
TAUX_ACCORD_PARTIEL = (0.05, 0.10)
TAUX_DESACCORD_HUMAINS = 0.20
TAUX_FABRICATION = (0.10, 0.25)
PART_QUESTIONS_ATT = 0.05
TAUX_MAUVAISE_ATTRIBUTION_ATT = (0.30, 0.50)
PART_RUNS_AVEC_NOUVELLE_SOURCE_T1 = 0.25
MINUTES_REVERIFICATION_A = 3.0
MIN_PAR_SAISIE_APPLICATION = (3, 6)  # brief : saisie + copie + capture
TAUX_HORAIRE_TESTEUR_EUR = (15, 30)  # PARAMÈTRE : rémunération horaire d'un testeur ou annotateur
HEURES_ANNOTATEUR_PAR_SEMAINE = (5, 10)  # PARAMÈTRE : disponibilité de chaque annotateur
PART_LECTURES_COMPARATEUR_REPRISES = (0.5, 0.8)  # PARAMÈTRE : levier §12, page archivée de même empreinte
HEURES_AUTEUR_PAR_RUN_CIBLE = 3  # §12 (ligne 425)
COUT_API_MENSUEL_CIBLE_EUR = 600  # §12 (ligne 425)

# =============================================================================== 6. Feuille de route (lue au lancement)
FEUILLE = RACINE / "docs" / "feuille-de-route.json"
LOTS_HORS_CHEMIN_CRITIQUE = {"generalisation-politique-francaise"}  # J6, après 2027


def lots_feuille() -> list[dict]:
    return json.loads(FEUILLE.read_text(encoding="utf-8"))["lots"]


def heures_auteur_feuille() -> dict[str, float]:
    """temps_auteur_h de chaque lot non T4 et hors J6, tel que la feuille de route le déclare."""
    return {
        lot["id"]: float(lot["temps_auteur_h"])
        for lot in lots_feuille()
        if lot["niveau"] != "T4" and lot["id"] not in LOTS_HORS_CHEMIN_CRITIQUE
    }


def fourchette(x):
    """(min, max) d'un paramètre, ou (x, x) pour une constante."""
    return tuple(x) if isinstance(x, (tuple, list)) else (x, x)
