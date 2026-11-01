"""`pipeline/collecte/textes/epinglage.json`, lu par `textes/en_service.py` (décision D56 (3), §4).

Le fichier est la seule source de l'épinglage en service : Python le lit pour écrire les entrées de
`pnpm extraire`, et le TypeScript le relit pour refuser une entrée d'un autre épinglage
(`pipeline/extraction/epinglage-en-service.ts`, testé par `tests/extraction/epinglage-en-service.test.ts`
sur le même fichier). L'accord entre ce fichier et ce que chaque extracteur inscrit réellement dans
ses fiches est vérifié par `test_entrees_extraction.py` (extracteur en service = extracteur exécuté).
Aucun réseau.
"""

from __future__ import annotations

import json
import platform
from pathlib import Path

import pytest

from pipeline.collecte.sources import RACINE_DEPOT
from pipeline.collecte.textes.en_service import CHEMIN_EPINGLAGE, EpinglageIllisible, extracteur_en_service, lire_epinglage
from pipeline.collecte.textes.fiche import Extracteur

DECLARATION = {
    "pdf": {"outil": "pymupdf", "version": "1.28.2", "options": {"mode": "text", "drapeaux": 67, "separateur_pages": "\f"}},
    "html": {"outil": "html.parser", "version": "3.12.7", "options": {"regle": "blocs-1"}},
    "transcription": {"outil": "webvtt", "version": "3.12.7", "options": {"regle": "vtt-1"}},
}


def _ecrire(tmp_path: Path, contenu: object) -> Path:
    chemin = tmp_path / "epinglage.json"
    chemin.write_text(contenu if isinstance(contenu, str) else json.dumps(contenu), encoding="utf-8")
    return chemin


def test_le_fichier_lu_est_celui_du_depot_que_lit_aussi_le_typescript() -> None:
    assert CHEMIN_EPINGLAGE == RACINE_DEPOT / "pipeline" / "collecte" / "textes" / "epinglage.json"
    assert set(json.loads(CHEMIN_EPINGLAGE.read_text(encoding="utf-8"))) == {"pdf", "html", "transcription"}


def test_l_epinglage_en_service_vient_du_fichier_et_non_de_la_version_installee(tmp_path: Path) -> None:
    # pymupdf monté dans le fichier, pas encore installé : c'est le fichier qui dit ce qui est en service.
    monte = {**DECLARATION, "pdf": {**DECLARATION["pdf"], "version": "1.29.0"}}
    chemin = _ecrire(tmp_path, monte)
    assert extracteur_en_service("application/pdf", chemin) == Extracteur("pymupdf", "1.29.0", monte["pdf"]["options"])


def test_la_version_de_html_parser_et_webvtt_est_celle_du_python_qui_execute() -> None:
    # Épinglée en clair, égale au correctif de `.python-version` : lancé sous un autre correctif,
    # ce test échoue, comme échouerait le choix des fiches que ce Python écrirait.
    lus = lire_epinglage()
    assert lus["html"].version == platform.python_version()
    assert lus["transcription"].version == platform.python_version()
    assert (RACINE_DEPOT / ".python-version").read_text(encoding="utf-8").strip() == platform.python_version()


def test_la_version_d_html_parser_se_lit_dans_le_fichier_et_non_sur_l_interpreteur(tmp_path: Path) -> None:
    chemin = _ecrire(tmp_path, DECLARATION)
    assert extracteur_en_service("text/html; charset=utf-8", chemin) == Extracteur("html.parser", "3.12.7", {"regle": "blocs-1"})
    assert extracteur_en_service("video/mp4", chemin) == Extracteur("webvtt", "3.12.7", {"regle": "vtt-1"})


def test_lire_epinglage_rend_un_extracteur_par_genre(tmp_path: Path) -> None:
    lus = lire_epinglage(_ecrire(tmp_path, DECLARATION))
    assert set(lus) == {"pdf", "html", "transcription"}
    assert lus["pdf"] == Extracteur("pymupdf", "1.28.2", DECLARATION["pdf"]["options"])


def test_fichier_d_epinglage_absent_refus_nomme(tmp_path: Path) -> None:
    with pytest.raises(EpinglageIllisible, match="absent"):
        extracteur_en_service("application/pdf", tmp_path / "absent.json")


def test_fichier_d_epinglage_qui_n_est_pas_du_json_refus_nomme(tmp_path: Path) -> None:
    with pytest.raises(EpinglageIllisible, match="JSON"):
        extracteur_en_service("application/pdf", _ecrire(tmp_path, "{ pas du json"))


@pytest.mark.parametrize(
    ("nom", "contenu"),
    [
        ("liste", []),
        ("genre manquant", {k: v for k, v in DECLARATION.items() if k != "transcription"}),
        ("genre en trop", {**DECLARATION, "image": DECLARATION["pdf"]}),
        ("clé en trop", {**DECLARATION, "pdf": {**DECLARATION["pdf"], "note": "x"}}),
        ("outil vide", {**DECLARATION, "pdf": {**DECLARATION["pdf"], "outil": ""}}),
        ("version vide", {**DECLARATION, "pdf": {**DECLARATION["pdf"], "version": ""}}),
        ("version absente", {**DECLARATION, "pdf": {"outil": "pymupdf", "options": {}}}),
        ("forme interpréteur retirée", {**DECLARATION, "html": {**DECLARATION["html"], "version": {"interpreteur": "python"}}}),
        ("version non chaîne", {**DECLARATION, "pdf": {**DECLARATION["pdf"], "version": 1.28}}),
        ("options non objet", {**DECLARATION, "html": {**DECLARATION["html"], "options": ["blocs-1"]}}),
    ],
)
def test_fichier_d_epinglage_non_conforme_refus_nomme(tmp_path: Path, nom: str, contenu: object) -> None:
    with pytest.raises(EpinglageIllisible, match="non conforme"):
        lire_epinglage(_ecrire(tmp_path, contenu))
