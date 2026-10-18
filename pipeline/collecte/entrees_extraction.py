"""`uv run python -m pipeline.collecte.entrees_extraction` (ou `pnpm extraction:entrees`).

Prépare l'extraction double (§4, décision D52) : pour chaque fiche de source
`staging/sources/par-source/<cle_source>/<sha256>.json` dont le contenu a au moins une fiche
d'extraction de texte, écrit `staging/entrees-extraction/<cle_source>/<sha256>.json`
(`schema/entree-extraction.schema.json`), que `pnpm extraire` (TypeScript) lit. C'est la frontière
Python → TypeScript retenue par l'auteur le 2026-10-16 : un fichier intermédiaire, sans
sous-processus, et `source.py:source_de` reste le seul assembleur du bloc `source`.

Une entrée porte :
- `cle_source`, `sha256_source`, et le `candidat_id` de la fiche de source ;
- `extracteur_epingle` : l'extracteur que le code utiliserait aujourd'hui pour ce contenu
  (`textes/en_service.py:extracteur_en_service`, D52 (4), option A) ;
- `sources` : un bloc `source` **par fiche d'extraction** du contenu, indexé par `texte_sha256`,
  assemblé par `source_de` sans citation (ni `page` ni `extrait`). Aucun choix n'est fait ici : le
  TypeScript choisit la fiche par `choix-texte.ts:choisirFiche` et prend le bloc de son texte. La
  règle de choix n'existe donc qu'une fois. Le type de document et le format, variables du prompt,
  se lisent dans le bloc retenu.

Une source sans lien d'archive (`SourceSansArchive`), dont l'assemblage échoue, ou dont l'entrée
n'est pas conforme n'est pas écrite : elle est nommée dans le bilan, jamais complétée. Une entrée
déjà présente et identique n'est pas réécrite ; présente et différente, c'est une erreur nommée,
sans écrasement. Codes de sortie : 0 si aucune source n'est refusée, 1 sinon.

Python n'a pas de validateur JSON Schema (aucune dépendance ajoutée) : `exiger_conforme` vérifie
la forme et les invariants avant l'écriture, le fichier doré `tests/collecte/dore/` est validé
contre le schéma par `tests/collecte/dores.test.ts`, et `pnpm extraire` revalide chaque entrée à
la lecture.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from pipeline.collecte.archivage import ecrire_atomiquement
from pipeline.collecte.lien_archive import ArchivageIncoherent, ManifesteAbsent
from pipeline.collecte.manifeste import REPERTOIRE_FICHES, chemin_manifeste, serialiser
from pipeline.collecte.source import FormatIndecidable, PieceManquante, SourceSansArchive, source_de
from pipeline.collecte.sources import RACINE_DEPOT
from pipeline.collecte.textes.en_service import extracteur_en_service
from pipeline.collecte.textes.extraction import Contenu, lire_contenu
from pipeline.collecte.textes.fiche import REPERTOIRE_EXTRACTIONS, Extracteur
from pipeline.collecte.textes.refus import ExtractionRefusee

REPERTOIRE_ENTREES = PurePosixPath("staging", "entrees-extraction")

DescriptionEnService = Callable[[str | None], Extracteur]


class EntreeNonConforme(Exception):
    """L'entrée assemblée n'a pas la forme de `schema/entree-extraction.schema.json`."""


class EntreeDivergente(Exception):
    """Une entrée existe déjà sous ce nom avec d'autres octets : elle n'est jamais écrasée."""


class FicheSourceIllisible(Exception):
    """La fiche de source n'est pas un JSON lisible, ou ne porte pas candidat_id (constat 18, revue du 2026-10-17)."""


def chemin_entree(cle_source: str, sha256: str) -> PurePosixPath:
    return REPERTOIRE_ENTREES / cle_source / f"{sha256}.json"


@dataclass(frozen=True)
class Dependances:
    racine: Path
    extracteur_en_service: DescriptionEnService


@dataclass(frozen=True)
class Ecrite:
    cle_source: str
    sha256: str
    textes: int


@dataclass(frozen=True)
class DejaEcrite:
    cle_source: str
    sha256: str


@dataclass(frozen=True)
class SansTexte:
    """Aucune fiche d'extraction de texte pour ce contenu : rien à extraire, pas d'entrée."""

    cle_source: str
    sha256: str


@dataclass(frozen=True)
class Refusee:
    cle_source: str
    sha256: str
    motif: str


ResultatEntree = Ecrite | DejaEcrite | SansTexte | Refusee
REFUS_NOMMES = (
    SourceSansArchive,
    PieceManquante,
    FormatIndecidable,
    ManifesteAbsent,
    ArchivageIncoherent,
    ExtractionRefusee,
    EntreeNonConforme,
    EntreeDivergente,
    FicheSourceIllisible,
)


# ----------------------------------------------------------------- conformité

SHA256 = re.compile(r"^[0-9a-f]{64}$")
IDENTIFIANT_COURT = re.compile(r"^[a-z0-9]([a-z0-9_-]{0,62}[a-z0-9])?$")
CLES_ENTREE = {"cle_source", "sha256_source", "candidat_id", "extracteur_epingle", "sources"}
CLES_EXTRACTEUR = {"outil", "version", "options"}
CHAMPS_LOCALISES = ("page", "extrait")


def _exiger(condition: bool, motif: str) -> None:
    if not condition:
        raise EntreeNonConforme(motif)


def _objet(valeur: object, quoi: str) -> dict[str, object]:
    if not isinstance(valeur, dict):
        raise EntreeNonConforme(f"{quoi} n'est pas un objet")
    return valeur


def _exiger_extracteur(valeur: object) -> None:
    extracteur = _objet(valeur, "extracteur_epingle")
    _exiger(set(extracteur) == CLES_EXTRACTEUR, "extracteur_epingle : outil, version, options attendus")
    _exiger(isinstance(extracteur["outil"], str), "extracteur_epingle.outil n'est pas un texte")
    version = extracteur["version"]
    _exiger(isinstance(version, str) and len(version) > 0, "extracteur_epingle.version vide ou non textuelle")
    _exiger(isinstance(extracteur["options"], dict), "extracteur_epingle.options n'est pas un objet")


def _exiger_bloc(texte_sha256: str, valeur: object, sha256_source: str) -> None:
    _exiger(SHA256.match(texte_sha256) is not None, f"sources : clé {texte_sha256!r} n'est pas un sha256")
    bloc = _objet(valeur, f"sources[{texte_sha256}]")
    _exiger(bloc.get("sha256") == sha256_source, f"sources[{texte_sha256}].sha256 n'est pas {sha256_source}")
    _exiger(bloc.get("texte_sha256") == texte_sha256, f"sources[{texte_sha256}].texte_sha256 ne nomme pas sa clé")
    localises = [champ for champ in CHAMPS_LOCALISES if champ in bloc]
    _exiger(not localises, f"sources[{texte_sha256}] porte {localises} : la citation se localise à l'extraction")


def exiger_conforme(entree: dict[str, object]) -> None:
    """Forme et invariants de `schema/entree-extraction.schema.json` ; lève `EntreeNonConforme`."""
    _exiger(set(entree) == CLES_ENTREE, f"clés {sorted(entree)}, attendues {sorted(CLES_ENTREE)}")
    for cle in ("cle_source", "sha256_source"):
        _exiger(SHA256.match(str(entree[cle])) is not None, f"{cle} n'est pas un sha256")
    _exiger(IDENTIFIANT_COURT.match(str(entree["candidat_id"])) is not None, f"candidat_id {entree['candidat_id']!r} refusé")
    _exiger_extracteur(entree["extracteur_epingle"])
    sources = _objet(entree["sources"], "sources")
    _exiger(len(sources) > 0, "sources : au moins un bloc attendu")
    for texte_sha256, bloc in sources.items():
        _exiger_bloc(texte_sha256, bloc, str(entree["sha256_source"]))


# ----------------------------------------------------------------- assemblage


@dataclass(frozen=True)
class FicheDeSource:
    cle_source: str
    sha256: str
    chemin: Path


def fiches_de_source(racine: Path) -> list[FicheDeSource]:
    repertoire = racine / REPERTOIRE_FICHES
    if not repertoire.exists():
        return []
    return [FicheDeSource(chemin.parent.name, chemin.stem, chemin) for chemin in sorted(repertoire.glob("*/*.json"))]


def textes_extraits(racine: Path, sha256: str) -> list[str]:
    """Les `texte_sha256` des fiches d'extraction du contenu, triés."""
    repertoire = racine / REPERTOIRE_EXTRACTIONS / sha256
    if not repertoire.exists():
        return []
    return [chemin.stem for chemin in sorted(repertoire.glob("*.json"))]


def _contenu(racine: Path, sha256: str) -> Contenu:
    chemin = racine / chemin_manifeste(sha256)
    if not chemin.exists():
        raise ManifesteAbsent(f"manifeste de contenu absent : {chemin_manifeste(sha256)}")
    return lire_contenu(chemin)


def _candidat_id(fiche: FicheDeSource) -> object:
    """Le `candidat_id` de la fiche de source ; nomme la fiche plutôt que de lever un `KeyError` ou
    un `JSONDecodeError` brut (constat 18, revue du 2026-10-17)."""
    try:
        brut = json.loads(fiche.chemin.read_text(encoding="utf-8"))
    except json.JSONDecodeError as erreur:
        raise FicheSourceIllisible(f"{fiche.chemin} : JSON illisible ({erreur}).") from erreur
    if not isinstance(brut, dict) or "candidat_id" not in brut:
        raise FicheSourceIllisible(f"{fiche.chemin} : candidat_id absent.")
    return brut["candidat_id"]


def construire_entree(fiche: FicheDeSource, textes: Sequence[str], deps: Dependances) -> dict[str, object]:
    candidat_id = _candidat_id(fiche)
    epingle = deps.extracteur_en_service(_contenu(deps.racine, fiche.sha256).type_contenu)
    entree: dict[str, object] = {
        "cle_source": fiche.cle_source,
        "sha256_source": fiche.sha256,
        "candidat_id": candidat_id,
        "extracteur_epingle": epingle._asdict(),
        "sources": {texte: source_de(deps.racine, fiche.cle_source, fiche.sha256, texte) for texte in textes},
    }
    exiger_conforme(entree)
    return entree


def _ecrire(fiche: FicheDeSource, entree: dict[str, object], racine: Path, textes: int) -> ResultatEntree:
    relatif = chemin_entree(fiche.cle_source, fiche.sha256)
    chemin = racine / relatif
    octets = serialiser(entree)
    if not chemin.exists():
        ecrire_atomiquement(chemin, octets)
        return Ecrite(fiche.cle_source, fiche.sha256, textes)
    if chemin.read_bytes() == octets:
        return DejaEcrite(fiche.cle_source, fiche.sha256)
    raise EntreeDivergente(f"{relatif} existe avec un autre contenu : jamais écrasée, à examiner à la main")


def preparer(fiche: FicheDeSource, deps: Dependances) -> ResultatEntree:
    textes = textes_extraits(deps.racine, fiche.sha256)
    if not textes:
        return SansTexte(fiche.cle_source, fiche.sha256)
    try:
        return _ecrire(fiche, construire_entree(fiche, textes, deps), deps.racine, len(textes))
    except REFUS_NOMMES as refus:
        return Refusee(fiche.cle_source, fiche.sha256, f"{type(refus).__name__} : {refus}")


def preparer_tout(deps: Dependances) -> list[ResultatEntree]:
    return [preparer(fiche, deps) for fiche in fiches_de_source(deps.racine)]


def code_de_sortie(resultats: Sequence[ResultatEntree]) -> int:
    return 1 if any(isinstance(resultat, Refusee) for resultat in resultats) else 0


# ----------------------------------------------------------------- rapport

LARGEUR_ETIQUETTE = 16


def _ligne(etiquette: str, resultat: ResultatEntree, reste: str) -> str:
    return f"{etiquette.ljust(LARGEUR_ETIQUETTE)}{resultat.cle_source}/{resultat.sha256}  {reste}".rstrip()


LIGNES: dict[type, Callable[..., str]] = {
    Ecrite: lambda r: _ligne("écrite", r, f"{r.textes} texte(s)"),
    DejaEcrite: lambda r: _ligne("déjà écrite", r, ""),
    SansTexte: lambda r: _ligne("sans texte", r, "aucune fiche d'extraction (lancer pnpm textes)"),
    Refusee: lambda r: _ligne("REFUSÉE", r, r.motif),
}

LIBELLES_BILAN: dict[type, str] = {
    Ecrite: "écrite(s)",
    DejaEcrite: "déjà écrite(s)",
    SansTexte: "sans texte",
    Refusee: "refusée(s)",
}


def formater_rapport(resultats: Sequence[ResultatEntree]) -> str:
    lignes = [LIGNES[type(resultat)](resultat) for resultat in resultats]
    comptes = [
        f"{sum(isinstance(resultat, genre) for resultat in resultats)} {libelle}" for genre, libelle in LIBELLES_BILAN.items()
    ]
    return "\n".join([*lignes, f"bilan : {', '.join(comptes)}"])


# ----------------------------------------------------------------- commande


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.collecte.entrees_extraction",
        description="Écrit les entrées de l'extraction double (staging/entrees-extraction/).",
    )
    analyseur.add_argument("--racine", type=Path, default=RACINE_DEPOT, help="racine du dépôt (défaut : ce dépôt)")
    return analyseur.parse_args(list(arguments))


def principal(arguments: Sequence[str]) -> int:
    options = _arguments(arguments)
    resultats = preparer_tout(Dependances(options.racine, extracteur_en_service))
    print(formater_rapport(resultats))
    return code_de_sortie(resultats)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
