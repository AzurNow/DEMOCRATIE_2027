"""Critique du protocole, groupe C (2026-11-02). Script jetable, hors production.

Question : le test contrefactuel du §7 (200 réponses renotées après un dérangement des noms de
candidats ; juge retiré au-delà de 3 % de notes changées) détecte-t-il un biais du juge
CONCENTRÉ sur un seul candidat ?

Modèle. n candidats interrogés ; les 200 réponses nomment chacune un candidat (part 1/n chacun).
Sous un dérangement, le candidat X sort de ~1/n des réponses et entre dans ~1/n d'autres : ~2/n
des paires font intervenir X. Le juge biaisé change sa note avec probabilité b sur ces paires, et
avec une probabilité b0 (bruit) sur les autres. Le test déclenche quand le nombre de changements
dépasse 3 % de 200, soit au moins 7.

Usage : python scratch/critique/C/contrefactuel_detection.py
"""

from __future__ import annotations

from math import comb

N_REPONSES = 200
SEUIL = 0.03  # §7


def p_detection(n_candidats: int, b: float, b0: float) -> tuple[float, float]:
    """(taux de changement attendu, probabilité que le taux dépasse 3 %)."""
    part_x = 2.0 / n_candidats
    taux = part_x * b + (1 - part_x) * b0
    seuil_k = int(SEUIL * N_REPONSES)  # 6 : « au-delà de 3 % » = 7 changements ou plus
    p_depasse = sum(comb(N_REPONSES, k) * taux**k * (1 - taux) ** (N_REPONSES - k) for k in range(seuil_k + 1, N_REPONSES + 1))
    return taux, p_depasse


def main() -> None:
    for n in (8, 12):
        print(f"\n=== {n} candidats interrogés ; 200 réponses ; retrait au-delà de 3 % (≥ 7 changements) ===")
        for b0 in (0.0, 0.01):
            print(f"-- bruit de renotation hors biais b0 = {b0:.0%}")
            for b in (0.05, 0.10, 0.15, 0.18, 0.20, 0.25, 0.30, 0.50):
                taux, p = p_detection(n, b, b0)
                print(f"   biais b = {b:4.0%} sur les réponses du candidat X : taux attendu {taux:5.1%} ; P(juge retiré) = {p:5.1%}")
    # Effet sur l'exactitude publiée du candidat X si les deux juges partagent le biais (sinon :
    # désaccord, donc humain, donc pas d'effet) : une part b de ses réponses change de catégorie.
    print("\nSi les deux juges partagent le biais, l'exactitude du candidat X est déplacée d'environ b points "
          "(ex. b = 15 % → 15 points), hors de l'échantillon humain de 10 %, dont le recalcul (a) du §8 ne "
          "refait que les métriques primaires par outil, jamais l'exactitude par candidat.")


if __name__ == "__main__":
    main()
