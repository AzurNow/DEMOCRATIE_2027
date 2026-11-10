"""C1 d : premier run à périmètre réduit — ce que chaque réduction fait gagner et ce qu'elle retire.

Usage : python3 scratch/fondations/2026-11-10/c1d_perimetre_reduit.py   (depuis la racine du dépôt)

Réductions examinées, une à une puis cumulées : 10 items P par candidat au lieu de 30 (seuil §4) ; 1 formulation au
lieu de 3 ; 1 échantillon au lieu de 2 ; un seul mode (sans web seul : 6 couples ; web seul : 5 couples).
Pour chacune : heures humaines (validation, relecture des formulations, notation de l'échantillon), euros d'API par
run (interrogation + deux juges, méthode de faisabilite.py aux tarifs du 2026-11-10), jours gagnés sur le chemin
critique (annotateurs à 16 h/semaine, PARAMÈTRE), demi-largeur des intervalles à 95 % d'exactitude par couple
outil × mode et par candidat : approximation binomiale 1,96·√(p(1−p)/n) à p = 0,7 et 0,85 (demandée par le brief),
puis le modèle en grappes de scratch/critique/A/effectifs_intervalles.py réécrit en stdlib (bêta-binomiale,
percentile en grappes), parce que l'approximation binomiale ignore la corrélation intra-item (§8 : la grappe est
l'item). Enfin les QR et H du §2 qui deviennent sans objet.
"""

from __future__ import annotations

import math
import random

import parametres as P
from c1_calendrier import questions_quota_1

ANNOT_H_SEM = 16  # PARAMÈTRE : 2 annotateurs × 8 h (milieu de HEURES_ANNOTATEUR_PAR_SEMAINE)
RHO = (0.3, 0.5)  # corrélation intra-item (effectifs_intervalles.py)
B = 1000  # rééchantillons par intervalle (le §8 en prend 2 000 ; 1 000 suffit à l'ordre de grandeur, stdlib oblige)
REPS = 200  # jeux simulés par configuration
rng = random.Random(20261110)


def prix(modele: str) -> tuple[float, float]:
    if modele in P.PRIX_USD_PAR_M:
        return P.PRIX_USD_PAR_M[modele]
    (a1, a2), (b1, b2) = P.PRIX_PARAMETRE[modele]
    return ((a1 + a2) / 2, (b1 + b2) / 2)  # milieu de la fourchette, signalé dans la sortie


def cout_interrogation_usd(questions: int, formulations: int, echantillons: int, modes_gardes: set[str], payant: bool) -> float:
    total = 0.0
    for outil, modes, gratuit, pay, _ in P.OUTILS:
        pi, po = prix(pay if payant else gratuit)
        claude = outil == "Claude"
        for mode in modes:
            if mode not in modes_gardes:
                continue
            n = questions * formulations * echantillons
            entree = P.ENTREE_OUTIL_JETONS * (P.SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
            sortie = P.SORTIE_OUTIL_JETONS * (P.SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
            c = (entree * pi + sortie * po) / 1e6
            if mode == "web":
                c += P.JETONS_CONTENU_RECHERCHE * pi / 1e6
                c += P.RECHERCHES_PAR_REPONSE_WEB * P.PRIX_RECHERCHE_WEB_PAR_1000.get(outil, sum(P.PRIX_RECHERCHE_WEB_PARAMETRE.get(outil, (0, 0))) / 2) / 1000
            total += n * c
    return total


def jetons_entree_juge(web: bool, claude: bool) -> float:
    base = P.jetons(P.caracteres_prompt("judge-1.0.0.md"), claude) + P.JETONS_REFERENCES + P.SORTIE_OUTIL_JETONS
    liens = P.LIENS_PAR_REPONSE_WEB if web else P.LIENS_PAR_REPONSE_SANS_WEB
    return base + liens * P.jetons(P.CARACTERES_PAR_PAGE_CITEE, claude)


def cout_juges_usd(questions: int, formulations: int, echantillons: int, modes_gardes: set[str]) -> float:
    total = 0.0
    n_web = sum(1 for _, modes, *_ in P.OUTILS if "web" in modes and "web" in modes_gardes)
    n_sans = sum(1 for _, modes, *_ in P.OUTILS if "sans_web" in modes and "sans_web" in modes_gardes)
    par_couple = questions * formulations * echantillons
    for _, (modele, claude) in P.JUGES.items():
        pi, po = P.PRIX_USD_PAR_M[modele]
        entree = par_couple * (n_web * jetons_entree_juge(True, claude) + n_sans * jetons_entree_juge(False, claude))
        entree += 2 * P.REPONSES_CONTREFACTUEL * (jetons_entree_juge(True, claude) + jetons_entree_juge(False, claude)) / 2
        sortie = par_couple * (n_web + n_sans) * P.JETONS_SORTIE_JUGE * (P.SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
        total += (entree * pi + sortie * po) / 1e6
    return total


def demi_largeur_binomiale(p: float, n: float) -> float:
    return 1.96 * math.sqrt(p * (1 - p) / n)


def demi_largeur_grappes(n_items: int, m: int, p: float, rho: float, reps: int = REPS) -> tuple[float, float]:
    """Demi-largeur médiane et couverture de l'IC percentile en grappes (bêta-binomiale), méthode d'effectifs_intervalles.py."""
    ab = 1.0 / rho - 1.0
    largeurs, couv = [], 0
    for _ in range(reps):
        exacts = [rng.binomialvariate(m, rng.betavariate(p * ab, (1 - p) * ab)) for _ in range(n_items)]
        taux = []
        for _ in range(B):
            s = sum(exacts[rng.randrange(n_items)] for _ in range(n_items))
            taux.append(s / (n_items * m))
        taux.sort()
        bas, haut = quantile(taux, 0.025), quantile(taux, 0.975)
        largeurs.append((haut - bas) / 2)
        couv += bas <= p <= haut
    largeurs.sort()
    return largeurs[len(largeurs) // 2], couv / reps


def quantile(xs: list[float], q: float) -> float:
    """Type 7 de Hyndman et Fan, comme le §8."""
    h = (len(xs) - 1) * q
    i = math.floor(h)
    return xs[i] + (h - i) * (xs[min(i + 1, len(xs) - 1)] - xs[i])


def configurations() -> list[tuple[str, int, int, int, set[str]]]:
    tous = {"sans_web", "web"}
    return [
        ("complet (30 P, 3 F, 2 E, 2 modes)", 30, 3, 2, tous),
        ("10 items P par candidat", 10, 3, 2, tous),
        ("1 formulation", 30, 1, 2, tous),
        ("1 échantillon", 30, 3, 1, tous),
        ("sans web seul (6 couples)", 30, 3, 2, {"sans_web"}),
        ("web seul (5 couples)", 30, 3, 2, {"web"}),
        ("cumul : 10 P, 1 F, 1 E, sans web seul", 10, 1, 1, {"sans_web"}),
    ]


def main() -> None:
    print("C1d. Réductions du premier run : gains et pertes (tarifs du 2026-11-10 ; modèle gratuit des outils)")
    items_f = P.CANDIDATS * P.ITEMS_F_PAR_CANDIDAT[1]
    ref = None
    lignes = []
    for libelle, items_p, f, e, modes in configurations():
        items = P.CANDIDATS * items_p + P.ITEMS_A + items_f + P.ITEMS_O
        q = questions_quota_1(items_p, P.CANDIDATS)
        couples = sum(1 for _, ms, *_ in P.OUTILS for m in ms if m in modes)
        reponses = q * f * e * couples
        h_validation = items * P.ANNOTATEURS * P.MIN_PAR_ITEM_VALIDATION[1] / 60
        questions_engendrees = items * P.GABARITS_PAR_ITEM_P
        h_relecture = questions_engendrees * P.MIN_PAR_RELECTURE_FORMULATION[1] / 60 if f == 3 else 0.0
        h_echantillon = math.ceil(0.1 * reponses) * (2 + P.TAUX_DESACCORD_HUMAINS) * P.MIN_PAR_NOTATION_REPONSE[1] / 60
        h_desaccords = reponses * (P.TAUX_DESACCORD_JUGES[1] + P.TAUX_ACCORD_PARTIEL[1]) * P.MIN_PAR_NOTATION_REPONSE[1] / 60
        usd = cout_interrogation_usd(q, f, e, modes, payant=False) + cout_juges_usd(q, f, e, modes)
        eur = usd * P.TAUX_CHANGE_EUR_PAR_USD
        h_une_fois = h_validation + h_relecture
        h_par_run = h_echantillon + h_desaccords
        jours = (h_une_fois + h_par_run) / ANNOT_H_SEM * 7
        lignes.append((libelle, items, q, couples, reponses, h_une_fois, h_par_run, eur, jours))
        if ref is None:
            ref = lignes[-1]
    print("  | configuration | items | questions (quota 1) | couples | réponses/run | h annot. une fois (validation + relecture) | h annot. par run (échantillon + désaccords) | € API par run | jours annot. (16 h/sem) | gain vs complet |")
    print("  |---|---|---|---|---|---|---|---|---|---|")
    for l in lignes:
        gain = f"−{ref[5] + ref[6] - l[5] - l[6]:.0f} h, −{ref[7] - l[7]:.0f} €, −{ref[8] - l[8]:.0f} j"
        print(f"  | {l[0]} | {l[1]} | {l[2]} | {l[3]} | {l[4]:,} | {l[5]:.0f} | {l[6]:.0f} | {l[7]:,.0f} | {l[8]:.0f} | {gain} |")

    print("\n  Demi-largeurs d'IC à 95 % d'exactitude (points de pourcentage), approximation binomiale 1,96·√(p(1−p)/n)")
    print("  n par couple = questions nommant un candidat (12 × 10 thèmes × 3 gabarits = 360 au quota 1, ou 12 × items P × 3 sous 10 thèmes) × F × E ; par candidat = n / 12")
    print("  | configuration | n par couple | demi-largeur couple p=0,7 | p=0,85 | n par candidat | demi-largeur candidat p=0,7 | p=0,85 |")
    print("  |---|---|---|---|---|---|---|")
    for libelle, items_p, f, e, modes in configurations():
        nommees = P.CANDIDATS * min(items_p, P.THEMES * 3) * P.GABARITS_PAR_ITEM_P if items_p < P.THEMES * 3 else P.CANDIDATS * P.THEMES * P.GABARITS_PAR_ITEM_P
        n_couple = nommees * f * e
        n_cand = n_couple / P.CANDIDATS
        print(f"  | {libelle} | {n_couple:,} | {100 * demi_largeur_binomiale(0.7, n_couple):.1f} | {100 * demi_largeur_binomiale(0.85, n_couple):.1f} | "
              f"{n_cand:,.0f} | {100 * demi_largeur_binomiale(0.7, n_cand):.1f} | {100 * demi_largeur_binomiale(0.85, n_cand):.1f} |")

    print("\n  Même chose en grappes (grappe = item, §8) : bêta-binomiale, percentile en grappes, B = 1 000, 200 jeux ; m = réponses classées par item et par couple = 3 gabarits × F × E")
    print("  | cas | items (grappes) | m | p | rho | demi-largeur médiane | couverture réelle (nominal 0,95) |")
    print("  |---|---|---|---|---|---|---|")
    cas = [
        ("candidat au seuil, complet", 10, 3 * 3 * 2),
        ("candidat cible, complet", 30, 3 * 3 * 2),
        ("candidat cible, 1 échantillon", 30, 3 * 3 * 1),
        ("candidat cible, 1 formulation", 30, 3 * 1 * 2),
        ("candidat au seuil, 1 F et 1 E", 10, 3 * 1 * 1),
        ("candidat cible, 1 F et 1 E", 30, 3 * 1 * 1),
        ("couple, strate globale (12 × 10 items P)", 120, 3 * 3 * 2),
        ("couple, strate globale (12 × 30 items P)", 360, 3 * 3 * 2),
    ]
    for lib, n_items, m in cas:
        for p in (0.7, 0.85):
            for rho in RHO:
                dl, c = demi_largeur_grappes(n_items, m, p, rho, reps=REPS if n_items <= 30 else 40)
                print(f"  | {lib} | {n_items} | {m} | {p} | {rho} | {100 * dl:.1f} pts | {c:.2f} |")

    print("\n  QR et H du §2 que chaque réduction rend sans objet (texte du protocole 0.34, lignes 70-86, 194, 231, 298, 307) :")
    print("  - 1 formulation (neutre seule) : QR6 (part « formulation ») et H3 (neutre moins orientée) sans objet ; la métrique « confirmation de prémisse » (§8 ligne 298) n'a plus de dénominateur ; QR4 perd le drapeau « confirmation de prémisse ».")
    print("  - 1 échantillon : « variabilité entre échantillons » publiée absente (§8 ligne 307, levier §12 prévu) ; QR1 à QR5 inchangées, intervalles plus larges.")
    print("  - sans web seul : QR6 (part « mode ») et H2 sans objet pour tous les outils ; Perplexity (API web intrinsèque) sort du run ; QR5 (sourçage) mesurée sur des liens cités de mémoire seulement.")
    print("  - web seul : H2 sans objet ; DeepSeek (pas de recherche web, D28-3) et Gemini (web suspendu, D28-4) sortent du run : 5 outils sur 7.")
    print("  - 10 items P par candidat : aucune QR ne disparaît, mais tout candidat est exactement au seuil §4 : un seul item contesté, obsolète ou exclu du tirage le fait tomber sous le seuil et sortir des comparaisons (QR3, H4) ; la répartition sur dix thèmes est d'un item par thème, donc la compensation de symétrie §5 n'a aucune réserve.")
    print("  - toutes cumulées : restent QR1, QR2, QR4 (sans prémisse), QR5, QR7 (dès le 2e run), QR9 ; H1, H4, H5 calculables ; H2, H3 sans objet ; QR8 inchangée (canal application, 1 formulation, 1 échantillon déjà).")


if __name__ == "__main__":
    main()
