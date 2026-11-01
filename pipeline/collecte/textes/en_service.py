"""L'extracteur de texte que le code a en service pour un contenu (décisions D52 (4), option A du
2026-10-16, et D56 (3), option B).

L'extraction double ne lit que le texte produit par l'extracteur **épinglé par le code** (§4,
`pipeline/extraction/choix-texte.ts:choisirFiche`). Cet épinglage vit dans un seul fichier de
données versionné, `epinglage.json` à côté de ce module : un extracteur par genre de contenu (outil,
version, options). Python le lit ici pour écrire les entrées de `pnpm extraire` ; le TypeScript le
relit (`pipeline/extraction/epinglage-en-service.ts`) et refuse toute entrée d'un autre épinglage,
qu'une fiche plus récente existe ou non (D56 (3)).

La version d'un extracteur est soit écrite en clair (pymupdf, épinglé aussi par `uv.lock`), soit
`{"interpreteur": "python"}` : `html.parser` et `webvtt` n'ont d'autre version que celle de Python
qui les exécute, et aucun fichier du dépôt n'épingle le correctif de Python (`.python-version` dit
« 3.12 »). Elle se lit alors à l'exécution, comme dans les fiches. Conséquence voulue : un correctif
de Python différent entre `pnpm textes` et `pnpm extraction:entrees` rend un épinglage qu'aucune
fiche ne porte, et la source est refusée (`AucunTexteEpingle`), jamais repliée sur l'ancienne fiche.

Le fichier dit ce qui est en service ; chaque module (`pdf.py`, `page_html.py`,
`transcription_vtt.py`) inscrit dans ses fiches ce qu'il a réellement exécuté. Leur accord est testé
(`tests/collecte/test_entrees_extraction.py`) : une montée de pymupdf dans `uv.lock` sans mise à jour
de ce fichier fait échouer les tests, et à l'exécution ses fiches ne seraient jamais choisies.

`genre_de` (règle de genre de l'extraction) choisit l'entrée du fichier. Un fichier absent, qui
n'est pas du JSON ou dont la forme diffère lève `EpinglageIllisible` : aucune valeur de repli.
"""

from __future__ import annotations

import json
import platform
from pathlib import Path

from pipeline.collecte.textes.extraction import GENRE_HTML, GENRE_PDF, GENRE_TRANSCRIPTION, genre_de
from pipeline.collecte.textes.fiche import Extracteur

CHEMIN_EPINGLAGE = Path(__file__).resolve().with_name("epinglage.json")
GENRES_EPINGLES = frozenset({GENRE_PDF, GENRE_HTML, GENRE_TRANSCRIPTION})
CLES_DECLARATION = frozenset({"outil", "version", "options"})
VERSION_INTERPRETEUR = {"interpreteur": "python"}


class EpinglageIllisible(Exception):
    """`epinglage.json` absent, illisible ou non conforme : aucune entrée n'est écrite sur un épinglage deviné."""


def _non_conforme(chemin: Path, detail: str) -> EpinglageIllisible:
    return EpinglageIllisible(f"{chemin} : épinglage des extracteurs de texte non conforme ({detail}).")


def _version(chemin: Path, genre: str, version: object) -> str:
    if version == VERSION_INTERPRETEUR:
        return platform.python_version()
    if isinstance(version, str) and version != "":
        return version
    raise _non_conforme(chemin, f"{genre}.version doit être une chaîne non vide ou {json.dumps(VERSION_INTERPRETEUR)}")


def _extracteur(chemin: Path, genre: str, declaration: object) -> Extracteur:
    if not isinstance(declaration, dict) or set(declaration) != CLES_DECLARATION:
        raise _non_conforme(chemin, f"{genre} doit porter exactement {sorted(CLES_DECLARATION)}")
    outil, options = declaration["outil"], declaration["options"]
    if not isinstance(outil, str) or outil == "":
        raise _non_conforme(chemin, f"{genre}.outil doit être une chaîne non vide")
    if not isinstance(options, dict):
        raise _non_conforme(chemin, f"{genre}.options doit être un objet")
    return Extracteur(outil, _version(chemin, genre, declaration["version"]), options)


def _lire_json(chemin: Path) -> object:
    try:
        texte = chemin.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise EpinglageIllisible(f"{chemin} : épinglage des extracteurs de texte absent.") from None
    try:
        return json.loads(texte)
    except json.JSONDecodeError as erreur:
        raise EpinglageIllisible(f"{chemin} : JSON illisible ({erreur}).") from None


def lire_epinglage(chemin: Path = CHEMIN_EPINGLAGE) -> dict[str, Extracteur]:
    """L'extracteur en service de chaque genre, versions d'interpréteur résolues."""
    contenu = _lire_json(chemin)
    if not isinstance(contenu, dict) or set(contenu) != GENRES_EPINGLES:
        raise _non_conforme(chemin, f"un objet aux genres exactement {sorted(GENRES_EPINGLES)} est attendu")
    return {genre: _extracteur(chemin, genre, declaration) for genre, declaration in contenu.items()}


def extracteur_en_service(type_contenu: str | None, chemin: Path = CHEMIN_EPINGLAGE) -> Extracteur:
    """Lève `ExtractionRefusee` pour un type de contenu sans extracteur, comme l'extraction, et
    `EpinglageIllisible` si le fichier d'épinglage ne se lit pas."""
    genre = genre_de(type_contenu)
    return lire_epinglage(chemin)[genre]
