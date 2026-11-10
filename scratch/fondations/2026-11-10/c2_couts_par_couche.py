"""C2 : coût d'API (euros) et heures humaines par couche de rigueur, par run et par mois (hypothèse H7).

Usage : python3 scratch/fondations/2026-11-10/c2_couts_par_couche.py   (depuis la racine du dépôt)

Périmètre du 15 octobre 2026 (7 outils, 11 couples outil × mode, 12 candidats, 30 items P par candidat, quota 1
par strate comme dans scratch/critique/D/faisabilite.py), rythme hebdomadaire (52/12 runs par mois). Tarifs
vérifiés le 2026-11-10 (parametres.py), hypothèses de jetons reprises de faisabilite.py. Deux jeux : bas (bornes
basses des fourchettes humaines, modèle gratuit des outils) et haut (bornes hautes, modèle payant des outils).
Les couches : extraction double (une fois) ; double validation humaine (une fois, puis revérifications) ;
reformulations et leur relecture ; interrogation (par outil, mode, formulation, échantillon) ; deux juges ; test
contrefactuel ; échantillon humain 10 % ; désaccords des juges et erreurs graves ; lectures des comparateurs ;
arbitrages. Puis, pour chaque couche optionnelle, le coût évité par run et par mois et ce que la même dépense
achèterait (un outil de plus, le canal application porté à N questions, un run de plus).
"""

from __future__ import annotations

import math

import parametres as P
from c1_calendrier import questions_quota_1
from c1d_perimetre_reduit import jetons_entree_juge, prix

# ----------------------------------------------------------------------------- hypothèses propres à ce calcul
SOURCES_PAR_CANDIDAT = (5, 15)  # PARAMÈTRE : sources T1 collectées par candidat (programme, pages du site, tribunes)
PART_ITEMS_NOUVEAUX_PAR_RUN = (0.02, 0.05)  # PARAMÈTRE : items créés ou revalidés entre deux runs hebdomadaires
PRIX_CACHE_SONNET = 0.05  # platform.claude.com pricing (lu) : lecture de cache à 0,05× le prix d'entrée pour Sonnet 5.5
USD = "USD"


def eur(usd: float) -> float:
    return usd * P.TAUX_CHANGE_EUR_PAR_USD


def bas_haut(f, haut: bool) -> float:
    a, b = P.fourchette(f)
    return b if haut else a


def items_total() -> int:
    return P.CANDIDATS * P.ITEMS_P_CIBLE + P.ITEMS_A + P.CANDIDATS * P.ITEMS_F_PAR_CANDIDAT[1] + P.ITEMS_O


def questions_engendrees() -> int:
    """Toutes les questions engendrées (avant tirage), à relire sous trois formulations (§5)."""
    p = P.CANDIDATS * P.ITEMS_P_CIBLE * P.GABARITS_PAR_ITEM_P
    a = P.ITEMS_A * 2  # directe, fermée
    o = P.ITEMS_O * 3  # fermée, orientée, actualité
    f = P.CANDIDATS * P.ITEMS_F_PAR_CANDIDAT[1] * 2  # attribution, orientée
    mesures = round(P.CANDIDATS * P.ITEMS_P_CIBLE * sum(P.MESURES_PAR_ITEM_P) / 2)  # une Q-ATT par mesure
    return p + a + o + f + mesures


def couples(modes: set[str]) -> list[tuple[str, str, str, str]]:
    return [(outil, mode, gratuit, payant) for outil, ms, gratuit, payant, _ in P.OUTILS for mode in ms if mode in modes]


def cout_reponse_interrogation(outil: str, mode: str, modele: str) -> float:
    pi, po = prix(modele)
    k = P.SURCOUT_TOKENISEUR_CLAUDE if outil == "Claude" else 1.0
    c = (P.ENTREE_OUTIL_JETONS * k * pi + P.SORTIE_OUTIL_JETONS * k * po) / 1e6
    if mode == "web":
        c += P.JETONS_CONTENU_RECHERCHE * k * pi / 1e6
        recherche = P.PRIX_RECHERCHE_WEB_PAR_1000.get(outil, sum(P.PRIX_RECHERCHE_WEB_PARAMETRE.get(outil, (0, 0))) / 2)
        c += P.RECHERCHES_PAR_REPONSE_WEB * recherche / 1000
    return c


def cout_reponse_juge(juge: str, web: bool, lot: bool = False, cache: bool = False) -> float:
    modele, claude = P.JUGES[juge]
    pi, po = P.PRIX_USD_PAR_M[modele]
    prompt = P.jetons(P.caracteres_prompt("judge-1.0.0.md"), claude)
    entree = jetons_entree_juge(web, claude)
    sortie = P.JETONS_SORTIE_JUGE * (P.SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
    cout = ((entree - prompt) * pi + prompt * pi * (PRIX_CACHE_SONNET if cache and claude else 1.0) + sortie * po) / 1e6
    return cout * (0.5 if lot else 1.0)


def heures_humaines_par_run(reponses: int, reponses_web: int, haut: bool, part_echantillon: float = P.PART_ECHANTILLON_HUMAIN) -> dict[str, float]:
    minutes = bas_haut(P.MIN_PAR_NOTATION_REPONSE, haut)
    ech = math.ceil(part_echantillon * reponses)
    desaccord = bas_haut(P.TAUX_DESACCORD_JUGES, haut)
    partiel = bas_haut(P.TAUX_ACCORD_PARTIEL, haut)
    fab = P.PART_QUESTIONS_A_F_MIN * bas_haut(P.TAUX_FABRICATION, haut)
    matt = P.PART_QUESTIONS_ATT * bas_haut(P.TAUX_MAUVAISE_ATTRIBUTION_ATT, haut)
    part_declenchee = 1 - (1 - desaccord) * (1 - partiel) * (1 - fab) * (1 - matt)
    h_echantillon = ech * (P.ANNOTATEURS + P.TAUX_DESACCORD_HUMAINS) * minutes / 60
    h_declenchees = reponses * part_declenchee * minutes / 60
    lectures = P.CANDIDATS * P.ITEMS_P_CIBLE * P.COMPARATEURS
    reprise = bas_haut(P.PART_LECTURES_COMPARATEUR_REPRISES, not haut)  # jeu haut = moins de reprise
    h_comparateurs = lectures * (1 - reprise) * (P.ANNOTATEURS + P.TAUX_DESACCORD_HUMAINS) * P.MIN_PAR_LECTURE_COMPARATEUR / 60
    h_items_a = P.ITEMS_A * P.PART_RUNS_AVEC_NOUVELLE_SOURCE_T1 * P.MINUTES_REVERIFICATION_A / 60
    nouveaux = items_total() * bas_haut(PART_ITEMS_NOUVEAUX_PAR_RUN, haut)
    h_nouveaux = nouveaux * P.ANNOTATEURS * bas_haut(P.MIN_PAR_ITEM_VALIDATION, haut) / 60
    h_relecture_nouv = nouveaux * P.GABARITS_PAR_ITEM_P * bas_haut(P.MIN_PAR_RELECTURE_FORMULATION, haut) / 60
    return {
        "echantillon_reponses": ech,
        "h_echantillon": h_echantillon,
        "h_declenchees": h_declenchees,
        "part_declenchee": part_declenchee,
        "h_comparateurs": h_comparateurs,
        "h_items_a": h_items_a,
        "h_nouveaux_items": h_nouveaux + h_relecture_nouv,
        "h_auteur": P.HEURES_AUTEUR_PAR_RUN_CIBLE,
    }


def couche_extraction(haut: bool) -> float:
    chars = bas_haut(P.CARACTERES_CORPUS_T1_PAR_CANDIDAT, haut)
    sources = bas_haut(SOURCES_PAR_CANDIDAT, haut)
    prompt = P.caracteres_prompt("extraction-1.0.0.md")
    total = 0.0
    for modele, claude in (("claude-sonnet-5-5", True), ("mistral-large", False)):
        pi, po = P.PRIX_USD_PAR_M[modele]
        entree = P.CANDIDATS * (P.jetons(chars, claude) + sources * P.jetons(prompt, claude))
        sortie = P.CANDIDATS * P.JETONS_SORTIE_EXTRACTION_PAR_CANDIDAT * (P.SURCOUT_TOKENISEUR_CLAUDE if claude else 1)
        total += (entree * pi + sortie * po) / 1e6
    return total * (1 + P.PART_SOURCES_REEXTRAITES)


def couche_reformulation_api(n_questions: int) -> float:
    pi, po = P.PRIX_USD_PAR_M["mistral-large"]  # config/reformulation.json : identifiant épinglé de Mistral Large (TACHES-AUTEUR 827)
    prompt = P.jetons(P.caracteres_prompt("reformulation-1.0.1.md"))
    return n_questions * ((prompt + P.ENTREE_OUTIL_JETONS) * pi + P.JETONS_SORTIE_REFORMULATION * po) / 1e6


def tableau_interrogation(q: int, f: int, e: int, modes: set[str], payant: bool) -> tuple[float, list[tuple[str, str, str, float]]]:
    lignes, total = [], 0.0
    for outil, mode, gratuit, pay in couples(modes):
        modele = pay if payant else gratuit
        c = cout_reponse_interrogation(outil, mode, modele) * q * f * e
        lignes.append((outil, mode, modele, c))
        total += c
    return total, lignes


def cout_juges(q: int, f: int, e: int, modes: set[str], lot: bool, cache: bool) -> dict[str, float]:
    par_couple = q * f * e
    n_web = sum(1 for _, m, *_ in couples(modes) if m == "web")
    n_sans = sum(1 for _, m, *_ in couples(modes) if m == "sans_web")
    out = {}
    for juge in P.JUGES:
        c = par_couple * (n_web * cout_reponse_juge(juge, True, lot, cache) + n_sans * cout_reponse_juge(juge, False, lot, cache))
        contrefactuel = 2 * P.REPONSES_CONTREFACTUEL * (cout_reponse_juge(juge, True, lot, cache) + cout_reponse_juge(juge, False, lot, cache)) / 2
        out[juge] = c
        out[juge + "_contrefactuel"] = contrefactuel
    return out


def scenario(libelle: str, f: int, e: int, modes: set[str], haut: bool, part_echantillon: float = P.PART_ECHANTILLON_HUMAIN, juges: tuple[str, ...] = ("sonnet-5.5", "mistral-large")) -> dict[str, float]:
    q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS)
    cs = couples(modes)
    reponses = q * f * e * len(cs)
    reponses_web = q * f * e * sum(1 for _, m, *_ in cs if m == "web")
    inter, _ = tableau_interrogation(q, f, e, modes, payant=haut)
    j = cout_juges(q, f, e, modes, lot=False, cache=False)
    api_juges = sum(j[x] for x in juges) + sum(j[x + "_contrefactuel"] for x in juges)
    h = heures_humaines_par_run(reponses, reponses_web, haut, part_echantillon)
    if len(juges) == 1:
        h["h_declenchees"] = 0.0  # un seul juge : aucun désaccord entre juges ne déclenche plus d'humain (le protocole n'écrit pas ce cas)
    h_annot = h["h_echantillon"] + h["h_declenchees"] + h["h_comparateurs"] + h["h_items_a"] + h["h_nouveaux_items"]
    return {"libelle": libelle, "reponses": reponses, "api_usd": inter + api_juges, "api_inter_usd": inter, "api_juges_usd": api_juges, "h_annot": h_annot, "h_auteur": h["h_auteur"]}


def main() -> None:
    q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS)
    tous = {"sans_web", "web"}
    cs = couples(tous)
    reponses = q * P.FORMULATIONS * P.ECHANTILLONS * len(cs)
    reponses_web = q * P.FORMULATIONS * P.ECHANTILLONS * sum(1 for _, m, *_ in cs if m == "web")
    n_items = items_total()
    n_q = questions_engendrees()
    print(f"C2. Périmètre : {P.OUTILS_RETENUS} outils, {len(cs)} couples ({reponses_web // (q * 6)} web), {P.CANDIDATS} candidats, {n_items} items "
          f"({P.CANDIDATS}×{P.ITEMS_P_CIBLE} P + {P.ITEMS_A} A + {P.CANDIDATS * P.ITEMS_F_PAR_CANDIDAT[1]} F + {P.ITEMS_O} O), {n_q} questions engendrées, "
          f"{q} questions tirées au quota 1, {reponses:,} réponses par run ({reponses_web:,} en mode web). Taux : {P.TAUX_CHANGE_SOURCE}.")

    print("\nC2.1 Couches « une fois » (avant le premier run)")
    print("  | couche | € API (bas) | € API (haut) | h annotateurs (bas) | h annot. (haut) | h auteur (bas) | h auteur (haut) | source des hypothèses |")
    print("  |---|---|---|---|---|---|---|---|")
    ex_b, ex_h = couche_extraction(False), couche_extraction(True)
    print(f"  | extraction double (Sonnet 5.5 + Mistral Large, {P.CANDIDATS} corpus, réextraction {int(100 * P.PART_SOURCES_REEXTRAITES)} %) | {eur(ex_b):,.0f} | {eur(ex_h):,.0f} | 0 | 0 | 0 | 0 | corpus {P.CARACTERES_CORPUS_T1_PAR_CANDIDAT} car., {SOURCES_PAR_CANDIDAT} sources/candidat (paramètres) |")
    hv_b = n_items * P.ANNOTATEURS * P.MIN_PAR_ITEM_VALIDATION[0] / 60
    hv_h = n_items * P.ANNOTATEURS * P.MIN_PAR_ITEM_VALIDATION[1] / 60
    ha_b = n_items * P.TAUX_DESACCORD_VALIDATION[0] * P.MIN_PAR_ARBITRAGE_AUTEUR[0] / 60
    ha_h = n_items * P.TAUX_DESACCORD_VALIDATION[1] * P.MIN_PAR_ARBITRAGE_AUTEUR[1] / 60
    print(f"  | double validation humaine de {n_items} items (+ arbitrages de l'auteur) | 0 | 0 | {hv_b:.0f} | {hv_h:.0f} | {ha_b:.1f} | {ha_h:.1f} | {P.MIN_PAR_ITEM_VALIDATION} min/item/annotateur ; désaccords {P.TAUX_DESACCORD_VALIDATION} ; {P.MIN_PAR_ARBITRAGE_AUTEUR} min/arbitrage |")
    mes_b = P.CANDIDATS * P.ITEMS_P_CIBLE * P.MESURES_PAR_ITEM_P[0] * P.MIN_PAR_RELECTURE_MESURE_AUTEUR[0] / 60
    mes_h = P.CANDIDATS * P.ITEMS_P_CIBLE * P.MESURES_PAR_ITEM_P[1] * P.MIN_PAR_RELECTURE_MESURE_AUTEUR[1] / 60
    print(f"  | relecture des mesures par l'auteur (§4) | 0 | 0 | 0 | 0 | {mes_b:.1f} | {mes_h:.1f} | {P.MESURES_PAR_ITEM_P} mesure/item P, {P.MIN_PAR_RELECTURE_MESURE_AUTEUR} min/mesure |")
    ref_api = couche_reformulation_api(n_q)
    print(f"  | reformulations (API Mistral Large, {n_q} questions × 2 formulations) | {eur(ref_api):,.0f} | {eur(ref_api):,.0f} | 0 | 0 | 0 | 0 | prompt {P.caracteres_prompt('reformulation-1.0.1.md'):,} car. |")
    rl_b = n_q * P.MIN_PAR_RELECTURE_FORMULATION[0] / 60
    rl_h = n_q * P.MIN_PAR_RELECTURE_FORMULATION[1] / 60
    print(f"  | relecture humaine des formulations ({n_q} questions, 3 formulations ensemble, 1 annotateur) | 0 | 0 | {rl_b:.0f} | {rl_h:.0f} | 0 | 0 | {P.MIN_PAR_RELECTURE_FORMULATION} min/question |")
    jo_b = P.REPONSES_JEU_OR * (2 + P.TAUX_DESACCORD_HUMAINS) * P.MIN_PAR_NOTATION_REPONSE[0] / 60
    jo_h = P.REPONSES_JEU_OR * (2 + P.TAUX_DESACCORD_HUMAINS) * P.MIN_PAR_NOTATION_REPONSE[1] / 60
    print(f"  | jeu d'or du pilote ({P.REPONSES_JEU_OR} réponses × 2 humains + 3e sur {int(100 * P.TAUX_DESACCORD_HUMAINS)} %) | 0 | 0 | {jo_b:.0f} | {jo_h:.0f} | 0 | 0 | {P.MIN_PAR_NOTATION_REPONSE} min/notation |")

    print("\nC2.2 Interrogation par run, par couple outil × mode (USD → €), 3 formulations × 2 échantillons × quota 1")
    print("  | outil | mode | modèle gratuit | € par run | modèle payant | € par run |")
    print("  |---|---|---|---|---|---|")
    tot_g, lg = tableau_interrogation(q, P.FORMULATIONS, P.ECHANTILLONS, tous, payant=False)
    tot_p, lp = tableau_interrogation(q, P.FORMULATIONS, P.ECHANTILLONS, tous, payant=True)
    for (o, m, mg, cg), (_, _, mp, cp) in zip(lg, lp):
        print(f"  | {o} | {m} | {mg} | {eur(cg):,.0f} | {mp} | {eur(cp):,.0f} |")
    print(f"  | **total** | | | **{eur(tot_g):,.0f}** | | **{eur(tot_p):,.0f}** |")
    print("  Le Chat (Medium 3.5) et sa recherche web sont au milieu de leur fourchette de PARAMÈTRE (tarifs non affichés).")

    print("\nC2.3 Juges par run (USD → €) : Sonnet 5.5 (tokeniseur +30 %) et Mistral Large ; contrefactuel = 2 × 200 renotations par juge")
    print("  | tarification | juge Sonnet 5.5 | dont contrefactuel | juge Mistral Large | dont contrefactuel | total juges |")
    print("  |---|---|---|---|---|---|")
    for lot, cache, lib in ((False, False, "standard"), (True, False, "lot (-50 %)"), (True, True, "lot + cache du prompt (0,05×)")):
        j = cout_juges(q, P.FORMULATIONS, P.ECHANTILLONS, tous, lot, cache)
        total = j["sonnet-5.5"] + j["sonnet-5.5_contrefactuel"] + j["mistral-large"] + j["mistral-large_contrefactuel"]
        print(f"  | {lib} | {eur(j['sonnet-5.5']):,.0f} | {eur(j['sonnet-5.5_contrefactuel']):,.0f} | {eur(j['mistral-large']):,.0f} | {eur(j['mistral-large_contrefactuel']):,.0f} | {eur(total):,.0f} |")
    print(f"  Jetons d'entrée par réponse : Sonnet web {jetons_entree_juge(True, True):,.0f}, sans web {jetons_entree_juge(False, True):,.0f} ; Mistral web {jetons_entree_juge(True, False):,.0f}, sans web {jetons_entree_juge(False, False):,.0f} (prompt juge {P.caracteres_prompt('judge-1.0.0.md'):,} caractères).")

    print("\nC2.4 Couches humaines par run (heures), puis par mois au rythme hebdomadaire (× 52/12)")
    print("  | couche | h/run (bas) | h/run (haut) | h/mois (bas) | h/mois (haut) | hypothèses |")
    print("  |---|---|---|---|---|---|")
    hb = heures_humaines_par_run(reponses, reponses_web, False)
    hh = heures_humaines_par_run(reponses, reponses_web, True)
    m = P.RUNS_PAR_MOIS_HEBDO
    print(f"  | échantillon 10 % ({hb['echantillon_reponses']:,} réponses × 2 humains + 3e humain sur 20 %) | {hb['h_echantillon']:.0f} | {hh['h_echantillon']:.0f} | {hb['h_echantillon'] * m:.0f} | {hh['h_echantillon'] * m:.0f} | {P.MIN_PAR_NOTATION_REPONSE} min/notation |")
    print(f"  | désaccords des juges, accords partiels, erreurs graves ({100 * hb['part_declenchee']:.0f} à {100 * hh['part_declenchee']:.0f} % des réponses, 1 humain) | {hb['h_declenchees']:.0f} | {hh['h_declenchees']:.0f} | {hb['h_declenchees'] * m:.0f} | {hh['h_declenchees'] * m:.0f} | taux de faisabilite.py |")
    print(f"  | lectures des comparateurs ({P.CANDIDATS * P.ITEMS_P_CIBLE * P.COMPARATEURS} lectures, 2 humains + 3e, reprise {P.PART_LECTURES_COMPARATEUR_REPRISES}) | {hb['h_comparateurs']:.1f} | {hh['h_comparateurs']:.1f} | {hb['h_comparateurs'] * m:.0f} | {hh['h_comparateurs'] * m:.0f} | {P.MIN_PAR_LECTURE_COMPARATEUR} min/lecture |")
    print(f"  | revérification des items A | {hb['h_items_a']:.1f} | {hh['h_items_a']:.1f} | {hb['h_items_a'] * m:.1f} | {hh['h_items_a'] * m:.1f} | {P.ITEMS_A} items, {P.PART_RUNS_AVEC_NOUVELLE_SOURCE_T1} avec source neuve |")
    print(f"  | items nouveaux ou revalidés ({PART_ITEMS_NOUVEAUX_PAR_RUN} des items) + relecture de leurs formulations | {hb['h_nouveaux_items']:.1f} | {hh['h_nouveaux_items']:.1f} | {hb['h_nouveaux_items'] * m:.0f} | {hh['h_nouveaux_items'] * m:.0f} | paramètre |")
    print(f"  | auteur : audit, arbitrages, note éditoriale (cible §12) | {hb['h_auteur']:.0f} | {hh['h_auteur']:.0f} | {hb['h_auteur'] * m:.0f} | {hh['h_auteur'] * m:.0f} | §12 ligne 425 |")
    tb = hb["h_echantillon"] + hb["h_declenchees"] + hb["h_comparateurs"] + hb["h_items_a"] + hb["h_nouveaux_items"]
    th = hh["h_echantillon"] + hh["h_declenchees"] + hh["h_comparateurs"] + hh["h_items_a"] + hh["h_nouveaux_items"]
    print(f"  | **total annotateurs** | **{tb:.0f}** | **{th:.0f}** | **{tb * m:.0f}** | **{th * m:.0f}** | capacité posée : {P.ANNOTATEURS} × {P.HEURES_ANNOTATEUR_PAR_SEMAINE} h/sem = {P.ANNOTATEURS * P.HEURES_ANNOTATEUR_PAR_SEMAINE[0]} à {P.ANNOTATEURS * P.HEURES_ANNOTATEUR_PAR_SEMAINE[1]} h/sem |")

    print("\nC2.5 Total API par run et par mois (hebdomadaire), contre la cible §12 de 600 €/mois")
    j_std = cout_juges(q, P.FORMULATIONS, P.ECHANTILLONS, tous, False, False)
    j_lot = cout_juges(q, P.FORMULATIONS, P.ECHANTILLONS, tous, True, True)
    for lib, inter, j in (("outils gratuits, juges standard", tot_g, j_std), ("outils payants, juges standard", tot_p, j_std), ("outils gratuits, juges en lot + cache", tot_g, j_lot)):
        juges = sum(j.values())
        print(f"  {lib} : {eur(inter):,.0f} € interrogation + {eur(juges):,.0f} € juges = {eur(inter + juges):,.0f} €/run ; {eur(inter + juges) * m:,.0f} €/mois ; ×{eur(inter + juges) * m / P.COUT_API_MENSUEL_CIBLE_EUR:.1f} la cible")

    print("\nC2.6 Couches optionnelles : ce que chacune coûte, par run et par mois, et ce que la même dépense achèterait")
    base_b = scenario("complet", P.FORMULATIONS, P.ECHANTILLONS, tous, False)
    base_h = scenario("complet", P.FORMULATIONS, P.ECHANTILLONS, tous, True)
    variantes = [
        ("3 formulations → 1", scenario("1 F", 1, P.ECHANTILLONS, tous, False), scenario("1 F", 1, P.ECHANTILLONS, tous, True)),
        ("2 échantillons → 1 (levier §12)", scenario("1 E", P.FORMULATIONS, 1, tous, False), scenario("1 E", P.FORMULATIONS, 1, tous, True)),
        ("2 modes → sans web seul", scenario("sans web", P.FORMULATIONS, P.ECHANTILLONS, {"sans_web"}, False), scenario("sans web", P.FORMULATIONS, P.ECHANTILLONS, {"sans_web"}, True)),
        ("2 juges → 1 juge (Sonnet) + humain", scenario("1 juge", P.FORMULATIONS, P.ECHANTILLONS, tous, False, juges=("sonnet-5.5",)), scenario("1 juge", P.FORMULATIONS, P.ECHANTILLONS, tous, True, juges=("sonnet-5.5",))),
        ("échantillon humain 10 % → 5 %", scenario("5 %", P.FORMULATIONS, P.ECHANTILLONS, tous, False, part_echantillon=0.05), scenario("5 %", P.FORMULATIONS, P.ECHANTILLONS, tous, True, part_echantillon=0.05)),
    ]
    # équivalences
    outil_sup = outil_de_plus()
    print("  | couche retirée | € API évités/run (bas–haut) | €/mois | h annot. évitées/run (bas–haut) | h/mois | = outils de plus (€) | = questions du canal application par mois (h, à 3–6 min, 7 assistants, 2 testeurs) | = runs de plus (€ API) |")
    print("  |---|---|---|---|---|---|---|---|")
    for lib, vb, vh in variantes:
        d_eur = (eur(base_b["api_usd"] - vb["api_usd"]), eur(base_h["api_usd"] - vh["api_usd"]))
        d_h = (base_b["h_annot"] - vb["h_annot"], base_h["h_annot"] - vh["h_annot"])
        outils = (d_eur[0] / eur(outil_sup["api_usd"]), d_eur[1] / eur(outil_sup["api_usd"]))
        # heures évitées par mois converties en saisies d'application : N questions × 7 assistants × 2 testeurs × t
        h_mois = (d_h[0] * m, d_h[1] * m)
        q_app = (h_mois[0] * 60 / (P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[1]), h_mois[1] * 60 / (P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[0]))
        runs = (d_eur[0] / eur(base_b["api_usd"]), d_eur[1] / eur(base_h["api_usd"]))
        print(f"  | {lib} | {d_eur[0]:,.0f}–{d_eur[1]:,.0f} | {d_eur[0] * m:,.0f}–{d_eur[1] * m:,.0f} | {d_h[0]:.0f}–{d_h[1]:.0f} | {h_mois[0]:.0f}–{h_mois[1]:.0f} | {outils[0]:.1f}–{outils[1]:.1f} | {q_app[0]:,.0f}–{q_app[1]:,.0f} questions/mois | {runs[0]:.2f}–{runs[1]:.2f} |")
    h_humain_second_juge = (reponses * P.MIN_PAR_NOTATION_REPONSE[0] / 60, reponses * P.MIN_PAR_NOTATION_REPONSE[1] / 60)
    print(f"  Ligne « 2 juges → 1 juge + humain », autre lecture : si un humain remplace le second juge sur chaque réponse obtenue ({reponses:,} notations à "
          f"{P.MIN_PAR_NOTATION_REPONSE} min), la couche humaine AUGMENTE de {h_humain_second_juge[0]:,.0f} à {h_humain_second_juge[1]:,.0f} h par run "
          f"({h_humain_second_juge[0] * m:,.0f} à {h_humain_second_juge[1] * m:,.0f} h par mois) pour 176 €/run d'API évités.")
    print(f"  Un outil de plus (2 modes, tarif grok-4.7 + recherche 5 $/1k, jugé par les deux juges) coûte {eur(outil_sup['api_usd']):,.0f} €/run d'API et "
          f"{outil_sup['h_bas']:.0f} à {outil_sup['h_haut']:.0f} h d'annotateurs par run (échantillon + déclenchements). "
          f"Un run complet coûte {eur(base_b['api_usd']):,.0f} à {eur(base_h['api_usd']):,.0f} € d'API et {base_b['h_annot']:.0f} à {base_h['h_annot']:.0f} h d'annotateurs.")
    print(f"  Le canal application actuel (60 questions × {P.OUTILS_RETENUS} assistants × {P.TESTEURS} testeurs) vaut {60 * P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[0] / 60:.0f} à "
          f"{60 * P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[1] / 60:.0f} h/mois, soit {60 * P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[0] / 60 * P.TAUX_HORAIRE_TESTEUR_EUR[0]:,.0f} à "
          f"{60 * P.OUTILS_RETENUS * P.TESTEURS * P.MIN_PAR_SAISIE_APPLICATION[1] / 60 * P.TAUX_HORAIRE_TESTEUR_EUR[1]:,.0f} €/mois à {P.TAUX_HORAIRE_TESTEUR_EUR} €/h (PARAMÈTRE).")


def outil_de_plus() -> dict[str, float]:
    """Coût marginal d'un assistant de plus, deux modes, tarif grok-4.7, jugé par les deux juges."""
    q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS)
    par_couple = q * P.FORMULATIONS * P.ECHANTILLONS
    pi, po = P.PRIX_USD_PAR_M["grok-4.7"]
    sans = par_couple * (P.ENTREE_OUTIL_JETONS * pi + P.SORTIE_OUTIL_JETONS * po) / 1e6
    web = par_couple * ((P.ENTREE_OUTIL_JETONS + P.JETONS_CONTENU_RECHERCHE) * pi / 1e6 + P.SORTIE_OUTIL_JETONS * po / 1e6 + P.RECHERCHES_PAR_REPONSE_WEB * 5.0 / 1000)
    juges = sum(par_couple * (cout_reponse_juge(j, True) + cout_reponse_juge(j, False)) for j in P.JUGES)
    reponses = 2 * par_couple
    hb = heures_humaines_par_run(reponses, par_couple, False)
    hh = heures_humaines_par_run(reponses, par_couple, True)
    return {"api_usd": sans + web + juges, "h_bas": hb["h_echantillon"] + hb["h_declenchees"], "h_haut": hh["h_echantillon"] + hh["h_declenchees"]}


if __name__ == "__main__":
    main()
