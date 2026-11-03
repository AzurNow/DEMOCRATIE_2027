"""Demi-largeurs des intervalles percentile en grappes (§8) selon l'effectif, couverture réelle,
condition de H1 (borne inférieure > 0), effet du levier 2 -> 1 échantillon.

Modèle : chaque item (grappe) porte m réponses classées ; la probabilité d'exactitude de l'item
suit une loi Beta de moyenne p et de corrélation intra-grappe rho (bêta-binomiale) ; les réponses
de l'item sont tirées en binomiale. Intervalle : percentile en grappes, 2 000 rééchantillons,
quantiles type 7 (comme le §8).
"""
import numpy as np

rng = np.random.default_rng(20261102)
B = 2000


def jeu(n_items, m, p, rho):
    ab = 1.0 / rho - 1.0
    pi = rng.beta(p * ab, (1 - p) * ab, size=n_items)
    exacts = rng.binomial(m, pi)
    return exacts, np.full(n_items, m)


def ic_percentile(exacts, denoms):
    n = len(exacts)
    idx = rng.integers(0, n, size=(B, n))
    num = exacts[idx].sum(axis=1)
    den = denoms[idx].sum(axis=1)
    ok = den > 0
    taux = num[ok] / den[ok]
    return np.quantile(taux, [0.025, 0.975], method="linear")  # type 7


def etude(n_items, m, p, rho, reps=600):
    larg, couv = [], 0
    for _ in range(reps):
        e, d = jeu(n_items, m, p, rho)
        bas, haut = ic_percentile(e, d)
        larg.append((haut - bas) / 2)
        couv += bas <= p <= haut
    return np.median(larg), couv / reps


print("== Demi-largeur médiane (points) et couverture réelle de l'IC à 95 % (nominal 0,95) ==")
print("p = exactitude vraie ; rho = corrélation intra-item ; m = réponses classées par item")
for p in (0.8, 0.9):
    for rho in (0.3, 0.5):
        for n_items, m, lib in ((10, 6, "candidat au seuil (10 items)"), (30, 6, "candidat cible (30 items)"),
                                (30, 3, "candidat cible, 1 échantillon"), (400, 6, "outil, strate global (400 items)"),
                                (80, 6, "items A+F d'un outil (80 items)")):
            dl, c = etude(n_items, m, p, rho, reps=400 if n_items >= 400 else 600)
            print(f"p={p} rho={rho} {lib:38s} m={m} : demi-largeur ~ {100*dl:4.1f} pts ; couverture {c:.3f}")

print()
print("== H1 : borne inférieure du taux de fabrication > 0 ==")
print("Avec k grappes (items A ou F) portant au moins une fabrication parmi n grappes, la borne")
print("inférieure percentile est > 0 ssi la part des rééchantillons sans aucune de ces k grappes est < 2,5 %.")
for n in (40, 80, 120):
    ligne = []
    for k in range(1, 7):
        p0 = (1 - k / n) ** n
        ligne.append(f"k={k}: {100*p0:5.2f} %")
    print(f"n={n:3d} grappes : " + " ; ".join(ligne))
print("=> il faut au moins 4 items distincts porteurs d'une fabrication, quel que soit n ; un taux observé de 0 donne [0, 0].")
