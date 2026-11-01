"""Copie locale d'un enregistrement audio ou vidéo par yt-dlp (sous-lot C3, décision D2).

Une source `enregistrement_video` ou `enregistrement_audio` pointe une page (plateforme vidéo, site
de radio) et non un fichier : yt-dlp y trouve les formats proposés et en télécharge un. Le reste de
la collecte est celui de C1 : SHA-256 des octets, archive sous `archives/`, sauvegarde Wayback de la
page listée, manifeste de contenu, fiche de source.

Un seul fichier, jamais une fusion (décision de l'auteur du 2026-09-24) : pas de ffmpeg système,
aucun post-traitement, aucune correction du conteneur (`fixup: never`), pour que l'archive soit
exactement les octets servis (CLAUDE.md règle 7).

- vidéo : le meilleur format qui porte **déjà** l'image et le son ;
- audio : le meilleur flux audio seul.

« Meilleur » est l'ordre de yt-dlp : sa liste `formats` va du moins bon au meilleur, le dernier
format admissible est retenu. Un format sans codec déclaré n'est pas admissible (on ne suppose pas
qu'il contient le son), ni un format servi par fragments (HLS, DASH), qui se reconstitue et ne se
télécharge pas tel quel.

Politesse (§6, `politesse.py`) : `robots.txt` est vérifié sur l'URL de la page **avant** d'appeler
yt-dlp, puis yt-dlp attend le créneau de l'hôte dans la `Cadence` de la collecte (`ClientPoli.creneau`),
qui le compte sollicité jusqu'à la fin du téléchargement : yt-dlp 2026.8.19 ne dort pas avant sa
première requête (`_first_webpage_request`, extractor/common.py), qui suivrait sinon `robots.txt` sans
délai. Ensuite yt-dlp espace ses propres requêtes d'une seconde (`sleep_interval_requests`, entre
requêtes d'extraction ; `sleep_interval`, avant le téléchargement) et s'annonce avec le même
User-Agent que la collecte.

Le type de contenu consigné dans le manifeste (`type_contenu_recu`) n'est pas un en-tête HTTP ici :
yt-dlp n'en expose pas. C'est le type du conteneur du format retenu, lu dans une table fermée
(`TYPES_MEDIA`) ; un conteneur absent de la table est un échec, jamais une supposition.
"""

from __future__ import annotations

import tempfile
from collections.abc import Callable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from pipeline.collecte.archivage import REPERTOIRE_ARCHIVES
from pipeline.collecte.politesse import AGENT_UTILISATEUR, INTERVALLE_PAR_HOTE_S, ClientPoli, EchecCollecte, Telechargement

GENRE_AUDIO = "audio"
GENRE_VIDEO = "video"
GENRES_MEDIA: dict[str, str] = {
    "enregistrement_audio": GENRE_AUDIO,
    "enregistrement_video": GENRE_VIDEO,
}
"""`type_document` d'une source → genre de média à télécharger. Tout autre type passe par HTTP (C1)."""

TYPES_MEDIA: dict[tuple[str, str], str] = {
    (GENRE_VIDEO, "mp4"): "video/mp4",
    (GENRE_VIDEO, "webm"): "video/webm",
    (GENRE_AUDIO, "m4a"): "audio/mp4",
    (GENRE_AUDIO, "mp3"): "audio/mpeg",
    (GENRE_AUDIO, "webm"): "audio/webm",
    (GENRE_AUDIO, "ogg"): "audio/ogg",
    (GENRE_AUDIO, "opus"): "audio/ogg",
}
"""Table fermée (genre, extension du conteneur) → type consigné. Chaque type a son extension
d'archive dans `archivage.EXTENSIONS`."""

NOMS_GENRES = {GENRE_VIDEO: "vidéo", GENRE_AUDIO: "audio"}
PROTOCOLES_DIRECTS = frozenset({"http", "https"})
SANS_CODEC = "none"
DELAI_S = 30.0
REPERTOIRE_TEMPORAIRE = ".telechargements"


class FormatRefuse(Exception):
    """Aucun format proposé ne se télécharge en un seul fichier du genre voulu."""


class EchecMedia(Exception):
    """yt-dlp n'a pas rendu de fichier : page introuvable, format refusé, réseau, etc."""


@dataclass(frozen=True)
class MediaTelecharge:
    chemin: Path
    url_page: str
    """`webpage_url` rendue par yt-dlp : la page qui a servi le média, après redirections."""
    ext: str


class ExtracteurMedia(Protocol):
    def telecharger(self, url: str, genre: str, repertoire: Path) -> MediaTelecharge: ...


# ----------------------------------------------------------------- choix du format


def _codec(format_propose: Mapping[str, object], cle: str) -> str | None:
    """Codec déclaré, `none` compris ; `None` quand yt-dlp n'en dit rien."""
    valeur = format_propose.get(cle)
    return valeur if isinstance(valeur, str) and valeur else None


def _fichier_unique(format_propose: Mapping[str, object]) -> bool:
    return "requested_formats" not in format_propose and format_propose.get("protocol") in PROTOCOLES_DIRECTS


def _image_et_son(format_propose: Mapping[str, object]) -> bool:
    video, audio = _codec(format_propose, "vcodec"), _codec(format_propose, "acodec")
    return video not in (None, SANS_CODEC) and audio not in (None, SANS_CODEC)


def _son_seul(format_propose: Mapping[str, object]) -> bool:
    return _codec(format_propose, "vcodec") == SANS_CODEC and _codec(format_propose, "acodec") not in (None, SANS_CODEC)


ADMISSIBLES: dict[str, tuple[Callable[[Mapping[str, object]], bool], str]] = {
    GENRE_VIDEO: (_image_et_son, "aucun format vidéo déjà fusionné (image et son) en un seul fichier"),
    GENRE_AUDIO: (_son_seul, "aucun flux audio seul en un seul fichier"),
}


def choisir_format(formats: Sequence[Mapping[str, object]], genre: str) -> Mapping[str, object]:
    admissible, motif = ADMISSIBLES[genre]
    retenus = [f for f in formats if _fichier_unique(f) and admissible(f)]
    if not retenus:
        raise FormatRefuse(f"{motif} parmi {len(formats)} format(s) proposé(s) ; aucune fusion n'est faite")
    return retenus[-1]


def _selecteur(genre: str) -> Callable[[Mapping[str, object]], Iterator[Mapping[str, object]]]:
    def selectionner(contexte: Mapping[str, object]) -> Iterator[Mapping[str, object]]:
        yield choisir_format(contexte["formats"], genre)  # type: ignore[arg-type]

    return selectionner


def options_yt_dlp(genre: str, repertoire: Path) -> dict[str, object]:
    return {
        "format": _selecteur(genre),
        "paths": {"home": str(repertoire), "temp": str(repertoire)},
        "outtmpl": {"default": "media.%(ext)s"},
        "noplaylist": True,
        "overwrites": False,
        "fixup": "never",
        "postprocessors": [],
        "sleep_interval_requests": INTERVALLE_PAR_HOTE_S,
        "sleep_interval": INTERVALLE_PAR_HOTE_S,
        "http_headers": {"User-Agent": AGENT_UTILISATEUR},
        "socket_timeout": DELAI_S,
        "quiet": True,
        "noprogress": True,
    }


# ----------------------------------------------------------------- yt-dlp réel


def lire_resultat_yt_dlp(info: Mapping[str, object], repertoire: Path) -> MediaTelecharge:
    telecharges = info.get("requested_downloads")
    fichiers = sorted(chemin for chemin in repertoire.iterdir() if chemin.is_file())
    if not isinstance(telecharges, list) or len(telecharges) != 1 or len(fichiers) != 1:
        raise EchecMedia(f"yt-dlp devait rendre un seul fichier, il en a rendu {len(fichiers)}")
    url_page, ext = info.get("webpage_url"), info.get("ext")
    if not isinstance(url_page, str) or not isinstance(ext, str):
        raise EchecMedia("yt-dlp n'a rendu ni l'URL de la page ni l'extension du fichier")
    return MediaTelecharge(fichiers[0], url_page, ext)


class YtDlp:
    """Le vrai yt-dlp. Jamais appelé par les tests : aucun test ne télécharge."""

    def telecharger(self, url: str, genre: str, repertoire: Path) -> MediaTelecharge:
        import yt_dlp

        try:
            with yt_dlp.YoutubeDL(options_yt_dlp(genre, repertoire)) as client:  # type: ignore[arg-type]
                info = client.extract_info(url, download=True)
        except FormatRefuse as refus:
            raise EchecMedia(f"format refusé : {refus}") from None
        except yt_dlp.utils.YoutubeDLError as erreur:
            raise EchecMedia(f"yt-dlp : {erreur}") from None
        return lire_resultat_yt_dlp(info, repertoire)


# ----------------------------------------------------------------- téléchargeur de la collecte


class TelechargeurMedia:
    """Même contrat que `ClientPoli.telecharger` : une URL listée, un `Telechargement`, ou `EchecCollecte`."""

    def __init__(self, client: ClientPoli, extracteur: ExtracteurMedia, genre: str, racine: Path) -> None:
        self._client = client
        self._extracteur = extracteur
        self._genre = genre
        self._temporaires = racine / REPERTOIRE_ARCHIVES / REPERTOIRE_TEMPORAIRE

    def _type(self, ext: str) -> str:
        if (self._genre, ext) not in TYPES_MEDIA:
            raise EchecCollecte(f"conteneur {NOMS_GENRES[self._genre]} non pris en charge : {ext}")
        return TYPES_MEDIA[(self._genre, ext)]

    def telecharger(self, url: str) -> Telechargement:
        self._client.verifier_robots(url)
        self._temporaires.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(dir=self._temporaires) as repertoire:
            try:
                with self._client.creneau(url):
                    media = self._extracteur.telecharger(url, self._genre, Path(repertoire))
            except EchecMedia as echec:
                raise EchecCollecte(str(echec)) from None
            type_contenu = self._type(media.ext)
            corps = media.chemin.read_bytes()
        if not corps:
            raise EchecCollecte("média vide (0 octet) : un document vide n'est pas une source")
        return Telechargement(url_finale=media.url_page, type_contenu=type_contenu, corps=corps)


def telechargeurs_media(client: ClientPoli, extracteur: ExtracteurMedia, racine: Path) -> dict[str, TelechargeurMedia]:
    """Un téléchargeur par `type_document` de média, tous sur le même client (même `robots.txt`, même cadence)."""
    return {
        type_document: TelechargeurMedia(client, extracteur, genre, racine)
        for type_document, genre in GENRES_MEDIA.items()
    }
