"""Collecte de bout en bout : archive, manifeste de contenu, fiche de source, rapport, code de sortie.

Cas limites de C1 (octets tels quels, redirections, Content-Type, immuabilité, échecs, ligne de
commande) et cas limites 1 à 4 de C1-bis (une fiche par source, index source → sha256). La reprise
de l'archivage est dans `test_reprise.py`, les fichiers dorés dans `test_dores.py`.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from pipeline.collecte.__main__ import principal
from pipeline.collecte.collecte import (
    ArchivageManque,
    Collectee,
    DejaCollectee,
    Dependances,
    FicheAjoutee,
    Refusee,
    code_de_sortie,
    collecter,
    formater_rapport,
)
from pipeline.collecte.manifeste import cle_source
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi
from tests.collecte.banc import (
    INSTANTANE,
    PDF,
    SHA_PDF,
    URL_PDF,
    banc,
    cle,
    fiche,
    manifeste,
    source,
)
from tests.collecte.doubles import HorlogeFactice, reponse

CLE_A = cle("candidat-a", URL_PDF)


# --------------------------------------------------------------------------- cas nominal


def test_manifeste_de_contenu_ne_porte_que_les_faits_du_document(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")})

    resultats = collecter([source()], b.dependances())

    chemin_local = f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf"
    assert resultats == [
        Collectee(url=URL_PDF, sha256=SHA_PDF, chemin_local=chemin_local, archive_url=INSTANTANE)
    ]
    assert manifeste(racine, SHA_PDF) == {
        "sha256": SHA_PDF,
        "chemin_local": chemin_local,
        "taille_octets": len(PDF),
        "type_contenu_recu": "application/pdf",
        "date_premiere_collecte": "2026-09-22T14:30:05+02:00",
        "url_soumise": URL_PDF,
        "archive_url": INSTANTANE,
    }
    assert code_de_sortie(resultats) == 0


def test_fiche_de_source_porte_les_metadonnees_de_la_liste_et_pointe_le_contenu(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")})

    collecter([source()], b.dependances())

    assert fiche(racine, CLE_A, SHA_PDF) == {
        "url": URL_PDF,
        "url_finale": URL_PDF,
        "candidat_id": "candidat-a",
        "tier": "T1",
        "type_document": "programme_pdf",
        "date_source": "2026-09-01",
        "publication": "publique",
        "sha256": SHA_PDF,
        "date_collecte": "2026-09-22T14:30:05+02:00",
    }
    assert b.fichiers() == [
        f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf",
        f"staging/sources/{SHA_PDF}.json",
        f"staging/sources/par-source/{CLE_A}/{SHA_PDF}.json",
    ]


def test_cle_source_est_le_sha256_de_candidat_saut_de_ligne_url() -> None:
    assert cle_source("candidat-a", URL_PDF) == CLE_A
    assert cle_source("candidat-a", URL_PDF) != cle_source("candidat-b", URL_PDF)


def test_archive_contient_les_octets_exacts_avec_bom_et_crlf(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF)})

    collecter([source()], b.dependances())

    archive = racine / "archives" / SHA_PDF[:2] / f"{SHA_PDF}.bin"
    assert archive.read_bytes() == PDF
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == manifeste(racine, SHA_PDF)["sha256"]


def test_site_parti_reporte_sa_mention_a_la_fiche(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {"https://example.org/parti": reponse(200, b"<html>")})
    site = source(
        "https://example.org/parti", type_document="site_parti", site_parti_tient_lieu_de_campagne=False
    )

    collecter([site], b.dependances())

    sha = hashlib.sha256(b"<html>").hexdigest()
    assert fiche(racine, cle("candidat-a", "https://example.org/parti"), sha)[
        "site_parti_tient_lieu_de_campagne"
    ] is False
    assert "site_parti_tient_lieu_de_campagne" not in manifeste(racine, sha)


def test_redirection_consigne_url_finale_a_cote_de_url_dans_la_fiche(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(
        racine,
        horloge,
        {
            URL_PDF: reponse(301, location="/2026/programme.pdf"),
            "https://example.org/2026/programme.pdf": reponse(200, PDF),
        },
    )

    collecter([source()], b.dependances())

    lue = fiche(racine, CLE_A, SHA_PDF)
    assert lue["url"] == URL_PDF
    assert lue["url_finale"] == "https://example.org/2026/programme.pdf"
    assert manifeste(racine, SHA_PDF)["url_soumise"] == URL_PDF


def test_content_type_inconnu_donne_bin_et_consigne_le_type_recu(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/x-maison")})

    collecter([source()], b.dependances())

    lu = manifeste(racine, SHA_PDF)
    assert lu["chemin_local"] == f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin"
    assert lu["type_contenu_recu"] == "application/x-maison"


def test_content_type_absent_est_consigne_comme_absent(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF)})

    collecter([source()], b.dependances())

    assert manifeste(racine, SHA_PDF)["type_contenu_recu"] is None


# --------------------------------------------------------------------------- une fiche par source


def test_cas_1_deux_urls_memes_octets_une_archive_un_manifeste_deux_fiches(
    racine: Path, horloge: HorlogeFactice
) -> None:
    miroir = "https://example.org/miroir/programme.pdf"
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF), miroir: reponse(200, PDF)})

    resultats = collecter([source(), source(miroir)], b.dependances())

    cle_miroir = cle("candidat-a", miroir)
    assert b.fichiers() == sorted(
        [
            f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin",
            f"staging/sources/{SHA_PDF}.json",
            f"staging/sources/par-source/{CLE_A}/{SHA_PDF}.json",
            f"staging/sources/par-source/{cle_miroir}/{SHA_PDF}.json",
        ]
    )
    assert resultats[1] == FicheAjoutee(url=miroir, sha256=SHA_PDF)
    assert b.archiveur.urls == [URL_PDF]
    assert fiche(racine, cle_miroir, SHA_PDF)["url"] == miroir
    assert manifeste(racine, SHA_PDF)["url_soumise"] == URL_PDF
    assert "contenu déjà archivé, fiche ajoutée" in formater_rapport(resultats)
    assert code_de_sortie(resultats) == 0


def test_cas_2_meme_url_pour_deux_candidats_donne_deux_cles_et_deux_fiches(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, PDF)]})

    resultats = collecter([source(), source(candidat_id="candidat-b")], b.dependances())

    cle_b = cle("candidat-b", URL_PDF)
    assert CLE_A != cle_b
    assert fiche(racine, CLE_A, SHA_PDF)["candidat_id"] == "candidat-a"
    assert fiche(racine, cle_b, SHA_PDF)["candidat_id"] == "candidat-b"
    assert [type(resultat) for resultat in resultats] == [Collectee, FicheAjoutee]
    assert code_de_sortie(resultats) == 0


def test_cas_3_meme_source_meme_contenu_rien_n_est_ecrit_et_deja_collectee(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, PDF)]})
    collecter([source()], b.dependances())
    avant = b.instantane_des_octets()
    mtimes = {nom: (racine / nom).stat().st_mtime_ns for nom in avant}
    horloge.instant = horloge.instant.replace(day=23)

    resultats = collecter([source()], b.dependances())

    assert resultats == [DejaCollectee(url=URL_PDF, sha256=SHA_PDF)]
    assert b.instantane_des_octets() == avant
    assert {nom: (racine / nom).stat().st_mtime_ns for nom in avant} == mtimes
    assert b.archiveur.urls == [URL_PDF]
    assert "déjà collectée" in formater_rapport(resultats)
    assert code_de_sortie(resultats) == 0


def test_cas_4_meme_source_contenu_change_seconde_fiche_second_manifeste_l_ancien_reste(
    racine: Path, horloge: HorlogeFactice
) -> None:
    autre = PDF + b"version 2\r\n"
    sha_autre = hashlib.sha256(autre).hexdigest()
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, autre)]})
    collecter([source()], b.dependances())
    avant = b.instantane_des_octets()

    resultats = collecter([source()], b.dependances())

    assert b.fichiers() == sorted(
        [
            f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin",
            f"archives/{sha_autre[:2]}/{sha_autre}.bin",
            f"staging/sources/{SHA_PDF}.json",
            f"staging/sources/{sha_autre}.json",
            f"staging/sources/par-source/{CLE_A}/{SHA_PDF}.json",
            f"staging/sources/par-source/{CLE_A}/{sha_autre}.json",
        ]
    )
    assert {nom: b.instantane_des_octets()[nom] for nom in avant} == avant
    assert [type(resultat) for resultat in resultats] == [Collectee]


def test_fiche_manquante_apres_un_lot_interrompu_est_ajoutee_sans_toucher_au_contenu(
    racine: Path, horloge: HorlogeFactice
) -> None:
    b = banc(racine, horloge, {URL_PDF: [reponse(200, PDF), reponse(200, PDF)]})
    collecter([source()], b.dependances())
    (racine / "staging" / "sources" / "par-source" / CLE_A / f"{SHA_PDF}.json").unlink()
    manifeste_avant = (racine / "staging" / "sources" / f"{SHA_PDF}.json").read_bytes()

    resultats = collecter([source()], b.dependances())

    assert resultats == [FicheAjoutee(url=URL_PDF, sha256=SHA_PDF)]
    assert (racine / "staging" / "sources" / f"{SHA_PDF}.json").read_bytes() == manifeste_avant
    assert b.archiveur.urls == [URL_PDF]


# --------------------------------------------------------------------------- Wayback


def test_wayback_en_echec_ecrit_manifeste_et_fiche_sans_archive_url_et_sort_en_erreur(
    racine: Path, horloge: HorlogeFactice
) -> None:
    echec = ArchivageEchoue(motif="HTTP 503 sans instantané daté", tentatives=3)
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF)}, [echec])

    resultats = collecter([source()], b.dependances())

    lu = manifeste(racine, SHA_PDF)
    assert "archive_url" not in lu
    assert lu["echec_archivage"] == {
        "service": "wayback_save_page_now",
        "motif": "HTTP 503 sans instantané daté",
        "tentatives": 3,
    }
    assert lu["url_soumise"] == URL_PDF
    assert fiche(racine, CLE_A, SHA_PDF)["sha256"] == SHA_PDF
    assert resultats == [
        ArchivageManque(
            url=URL_PDF,
            sha256=SHA_PDF,
            chemin_local=f"archives/{SHA_PDF[:2]}/{SHA_PDF}.bin",
            motif="HTTP 503 sans instantané daté",
        )
    ]
    assert code_de_sortie(resultats) != 0
    assert "HTTP 503 sans instantané daté" in formater_rapport(resultats)


def test_wayback_recoit_l_url_listee_et_non_l_url_finale(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(
        racine,
        horloge,
        {
            URL_PDF: reponse(301, location="/2026/programme.pdf"),
            "https://example.org/2026/programme.pdf": reponse(200, PDF),
        },
        [ArchivageReussi(INSTANTANE)],
    )

    collecter([source()], b.dependances())

    assert b.archiveur.urls == [URL_PDF]


def test_constat_7_url_non_ascii_convertie_avant_telechargement_et_archivage(
    racine: Path, horloge: HorlogeFactice
) -> None:
    """Constat 7 (2026-10-12) : une IRI citée part convertie (RFC 3987 §3.1) vers le téléchargement
    et Save Page Now ; `url_soumise` et le rapport gardent la chaîne exacte listée par l'auteur."""
    iri = "https://example.org/élections.pdf"
    envoyee = "https://example.org/%C3%A9lections.pdf"
    sha256 = hashlib.sha256(PDF).hexdigest()
    b = banc(racine, horloge, {envoyee: reponse(200, PDF, content_type="application/pdf")})

    resultats = collecter([source(url=iri)], b.dependances())

    chemin_local = f"archives/{sha256[:2]}/{sha256}.pdf"
    assert resultats == [Collectee(url=iri, sha256=sha256, chemin_local=chemin_local, archive_url=INSTANTANE)]
    assert manifeste(racine, sha256)["url_soumise"] == iri
    assert b.archiveur.urls == [envoyee]


# --------------------------------------------------------------------------- échecs


def test_http_404_ne_laisse_ni_archive_ni_manifeste_ni_fiche(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(404, b"absent")})

    resultats = collecter([source()], b.dependances())

    assert resultats == [Refusee(url=URL_PDF, motif="HTTP 404")]
    assert b.fichiers() == []
    assert b.archiveur.urls == []
    assert code_de_sortie(resultats) != 0
    assert URL_PDF in formater_rapport(resultats)
    assert "HTTP 404" in formater_rapport(resultats)


def test_reponse_de_zero_octet_ne_laisse_rien(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, b"")})

    resultats = collecter([source()], b.dependances())

    assert isinstance(resultats[0], Refusee)
    assert "vide" in resultats[0].motif
    assert b.fichiers() == []
    assert code_de_sortie(resultats) != 0


def test_un_echec_n_arrete_pas_le_lot(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(
        racine,
        horloge,
        {"https://example.org/absent": reponse(404), URL_PDF: reponse(200, PDF)},
    )

    resultats = collecter([source("https://example.org/absent"), source()], b.dependances())

    assert [type(resultat) for resultat in resultats] == [Refusee, Collectee]
    assert code_de_sortie(resultats) != 0


def test_iri_inconvertible_est_refusee_sans_toucher_au_reseau_et_n_arrete_pas_le_lot(
    racine: Path, horloge: HorlogeFactice
) -> None:
    """Relecture du constat 7 (12/10) : un hôte IDNA trop long ne se convertit pas en URI (D22). La
    source échoue proprement, sans jamais atteindre le transport ni l'archiveur, et la source
    suivante est collectée normalement."""
    inconvertible = "https://" + "ü" * 64 + ".example/"
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")})

    resultats = collecter([source(url=inconvertible), source()], b.dependances())

    assert isinstance(resultats[0], Refusee)
    assert resultats[0].url == inconvertible
    assert "inconvertible" in resultats[0].motif
    assert inconvertible not in b.transport.urls()
    assert b.archiveur.urls == [URL_PDF]
    assert resultats[1] == Collectee(
        url=URL_PDF,
        sha256=SHA_PDF,
        chemin_local=f"archives/{SHA_PDF[:2]}/{SHA_PDF}.pdf",
        archive_url=INSTANTANE,
    )
    assert code_de_sortie(resultats) != 0


# --------------------------------------------------------------------------- ligne de commande


def test_fichier_de_sources_invalide_est_refuse_avant_tout_telechargement(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    liste = tmp_path / "sources.toml"
    liste.write_text(
        '[[source]]\nurl = "https://example.org/a"\ncandidat_id = "candidat-a"\n'
        'tier = "T4"\ntype_document = "programme_pdf"\ndate_source = 2026-09-01\n'
        'publication = "publique"\n',
        encoding="utf-8",
    )

    def construction_interdite(_racine: Path) -> Dependances:
        raise AssertionError("aucune dépendance réseau ne doit être construite")

    code = principal([str(liste), "--racine", str(tmp_path)], construction_interdite)

    assert code == 2
    erreur = capsys.readouterr().err
    assert "source n°1" in erreur and "T4" in erreur
    assert not (tmp_path / "archives").exists()
    assert not (tmp_path / "staging").exists()


def test_ligne_de_commande_collecte_et_rend_le_code_du_lot(
    tmp_path: Path, horloge: HorlogeFactice, capsys: pytest.CaptureFixture[str]
) -> None:
    liste = tmp_path / "sources.toml"
    liste.write_text(
        '[[source]]\nurl = "https://example.org/programme.pdf"\ncandidat_id = "candidat-a"\n'
        'tier = "T1"\ntype_document = "programme_pdf"\ndate_source = 2026-09-01\n'
        'publication = "publique"\n',
        encoding="utf-8",
    )
    b = banc(tmp_path, horloge, {URL_PDF: reponse(200, PDF)})

    code = principal([str(liste), "--racine", str(tmp_path)], lambda _racine: b.dependances())

    assert code == 0
    assert SHA_PDF in capsys.readouterr().out
