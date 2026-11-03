"""Défense du protocole 0.26 (2026-11-02) — contrôles des calculs des constats. Script jetable, stdlib.

Chaque bloc reprend un chiffre cité par scratch/critique/constats-retenus.md et le recalcule sous
des hypothèses plus proches du protocole, pour dire si le constat tient tel quel ou est surévalué.

Usage : python scratch/critique/defense/controles.py
"""

from __future__ import annotations

from math import comb

# ----------------------------------------------------------------------------- M36 : facteur de coût
# Chiffres de D/faisabilite.py (sortie du 2026-11-02), coût mensuel en € contre le plafond de 600 €.
COUTS_MENSUELS = {
    ("Q=250", "2 éch.", "tarif plein"): 2966,
    ("Q=250", "2 éch.", "lot"): 2016,
    ("Q=250", "1 éch. (levier §12)", "tarif plein"): 1512,
    ("Q=250", "1 éch. (levier §12)", "lot"): 1025,
    ("Q=490", "2 éch.", "tarif plein"): 5758,
    ("Q=490", "2 éch.", "lot"): 3919,
    ("Q=490", "1 éch. (levier §12)", "tarif plein"): 2908,
    ("Q=490", "1 éch. (levier §12)", "lot"): 1976,
}
print("== M36 : facteur coût mensuel / 600 € selon le scénario de D/faisabilite.py ==")
for cle, cout in COUTS_MENSUELS.items():
    print(f"  {cle[0]:6s} {cle[1]:22s} {cle[2]:12s} : {cout:5d} € -> x{cout / 600:.1f}")
print("  Le constat dit « facteur 3 à 10 » : avec le levier préenregistré du §12 (2 -> 1) et le tarif par lot,")
print("  le facteur du script est 1,7 à 3,3 ; le 10 suppose Q = 490, 2 échantillons et aucun lot.")
# 24 000 réponses (CLAUDE.md) / 66 réponses par question = ordre de grandeur de l'auteur
print(f"  Ordre de grandeur de l'auteur (CLAUDE.md) : 24 000 réponses / 66 par question = {24000 / 66:.0f} questions,")
print("  entre les deux scénarios du script (250 et 490).")

# ----------------------------------------------------------------------------- M36 : part de la charge humaine
print("\n== M36 : la charge humaine du §12 (« audit, arbitrages, note éditoriale ») est celle de l'auteur ==")
print("  Le script compare aux 3 h les heures des annotateurs rémunérés (§7, §10), que le §12 ne nomme pas.")
print("  Le dépassement de la charge d'annotation reste réel : à Q = 250, 10 % d'échantillon = 1 650 réponses")
print("  × 2 humains, avant les désaccords des juges.")

# ----------------------------------------------------------------------------- M10 : recouvrement réaliste
print("\n== M10 : part des questions du run 1 présentes au run k, réservoir de s questions par strate ==")
print("  (formule du script A/tendance_recouvrement.py, section « Correction ») ; quota 1, 3 items P par thème => s = 3")
for s in (3, 4, 6):
    for k in (10, 20):
        part = 0.8 ** (k - 1) + (1 - 0.8 ** (k - 1)) / s
        print(f"  s={s} run {k:2d} : {100 * part:5.1f} % -> ~{420 * part:4.0f} questions communes sur 420")
print("  Le « 1,4 % au 20e run » du constat est la limite s -> infini ; à la cible du §4 (s = 3) c'est 34 %.")

# ----------------------------------------------------------------------------- M20 : bruit de renotation faible
print("\n== M20 : retrait à tort (k >= 7 sur 200) selon le bruit de renotation q ==")


def p_au_moins(k: int, n: int, p: float) -> float:
    return sum(comb(n, i) * p**i * (1 - p) ** (n - i) for i in range(k, n + 1))


for q in (0.0025, 0.005, 0.01, 0.02):
    p_run = p_au_moins(7, 200, q)
    print(f"  q = {100 * q:4.2f} % : P(retrait | run) = {p_run:.4f} ; sur 20 runs = {1 - (1 - p_run) ** 20:.3f}")
print("  Le « 11 % par run, 90 % sur 20 runs » suppose q = 2 % ; à q <= 1 % (température 0, graine) c'est <= 0,4 % et 8 %.")
print("  Et un retrait à tort ne fausse aucun chiffre : il porte l'échantillon humain à 25 % (§7).")

# ----------------------------------------------------------------------------- M13 : kappa contre accord observé
print("\n== M13 : kappa à 3 catégories, lot de 50, marges 46/3/1, d désaccords ==")


def kappa(t: list[list[int]]) -> tuple[float, float]:
    n = sum(map(sum, t))
    po = sum(t[i][i] for i in range(3)) / n
    marges_l = [sum(r) for r in t]
    marges_c = [sum(t[i][j] for i in range(3)) for j in range(3)]
    pe = sum(marges_l[i] * marges_c[i] for i in range(3)) / n**2
    return po, (po - pe) / (1 - pe)


for d in (1, 2, 3):
    t = [[46, 0, 0], [0, 3, 0], [0, 0, 1]]
    deplacements = [(0, 1), (1, 0), (0, 2)]
    for i in range(d):
        a, b = deplacements[i]
        t[a][a] -= 1
        t[a][b] += 1
    po, k = kappa(t)
    print(f"  d={d} : accord observé {po:.2f}, kappa {k:.3f}")
print("  Confirmé : 2 désaccords sur 50 (96 % d'accord) passent sous 0,80. Le constat tient.")

# ----------------------------------------------------------------------------- M2 : H1 et le nombre de grappes
print("\n== M2 : H1, borne inférieure percentile > 0 exige k grappes porteuses ; part des rééchantillons sans elles ==")
for n in (40, 80):
    print("  n=%d : " % n + " ; ".join(f"k={k}: {100 * (1 - k / n) ** n:5.2f} %" for k in range(1, 6)))
print("  Confirmé : k = 4 au moins (seuil 2,5 %). Un outil qui fabrique sur 3 items distincts n'est pas « vrai » pour H1.")

# ----------------------------------------------------------------------------- M31 : arithmétique de la fenêtre
print("\n== M31 : heures entre un débat à 21 h et le mardi 6 h suivant ==")
for j, nom in enumerate(["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]):
    h = ((1 - j) % 7) * 24 - 15
    if h <= 0:
        h += 168
    print(f"  {nom:9s} : {h:3d} h {'<= 72' if h <= 72 else '> 72 : incompatible'}")

# ----------------------------------------------------------------------------- M9 : lecture des résultats de A/h4_permutation.py
print("\n== M9 : A/h4_permutation.py, rejet au premier pas de Holm (0,05/16) selon le déséquilibre de composition ==")
print("  6 A contre 2 A : 0,5 % ; 8 A : 0,3-0,7 % ; 10 A contre 2 A et p_A = 0,3 : 6,5 % (FWER 66 %).")
print("  Le « jusqu'à 30 % » et le « FWER 21-66 % » viennent du seul scénario extrême (un tiers d'items A chez un")
print("  candidat, 2/30 chez les autres, outil à 30 % d'exactitude sur les A). Composition égale : test conservateur")
print("  (1,5-4 % à 5 %). Et §8 : « elle ne dit rien de la cause » : le rejet n'est pas « à tort » au sens de H0.")
