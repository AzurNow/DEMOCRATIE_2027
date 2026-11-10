"""C1 a-b-c : calendrier réaliste et nombre de runs avant le premier tour (hypothèse H6).

Usage : python3 scratch/fondations/2026-11-10/c1_calendrier.py   (depuis la racine du dépôt)

Hypothèses nommées en tête (sources : parametres.py, docs/feuille-de-route.json, docs/TACHES-AUTEUR.md, protocole
0.34). Le chemin critique est simulé par un ordonnanceur minimal : une ressource « auteur » (h/semaine, paramètre du
brief : 5, 10, 20), une ressource « annotateurs » (2 personnes × h/semaine, PARAMÈTRE), des délais incompressibles
(avocat, recrutement, fenêtre du mardi, notation) et des dépendances. Deux jeux d'hypothèses : bas (bornes basses
de chaque fourchette) et haut (bornes hautes). Rien ici n'est une recommandation : ce sont des dates calculées.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

import parametres as P

# ----------------------------------------------------------------------------- hypothèses propres à ce calcul
# Délais incompressibles (PARAMÈTRES, en jours calendaires)
DELAI_AVOCAT = (14, 42)  # relecture par un avocat (§10 ligne 371 ; TACHES-AUTEUR ligne 277) : 2 à 6 semaines
DELAI_RECRUTEMENT = (14, 28)  # recrutement de deux annotateurs + un 3e humain d'arbitrage (TACHES-AUTEUR ligne 839)
DELAI_AGENTS_ADAPTATEURS = (7, 14)  # adaptateurs d'interrogation réels, 7 éditeurs (lot interrogation, « reste pour T4 »)
DELAI_AGENTS_SITE = (7, 21)  # lot site T0 : « Le site généré depuis runs/ reste à écrire » ; règle 8 : publication intégrale
DELAI_AGENTS_0_35 = (3, 7)  # code de D85, D94, D95 après la 0.35 (HANDOFF, prochaines tâches 1)
DELAI_WAYBACK_ET_ZENODO = (1, 2)  # capture Wayback avant le gel (D46), dépôt Zenodo
DELAI_JUGES_ET_LIENS = (1, 3)  # test des liens puis deux juges, après la fermeture de la fenêtre (§7 ligne 264)
DELAI_ANALYSE_ET_PUBLICATION = (1, 2)  # analyse, checklist annexe F, note éditoriale, déploiement à la main

# Heures de l'auteur hors feuille de route (PARAMÈTRES ; les lots de la feuille portent déjà temps_auteur_h)
H_AUTEUR_0_35 = (2, 4)  # dix remplacements exacts + révisions (TACHES-AUTEUR, section 1, item 1 à 18) — compris dans le lot protocole (4 h) : on retient le lot
H_AUTEUR_DECISIONS = (2, 4)  # D81, D82, D83, D86, D91 et conformité n° 2 à 24 « amendement requis » (HANDOFF)
H_AUTEUR_CLES_ET_ERREURS = (2, 4)  # clés API de 7 éditeurs + corps d'erreur de modération authentiques (TACHES-AUTEUR lignes 505, 856)
H_AUTEUR_CONTROLE_MANUEL = (3, 6)  # docs/CONTROLE-MANUEL.md sur validate, relecture des formulations, notation humaine
H_AUTEUR_PILOTE = (4, 8)  # gel, suivi de la fenêtre, kappa du jeu d'or, coûts et charge mesurés (J4)
H_AUTEUR_RUN_PUBLIC = (4, 8)  # gel, checklist, note éditoriale, publication (§12 cible 3 h par run en régime établi)
H_AUTEUR_SOURCES = (2, 4)  # config/sources.toml, copie de référence hors Git, lecture des journaux d'extraction (TACHES-AUTEUR 811-818)
# Taille du lot de validation : 200 items (J3) puis ~400 (§5) ; le pilote exige-t-il les 400 ? Le §12 J5 exige
# « au moins 8 candidats au-dessus du seuil de couverture » (10 items P), soit au moins 80 items P vérifiés.
ITEMS_A_VALIDER = (200, 400)
PART_LOTS_REANNOTES = (0.0, 0.2)  # PARAMÈTRE : lots dont le kappa < 0,80 réannotés après calibration (§4 ligne 161)


@dataclass
class Tache:
    id: str
    libelle: str
    auteur_h: float = 0.0
    annot_h: float = 0.0
    delai_j: float = 0.0
    deps: list[str] = field(default_factory=list)
    mardi: bool = False  # la tâche commence le premier mardi ≥ date au plus tôt (fenêtre §6)
    debut: date | None = None
    fin: date | None = None


def choisir(f, haut: bool) -> float:
    a, b = P.fourchette(f)
    return b if haut else a


def questions_quota_1(items_p_par_candidat: int, candidats: int) -> int:
    """Questions tirées au quota 1 par strate peuplée (méthode de faisabilite.py)."""
    # au quota 1, chaque strate candidat × thème × gabarit peuplée donne une question : au plus 10 thèmes × 3 gabarits
    nommees_p = candidats * min(items_p_par_candidat, P.THEMES) * P.GABARITS_PAR_ITEM_P
    q_att = P.THEMES * P.QUOTA_ATTRIBUTION_PAR_THEME
    q_o = P.ITEMS_O
    reste = nommees_p + q_att + q_o
    a_f = math.ceil(P.PART_QUESTIONS_A_F_MIN / (1 - P.PART_QUESTIONS_A_F_MIN) * reste)
    return reste + a_f


def taches(haut: bool, items: int) -> list[Tache]:
    h = lambda f: choisir(f, haut)  # noqa: E731
    lots = P.heures_auteur_feuille()
    items_f = P.CANDIDATS * int(h(P.ITEMS_F_PAR_CANDIDAT))
    mesures = items * h(P.MESURES_PAR_ITEM_P)
    questions = questions_quota_1(P.ITEMS_P_CIBLE if items >= 360 else max(P.SEUIL_COUVERTURE, items // P.CANDIDATS), P.CANDIDATS)
    # questions engendrées (toutes, pas seulement tirées) à relire avec leurs trois formulations : ~ items × gabarits
    questions_engendrees = items * P.GABARITS_PAR_ITEM_P + items_f * 2 + P.ITEMS_A * 2
    reponses_pilote = questions * P.FORMULATIONS * P.ECHANTILLONS * P.COUPLES_OUTIL_MODE
    t = [
        Tache("p035", "Protocole 0.35 écrite par l'auteur (lot protocole)", auteur_h=lots["protocole"]),
        Tache("decisions", "Décisions en attente et écarts « amendement requis »", auteur_h=h(H_AUTEUR_DECISIONS), deps=["p035"]),
        Tache("agents035", "Code de D85, D94, D95 par les agents", delai_j=h(DELAI_AGENTS_0_35), deps=["p035"]),
        Tache("avocat", "Relecture par un avocat (délai)", delai_j=h(DELAI_AVOCAT), deps=["p035"]),
        Tache("perimetre", "config/perimetre.yaml : candidats, preuves archivées, outils, CGU, quotas (lot perimetre-prompts)", auteur_h=lots["perimetre-prompts"]),
        Tache("sources", "config/sources.toml, copie de référence, première collecte et extraction réelles", auteur_h=h(H_AUTEUR_SOURCES) + lots["collecte"] + lots["extraction"], deps=["perimetre"]),
        Tache("mesures", "Relecture des mesures par l'auteur (§4)", auteur_h=mesures * h(P.MIN_PAR_RELECTURE_MESURE_AUTEUR) / 60, deps=["sources"]),
        Tache("recrutement", "Recrutement de deux annotateurs et d'un troisième humain (délai)", delai_j=h(DELAI_RECRUTEMENT), auteur_h=lots["hors-code"] / 3),
        Tache("formation", f"Formation : {P.ITEMS_ENTRAINEMENT} items d'entraînement communs", annot_h=P.ITEMS_ENTRAINEMENT * P.ANNOTATEURS * h(P.MIN_PAR_ITEM_VALIDATION) / 60, auteur_h=lots["hors-code"] / 6, deps=["recrutement", "mesures", "controle"]),
        Tache("controle", "Dérouler docs/CONTROLE-MANUEL.md (validation, formulations, notation humaine)", auteur_h=h(H_AUTEUR_CONTROLE_MANUEL), deps=["sources"]),
        Tache("validation", f"Double validation de {items} items (+ réannotation de {int(100 * h(PART_LOTS_REANNOTES))} % des lots)", annot_h=items * P.ANNOTATEURS * h(P.MIN_PAR_ITEM_VALIDATION) / 60 * (1 + h(PART_LOTS_REANNOTES)), deps=["formation"]),
        Tache("arbitrages", "Arbitrages de validation par l'auteur", auteur_h=items * h(P.TAUX_DESACCORD_VALIDATION) * h(P.MIN_PAR_ARBITRAGE_AUTEUR) / 60 + lots["dette-validation"] + lots["contestation-notification"], deps=["validation"]),
        Tache("itemsF", f"Items F : rédaction par l'auteur ({items_f} items) et vérification par deux annotateurs", auteur_h=lots["creation-items-f"], annot_h=items_f * P.ANNOTATEURS * h(P.MIN_PAR_ITEM_VALIDATION) / 60, deps=["formation", "mesures"]),
        Tache("reformulation", f"Reformulations (API) et relecture de {questions_engendrees} questions par un annotateur", annot_h=questions_engendrees * h(P.MIN_PAR_RELECTURE_FORMULATION) / 60, auteur_h=lots["reformulation"], deps=["validation", "itemsF"]),
        Tache("adaptateurs", "Adaptateurs d'interrogation réels (agents) + clés et corps d'erreur (auteur)", delai_j=h(DELAI_AGENTS_ADAPTATEURS), auteur_h=lots["interrogation"] + h(H_AUTEUR_CLES_ET_ERREURS), deps=["perimetre"]),
        Tache("gel1", "Gel 1.0, Wayback, dépôt Zenodo, transmission aux institutions", auteur_h=lots["hors-code"] / 2, delai_j=h(DELAI_WAYBACK_ET_ZENODO), deps=["avocat", "decisions", "perimetre"]),
        Tache("pilote", f"Run pilote : fenêtre 48 h ({reponses_pilote:,} réponses), liens, juges, contrefactuel", delai_j=2 + h(DELAI_JUGES_ET_LIENS), auteur_h=h(H_AUTEUR_PILOTE) + lots["notation"] + lots["gel"] + lots["test-liens"], mardi=True, deps=["arbitrages", "reformulation", "adaptateurs", "agents035", "controle"]),
        Tache("jeu_or", f"Jeu d'or : {P.REPONSES_JEU_OR} réponses × 2 humains + 3e humain sur {int(100 * P.TAUX_DESACCORD_HUMAINS)} %", annot_h=P.REPONSES_JEU_OR * (P.ANNOTATEURS + P.TAUX_DESACCORD_HUMAINS) * h(P.MIN_PAR_NOTATION_REPONSE) / 60, auteur_h=lots["notation-humaine"], deps=["pilote"]),
        Tache("site", "Site de résultats généré depuis runs/ (agents ; lot site T0)", delai_j=h(DELAI_AGENTS_SITE), auteur_h=lots["site"] + lots["analyse"] + lots["go-no-go"], deps=["agents035"]),
        Tache("run1", f"Premier run public : fenêtre 48 h, liens, juges (quota 1 : {questions} questions, {reponses_pilote:,} réponses)", delai_j=2 + h(DELAI_JUGES_ET_LIENS), auteur_h=h(H_AUTEUR_RUN_PUBLIC), mardi=True, deps=["jeu_or", "gel1", "site"]),
        Tache("echantillon1", f"Échantillon humain 10 % du premier run ({math.ceil(0.1 * reponses_pilote):,} réponses × 2 + arbitrages), erreurs graves, lectures de comparateurs", annot_h=(math.ceil(0.1 * reponses_pilote) * (2 + P.TAUX_DESACCORD_HUMAINS) + reponses_pilote * h(P.TAUX_DESACCORD_JUGES)) * h(P.MIN_PAR_NOTATION_REPONSE) / 60 + P.CANDIDATS * P.ITEMS_P_CIBLE * P.COMPARATEURS * 2 * P.MIN_PAR_LECTURE_COMPARATEUR / 60, deps=["run1"]),
        Tache("publication1", "Analyse, checklist annexe F, note éditoriale, publication (à la main)", delai_j=h(DELAI_ANALYSE_ET_PUBLICATION), auteur_h=P.HEURES_AUTEUR_PAR_RUN_CIBLE, deps=["echantillon1"]),
    ]
    return t


def prochain_mardi(d: date) -> date:
    return d + timedelta(days=(1 - d.weekday()) % 7)


def ordonnancer(taches: list[Tache], auteur_h_sem: float, annot_h_sem: float, debut: date) -> dict[str, Tache]:
    """Passe avant par ordre topologique ; l'auteur et les annotateurs sont chacun une file (une chose à la fois)."""
    par_id = {t.id: t for t in taches}
    auteur_libre = debut
    annot_libre = debut
    faites: set[str] = set()
    while len(faites) < len(taches):
        prete = [t for t in taches if t.id not in faites and all(d in faites for d in t.deps)]
        assert prete, "cycle de dépendances"
        for t in prete:
            au_plus_tot = max([debut] + [par_id[d].fin for d in t.deps])
            t.debut = prochain_mardi(au_plus_tot) if t.mardi else au_plus_tot
            fin = t.debut + timedelta(days=t.delai_j)
            if t.auteur_h:
                d0 = max(t.debut, auteur_libre)
                d1 = d0 + timedelta(days=t.auteur_h / auteur_h_sem * 7)
                auteur_libre = d1
                fin = max(fin, d1)
            if t.annot_h:
                d0 = max(t.debut, annot_libre)
                d1 = d0 + timedelta(days=t.annot_h / annot_h_sem * 7)
                annot_libre = d1
                fin = max(fin, d1)
            t.fin = fin
            faites.add(t.id)
    return par_id


def runs_avant(premier_run: date, haut: bool) -> dict[str, object]:
    reguliers = P.runs_reguliers(premier_run)
    avant_t1 = [d for d in reguliers if d + timedelta(days=2) < P.VEILLES_ELECTORALES[0][0]]  # fenêtre fermée avant la veille
    avant_t2 = [d for d in reguliers if d + timedelta(days=2) < P.VEILLES_ELECTORALES[1][0]]
    # runs supplémentaires : liste officielle (si le projet publie déjà) + débats (paramètre)
    liste = P.LISTE_OFFICIELLE_AU_PLUS_TARD if haut else P.LISTE_OFFICIELLE_AU_PLUS_TOT
    supp = 0
    if premier_run <= liste:
        supp += 1
    debats = choisir(P.DEBATS_TELEVISES, haut)
    supp += debats if premier_run <= P.PREMIER_TOUR else 0
    return {
        "reguliers_avant_t1": len(avant_t1),
        "reguliers_avant_t2": len(avant_t2),
        "supplementaires": supp,
        "dernier_regulier_avant_t1": avant_t1[-1] if avant_t1 else None,
        "premier_hebdo": next((d for d in reguliers if d >= P.DEBUT_HEBDO), None),
    }


def main() -> None:
    print("C1a. Dates vérifiées le 2026-11-10 (sources dans parametres.py)")
    print(f"  premier tour {P.PREMIER_TOUR}, second tour {P.SECOND_TOUR}, décret ≤ {P.DECRET_CONVOCATION_AU_PLUS_TARD}, "
          f"clôture des parrainages {P.FIN_PARRAINAGES} 18 h, liste officielle entre {P.LISTE_OFFICIELLE_AU_PLUS_TOT} (paramètre) "
          f"et {P.LISTE_OFFICIELLE_AU_PLUS_TARD} (officiel), campagne officielle {P.CAMPAGNE_OFFICIELLE}")
    print(f"  jours entre aujourd'hui et le premier tour : {(P.PREMIER_TOUR - P.DATE_DU_JOUR).days} ; "
          f"semaines : {(P.PREMIER_TOUR - P.DATE_DU_JOUR).days / 7:.1f}")
    cal = P.runs_reguliers(date(2026, 12, 1))
    avant_t1 = [d for d in cal if d + timedelta(days=2) < P.VEILLES_ELECTORALES[0][0]]
    print(f"  calendrier §6 complet depuis le 1er déc. : {len(cal)} runs réguliers (mensuels : "
          f"{[str(d) for d in cal if d < P.DEBUT_HEBDO]} ; hebdomadaires : {len([d for d in cal if d >= P.DEBUT_HEBDO])}, "
          f"du {min(d for d in cal if d >= P.DEBUT_HEBDO)} au {max(cal)}) ; {len(avant_t1)} dont la fenêtre ferme avant la veille du premier tour")
    print(f"  fenêtre du mardi {P.VEILLES_ELECTORALES[0][0] - timedelta(days=4)} : fermeture jeudi 6 h, publication possible jusqu'au "
          f"{P.VEILLES_ELECTORALES[0][0] - timedelta(days=1)} 24 h (veille électorale §10 dès le {P.VEILLES_ELECTORALES[0][0]} 0 h)")

    print("\nC1b. Chemin critique : heures auteur de la feuille de route (lots non T4, hors J6)")
    lots = P.heures_auteur_feuille()
    for k, v in sorted(lots.items(), key=lambda kv: -kv[1]):
        print(f"  {k:32s} {v:5.2f} h")
    print(f"  total feuille de route : {sum(lots.values()):.2f} h")

    print("\nC1c. Dates simulées (ordonnanceur ; jeu bas = bornes basses, jeu haut = bornes hautes)")
    entete = ("auteur h/sem", "annot h/sem", "items", "jeu", "h auteur", "h annot", "pilote (mardi)", "1er run public (mardi)",
              "publication", "runs rég. avant T1", "avant T2", "supp.", "runs pour H5", "runs pour un éditeur")
    print("  | " + " | ".join(entete) + " |")
    print("  |" + "---|" * len(entete))
    for auteur_h in (5, 10, 20):
        for annot_par_personne in P.HEURES_ANNOTATEUR_PAR_SEMAINE:
            annot_h = P.ANNOTATEURS * annot_par_personne
            for haut, items in ((False, ITEMS_A_VALIDER[0]), (True, ITEMS_A_VALIDER[1])):
                t = taches(haut, items)
                res = ordonnancer(t, auteur_h, annot_h, P.DATE_DU_JOUR)
                run1 = res["run1"].debut
                r = runs_avant(run1, haut)
                total_auteur = sum(x.auteur_h for x in t)
                total_annot = sum(x.annot_h for x in t)
                n_runs = r["reguliers_avant_t2"] + r["supplementaires"]
                print(f"  | {auteur_h} | {annot_h} | {items} | {'haut' if haut else 'bas'} | {total_auteur:.0f} | {total_annot:.0f} | "
                      f"{res['pilote'].debut} | {run1} | {res['publication1'].fin} | {r['reguliers_avant_t1']} | {r['reguliers_avant_t2']} | "
                      f"{r['supplementaires']} | {n_runs} ({'H5 possible' if n_runs >= 2 else 'H5 sans objet'}) | {max(0, n_runs - 1)} |")
    print("\n  Lecture : « runs pour H5 » = runs publiés (premier et dernier doivent exister : au moins 2) ; « runs pour un éditeur » = "
          "runs qui suivent la première publication, donc occasions de mesurer une correction.")

    print("\nC1c bis. Détail des tâches, scénario auteur 10 h/sem, annotateurs 16 h/sem, jeu haut (400 items)")
    t = taches(True, 400)
    res = ordonnancer(t, 10, 16, P.DATE_DU_JOUR)
    for x in t:
        print(f"  {x.id:14s} {x.debut} → {x.fin}  auteur {x.auteur_h:5.1f} h  annot {x.annot_h:6.1f} h  délai {x.delai_j:4.0f} j  : {x.libelle}")

    print("\nC1c ter. Borne de capacité : heures d'annotateurs par run hebdomadaire au périmètre complet (sans le levier 2 -> 1)")
    q = questions_quota_1(P.ITEMS_P_CIBLE, P.CANDIDATS)
    reponses = q * P.FORMULATIONS * P.ECHANTILLONS * P.COUPLES_OUTIL_MODE
    for haut in (False, True):
        hmin = choisir(P.MIN_PAR_NOTATION_REPONSE, haut)
        ech = math.ceil(P.PART_ECHANTILLON_HUMAIN * reponses)
        declench = reponses * (choisir(P.TAUX_DESACCORD_JUGES, haut) + choisir(P.TAUX_ACCORD_PARTIEL, haut))
        heures = (ech * (2 + P.TAUX_DESACCORD_HUMAINS) + declench) * hmin / 60
        comp = P.CANDIDATS * P.ITEMS_P_CIBLE * P.COMPARATEURS * 2 * P.MIN_PAR_LECTURE_COMPARATEUR / 60
        for annot_par_personne in P.HEURES_ANNOTATEUR_PAR_SEMAINE:
            cap = P.ANNOTATEURS * annot_par_personne
            print(f"  jeu {'haut' if haut else 'bas'} : {reponses:,} réponses, échantillon {ech:,} ; notation humaine {heures:.0f} h + comparateurs {comp:.0f} h "
                  f"par run ; capacité {cap} h/sem ⇒ {cap / (heures + comp):.2f} run publiable par semaine")


if __name__ == "__main__":
    main()
