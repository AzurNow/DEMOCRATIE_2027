"""C3 : heures de testeur du canal application (QR8, §6 ligne 241) et de trois variantes (hypothèse H1 de la passe).

Usage : python3 scratch/fondations/2026-11-10/c3_canal_application.py   (depuis la racine du dépôt)

Dispositif du §6 : « Une fois par mois, deux testeurs saisissent à la main un sous-échantillon stratifié des
questions du run, cinq par candidat interrogé (60 pour 12 candidats) … dans l'application grand public de chaque
éditeur … Chacun des deux testeurs saisit tout le sous-échantillon. » Variantes : les mêmes questions chaque
semaine ; 10 % des questions du run ; toutes les questions neutres de l'échantillon 1. Paramètre du brief : 3 à
6 minutes par saisie (saisie + copie + capture). Le plafond d'heures du §12 n'existe pas encore : heures absolues.
"""

from __future__ import annotations

import math

import parametres as P
from c1_calendrier import questions_quota_1

ASSISTANTS_SAISIS = P.OUTILS_RETENUS  # §6 : « tous les assistants inclus y sont saisis » (7 au 15 octobre)
QUOTAS = (1, 2)  # quota par strate déclaré dans config/perimetre.yaml (encore null) : 1 comme faisabilite.py, 2 en variante


def heures(questions: int, par_mois: float) -> tuple[float, float]:
    saisies = questions * ASSISTANTS_SAISIS * P.TESTEURS * par_mois
    return saisies * P.MIN_PAR_SAISIE_APPLICATION[0] / 60, saisies * P.MIN_PAR_SAISIE_APPLICATION[1] / 60


def main() -> None:
    print(f"C3. Canal application : {ASSISTANTS_SAISIS} assistants, {P.TESTEURS} testeurs, {P.MIN_PAR_SAISIE_APPLICATION} min par saisie (paramètre du brief)")
    print("  | variante | questions par passage | saisies par passage | passages/mois | h testeurs/mois (3 min) | h/mois (6 min) | h par testeur et par mois (3–6 min) | € /mois à 15–30 €/h |")
    print("  |---|---|---|---|---|---|---|---|")
    lignes = []
    q60 = P.QUESTIONS_APPLICATION_PAR_CANDIDAT * P.CANDIDATS
    lignes.append(("§6 actuel : 5 questions/candidat, mensuel", q60, 1.0))
    lignes.append(("mêmes 60 questions chaque semaine", q60, P.RUNS_PAR_MOIS_HEBDO))
    for quota in QUOTAS:
        q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS) * quota  # approximation : le quota multiplie les questions nommant un candidat
        dix = math.ceil(0.10 * q)
        lignes.append((f"10 % des questions du run (quota {quota} : {q} questions), mensuel", dix, 1.0))
        lignes.append((f"10 % des questions du run (quota {quota}), chaque semaine", dix, P.RUNS_PAR_MOIS_HEBDO))
        lignes.append((f"toutes les questions neutres de l'échantillon 1 (quota {quota}), mensuel", q, 1.0))
        lignes.append((f"toutes les questions neutres de l'échantillon 1 (quota {quota}), chaque semaine", q, P.RUNS_PAR_MOIS_HEBDO))
    for lib, q, par_mois in lignes:
        hb, hh = heures(q, par_mois)
        saisies = q * ASSISTANTS_SAISIS * P.TESTEURS
        print(f"  | {lib} | {q} | {saisies:,} | {par_mois:.2f} | {hb:,.0f} | {hh:,.0f} | {hb / P.TESTEURS:,.0f}–{hh / P.TESTEURS:,.0f} | {hb * P.TAUX_HORAIRE_TESTEUR_EUR[0]:,.0f}–{hh * P.TAUX_HORAIRE_TESTEUR_EUR[1]:,.0f} |")
    print("\n  Le §12 (ligne 425) ne fixe pas encore de plafond d'heures (« les plafonds écrits à la version 1.0 sont fixés d'après ces mesures », au pilote) : les heures ci-dessus sont absolues.")
    print("  Pour comparaison, la charge humaine cible du §12 pour l'auteur est de 3 h par run hebdomadaire, soit 13 h par mois ; les saisies du canal application ne sont pas comptées dans les réponses du run (§5 ligne 215).")
    print(f"  Chaque saisie produit une réponse notée par les deux juges (§6 : « notées comme celles de l'API ») : {q60 * ASSISTANTS_SAISIS * P.TESTEURS:,} réponses de plus par mois au dispositif actuel, qui entrent dans l'échantillon humain à 10 %.")


if __name__ == "__main__":
    main()
