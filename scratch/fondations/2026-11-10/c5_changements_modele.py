"""C5 : changements du modèle par défaut des produits grand public, 2025-11-01 → 2026-11-01, et ce que le protocole prévoit (H9).

Usage : python3 scratch/fondations/2026-11-10/c5_changements_modele.py   (depuis la racine du dépôt)

Pour chaque éditeur du périmètre : événements datés d'après les pages officielles lues le 2026-11-10 (statut de
chaque date : « lu » = lu sur la page officielle ; « extrait » = page officielle refusée au fetch (HTTP 403), lue
dans l'extrait du moteur de recherche ; « déduit » = date déduite d'un autre fait officiel, dit lequel ;
« paramètre » = date non lue, posée au milieu du mois probable). Deux comptages par éditeur : bas = seuls les
changements explicitement documentés comme « par défaut » du produit grand public ; haut = toute sortie d'un
modèle mis à la disposition de tous les utilisateurs de l'application. Puis : médiane des intervalles, rythme
mensuel, changements attendus sur six mois (décembre 2026 → mai 2027) si le rythme se maintient, probabilité
d'au moins un changement (Poisson). Enfin le texte exact du protocole 0.34 (§6 Modèle, §8 Tendance, §7 juges, §9).
"""

from __future__ import annotations

import math
import statistics
from datetime import date

DEBUT, FIN = date(2025, 11, 1), date(2026, 11, 1)
CAMPAGNE_MOIS = 6  # décembre 2026 → mai 2027 (§6 ligne 247 ; §12 ligne 421 : rapport sous 30 jours après le second tour)

# (date, événement, statut de la date, compte dans « bas » ?, compte dans « haut » ?)
# « haut » exclut un changement de nom et une préversion réservée à l'API : seuls comptent les modèles généralistes
# sortis et plausiblement servis par l'application. Les changements de préréglages de l'API Perplexity sont listés
# pour mémoire et comptés dans aucune colonne (ce n'est pas l'application).
EVENEMENTS = {
    "ChatGPT (OpenAI)": [
        (date(2025, 11, 13), "GPT-5.1 dans ChatGPT (instantané API gpt-5.1-2025-11-13 ; help center : nouveau défaut)", "déduit de l'instantané API (page des dépréciations, lue) ; défaut : extrait", True, True),
        (date(2025, 12, 15), "GPT-5.2 (« Introducing GPT-5.2 » ; retiré de ChatGPT le 2026-06-12 au profit de GPT-5.5)", "paramètre : mois déduit du nom gpt-5.2-chat-latest (déprécié le 2026-05-08, page lue), jour non lu", True, True),
        (date(2026, 3, 5), "GPT-5.4 (« Launched March 5, 2026 » ; GPT-5.4 Thinking remplace GPT-5.2 Thinking)", "extrait (help center, 403)", True, True),
        (date(2026, 5, 1), "GPT-5.5 Instant devient le modèle par défaut (openai.com/index/gpt-5-5-instant, 403)", "paramètre : entre mars et le 2026-06-12 (retrait de GPT-5.2), jour non lu", True, True),
        (date(2026, 7, 9), "GPT-5.6 : Sol nouveau modèle phare (payant), Terra, Luna", "extrait (help center / openai.com, 403)", True, True),
        (date(2026, 8, 15), "GPT-5.6 Luna devient le défaut des offres Free et Go (« in August »)", "paramètre : mois lu en extrait, jour non lu", True, True),
        (date(2026, 10, 8), "GPT-6 : Sol pour Plus, Pro, Business, Enterprise (7 oct.) ; Luna pour Free et Go (8 oct.)", "extrait (help center « GPT-6 and other models in ChatGPT », 403)", True, True),
    ],
    "Claude (Anthropic) — ligne Sonnet (offre gratuite : Sonnet et Haiku, claude.com/pricing en extrait)": [
        (date(2026, 2, 17), "Claude Sonnet 4.6", "déduit : retrait « not sooner than February 17, 2027 » = sortie + 12 mois (page des dépréciations, lue) ; Perplexity changelog : ajouté en mars 2026", False, True),
        (date(2026, 6, 30), "Claude Sonnet 5", "déduit : « not sooner than June 30, 2027 » ; Perplexity : juin 2026", False, True),
        (date(2026, 9, 28), "Claude Sonnet 5.5", "déduit : « not sooner than September 28, 2027 » ; Perplexity : septembre 2026", False, True),
    ],
    "Claude (Anthropic) — ligne Opus (offres payantes)": [
        (date(2025, 11, 24), "Claude Opus 4.5", "déduit : « not sooner than November 24, 2026 » (instantané 20251101)", False, True),
        (date(2026, 2, 5), "Claude Opus 4.6", "déduit : « not sooner than February 5, 2027 »", False, True),
        (date(2026, 4, 16), "Claude Opus 4.7 (nouveau tokeniseur, +30 % de jetons)", "déduit : « not sooner than April 16, 2027 » ; Perplexity : avril 2026", False, True),
        (date(2026, 5, 28), "Claude Opus 4.8", "déduit : « not sooner than May 28, 2027 » ; Perplexity : mai 2026", False, True),
        (date(2026, 7, 24), "Claude Opus 5", "déduit : « not sooner than July 24, 2027 » ; Perplexity : juillet 2026", False, True),
        (date(2026, 9, 22), "Claude Opus 5.5 (« start with Claude Opus 5.5 for most workloads », models/overview lu)", "déduit : « not sooner than September 22, 2027 » ; Perplexity : septembre 2026", False, True),
    ],
    "Gemini (Google), application": [
        (date(2025, 11, 18), "Gemini 3 Pro « déployé pour tous les utilisateurs de l'appli Gemini »", "lu (gemini.google/release-notes)", False, True),
        (date(2025, 12, 17), "Gemini 3 Flash « le nouveau modèle par défaut dans l'appli Gemini »", "lu", True, True),
        (date(2026, 2, 19), "Gemini 3.1 Pro « déployé dans le monde entier dans l'appli Gemini »", "lu", False, True),
        (date(2026, 5, 19), "Gemini 3.5 Flash, « déploiement en cours dans le monde entier », choisi dans le menu", "lu", False, True),
        (date(2026, 7, 21), "Gemini 3.6 Flash offert « à tous les utilisateurs »", "lu", False, True),
        (date(2026, 10, 13), "Gemini 4 Argon « pour les abonnés Google AI Pro et Ultra » (pas l'offre gratuite)", "lu", False, True),
    ],
    "Le Chat / Vibe (Mistral AI)": [
        (date(2025, 12, 2), "Mistral Large 3 publié (aucune phrase sur Le Chat dans l'annonce)", "lu (mistral.ai/news/mistral-3)", False, True),
        (date(2026, 5, 22), "Mistral Medium 3.5 « becomes the default model in Le Chat »", "lu (mistral.ai/news/vibe-remote-agents-mistral-medium-3-5)", True, True),
        (date(2026, 8, 12), "Le Chat renommé Vibe (help center) — changement de nom, pas de modèle documenté", "extrait (help.mistral.ai, date du help center ; le changelog API place le lancement de Vibe au 26 mai)", False, False),
        (date(2026, 10, 6), "Mistral Large 4 en préversion publique (API) ; rien sur Le Chat", "lu (docs.mistral.ai changelog)", False, False),
    ],
    "Grok (xAI), application": [
        (date(2025, 11, 17), "Grok 4.1 « à tous les utilisateurs sur grok.com, X et les applications » (mode Auto)", "extrait (x.ai/news/grok-4-1, 403 ; fiche modèle datée du 17 nov. 2025)", True, True),
        (date(2026, 4, 7), "Grok 4.20 « publicly available through the consumer web and mobile apps » (fiche système)", "extrait (data.x.ai, fiche système du 2026-04-07) ; API en mars 2026 (notes de version lues)", True, True),
        (date(2026, 7, 15), "Grok 4.5 sur l'API (consommateur non confirmé)", "lu (docs.x.ai release notes, mois seul) ; jour : paramètre", False, True),
        (date(2026, 8, 15), "Grok 4.6 sur l'API (consommateur non confirmé)", "lu (mois seul) ; jour : paramètre", False, True),
        (date(2026, 9, 15), "Grok 4.7 sur l'API, « flagship » (consommateur non confirmé)", "lu (mois seul) ; jour : paramètre", False, True),
    ],
    "Perplexity, application (« Best », modèle par défaut non nommé)": [
        # Aucun changement documenté d'un modèle par défaut nommé : le help center (art. 10354930, lu) décrit « Perplexity's
        # default model » sans le nommer. Le churn visible est celui des préréglages de l'Agent API (changelog lu).
        (date(2026, 7, 15), "Agent API : préréglage `low` passe à openai/gpt-5.6-luna ; Sonar Chat Completions devient l'Agent API", "lu (mois seul) ; jour : paramètre", False, False),
        (date(2026, 8, 15), "Agent API : préréglage `fast` passe à openai/gpt-6-luna", "lu (mois seul) ; jour : paramètre", False, False),
        (date(2026, 9, 15), "Agent API : `xhigh` passe à anthropic/claude-opus-5-5 ; `low`, `medium`, `high` passent à la famille GPT-6", "lu (mois seul) ; jour : paramètre", False, False),
        (date(2026, 10, 28), "Agent API : `high@2026-10-28.0` passe à openai/gpt-6.1-terra (quatre réglages datés du 16 au 29 octobre)", "lu", False, False),
    ],
    "DeepSeek, application et site": [
        (date(2025, 12, 1), "DeepSeek-V3.2 (entrée du changelog : API ; deepseek-chat / deepseek-reasoner = modes de V3.2)", "lu (api-docs.deepseek.com/updates) ; application non mentionnée dans l'entrée", False, True),
        (date(2026, 4, 24), "DeepSeek-V4 (V4-Pro et V4-Flash) ; entrée du changelog : API", "lu ; application non mentionnée dans l'entrée (news « v4-preview » non lue)", False, True),
        (date(2026, 8, 13), "DeepSeek-V4-Pro GA « rolled out on the APP, Web, and API »", "lu", True, True),
        (date(2026, 10, 17), "DeepSeek-V4.1-Flash-1017 : « official web and APP models updated » ; deepseek-flash", "lu", True, True),
    ],
}

CITATIONS = [
    ("§6, tableau « Modèle » (ligne 227)", "L'identifiant de modèle par défaut du produit grand public de l'éditeur à la date du run, tel que documenté publiquement ; la page qui le documente est archivée avec le run | Mesurer ce que les gens utilisent, pas le meilleur modèle du catalogue"),
    ("§6, « Enregistré » (ligne 235)", "Requête complète, réponse brute complète (texte, appels d'outils, citations, liens), identifiant de version renvoyé par l'API, horodatage, latence, erreurs"),
    ("§8, « Tendance (QR7, H5) » (ligne 319)", "Le modèle de chaque outil à chaque run est publié avec la tendance. C'est le modèle demandé, inscrit au gel, avec les identifiants de modèle renvoyés par l'API et leurs effectifs, comptés par outil sur toutes les réponses obtenues du run sur le canal API, les deux modes confondus ; les réponses sans identifiant renvoyé sont comptées à part. Toute autre analyse temporelle est exploratoire."),
    ("§7, « Calibration et fiabilité publiée » (ligne 278), pour les juges seulement", "Tout juge dont le modèle ou les réglages changent, qu'il soit retravaillé ou que son éditeur retire son modèle, est mesuré à nouveau sur le jeu d'or, aux seuils de la section 12, avant son premier run ; la tendance (section 8) qui compare des runs notés par des juges différents porte la mention de ce changement."),
    ("§4, « Extraction double » (ligne 149), pour le modèle Mistral de l'extraction et du juge", "Le modèle Mistral de l'extraction et du juge (section 7) est figé à la version 1.0 : c'est Mistral Large 4 si, au gel de la version 1.0, il est en disponibilité générale et qu'aucun retrait n'en est annoncé avant le second tour ; sinon, c'est le plus récent des modèles Mistral en disponibilité générale qui remplit la même condition."),
    ("§9, « Procédure d'amendement du protocole » (ligne 351)", "Un amendement est nécessaire pour toute modification des sections 3 à 8 ou des prompts des juges. Il est numéroté, daté, motivé, publié avant d'être appliqué, et n'est jamais appliqué rétroactivement à un run déjà publié. Les résultats produits avant et après un amendement sont rapportés séparément et ne sont comparés qu'avec la mention de l'amendement."),
    ("§3, « Outils évalués » (ligne 103)", "La liste nominative des outils est fixée à la version 1.0, publiée, et ne bouge qu'en cas de disparition d'un outil ou de sortie d'un nouvel outil remplissant la règle (amendement, section 9)."),
    ("§11 (ligne 404)", "La liste des outils est figée. Un outil apparu après la version 1.0 n'est pas mesuré, et un outil qui ne répond plus est marqué « run incomplet » (section 8)"),
]


def stats(dates: list[date]) -> dict[str, float | None]:
    dates = sorted(d for d in dates if DEBUT <= d <= FIN)
    n = len(dates)
    intervalles = [(b - a).days for a, b in zip(dates, dates[1:])]
    mediane = statistics.median(intervalles) if intervalles else None
    taux_mois = n / 12.0
    attendu = taux_mois * CAMPAGNE_MOIS
    p_au_moins_un = 1 - math.exp(-attendu) if attendu > 0 else 0.0
    return {"n": n, "mediane_j": mediane, "taux_mois": taux_mois, "attendu_6_mois": attendu, "p_au_moins_un": p_au_moins_un}


def main() -> None:
    print(f"C5. Changements de modèle par défaut, fenêtre {DEBUT} → {FIN} ; campagne de {CAMPAGNE_MOIS} mois (déc. 2026 → mai 2027)")
    print("  | éditeur / produit | changements documentés « par défaut » (bas) | sorties mises à disposition de tous (haut) | intervalle médian (j), haut | changements attendus sur 6 mois, bas–haut | P(≥ 1 changement) bas–haut | statut des dates |")
    print("  |---|---|---|---|---|---|---|")
    for editeur, evts in EVENEMENTS.items():
        bas = stats([d for d, _, _, b, _ in evts if b])
        haut = stats([d for d, _, _, _, h in evts if h])
        statuts = sorted({s.split(" ")[0].rstrip(" :;") for _, _, s, _, _ in evts})
        med = f"{haut['mediane_j']:.0f}" if haut["mediane_j"] is not None else "—"
        print(f"  | {editeur} | {bas['n']} | {haut['n']} | {med} | {bas['attendu_6_mois']:.1f}–{haut['attendu_6_mois']:.1f} | {bas['p_au_moins_un']:.2f}–{haut['p_au_moins_un']:.2f} | {', '.join(statuts)} |")
    print("\n  Détail des événements (date, fait, statut de la date, compté dans « bas »)")
    for editeur, evts in EVENEMENTS.items():
        print(f"  {editeur}")
        for d, fait, statut, b, h in evts:
            etiquette = "[défaut]" if b else ("[sortie]" if h else "[hors compte]")
            print(f"    {d}  {etiquette}  {fait}  — {statut}")
    print("\n  Lecture : « bas » compte les seuls changements qu'une page officielle appelle « par défaut » du produit grand public ; « haut » compte toute sortie "
          "offerte à tous les utilisateurs de l'application. Pour Claude et Grok, aucune page lue ne nomme le modèle par défaut de l'application : les deux lignes "
          "Claude sont des bornes, pas des faits ; pour Perplexity, le défaut n'est pas nommé du tout, le churn mesuré est celui de l'API. "
          "Les dates « déduit » d'Anthropic reposent sur l'hypothèse « retrait au plus tôt = sortie + 12 mois » (non écrite sur la page ; cohérente avec l'instantané 20251101 d'Opus 4.5).")

    print("\n  Ce que le protocole 0.34 prévoit, mot pour mot, quand le modèle par défaut change en cours de campagne :")
    for ou, texte in CITATIONS:
        print(f"  - {ou} : « {texte} »")
    print("\n  Ce que ces textes disent, sans interprétation : (1) le modèle interrogé suit le défaut de l'éditeur à chaque run, et la page qui le documente est "
          "archivée ; (2) la tendance publie le modèle de chaque run, mais aucun passage ne demande de rapporter séparément les résultats d'avant et d'après un "
          "changement de modèle d'un OUTIL ; (3) la séparation « avant et après » du §9 ne vaut que pour un amendement du protocole (sections 3 à 8, prompts des "
          "juges) ; (4) le changement du modèle d'un JUGE impose une nouvelle mesure sur le jeu d'or et une mention sur la tendance ; (5) pour Perplexity, et pour "
          "Claude et Grok tant qu'aucune page ne nomme le défaut de l'application, la case « tel que documenté publiquement » du §6 n'a pas de source à archiver.")


if __name__ == "__main__":
    main()
