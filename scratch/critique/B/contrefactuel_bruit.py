"""Critique du protocole 0.26, groupe B — test contrefactuel du juge (§7).

Question : le seuil « au-delà de 3 % » sur 200 réponses renotées distingue-t-il un biais lié au nom
d'un simple bruit de renotation (le juge ne rend pas toujours la même note sur la même entrée) ?

Hypothèses :
- n = 200 paires ; retrait du juge si le nombre de changements k vérifie k/200 > 0,03, soit k >= 7 ;
- sous H0 (aucun biais), une note change avec une probabilité q par paire, indépendamment (bruit de
  renotation : température non nulle, non-déterminisme du service) ;
- sous H1, un biais lié au nom fait changer une part b supplémentaire ; une paire change avec la
  probabilité p = 1 - (1 - q)(1 - b).
Le protocole ne fixe ni la température des juges ni une mesure du bruit q ; q est donc inconnu.
Stdlib seulement.
"""

from math import comb


def p_au_moins(k: int, n: int, p: float) -> float:
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


def clopper_pearson(k: int, n: int, alpha: float = 0.05) -> tuple[float, float]:
    """Intervalle exact par bissection sur la fonction de répartition binomiale (sans scipy)."""

    def cdf(x: int, p: float) -> float:
        return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(0, x + 1))

    def racine(f, lo: float, hi: float) -> float:
        """f est croissante en p ; renvoie p tel que f(p) = 0."""
        for _ in range(200):
            mid = (lo + hi) / 2
            if f(mid) > 0:
                hi = mid
            else:
                lo = mid
        return (lo + hi) / 2

    # borne basse : P(X >= k | p) = alpha/2, fonction croissante de p
    bas = 0.0 if k == 0 else racine(lambda p: (1 - cdf(k - 1, p)) - alpha / 2, 0.0, 1.0)
    # borne haute : P(X <= k | p) = alpha/2 ; alpha/2 - cdf(k, p) est croissante de p
    haut = 1.0 if k == n else racine(lambda p: alpha / 2 - cdf(k, p), 0.0, 1.0)
    return bas, haut


N, SEUIL = 200, 7
print(f"n = {N}, retrait si k >= {SEUIL} (k/n > 3 %)\n")
print("Erreur de type I par run (retrait d'un juge sans biais) selon le bruit de renotation q :")
for q in (0.005, 0.01, 0.015, 0.02, 0.025, 0.03):
    p_run = p_au_moins(SEUIL, N, q)
    p_20 = 1 - (1 - p_run) ** 20
    print(f"  q = {q:.3f} : P(retrait | run) = {p_run:.3f} ; sur 20 runs, P(au moins un retrait) = {p_20:.3f}")

print("\nPuissance (P de retirer le juge) pour un biais b, selon q :")
for q in (0.0, 0.01, 0.02):
    for b in (0.02, 0.03, 0.05, 0.08):
        p = 1 - (1 - q) * (1 - b)
        print(f"  q = {q:.2f}, b = {b:.2f} (p = {p:.3f}) : puissance = {p_au_moins(SEUIL, N, p):.3f}")

print("\nIntervalle exact à 95 % du taux observé (n = 200) :")
for k in (0, 2, 4, 6, 7, 10):
    bas, haut = clopper_pearson(k, N)
    print(f"  k = {k:2d} ({k / N:.1%}) : [{bas:.1%} ; {haut:.1%}]")
