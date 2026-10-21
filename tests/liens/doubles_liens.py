"""Doubles du test des liens : horloge qui avance en dormant, archiveur et chercheur factices, run.

Aucun appel réseau : la sonde réelle parle à `TransportFactice` (tests de la collecte), l'archiveur
et le chercheur sont remplacés par des doubles qui enregistrent leurs appels.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path

from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import LECTURES_LOCATION
from pipeline.collecte.wayback import ArchivageEchoue, ArchivageReussi, Resultat
from pipeline.liens.iri import CONVERSIONS_IRI
from pipeline.liens.instantanes import InstantaneAbsent, Recherche
from pipeline.liens.passage import Dependances
from pipeline.liens.sonde import SondeLiens
from pipeline.liens.table import CHEMIN_TABLE, charger_table
from tests.collecte.doubles import INSTANT_FIXE, HorlogeFactice, Route, TransportFactice

RUN_ID = "01JD0000000000000000000000"
FIN_FENETRE = "2026-09-22T06:00:00+02:00"


@dataclass
class HorlogeQuiAvance(HorlogeFactice):
    """`maintenant` avance avec `dormir`, pour que chaque tentative ait son propre horodatage."""

    def maintenant(self) -> datetime:
        return self.instant + timedelta(seconds=self.temps - 1000.0)


@dataclass
class ArchiveurFactice:
    resultat: Resultat = field(default_factory=lambda: ArchivageEchoue(motif="HTTP 503 sans instantané daté", tentatives=3))
    urls: list[str] = field(default_factory=list)

    def sauvegarder(self, url: str) -> Resultat:
        self.urls.append(url)
        return self.resultat


def reussite(url: str) -> ArchivageReussi:
    return ArchivageReussi(archive_url=f"https://web.archive.org/web/20260922123005/{url}")


@dataclass
class ChercheurFactice:
    resultat: Recherche = field(default_factory=InstantaneAbsent)
    demandes: list[tuple[str, datetime]] = field(default_factory=list)

    def chercher(self, url: str, instant: datetime) -> Recherche:
        self.demandes.append((url, instant))
        return self.resultat


@dataclass
class Banc:
    horloge: HorlogeQuiAvance
    transport: TransportFactice
    archiveur: ArchiveurFactice
    chercheur: ChercheurFactice
    deps: Dependances


def banc(
    routes: dict[str, Route],
    archiveur: ArchiveurFactice | None = None,
    chercheur: ChercheurFactice | None = None,
    chemin_table: Path = CHEMIN_TABLE,
) -> Banc:
    horloge = HorlogeQuiAvance(instant=INSTANT_FIXE)
    transport = TransportFactice(horloge, routes)
    archiveur = archiveur if archiveur is not None else ArchiveurFactice()
    chercheur = chercheur if chercheur is not None else ChercheurFactice()
    table = charger_table(chemin_table)
    deps = Dependances(
        sonde=SondeLiens(
            transport,
            Cadence(horloge, intervalle_s=1.0),
            CONVERSIONS_IRI[table.conversion_iri],
            LECTURES_LOCATION[table.lecture_location],
        ),
        archiveur=archiveur,
        chercheur=chercheur,
        horloge=horloge,
        table=table,
    )
    return Banc(horloge, transport, archiveur, chercheur, deps)


# ------------------------------------------------------------------------------ run sur disque


def ecrire_run(repertoire: Path, fin: str = FIN_FENETRE) -> None:
    repertoire.mkdir(parents=True, exist_ok=True)
    run = {"id": RUN_ID, "fenetre": {"debut": "2026-09-20T06:00:00+02:00", "fin": fin}}
    (repertoire / "run.json").write_text(json.dumps(run), encoding="utf-8")
    (repertoire / "volume" / "reponses").mkdir(parents=True, exist_ok=True)


def ecrire_reponse(repertoire: Path, identifiant: str, liens: list[str], horodatage: str, refus_api: bool = False) -> None:
    reponse = {
        "id": identifiant,
        "run_id": RUN_ID,
        "statut_reponse": "obtenue",
        "normalise": {"texte": "", "liens": liens, "troncature": False, "refus_api": refus_api},
        "metadonnees": {"horodatage_requete": horodatage, "horodatage_reponse": horodatage},
    }
    chemin = repertoire / "volume" / "reponses" / f"{identifiant}.json"
    chemin.write_text(json.dumps(reponse), encoding="utf-8")


def ecrire_manquante(repertoire: Path, identifiant: str) -> None:
    reponse = {"id": identifiant, "run_id": RUN_ID, "statut_reponse": "manquante", "motif_manquante": "echecs"}
    chemin = repertoire / "volume" / "reponses" / f"{identifiant}.json"
    chemin.write_text(json.dumps(reponse), encoding="utf-8")
