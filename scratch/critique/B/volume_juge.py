"""Critique du protocole 0.26, groupe B2 — taille de l'entrée du juge en mode web (§7).

Le juge reçoit « le texte de chaque page citée », borné à 50 000 points de code par page
(prompt judge-1.0.0, `longueur_max_texte_page`), sans borne sur le nombre de pages. Question : à
quelle fréquence l'entrée dépasse-t-elle la fenêtre de contexte d'un juge, et quel volume de jetons
cela représente-t-il par run ?

Hypothèses (paramètres, pas des faits mesurés ; à remplacer par les valeurs du run pilote) :
- réponses obtenues par run : 24 000 (ordre de grandeur de CLAUDE.md), moitié en mode web ;
- en mode web, 80 % des réponses citent au moins un lien ; nombre de liens distincts ~ 1 + Poisson(3)
  (moyenne 4) ; hors web, 10 % citent un lien, nombre ~ 1 + Poisson(0,5) ;
- longueur du texte extrait d'une page : log-normale de médiane 12 000 points de code, sigma 1,0,
  tronquée à 50 000 (la borne du prompt) ;
- 3,5 points de code par jeton (texte français, ordre de grandeur) ;
- reste de la charge (question, réponse, référence, grille) : 3 000 jetons.
Deux fenêtres de contexte comparées : 128 000 et 200 000 jetons (valeurs courantes, à vérifier pour
les juges retenus). Stdlib seulement, graine fixée.
"""

import math
import random

rng = random.Random(3)
N_REPONSES = 24_000
PART_WEB = 0.5
CHARS_PAR_JETON = 3.5
BASE = 3_000
BORNE_PAGE = 50_000


def poisson(lam: float) -> int:
    L, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p < L:
            return k
        k += 1


def longueur_page() -> int:
    return min(BORNE_PAGE, int(math.exp(math.log(12_000) + 1.0 * rng.gauss(0, 1))))


def scenario(liens_moyens_web: float, mediane_page: int) -> None:
    global longueur_page
    rng.seed(3)

    def longueur_page() -> int:  # noqa: F811 — redéfinie par scénario
        return min(BORNE_PAGE, int(math.exp(math.log(mediane_page) + 1.0 * rng.gauss(0, 1))))

    jetons: list[int] = []
    for _ in range(N_REPONSES):
        web = rng.random() < PART_WEB
        cite = rng.random() < (0.8 if web else 0.1)
        liens = (1 + poisson(liens_moyens_web - 1 if web else 0.5)) if cite else 0
        total_chars = sum(longueur_page() for _ in range(liens))
        jetons.append(BASE + total_chars // int(CHARS_PAR_JETON))
    jetons.sort()
    n = len(jetons)
    moy = sum(jetons) / n
    print(f"Scénario : {liens_moyens_web:.0f} liens en moyenne par réponse web citante, médiane de page {mediane_page:,} points de code")
    print(f"  jetons d'entrée par appel de juge : moyenne {moy:,.0f}, médiane {jetons[n // 2]:,}, p95 {jetons[int(0.95 * n)]:,}, max {jetons[-1]:,}")
    for fenetre in (128_000, 200_000):
        part = sum(1 for j in jetons if j > fenetre) / n
        print(f"  part des appels au-delà de {fenetre:,} jetons : {part:.2%} ({int(part * n)} réponses par run)")
    total = sum(jetons)
    print(f"  jetons d'entrée par run : {total / 1e6:,.0f} M par juge, {2 * total / 1e6:,.0f} M pour deux juges ; {total / 1e6:,.0f} M pour deux juges avec le levier du §12 (2 échantillons → 1)\n")


for liens_moyens, mediane in ((4, 12_000), (7, 12_000), (10, 12_000), (7, 25_000)):
    scenario(liens_moyens, mediane)

print("Coût = ce volume × le prix d'entrée par million de jetons de chaque juge (non estimé ici : à lire")
print("sur les grilles tarifaires des éditeurs au moment du run). Les paramètres ci-dessus sont des")
print("hypothèses à remplacer par les valeurs observées au run pilote.")
