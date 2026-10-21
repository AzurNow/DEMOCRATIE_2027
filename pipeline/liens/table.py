"""Chargement strict de la table résultat → verdict (`config/test-liens.toml`, décisions D20 et D21).

La table est une donnée : aucun code HTTP, aucune issue n'est rangé sous un verdict dans le code.
Le chargeur refuse, par une erreur nommée, une table illisible, incomplète (clé ou verdict manquant,
version absente), inconnue (clé, verdict, issue, classe ou code que le code ne connaît pas) ou
ambiguë (un même code, une même classe ou une même issue sous deux verdicts).

D21 : la table porte aussi le délai d'une requête (`delai_s`, nombre > 0) et la règle de conversion
IRI → URI pour l'envoi (`conversion_iri`, une clé de `pipeline.liens.iri.CONVERSIONS_IRI`). D55 (2) :
elle porte de même la règle de relecture de l'en-tête `Location` (`lecture_location`, une clé de
`pipeline.collecte.reseau.LECTURES_LOCATION`). Le code lit les trois ici ; aucune constante ne les
double.

Lecture : un code listé l'emporte sur sa classe ; un résultat que la table ne classe pas n'a pas de
verdict (`None`), jamais un verdict voisin.
"""

from __future__ import annotations

import re
import tomllib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from pipeline.collecte.reseau import LECTURES_LOCATION
from pipeline.collecte.sources import RACINE_DEPOT
from pipeline.liens.constat import CLASSES_HTTP, ISSUES_SANS_REPONSE, REPONSE_HTTP, Constat, classe_http
from pipeline.liens.iri import CONVERSIONS_IRI
from pipeline.liens.schemas import verdicts_existence

CHEMIN_TABLE = RACINE_DEPOT / "config" / "test-liens.toml"
MOTIF_VERSION = re.compile(r"table-liens-v[0-9]+")
CLES_RACINE = frozenset(
    {"version", "conversion_iri", "lecture_location", "delai_s", "tentatives", "transitoire", "verdicts"}
)
CLES_TENTATIVES = frozenset({"maximum", "espacement_s"})
CLES_REGLES = frozenset({"codes_http", "classes_http", "issues"})


class TableInvalide(Exception):
    """Base des refus de la table : rien n'est testé avec une table refusée."""


class TableIllisible(TableInvalide):
    """Le fichier n'est pas du TOML lisible."""


class TableIncomplete(TableInvalide):
    """Une clé, une section ou un verdict exigé manque."""


class TableInconnue(TableInvalide):
    """Une clé, une valeur, un verdict, une issue, une classe ou un code que le code ne connaît pas."""


class TableAmbigue(TableInvalide):
    """Un même code, une même classe ou une même issue sous deux verdicts."""


@dataclass(frozen=True)
class Regles:
    codes_http: frozenset[int]
    classes_http: frozenset[str]
    issues: frozenset[str]

    def couvre(self, constat: Constat) -> bool:
        if constat.issue != REPONSE_HTTP:
            return constat.issue in self.issues
        code = _code(constat)
        return code in self.codes_http or classe_http(code) in self.classes_http


@dataclass(frozen=True)
class TableLiens:
    version: str
    conversion_iri: str
    """Clé de `CONVERSIONS_IRI` : la règle qui rend une IRI envoyable (D21)."""
    lecture_location: str
    """Clé de `LECTURES_LOCATION` : la règle qui relit l'en-tête `Location` (D55 (2))."""
    delai_s: float
    """Délai d'une requête du test des liens, en secondes (D21)."""
    tentatives_max: int
    espacement_s: float
    transitoire: Regles
    verdicts: Mapping[str, Regles]

    def verdict(self, constat: Constat) -> str | None:
        """Le verdict du résultat, ou `None` si la table ne le classe pas."""
        if constat.issue != REPONSE_HTTP:
            return self._premier(lambda r: constat.issue in r.issues)
        code = _code(constat)
        explicite = self._premier(lambda r: code in r.codes_http)
        if explicite is not None:
            return explicite
        return self._premier(lambda r: classe_http(code) in r.classes_http)

    def est_transitoire(self, constat: Constat) -> bool:
        return self.transitoire.couvre(constat)

    def _premier(self, predicat: Callable[[Regles], bool]) -> str | None:
        """Au plus un verdict répond : l'ambiguïté est refusée au chargement."""
        trouves = [nom for nom, regles in self.verdicts.items() if predicat(regles)]
        return trouves[0] if trouves else None


def _code(constat: Constat) -> int:
    if constat.code_http is None:
        raise ValueError("réponse HTTP sans code : constat incohérent")
    return constat.code_http


# ----------------------------------------------------------------------------- chargement


def charger_table(chemin: Path) -> TableLiens:
    try:
        brute = tomllib.loads(chemin.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as erreur:
        raise TableIllisible(f"{chemin} : {erreur}") from erreur
    _exiger_cles(brute, CLES_RACINE, "racine")
    version = _version(brute["version"])
    maximum, espacement = _tentatives(_section(brute, "tentatives"))
    verdicts = _verdicts(_section(brute, "verdicts"))
    _refuser_ambiguites(verdicts)
    return TableLiens(
        version=version,
        conversion_iri=_conversion_iri(brute["conversion_iri"]),
        lecture_location=_lecture_location(brute["lecture_location"]),
        delai_s=_delai(brute["delai_s"]),
        tentatives_max=maximum,
        espacement_s=espacement,
        transitoire=_regles(_section(brute, "transitoire"), "transitoire"),
        verdicts=verdicts,
    )


def _exiger_cles(section: Mapping[str, Any], attendues: frozenset[str], ou: str) -> None:
    manquantes = sorted(attendues - set(section))
    if manquantes:
        raise TableIncomplete(f"{ou} : clé(s) manquante(s) {manquantes}")
    inconnues = sorted(set(section) - attendues)
    if inconnues:
        raise TableInconnue(f"{ou} : clé(s) inconnue(s) {inconnues}")


def _section(brute: Mapping[str, Any], cle: str) -> Mapping[str, Any]:
    valeur = brute[cle]
    if not isinstance(valeur, dict):
        raise TableInconnue(f"{cle} doit être une table TOML, pas {type(valeur).__name__}")
    return valeur


def _version(valeur: object) -> str:
    if not isinstance(valeur, str) or not MOTIF_VERSION.fullmatch(valeur):
        raise TableInconnue(f"version {valeur!r} hors du motif {MOTIF_VERSION.pattern}")
    return valeur


def _conversion_iri(valeur: object) -> str:
    if not isinstance(valeur, str) or valeur not in CONVERSIONS_IRI:
        raise TableInconnue(f"conversion_iri {valeur!r} inconnue ; connues : {sorted(CONVERSIONS_IRI)}")
    return valeur


def _lecture_location(valeur: object) -> str:
    if not isinstance(valeur, str) or valeur not in LECTURES_LOCATION:
        raise TableInconnue(f"lecture_location {valeur!r} inconnue ; connues : {sorted(LECTURES_LOCATION)}")
    return valeur


def _delai(valeur: object) -> float:
    if isinstance(valeur, bool) or not isinstance(valeur, (int, float)) or valeur <= 0:
        raise TableInconnue(f"delai_s doit être un nombre > 0, pas {valeur!r}")
    return float(valeur)


def _tentatives(section: Mapping[str, Any]) -> tuple[int, float]:
    _exiger_cles(section, CLES_TENTATIVES, "tentatives")
    maximum, espacement = section["maximum"], section["espacement_s"]
    if not _entier(maximum) or maximum < 1:
        raise TableInconnue(f"tentatives.maximum doit être un entier ≥ 1, pas {maximum!r}")
    if isinstance(espacement, bool) or not isinstance(espacement, (int, float)) or espacement < 0:
        raise TableInconnue(f"tentatives.espacement_s doit être un nombre ≥ 0, pas {espacement!r}")
    return maximum, float(espacement)


def _verdicts(section: Mapping[str, Any]) -> dict[str, Regles]:
    _exiger_cles(section, frozenset(verdicts_existence()), "verdicts")
    return {nom: _regles(_section(section, nom), f"verdicts.{nom}") for nom in verdicts_existence()}


def _regles(section: Mapping[str, Any], ou: str) -> Regles:
    _exiger_cles(section, CLES_REGLES, ou)
    return Regles(
        codes_http=frozenset(_liste(section, "codes_http", ou, _code_admis)),
        classes_http=frozenset(_liste(section, "classes_http", ou, lambda v: v in CLASSES_HTTP)),
        issues=frozenset(_liste(section, "issues", ou, lambda v: v in ISSUES_SANS_REPONSE)),
    )


def _liste(section: Mapping[str, Any], cle: str, ou: str, admis: Callable[[Any], bool]) -> list[Any]:
    valeurs = section[cle]
    if not isinstance(valeurs, list):
        raise TableInconnue(f"{ou}.{cle} doit être une liste")
    refusees = [v for v in valeurs if not admis(v)]
    if refusees:
        raise TableInconnue(f"{ou}.{cle} : valeur(s) inconnue(s) {refusees}")
    if len(set(valeurs)) != len(valeurs):
        raise TableAmbigue(f"{ou}.{cle} : doublon dans {valeurs}")
    return valeurs


def _entier(valeur: object) -> bool:
    return isinstance(valeur, int) and not isinstance(valeur, bool)


def _code_admis(valeur: object) -> bool:
    return isinstance(valeur, int) and not isinstance(valeur, bool) and 100 <= valeur <= 599


def _refuser_ambiguites(verdicts: Mapping[str, Regles]) -> None:
    for attribut in ("codes_http", "classes_http", "issues"):
        vus: dict[object, str] = {}
        for nom, regles in verdicts.items():
            for valeur in sorted(getattr(regles, attribut), key=str):
                if valeur in vus:
                    raise TableAmbigue(f"{attribut} : {valeur} sous deux verdicts ({vus[valeur]}, {nom})")
                vus[valeur] = nom
