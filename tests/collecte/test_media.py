"""Copie locale des enregistrements audio et vidéo par yt-dlp (C3, cas limites 7 et 8).

yt-dlp est remplacé par un double : aucun test ne télécharge rien. Le sélecteur de format et les
options passées à yt-dlp sont des fonctions pures, testées directement. La collecte de bout en bout
passe par le vrai `collecter`, avec la même archive, le même manifeste et la même fiche que C1.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

import pytest

from pipeline.collecte.collecte import Collectee, Refusee, collecter
from pipeline.collecte.media import (
    EchecMedia,
    FormatRefuse,
    MediaTelecharge,
    TelechargeurMedia,
    choisir_format,
    lire_resultat_yt_dlp,
    options_yt_dlp,
)
from pipeline.collecte.politesse import AGENT_UTILISATEUR, INTERVALLE_PAR_HOTE_S, Cadence, ClientPoli, EchecCollecte
from tests.collecte.banc import INSTANTANE, banc, cle, fiche, manifeste, source
from tests.collecte.doubles import HorlogeFactice, TransportFactice, reponse

URL_VIDEO = "https://example.org/debat-2026"
URL_AUDIO = "https://example.org/radio/entretien"
PAGE_FINALE = "https://example.org/debat-2026?v=1"
VIDEO = b"\x00\x00\x00\x18ftypmp42 octets video \r\n\x00"
AUDIO = b"\x00\x00\x00\x18ftypM4A  octets audio"


def fmt(format_id: str, vcodec: str | None, acodec: str | None, protocol: str = "https", **autres: object) -> dict[str, object]:
    return {"format_id": format_id, "vcodec": vcodec, "acodec": acodec, "protocol": protocol, **autres}


# --------------------------------------------------------------------------- sélecteur de format


def test_video_meilleur_format_deja_fusionne_le_dernier_de_la_liste_triee() -> None:
    """yt-dlp trie `formats` du moins bon au meilleur : le dernier format admissible est retenu."""
    formats = [
        fmt("18", "avc1", "mp4a"),
        fmt("137", "avc1", "none"),
        fmt("140", "none", "mp4a"),
        fmt("22", "avc1", "mp4a"),
        fmt("hls-720", "avc1", "mp4a", protocol="m3u8_native"),
    ]
    assert choisir_format(formats, "video")["format_id"] == "22"


def test_video_seulement_des_flux_separes_refus_car_il_faudrait_fusionner() -> None:
    formats = [fmt("137", "avc1", "none"), fmt("140", "none", "mp4a")]
    with pytest.raises(FormatRefuse, match="aucun format vidéo déjà fusionné"):
        choisir_format(formats, "video")


def test_format_fusionne_par_yt_dlp_refuse() -> None:
    """Un format synthétique `137+140` porte `requested_formats` : il exigerait ffmpeg."""
    fusion = fmt("137+140", "avc1", "mp4a", requested_formats=[fmt("137", "avc1", "none"), fmt("140", "none", "mp4a")])
    with pytest.raises(FormatRefuse):
        choisir_format([fusion], "video")


def test_codecs_inconnus_refuses_jamais_supposes() -> None:
    formats = [fmt("a", None, None), fmt("b", "avc1", None), {"format_id": "c", "protocol": "https"}]
    with pytest.raises(FormatRefuse):
        choisir_format(formats, "video")


def test_audio_meilleur_flux_audio_seul() -> None:
    formats = [fmt("249", "none", "opus"), fmt("18", "avc1", "mp4a"), fmt("140", "none", "mp4a"), fmt("137", "avc1", "none")]
    assert choisir_format(formats, "audio")["format_id"] == "140"


def test_audio_sans_flux_audio_seul_refus() -> None:
    with pytest.raises(FormatRefuse, match="aucun flux audio seul"):
        choisir_format([fmt("18", "avc1", "mp4a")], "audio")


def test_options_yt_dlp_polies_sans_fusion_ni_post_traitement(tmp_path: Path) -> None:
    options = options_yt_dlp("video", tmp_path)
    assert INTERVALLE_PAR_HOTE_S == 1.0  # §6 : une requête par seconde et par hôte
    assert options["sleep_interval_requests"] == INTERVALLE_PAR_HOTE_S
    assert options["sleep_interval"] == INTERVALLE_PAR_HOTE_S
    assert options["http_headers"] == {"User-Agent": AGENT_UTILISATEUR}
    assert options["fixup"] == "never"
    assert options["postprocessors"] == []
    assert options["noplaylist"] is True
    assert options["overwrites"] is False
    assert options["paths"] == {"home": str(tmp_path), "temp": str(tmp_path)}
    assert "merge_output_format" not in options
    selecteur = options["format"]
    assert callable(selecteur)
    formats = [fmt("137", "avc1", "none"), fmt("18", "avc1", "mp4a")]
    assert [f["format_id"] for f in selecteur({"formats": formats})] == ["18"]


# --------------------------------------------------------------------------- téléchargeur


@dataclass
class YtDlpFactice:
    octets: bytes = VIDEO
    ext: str = "mp4"
    erreur: EchecMedia | None = None
    horloge: HorlogeFactice | None = None
    appels: list[tuple[str, str]] = field(default_factory=list)
    instants: list[float] = field(default_factory=list)
    """Temps monotone au départ de chaque appel, quand une horloge est donnée."""

    def telecharger(self, url: str, genre: str, repertoire: Path) -> MediaTelecharge:
        self.appels.append((url, genre))
        if self.horloge is not None:
            self.instants.append(self.horloge.monotone())
        if self.erreur is not None:
            raise self.erreur
        chemin = repertoire / f"media.{self.ext}"
        chemin.write_bytes(self.octets)
        return MediaTelecharge(chemin=chemin, url_page=PAGE_FINALE, ext=self.ext)


def _client(horloge: HorlogeFactice, robots: bytes = b"User-agent: *\nAllow: /\n") -> ClientPoli:
    transport = TransportFactice(horloge, {"https://example.org/robots.txt": reponse(200, robots)})
    return ClientPoli(transport, Cadence(horloge, 1.0))


def test_media_telecharge_rendu_comme_un_telechargement(racine: Path, horloge: HorlogeFactice) -> None:
    ytdlp = YtDlpFactice()
    telechargeur = TelechargeurMedia(_client(horloge), ytdlp, "video", racine)

    telechargement = telechargeur.telecharger(URL_VIDEO)

    assert telechargement.corps == VIDEO
    assert telechargement.type_contenu == "video/mp4"
    assert telechargement.url_finale == PAGE_FINALE
    assert ytdlp.appels == [(URL_VIDEO, "video")]
    assert not any((racine / "archives").rglob("*.mp4"))  # le répertoire temporaire est vidé


def _client_et_transport(horloge: HorlogeFactice) -> tuple[ClientPoli, TransportFactice]:
    transport = TransportFactice(horloge, {"https://example.org/robots.txt": reponse(200, b"User-agent: *\nAllow: /\n")})
    return ClientPoli(transport, Cadence(horloge, INTERVALLE_PAR_HOTE_S)), transport


def test_yt_dlp_ne_part_pas_avant_le_creneau_de_l_hote_apres_robots_txt(racine: Path, horloge: HorlogeFactice) -> None:
    # Constat 31 du 2026-10-12 : yt-dlp ne dort pas avant sa première requête (`_first_webpage_request`).
    client, transport = _client_et_transport(horloge)
    ytdlp = YtDlpFactice(horloge=horloge)

    TelechargeurMedia(client, ytdlp, "video", racine).telecharger(URL_VIDEO)

    [(url_robots, instant_robots, _en_tetes)] = transport.requetes
    assert url_robots == "https://example.org/robots.txt"
    assert ytdlp.instants == [instant_robots + INTERVALLE_PAR_HOTE_S]
    assert horloge.sommeils == [INTERVALLE_PAR_HOTE_S]


def test_deux_medias_du_meme_hote_le_second_yt_dlp_attend_la_fin_du_premier(racine: Path, horloge: HorlogeFactice) -> None:
    client, _transport = _client_et_transport(horloge)
    ytdlp = YtDlpFactice(horloge=horloge)
    telechargeur = TelechargeurMedia(client, ytdlp, "video", racine)

    telechargeur.telecharger(URL_VIDEO)
    horloge.temps += 0.25  # le premier yt-dlp a fini depuis 0,25 s
    telechargeur.telecharger(URL_VIDEO)

    assert ytdlp.instants[1] - ytdlp.instants[0] == INTERVALLE_PAR_HOTE_S


def test_echec_yt_dlp_le_creneau_de_l_hote_est_tout_de_meme_consomme(racine: Path, horloge: HorlogeFactice) -> None:
    client, _transport = _client_et_transport(horloge)
    en_echec = YtDlpFactice(erreur=EchecMedia("yt-dlp : ERROR: Video unavailable"), horloge=horloge)
    with pytest.raises(EchecCollecte):
        TelechargeurMedia(client, en_echec, "video", racine).telecharger(URL_VIDEO)

    ytdlp = YtDlpFactice(horloge=horloge)
    TelechargeurMedia(client, ytdlp, "video", racine).telecharger(URL_VIDEO)

    assert ytdlp.instants == [en_echec.instants[0] + INTERVALLE_PAR_HOTE_S]


def test_robots_txt_interdit_refus_avant_yt_dlp(racine: Path, horloge: HorlogeFactice) -> None:
    ytdlp = YtDlpFactice()
    telechargeur = TelechargeurMedia(_client(horloge, b"User-agent: *\nDisallow: /\n"), ytdlp, "video", racine)

    with pytest.raises(EchecCollecte, match="interdit par robots.txt"):
        telechargeur.telecharger(URL_VIDEO)
    assert ytdlp.appels == []


def test_echec_yt_dlp_erreur_nommee_rien_d_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    ytdlp = YtDlpFactice(erreur=EchecMedia("yt-dlp : ERROR: Video unavailable"))
    telechargeur = TelechargeurMedia(_client(horloge), ytdlp, "video", racine)

    with pytest.raises(EchecCollecte, match="yt-dlp : ERROR: Video unavailable"):
        telechargeur.telecharger(URL_VIDEO)
    assert [chemin for chemin in racine.rglob("*") if chemin.is_file()] == []


def test_conteneur_hors_table_refus_type_jamais_devine(racine: Path, horloge: HorlogeFactice) -> None:
    telechargeur = TelechargeurMedia(_client(horloge), YtDlpFactice(ext="flv"), "video", racine)

    with pytest.raises(EchecCollecte, match="conteneur vidéo non pris en charge : flv"):
        telechargeur.telecharger(URL_VIDEO)


def test_media_de_zero_octet_refus(racine: Path, horloge: HorlogeFactice) -> None:
    telechargeur = TelechargeurMedia(_client(horloge), YtDlpFactice(octets=b""), "video", racine)

    with pytest.raises(EchecCollecte, match="0 octet"):
        telechargeur.telecharger(URL_VIDEO)


# --------------------------------------------------------------------------- collecte de bout en bout


def _source_video() -> object:
    return source(URL_VIDEO, tier="T2", type_document="enregistrement_video", date_source=date(2026, 9, 10))


def _source_audio() -> object:
    return source(URL_AUDIO, tier="T2", type_document="enregistrement_audio", date_source=date(2026, 9, 12))


def test_collecte_d_une_source_video(racine: Path, horloge: HorlogeFactice) -> None:
    """Cas limite 8 : fichier média copié tel quel, SHA-256, manifeste et fiche comme en C1."""
    b = banc(racine, horloge, {}, media=YtDlpFactice())
    sha = hashlib.sha256(VIDEO).hexdigest()

    resultats = collecter([_source_video()], b.dependances())  # type: ignore[list-item]

    chemin_local = f"archives/{sha[:2]}/{sha}.mp4"
    assert resultats == [Collectee(URL_VIDEO, sha, chemin_local, INSTANTANE)]
    assert (racine / chemin_local).read_bytes() == VIDEO
    assert manifeste(racine, sha) == {
        "sha256": sha,
        "chemin_local": chemin_local,
        "taille_octets": len(VIDEO),
        "type_contenu_recu": "video/mp4",
        "date_premiere_collecte": "2026-09-22T14:30:05+02:00",
        "url_soumise": URL_VIDEO,
        "archive_url": INSTANTANE,
    }
    assert fiche(racine, cle("candidat-a", URL_VIDEO), sha) == {
        "url": URL_VIDEO,
        "url_finale": PAGE_FINALE,
        "candidat_id": "candidat-a",
        "tier": "T2",
        "type_document": "enregistrement_video",
        "date_source": "2026-09-10",
        "publication": "publique",
        "sha256": sha,
        "date_collecte": "2026-09-22T14:30:05+02:00",
    }
    assert b.archiveur.urls == [URL_VIDEO]


def test_collecte_d_une_source_audio(racine: Path, horloge: HorlogeFactice) -> None:
    ytdlp = YtDlpFactice(octets=AUDIO, ext="m4a")
    b = banc(racine, horloge, {}, media=ytdlp)
    sha = hashlib.sha256(AUDIO).hexdigest()

    [resultat] = collecter([_source_audio()], b.dependances())  # type: ignore[list-item]

    assert resultat == Collectee(URL_AUDIO, sha, f"archives/{sha[:2]}/{sha}.m4a", INSTANTANE)
    assert manifeste(racine, sha)["type_contenu_recu"] == "audio/mp4"
    assert fiche(racine, cle("candidat-a", URL_AUDIO), sha)["type_document"] == "enregistrement_audio"
    assert ytdlp.appels == [(URL_AUDIO, "audio")]


def test_source_video_passe_par_yt_dlp_jamais_par_le_client_http(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {}, media=YtDlpFactice())

    collecter([_source_video()], b.dependances())  # type: ignore[list-item]

    assert b.transport.urls() == ["https://example.org/robots.txt"]


def test_echec_yt_dlp_dans_un_lot_source_refusee_et_rien_d_ecrit(racine: Path, horloge: HorlogeFactice) -> None:
    b = banc(racine, horloge, {}, media=YtDlpFactice(erreur=EchecMedia("yt-dlp : HTTP 403")))

    resultats = collecter([_source_video()], b.dependances())  # type: ignore[list-item]

    assert resultats == [Refusee(URL_VIDEO, "yt-dlp : HTTP 403")]
    assert b.fichiers() == []
    assert b.archiveur.urls == []


# --------------------------------------------------------------------------- lecture du résultat de yt-dlp


def test_resultat_yt_dlp_un_seul_fichier_rendu(tmp_path: Path) -> None:
    (tmp_path / "media.mp4").write_bytes(VIDEO)
    info = {"requested_downloads": [{}], "webpage_url": PAGE_FINALE, "ext": "mp4"}

    assert lire_resultat_yt_dlp(info, tmp_path) == MediaTelecharge(tmp_path / "media.mp4", PAGE_FINALE, "mp4")


def test_resultat_yt_dlp_deux_fichiers_refus(tmp_path: Path) -> None:
    """Un reste `.part` ou un second flux : ce n'est plus « un seul fichier tel que servi »."""
    (tmp_path / "media.mp4").write_bytes(VIDEO)
    (tmp_path / "media.mp4.part").write_bytes(b"x")
    info = {"requested_downloads": [{}], "webpage_url": PAGE_FINALE, "ext": "mp4"}

    with pytest.raises(EchecMedia, match="un seul fichier, il en a rendu 2"):
        lire_resultat_yt_dlp(info, tmp_path)


def test_resultat_yt_dlp_sans_url_de_page_refus(tmp_path: Path) -> None:
    (tmp_path / "media.mp4").write_bytes(VIDEO)

    with pytest.raises(EchecMedia, match="ni l'URL de la page"):
        lire_resultat_yt_dlp({"requested_downloads": [{}], "ext": "mp4"}, tmp_path)
