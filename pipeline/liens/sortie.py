"""Le fichier de résultat d'un lien testé : `volume/liens/<sha256 de l'URL citée>.json`, écrit une fois.

Forme : `schema/existence-lien.schema.json`. Les sept premiers champs sont ceux d'un lien de
notation (`ExistenceEtablie`, `schema/notation.schema.json#/properties/sourcage/properties/liens`) ;
suivent la version de la table, le journal des tentatives, la page conservée et l'issue Wayback.
L'ordre des clés est fixé ici, la sérialisation est déterministe (fichiers dorés de `tests/liens/dore/`).

Le nom du fichier est le SHA-256 de l'URL citée encodée en UTF-8, prise telle qu'écrite.

Les pages conservées (copies des liens qui existent, versions brutes des instantanés) vivent hors de
`volume/`, sous `runs/<date>/pages-citees/` (D75 (4)) : le volume part en entier sur Zenodo, et les
pages citées ne sont pas republiables (§9). Leur `chemin` est relatif au répertoire du run.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from pipeline.collecte.archivage import ecrire_atomiquement, empreinte, extension_pour
from pipeline.collecte.manifeste import serialiser
from pipeline.liens.constat import Constat
from pipeline.liens.schemas import ResultatNonConforme, verifier_resultat

REPERTOIRE_PAGES = "pages-citees"
"""Relatif au répertoire du run, hors de `volume/` (D75 (4)) ; ignoré par Git (`/runs/*/pages-citees/`)."""


def repertoire_liens(repertoire_run: Path) -> Path:
    """`<repertoire_run>/volume/liens`, où le test des liens écrit ses résultats."""
    return repertoire_run / "volume" / "liens"


@dataclass(frozen=True)
class Tentative:
    numero: int
    horodatage: str
    constat: Constat


@dataclass(frozen=True)
class Copie:
    """Ce qui est conservé d'un lien : la page (pour `existe`), l'issue Wayback, et l'empreinte de
    la copie conservée (page, ou version brute de l'instantané téléchargée, D21)."""

    wayback: dict[str, object]
    page: dict[str, object] | None = None
    sha256_contenu: str | None = None
    archive_url: str | None = None


def nom_resultat(url: str) -> str:
    return f"{hashlib.sha256(url.encode('utf-8')).hexdigest()}.json"


def conserver_page(repertoire_run: Path, constat: Constat) -> tuple[str, dict[str, object]]:
    """Écrit les octets reçus tels quels (règle 7) sous `<run>/pages-citees/<sha256><extension>`, une fois.

    Deux liens qui servent les mêmes octets avec le même type partagent le fichier : déjà présent,
    il n'est pas réécrit (son nom est son empreinte)."""
    if constat.corps is None:
        raise ValueError("page à conserver sans corps : constat incohérent")
    sha256 = empreinte(constat.corps)
    chemin = PurePosixPath(REPERTOIRE_PAGES, f"{sha256}{extension_pour(constat.type_contenu)}")
    cible = repertoire_run / chemin
    if not cible.exists():
        ecrire_atomiquement(cible, constat.corps)
    page: dict[str, object] = {
        "chemin": str(chemin),
        "type_contenu_recu": constat.type_contenu,
        "taille_octets": len(constat.corps),
    }
    return sha256, page


def _tentative(tentative: Tentative) -> dict[str, object]:
    entree: dict[str, object] = {
        "numero": tentative.numero,
        "horodatage": tentative.horodatage,
        "issue": tentative.constat.issue,
        "code_http": tentative.constat.code_http,
    }
    if tentative.constat.motif is not None:
        entree["motif"] = tentative.constat.motif
    return entree


def construire_resultat(
    url: str, verdict: str, tentatives: list[Tentative], version_table: str, copie: Copie
) -> dict[str, object]:
    finale = tentatives[-1].constat
    resultat: dict[str, object] = {"url_citee": url, "verdict_existence": verdict, "date_test": tentatives[-1].horodatage}
    if finale.url_finale is not None:
        resultat["url_finale"] = finale.url_finale
    resultat["code_http"] = finale.code_http
    if copie.sha256_contenu is not None:
        resultat["sha256_contenu"] = copie.sha256_contenu
    if copie.archive_url is not None:
        resultat["archive_url"] = copie.archive_url
    resultat["version_table"] = version_table
    resultat["tentatives"] = [_tentative(t) for t in tentatives]
    if copie.page is not None:
        resultat["page"] = copie.page
    resultat["wayback"] = copie.wayback
    return resultat


def ecrire_resultat(repertoire_liens: Path, resultat: dict[str, object]) -> Path:
    """Contrôle la forme, puis écrit une fois ; lève `ResultatNonConforme` ou `FileExistsError`."""
    verifier_resultat(resultat)
    chemin = repertoire_liens / nom_resultat(str(resultat["url_citee"]))
    ecrire_atomiquement(chemin, serialiser(resultat))
    return chemin


def lire_resultat(chemin: Path, url: str) -> dict[str, object]:
    """Relit un résultat déjà écrit (relance) ; lève `ResultatNonConforme` s'il ne concorde pas."""
    try:
        resultat = json.loads(chemin.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as erreur:
        raise ResultatNonConforme(f"{chemin} illisible : {erreur}") from erreur
    if not isinstance(resultat, dict) or resultat.get("url_citee") != url:
        raise ResultatNonConforme(f"{chemin} ne porte pas l'URL {url!r}")
    verifier_resultat(resultat)
    return resultat
