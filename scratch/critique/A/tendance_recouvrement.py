"""Tendance (§8, H5) : questions communes entre le premier et le dernier run quand chaque run
reprend 80 % des questions du run précédent, choisies au hasard parmi elles (§5, « 80 % des
questions sont reprises du run précédent, 20 % sont neuves » ; code : tirage.ts mélange les
reprises éligibles puis en prend le budget). Hypothèse favorable : aucun item n'obsolète, aucun
texte ne change, même quota à chaque run.

Puis demi-largeur de la différence appariée d'exactitude sur n questions communes : 6 réponses
par question, corrélation intra-question 0,5, corrélation de l'effet question entre les deux runs
0,5, exactitude 0,8 aux deux runs, bootstrap percentile en grappes à 2 000 rééchantillons.
"""
import numpy as np

rng = np.random.default_rng(20261102)
N = 420  # questions d'un run (ordre de grandeur du §5 : ~400 items, quota 1 par strate)

print("== Part et nombre attendus de questions du run 1 encore présentes au run k ==")
print("(part = 0,8^(k-1) ; k = rang du run, le run 1 étant le premier run public)")
for k in (2, 3, 5, 8, 10, 12, 15, 18, 20, 22):
    part = 0.8 ** (k - 1)
    print(f"run {k:2d} : {100*part:5.1f} %  ->  ~{N*part:5.1f} questions communes sur {N}")
print("Calendrier du §6 : 2 runs mensuels (déc., janv.) + runs hebdomadaires de février au second tour")
print("(+ run après la liste officielle, + un run par débat) : le dernier run est de rang ~18 à 22.")

print()
print("== Demi-largeur de la différence appariée (dernier - premier) selon le nombre de questions communes ==")


def diff_appariee(n, m=6, p=0.8, rho=0.5, r_runs=0.5, B=2000):
    ab = 1.0 / rho - 1.0
    # effet question partagé entre les deux runs : mélange d'une composante commune et d'une propre
    commun = rng.beta(p * ab, (1 - p) * ab, size=n)
    def bras():
        propre = rng.beta(p * ab, (1 - p) * ab, size=n)
        pi = np.clip(r_runs * commun + (1 - r_runs) * propre, 0, 1)
        return rng.binomial(m, pi)
    e1, e2 = bras(), bras()
    idx = rng.integers(0, n, size=(B, n))
    d = (e2[idx].sum(axis=1) - e1[idx].sum(axis=1)) / (n * m)
    bas, haut = np.quantile(d, [0.025, 0.975], method="linear")
    return (haut - bas) / 2


for n in (6, 12, 25, 50, 100, 200, 420):
    dl = np.median([diff_appariee(n) for _ in range(300)])
    print(f"n={n:3d} questions communes : demi-largeur ~ {100*dl:4.1f} points")

print()
print("== Correction : retour par hasard d'une question abandonnée ==")
print("Dans une strate de quota 1 dont le réservoir compte s questions tirables, une question sortie de la")
print("chaîne des reprises peut être retirée comme « neuve » (1 chance sur s-1 à chaque renouvellement). La")
print("part de questions du run 1 présentes au run k tend alors vers 1/s au lieu de 0 :")
print("part(k) ~ 0,8^(k-1) + (1 - 0,8^(k-1)) / s")
for s in (1, 2, 3, 6, 20):
    parts = [0.8 ** (k - 1) + (1 - 0.8 ** (k - 1)) / s for k in (5, 10, 20)]
    print(f"s={s:2d} : run 5 : {100*parts[0]:5.1f} % ; run 10 : {100*parts[1]:5.1f} % ; run 20 : {100*parts[2]:5.1f} %"
          f"  -> ~{N*parts[2]:5.0f} questions communes au run 20 sur {N}")
print("s = 1 : candidat qui n'a qu'un item tirable dans la strate (sous la cible de 30 items) ;")
print("s = 3 : candidat à la cible (30 items P, 3 par thème) ; s = 6 et plus : candidat très couvert, ou")
print("questions d'attribution (réservoir = mesures du thème). Les réservoirs grossissent au fil de la")
print("campagne (items nouveaux), ce qui abaisse encore la part. L'effectif de H5 n'est donc pas garanti")
print("par le protocole : il dépend de la taille des réservoirs, et il est le plus faible là où la mesure")
print("est la plus riche.")
