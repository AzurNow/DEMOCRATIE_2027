"""Texte des copies conservées par le test des liens (décision D27 (E) de l'auteur, 2026-10-09).

`uv run python -m pipeline.liens.textes <repertoire_du_run>` (ou `pnpm liens:textes <repertoire_du_run>`),
après `pnpm liens`, avant la notation.

La charge du juge v3 transmet le texte de chaque page citée (`pipeline/notation/pages-citees.ts`).
Ce passage le tire des copies que le test des liens a conservées sous `volume/liens/pages/` : la page
reçue pour un lien qui existe (`page`), la version brute de l'instantané téléchargée pour un lien
inaccessible ou non testable (`wayback.telechargement`, D21). Rien n'est demandé au réseau.

Les extracteurs sont ceux de la collecte, sans dépendance nouvelle : `html.parser` (règle de rendu
versionnée, `pipeline/collecte/textes/page_html.py`) et `pymupdf` (`pdf.py`). Le type se lit dans le
`Content-Type` reçu et consigné avec la copie, jamais deviné ; un type sans extracteur (image, audio,
vidéo, texte brut…), un encodage non déclaré ou un PDF illisible donnent un refus d'extraction. Un
refus est une donnée de la page : il est consigné, et la charge le dit (`extraction_refusee`).

Écrit, une fois, jamais réécrit :
- `volume/liens/textes/<texte_sha256>.txt` : le texte canonique (LF, NFC), UTF-8 sans BOM ;
- `volume/liens/extractions/<sha256_contenu>.json` (`schema/extraction-page-lien.schema.json`) : la
  fiche de la copie, qui dit par quel extracteur, dans quelle version et avec quelles options le
  texte a été tiré, ou pourquoi il ne l'a pas été.

Une copie déjà dotée de sa fiche n'est pas réextraite. Une copie absente ou dont les octets n'ont plus
leur empreinte n'est pas extraite et rien n'est écrit pour elle : c'est une erreur du volume, pas une
propriété de la page.

Codes de sortie : 0 si chaque copie a sa fiche (texte ou refus consigné) ; 1 si au moins une copie est
en erreur (absente, altérée, texte existant différent) ; 2 si le répertoire n'est pas celui d'un test
des liens.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from pipeline.collecte.archivage import ecrire_atomiquement, empreinte, type_media
from pipeline.collecte.horloge import Horloge, HorlogeSysteme, instant_iso
from pipeline.collecte.manifeste import serialiser
from pipeline.collecte.textes.extraction import GENRE_PDF, GENRES
from pipeline.collecte.textes.fiche import Extraction, bloc_specifique as _bloc_specifique
from pipeline.collecte.textes.refus import ExtractionRefusee

REPERTOIRE_EXTRACTIONS = "extractions"
REPERTOIRE_TEXTES = "textes"
CODE_PASSAGE_REFUSE = 2

ExtracteurPdf = Callable[[bytes], Extraction]
ExtracteurHtml = Callable[[bytes, str | None], Extraction]


@dataclass(frozen=True)
class Dependances:
    horloge: Horloge
    extraire_pdf: ExtracteurPdf
    extraire_html: ExtracteurHtml


@dataclass(frozen=True)
class Copie:
    """Une copie conservée : son empreinte, son chemin relatif à `volume/liens/`, son type reçu."""

    sha256: str
    chemin: str
    type_contenu: str | None


@dataclass(frozen=True)
class Extrait:
    sha256_contenu: str
    texte_sha256: str
    outil: str


@dataclass(frozen=True)
class Refuse:
    """L'extraction a été refusée ; le refus est consigné dans la fiche."""

    sha256_contenu: str
    motif: str


@dataclass(frozen=True)
class DejaExtrait:
    sha256_contenu: str


@dataclass(frozen=True)
class EnErreur:
    """Rien n'est écrit : la copie manque ou n'a plus son empreinte, ou un texte existant diffère."""

    sha256_contenu: str
    motif: str


Resultat = Extrait | Refuse | DejaExtrait | EnErreur
REUSSIS = (Extrait, Refuse, DejaExtrait)


class RepertoireRefuse(Exception):
    """Le répertoire n'est pas celui d'un test des liens passé."""


def chemin_fiche(sha256_contenu: str) -> PurePosixPath:
    return PurePosixPath(REPERTOIRE_EXTRACTIONS, f"{sha256_contenu}.json")


def chemin_texte(texte_sha256: str) -> PurePosixPath:
    return PurePosixPath(REPERTOIRE_TEXTES, f"{texte_sha256}.txt")


# ----------------------------------------------------------------- copies


def _source_de_la_copie(resultat: dict[str, object]) -> dict[str, object] | None:
    """`page` pour un lien qui existe (D20) ; `wayback.telechargement` réussi pour un instantané (D21)."""
    page = resultat.get("page")
    if isinstance(page, dict):
        return page
    wayback = resultat.get("wayback")
    telechargement = wayback.get("telechargement") if isinstance(wayback, dict) else None
    if isinstance(telechargement, dict) and telechargement.get("issue") == "reussi":
        return telechargement
    return None


def _copie_du_resultat(resultat: dict[str, object]) -> Copie | None:
    """La copie qu'un résultat déclare, ou `None` s'il n'en déclare aucune (pas de `sha256_contenu`)."""
    sha256 = resultat.get("sha256_contenu")
    if not isinstance(sha256, str):
        return None
    source = _source_de_la_copie(resultat)
    if source is None:
        raise RepertoireRefuse(f"résultat {resultat.get('url_citee')!r} : sha256_contenu sans copie conservée")
    type_contenu = source["type_contenu_recu"]
    return Copie(sha256, str(source["chemin"]), type_contenu if isinstance(type_contenu, str) else None)


def copies_conservees(repertoire_liens: Path) -> list[Copie]:
    """Les copies distinctes (par empreinte) que déclarent les résultats du test des liens, triées."""
    if not repertoire_liens.is_dir():
        raise RepertoireRefuse(f"{repertoire_liens} absent : lancer pnpm liens d'abord")
    copies: dict[str, Copie] = {}
    for chemin in sorted(repertoire_liens.glob("*.json")):
        copie = _copie_du_resultat(json.loads(chemin.read_text(encoding="utf-8")))
        if copie is not None:
            copies.setdefault(copie.sha256, copie)
    return [copies[sha] for sha in sorted(copies)]


# ----------------------------------------------------------------- extraction


def _genre(copie: Copie) -> str:
    if copie.type_contenu is None:
        raise ExtractionRefusee("aucun Content-Type reçu : type inconnu, jamais deviné")
    media = type_media(copie.type_contenu)
    if media not in GENRES:
        raise ExtractionRefusee(f"type de contenu non pris en charge : {copie.type_contenu}")
    return GENRES[media]


def _extraire(copie: Copie, octets: bytes, deps: Dependances) -> Extraction:
    if _genre(copie) == GENRE_PDF:
        return deps.extraire_pdf(octets)
    return deps.extraire_html(octets, copie.type_contenu)


def fiche_extraite(sha256_contenu: str, extraction: Extraction, date: str) -> dict[str, object]:
    return {
        "sha256_contenu": sha256_contenu,
        "issue": "extrait",
        "texte_sha256": extraction.texte.sha256,
        "longueur": extraction.texte.longueur,
        "date_extraction": date,
        "extracteur": {"outil": extraction.outil, "version": extraction.version, "options": extraction.options},
        **_bloc_specifique(extraction),
    }


def fiche_refusee(sha256_contenu: str, motif: str, date: str) -> dict[str, object]:
    return {"sha256_contenu": sha256_contenu, "issue": "refuse", "motif": motif, "date_extraction": date}


def _octets_verifies(copie: Copie, repertoire_liens: Path) -> bytes | EnErreur:
    chemin = repertoire_liens / copie.chemin
    if not chemin.is_file():
        return EnErreur(copie.sha256, f"copie absente : {copie.chemin}")
    octets = chemin.read_bytes()
    if empreinte(octets) != copie.sha256:
        return EnErreur(copie.sha256, f"copie altérée : {copie.chemin} n'a plus l'empreinte {copie.sha256}")
    return octets


def _ecrire_texte(sha256_contenu: str, extraction: Extraction, repertoire_liens: Path) -> EnErreur | None:
    chemin = repertoire_liens / chemin_texte(extraction.texte.sha256)
    if not chemin.exists():
        ecrire_atomiquement(chemin, extraction.texte.octets)
        return None
    if chemin.read_bytes() != extraction.texte.octets:
        return EnErreur(sha256_contenu, f"texte existant altéré : {chemin_texte(extraction.texte.sha256)}")
    return None


def extraire_copie(copie: Copie, repertoire_liens: Path, deps: Dependances) -> Resultat:
    """Le texte d'abord, la fiche ensuite : une fiche « extrait » n'existe jamais sans son texte."""
    fiche = repertoire_liens / chemin_fiche(copie.sha256)
    if fiche.exists():
        return DejaExtrait(copie.sha256)
    octets = _octets_verifies(copie, repertoire_liens)
    if isinstance(octets, EnErreur):
        return octets
    date = instant_iso(deps.horloge.maintenant())
    try:
        extraction = _extraire(copie, octets, deps)
    except ExtractionRefusee as refus:
        ecrire_atomiquement(fiche, serialiser(fiche_refusee(copie.sha256, refus.motif, date)))
        return Refuse(copie.sha256, refus.motif)
    erreur = _ecrire_texte(copie.sha256, extraction, repertoire_liens)
    if erreur is not None:
        return erreur
    ecrire_atomiquement(fiche, serialiser(fiche_extraite(copie.sha256, extraction, date)))
    return Extrait(copie.sha256, extraction.texte.sha256, extraction.outil)


def extraire_tout(repertoire_liens: Path, deps: Dependances) -> list[Resultat]:
    return [extraire_copie(copie, repertoire_liens, deps) for copie in copies_conservees(repertoire_liens)]


def code_de_sortie(resultats: Sequence[Resultat]) -> int:
    return 0 if all(isinstance(resultat, REUSSIS) for resultat in resultats) else 1


# ----------------------------------------------------------------- rapport

LARGEUR_ETIQUETTE = 16

LIGNES: dict[type, Callable[..., str]] = {
    Extrait: lambda r: f"{'extrait'.ljust(LARGEUR_ETIQUETTE)}{r.sha256_contenu}  → {r.texte_sha256} ({r.outil})",
    Refuse: lambda r: f"{'refus consigné'.ljust(LARGEUR_ETIQUETTE)}{r.sha256_contenu}  {r.motif}",
    DejaExtrait: lambda r: f"{'déjà extrait'.ljust(LARGEUR_ETIQUETTE)}{r.sha256_contenu}",
    EnErreur: lambda r: f"{'ERREUR'.ljust(LARGEUR_ETIQUETTE)}{r.sha256_contenu}  {r.motif}",
}


def formater_rapport(resultats: Sequence[Resultat]) -> str:
    comptes = ", ".join(f"{sum(isinstance(r, genre) for r in resultats)} {genre.__name__}" for genre in LIGNES)
    return "\n".join([*(LIGNES[type(r)](r) for r in resultats), f"bilan : {comptes}"])


# ----------------------------------------------------------------- commande


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.liens.textes",
        description="Extrait le texte des copies conservées par le test des liens (D27 (E)).",
    )
    analyseur.add_argument("repertoire_run", type=Path, help="runs/<date>, dont volume/liens/ a été écrit par pnpm liens")
    return analyseur.parse_args(list(arguments))


def dependances_reelles() -> Dependances:
    # Importés ici : pymupdf n'est chargé que pour un vrai passage.
    from pipeline.collecte.textes.page_html import extraire_html
    from pipeline.collecte.textes.pdf import extraire_pdf

    return Dependances(HorlogeSysteme(), extraire_pdf, extraire_html)


def principal(arguments: Sequence[str], construire: Callable[[], Dependances] = dependances_reelles) -> int:
    options = _arguments(arguments)
    repertoire_liens = options.repertoire_run / "volume" / "liens"
    try:
        resultats = extraire_tout(repertoire_liens, construire())
    except RepertoireRefuse as refus:
        print(f"passage refusé, rien n'est écrit — {refus}", file=sys.stderr)
        return CODE_PASSAGE_REFUSE
    print(formater_rapport(resultats))
    return code_de_sortie(resultats)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
