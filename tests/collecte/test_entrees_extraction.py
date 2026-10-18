"""`pipeline/collecte/entrees_extraction.py` : les entrées de l'extraction double (D52, PR 3 du lot
extraction), et `textes/en_service.py:extracteur_en_service` (D52 (4), option A).

Cas limites 1 à 5 du brief, plus l'accord entre l'extracteur en service et celui que chaque module
inscrit dans ses fiches, et le fichier doré relu par `dores.test.ts` contre le schéma. Aucun réseau.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

import pymupdf
import pytest

from pipeline.collecte.collecte import collecter
from pipeline.collecte.entrees_extraction import (
    DejaEcrite,
    Dependances,
    Ecrite,
    EntreeNonConforme,
    Refusee,
    SansTexte,
    chemin_entree,
    code_de_sortie,
    exiger_conforme,
    formater_rapport,
    preparer_tout,
)
from pipeline.collecte.manifeste import REPERTOIRE_FICHES
from pipeline.collecte.textes.en_service import extracteur_en_service
from pipeline.collecte.textes.extraction import Dependances as DependancesTextes
from pipeline.collecte.textes.extraction import Extrait, extraire_tout
from pipeline.collecte.textes.fiche import Extracteur, Extraction
from pipeline.collecte.textes.page_html import extraire_html
from pipeline.collecte.textes.pages import joindre_pages
from pipeline.collecte.textes.pdf import extraire_pdf
from pipeline.collecte.textes.refus import ExtractionRefusee
from pipeline.collecte.textes.transcription_vtt import extraire_vtt
from pipeline.collecte.wayback import ArchivageEchoue
from tests.collecte.banc import PDF, SHA_PDF, URL_PDF, banc, cle, source
from tests.collecte.banc_textes import VERSION_PYTHON_FIGEE, dependances, extracteur_html_fige, extracteur_vtt_fige
from tests.collecte.doubles import HorlogeFactice, reponse

DORE = Path(__file__).resolve().parent / "dore"
CLE_A = cle("candidat-a", URL_PDF)


def en_service_fige(type_contenu: str | None) -> Extracteur:
    """L'extracteur en service, à la version de Python figée par `banc_textes` pour html et webvtt :
    les fiches du banc la portent, les fichiers dorés ne dépendent pas de la machine. pymupdf est
    déjà épinglé par uv.lock, et sa version réelle est celle des fiches factices."""
    extracteur = extracteur_en_service(type_contenu)
    return extracteur if extracteur.outil == "pymupdf" else extracteur._replace(version=VERSION_PYTHON_FIGEE)


def _deps(racine: Path, en_service: Callable[[str | None], Extracteur] = en_service_fige) -> Dependances:
    return Dependances(racine, en_service)


def _collecter_pdf(racine: Path, horloge: HorlogeFactice, archivages: list | None = None) -> None:
    b = banc(racine, horloge, {URL_PDF: reponse(200, PDF, content_type="application/pdf")}, archivages)
    collecter([source()], b.dependances())


def _extraire(racine: Path, horloge: HorlogeFactice) -> str:
    horloge.instant = horloge.instant.replace(minute=45)
    [resultat] = extraire_tout(dependances(racine, horloge))
    assert isinstance(resultat, Extrait)
    return resultat.texte_sha256


def _entree(racine: Path) -> dict[str, object]:
    return json.loads((racine / chemin_entree(CLE_A, SHA_PDF)).read_text(encoding="utf-8"))


# ----------------------------------------------------------------- extracteur en service


def _pdf_reel(texte: str) -> bytes:
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), texte)
    octets = document.tobytes()
    document.close()
    return octets


def _description(extraction: Extraction) -> Extracteur:
    return Extracteur(extraction.outil, extraction.version, extraction.options)


def test_l_extracteur_en_service_est_celui_que_chaque_extracteur_inscrit_dans_sa_fiche() -> None:
    vtt = "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nBonjour.\n".encode()
    assert extracteur_en_service("application/pdf") == _description(extraire_pdf(_pdf_reel("Programme")))
    assert extracteur_en_service("text/html; charset=utf-8") == _description(extraire_html(b"<p>Texte</p>", "text/html; charset=utf-8"))
    assert extracteur_en_service("application/xhtml+xml") == _description(extraire_html(b"<p>Texte</p>", "application/xhtml+xml; charset=utf-8"))
    assert extracteur_en_service("video/mp4") == _description(extraire_vtt(vtt))
    assert extracteur_en_service("audio/mpeg") == _description(extraire_vtt(vtt))


def test_un_type_de_contenu_sans_extracteur_est_refuse_comme_par_l_extraction() -> None:
    with pytest.raises(ExtractionRefusee, match="non pris en charge"):
        extracteur_en_service("image/png")
    with pytest.raises(ExtractionRefusee, match="aucun Content-Type"):
        extracteur_en_service(None)


# ----------------------------------------------------------------- cas nominal et doré


def test_entree_d_un_programme_pdf_reproduite_octet_pour_octet(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte = _extraire(racine, horloge)
    resultats = preparer_tout(_deps(racine))
    assert resultats == [Ecrite(CLE_A, SHA_PDF, 1)]
    assert code_de_sortie(resultats) == 0
    octets = (racine / chemin_entree(CLE_A, SHA_PDF)).read_bytes()
    assert octets == (DORE / "entrees-extraction" / "entree-programme-pdf.json").read_bytes()
    entree = _entree(racine)
    assert list(entree["sources"]) == [texte]  # type: ignore[arg-type]
    assert entree["extracteur_epingle"] == extracteur_en_service("application/pdf")._asdict()


def test_le_bloc_source_est_celui_de_source_de_sans_page_ni_extrait(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    texte = _extraire(racine, horloge)
    preparer_tout(_deps(racine))
    bloc = _entree(racine)["sources"][texte]  # type: ignore[index]
    assert "page" not in bloc and "extrait" not in bloc
    assert bloc["type_document"] == "programme_pdf" and bloc["format"] == "pdf"


# ----------------------------------------------------------------- cas limites


def test_cas_1_deux_fiches_d_extraction_donnent_deux_blocs_sans_choix(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    premier = _extraire(racine, horloge)

    def autre_version(octets: bytes) -> Extraction:
        en_pages = joindre_pages(["Autre rendu\n"])
        return Extraction(en_pages.texte, "pymupdf", "1.29.0", {"mode": "text"}, pages=en_pages.pages)

    deps_textes = DependancesTextes(racine, horloge, autre_version, extracteur_html_fige, extracteur_vtt_fige)
    [second] = extraire_tout(deps_textes)
    assert isinstance(second, Extrait) and second.texte_sha256 != premier

    assert preparer_tout(_deps(racine)) == [Ecrite(CLE_A, SHA_PDF, 2)]
    sources = _entree(racine)["sources"]
    assert sorted(sources) == sorted([premier, second.texte_sha256])  # type: ignore[arg-type]
    for texte, bloc in sources.items():  # type: ignore[union-attr]
        assert bloc["texte_sha256"] == texte and bloc["sha256"] == SHA_PDF


def test_cas_2_source_sans_archive_wayback_non_ecrite_et_nommee(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge, [ArchivageEchoue(motif="HTTP 520 sans instantané daté", tentatives=3)])
    _extraire(racine, horloge)
    [resultat] = preparer_tout(_deps(racine))
    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("SourceSansArchive : ")
    assert not (racine / chemin_entree(CLE_A, SHA_PDF)).exists()
    assert code_de_sortie([resultat]) == 1
    assert f"{'REFUSÉE'.ljust(16)}{CLE_A}/{SHA_PDF}  SourceSansArchive" in formater_rapport([resultat])


def test_cas_3_source_sans_fiche_d_extraction_sans_entree(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    assert preparer_tout(_deps(racine)) == [SansTexte(CLE_A, SHA_PDF)]
    assert not (racine / "staging" / "entrees-extraction").exists()


def test_cas_4_entree_identique_inchangee(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    _extraire(racine, horloge)
    preparer_tout(_deps(racine))
    chemin = racine / chemin_entree(CLE_A, SHA_PDF)
    avant = chemin.read_bytes()
    assert preparer_tout(_deps(racine)) == [DejaEcrite(CLE_A, SHA_PDF)]
    assert chemin.read_bytes() == avant


def test_cas_4_entree_differente_erreur_sans_ecrasement(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    _extraire(racine, horloge)
    preparer_tout(_deps(racine))
    chemin = racine / chemin_entree(CLE_A, SHA_PDF)
    alteree = chemin.read_bytes().replace(b'"candidat-a"', b'"candidat-z"')
    chemin.write_bytes(alteree)
    [resultat] = preparer_tout(_deps(racine))
    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("EntreeDivergente : ")
    assert chemin.read_bytes() == alteree


def test_cas_5_entree_non_conforme_rien_d_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    _extraire(racine, horloge)
    sans_version = _deps(racine, lambda type_contenu: en_service_fige(type_contenu)._replace(version=""))
    [resultat] = preparer_tout(sans_version)
    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("EntreeNonConforme : ")
    assert not (racine / "staging" / "entrees-extraction").exists()


def _chemin_fiche(racine: Path) -> Path:
    return racine / REPERTOIRE_FICHES / CLE_A / f"{SHA_PDF}.json"


def test_cas_18_fiche_de_source_sans_candidat_id_est_nommee(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    _extraire(racine, horloge)
    chemin = _chemin_fiche(racine)
    fiche = json.loads(chemin.read_text(encoding="utf-8"))
    del fiche["candidat_id"]
    chemin.write_text(json.dumps(fiche), encoding="utf-8")
    [resultat] = preparer_tout(_deps(racine))
    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("FicheSourceIllisible : ")
    assert str(chemin) in resultat.motif
    assert not (racine / "staging" / "entrees-extraction").exists()


def test_cas_18_fiche_de_source_illisible_est_nommee(racine: Path, horloge: HorlogeFactice) -> None:
    _collecter_pdf(racine, horloge)
    _extraire(racine, horloge)
    chemin = _chemin_fiche(racine)
    chemin.write_text("{ pas du json", encoding="utf-8")
    [resultat] = preparer_tout(_deps(racine))
    assert isinstance(resultat, Refusee)
    assert resultat.motif.startswith("FicheSourceIllisible : ")
    assert str(chemin) in resultat.motif


def _entree_valide() -> dict[str, object]:
    sha = "a" * 64
    return {
        "cle_source": "b" * 64,
        "sha256_source": sha,
        "candidat_id": "candidat-a",
        "extracteur_epingle": {"outil": "pymupdf", "version": "1.28.2", "options": {}},
        "sources": {"c" * 64: {"sha256": sha, "texte_sha256": "c" * 64}},
    }


@pytest.mark.parametrize(
    ("alteration", "motif"),
    [
        (lambda e: e.update(en_trop=1), "clés"),
        (lambda e: e.update(candidat_id="Candidat A"), "candidat_id"),
        (lambda e: e.update(sha256_source="abc"), "sha256_source"),
        (lambda e: e.update(sources={}), "au moins un bloc"),
        (lambda e: e["sources"]["c" * 64].update(page=2), "porte \\['page'\\]"),
        (lambda e: e["sources"]["c" * 64].update(texte_sha256="d" * 64), "ne nomme pas sa clé"),
        (lambda e: e["sources"]["c" * 64].update(sha256="d" * 64), "sha256 n'est pas"),
        (lambda e: e["extracteur_epingle"].pop("options"), "outil, version, options"),
    ],
)
def test_cas_5_chaque_ecart_au_schema_est_nomme(alteration, motif: str) -> None:
    entree = _entree_valide()
    exiger_conforme(entree)
    alteration(entree)
    with pytest.raises(EntreeNonConforme, match=motif):
        exiger_conforme(entree)

