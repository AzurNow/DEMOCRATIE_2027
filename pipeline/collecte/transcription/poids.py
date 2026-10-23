"""Poids du modèle de transcription : dépôt, révision et empreintes épinglés ici, vérifiés avant tout
chargement (décision de l'auteur du 2026-09-24).

Modèle `large-v3-turbo` de Whisper au format CTranslate2. faster-whisper 1.2.1 associe l'alias
`large-v3-turbo` au dépôt Hugging Face `mobiuslabsgmbh/faster-whisper-large-v3-turbo`, qui redirige
aujourd'hui vers `dropbox-dash/faster-whisper-large-v3-turbo` : le nom canonique est écrit ici, pour ne
dépendre d'aucune redirection. Révision et empreintes lues le 2026-09-24 dans les métadonnées de
`https://huggingface.co/api/models/dropbox-dash/faster-whisper-large-v3-turbo/revision/<REVISION>?blobs=true`,
sans télécharger les poids.

Deux sortes d'empreinte, selon ce que l'API expose : `model.bin` est stocké en LFS et l'API donne son
SHA-256 ; les quatre petits fichiers sont des objets Git ordinaires et l'API ne donne que leur
identifiant d'objet Git (SHA-1 de `blob <taille>\\0<octets>`), vérifié tel quel. Dans les deux cas la
taille est vérifiée d'abord. La fiche de transcription consigne, pour chaque fichier, le SHA-256
calculé sur le disque.

Au premier lancement, les fichiers absents sont téléchargés à cette révision dans `modeles/` (hors
Git). Un fichier présent n'est jamais retéléchargé : une empreinte fausse est un refus, pas une
réparation. Ensuite tout tourne hors ligne.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from pipeline.collecte.archivage import blocs_fichier

ALIAS = "large-v3-turbo"
DEPOT = "dropbox-dash/faster-whisper-large-v3-turbo"
REVISION = "0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf"
REPERTOIRE_MODELES = "modeles"


@dataclass(frozen=True)
class FichierPoids:
    nom: str
    taille: int
    sha256: str | None
    """SHA-256 publié par l'API (fichier LFS), ou `None` quand seul `blob_git` est publié."""
    blob_git: str | None


FICHIERS: tuple[FichierPoids, ...] = (
    FichierPoids(
        "model.bin", 1_617_884_929, sha256="e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da", blob_git=None
    ),
    FichierPoids("config.json", 2_263, sha256=None, blob_git="0351d1d6870005e865747b781b5d7c23ea0459cd"),
    FichierPoids("preprocessor_config.json", 340, sha256=None, blob_git="931c77a740890c46365c7ae0c9d350ba3cca908f"),
    FichierPoids("tokenizer.json", 2_710_337, sha256=None, blob_git="17456db595adc78a973f97d69d8cb50bc87c0b1c"),
    FichierPoids("vocabulary.json", 1_068_114, sha256=None, blob_git="0adcd01e7c237205d593b707e66dd5d7bc785d2d"),
)

Telecharger = Callable[[str, Path], None]
"""`(nom, repertoire)` : dépose le fichier `nom` de la révision épinglée dans `repertoire`."""


class PoidsAbsent(Exception):
    """Un fichier de poids attendu n'est pas sur le disque, même après téléchargement."""


class EmpreintePoidsInvalide(Exception):
    """Un fichier de poids n'a pas la taille ou l'empreinte épinglée : il n'est jamais chargé."""


def repertoire_modele(racine: Path) -> Path:
    return racine / REPERTOIRE_MODELES / DEPOT / REVISION


def blob_git(octets: bytes) -> str:
    """Identifiant d'objet Git d'un fichier, celui que rend `git hash-object`."""
    return hashlib.sha1(f"blob {len(octets)}\0".encode() + octets, usedforsecurity=False).hexdigest()


def _empreintes(chemin: Path, taille: int) -> tuple[str, str]:
    """SHA-256 et identifiant Git, lus en un seul passage par blocs (le modèle pèse 1,6 Go)."""
    sha256 = hashlib.sha256()
    git = hashlib.sha1(f"blob {taille}\0".encode(), usedforsecurity=False)
    for bloc in blocs_fichier(chemin):
        sha256.update(bloc)
        git.update(bloc)
    return sha256.hexdigest(), git.hexdigest()


def _verifier(repertoire: Path, attendu: FichierPoids) -> str:
    chemin = repertoire / attendu.nom
    if not chemin.is_file():
        raise PoidsAbsent(f"poids absent : {chemin}")
    taille = chemin.stat().st_size
    if taille != attendu.taille:
        raise EmpreintePoidsInvalide(f"{attendu.nom} : taille {taille} octets, {attendu.taille} attendus")
    sha256, git = _empreintes(chemin, taille)
    if attendu.sha256 is not None and sha256 != attendu.sha256:
        raise EmpreintePoidsInvalide(f"{attendu.nom} : SHA-256 {sha256}, {attendu.sha256} attendu")
    if attendu.blob_git is not None and git != attendu.blob_git:
        raise EmpreintePoidsInvalide(f"{attendu.nom} : objet Git {git}, {attendu.blob_git} attendu")
    return sha256


def verifier_poids(repertoire: Path, attendus: Sequence[FichierPoids] = FICHIERS) -> dict[str, str]:
    """SHA-256 calculé de chaque fichier, dans l'ordre des attendus. Lève au premier écart."""
    return {attendu.nom: _verifier(repertoire, attendu) for attendu in attendus}


def preparer_poids(
    repertoire: Path, telecharger: Telecharger, attendus: Sequence[FichierPoids] = FICHIERS
) -> dict[str, str]:
    """Télécharge les fichiers absents, puis vérifie **tous** les fichiers avant de rendre la main."""
    for attendu in attendus:
        if not (repertoire / attendu.nom).exists():
            telecharger(attendu.nom, repertoire)
    return verifier_poids(repertoire, attendus)


def telecharger_depuis_hugging_face(nom: str, repertoire: Path) -> None:
    """Téléchargement réel, à la révision épinglée seulement. Jamais appelé par les tests."""
    from huggingface_hub import hf_hub_download

    hf_hub_download(repo_id=DEPOT, filename=nom, revision=REVISION, local_dir=repertoire)
