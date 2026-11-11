"""C6 : échelle de repli des couches de volume, et runs mensuels publiables avant le premier tour (H6, H7).

Usage : python3 scratch/fondations/2026-11-10/c6_echelle_de_repli.py   (depuis la racine du dépôt)

Écrit par la session le 2026-11-11 (étape 5 de la passe), sur les fonctions et les paramètres de C1, C1d et C2 :
aucun paramètre nouveau n'est posé sur les heures ou les prix. Ce qui est nouveau, et écrit ici :

- les barreaux : (0) format complet du protocole 0.34 ; (1) un échantillon (levier déjà préenregistré au §12) ;
  (2) un échantillon et le seul mode de tête de chaque outil (§8, « Mode de tête ») ; (3) un échantillon et une
  formulation ; (4) un échantillon, une formulation et le seul mode de tête ;
- PARAMÈTRE : le mode de tête de chaque outil n'est documenté nulle part (C4, C5). Deux bornes : « web » quand
  l'API l'offre, ou « sans web » quand l'API l'offre. Les heures humaines ne dépendent que du nombre de réponses ;
  seuls les euros changent d'une borne à l'autre ;
- PARAMÈTRE : dates du premier run public (mardi 2 février ou mardi 2 mars 2027) et capacité du pool
  d'annotateurs (10, 20, 40, 80 h par semaine au total) ;
- ordonnanceur : la notation humaine d'un run commence quand la fenêtre de 48 h est fermée et que les liens et
  les juges ont tourné (1 à 3 jours, C1), jamais avant la fin de celle du run précédent ; le run est publié 1 à
  2 jours après (analyse, checklist, dépôt : C1), et compte « avant le premier tour » s'il l'est au plus tard le
  16 avril 2027 (veille électorale du §10 dès le 17 avril à 0 h).

- canal application (§6) : 60 questions × 7 assistants × 2 testeurs par mois, 3 à 6 min par saisie (C3), et la
  notation humaine de ces 840 réponses, « notées comme celles de l'API » (échantillon de 10 % et réponses que les
  juges renvoient à un humain, aux taux de C2.4). PARAMÈTRE : testeurs et annotateurs sont les mêmes personnes
  (§10, « Annotateurs et testeurs ») ; C6.2 compte les runs sans ce canal, C6.3 avec, sur le même pool ;
- C6.4, deux variantes du canal application, mêmes fonctions : une saisie réduite à 2 questions par candidat
  (PARAMÈTRE, posé par la passe pour l'essai de H1 au run pilote), et le canal du §6 étendu à deux assistants
  de plus (PARAMÈTRE : les deux assistants les mieux classés que la règle du §3 ne retient pas, C4).

Rien ici n'est une recommandation : ce sont des heures, des euros et des dates calculés. Aucun assistant interrogé.
"""

from __future__ import annotations

import math
from datetime import date, timedelta

import parametres as P
from c1_calendrier import questions_quota_1
from c2_couts_par_couche import (
    bas_haut,
    cout_reponse_interrogation,
    cout_reponse_juge,
    eur,
    heures_humaines_par_run,
)

SEMAINES_PAR_MOIS = 52 / 12
DERNIERE_PUBLICATION_AVANT_T1 = P.PREMIER_TOUR - timedelta(days=2)  # vendredi 16 avril 2027, 24 h
DELAI_LIENS_ET_JUGES = (1, 3)  # jours, repris de C1 (DELAI_JUGES_ET_LIENS)
DELAI_ANALYSE_ET_PUBLICATION = (1, 2)  # jours, repris de C1
POOLS_H_SEM = (10, 20, 40, 80)  # PARAMÈTRE : heures d'annotateurs par semaine, pool entier
PREMIERS_RUNS = (date(2027, 2, 2), date(2027, 3, 2))  # PARAMÈTRE : premier mardi de février, de mars


def milliers(x: float) -> str:
    """Entier arrondi, milliers séparés par une espace."""
    return f"{x:,.0f}".replace(",", " ")


def couples_complets() -> list[tuple[str, str, str, str]]:
    return [(outil, mode, gratuit, payant) for outil, modes, gratuit, payant, _ in P.OUTILS for mode in modes]


def couples_mode_de_tete(prefere: str) -> list[tuple[str, str, str, str]]:
    """Un couple par outil : le mode préféré quand l'API l'offre, sinon le seul mode offert."""
    out = []
    for outil, modes, gratuit, payant, _ in P.OUTILS:
        mode = prefere if prefere in modes else modes[0]
        out.append((outil, mode, gratuit, payant))
    return out


def cout_api_usd(couples: list[tuple[str, str, str, str]], q: int, f: int, e: int, payant: bool, lot: bool, cache: bool) -> float:
    par_couple = q * f * e
    total = 0.0
    for outil, mode, gratuit, pay in couples:
        modele = pay if payant else gratuit
        total += par_couple * cout_reponse_interrogation(outil, mode, modele)
        for juge in P.JUGES:
            total += par_couple * cout_reponse_juge(juge, mode == "web", lot, cache)
    for juge in P.JUGES:  # test contrefactuel des candidats : 200 réponses renotées deux fois par juge (C2.3)
        total += 2 * P.REPONSES_CONTREFACTUEL * (cout_reponse_juge(juge, True, lot, cache) + cout_reponse_juge(juge, False, lot, cache)) / 2
    return total


def heures_annotateurs(couples: list[tuple[str, str, str, str]], q: int, f: int, e: int, haut: bool) -> tuple[int, float]:
    reponses = q * f * e * len(couples)
    reponses_web = q * f * e * sum(1 for _, mode, *_ in couples if mode == "web")
    h = heures_humaines_par_run(reponses, reponses_web, haut)
    total = h["h_echantillon"] + h["h_declenchees"] + h["h_comparateurs"] + h["h_items_a"] + h["h_nouveaux_items"]
    return reponses, total


QUESTIONS_SAISIE_REDUITE = 2  # PARAMÈTRE : questions par candidat de la saisie réduite au run pilote (H1)
ASSISTANTS_DE_PLUS = 2  # PARAMÈTRE : assistants mesurés sur le seul canal application (H2)


def heures_canal_application(haut: bool, questions_par_candidat: int | None = None, assistants: int | None = None) -> tuple[int, float, float]:
    """(saisies par passage, heures de saisie, heures de notation humaine de ces réponses)."""
    par_candidat = P.QUESTIONS_APPLICATION_PAR_CANDIDAT if questions_par_candidat is None else questions_par_candidat
    nombre = len(P.OUTILS) if assistants is None else assistants
    saisies = par_candidat * P.CANDIDATS * nombre * P.TESTEURS
    h_saisie = saisies * bas_haut(P.MIN_PAR_SAISIE_APPLICATION, haut) / 60
    h = heures_humaines_par_run(saisies, 0, haut)
    return saisies, h_saisie, h["h_echantillon"] + h["h_declenchees"]


def barreaux() -> list[tuple[str, int, int, list[tuple[str, str, str, str]], list[tuple[str, str, str, str]]]]:
    """(libellé, formulations, échantillons, couples à la borne « web », couples à la borne « sans web »)."""
    tous = couples_complets()
    tete_web, tete_sans = couples_mode_de_tete("web"), couples_mode_de_tete("sans_web")
    return [
        ("0. complet (3 F, 2 E, deux modes)", 3, 2, tous, tous),
        ("1. un échantillon", 3, 1, tous, tous),
        ("2. un échantillon, mode de tête seul", 3, 1, tete_web, tete_sans),
        ("3. un échantillon, une formulation", 1, 1, tous, tous),
        ("4. un échantillon, une formulation, mode de tête seul", 1, 1, tete_web, tete_sans),
    ]


def runs_mensuels(premier: date) -> list[date]:
    """Premier mardi de chaque mois à partir du premier run, jusqu'au second tour."""
    out, annee, mois = [], premier.year, premier.month
    while True:
        d = P.premier_mardi_du_mois(annee, mois)
        if d > P.SECOND_TOUR:
            return out
        if d >= premier:
            out.append(d)
        mois += 1
        if mois == 13:
            annee, mois = annee + 1, 1


def publies_avant_t1(ouvertures: list[date], heures_par_run: float, pool_h_sem: float, haut: bool) -> tuple[int, list[date]]:
    """Nombre de runs publiés au plus tard le 16 avril 2027, et leurs dates de publication."""
    liens = bas_haut(DELAI_LIENS_ET_JUGES, haut)
    publication = bas_haut(DELAI_ANALYSE_ET_PUBLICATION, haut)
    fin_precedente = date.min
    dates = []
    for ouverture in ouvertures:
        pret = ouverture + timedelta(days=2 + liens)
        debut = max(pret, fin_precedente)
        fin = debut + timedelta(days=math.ceil(7 * heures_par_run / pool_h_sem))
        fin_precedente = fin
        dates.append(fin + timedelta(days=publication))
    return sum(1 for d in dates if d <= DERNIERE_PUBLICATION_AVANT_T1), dates


def main() -> None:
    q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS)
    print(f"C6. Échelle de repli (quota 1 : {q} questions tirées ; {len(couples_complets())} couples outil × mode ; "
          f"{len(P.OUTILS)} outils ; 1 EUR = {1 / P.TAUX_CHANGE_EUR_PAR_USD:.4f} USD)")
    print()
    print("C6.1 Par run : réponses, heures d'annotateurs (jeu bas–haut de C2.4), euros d'API")
    print("  | barreau | réponses | h annot. bas | h annot. haut | € API standard (gratuit–payant) | € API juges en lot + cache | "
          "annotateurs à 10 h/sem pour un run par mois (bas–haut) | pour un run par semaine (bas–haut) |")
    print("  |---|---|---|---|---|---|---|---|")
    lignes = []
    for libelle, f, e, c_web, c_sans in barreaux():
        reponses, h_bas = heures_annotateurs(c_web, q, f, e, haut=False)
        _, h_haut = heures_annotateurs(c_web, q, f, e, haut=True)
        std = sorted(eur(cout_api_usd(c, q, f, e, payant, lot=False, cache=False)) for c in (c_web, c_sans) for payant in (False, True))
        lot = sorted(eur(cout_api_usd(c, q, f, e, payant, lot=True, cache=True)) for c in (c_web, c_sans) for payant in (False, True))
        mois = (h_bas / (10 * SEMAINES_PAR_MOIS), h_haut / (10 * SEMAINES_PAR_MOIS))
        sem = (h_bas / 10, h_haut / 10)
        lignes.append((libelle, reponses, h_bas, h_haut))
        print(f"  | {libelle} | {milliers(reponses)} | {milliers(h_bas)} | {milliers(h_haut)} | {milliers(std[0])}–{milliers(std[-1])} | "
              f"{milliers(lot[0])}–{milliers(lot[-1])} | {mois[0]:.1f}–{mois[1]:.1f} | {sem[0]:.0f}–{sem[1]:.0f} |")
    print()
    print("  Lecture : « annotateurs à 10 h/sem » = heures d'un run divisées par ce qu'un annotateur à 10 h par semaine fournit")
    print("  en un mois (43,3 h) ou en une semaine (10 h). Le §7 en exige au moins deux, quel que soit le volume.")
    print()
    saisies, saisie_bas, notation_bas = heures_canal_application(haut=False)
    _, saisie_haut, notation_haut = heures_canal_application(haut=True)
    app_bas, app_haut = saisie_bas + notation_bas, saisie_haut + notation_haut
    print(f"  Canal application du §6, par passage mensuel : {saisies} saisies, {saisie_bas:.0f}–{saisie_haut:.0f} h de saisie, "
          f"{notation_bas:.0f}–{notation_haut:.0f} h de notation humaine, soit {app_bas:.0f}–{app_haut:.0f} h en plus de chaque ligne.")
    print()
    for titre, plus_bas, plus_haut in (
        ("C6.2 Runs mensuels publiés au plus tard le 16 avril 2027, sans le canal application", 0.0, 0.0),
        ("C6.3 Les mêmes, canal application compris, sur le même pool", app_bas, app_haut),
    ):
        print(titre + " (veille électorale dès le 17 avril, §10)")
        for premier in PREMIERS_RUNS:
            ouvertures = [d for d in runs_mensuels(premier) if d < P.PREMIER_TOUR]
            print(f"  premier run public le mardi {premier.isoformat()} ; fenêtres mensuelles avant le premier tour : "
                  f"{', '.join(d.isoformat() for d in ouvertures)}")
            print("  | barreau | h par run (bas–haut) | pool 10 h/sem (bas / haut) | 20 h/sem | 40 h/sem | 80 h/sem |")
            print("  |---|---|---|---|---|---|")
            for libelle, _, h_bas, h_haut in lignes:
                cellules = []
                for pool in POOLS_H_SEM:
                    n_bas, _ = publies_avant_t1(ouvertures, h_bas + plus_bas, pool, haut=False)
                    n_haut, _ = publies_avant_t1(ouvertures, h_haut + plus_haut, pool, haut=True)
                    cellules.append(f"{n_bas} / {n_haut}")
                print(f"  | {libelle} | {milliers(h_bas + plus_bas)}–{milliers(h_haut + plus_haut)} | " + " | ".join(cellules) + " |")
            print()
    print("  Lecture : chaque cellule donne le nombre de runs publiés avant le premier tour au jeu bas puis au jeu haut,")
    print("  sur le nombre de fenêtres de la ligne d'en-tête. Le run supplémentaire qui suit la liste officielle (§6) n'est")
    print("  pas compté : sa date n'a pas été vérifiée par la session (verification.md).")
    print()
    print("C6.4 Variantes du canal application (3 à 6 min par saisie, deux testeurs qui saisissent tout, comme au §6)")
    print("  | variante | saisies | h de saisie (bas–haut) | h de notation humaine (bas–haut) | total (bas–haut) |")
    print("  |---|---|---|---|---|")
    variantes = (
        (f"saisie réduite au run pilote : {QUESTIONS_SAISIE_REDUITE} questions par candidat, {len(P.OUTILS)} assistants", QUESTIONS_SAISIE_REDUITE, None),
        (f"canal du §6 pour {ASSISTANTS_DE_PLUS} assistants de plus, par passage mensuel", None, ASSISTANTS_DE_PLUS),
    )
    for libelle, par_candidat, assistants in variantes:
        n, s_bas, n_bas = heures_canal_application(False, par_candidat, assistants)
        _, s_haut, n_haut = heures_canal_application(True, par_candidat, assistants)
        print(f"  | {libelle} | {n} | {s_bas:.1f}–{s_haut:.1f} | {n_bas:.1f}–{n_haut:.1f} | {s_bas + n_bas:.0f}–{s_haut + n_haut:.0f} |")


if __name__ == "__main__":
    main()
