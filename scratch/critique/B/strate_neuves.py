"""Critique du protocole 0.26, groupe B1 (contamination) et B1 (QR8) — largeurs d'intervalle.

1. Questions neuves (20 %) contre reprises (80 %) : demi-largeur de l'intervalle à 95 % de la
   différence d'exactitude entre les deux strates, pour un couple outil × mode, selon le nombre de
   questions tirées Q et la corrélation intra-grappe rho (grappe = item, 6 réponses par question :
   3 formulations × 2 échantillons ; on assimile une question à une grappe).
2. Écart API / application (QR8) : 60 questions appariées, un côté API (une réponse) et un côté
   application (deux saisies) ; demi-largeur selon le taux de discordance d par question.
Hypothèses : exactitude p = 0,8 des deux côtés ; approximation normale ; effet de plan
deff = 1 + (m - 1) rho avec m = 6. Stdlib seulement.
"""

from math import sqrt

P, M = 0.8, 6
print("1. Neuves (20 %) contre reprises (80 %), demi-largeur à 95 % de la différence d'exactitude :")
for Q in (200, 400, 600, 1000):
    for rho in (0.5, 0.8, 1.0):
        deff = 1 + (M - 1) * rho
        n_neuves = 0.2 * Q * M / deff
        n_reprises = 0.8 * Q * M / deff
        demi = 1.96 * sqrt(P * (1 - P) * (1 / n_neuves + 1 / n_reprises))
        print(f"  Q = {Q:4d} questions, rho = {rho:.1f} : n effectifs {n_neuves:6.0f} / {n_reprises:6.0f} ; demi-largeur = {100 * demi:4.1f} points")
    print()

print("2. QR8, 60 questions appariées, demi-largeur à 95 % de la différence API − application :")
for d in (0.15, 0.25, 0.35):
    demi = 1.96 * sqrt(d / 60)
    print(f"  discordance d = {d:.2f} : demi-largeur = {100 * demi:4.1f} points")
print("\nLecture : avec 60 questions, seul un écart d'une quinzaine de points serait « établi » ; le §6")
print("l'étiquette déjà exploratoire. Pour la strate neuves/reprises, une différence de 8 à 12 points")
print("est détectable par couple dès Q = 400 ; mais aucune strate « neuve » n'est définie au §8.")
