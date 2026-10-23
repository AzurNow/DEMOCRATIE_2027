"""Empreinte, chemin d'archive et écriture atomique (cas limites 3 et 14, écriture atomique)."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path, PurePosixPath

import pytest

from pipeline.collecte import archivage
from pipeline.collecte.archivage import (
    blocs_fichier,
    chemin_archive,
    ecrire_atomiquement,
    empreinte,
    empreinte_fichier,
    extension_pour,
)

BOM_CRLF = b"\xef\xbb\xbfLigne une\r\nLigne deux\r\n"


def test_empreinte_porte_sur_les_octets_exacts_avec_bom_et_crlf() -> None:
    attendu = hashlib.sha256(BOM_CRLF).hexdigest()

    assert empreinte(BOM_CRLF) == attendu
    assert empreinte(BOM_CRLF) != empreinte(BOM_CRLF.replace(b"\r\n", b"\n"))
    assert empreinte(BOM_CRLF) != empreinte(BOM_CRLF[3:])


def test_chemin_archive_est_relatif_et_reparti_par_prefixe() -> None:
    sha = "ab" + "0" * 62
    assert chemin_archive(sha, ".pdf") == PurePosixPath(f"archives/ab/{sha}.pdf")


@pytest.mark.parametrize(
    ("type_contenu", "extension"),
    [
        ("application/pdf", ".pdf"),
        ("text/html; charset=utf-8", ".html"),
        ("TEXT/HTML", ".html"),
        ("text/plain;charset=ISO-8859-1", ".txt"),
        ("audio/mpeg", ".mp3"),
        ("video/mp4", ".mp4"),
    ],
)
def test_extension_tiree_du_content_type_par_table_fermee(type_contenu: str, extension: str) -> None:
    assert extension_pour(type_contenu) == extension


def test_content_type_inconnu_donne_bin() -> None:
    assert extension_pour("application/x-format-maison") == ".bin"


def test_content_type_absent_donne_bin() -> None:
    assert extension_pour(None) == ".bin"


def test_ecriture_atomique_ecrit_les_octets_tels_quels(tmp_path: Path) -> None:
    cible = tmp_path / "a" / "b" / "fichier.txt"

    ecrire_atomiquement(cible, BOM_CRLF)

    assert cible.read_bytes() == BOM_CRLF
    assert list(cible.parent.iterdir()) == [cible]


def test_interruption_ne_laisse_rien_sous_le_nom_definitif(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    cible = tmp_path / "fichier.bin"

    def renommage_interrompu(_source: object, _destination: object) -> None:
        raise KeyboardInterrupt("interruption simulée")

    monkeypatch.setattr(archivage.os, "replace", renommage_interrompu)

    with pytest.raises(KeyboardInterrupt):
        ecrire_atomiquement(cible, b"contenu")

    assert not cible.exists()
    assert list(tmp_path.iterdir()) == []


def test_ecriture_atomique_refuse_d_ecraser(tmp_path: Path) -> None:
    cible = tmp_path / "fichier.bin"
    cible.write_bytes(b"original")

    with pytest.raises(FileExistsError):
        ecrire_atomiquement(cible, b"autre")

    assert cible.read_bytes() == b"original"
    assert os.listdir(tmp_path) == ["fichier.bin"]


# ------------------------------------------------------------------- constat 36 (2026-10-12)


def test_blocs_fichier_rend_les_octets_exacts_sur_plusieurs_blocs(tmp_path: Path) -> None:
    contenu = b"abcdefghij" * 5  # 50 octets, 4 blocs de 13 avec le découpage ci-dessous
    cible = tmp_path / "fichier.bin"
    cible.write_bytes(contenu)

    blocs = list(blocs_fichier(cible, taille_bloc=13))

    assert len(blocs) > 1
    assert b"".join(blocs) == contenu


def test_empreinte_fichier_egale_sha256_du_contenu_entier_sur_plusieurs_blocs(tmp_path: Path) -> None:
    contenu = os.urandom(10_000)
    cible = tmp_path / "fichier.bin"
    cible.write_bytes(contenu)

    assert empreinte_fichier(cible, taille_bloc=64) == empreinte(contenu)


def test_poids_et_transcription_partagent_blocs_fichier() -> None:
    """Constat 36 (2026-10-12) : une seule fonction de lecture par blocs, pas une par appelant."""
    from pipeline.collecte.transcription import poids, transcription

    assert poids.blocs_fichier is archivage.blocs_fichier
    assert transcription.empreinte_fichier is archivage.empreinte_fichier
