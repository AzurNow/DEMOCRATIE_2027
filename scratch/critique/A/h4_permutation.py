"""Test de permutation d'asymétrie (§8, H4) : erreur de type I quand la composition des types
d'items diffère entre candidats sans aucun effet du candidat, et puissance face à un vrai écart.

Modèle : 12 candidats comparés, 30 questions (grappes) chacun, m = 6 réponses classées par
question, corrélation intra-grappe rho = 0,5 (bêta-binomiale). Exactitude vraie : p_P sur un item
P, p_A sur un item A, identiques pour tous les candidats (aucun effet du candidat). Statistique :
écart maximal absolu entre l'exactitude d'un candidat et l'exactitude globale, étiquettes
permutées entre grappes (§8). B permutations par jeu ; valeur p = (1 + k) / (1 + B).
Famille de Holm : 16 couples outil × mode ; le premier pas de Holm rejette si min p < 0,05 / 16.
"""
import numpy as np

rng = np.random.default_rng(20261102)
C, N, M, RHO = 12, 30, 6, 0.5
B = 2000
REPS = 400


def tirer_jeu(nb_A, p_P, p_A, delta_cand0=0.0):
    """nb_A[c] items A chez le candidat c ; delta_cand0 baisse l'exactitude du candidat 0 sur tout."""
    ab = 1.0 / RHO - 1.0
    exacts, denoms, labels = [], [], []
    for c in range(C):
        types_A = np.zeros(N, dtype=bool)
        types_A[: nb_A[c]] = True
        p = np.where(types_A, p_A, p_P) - (delta_cand0 if c == 0 else 0.0)
        p = np.clip(p, 0.01, 0.99)
        pi = rng.beta(p * ab, (1 - p) * ab)
        exacts.append(rng.binomial(M, pi))
        denoms.append(np.full(N, M))
        labels.append(np.full(N, c))
    return np.concatenate(exacts), np.concatenate(denoms), np.concatenate(labels)


def statistique(exacts, denoms, ordre):
    """Écart maximal, les grappes étant rangées par `ordre` puis coupées en blocs de N par candidat."""
    e = exacts[ordre].reshape(-1, C, N).sum(axis=2)
    d = denoms[ordre].reshape(-1, C, N).sum(axis=2)
    glob = e.sum(axis=1, keepdims=True) / d.sum(axis=1, keepdims=True)
    return np.abs(e / d - glob).max(axis=1)


def valeur_p(exacts, denoms):
    n = len(exacts)
    obs = statistique(exacts, denoms, np.arange(n)[None, :])[0]
    perms = np.argsort(rng.random((B, n)), axis=1)
    stats = statistique(exacts, denoms, perms)
    k = np.sum(stats >= obs - 1e-12)
    return (1 + k) / (1 + B)


def taux_rejet(nb_A, p_P, p_A, delta=0.0, reps=REPS):
    ps = np.array([valeur_p(*tirer_jeu(nb_A, p_P, p_A, delta)[:2]) for _ in range(reps)])
    return np.mean(ps < 0.05), np.mean(ps < 0.05 / 16)


print(f"B={B} permutations, {REPS} jeux simulés par scénario ; 12 candidats × 30 grappes × 6 réponses, rho={RHO}")
print()
print("== Erreur de type I : aucun effet du candidat, seule la part d'items A diffère ==")
print("p_P = 0,85 ; p_A = exactitude sur un item A (l'outil fabrique le reste)")
for p_A in (0.5, 0.3):
    for k0, kautres, lib in ((2, 2, "tous 2 A / 30 (composition égale)"), (6, 2, "candidat 0 : 6 A, autres 2 A"),
                             (8, 2, "candidat 0 : 8 A, autres 2 A"), (10, 2, "candidat 0 : 10 A, autres 2 A"),
                             (0, 4, "candidat 0 : 0 A, autres 4 A")):
        nb_A = [k0] + [kautres] * (C - 1)
        r05, r_holm = taux_rejet(nb_A, 0.85, p_A)
        fwer = 1 - (1 - r_holm) ** 16
        print(f"p_A={p_A} {lib:42s} rejet à 0,05 : {r05:.3f} ; à 0,05/16 : {r_holm:.3f} ; FWER si 16 couples indépendants : {fwer:.3f}")

print()
print("== Puissance : composition égale (2 A / 30 partout), le candidat 0 a une exactitude plus basse de delta ==")
for delta in (0.10, 0.15, 0.20, 0.25, 0.30):
    nb_A = [2] * C
    r05, r_holm = taux_rejet(nb_A, 0.85, 0.5, delta)
    print(f"delta={delta:.2f} : puissance à 0,05 : {r05:.3f} ; à 0,05/16 (premier pas de Holm) : {r_holm:.3f}")
