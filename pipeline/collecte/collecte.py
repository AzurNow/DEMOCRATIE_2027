"""Orchestration d'un lot : chaque source est téléchargée, son contenu archivé une seule fois, et
chaque source reçoit sa fiche (`docs/CONTRATS.md` §5). Un échec n'arrête pas le lot ; il est nommé
dans le rapport et rend le code de sortie non nul.

Par source, selon le SHA-256 des octets reçus :
- contenu inconnu : archive, sauvegarde Wayback, manifeste de contenu, puis fiche ;
- contenu connu : fiche écrite si elle manque, archive et manifeste intacts ; et si le manifeste
  porte `echec_archivage` sans reprise, une nouvelle sauvegarde Wayback est tentée (reprise).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol

from pipeline.collecte.archivage import chemin_archive, ecrire_atomiquement, empreinte, extension_pour
from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.lien_archive import archive_url_de
from pipeline.collecte.media import GENRES_MEDIA
from pipeline.collecte.manifeste import (
    chemin_fiche,
    chemin_manifeste,
    chemin_reprise,
    construire_fiche,
    construire_manifeste,
    construire_reprise,
    serialiser,
)
from pipeline.collecte.politesse import EchecCollecte, Telechargement
from pipeline.collecte.sources import Source
from pipeline.collecte.wayback import ArchivageReussi, Archiveur, Resultat
from pipeline.liens.iri import IriInconvertible, iri_vers_uri


class Telechargeur(Protocol):
    def telecharger(self, url: str) -> Telechargement: ...


@dataclass(frozen=True)
class Dependances:
    client: Telechargeur
    archiveur: Archiveur
    horloge: Horloge
    racine: Path
    """Racine du dépôt : `archives/` et `staging/sources/` s'y trouvent, `chemin_local` y est relatif."""
    medias: Mapping[str, Telechargeur]
    """Un téléchargeur yt-dlp par `type_document` d'enregistrement (`media.GENRES_MEDIA`)."""


@dataclass(frozen=True)
class Collectee:
    url: str
    sha256: str
    chemin_local: str
    archive_url: str


@dataclass(frozen=True)
class ArchivageManque:
    """Archive locale et manifeste écrits, mais sans `archive_url` : la source ne pourra pas
    s'afficher (CLAUDE.md règle 2), et c'est voulu."""

    url: str
    sha256: str
    chemin_local: str
    motif: str


@dataclass(frozen=True)
class DejaCollectee:
    """La fiche de cette source pour ce contenu existait déjà : rien n'est écrit."""

    url: str
    sha256: str


@dataclass(frozen=True)
class FicheAjoutee:
    """Contenu déjà archivé par une autre source (ou par un lot interrompu) : seule la fiche de
    cette source est écrite. Ce n'est pas une erreur."""

    url: str
    sha256: str


@dataclass(frozen=True)
class ArchivageRepris:
    """Le manifeste portait `echec_archivage` ; la nouvelle sauvegarde a réussi et
    `staging/archivages/<sha256>.json` est écrit."""

    url: str
    sha256: str
    archive_url: str
    fiche_ajoutee: bool


@dataclass(frozen=True)
class RepriseManquee:
    """Nouvelle sauvegarde en échec : aucun fichier de reprise, la source reste sans archive_url."""

    url: str
    sha256: str
    motif: str
    fiche_ajoutee: bool


@dataclass(frozen=True)
class Refusee:
    """Ni archive, ni manifeste, ni fiche."""

    url: str
    motif: str


ResultatSource = (
    Collectee | ArchivageManque | DejaCollectee | FicheAjoutee | ArchivageRepris | RepriseManquee | Refusee
)
REUSSIS = (Collectee, DejaCollectee, FicheAjoutee, ArchivageRepris)


def _ecrire(deps: Dependances, chemin: PurePosixPath, contenu: dict[str, object]) -> None:
    ecrire_atomiquement(deps.racine / chemin, serialiser(contenu))


def _ecrire_fiche(
    source: Source, telechargement: Telechargement, sha256: str, date_collecte: str, deps: Dependances
) -> None:
    fiche = construire_fiche(source, telechargement.url_finale, sha256, date_collecte)
    _ecrire(deps, chemin_fiche(source, sha256), fiche)


def _resultat_ecrit(source: Source, sha256: str, chemin_local: str, archivage: Resultat) -> ResultatSource:
    if isinstance(archivage, ArchivageReussi):
        return Collectee(source.url, sha256, chemin_local, archivage.archive_url)
    return ArchivageManque(source.url, sha256, chemin_local, archivage.motif)


def _archiver_nouveau_contenu(
    source: Source, telechargement: Telechargement, sha256: str, date_collecte: str, uri: str, deps: Dependances
) -> ResultatSource:
    """Archive, Wayback, manifeste, puis fiche : la fiche vient en dernier, pour qu'une fiche
    n'existe jamais sans le manifeste qu'elle pointe. `uri` : l'URI envoyée à Save Page Now (D22) ;
    le manifeste garde `url_soumise` = `source.url`, jamais l'URI."""
    chemin_local = chemin_archive(sha256, extension_pour(telechargement.type_contenu))
    # Archive déjà présente sans manifeste (lot interrompu) : mêmes octets par construction.
    if not (deps.racine / chemin_local).exists():
        ecrire_atomiquement(deps.racine / chemin_local, telechargement.corps)
    archivage = deps.archiveur.sauvegarder(uri)
    manifeste = construire_manifeste(telechargement, sha256, chemin_local, date_collecte, source.url, archivage)
    _ecrire(deps, chemin_manifeste(sha256), manifeste)
    _ecrire_fiche(source, telechargement, sha256, date_collecte, deps)
    return _resultat_ecrit(source, sha256, str(chemin_local), archivage)


def _ecrire_fiche_si_absente(
    source: Source, telechargement: Telechargement, sha256: str, date_collecte: str, deps: Dependances
) -> bool:
    if (deps.racine / chemin_fiche(source, sha256)).exists():
        return False
    _ecrire_fiche(source, telechargement, sha256, date_collecte, deps)
    return True


def _reprendre_archivage(source: Source, sha256: str, fiche_ajoutee: bool, uri: str, deps: Dependances) -> ResultatSource:
    """N'est appelée que si les octets servis aujourd'hui ont le SHA-256 d'un manifeste en échec :
    un instantané pris maintenant correspond alors au document archivé."""
    archivage = deps.archiveur.sauvegarder(uri)
    if not isinstance(archivage, ArchivageReussi):
        return RepriseManquee(source.url, sha256, archivage.motif, fiche_ajoutee)
    date_reprise = instant_iso(deps.horloge.maintenant())
    _ecrire(deps, chemin_reprise(sha256), construire_reprise(sha256, date_reprise, source.url, archivage))
    return ArchivageRepris(source.url, sha256, archivage.archive_url, fiche_ajoutee)


def _consigner_contenu_connu(
    source: Source, telechargement: Telechargement, sha256: str, date_collecte: str, uri: str, deps: Dependances
) -> ResultatSource:
    fiche_ajoutee = _ecrire_fiche_si_absente(source, telechargement, sha256, date_collecte, deps)
    if archive_url_de(deps.racine, sha256) is None:
        return _reprendre_archivage(source, sha256, fiche_ajoutee, uri, deps)
    if fiche_ajoutee:
        return FicheAjoutee(source.url, sha256)
    return DejaCollectee(source.url, sha256)


def _consigner(
    source: Source, telechargement: Telechargement, date_collecte: str, uri: str, deps: Dependances
) -> ResultatSource:
    sha256 = empreinte(telechargement.corps)
    if (deps.racine / chemin_manifeste(sha256)).exists():
        return _consigner_contenu_connu(source, telechargement, sha256, date_collecte, uri, deps)
    return _archiver_nouveau_contenu(source, telechargement, sha256, date_collecte, uri, deps)


def _telechargeur(source: Source, deps: Dependances) -> Telechargeur:
    """Un enregistrement passe par yt-dlp, tout le reste par HTTP. Un téléchargeur de média manquant
    est une erreur de montage (KeyError), jamais un repli silencieux sur HTTP."""
    if source.type_document in GENRES_MEDIA:
        return deps.medias[source.type_document]
    return deps.client


def _uri_a_envoyer(url: str) -> str:
    """D22 : l'URI convertie pour l'envoi, comme `pipeline.preuve.traitement`. Une IRI inconvertible
    part telle quelle : la source échoue alors proprement au transport (`EchecCollecte`), jamais une
    exception qui arrête la collecte."""
    try:
        return iri_vers_uri(url)
    except IriInconvertible:
        return url


def collecter_source(source: Source, deps: Dependances) -> ResultatSource:
    uri = _uri_a_envoyer(source.url)
    try:
        telechargement = _telechargeur(source, deps).telecharger(uri)
    except EchecCollecte as echec:
        return Refusee(source.url, echec.motif)
    date_collecte = instant_iso(deps.horloge.maintenant())
    return _consigner(source, telechargement, date_collecte, uri, deps)


def collecter(sources: Sequence[Source], deps: Dependances) -> list[ResultatSource]:
    return [collecter_source(source, deps) for source in sources]


def code_de_sortie(resultats: Sequence[ResultatSource]) -> int:
    reussis = all(isinstance(resultat, REUSSIS) for resultat in resultats)
    return 0 if reussis else 1


# ----------------------------------------------------------------- rapport


LARGEUR_ETIQUETTE = 36


def _ligne(etiquette: str, reste: str) -> str:
    return f"{etiquette.ljust(LARGEUR_ETIQUETTE)}{reste}"


def _avec_fiche(etiquette: str, fiche_ajoutee: bool) -> str:
    return f"{etiquette}, fiche ajoutée" if fiche_ajoutee else etiquette


def _ligne_collectee(resultat: Collectee) -> str:
    return _ligne("collecté", f"{resultat.sha256}  {resultat.url}  → {resultat.archive_url}")


def _ligne_manque(resultat: ArchivageManque) -> str:
    return _ligne("ARCHIVAGE EN ÉCHEC", f"{resultat.sha256}  {resultat.url} : {resultat.motif}")


def _ligne_deja(resultat: DejaCollectee) -> str:
    return _ligne("déjà collectée", f"{resultat.sha256}  {resultat.url}")


def _ligne_fiche(resultat: FicheAjoutee) -> str:
    return _ligne("contenu déjà archivé, fiche ajoutée", f"{resultat.sha256}  {resultat.url}")


def _ligne_repris(resultat: ArchivageRepris) -> str:
    etiquette = _avec_fiche("archivage repris", resultat.fiche_ajoutee)
    return _ligne(etiquette, f"{resultat.sha256}  {resultat.url}  → {resultat.archive_url}")


def _ligne_reprise_manquee(resultat: RepriseManquee) -> str:
    etiquette = _avec_fiche("REPRISE D'ARCHIVAGE EN ÉCHEC", resultat.fiche_ajoutee)
    return _ligne(etiquette, f"{resultat.sha256}  {resultat.url} : {resultat.motif}")


def _ligne_refusee(resultat: Refusee) -> str:
    return _ligne("ÉCHEC", f"{resultat.url} : {resultat.motif}")


LIGNES: dict[type, Callable[..., str]] = {
    Collectee: _ligne_collectee,
    ArchivageManque: _ligne_manque,
    DejaCollectee: _ligne_deja,
    FicheAjoutee: _ligne_fiche,
    ArchivageRepris: _ligne_repris,
    RepriseManquee: _ligne_reprise_manquee,
    Refusee: _ligne_refusee,
}

LIBELLES_BILAN: dict[type, str] = {
    Collectee: "collecté(s)",
    DejaCollectee: "déjà collectée(s)",
    FicheAjoutee: "fiche(s) ajoutée(s) à un contenu déjà archivé",
    ArchivageRepris: "archivage(s) repris",
    ArchivageManque: "sans archive Wayback",
    RepriseManquee: "reprise(s) d'archivage en échec",
    Refusee: "échec(s)",
}


def formater_rapport(resultats: Sequence[ResultatSource]) -> str:
    lignes = [LIGNES[type(resultat)](resultat) for resultat in resultats]
    comptes = [
        f"{sum(isinstance(resultat, genre) for resultat in resultats)} {libelle}"
        for genre, libelle in LIBELLES_BILAN.items()
    ]
    return "\n".join([*lignes, f"bilan : {', '.join(comptes)}"])
