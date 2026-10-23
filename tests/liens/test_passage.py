"""Le passage de bout en bout : tentatives, verdict lu dans la table, copie conservée, écriture unique.

Cas limites 1, 2, 5, 6, 7, 8, 9, 12, 13, 16 et 17 de la décision D20 ; 1, 2, 3, 5 à 9 de D21 (tests
`test_d21_*`) ; 1, 2, 3 et 5 de D22 (tests `test_d22_*`). La sonde réelle parle à `TransportFactice`, y compris pour télécharger la version
brute d'un instantané ; l'archiveur et le chercheur d'instantanés sont des doubles
(`doubles_liens.py`).
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import ConnexionRefusee, DelaiDepasse, ErreurReseau, NomIntrouvable
from pipeline.liens.entree import EntreeRefusee, liens_cites, lire_run
from pipeline.liens.instantanes import (
    ChercheurInstantanes,
    InstantaneAbsent,
    InstantaneEcarte,
    InstantaneTrouve,
    RechercheEchouee,
)
from pipeline.liens.passage import code_de_sortie, formater_bilan, passer
from pipeline.liens.sortie import nom_resultat
from pipeline.liens.table import CHEMIN_TABLE
from tests.collecte.doubles import Route, reponse
from tests.liens.doubles_liens import (
    ArchiveurFactice,
    Banc,
    ChercheurFactice,
    banc,
    ecrire_manquante,
    ecrire_reponse,
    ecrire_run,
    reussite,
)

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n")
A = "https://example.org/a"
PARIS = timezone(timedelta(hours=2))
REFERENCE = datetime(2026, 9, 21, 10, 0, 0, tzinfo=PARIS)
ROBOTS_WAYBACK = "https://web.archive.org/robots.txt"
INSTANTANE_A = f"http://web.archive.org/web/20260920101010/{A}"
BRUTE_A = f"https://web.archive.org/web/20260920101010id_/{A}"
TROUVE_A = InstantaneTrouve(INSTANTANE_A, "20260920101010", BRUTE_A)
SERVI_A = f"https://web.archive.org/web/20260920101010/{A}"
"""D22 : l'instantané servi, forme publique (sans `id_`) de l'URL finale du téléchargement."""


def _passer(b: Banc, tmp_path: Path, *urls: str) -> tuple[list, Path]:
    repertoire = tmp_path / "liens"
    bilans = passer({url: REFERENCE for url in urls}, repertoire, b.deps)
    return bilans, repertoire


def _resultat(repertoire: Path, url: str) -> dict:
    return json.loads((repertoire / nom_resultat(url)).read_text(encoding="utf-8"))


# ------------------------------------------------------------------------------ existe


def test_cas_1_200_direct_existe_corps_stocke_sha256_exact_save_page_now(tmp_path: Path) -> None:
    corps = b"\xef\xbb\xbf<html>Programme\r\n</html>"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, corps, content_type="text/html; charset=utf-8")},
             archiveur=ArchiveurFactice(reussite(A)))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    sha256 = hashlib.sha256(corps).hexdigest()
    assert resultat["verdict_existence"] == "existe"
    assert resultat["sha256_contenu"] == sha256
    assert resultat["code_http"] == 200
    assert resultat["url_finale"] == A
    assert resultat["page"] == {"chemin": f"pages/{sha256}.html", "type_contenu_recu": "text/html; charset=utf-8", "taille_octets": len(corps)}
    assert (repertoire / "pages" / f"{sha256}.html").read_bytes() == corps
    assert b.archiveur.urls == [A]
    assert resultat["archive_url"] == reussite(A).archive_url
    assert resultat["wayback"] == {"operation": "wayback_save_page_now", "issue": "reussi", "archive_url": reussite(A).archive_url}
    assert b.chercheur.demandes == []
    assert [x.etat for x in bilans] == ["teste"]


def test_cas_1_save_page_now_en_echec_pas_d_archive_url(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, b"x")})

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert "archive_url" not in resultat
    assert resultat["wayback"] == {"operation": "wayback_save_page_now", "issue": "echec", "motif": "HTTP 503 sans instantané daté", "tentatives": 3}
    assert resultat["page"]["type_contenu_recu"] is None
    assert resultat["page"]["chemin"].endswith(".bin")
    assert bilans[0].echec_wayback is not None
    assert code_de_sortie(bilans) == 0


def test_cas_2_soft_404_servie_en_200_existe(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(200, "<h1>Page introuvable</h1>".encode(), content_type="text/html")})
    _bilans, repertoire = _passer(b, tmp_path, A)
    assert _resultat(repertoire, A)["verdict_existence"] == "existe"


def test_cas_3_redirections_suivies_url_finale_derniere_cible(tmp_path: Path) -> None:
    b2, c = "https://example.org/b", "https://example.org/c"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(301, location=b2), b2: reponse(302, location=c), c: reponse(200, b"ok")})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["url_finale"], resultat["code_http"]) == ("existe", c, 200)
    assert b.archiveur.urls == [A]


def test_cas_4_six_redirections_et_boucle_non_testables(tmp_path: Path) -> None:
    routes: dict[str, Route] = {ROBOTS: ROBOTS_OUVERT}
    etapes = [f"https://example.org/{n}" for n in range(7)]
    for source, cible in zip(etapes, etapes[1:], strict=False):
        routes[source] = reponse(302, location=cible)
    boucle_a, boucle_b = "https://example.org/x", "https://example.org/y"
    routes[boucle_a] = reponse(301, location=boucle_b)
    routes[boucle_b] = reponse(301, location=boucle_a)
    b = banc(routes)

    _bilans, repertoire = _passer(b, tmp_path, etapes[0], boucle_a)

    assert _resultat(repertoire, etapes[0])["verdict_existence"] == "non_testable"
    assert _resultat(repertoire, etapes[0])["tentatives"][0]["issue"] == "redirections_excessives"
    assert _resultat(repertoire, boucle_a)["verdict_existence"] == "non_testable"
    assert _resultat(repertoire, boucle_a)["tentatives"][0]["issue"] == "boucle_redirection"


# ------------------------------------------------------------------------------ mort


@pytest.mark.parametrize("code", [404, 410])
def test_cas_5_404_et_410_morts_apres_une_seule_tentative(tmp_path: Path, code: int) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(code)]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "mort"
    assert resultat["code_http"] == code
    assert len(resultat["tentatives"]) == 1
    assert b.horloge.sommeils == [1.0]  # la cadence entre robots.txt et l'URL ; aucune attente de 60 s
    assert resultat["wayback"] == {"operation": "aucune"}
    assert "archive_url" not in resultat and "sha256_contenu" not in resultat
    assert b.archiveur.urls == [] and b.chercheur.demandes == []


def test_cas_5_echec_dns_mort(tmp_path: Path) -> None:
    url = "https://inexistant.example/page"
    b = banc({"https://inexistant.example/robots.txt": NomIntrouvable("nodename nor servname provided")})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("mort", None)
    assert resultat["tentatives"][0]["issue"] == "domaine_inexistant"
    assert len(resultat["tentatives"]) == 1


# ------------------------------------------------------------------------------ transitoires


def test_cas_6_503_503_200_existe_a_la_troisieme_tentative(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(503), reponse(503), reponse(200, b"enfin")]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert b.horloge.sommeils == [1.0, 60.0, 60.0]  # cadence robots.txt → URL, puis deux espacements
    horodatages = [t["horodatage"] for t in resultat["tentatives"]]
    assert horodatages == ["2026-09-22T14:30:05+02:00", "2026-09-22T14:31:06+02:00", "2026-09-22T14:32:06+02:00"]
    assert resultat["date_test"] == horodatages[2]
    assert [(t["numero"], t["issue"], t["code_http"]) for t in resultat["tentatives"]] == [
        (1, "reponse_http", 503), (2, "reponse_http", 503), (3, "reponse_http", 200)]


def test_cas_7_503_trois_fois_inaccessible_instantane_cherche(tmp_path: Path) -> None:
    archive = b"<html>copie archivee</html>"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(503), reponse(503), reponse(503)], ROBOTS_WAYBACK: ROBOTS_OUVERT,
              BRUTE_A: reponse(200, archive, content_type="text/html")}, chercheur=ChercheurFactice(TROUVE_A))

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("inaccessible", 503)
    assert len(resultat["tentatives"]) == 3
    assert b.chercheur.demandes == [(A, REFERENCE)]
    assert b.archiveur.urls == []
    assert resultat["archive_url"] == SERVI_A
    assert resultat["sha256_contenu"] == hashlib.sha256(archive).hexdigest()


def test_cas_8_delai_depasse_trois_fois_inaccessible_sans_code(tmp_path: Path) -> None:
    delai = DelaiDepasse("délai dépassé (30 s)")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [delai, delai, delai]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("inaccessible", None)
    assert "url_finale" not in resultat
    assert [t["issue"] for t in resultat["tentatives"]] == ["delai_depasse"] * 3
    assert resultat["tentatives"][0]["motif"] == "délai dépassé (30 s)"


def test_connexion_refusee_puis_200_existe(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [ConnexionRefusee("refusée"), reponse(200, b"ok")]})
    _bilans, repertoire = _passer(b, tmp_path, A)
    assert _resultat(repertoire, A)["verdict_existence"] == "existe"
    assert b.horloge.sommeils == [1.0, 60.0]


@pytest.mark.parametrize(("routes", "tentatives"), [
    ([reponse(403)], 1), ([reponse(401)], 1), ([reponse(429)] * 3, 3), ([reponse(451)], 1), ([reponse(400)], 1)])
def test_cas_9_4xx_inaccessibles(tmp_path: Path, routes: list, tentatives: int) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: list(routes)})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert len(resultat["tentatives"]) == tentatives


# ------------------------------------------------------------------------------ non testable


def test_cas_10_robots_interdit_non_testable_sans_requete_vers_l_url(tmp_path: Path) -> None:
    url = "https://example.org/prive/x"
    b = banc({ROBOTS: reponse(200, b"User-agent: *\nDisallow: /prive/\n")})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("non_testable", None)
    assert b.transport.urls() == [ROBOTS]
    assert b.chercheur.demandes == [(url, REFERENCE)]


def test_cas_10_robots_injoignable_inaccessible(tmp_path: Path) -> None:
    """D21 : robots.txt injoignable est transitoire ; relu à chaque tentative, puis inaccessible."""
    b = banc({ROBOTS: reponse(503)})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert [t["issue"] for t in resultat["tentatives"]] == ["robots_injoignable"] * 3
    assert b.transport.urls() == [ROBOTS] * 3


@pytest.mark.parametrize("url", ["ftp://example.org/f.pdf", "javascript:alert(1)", "pas une url"])
def test_cas_11_schema_non_http_ou_chaine_non_url_non_testable_sans_requete(tmp_path: Path, url: str) -> None:
    b = banc({})

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert resultat["verdict_existence"] == "non_testable"
    assert "url_finale" not in resultat
    assert b.transport.urls() == []


def test_cas_14_redirection_vers_schema_non_http_non_testable(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(302, location="javascript:void(0)")})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("non_testable", 302)
    assert resultat["tentatives"][0]["issue"] == "schema_non_http"


# ------------------------------------------------------------------------------ Wayback


def test_cas_13_api_sans_instantane_pas_d_archive_url(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(InstantaneAbsent()))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert "archive_url" not in resultat
    assert resultat["wayback"]["issue"] == "absent"
    assert bilans[0].echec_wayback is None


def test_cas_13_api_en_erreur_consignee_verdict_inchange(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(RechercheEchouee("HTTP 503")))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert "archive_url" not in resultat
    assert resultat["wayback"] == {"operation": "recherche_instantane", "instant_reference": "2026-09-21T10:00:00+02:00", "issue": "echec", "motif": "HTTP 503"}
    assert bilans[0].echec_wayback == "recherche_instantane : HTTP 503"
    assert code_de_sortie(bilans) == 0


def test_cas_13_instant_de_reference_est_la_reponse_la_plus_ancienne(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    ecrire_reponse(run, "01JD0000000000000000000001", [A], "2026-09-21T12:00:00+02:00")
    ecrire_reponse(run, "01JD0000000000000000000002", [A], "2026-09-20T23:30:00+00:00")
    ecrire_reponse(run, "01JD0000000000000000000003", [A], "2026-09-21T01:00:00+02:00")

    liens = liens_cites(run, lire_run(run))

    # 01:00 à +02:00 est 23:00 UTC, plus ancien que 23:30 UTC alors que sa chaîne trie après :
    # la comparaison porte sur les instants, jamais sur les chaînes.
    assert liens == {A: datetime(2026, 9, 21, 1, 0, tzinfo=PARIS)}


# ------------------------------------------------------------------------------ entrée


def test_cas_12_meme_url_citee_par_trois_reponses_testee_une_fois(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    for n in range(3):
        ecrire_reponse(run, f"01JD000000000000000000000{n}", [A, A], "2026-09-21T12:00:00+02:00")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(200, b"ok")]})

    passer(liens_cites(run, lire_run(run)), run / "volume" / "liens", b.deps)

    assert b.transport.urls() == [ROBOTS, A]


def test_cas_12_casse_et_barre_finale_donnent_deux_tests(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    variantes = ["https://example.org/Page", "https://example.org/page", "https://example.org/page/"]
    ecrire_reponse(run, "01JD0000000000000000000001", variantes, "2026-09-21T12:00:00+02:00")
    b = banc({ROBOTS: ROBOTS_OUVERT, **{v: reponse(200, v.encode()) for v in variantes}})

    passer(liens_cites(run, lire_run(run)), run / "volume" / "liens", b.deps)

    assert b.transport.urls() == [ROBOTS, *sorted(variantes)]
    assert len(list((run / "volume" / "liens").glob("*.json"))) == 3


def test_cas_16_refus_api_et_reponse_manquante_rien_a_tester(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    ecrire_reponse(run, "01JD0000000000000000000001", [], "2026-09-21T12:00:00+02:00", refus_api=True)
    ecrire_manquante(run, "01JD0000000000000000000002")
    b = banc({})

    liens = liens_cites(run, lire_run(run))
    bilans = passer(liens, run / "volume" / "liens", b.deps)

    assert liens == {}
    assert bilans == []
    assert code_de_sortie(bilans) == 0
    assert b.transport.urls() == []


def test_reponse_d_un_autre_run_refusee(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    chemin = run / "volume" / "reponses" / "x.json"
    chemin.write_text(json.dumps({"run_id": "01JDAUTRE00000000000000000", "statut_reponse": "manquante"}), encoding="utf-8")
    with pytest.raises(EntreeRefusee, match="run_id"):
        liens_cites(run, lire_run(run))


def test_fichier_etranger_parmi_les_reponses_refuse(tmp_path: Path) -> None:
    run = tmp_path / "run"
    ecrire_run(run)
    (run / "volume" / "reponses" / "notes.txt").write_text("x", encoding="utf-8")
    with pytest.raises(EntreeRefusee, match="notes.txt"):
        liens_cites(run, lire_run(run))


# ------------------------------------------------------------------------------ relance, sans verdict


def test_cas_17_relance_resultat_present_ni_reteste_ni_reecrit(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [reponse(404)]})
    _bilans, repertoire = _passer(b, tmp_path, A)
    chemin = repertoire / nom_resultat(A)
    avant = (chemin.read_bytes(), chemin.stat().st_mtime_ns)

    relance = banc({})
    bilans, _repertoire = _passer(relance, tmp_path, A)

    assert relance.transport.urls() == []
    assert (chemin.read_bytes(), chemin.stat().st_mtime_ns) == avant
    assert [(x.etat, x.verdict) for x in bilans] == [("repris", "mort")]
    assert code_de_sortie(bilans) == 0


def test_cas_17_resultat_present_mais_incoherent_refuse(tmp_path: Path) -> None:
    repertoire = tmp_path / "liens"
    repertoire.mkdir()
    (repertoire / nom_resultat(A)).write_text(json.dumps({"url_citee": "https://autre.example/"}), encoding="utf-8")
    b = banc({})

    bilans = passer({A: REFERENCE}, repertoire, b.deps)

    assert bilans[0].etat == "refuse"
    assert code_de_sortie(bilans) == 1
    assert b.transport.urls() == []


def test_resultat_hors_table_sans_verdict_aucun_fichier_code_1(tmp_path: Path) -> None:
    """La table v2 classe tout ; une table qui ne classe pas 3xx laisse 304 sans verdict, jamais supposé."""
    table = tmp_path / "table.toml"
    table.write_text(CHEMIN_TABLE.read_text(encoding="utf-8").replace('"1xx", "3xx", ', '"1xx", '), encoding="utf-8")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(304)}, chemin_table=table)

    bilans, repertoire = _passer(b, tmp_path, A)

    assert bilans[0].etat == "sans_verdict"
    assert "304" in (bilans[0].motif or "")
    assert not (repertoire / nom_resultat(A)).exists()
    assert code_de_sortie(bilans) == 1
    assert "Sans verdict (en attente du test des liens) : 1" in formater_bilan(bilans, "table-liens-v2")


def test_bilan_compte_par_verdict(tmp_path: Path) -> None:
    b2 = "https://example.org/b"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(404), b2: reponse(200, b"x")})
    bilans, _repertoire = _passer(b, tmp_path, A, b2)

    texte = formater_bilan(bilans, "table-liens-v2")

    assert "teste : 2 (existe 1, mort 1)" in texte
    assert "Échecs Wayback (consignés, verdict inchangé) : 1" in texte


# ------------------------------------------------------------------------------ D21


@pytest.mark.parametrize(
    ("route", "issue", "code"),
    [
        ([ErreurReseau("connexion réinitialisée")] * 3, "erreur_reseau", None),
        ([reponse(302)], "redirection_sans_location", 302),
        ([reponse(100)], "reponse_http", 100),
        ([reponse(300)], "reponse_http", 300),
        ([reponse(304)], "reponse_http", 304),
    ],
)
def test_d21_cas_1_nouvelle_issue_inaccessible(tmp_path: Path, route: list, issue: str, code: int | None) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: list(route)})

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert (resultat["verdict_existence"], resultat["code_http"]) == ("inaccessible", code)
    assert {t["issue"] for t in resultat["tentatives"]} == {issue}
    assert len(resultat["tentatives"]) == len(route)
    assert resultat["version_table"] == "table-liens-v3"
    assert bilans[0].etat == "teste"


def test_d21_cas_2_erreur_reseau_puis_200_existe_a_la_deuxieme_tentative(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: [ErreurReseau("EAI_AGAIN"), reponse(200, b"ok")]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert [(t["numero"], t["issue"]) for t in resultat["tentatives"]] == [(1, "erreur_reseau"), (2, "reponse_http")]
    assert b.horloge.sommeils == [1.0, 60.0]  # cadence robots.txt → URL, puis une seule attente de 60 s


def test_d21_cas_3_robots_503_puis_200_relu_url_testee_existe(tmp_path: Path) -> None:
    b = banc({ROBOTS: [reponse(503), ROBOTS_OUVERT], A: [reponse(200, b"ok")]})

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "existe"
    assert [t["issue"] for t in resultat["tentatives"]] == ["robots_injoignable", "reponse_http"]
    assert b.transport.urls() == [ROBOTS, ROBOTS, A]


def test_d21_cas_5_iri_envoyee_encodee_url_citee_et_nom_de_fichier_intacts(tmp_path: Path) -> None:
    iri = "https://example.org/programme/éducation"
    envoyee = "https://example.org/programme/%C3%A9ducation"
    b = banc({ROBOTS: ROBOTS_OUVERT, envoyee: reponse(200, b"page")}, archiveur=ArchiveurFactice(reussite(iri)))

    _bilans, repertoire = _passer(b, tmp_path, iri)

    chemin = repertoire / f"{hashlib.sha256(iri.encode('utf-8')).hexdigest()}.json"
    resultat = json.loads(chemin.read_text(encoding="utf-8"))
    assert resultat["url_citee"] == iri
    assert resultat["url_finale"] == envoyee
    assert resultat["verdict_existence"] == "existe"
    assert b.transport.urls() == [ROBOTS, envoyee]
    assert b.archiveur.urls == [envoyee]


def test_d21_cas_5_iri_inconvertible_non_testable(tmp_path: Path) -> None:
    iri = "https://" + "ü" * 64 + ".example/"
    b = banc({})

    _bilans, repertoire = _passer(b, tmp_path, iri)

    resultat = _resultat(repertoire, iri)
    assert resultat["verdict_existence"] == "non_testable"
    assert resultat["tentatives"][0]["issue"] == "url_malformee"
    assert b.transport.urls() == []


def test_d21_cas_6_deux_iri_qui_s_encodent_identiquement_deux_resultats(tmp_path: Path) -> None:
    brute, encodee = "https://example.org/É", "https://example.org/%C3%89"
    b = banc({ROBOTS: ROBOTS_OUVERT, encodee: reponse(200, b"page")})

    bilans, repertoire = _passer(b, tmp_path, brute, encodee)

    assert [x.etat for x in bilans] == ["teste", "teste"]
    assert _resultat(repertoire, brute)["url_citee"] == brute
    assert _resultat(repertoire, encodee)["url_citee"] == encodee
    assert nom_resultat(brute) != nom_resultat(encodee)
    assert len(list(repertoire.glob("*.json"))) == 2
    assert b.transport.urls() == [ROBOTS, encodee, encodee]


def test_d21_cas_7_instantane_200_telecharge_en_id_sha256_exact(tmp_path: Path) -> None:
    archive = b"\xef\xbb\xbf<html>copie\r\narchiv\xc3\xa9e</html>"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403), ROBOTS_WAYBACK: ROBOTS_OUVERT,
              BRUTE_A: reponse(200, archive, content_type="text/html; charset=utf-8")}, chercheur=ChercheurFactice(TROUVE_A))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    sha256 = hashlib.sha256(archive).hexdigest()
    assert resultat["verdict_existence"] == "inaccessible"
    assert resultat["archive_url"] == SERVI_A
    assert resultat["sha256_contenu"] == sha256
    assert "page" not in resultat
    assert (repertoire / "pages" / f"{sha256}.html").read_bytes() == archive
    assert resultat["wayback"] == {
        "operation": "recherche_instantane", "instant_reference": "2026-09-21T10:00:00+02:00", "issue": "trouve",
        "url_instantane": INSTANTANE_A, "horodatage_instantane": "20260920101010", "statut_instantane": "200",
        "telechargement": {"issue": "reussi", "url_brute": BRUTE_A, "url_finale": BRUTE_A, "chemin": f"pages/{sha256}.html",
                           "type_contenu_recu": "text/html; charset=utf-8", "taille_octets": len(archive)}}
    assert b.transport.urls() == [ROBOTS, A, ROBOTS_WAYBACK, BRUTE_A]
    assert len({en_tetes["User-Agent"] for _u, _t, en_tetes in b.transport.requetes}) == 1
    assert bilans[0].echec_wayback is None


def test_d21_cas_7_non_testable_instantane_telecharge(tmp_path: Path) -> None:
    url = "https://example.org/prive/x"
    instantane = InstantaneTrouve(f"https://web.archive.org/web/20260920101010/{url}", "20260920101010",
                                  f"https://web.archive.org/web/20260920101010id_/{url}")
    b = banc({ROBOTS: reponse(200, b"User-agent: *\nDisallow: /prive/\n"), ROBOTS_WAYBACK: ROBOTS_OUVERT,
              instantane.url_brute: reponse(200, b"copie")}, chercheur=ChercheurFactice(instantane))

    _bilans, repertoire = _passer(b, tmp_path, url)

    resultat = _resultat(repertoire, url)
    assert resultat["verdict_existence"] == "non_testable"
    assert resultat["archive_url"] == instantane.url_instantane
    assert resultat["sha256_contenu"] == hashlib.sha256(b"copie").hexdigest()


def test_d21_cas_8_instantane_404_ecarte_statut_consigne_sans_archive_url(tmp_path: Path) -> None:
    ecarte = InstantaneEcarte(INSTANTANE_A, "20260920101010", "404")
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(ecarte))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert "archive_url" not in resultat and "sha256_contenu" not in resultat
    assert resultat["wayback"] == {
        "operation": "recherche_instantane", "instant_reference": "2026-09-21T10:00:00+02:00", "issue": "ecarte",
        "url_instantane": INSTANTANE_A, "horodatage_instantane": "20260920101010", "statut_instantane": "404"}
    assert b.transport.urls() == [ROBOTS, A]
    assert bilans[0].echec_wayback is None


def test_d21_instantane_sans_statut_ecarte_statut_absent_du_journal(tmp_path: Path) -> None:
    ecarte = InstantaneEcarte(INSTANTANE_A, "20260920101010", None)
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403)}, chercheur=ChercheurFactice(ecarte))

    _bilans, repertoire = _passer(b, tmp_path, A)

    wayback = _resultat(repertoire, A)["wayback"]
    assert wayback["issue"] == "ecarte"
    assert "statut_instantane" not in wayback


@pytest.mark.parametrize(
    ("routes", "motif"),
    [
        ({ROBOTS_WAYBACK: ROBOTS_OUVERT, BRUTE_A: reponse(503)}, "reponse_http, code HTTP 503"),
        ({ROBOTS_WAYBACK: ROBOTS_OUVERT, BRUTE_A: DelaiDepasse("délai dépassé (30 s)")}, "delai_depasse"),
        ({ROBOTS_WAYBACK: reponse(200, b"User-agent: *\nDisallow: /web/\n")}, "robots_interdit"),
    ],
)
def test_d21_cas_9_telechargement_en_echec_ni_archive_url_ni_sha256_verdict_inchange(
    tmp_path: Path, routes: dict[str, Route], motif: str
) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403), **routes}, chercheur=ChercheurFactice(TROUVE_A))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert "archive_url" not in resultat and "sha256_contenu" not in resultat
    assert (resultat["wayback"]["issue"], resultat["wayback"]["url_instantane"]) == ("trouve", INSTANTANE_A)
    telechargement = resultat["wayback"]["telechargement"]
    assert (telechargement["issue"], telechargement["url_brute"]) == ("echec", BRUTE_A)
    assert motif in telechargement["motif"]
    assert not (repertoire / "pages").exists()
    assert bilans[0].echec_wayback is not None and motif in bilans[0].echec_wayback
    assert code_de_sortie(bilans) == 0


# ------------------------------------------------------------------------------ D22


BRUTE_T2 = f"https://web.archive.org/web/20260915080000id_/{A}"


def test_d22_cas_1_servi_a_une_autre_date_copie_gardee_archive_url_instantane_servi(tmp_path: Path) -> None:
    """`id_` demandé à T1, Wayback redirige vers la capture voisine T2 : la copie est acceptée,
    `archive_url` est l'instantané T2 sans `id_`, T1 reste consigné dans le journal Wayback."""
    archive = b"<html>capture voisine</html>"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403), ROBOTS_WAYBACK: ROBOTS_OUVERT,
              BRUTE_A: reponse(302, location=BRUTE_T2), BRUTE_T2: reponse(200, archive, content_type="text/html")},
             chercheur=ChercheurFactice(TROUVE_A))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    sha256 = hashlib.sha256(archive).hexdigest()
    assert resultat["archive_url"] == f"https://web.archive.org/web/20260915080000/{A}"
    assert resultat["sha256_contenu"] == sha256
    wayback = resultat["wayback"]
    assert (wayback["url_instantane"], wayback["horodatage_instantane"]) == (INSTANTANE_A, "20260920101010")
    assert (wayback["telechargement"]["url_brute"], wayback["telechargement"]["url_finale"]) == (BRUTE_A, BRUTE_T2)
    assert (repertoire / "pages" / f"{sha256}.html").read_bytes() == archive
    assert bilans[0].echec_wayback is None


def test_d22_cas_2_servi_a_la_date_demandee_archive_url_instantane_demande(tmp_path: Path) -> None:
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403), ROBOTS_WAYBACK: ROBOTS_OUVERT, BRUTE_A: reponse(200, b"copie")},
             chercheur=ChercheurFactice(TROUVE_A))

    _bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["archive_url"] == SERVI_A == f"https://web.archive.org/web/{TROUVE_A.horodatage}/{A}"
    assert resultat["wayback"]["telechargement"]["url_finale"] == BRUTE_A


@pytest.mark.parametrize(
    "finale",
    [
        "https://web.archive.org/erreur/capture-introuvable",
        f"https://web.archive.org/web/20260915080000/{A}",
        "https://ailleurs.example/page",
    ],
)
def test_d22_cas_3_url_finale_hors_forme_id_telechargement_en_echec(tmp_path: Path, finale: str) -> None:
    autre_robots = "https://ailleurs.example/robots.txt"
    b = banc({ROBOTS: ROBOTS_OUVERT, A: reponse(403), ROBOTS_WAYBACK: ROBOTS_OUVERT, autre_robots: ROBOTS_OUVERT,
              BRUTE_A: reponse(302, location=finale), finale: reponse(200, b"<html>autre chose</html>")},
             chercheur=ChercheurFactice(TROUVE_A))

    bilans, repertoire = _passer(b, tmp_path, A)

    resultat = _resultat(repertoire, A)
    assert resultat["verdict_existence"] == "inaccessible"
    assert "archive_url" not in resultat and "sha256_contenu" not in resultat
    telechargement = resultat["wayback"]["telechargement"]
    assert (telechargement["issue"], telechargement["url_brute"]) == ("echec", BRUTE_A)
    assert finale in telechargement["motif"]
    assert not (repertoire / "pages").exists()
    assert bilans[0].echec_wayback is not None and finale in bilans[0].echec_wayback
    assert code_de_sortie(bilans) == 0


def test_d22_cas_5_iri_recherche_et_telechargement_sur_l_uri_convertie(tmp_path: Path) -> None:
    """IRI à chemin accentué et hôte IDN : la requête de disponibilité et l'URL `id_` portent l'URI
    convertie par la règle de la table ; `url_citee` et le nom du fichier gardent la chaîne citée."""
    iri = "https://bücher.example/programme/éducation"
    uri = "https://xn--bcher-kva.example/programme/%C3%A9ducation"
    demande = ("https://archive.org/wayback/available?url=https%3A%2F%2Fxn--bcher-kva.example%2Fprogramme%2F%25C3%25A9ducation"
               "&timestamp=20260921080000")
    renvoyee = f"http://web.archive.org/web/20260920101010/{uri}"
    brute = f"https://web.archive.org/web/20260920101010id_/{uri}"
    api = json.dumps({"archived_snapshots": {"closest": {"available": True, "url": renvoyee, "status": "200"}}}).encode()
    b = banc({"https://xn--bcher-kva.example/robots.txt": ROBOTS_OUVERT, uri: reponse(403), demande: reponse(200, api),
              ROBOTS_WAYBACK: ROBOTS_OUVERT, brute: reponse(200, b"copie")})
    deps = replace(b.deps, chercheur=ChercheurInstantanes(b.transport, Cadence(b.horloge, intervalle_s=1.0)))

    passer({iri: REFERENCE}, tmp_path / "liens", deps)

    resultat = json.loads((tmp_path / "liens" / f"{hashlib.sha256(iri.encode('utf-8')).hexdigest()}.json").read_text("utf-8"))
    assert resultat["url_citee"] == iri
    assert b.transport.urls()[-3:] == [demande, ROBOTS_WAYBACK, brute]
    assert resultat["wayback"]["telechargement"]["url_brute"] == brute
    assert resultat["archive_url"] == f"https://web.archive.org/web/20260920101010/{uri}"


def test_d22_cas_5_iri_inconvertible_non_testable_aucune_requete_wayback(tmp_path: Path) -> None:
    """Une IRI inconvertible est `url_malformee`, donc non testable, ce qui appelle la recherche
    d'instantané : sans URI convertie, aucune requête Wayback n'est envoyée, l'échec est consigné."""
    iri = "https://" + "ü" * 64 + ".example/"
    b = banc({})

    bilans, repertoire = _passer(b, tmp_path, iri)

    resultat = _resultat(repertoire, iri)
    assert resultat["verdict_existence"] == "non_testable"
    assert b.chercheur.demandes == [] and b.transport.urls() == []
    assert resultat["wayback"]["issue"] == "echec"
    assert "IRI inconvertible" in resultat["wayback"]["motif"]
    assert "archive_url" not in resultat
    assert bilans[0].echec_wayback is not None
