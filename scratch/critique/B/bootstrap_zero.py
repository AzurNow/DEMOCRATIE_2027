"""Critique du protocole 0.26, groupe B3 (saturation) — intervalle d'un taux observé à 0 (§8).

Question : quand un outil ne fabrique sur aucun item A ou F (taux de fabrication observé 0), que
publie le bootstrap percentile en grappes à 2 000 rééchantillons ? Et pour 1 ou 2 événements ?

Hypothèses :
- grappes = items A/F du couple outil × mode, g grappes de 6 réponses chacune (3 formulations × 2
  échantillons), tous les drapeaux d'une grappe identiques (pire cas de corrélation intra-item) ;
- bootstrap percentile, 2 000 rééchantillons, quantiles 2,5 % et 97,5 % (type 7), comme au §8 ;
- comparaison avec la borne exacte de Clopper-Pearson au niveau des grappes et la « règle de trois ».
Stdlib seulement ; la graine est fixée pour que le résultat soit rejouable.
"""

import random
from math import comb


def quantile_type7(valeurs: list[float], p: float) -> float:
    v = sorted(valeurs)
    h = (len(v) - 1) * p
    i = int(h)
    if i + 1 >= len(v):
        return v[-1]
    return v[i] + (h - i) * (v[i + 1] - v[i])


def bootstrap_taux(evenements_par_grappe: list[int], taille_grappe: int, b: int = 2000, graine: int = 1) -> tuple[float, float]:
    rng = random.Random(graine)
    g = len(evenements_par_grappe)
    taux = []
    for _ in range(b):
        tirage = [evenements_par_grappe[rng.randrange(g)] for _ in range(g)]
        taux.append(sum(tirage) / (g * taille_grappe))
    return quantile_type7(taux, 0.025), quantile_type7(taux, 0.975)


def cp_haut(k: int, n: int, alpha: float = 0.05) -> float:
    """Borne haute exacte de Clopper-Pearson, bissection sur la CDF binomiale."""
    if k == n:
        return 1.0

    def cdf(p: float) -> float:
        return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(0, k + 1))

    lo, hi = 0.0, 1.0
    for _ in range(200):
        mid = (lo + hi) / 2
        if cdf(mid) > alpha / 2:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


M = 6
print(f"Grappes de {M} réponses, drapeaux identiques dans la grappe (corrélation intra-item = 1).\n")
for g in (50, 100, 200, 400):
    for k_grappes in (0, 1, 2):
        ev = [M] * k_grappes + [0] * (g - k_grappes)
        bas, haut = bootstrap_taux(ev, M)
        obs = k_grappes / g
        print(
            f"g = {g:3d} grappes, {k_grappes} grappe(s) fabriquée(s) : taux observé {obs:.3%} ; "
            f"bootstrap percentile [{bas:.2%} ; {haut:.2%}] ; "
            f"Clopper-Pearson (grappes) haut = {cp_haut(k_grappes, g):.2%} ; "
            f"règle de trois = {3 / g:.2%}" if k_grappes == 0 else
            f"g = {g:3d} grappes, {k_grappes} grappe(s) fabriquée(s) : taux observé {obs:.3%} ; "
            f"bootstrap percentile [{bas:.2%} ; {haut:.2%}] ; Clopper-Pearson (grappes) haut = {cp_haut(k_grappes, g):.2%}"
        )
    print()

print("Lecture : avec 0 événement, chaque rééchantillon vaut 0 et l'intervalle publié est [0 % ; 0 %],")
print("alors que l'incertitude réelle (borne exacte) est de l'ordre de 3/g. H1 (borne basse > 0) est alors")
print("infirmée pour l'outil, ce qui est un résultat ; c'est l'intervalle [0 ; 0] qui est trompeur.")
