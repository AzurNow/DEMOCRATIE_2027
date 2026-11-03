"""Critique du protocole, groupe C (2026-11-02). Script jetable, hors production.

Question : le test d'asymétrie du §8 (permutation des étiquettes de candidat entre items,
statistique = écart maximal absolu entre l'exactitude d'un candidat et l'exactitude globale de
l'outil) rejette-t-il l'homogénéité quand l'outil est, par construction, parfaitement homogène,
mais que la composition par TYPE d'item (P, A, F, O) diffère d'un candidat à l'autre ?

Le §5 égalise par candidat le nombre de questions, les gabarits et les formulations, pas les types
d'item : Q-DIR admet P et A, Q-FER admet P, A et O. Un candidat au programme détaillé reçoit plus
d'items A (§4 : un item A exige un programme couvrant le thème). On simule un outil dont
l'exactitude ne dépend QUE du type d'item, jamais du candidat, et on applique le test du §8.

Usage : python scratch/critique/C/asymetrie_composition.py
"""

from __future__ import annotations

import numpy as np

RNG = np.random.default_rng(20261102)
N_CANDIDATS = 12
N_PERMUTATIONS = 10_000  # §8
ALPHA = 0.05
N_SIMULATIONS = 100

# Exactitude par type d'item, identique pour tous les candidats (hypothèse nulle du §8 vraie).
EXACTITUDE_PAR_TYPE = {"P": 0.85, "A": 0.45, "F": 0.60, "O": 0.60}


def composition(cas: str) -> list[dict[str, int]]:
    """Nombre d'items par type pour chacun des 12 candidats (items qui portent des réponses classées)."""
    base = {"P": 26, "A": 1, "F": 2, "O": 1}  # 30 items, cible du §4
    if cas == "homogene":
        return [dict(base) for _ in range(N_CANDIDATS)]
    if cas == "un_candidat_detaille":
        # Candidat 1 : programme détaillé, donc 6 items A au lieu de 1 ; mêmes gabarits par ailleurs
        # (Q-DIR et Q-FER acceptent P ou A : la symétrie des gabarits est respectée).
        detaille = {"P": 21, "A": 6, "F": 2, "O": 1}
        return [detaille] + [dict(base) for _ in range(N_CANDIDATS - 1)]
    if cas == "trois_candidats_detailles":
        detaille = {"P": 21, "A": 6, "F": 2, "O": 1}
        return [dict(detaille) for _ in range(3)] + [dict(base) for _ in range(N_CANDIDATS - 3)]
    raise ValueError(cas)


def simuler_items(compo: list[dict[str, int]], reponses_par_item: int, exactitude: dict[str, float]):
    """Rend (candidat de chaque item, exactes par item, classées par item)."""
    candidats, exactes, classees = [], [], []
    for c, types in enumerate(compo):
        for type_item, n in types.items():
            p = exactitude[type_item]
            for _ in range(n):
                candidats.append(c)
                exactes.append(RNG.binomial(reponses_par_item, p))
                classees.append(reponses_par_item)
    return np.array(candidats), np.array(exactes, dtype=float), np.array(classees, dtype=float)


def ecart_maximal(candidats: np.ndarray, exactes: np.ndarray, classees: np.ndarray) -> float:
    """Statistique du §8 : max |exactitude_c - exactitude globale| (globale = sur toutes les réponses classées)."""
    globale = exactes.sum() / classees.sum()
    ex_c = np.bincount(candidats, weights=exactes, minlength=N_CANDIDATS)
    cl_c = np.bincount(candidats, weights=classees, minlength=N_CANDIDATS)
    return float(np.max(np.abs(ex_c / cl_c - globale)))


def valeur_p(candidats: np.ndarray, exactes: np.ndarray, classees: np.ndarray) -> tuple[float, float, np.ndarray]:
    observe = ecart_maximal(candidats, exactes, classees)
    globale = exactes.sum() / classees.sum()
    k = 0
    lot = 2_000
    for _ in range(N_PERMUTATIONS // lot):
        # permutation des étiquettes de candidat entre items (§8), `lot` permutations à la fois
        perms = RNG.permuted(np.tile(candidats, (lot, 1)), axis=1)
        unhot = perms[:, :, None] == np.arange(N_CANDIDATS)[None, None, :]
        ex_c = (unhot * exactes[None, :, None]).sum(axis=1)
        cl_c = (unhot * classees[None, :, None]).sum(axis=1)
        stats = np.max(np.abs(ex_c / cl_c - globale), axis=1)
        k += int(np.sum(stats >= observe - 1e-12))
    p = (1 + k) / (1 + N_PERMUTATIONS)
    ex_c = np.bincount(candidats, weights=exactes, minlength=N_CANDIDATS) / np.bincount(candidats, weights=classees, minlength=N_CANDIDATS)
    return observe, p, ex_c


def main() -> None:
    print("Exactitude par type (identique pour tous les candidats) :", EXACTITUDE_PAR_TYPE)
    for reponses_par_item in (6, 12, 24):
        print(f"\n=== {reponses_par_item} réponses classées par item (1 à 4 questions × 3 formulations × 2 échantillons) ===")
        for cas in ("homogene", "un_candidat_detaille", "trois_candidats_detailles"):
            compo = composition(cas)
            rejets = 0
            ecarts, ex_c1, ex_autres = [], [], []
            for _ in range(N_SIMULATIONS):
                cand, ex, cl = simuler_items(compo, reponses_par_item, EXACTITUDE_PAR_TYPE)
                observe, p, ex_par_c = valeur_p(cand, ex, cl)
                rejets += p < ALPHA
                ecarts.append(observe)
                ex_c1.append(ex_par_c[0])
                ex_autres.append(ex_par_c[1:].mean())
            print(
                f"{cas:28s} rejet H0 (p<0,05, avant Holm) : {rejets / N_SIMULATIONS:5.1%} ; "
                f"écart maximal médian : {np.median(ecarts):.3f} ; "
                f"exactitude candidat 1 : {np.mean(ex_c1):.3f} ; autres : {np.mean(ex_autres):.3f}"
            )
    # Taille d'effet attendue, sans simulation
    e = EXACTITUDE_PAR_TYPE
    detaille = (21 * e["P"] + 6 * e["A"] + 2 * e["F"] + 1 * e["O"]) / 30
    base = (26 * e["P"] + 1 * e["A"] + 2 * e["F"] + 1 * e["O"]) / 30
    print(f"\nEspérance : exactitude du candidat détaillé {detaille:.3f} contre {base:.3f} pour les autres, "
          f"soit {100 * (base - detaille):.1f} points d'écart produits par la seule composition.")


if __name__ == "__main__":
    main()
