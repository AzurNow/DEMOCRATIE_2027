"""Critique du protocole 0.26, groupe B2 — un kappa juge-humain global peut masquer un biais du juge
propre à un outil (§7, §12).

Hypothèses :
- 10 couples outil × mode, N réponses obtenues par couple et par run ; échantillon humain de 10 % ;
- la note humaine retenue est la vérité ; distribution des catégories : exacte 0,75, inexacte 0,15,
  non-réponse 0,10 ;
- le juge reproduit la note humaine avec probabilité a = 0,93, sinon rend une autre catégorie au
  hasard (bruit uniforme sur tous les couples) ;
- sur un seul couple « X », le juge est en plus indulgent : une réponse « inexacte » est notée
  « exacte » avec probabilité L (biais propre à cet outil : style, longueur, formulation familière…) ;
- hors échantillon (90 % des réponses), la note retenue est celle des juges (on suppose les deux
  juges d'accord, cas le plus défavorable : aucun humain appelé).
Sorties : kappa de Cohen global et par couple sur l'échantillon ; biais de l'exactitude publiée de X.
Stdlib seulement, graine fixée.
"""

import random

CATS = ("exacte", "inexacte", "non_reponse")
PREV = (0.75, 0.15, 0.10)


def kappa(paires: list[tuple[str, str]]) -> float | None:
    n = len(paires)
    if n == 0:
        return None
    po = sum(1 for a, b in paires if a == b) / n
    pe = sum((sum(1 for a, _ in paires if a == c) / n) * (sum(1 for _, b in paires if b == c) / n) for c in CATS)
    if pe == 1:
        return None
    return (po - pe) / (1 - pe)


def simuler(N: int, a: float, L: float, graine: int = 7) -> None:
    rng = random.Random(graine)
    couples = [f"couple-{i:02d}" for i in range(10)]
    X = couples[0]
    echantillon: list[tuple[str, str, str]] = []
    exactitude_juge: dict[str, list[int]] = {}
    exactitude_vraie: dict[str, list[int]] = {}
    for c in couples:
        for r in range(N):
            verite = rng.choices(CATS, PREV)[0]
            if rng.random() < a:
                note = verite
            else:
                note = rng.choice([k for k in CATS if k != verite])
            if c == X and verite == "inexacte" and rng.random() < L:
                note = "exacte"
            # métrique : exactitude = exactes / (exactes + inexactes), sur la note retenue
            dans_echantillon = r < N // 10
            if dans_echantillon:
                echantillon.append((c, note, verite))
            retenue = verite if dans_echantillon else note
            if retenue in ("exacte", "inexacte"):
                exactitude_juge.setdefault(c, []).append(1 if retenue == "exacte" else 0)
            if verite in ("exacte", "inexacte"):
                exactitude_vraie.setdefault(c, []).append(1 if verite == "exacte" else 0)
    kg = kappa([(n, v) for _, n, v in echantillon])
    kx = kappa([(n, v) for c, n, v in echantillon if c == X])
    ka = kappa([(n, v) for c, n, v in echantillon if c != X])
    ex_pub = sum(exactitude_juge[X]) / len(exactitude_juge[X])
    ex_vraie = sum(exactitude_vraie[X]) / len(exactitude_vraie[X])
    print(
        f"N = {N} réponses/couple (échantillon {N // 10}/couple), a = {a}, L = {L} : "
        f"kappa global = {kg:.3f} ; kappa du couple X = {kx:.3f} ; kappa des autres = {ka:.3f} ; "
        f"exactitude publiée de X = {ex_pub:.3f} contre vraie {ex_vraie:.3f} (biais {100 * (ex_pub - ex_vraie):+.1f} points)"
    )


print("Seuil du §12 : kappa >= 0,75 par juge, calculé sur tout l'échantillon.\n")
for N in (1200, 2400):
    for L in (0.0, 0.3, 0.5, 0.7):
        simuler(N, 0.93, L)
    print()
print("Lecture : le kappa global reste au-dessus de 0,75 quand un seul couple sur dix est noté avec")
print("indulgence, alors que l'exactitude publiée de ce couple est surestimée de plusieurs points.")
print("Un kappa (ou l'accord observé) par couple outil × mode sur le même échantillon le montrerait.")

print("\nRevue humaine à sens unique des fabrications (§7) : seules les réponses qu'un juge marque")
print("« fabrication » sont revues ; une fabrication que les deux juges manquent n'est rattrapée que par")
print("l'échantillon de 10 %. Si les deux juges manquent la même part m des fabrications :")
for m in (0.05, 0.10, 0.20):
    print(f"  m = {m:.0%} : taux de fabrication publié = (1 - 0,9 × {m}) × taux vrai, soit {100 * 0.9 * m:.1f} % de sous-estimation relative")
