"""Seuils de kappa (§4 : 0,80 par lot de 50 ; §7/§12 : 0,75 juge-humain), seuil contrefactuel
(§7 : 3 % sur 200) et nombre de comparaisons « établies » attendues par hasard (§8).
Tout est arithmétique, sans simulation.
"""
import numpy as np
from math import comb


def kappa(table):
    t = np.asarray(table, dtype=float)
    n = t.sum()
    po = np.trace(t) / n
    pe = (t.sum(axis=0) * t.sum(axis=1)).sum() / n**2
    return po, pe, (po - pe) / (1 - pe) if pe < 1 else float("nan")


print("== §4 : kappa de Cohen sur 3 catégories (retenu, rejeté, non évaluable), lot de 50 items ==")
print("Lot où l'annotateur A retient tout (50 retenus) et B retient 49, rejette 1 :")
po, pe, k = kappa([[49, 1, 0], [0, 0, 0], [0, 0, 0]])
print(f"  accord observé {po:.3f}, accord attendu {pe:.3f}, kappa = {k:.3f}")
print("Lots à marges presque identiques, d désaccords répartis sur les 3 catégories :")
for retenus in (46, 44, 40):
    rej = (50 - retenus) * 3 // 4
    ne = 50 - retenus - rej
    for d in (0, 1, 2, 3, 4):
        # d désaccords : on déplace d items de la diagonale vers une case hors diagonale, en alternant
        t = np.zeros((3, 3))
        t[0, 0], t[1, 1], t[2, 2] = retenus, rej, ne
        for i in range(d):
            src = [0, 1, 0, 2][i % 4]
            dst = [1, 0, 2, 0][i % 4]
            if t[src, src] > 0:
                t[src, src] -= 1
                t[src, dst] += 1
        po, pe, k = kappa(t)
        print(f"  {retenus} retenus / {rej} rejetés / {ne} non évaluables, d={d} : accord observé {po:.3f}, kappa {k:.3f} {'< 0,80 -> réannotation' if k < 0.8 else ''}")

print()
print("== §7/§12 : kappa juge-humain >= 0,75 sur 3 catégories ; accord observé minimal selon la part de réponses exactes ==")
print("(marges supposées identiques pour le juge et l'humain ; reste réparti 2/3 inexacte, 1/3 non-réponse)")
for pex in (0.70, 0.80, 0.85, 0.90, 0.95, 0.98):
    pin = (1 - pex) * 2 / 3
    pnr = (1 - pex) / 3
    pe = pex**2 + pin**2 + pnr**2
    po_min = pe + 0.75 * (1 - pe)
    print(f"  exactes {100*pex:4.1f} % : accord attendu {pe:.3f} ; accord observé requis {po_min:.3f} ; désaccords tolérés sur 300 : {int((1-po_min)*300)}")

print()
print("== §7 : retrait d'un juge si taux de changement contrefactuel > 3 % sur 200 réponses ==")
print("P(X > 6) pour X ~ Binomiale(200, t), t = taux vrai de changement :")
for t in (0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05):
    p_sup = 1 - sum(comb(200, x) * t**x * (1 - t) ** (200 - x) for x in range(0, 7))
    print(f"  t={100*t:4.1f} % : P(retrait) = {p_sup:.3f} ; sur 20 runs, P(au moins un retrait) = {1-(1-p_sup)**20:.3f}")

print()
print("== §8 : différences qualifiées « établie » par un IC à 95 % sans contrôle de multiplicité ==")
print("Hypothèse : T outils, chacun avec 2 modes ; par couple, 3 paires de formulations ; par outil, 1 différence de modes ;")
print("sur l'exactitude, strate global seulement (lecture étroite du §8).")
for T in (6, 8, 10):
    n_comp = T * 2 * 3 + T * 1
    print(f"  T={T} : {n_comp} différences par run ; attendues « établies » par hasard sous l'hypothèse nulle : {0.05*n_comp:.1f} ;"
          f" P(au moins une) = {1-0.95**n_comp:.3f} ; H2 : P(au moins un outil « confirmé » à tort) = {1-0.975**T:.3f}")
print("Lecture large (toutes métriques × toutes strates, comme la clé de graine du §8 le permet) : plusieurs centaines par run.")
