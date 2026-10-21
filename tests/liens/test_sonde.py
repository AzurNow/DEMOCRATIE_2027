"""Une tentative de test d'un lien : GET seul, robots.txt, redirections une à une, cadence par hôte.

Cas limites 3, 4, 10, 11, 14 et 19 de D20, 3 et 5 de D21, au niveau d'une tentative ; le verdict
qui en découle est vérifié de bout en bout dans `test_passage.py`. Aucune requête réelle : `TransportFactice` lève une erreur
pour toute URL qu'un test n'a pas prévue, ce qui prouve aussi qu'aucune requête n'est partie.
"""

from __future__ import annotations

from itertools import pairwise

from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import (
    ConnexionRefusee,
    DelaiDepasse,
    ErreurReseau,
    NomIntrouvable,
    TransportUrllib,
    relire_location,
)
from pipeline.liens.iri import iri_vers_uri
from pipeline.liens.sonde import AGENT_LIENS, SondeLiens
from tests.collecte.doubles import HorlogeFactice, Route, RouteLocale, ServeurLocal, TransportFactice, reponse

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n")
A = "https://example.org/a"


def _sonde(horloge: HorlogeFactice, routes: dict[str, Route]) -> tuple[SondeLiens, TransportFactice]:
    transport = TransportFactice(horloge, routes)
    return SondeLiens(transport, Cadence(horloge, intervalle_s=1.0), iri_vers_uri, relire_location), transport


def test_200_direct_rend_le_corps_tel_quel(horloge: HorlogeFactice) -> None:
    corps = b"\xef\xbb\xbf<html>\r\n</html>"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(200, corps, content_type="text/html")})

    constat = sonde.sonder(A)

    assert (constat.issue, constat.code_http, constat.url_finale) == ("reponse_http", 200, A)
    assert constat.corps == corps
    assert constat.type_contenu == "text/html"
    assert transport.urls() == [ROBOTS, A]


def test_agent_utilisateur_propre_au_test_des_liens(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(200, b"x")})
    sonde.sonder(A)

    assert AGENT_LIENS.startswith("BancEssai2027-liens/")
    assert "https://github.com/AzurNow/DEMOCRATIE_2027" in AGENT_LIENS
    assert all(en_tetes == {"User-Agent": AGENT_LIENS} for _u, _t, en_tetes in transport.requetes)


def test_cas_3_301_puis_302_puis_200_url_finale_derniere_cible(horloge: HorlogeFactice) -> None:
    b, c = "https://example.org/b", "https://autre.example/c"
    sonde, transport = _sonde(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            A: reponse(301, location="/b"),
            b: reponse(302, location=c),
            "https://autre.example/robots.txt": reponse(404),
            c: reponse(200, b"fin"),
        },
    )

    constat = sonde.sonder(A)

    assert (constat.issue, constat.code_http, constat.url_finale) == ("reponse_http", 200, c)
    assert transport.urls() == [ROBOTS, A, b, "https://autre.example/robots.txt", c]


def test_cas_4_six_redirections_sont_excessives(horloge: HorlogeFactice) -> None:
    routes: dict[str, Route] = {ROBOTS: ROBOTS_OUVERT}
    etapes = [f"https://example.org/{n}" for n in range(7)]
    for source, cible in pairwise(etapes):
        routes[source] = reponse(302, location=cible)
    sonde, transport = _sonde(horloge, routes)

    constat = sonde.sonder(etapes[0])

    assert (constat.issue, constat.code_http) == ("redirections_excessives", 302)
    assert constat.url_finale is None
    assert transport.urls() == [ROBOTS, *etapes[:6]]


def test_cas_4_cinq_redirections_sont_suivies(horloge: HorlogeFactice) -> None:
    routes: dict[str, Route] = {ROBOTS: ROBOTS_OUVERT}
    etapes = [f"https://example.org/{n}" for n in range(6)]
    for source, cible in pairwise(etapes):
        routes[source] = reponse(302, location=cible)
    routes[etapes[-1]] = reponse(200, b"ok")
    sonde, _transport = _sonde(horloge, routes)

    assert sonde.sonder(etapes[0]).url_finale == etapes[-1]


def test_cas_4_boucle_a_b_a(horloge: HorlogeFactice) -> None:
    b = "https://example.org/b"
    sonde, transport = _sonde(
        horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(301, location=b), b: reponse(301, location=A)}
    )

    constat = sonde.sonder(A)

    assert (constat.issue, constat.code_http) == ("boucle_redirection", 301)
    assert transport.urls() == [ROBOTS, A, b]


def test_cas_4_redirection_vers_soi_meme_est_une_boucle(horloge: HorlogeFactice) -> None:
    sonde, _transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(302, location=A)})
    assert sonde.sonder(A).issue == "boucle_redirection"


def test_cas_10_robots_interdit_aucune_requete_vers_l_url(horloge: HorlogeFactice) -> None:
    robots = reponse(200, b"User-agent: *\nDisallow: /prive/\n")
    sonde, transport = _sonde(horloge, {ROBOTS: robots})

    constat = sonde.sonder("https://example.org/prive/page")

    assert (constat.issue, constat.code_http) == ("robots_interdit", None)
    assert transport.urls() == [ROBOTS]


def test_cas_10_robots_interdit_sur_une_cible_de_redirection(horloge: HorlogeFactice) -> None:
    robots_autre = "https://autre.example/robots.txt"
    cible = "https://autre.example/x"
    sonde, transport = _sonde(
        horloge,
        {ROBOTS: ROBOTS_OUVERT, A: reponse(301, location=cible), robots_autre: reponse(200, b"User-agent: *\nDisallow: /\n")},
    )

    assert sonde.sonder(A).issue == "robots_interdit"
    assert transport.urls() == [ROBOTS, A, robots_autre]


def test_cas_10_robots_en_5xx_est_injoignable(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: reponse(503)})

    assert sonde.sonder(A).issue == "robots_injoignable"
    assert transport.urls() == [ROBOTS]


def test_cas_10_robots_en_erreur_reseau_est_injoignable(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: DelaiDepasse("délai dépassé (30 s)")})

    assert sonde.sonder(A).issue == "robots_injoignable"
    assert transport.urls() == [ROBOTS]


def test_robots_absent_en_404_autorise_le_test(horloge: HorlogeFactice) -> None:
    sonde, _transport = _sonde(horloge, {ROBOTS: reponse(404), A: reponse(200, b"x")})
    assert sonde.sonder(A).code_http == 200


def test_robots_lu_une_fois_par_origine(horloge: HorlogeFactice) -> None:
    b = "https://example.org/b"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(200, b"a"), b: reponse(200, b"b")})
    sonde.sonder(A)
    sonde.sonder(b)
    assert transport.urls() == [ROBOTS, A, b]


def test_cas_11_schemas_non_http_et_chaine_non_url_sans_requete(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {})

    assert sonde.sonder("ftp://example.org/fichier.pdf").issue == "schema_non_http"
    assert sonde.sonder("javascript:alert(1)").issue == "schema_non_http"
    assert sonde.sonder("mailto:contact@example.org").issue == "schema_non_http"
    assert sonde.sonder("pas une url").issue == "url_malformee"
    assert sonde.sonder("https://").issue == "url_malformee"
    assert sonde.sonder("https://[::1").issue == "url_malformee"
    assert sonde.sonder("https://example.org:99999/").issue == "url_malformee"
    assert sonde.sonder("https://example.org/a b").issue == "url_malformee"
    assert transport.urls() == []


def test_d21_cas_5_iri_accent_dans_le_chemin_envoyee_encodee(horloge: HorlogeFactice) -> None:
    iri = "https://fr.wikipedia.org/wiki/Éducation"
    robots, envoyee = "https://fr.wikipedia.org/robots.txt", "https://fr.wikipedia.org/wiki/%C3%89ducation"
    sonde, transport = _sonde(horloge, {robots: ROBOTS_OUVERT, envoyee: reponse(200, b"page")})

    constat = sonde.sonder(iri)

    assert (constat.issue, constat.code_http, constat.url_finale) == ("reponse_http", 200, envoyee)
    assert transport.urls() == [robots, envoyee]


def test_d21_cas_5_hote_idn_envoye_en_xn(horloge: HorlogeFactice) -> None:
    robots, envoyee = "https://xn--bcher-kva.example/robots.txt", "https://xn--bcher-kva.example/"
    sonde, transport = _sonde(horloge, {robots: ROBOTS_OUVERT, envoyee: reponse(200, b"page")})

    assert sonde.sonder("https://bücher.example/").code_http == 200
    assert transport.urls() == [robots, envoyee]


def test_d21_cas_5_pourcent_deja_encode_non_reencode(horloge: HorlogeFactice) -> None:
    envoyee = "https://example.org/%C3%89cole/%C3%A9"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, envoyee: reponse(200, b"page")})

    assert sonde.sonder("https://example.org/%C3%89cole/é").code_http == 200
    assert transport.urls() == [ROBOTS, envoyee]


def test_d21_cas_5_iri_inconvertible_url_malformee_sans_requete(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {})

    constat = sonde.sonder("https://" + "ü" * 64 + ".example/")

    assert (constat.issue, constat.code_http) == ("url_malformee", None)
    assert transport.urls() == []


def test_d21_cible_de_redirection_non_ascii_convertie_a_l_envoi(horloge: HorlogeFactice) -> None:
    envoyee = "https://example.org/%C3%A9t%C3%A9"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(301, location="/été"), envoyee: reponse(200, b"ok")})

    constat = sonde.sonder(A)

    assert (constat.code_http, constat.url_finale) == (200, envoyee)
    assert transport.urls() == [ROBOTS, A, envoyee]


def test_d21_cible_de_redirection_inconvertible_url_malformee(horloge: HorlogeFactice) -> None:
    cible = "https://" + "ü" * 64 + ".example/"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(302, location=cible)})

    assert (sonde.sonder(A).issue, sonde.sonder(A).code_http) == ("url_malformee", 302)
    assert transport.urls() == [ROBOTS, A, A]


def test_d21_cas_3_robots_en_echec_relu_a_la_tentative_suivante(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: [reponse(503), ROBOTS_OUVERT], A: reponse(200, b"ok")})

    assert sonde.sonder(A).issue == "robots_injoignable"
    assert sonde.sonder(A).code_http == 200
    assert transport.urls() == [ROBOTS, ROBOTS, A]


def test_d21_robots_lu_avec_succes_reste_en_cache_pour_le_passage(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: [ROBOTS_OUVERT], A: [reponse(503), reponse(200, b"ok")]})

    assert sonde.sonder(A).code_http == 503
    assert sonde.sonder(A).code_http == 200
    assert transport.urls() == [ROBOTS, A, A]


def test_cas_14_redirection_vers_un_schema_non_http(horloge: HorlogeFactice) -> None:
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(302, location="ftp://example.org/f")})

    constat = sonde.sonder(A)

    assert (constat.issue, constat.code_http) == ("schema_non_http", 302)
    assert transport.urls() == [ROBOTS, A]


def test_redirection_sans_location(horloge: HorlogeFactice) -> None:
    sonde, _transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(302)})
    assert (sonde.sonder(A).issue, sonde.sonder(A).code_http) == ("redirection_sans_location", 302)


def test_erreurs_reseau_classees(horloge: HorlogeFactice) -> None:
    routes: dict[str, Route] = {
        ROBOTS: ROBOTS_OUVERT,
        "https://example.org/1": DelaiDepasse("délai dépassé (30 s)"),
        "https://example.org/2": ConnexionRefusee("refusée"),
        "https://example.org/3": ErreurReseau("connexion réinitialisée"),
        "https://inexistant.example/robots.txt": NomIntrouvable("nodename nor servname"),
    }
    sonde, _transport = _sonde(horloge, routes)

    assert sonde.sonder("https://example.org/1").issue == "delai_depasse"
    assert sonde.sonder("https://example.org/2").issue == "connexion_refusee"
    assert sonde.sonder("https://example.org/3").issue == "erreur_reseau"
    assert sonde.sonder("https://inexistant.example/page").issue == "domaine_inexistant"


def test_domaine_inexistant_sur_l_url_elle_meme(horloge: HorlogeFactice) -> None:
    """robots.txt d'un domaine qui n'existe pas : c'est le domaine qui est mort, pas robots.txt."""
    sonde, transport = _sonde(horloge, {"https://inexistant.example/robots.txt": NomIntrouvable("introuvable")})

    constat = sonde.sonder("https://inexistant.example/page")

    assert (constat.issue, constat.code_http) == ("domaine_inexistant", None)
    assert transport.urls() == ["https://inexistant.example/robots.txt"]


def test_d55_2_redirection_location_utf8_brut_relue_avant_conversion_iri(horloge: HorlogeFactice) -> None:
    """D55 (2) : `http.client` décode `Location` en latin-1 ; des octets UTF-8 bruts (`/cafÃ©`)
    doivent être relus en UTF-8 (`/café`) avant la conversion IRI → URI, pour viser `…/caf%C3%A9` et
    non `…/caf%C3%83%C2%A9` (le double encodage de la version non corrigée)."""
    envoyee = "https://example.org/caf%C3%A9"
    transport = TransportFactice(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(301, location="/cafÃ©"), envoyee: reponse(200, b"ok")})
    sonde = SondeLiens(transport, Cadence(horloge, intervalle_s=1.0), iri_vers_uri, relire_location)

    constat = sonde.sonder(A)

    assert (constat.code_http, constat.url_finale) == (200, envoyee)
    assert transport.urls() == [ROBOTS, A, envoyee]


def test_d55_2_bout_en_bout_serveur_local_transport_urllib(horloge: HorlogeFactice, serveur_local: ServeurLocal) -> None:
    """Même cas que ci-dessus, de bout en bout : un vrai `http.server` sur 127.0.0.1 envoie `Location`
    en octets UTF-8 bruts, relus par `TransportUrllib` (reproduction du relecteur de `http.client`),
    puis par `relire_location`."""
    serveur_local.routes["/robots.txt"] = RouteLocale(200, b"User-agent: *\nAllow: /\n")
    serveur_local.routes["/ancien"] = RouteLocale(301, b"", (("Location", "/cafÃ©"),))
    serveur_local.routes["/caf%C3%A9"] = RouteLocale(200, b"ok")
    sonde = SondeLiens(TransportUrllib(delai_s=5), Cadence(horloge, intervalle_s=0.0), iri_vers_uri, relire_location)

    constat = sonde.sonder(f"{serveur_local.base}/ancien")

    assert (constat.issue, constat.code_http) == ("reponse_http", 200)
    assert constat.url_finale == f"{serveur_local.base}/caf%C3%A9"
    assert serveur_local.vus == ["/robots.txt", "/ancien", "/caf%C3%A9"]


def test_cas_19_deux_url_du_meme_hote_au_moins_une_seconde_entre_les_debuts(horloge: HorlogeFactice) -> None:
    b = "https://example.org/b"
    sonde, transport = _sonde(horloge, {ROBOTS: ROBOTS_OUVERT, A: reponse(200, b"a"), b: reponse(200, b"b")})

    sonde.sonder(A)
    sonde.sonder(b)

    instants = [instant for _url, instant, _en_tetes in transport.requetes]
    assert len(instants) == 3
    assert all(apres - avant >= 1.0 for avant, apres in pairwise(instants))
