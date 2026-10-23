"""Texte canonique et fiche d'extraction (`docs/CONTRATS.md` §1 et §1.1), tous deux immuables.

- `staging/textes/<texte_sha256>.txt` : le texte, rangé sous sa propre empreinte ;
- `staging/extractions/<sha256_source>/<texte_sha256>.json` (`schema/extraction-texte.schema.json`) :
  le lien vers le document archivé, l'extracteur, sa version, ses options, et selon le cas les pages
  (PDF), l'encodage (HTML) ou l'empreinte du `.vtt` dont le texte est dérivé (audio et vidéo).

L'ordre des clés est fixé ici par construction ; la sérialisation est celle de `manifeste.serialiser`.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import NamedTuple

from pipeline.collecte.textes.canonique import TexteCanonique
from pipeline.collecte.textes.pages import Page

REPERTOIRE_TEXTES = PurePosixPath("staging", "textes")
REPERTOIRE_EXTRACTIONS = PurePosixPath("staging", "extractions")


@dataclass(frozen=True)
class Encodage:
    nom: str
    origine: str
    """`bom`, `content-type` ou `meta`."""


class Extracteur(NamedTuple):
    """L'extracteur qui produit un texte : outil, version exacte, options. Chaque module
    d'extraction (`pdf.py`, `page_html.py`, `transcription_vtt.py`) le décrit par une seule fonction
    `extracteur()`, qu'appellent à la fois son extraction et `en_service.extracteur_en_service` :
    l'extracteur inscrit dans une fiche et l'extracteur épinglé ne peuvent pas diverger."""

    outil: str
    version: str
    options: dict[str, object]


@dataclass(frozen=True)
class Extraction:
    """Ce qu'un extracteur rend : un texte canonique et de quoi le rejouer. Exactement un de
    `pages` (PDF), `encodage` (HTML) et `vtt_sha256` (audio et vidéo) est renseigné."""

    texte: TexteCanonique
    outil: str
    version: str
    options: dict[str, object]
    pages: tuple[Page, ...] | None = None
    encodage: Encodage | None = None
    vtt_sha256: str | None = None


def chemin_texte(texte_sha256: str) -> PurePosixPath:
    return REPERTOIRE_TEXTES / f"{texte_sha256}.txt"


def chemin_fiche_extraction(sha256_source: str, texte_sha256: str) -> PurePosixPath:
    return REPERTOIRE_EXTRACTIONS / sha256_source / f"{texte_sha256}.json"


def bloc_specifique(extraction: Extraction) -> dict[str, object]:
    """Le bloc propre au genre de l'extraction : pages (PDF), encodage (HTML) ou empreinte du
    `.vtt` d'origine (audio, vidéo). Partagée avec `pipeline/liens/textes.py`, qui n'extrait jamais
    de `vtt_sha256`, cette troisième branche ne change rien à son résultat."""
    if extraction.pages is not None:
        return {"pages": [{"numero": p.numero, "debut": p.debut, "fin": p.fin} for p in extraction.pages]}
    if extraction.encodage is not None:
        return {"encodage": {"nom": extraction.encodage.nom, "origine": extraction.encodage.origine}}
    if extraction.vtt_sha256 is not None:
        return {"vtt_sha256": extraction.vtt_sha256}
    raise ValueError(f"extraction {extraction.outil} sans pages, encodage ni vtt_sha256")


def construire_fiche_extraction(sha256_source: str, extraction: Extraction, date_extraction: str) -> dict[str, object]:
    return {
        "sha256_source": sha256_source,
        "texte_sha256": extraction.texte.sha256,
        "longueur": extraction.texte.longueur,
        "date_extraction": date_extraction,
        "extracteur": {"outil": extraction.outil, "version": extraction.version, "options": extraction.options},
        **bloc_specifique(extraction),
    }
