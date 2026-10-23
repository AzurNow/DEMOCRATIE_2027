"""Texte des copies conservées par le test des liens (D27 (E)) : `pipeline/liens/textes.py`.

Les extracteurs sont les vrais (`html.parser`, `pymupdf`) ; les PDF sont fabriqués par pymupdf, aucun
fichier binaire au dépôt, aucun réseau. Les fiches écrites sont validées contre leur schéma côté
TypeScript (`tests/liens/extraction-page-lien.test.ts`, sur les fichiers dorés de `dore-textes/`).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pymupdf
import pytest

from pipeline.collecte.textes.canonique import TexteCanonique
from pipeline.collecte.textes.fiche import Extraction as ExtractionFiche
from pipeline.collecte.textes.page_html import extraire_html
from pipeline.collecte.textes.pdf import extraire_pdf
from pipeline.liens import textes
from pipeline.liens.textes import (
    DejaExtrait,
    Dependances,
    EnErreur,
    Extrait,
    Refuse,
    chemin_fiche,
    chemin_texte,
    code_de_sortie,
    extraire_tout,
    principal,
)
from tests.collecte.banc_textes import extracteur_html_fige, extracteur_pdf_factice
from tests.collecte.doubles import HorlogeFactice

HTML = "<html><body><h1>Programme</h1><p>Le candidat propose la mesure.</p></body></html>".encode()
ARCHIVE = "https://web.archive.org/web/20261101000000/https://exemple.invalid/b"


def _pdf(texte: str) -> bytes:
    document = pymupdf.open()
    document.new_page().insert_text((72, 72), texte)
    octets = document.tobytes()
    document.close()
    return octets


def _sha(octets: bytes) -> str:
    return hashlib.sha256(octets).hexdigest()


def _poser_copie(liens: Path, octets: bytes, extension: str) -> tuple[str, str]:
    sha = _sha(octets)
    chemin = f"pages/{sha}{extension}"
    (liens / "pages").mkdir(parents=True, exist_ok=True)
    (liens / chemin).write_bytes(octets)
    return sha, chemin


def _ecrire(liens: Path, nom: str, resultat: dict[str, object]) -> None:
    liens.mkdir(parents=True, exist_ok=True)
    (liens / f"{nom}.json").write_text(json.dumps(resultat), encoding="utf-8")


def _existe(liens: Path, nom: str, octets: bytes, extension: str, type_contenu: str | None) -> str:
    sha, chemin = _poser_copie(liens, octets, extension)
    _ecrire(liens, nom, {
        "url_citee": f"https://exemple.invalid/{nom}",
        "verdict_existence": "existe",
        "sha256_contenu": sha,
        "page": {"chemin": chemin, "type_contenu_recu": type_contenu, "taille_octets": len(octets)},
        "wayback": {"operation": "wayback_save_page_now", "issue": "echec", "motif": "x", "tentatives": 1},
    })
    return sha


def _instantane(liens: Path, nom: str, octets: bytes) -> str:
    sha, chemin = _poser_copie(liens, octets, ".html")
    _ecrire(liens, nom, {
        "url_citee": f"https://exemple.invalid/{nom}",
        "verdict_existence": "inaccessible",
        "sha256_contenu": sha,
        "archive_url": ARCHIVE,
        "wayback": {
            "operation": "recherche_instantane",
            "issue": "trouve",
            "telechargement": {"issue": "reussi", "chemin": chemin, "type_contenu_recu": "text/html; charset=utf-8", "taille_octets": len(octets)},
        },
    })
    return sha


def _mort(liens: Path, nom: str) -> None:
    _ecrire(liens, nom, {"url_citee": f"https://exemple.invalid/{nom}", "verdict_existence": "mort", "wayback": {"operation": "aucune"}})


@pytest.fixture
def liens(tmp_path: Path) -> Path:
    return tmp_path / "run" / "volume" / "liens"


@pytest.fixture
def deps() -> Dependances:
    return Dependances(HorlogeFactice(), extraire_pdf, extraire_html)


def _fiche(liens: Path, sha: str) -> dict[str, object]:
    return json.loads((liens / chemin_fiche(sha)).read_text(encoding="utf-8"))


def test_page_html_existante_texte_et_fiche(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Extrait)
    fiche = _fiche(liens, sha)
    assert fiche["issue"] == "extrait"
    assert fiche["extracteur"]["outil"] == "html.parser"  # type: ignore[index]
    assert fiche["encodage"] == {"nom": "utf-8", "origine": "content-type"}
    texte = (liens / chemin_texte(str(fiche["texte_sha256"]))).read_text(encoding="utf-8")
    assert texte == "Programme\nLe candidat propose la mesure."
    assert fiche["longueur"] == len(texte)


def test_page_pdf_existante(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "pdf", _pdf("Programme commun"), ".pdf", "application/pdf")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Extrait) and resultat.outil == "pymupdf"
    fiche = _fiche(liens, sha)
    assert "pages" in fiche
    assert "Programme commun" in (liens / chemin_texte(str(fiche["texte_sha256"]))).read_text(encoding="utf-8")


def test_copie_archivee_d21(liens: Path, deps: Dependances) -> None:
    sha = _instantane(liens, "b", HTML)
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Extrait)
    assert _fiche(liens, sha)["sha256_contenu"] == sha


def test_lien_mort_aucune_copie_rien_ecrit(liens: Path, deps: Dependances) -> None:
    _mort(liens, "mort")
    assert extraire_tout(liens, deps) == []
    assert not (liens / "extractions").exists()


def test_type_sans_extracteur_refus_consigne(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "img", b"\x89PNG", ".png", "image/png")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Refuse)
    assert _fiche(liens, sha) == {"sha256_contenu": sha, "issue": "refuse", "motif": "type de contenu non pris en charge : image/png", "date_extraction": _fiche(liens, sha)["date_extraction"]}
    assert code_de_sortie([resultat]) == 0


def test_content_type_absent_refus_jamais_devine(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "sans-type", HTML, ".bin", None)
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Refuse)
    assert "jamais deviné" in str(_fiche(liens, sha)["motif"])


def test_encodage_non_declare_refus_consigne(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "sans-charset", HTML, ".html", "text/html")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, Refuse)
    assert "encodage" in str(_fiche(liens, sha)["motif"])


def test_copie_alteree_erreur_rien_ecrit(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    (liens / f"pages/{sha}.html").write_bytes(b"autre chose")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, EnErreur)
    assert not (liens / chemin_fiche(sha)).exists()
    assert code_de_sortie([resultat]) == 1


def test_copie_absente_erreur(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    (liens / f"pages/{sha}.html").unlink()
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, EnErreur)


def test_texte_existant_altere_empreinte_de_la_copie_et_motif_nomme_le_texte(liens: Path, deps: Dependances) -> None:
    """`EnErreur.sha256_contenu` est toujours l'empreinte de la copie (constat 35 (b) du 2026-10-12),
    jamais celle du texte, que le motif nomme déjà via `chemin_texte(...)`."""
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    texte_attendu = "Programme\nLe candidat propose la mesure."
    texte_sha = _sha(texte_attendu.encode())
    chemin = liens / chemin_texte(texte_sha)
    chemin.parent.mkdir(parents=True, exist_ok=True)
    chemin.write_bytes(b"texte altere, different de l'extraction")
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, EnErreur)
    assert resultat.sha256_contenu == sha
    assert str(chemin_texte(texte_sha)) in resultat.motif
    assert not (liens / chemin_fiche(sha)).exists()


def test_relance_ne_reecrit_rien(liens: Path, deps: Dependances) -> None:
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    extraire_tout(liens, deps)
    avant = (liens / chemin_fiche(sha)).read_bytes()
    [resultat] = extraire_tout(liens, deps)
    assert isinstance(resultat, DejaExtrait)
    assert (liens / chemin_fiche(sha)).read_bytes() == avant


def test_deux_liens_meme_copie_une_seule_fiche(liens: Path, deps: Dependances) -> None:
    _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    _existe(liens, "a-bis", HTML, ".html", "text/html; charset=utf-8")
    assert len(extraire_tout(liens, deps)) == 1


def test_bloc_specifique_partage_avec_fiche_py() -> None:
    """Constat 35 (a) du 2026-10-12 : une seule définition de `_bloc_specifique`, pas une recopie
    de `pipeline/collecte/textes/fiche.py`."""
    from pipeline.collecte.textes import fiche

    assert textes._bloc_specifique is fiche.bloc_specifique


def _extracteur_vtt_factice(octets: bytes, type_contenu: str | None) -> ExtractionFiche:
    return ExtractionFiche(TexteCanonique("texte factice"), "factice", "1", {}, vtt_sha256="a" * 64)


def test_extraction_avec_vtt_sha256_refusee_rien_ecrit(liens: Path) -> None:
    """`schema/extraction-page-lien.schema.json` n'admet pas `vtt_sha256` (une page citée n'est ni
    audio ni vidéo) : une extraction qui en porte un ne doit jamais produire de fiche, même si un
    extracteur injecté en renvoie un par erreur."""
    deps_vtt = Dependances(HorlogeFactice(), extraire_pdf, _extracteur_vtt_factice)
    sha = _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    with pytest.raises(ValueError, match="vtt_sha256"):
        extraire_tout(liens, deps_vtt)
    assert not (liens / chemin_fiche(sha)).exists()
    assert not (liens / "textes").exists()


def test_resultat_avec_empreinte_sans_copie_refuse_le_passage(liens: Path, deps: Dependances) -> None:
    _ecrire(liens, "incoherent", {"url_citee": "x", "verdict_existence": "inaccessible", "sha256_contenu": "a" * 64, "wayback": {"operation": "aucune"}})
    with pytest.raises(textes.RepertoireRefuse):
        extraire_tout(liens, deps)


DORE = Path(__file__).resolve().parent / "dore-textes"


@pytest.mark.parametrize(
    ("dore", "octets", "extension", "type_contenu"),
    [
        ("extraction-html.json", HTML, ".html", "text/html; charset=utf-8"),
        ("extraction-pdf.json", b"%PDF-factice", ".pdf", "application/pdf"),
        ("extraction-refus.json", b"\x89PNG", ".png", "image/png"),
    ],
)
def test_fiches_dorees_reproduites_octet_pour_octet(liens: Path, dore: str, octets: bytes, extension: str, type_contenu: str) -> None:
    """Versions d'outil figées par `banc_textes` (le PDF réel est exercé plus haut) ; validées côté TS."""
    figees = Dependances(HorlogeFactice(), extracteur_pdf_factice, extracteur_html_fige)
    sha = _existe(liens, "a", octets, extension, type_contenu)
    extraire_tout(liens, figees)
    assert (liens / chemin_fiche(sha)).read_bytes() == (DORE / dore).read_bytes()


def test_principal_sans_test_des_liens_code_2(tmp_path: Path, deps: Dependances) -> None:
    assert principal([str(tmp_path / "run")], lambda: deps) == 2


def test_principal_code_0_et_rapport(liens: Path, deps: Dependances, capsys: pytest.CaptureFixture[str]) -> None:
    _existe(liens, "a", HTML, ".html", "text/html; charset=utf-8")
    assert principal([str(liens.parent.parent)], lambda: deps) == 0
    assert "extrait" in capsys.readouterr().out
