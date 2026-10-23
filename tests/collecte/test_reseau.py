"""Le vrai transport urllib, exercé contre un serveur local sur 127.0.0.1, et `relire_location`
(D55 (2)) : un en-tête `Location` reçu en UTF-8 brut, décodé en latin-1 par `http.client`, est relu
en UTF-8 quand l'aller-retour réussit."""

from __future__ import annotations

import pytest

from pipeline.collecte.reseau import ErreurReseau, TransportUrllib, relire_location
from tests.collecte.doubles import RouteLocale, ServeurLocal

BOM_CRLF = b"\xef\xbb\xbfLigne une\r\nLigne deux\r\n"


def test_transport_rend_les_octets_recus_sans_les_toucher(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/doc"] = RouteLocale(200, BOM_CRLF, (("Content-Type", "text/plain"),))

    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/doc", {})

    assert reponse.statut == 200
    assert reponse.corps == BOM_CRLF
    assert reponse.en_tetes["content-type"] == "text/plain"


def test_transport_ne_suit_pas_les_redirections_lui_meme(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/ancien"] = RouteLocale(301, b"", (("Location", "/nouveau"),))

    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/ancien", {})

    assert reponse.statut == 301
    assert reponse.en_tetes["location"] == "/nouveau"
    assert serveur_local.vus == ["/ancien"]


def test_transport_rend_un_404_comme_une_reponse(serveur_local: ServeurLocal) -> None:
    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/absent", {})
    assert reponse.statut == 404


def test_transport_envoie_les_en_tetes_demandes(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/doc"] = RouteLocale(200, b"x")
    TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/doc", {"User-Agent": "Essai/1"})
    assert serveur_local.agents == ["Essai/1"]


def test_delai_depasse_leve_une_erreur_reseau(serveur_local: ServeurLocal) -> None:
    serveur_local.routes["/lent"] = RouteLocale(200, b"x", attente_s=1.0)

    with pytest.raises(ErreurReseau, match="délai"):
        TransportUrllib(delai_s=0.2).envoyer(f"{serveur_local.base}/lent", {})


def test_hote_injoignable_leve_une_erreur_reseau() -> None:
    with pytest.raises(ErreurReseau):
        TransportUrllib(delai_s=1).envoyer("http://127.0.0.1:1/rien", {})


# --------------------------------------------------------------------- constat 7 (2026-10-12)


def test_url_non_ascii_leve_une_erreur_reseau_nommee_pas_une_unicodeencodeerror() -> None:
    """`http.client` encode la ligne de requête en ASCII avant toute connexion : une URL non ASCII
    y échoue sans jamais parler au réseau. Ne doit jamais remonter brute (constat 7)."""
    with pytest.raises(ErreurReseau, match="URL non encodable"):
        TransportUrllib(delai_s=1).envoyer("http://127.0.0.1:1/élection", {})


def test_caractere_de_controle_reste_une_erreur_reseau() -> None:
    """Un caractère de contrôle est déjà une `http.client.HTTPException` (`InvalidURL`), rattrapée
    avant ce correctif ; reste vrai après, par l'autre branche."""
    with pytest.raises(ErreurReseau):
        TransportUrllib(delai_s=1).envoyer("http://127.0.0.1:1/contr\x01le", {})


# --------------------------------------------------------------------- relire_location (D55 (2))


def test_d55_2_location_utf8_brut_relue_en_utf8() -> None:
    assert relire_location("/cafÃ©") == "/café"


def test_d55_2_location_ascii_inchangee() -> None:
    assert relire_location("/nouveau") == "/nouveau"


def test_d55_2_location_latin1_qui_n_est_pas_de_l_utf8_inchangee() -> None:
    assert relire_location("/café") == "/café"


def test_d55_2_location_non_encodable_en_latin1_inchangee() -> None:
    assert relire_location("/caf€") == "/caf€"


def test_d55_2_transport_rend_la_location_utf8_brute_telle_que_decodee_en_latin1(
    serveur_local: ServeurLocal,
) -> None:
    """Reproduit ce que produit `http.client` pour un en-tête `Location` envoyé en octets UTF-8
    bruts : la mauvaise relecture latin-1, inchangée par le transport (`relire_location` s'applique
    plus haut, dans la sonde et `politesse`)."""
    serveur_local.routes["/ancien"] = RouteLocale(301, b"", (("Location", "/cafÃ©"),))

    reponse = TransportUrllib(delai_s=5).envoyer(f"{serveur_local.base}/ancien", {})

    assert reponse.en_tetes["location"] == "/cafÃ©"
