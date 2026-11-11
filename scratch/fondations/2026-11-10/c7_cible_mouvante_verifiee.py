"""C7 : changements de modèle par défaut attendus pendant la campagne, sur les seuls événements vérifiés (H9).

Usage : python3 scratch/fondations/2026-11-10/c7_cible_mouvante_verifiee.py   (depuis la racine du dépôt)

Écrit par la session le 2026-11-11 (étape 5 de la passe). C5 comptait aussi des événements lus dans des extraits
de moteur de recherche ou déduits d'une page de dépréciations ; l'étape 4 ne les a pas confirmés (verification.md).
Ce script refait le compte sur les seuls événements qu'une page officielle rouverte le 2026-11-10 appelle un
changement du modèle de l'application grand public :

- Gemini, notes de version : 2025-12-17, « Gemini 3 Flash est désormais le nouveau modèle par défaut » ;
- Le Chat, annonce Mistral : 2026-05-22, « Mistral Medium 3.5 becomes the default model in Le Chat » ;
- DeepSeek, journal des mises à jour : 2026-08-13 (V4-Pro sur « APP, Web, and API ») et 2026-10-17
  (« The official web and APP models have also been updated »).

Pour ChatGPT, Claude, Grok et Perplexity, aucune page rouverte par la session ne date un changement du modèle de
l'application : ils ne sont pas comptés, ce qui fait du résultat une borne basse et non une estimation.

Deuxième compte, même méthode : intermédiaires IA grand public lancés en France pendant les 24 mois précédant
la passe, d'après les deux seuls lancements vérifiés : Meta AI dans Facebook, Instagram, WhatsApp et Messenger,
annoncé le 2025-03-20 pour 41 pays européens (la page ne liste pas les pays ; l'usage en France est attesté par
l'enquête Ipsos de décembre 2025, 37 % des répondants) ; AI Overviews et AI Mode de Google, déployés en France
le 2026-07-22. Le relevé n'a pas cherché tous les lancements : borne basse.

Modèle : rythme constant, loi de Poisson (comme C5). Le rythme passé n'est pas une prévision.
"""

from __future__ import annotations

import math
from datetime import date

FENETRE_MODELES = (date(2025, 11, 1), date(2026, 11, 1))  # douze mois, comme C5
CAMPAGNE_MOIS = 6  # décembre 2026 → mai 2027, comme C5
CHANGEMENTS_VERIFIES = {
    "Gemini": [date(2025, 12, 17)],
    "Le Chat": [date(2026, 5, 22)],
    "DeepSeek": [date(2026, 8, 13), date(2026, 10, 17)],
}
FENETRE_LANCEMENTS = (date(2024, 11, 10), date(2026, 11, 10))  # vingt-quatre mois avant la passe
LANCEMENTS_VERIFIES = [date(2025, 3, 20), date(2026, 7, 22)]


def mois_entre(debut: date, fin: date) -> float:
    return (fin - debut).days / (365.25 / 12)


def attendus(evenements: list[date], fenetre: tuple[date, date], horizon_mois: float) -> float:
    dans = [d for d in evenements if fenetre[0] <= d <= fenetre[1]]
    return len(dans) / mois_entre(*fenetre) * horizon_mois


def au_moins_un(esperance: float) -> float:
    return 1 - math.exp(-esperance)


def main() -> None:
    print("C7.1 Changements du modèle par défaut de l'application, événements vérifiés seulement")
    print("  | outil | changements vérifiés en douze mois | attendus sur six mois | P(au moins un) |")
    print("  |---|---|---|---|")
    total = 0.0
    for outil, evenements in CHANGEMENTS_VERIFIES.items():
        esperance = attendus(evenements, FENETRE_MODELES, CAMPAGNE_MOIS)
        total += esperance
        print(f"  | {outil} | {len(evenements)} | {esperance:.2f} | {au_moins_un(esperance):.2f} |")
    print(f"  | les trois ensemble | {sum(len(e) for e in CHANGEMENTS_VERIFIES.values())} | {total:.2f} | {au_moins_un(total):.2f} |")
    print("  Borne basse : ChatGPT, Claude, Grok et Perplexity ne sont pas comptés, faute de page datant un changement.")
    print()
    print("C7.2 Intermédiaires IA grand public lancés en France, lancements vérifiés seulement")
    esperance = attendus(LANCEMENTS_VERIFIES, FENETRE_LANCEMENTS, CAMPAGNE_MOIS)
    print(f"  lancements vérifiés en {mois_entre(*FENETRE_LANCEMENTS):.0f} mois : {len(LANCEMENTS_VERIFIES)} ; "
          f"attendus sur six mois : {esperance:.2f} ; P(au moins un) : {au_moins_un(esperance):.2f}")
    print("  Borne basse : le relevé n'a pas cherché tous les lancements. Le premier (2025-03-20) est annoncé pour 41 pays")
    print("  européens sans liste de pays ; son usage en France est attesté par une enquête de décembre 2025.")


if __name__ == "__main__":
    main()
