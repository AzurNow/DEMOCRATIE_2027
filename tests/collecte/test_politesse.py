"""Téléchargement poli : robots.txt, cadence par hôte, redirections, erreurs HTTP.

Cas limites 4, 5, 6, 11, 12, 13, et la redirection hors http(s).
"""

from __future__ import annotations

from itertools import pairwise

import pytest

from pipeline.collecte.politesse import (
    AGENT_UTILISATEUR,
    Cadence,
    ClientPoli,
    EchecCollecte,
)
from pipeline.collecte.reseau import ErreurReseau
from tests.collecte.doubles import HorlogeFactice, Route, TransportFactice, reponse

ROBOTS = "https://example.org/robots.txt"
ROBOTS_OUVERT = reponse(200, b"User-agent: *\nAllow: /\n", content_type="text/plain")


def _client(horloge: HorlogeFactice, routes: dict[str, Route]) -> tuple[ClientPoli, TransportFactice]:
    transport = TransportFactice(horloge, routes)
    return ClientPoli(transport, Cadence(horloge, intervalle_s=1.0)), transport


def test_agent_utilisateur_nomme_le_projet_et_le_depot(horloge: HorlogeFactice) -> None:
    client, transport = _client(
        horloge,
        {ROBOTS: ROBOTS_OUVERT, "https://example.org/a": reponse(200, b"a")},
    )
    client.telecharger("https://example.org/a")

    assert "https://github.com/AzurNow/DEMOCRATIE_2027" in AGENT_UTILISATEUR
    assert all(en_tetes["User-Agent"] == AGENT_UTILISATEUR for _u, _t, en_tetes in transport.requetes)


def test_url_interdite_par_robots_est_refusee_sans_telecharger(horloge: HorlogeFactice) -> None:
    robots = reponse(200, b"User-agent: BancEssai2027\nDisallow: /prive/\n")
    client, transport = _client(horloge, {ROBOTS: robots})

    with pytest.raises(EchecCollecte, match="robots.txt"):
        client.telecharger("https://example.org/prive/doc.pdf")

    assert transport.urls() == [ROBOTS]


def test_robots_en_5xx_est_une_erreur_pas_une_autorisation(horloge: HorlogeFactice) -> None:
    client, transport = _client(horloge, {ROBOTS: reponse(503, b"indisponible")})

    with pytest.raises(EchecCollecte, match=r"robots\.txt.*503"):
        client.telecharger("https://example.org/doc.pdf")

    assert transport.urls() == [ROBOTS]


def test_robots_injoignable_est_une_erreur_pas_une_autorisation(horloge: HorlogeFactice) -> None:
    client, transport = _client(horloge, {ROBOTS: ErreurReseau("connexion refusée")})

    with pytest.raises(EchecCollecte, match="robots.txt"):
        client.telecharger("https://example.org/doc.pdf")

    assert transport.urls() == [ROBOTS]


def test_robots_absent_en_404_autorise_la_collecte(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: reponse(404), "https://example.org/doc": reponse(200, b"x")}
    )
    assert client.telecharger("https://example.org/doc").corps == b"x"


def test_robots_en_403_interdit_tout_l_hote(horloge: HorlogeFactice) -> None:
    client, transport = _client(horloge, {ROBOTS: reponse(403)})

    with pytest.raises(EchecCollecte, match="robots.txt"):
        client.telecharger("https://example.org/doc")

    assert transport.urls() == [ROBOTS]


def test_robots_est_lu_une_seule_fois_par_hote(horloge: HorlogeFactice) -> None:
    client, transport = _client(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            "https://example.org/a": reponse(200, b"a"),
            "https://example.org/b": reponse(200, b"b"),
        },
    )
    client.telecharger("https://example.org/a")
    client.telecharger("https://example.org/b")

    assert transport.urls().count(ROBOTS) == 1


def test_deux_url_du_meme_hote_sont_espacees_d_au_moins_une_seconde(horloge: HorlogeFactice) -> None:
    client, transport = _client(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            "https://example.org/a": reponse(200, b"a"),
            "https://example.org/b": reponse(200, b"b"),
        },
    )
    client.telecharger("https://example.org/a")
    client.telecharger("https://example.org/b")

    instants = [instant for _url, instant, _en_tetes in transport.requetes]
    assert len(instants) == 3
    assert all(suivant - precedent >= 1.0 for precedent, suivant in pairwise(instants))
    assert horloge.sommeils == [1.0, 1.0]


def test_deux_hotes_differents_ne_s_attendent_pas(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            "https://example.org/a": reponse(200, b"a"),
            "https://example.net/robots.txt": ROBOTS_OUVERT,
            "https://example.net/b": reponse(200, b"b"),
        },
    )
    client.telecharger("https://example.org/a")
    horloge.sommeils.clear()
    client.telecharger("https://example.net/b")

    assert horloge.sommeils == [1.0]  # robots.txt de example.net, puis le document : même hôte


def test_cadence_ne_dort_que_le_reliquat(horloge: HorlogeFactice) -> None:
    cadence = Cadence(horloge, intervalle_s=1.0)
    cadence.attendre("example.org")
    horloge.temps += 0.25
    cadence.attendre("example.org")
    horloge.temps += 3.0
    cadence.attendre("example.org")

    assert horloge.sommeils == [0.75]


def test_http_404_est_un_echec_nomme(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/absent": reponse(404, b"non")}
    )
    with pytest.raises(EchecCollecte, match="HTTP 404"):
        client.telecharger("https://example.org/absent")


def test_http_5xx_est_un_echec_nomme(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/doc": reponse(502, b"")}
    )
    with pytest.raises(EchecCollecte, match="HTTP 502"):
        client.telecharger("https://example.org/doc")


def test_delai_depasse_est_un_echec_nomme(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge,
        {ROBOTS: ROBOTS_OUVERT, "https://example.org/doc": ErreurReseau("délai dépassé (30 s)")},
    )
    with pytest.raises(EchecCollecte, match="délai dépassé"):
        client.telecharger("https://example.org/doc")


def test_reponse_de_zero_octet_est_refusee(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/vide": reponse(200, b"")}
    )
    with pytest.raises(EchecCollecte, match="vide"):
        client.telecharger("https://example.org/vide")


def test_redirection_suivie_et_url_finale_consignee(horloge: HorlogeFactice) -> None:
    client, transport = _client(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            "https://example.org/ancien": reponse(301, location="/nouveau"),
            "https://example.org/nouveau": reponse(200, b"doc", content_type="application/pdf"),
        },
    )
    telechargement = client.telecharger("https://example.org/ancien")

    assert telechargement.url_finale == "https://example.org/nouveau"
    assert telechargement.type_contenu == "application/pdf"
    assert transport.urls()[-2:] == ["https://example.org/ancien", "https://example.org/nouveau"]


def test_redirection_vers_un_autre_hote_consulte_son_robots(horloge: HorlogeFactice) -> None:
    client, transport = _client(
        horloge,
        {
            ROBOTS: ROBOTS_OUVERT,
            "https://example.org/doc": reponse(302, location="https://example.net/prive/doc"),
            "https://example.net/robots.txt": reponse(200, b"User-agent: *\nDisallow: /prive/\n"),
        },
    )
    with pytest.raises(EchecCollecte, match="robots.txt"):
        client.telecharger("https://example.org/doc")

    assert "https://example.net/prive/doc" not in transport.urls()


def test_redirection_hors_http_est_un_echec(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge,
        {ROBOTS: ROBOTS_OUVERT, "https://example.org/doc": reponse(302, location="ftp://example.org/x")},
    )
    with pytest.raises(EchecCollecte, match="hors http"):
        client.telecharger("https://example.org/doc")


def test_redirection_sans_location_est_un_echec(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/doc": reponse(302)}
    )
    with pytest.raises(EchecCollecte, match="Location"):
        client.telecharger("https://example.org/doc")


def test_boucle_de_redirections_est_un_echec(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge,
        {ROBOTS: ROBOTS_OUVERT, "https://example.org/boucle": reponse(302, location="/boucle")},
    )
    with pytest.raises(EchecCollecte, match="redirections"):
        client.telecharger("https://example.org/boucle")


def test_content_type_absent_reste_absent(horloge: HorlogeFactice) -> None:
    client, _transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/doc": reponse(200, b"x")}
    )
    assert client.telecharger("https://example.org/doc").type_contenu is None


def test_d55_2_redirection_location_utf8_brut_relue_en_utf8(horloge: HorlogeFactice) -> None:
    """D55 (2) : `http.client` décode `Location` en latin-1 ; des octets UTF-8 bruts (`/cafÃ©`) sont
    relus en UTF-8 (`/café`) avant d'être suivis — pas le chemin mojibake que la relecture latin-1
    donnerait telle quelle."""
    cible = "https://example.org/café"
    client, transport = _client(
        horloge, {ROBOTS: ROBOTS_OUVERT, "https://example.org/ancien": reponse(301, location="/cafÃ©"), cible: reponse(200, b"ok")}
    )
    assert client.telecharger("https://example.org/ancien").url_finale == cible
    assert transport.urls()[-1] == cible
