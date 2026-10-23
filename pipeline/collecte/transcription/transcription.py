"""Transcription de tous les contenus audio et vidéo collectés (sous-lot C3).

Pour chaque manifeste `staging/sources/<sha256>.json` dont le type reçu est `audio/*` ou `video/*` :

- `.vtt` et fiche présents : « déjà transcrite », rien n'est relu ni réécrit, le modèle n'est même
  pas chargé. La transcription n'étant pas reproductible à l'octet, une seconde passe produirait un
  autre texte, donc d'autres offsets : le premier `.vtt` fait foi ;
- un seul des deux présent : refus nommé. Une fiche n'est jamais inventée après coup pour un `.vtt`
  dont on ignore le modèle, et un `.vtt` n'est jamais refait sous une fiche qui en décrit un autre ;
- aucun des deux : copie locale revérifiée, transcription, `.vtt`, puis fiche. Le `.vtt` d'abord :
  une fiche n'existe jamais sans lui.

Le modèle n'est chargé qu'à la première transcription à faire, et une seule fois par lot. Des poids
absents ou d'empreinte fausse arrêtent tout le lot (`PoidsAbsent`, `EmpreintePoidsInvalide`) : ce
n'est pas un refus d'un contenu, c'est l'outil qui manque.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from pipeline.collecte.archivage import ecrire_atomiquement, empreinte_fichier
from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.manifeste import serialiser
from pipeline.collecte.textes.extraction import Contenu, contenus_collectes
from pipeline.collecte.transcription.fiche import (
    chemin_fiche_transcription,
    chemin_vtt,
    construire_fiche_transcription,
    est_media,
)
from pipeline.collecte.transcription.modele import Transcripteur
from pipeline.collecte.transcription.webvtt import SegmentInvalide, TranscriptionVide, VttEcrit, ecrire_vtt


@dataclass
class Dependances:
    racine: Path
    horloge: Horloge
    charger: Callable[[], Transcripteur]
    """Appelé au plus une fois par lot, et seulement s'il y a quelque chose à transcrire."""
    _transcripteur: Transcripteur | None = field(default=None, init=False, repr=False)

    def transcripteur(self) -> Transcripteur:
        if self._transcripteur is None:
            self._transcripteur = self.charger()
        return self._transcripteur


@dataclass(frozen=True)
class Transcrite:
    sha256_source: str
    vtt_sha256: str
    cues: int
    segments_exclus: int


@dataclass(frozen=True)
class DejaTranscrite:
    """`.vtt` et fiche existaient : rien n'est écrit, même si une nouvelle passe donnerait autre chose."""

    sha256_source: str


@dataclass(frozen=True)
class Refusee:
    sha256_source: str
    motif: str


ResultatTranscription = Transcrite | DejaTranscrite | Refusee
REUSSIS = (Transcrite, DejaTranscrite)


class TranscriptionRefusee(Exception):
    def __init__(self, motif: str) -> None:
        super().__init__(motif)
        self.motif = motif


def _copie_verifiee(contenu: Contenu, racine: Path) -> Path:
    """Chemin de la copie locale, après vérification de son empreinte, lue par blocs (un média pèse
    vite plusieurs centaines de mégaoctets)."""
    chemin = racine / contenu.chemin_local
    if not chemin.is_file():
        raise TranscriptionRefusee(f"copie locale absente : {contenu.chemin_local}")
    if empreinte_fichier(chemin) != contenu.sha256:
        raise TranscriptionRefusee(f"copie locale altérée : {contenu.chemin_local} n'a plus l'empreinte {contenu.sha256}")
    return chemin


def _etat_existant(sha256: str, racine: Path) -> DejaTranscrite | None:
    vtt = (racine / chemin_vtt(sha256)).exists()
    fiche = (racine / chemin_fiche_transcription(sha256)).exists()
    if vtt and fiche:
        return DejaTranscrite(sha256)
    if vtt:
        raise TranscriptionRefusee(f"transcription sans fiche : {chemin_fiche_transcription(sha256)} absente")
    if fiche:
        raise TranscriptionRefusee(f"fiche sans transcription : {chemin_vtt(sha256)} absent")
    return None


def _vtt_de(chemin: Path, transcripteur: Transcripteur) -> tuple[VttEcrit, float]:
    transcription = transcripteur.transcrire(chemin)
    try:
        return ecrire_vtt(transcription.segments), transcription.duree_audio_s
    except TranscriptionVide as vide:
        raise TranscriptionRefusee(f"transcription vide : {vide}") from None
    except SegmentInvalide as invalide:
        raise TranscriptionRefusee(f"segment inutilisable : {invalide}") from None


def _transcrire(contenu: Contenu, deps: Dependances) -> Transcrite:
    chemin = _copie_verifiee(contenu, deps.racine)
    transcripteur = deps.transcripteur()
    vtt, duree = _vtt_de(chemin, transcripteur)
    octets = vtt.contenu.encode("utf-8")
    vtt_sha256 = hashlib.sha256(octets).hexdigest()
    date = instant_iso(deps.horloge.maintenant())
    fiche = construire_fiche_transcription(
        contenu.sha256, vtt_sha256, date, duree, vtt.cues, vtt.segments_exclus, transcripteur.description()
    )
    ecrire_atomiquement(deps.racine / chemin_vtt(contenu.sha256), octets)
    ecrire_atomiquement(deps.racine / chemin_fiche_transcription(contenu.sha256), serialiser(fiche))
    return Transcrite(contenu.sha256, vtt_sha256, vtt.cues, vtt.segments_exclus)


def transcrire_contenu(contenu: Contenu, deps: Dependances) -> ResultatTranscription:
    try:
        deja = _etat_existant(contenu.sha256, deps.racine)
        return deja if deja is not None else _transcrire(contenu, deps)
    except TranscriptionRefusee as refus:
        return Refusee(contenu.sha256, refus.motif)


def transcrire_tout(deps: Dependances) -> list[ResultatTranscription]:
    medias = [contenu for contenu in contenus_collectes(deps.racine) if est_media(contenu.type_contenu)]
    return [transcrire_contenu(contenu, deps) for contenu in medias]


def code_de_sortie(resultats: Sequence[ResultatTranscription]) -> int:
    return 0 if all(isinstance(resultat, REUSSIS) for resultat in resultats) else 1


# ----------------------------------------------------------------- rapport

LARGEUR_ETIQUETTE = 17


def _ligne(etiquette: str, sha256_source: str, reste: str = "") -> str:
    return f"{etiquette.ljust(LARGEUR_ETIQUETTE)}{sha256_source}  {reste}".rstrip()


def _ligne_transcrite(resultat: Transcrite) -> str:
    detail = f"→ {resultat.vtt_sha256} ({resultat.cues} cues, {resultat.segments_exclus} segment(s) exclu(s))"
    return _ligne("transcrite", resultat.sha256_source, detail)


LIGNES: dict[type, Callable[..., str]] = {
    Transcrite: _ligne_transcrite,
    DejaTranscrite: lambda r: _ligne("déjà transcrite", r.sha256_source, "(.vtt existant, jamais réécrit)"),
    Refusee: lambda r: _ligne("REFUSÉE", r.sha256_source, r.motif),
}

LIBELLES_BILAN: dict[type, str] = {
    Transcrite: "transcrite(s)",
    DejaTranscrite: "déjà transcrite(s)",
    Refusee: "refusée(s)",
}


def formater_rapport(resultats: Sequence[ResultatTranscription]) -> str:
    lignes = [LIGNES[type(resultat)](resultat) for resultat in resultats]
    comptes = [
        f"{sum(isinstance(resultat, genre) for resultat in resultats)} {libelle}"
        for genre, libelle in LIBELLES_BILAN.items()
    ]
    return "\n".join([*lignes, f"bilan : {', '.join(comptes)}"])
