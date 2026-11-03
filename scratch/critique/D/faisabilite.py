"""Critique du protocole 0.26, groupe D (science ouverte, droit, faisabilité) — calculs jetables.

Script hors production (scratch/). Stdlib seulement. Tous les chiffres d'entrée sont soit lus dans le
protocole, soit des hypothèses nommées ci-dessous, soit des tarifs vérifiés en ligne le 2026-11-02 :
  - Claude Sonnet 5.5 : 2 $/M jetons en entrée, 10 $/M en sortie (lot : 1 $/5 $) ; les modèles Claude
    4.7 et suivants produisent « environ 30 % de jetons de plus pour le même texte »
    (https://platform.claude.com/docs/en/about-claude/pricing).
  - Mistral Large : 0,5 $/M en entrée, 1,5 $/M en sortie (https://mistral.ai/pricing).
  - OpenAI gpt-5.1 : 1,25 $/M en entrée, 10 $/M en sortie ; outil de recherche web : 10 $ pour
    1 000 appels, plus les jetons de contenu (https://developers.openai.com/api/docs/pricing).

Usage : python scratch/critique/D/faisabilite.py
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]

# ----------------------------------------------------------------------------- périmètre (§3, §5, §6)
CANDIDATS = 12  # §5 « Tailles » : « environ 400 items pour 12 candidats » (13 au relevé du 15 oct.)
THEMES = 10
ITEMS_P_PAR_CANDIDAT = 30  # §4 « Couverture minimale » : objectif
# Outils retenus par la règle au 15 octobre 2026 (scratch/perimetre/dossier-2026-10-15-final.md) :
# ChatGPT (2 modes), Claude (2), Gemini (1 : web suspendu, D28-4), Le Chat (2), Grok (2),
# Perplexity (1 ou 2), DeepSeek (1 : pas de recherche web, D28-3).
OUTILS = 7
COUPLES_OUTIL_MODE = 11  # somme des modes ci-dessus avec Perplexity à 1 mode
FORMULATIONS = 3  # §5
ECHANTILLONS = 2  # §6 ; levier §12 : 2 -> 1
COMPARATEURS = 2  # retenus au 15 oct. (iFRAP, France-Vote) ; 2 de plus « sous réserve »

# ----------------------------------------------------------------------------- hypothèses nommées
JETONS_PAR_CARACTERE_FR = 1 / 3.5  # ordre de grandeur pour du français (tokeniseurs BPE récents)
SURCOUT_TOKENISEUR_CLAUDE = 1.30  # page de tarifs Anthropic : ~30 % de jetons de plus (Claude 4.7+)
SORTIE_OUTIL_JETONS = 400  # réponse moyenne d'un assistant (plafond §6 : 2 048)
ENTREE_OUTIL_JETONS = 60  # la question seule, sans instruction système (§6)
RECHERCHES_PAR_REPONSE_WEB = 1.5  # appels de l'outil de recherche par réponse en mode web
JETONS_CONTENU_RECHERCHE = 3000  # jetons de contenu de recherche facturés au tarif du modèle
LIENS_PAR_REPONSE_WEB = 3.0  # liens cités par réponse en mode web (Perplexity en cite souvent plus)
LIENS_PAR_REPONSE_SANS_WEB = 0.5  # liens cités de mémoire par une réponse sans recherche
CARACTERES_PAR_PAGE_CITEE = 15000  # texte moyen d'une page transmise au juge (borne §7/annexe D : 50 000)
JETONS_REFERENCES = 600  # items de référence transmis au juge (une Q-ATT en porte jusqu'à n candidats)
JETONS_SORTIE_JUGE = 120
PRIX = {
    # (entrée $/M, sortie $/M)
    "sonnet-5.5": (2.0, 10.0),
    "sonnet-5.5-lot": (1.0, 5.0),
    "mistral-large": (0.5, 1.5),
    "gpt-5.1": (1.25, 10.0),
}
PRIX_RECHERCHE_WEB_PAR_APPEL = 10.0 / 1000  # OpenAI, 10 $ pour 1 000 appels
RUNS_PAR_MOIS_HEBDO = 52 / 12
TAUX_CHANGE_EUR_PAR_USD = 0.9  # ordre de grandeur, sans effet sur les conclusions

# Charge humaine (§7) : hypothèses sur les taux, à lire comme des fourchettes.
TAUX_DESACCORD_JUGES = (0.15, 0.25)  # catégorie, drapeaux, fraîcheur ou sourçage valide différents
TAUX_ACCORD_PARTIEL = (0.05, 0.10)  # accord sur tout cela, mais motif ou champ de sourçage différent
TAUX_DESACCORD_HUMAINS = 0.20  # part de l'échantillon où les deux humains divergent (troisième humain)
PART_QUESTIONS_A_F = 0.20  # §5 : « au moins 20 % des questions de chaque run »
TAUX_FABRICATION = (0.10, 0.25)  # réponses aux items A/F marquées fabrication par un juge au moins
PART_QUESTIONS_ATT = 0.05  # questions d'attribution (quota par thème, déclaré séparément)
TAUX_MAUVAISE_ATTRIBUTION_ATT = (0.30, 0.50)  # Q-ATT : au moins un candidat cité à tort
MINUTES_PAR_NOTATION_HUMAINE = (2.0, 3.0)  # lecture de la réponse, de la référence et des pages citées
MINUTES_PAR_LECTURE_COMPARATEUR = 0.75
ITEMS_A = 40
MINUTES_REVERIFICATION_A = 3.0
PART_RUNS_AVEC_NOUVELLE_SOURCE_T1 = 0.25


def jetons(caracteres: float, claude: bool = False) -> float:
    t = caracteres * JETONS_PAR_CARACTERE_FR
    return t * SURCOUT_TOKENISEUR_CLAUDE if claude else t


def jetons_prompt_juge() -> int:
    texte = (RACINE / "prompts" / "judge-1.0.0.md").read_text(encoding="utf-8")
    m = re.search(r"## Texte du prompt.*?```text\n(.*?)```", texte, re.S)
    assert m, "prompt juge introuvable"
    return len(m.group(1))


@dataclass
class Volume:
    questions: int
    echantillons: int

    @property
    def reponses_par_question(self) -> int:
        return FORMULATIONS * self.echantillons * COUPLES_OUTIL_MODE

    @property
    def reponses(self) -> int:
        return self.questions * self.reponses_par_question

    @property
    def reponses_web(self) -> int:
        # couples en mode web : ChatGPT, Claude, Le Chat, Grok (4 sur 11 couples)
        return self.questions * FORMULATIONS * self.echantillons * 4

    @property
    def reponses_sans_web(self) -> int:
        return self.reponses - self.reponses_web


def questions_quota_1() -> int:
    """Nombre de questions tirées au quota minimal (1 par strate peuplée), couverture atteinte.

    Un item P engendre Q-DIR, Q-FER, Q-NEG ; avec 3 items P par thème et par candidat, chaque strate
    candidat × thème × gabarit est peuplée : 12 × 10 × 3 = 360 questions nommant un candidat, plus
    les questions sur les items A, O et F (au moins 20 % du run pour A et F) et les Q-ATT par thème.
    """
    nommees_p = CANDIDATS * THEMES * 3
    # A et F : au moins 20 % du total -> x >= 0,25 * reste ; on prend le minimum.
    q_att = THEMES * 2  # quota d'attribution de 2 par thème (hypothèse)
    q_o = 12  # quelques items O (Q-FER, Q-ORI, Q-ACT)
    reste = nommees_p + q_att + q_o
    a_f = math.ceil(PART_QUESTIONS_A_F / (1 - PART_QUESTIONS_A_F) * reste)
    return reste + a_f


def cout_interrogation_usd(v: Volume) -> float:
    pi, po = PRIX["gpt-5.1"]  # tarif de référence pour un assistant ; les autres sont du même ordre
    cout_sans_web = v.reponses_sans_web * (ENTREE_OUTIL_JETONS * pi + SORTIE_OUTIL_JETONS * po) / 1e6
    cout_web = v.reponses_web * (
        (ENTREE_OUTIL_JETONS + JETONS_CONTENU_RECHERCHE) * pi / 1e6
        + SORTIE_OUTIL_JETONS * po / 1e6
        + RECHERCHES_PAR_REPONSE_WEB * PRIX_RECHERCHE_WEB_PAR_APPEL
    )
    return cout_sans_web + cout_web


def jetons_entree_juge(web: bool, claude: bool) -> float:
    base = jetons(jetons_prompt_juge(), claude) + JETONS_REFERENCES + SORTIE_OUTIL_JETONS
    liens = LIENS_PAR_REPONSE_WEB if web else LIENS_PAR_REPONSE_SANS_WEB
    pages = liens * jetons(CARACTERES_PAR_PAGE_CITEE, claude)
    return base + pages


def cout_juge_usd(v: Volume, tarif: str, claude: bool) -> float:
    pi, po = PRIX[tarif]
    e_web = jetons_entree_juge(True, claude)
    e_sans = jetons_entree_juge(False, claude)
    entree = v.reponses_web * e_web + v.reponses_sans_web * e_sans
    sortie = v.reponses * JETONS_SORTIE_JUGE * (SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
    # test contrefactuel : 200 réponses renotées (candidats) + 200 (outils), par juge
    entree += 400 * (e_web + e_sans) / 2
    return (entree * pi + sortie * po) / 1e6


def union(*taux: float) -> float:
    p = 1.0
    for t in taux:
        p *= 1 - t
    return 1 - p


def charge_humaine_heures(v: Volume, pessimiste: bool) -> dict[str, float]:
    i = 1 if pessimiste else 0
    r = v.reponses
    desaccord = TAUX_DESACCORD_JUGES[i]
    partiel = TAUX_ACCORD_PARTIEL[i]
    fab = PART_QUESTIONS_A_F * TAUX_FABRICATION[i]
    matt = PART_QUESTIONS_ATT * TAUX_MAUVAISE_ATTRIBUTION_ATT[i]
    # réponses notées par au moins un humain hors échantillon (union des déclencheurs)
    part_humaine = union(desaccord, partiel, fab, matt)
    notations_declenchees = r * part_humaine
    # échantillon de 10 % : deux humains, puis un troisième sur les désaccords
    echantillon = math.ceil(0.10 * r)
    notations_echantillon = echantillon * (2 + TAUX_DESACCORD_HUMAINS)
    minutes = MINUTES_PAR_NOTATION_HUMAINE[i]
    h_reponses = (notations_declenchees + notations_echantillon) * minutes / 60
    lectures = CANDIDATS * ITEMS_P_PAR_CANDIDAT * COMPARATEURS
    h_comparateurs = lectures * 2 * MINUTES_PAR_LECTURE_COMPARATEUR / 60
    h_items_a = ITEMS_A * PART_RUNS_AVEC_NOUVELLE_SOURCE_T1 * MINUTES_REVERIFICATION_A / 60
    return {
        "reponses_notees_par_un_humain_hors_echantillon": notations_declenchees,
        "notations_echantillon": notations_echantillon,
        "heures_notation_reponses": h_reponses,
        "lectures_comparateurs_par_run": lectures * 2,
        "heures_comparateurs": h_comparateurs,
        "heures_items_a": h_items_a,
        "heures_total": h_reponses + h_comparateurs + h_items_a,
    }


def demi_largeur_ic(n_reponses: float, reponses_par_item: float, icc: float, p: float = 0.8) -> float:
    """Approximation normale avec effet de plan (grappe = item), pour l'ordre de grandeur seulement."""
    deff = 1 + (reponses_par_item - 1) * icc
    n_eff = n_reponses / deff
    return 1.96 * math.sqrt(p * (1 - p) / n_eff)


def intervalles(v: Volume) -> None:
    # par couple outil × mode : Q × 3 × échantillons réponses ; ~2,5 questions par item
    par_couple = v.questions * FORMULATIONS * v.echantillons
    reponses_par_item = 2.5 * FORMULATIONS * v.echantillons
    for icc in (0.2, 0.4):
        dl_outil = demi_largeur_ic(par_couple, reponses_par_item, icc)
        dl_candidat = demi_largeur_ic(par_couple / CANDIDATS, reponses_par_item, icc)
        print(
            f"    ICC {icc:.1f} : demi-largeur IC95 exactitude par couple ≈ {100 * dl_outil:.1f} pts ; "
            f"par candidat (1/{CANDIDATS}) ≈ {100 * dl_candidat:.1f} pts"
        )


def fenetre_72h() -> None:
    """§6 : fenêtre « ouverte le mardi à 6 h » contre « run supplémentaire déclenché dans les 72 heures »."""
    jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    print("  Débat à 21 h un ... -> prochaine ouverture de fenêtre (mardi 6 h) dans :")
    for j, nom in enumerate(jours):
        # heures entre j 21:00 et le prochain mardi (index 1) 06:00
        delta_jours = (1 - j) % 7
        heures = delta_jours * 24 - 21 + 6
        if heures <= 0:
            heures += 7 * 24
        ok = "compatible" if heures <= 72 else "INCOMPATIBLE"
        print(f"    {nom:9s} : {heures:4.0f} h  {ok}")


def fenetre_48h(v: Volume) -> None:
    """Débit requis dans la fenêtre de 48 h si la file d'un outil est séquentielle."""
    par_outil = v.reponses / OUTILS
    secondes = 48 * 3600
    print(f"  Requêtes par outil : {par_outil:,.0f} ; budget moyen par requête en file séquentielle : "
          f"{secondes / par_outil:.0f} s")
    for latence in (8, 15):
        for taux_echec_total in (0.0, 0.02, 0.05):
            # chemin d'échec complet : 180 + 30 + 180 + 120 + 180 = 690 s (§6)
            t = par_outil * ((1 - taux_echec_total) * latence + taux_echec_total * 690)
            print(f"    latence {latence:2d} s, {100 * taux_echec_total:.0f} % de requêtes épuisant 3 tentatives : "
                  f"{t / 3600:5.1f} h sur 48")


def main() -> None:
    print(f"Prompt juge : {jetons_prompt_juge():,} caractères ≈ {jetons(jetons_prompt_juge()):,.0f} jetons "
          f"(≈ {jetons(jetons_prompt_juge(), True):,.0f} avec le tokeniseur Claude 4.7+)")
    print(f"Entrée du juge par réponse : mode web ≈ {jetons_entree_juge(True, False):,.0f} jetons "
          f"(Claude ≈ {jetons_entree_juge(True, True):,.0f}) ; sans web ≈ {jetons_entree_juge(False, False):,.0f}")
    q1 = questions_quota_1()
    print(f"\nQuestions tirées au quota minimal 1 par strate peuplée : ≈ {q1}")
    for q in (250, q1):
        for ech in (2, 1):
            v = Volume(q, ech)
            print(f"\n=== Q = {q} questions, {ech} échantillon(s) : {v.reponses:,} réponses par run "
                  f"({v.reponses_par_question} par question), notations de juge = {2 * v.reponses:,}")
            inter = cout_interrogation_usd(v)
            j_sonnet = cout_juge_usd(v, "sonnet-5.5", True)
            j_sonnet_lot = cout_juge_usd(v, "sonnet-5.5-lot", True)
            j_mistral = cout_juge_usd(v, "mistral-large", False)
            total = inter + j_sonnet + j_mistral
            total_lot = inter + j_sonnet_lot + j_mistral
            print(f"  Coût API par run (USD) : interrogation {inter:,.0f} ; juge Sonnet 5.5 {j_sonnet:,.0f} "
                  f"(lot {j_sonnet_lot:,.0f}) ; juge Mistral Large {j_mistral:,.0f} ; total {total:,.0f} "
                  f"(avec lot {total_lot:,.0f})")
            mois = total * RUNS_PAR_MOIS_HEBDO * TAUX_CHANGE_EUR_PAR_USD
            mois_lot = total_lot * RUNS_PAR_MOIS_HEBDO * TAUX_CHANGE_EUR_PAR_USD
            print(f"  Coût mensuel en rythme hebdomadaire : ≈ {mois:,.0f} € (lot : {mois_lot:,.0f} €) "
                  f"contre un plafond de 600 € (§12) : ×{mois / 600:.1f} (lot ×{mois_lot / 600:.1f})")
            for pess in (False, True):
                c = charge_humaine_heures(v, pess)
                etiquette = "pessimiste" if pess else "optimiste"
                print(f"  Charge humaine ({etiquette}) : {c['reponses_notees_par_un_humain_hors_echantillon']:,.0f} réponses "
                      f"renvoyées à un humain + {c['notations_echantillon']:,.0f} notations d'échantillon "
                      f"-> {c['heures_notation_reponses']:,.0f} h ; comparateurs {c['lectures_comparateurs_par_run']:,} "
                      f"lectures -> {c['heures_comparateurs']:,.0f} h ; items A {c['heures_items_a']:.1f} h ; "
                      f"total ≈ {c['heures_total']:,.0f} h par run (§12 : 3 h)")
            print("  Intervalles (approximation normale, grappe = item) :")
            intervalles(v)
            if ech == 2:
                print("  Fenêtre de 48 h :")
                fenetre_48h(v)
    print("\nRuns supplémentaires (§6) :")
    fenetre_72h()


if __name__ == "__main__":
    main()
