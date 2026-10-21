"""`python -m pipeline.liens <repertoire_du_run>` : codes de sortie, refus avant toute requête, fichiers dorés.

Les six fichiers dorés de `tests/liens/dore/` sont reproduits ici octet pour octet ;
`tests/liens/dores-liens.test.ts` les valide contre `schema/existence-lien.schema.json` et vérifie
que les exemples valides de `schema/exemples/existence-lien/` leur sont identiques.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field, replace
from datetime import datetime
from pathlib import Path

import pytest

from pipeline.collecte.reseau import Transport, TransportUrllib
from pipeline.liens.__main__ import DELAI_WAYBACK_S, dependances_reelles, principal
from pipeline.liens.instantanes import InstantaneAbsent, InstantaneEcarte, InstantaneTrouve, Recherche
from pipeline.liens.passage import Dependances
from pipeline.liens.sortie import nom_resultat
from pipeline.liens.table import CHEMIN_TABLE, TableLiens, charger_table
from tests.collecte.doubles import Route, reponse
from tests.liens.doubles_liens import ArchiveurFactice, Banc, banc, ecrire_manquante, ecrire_reponse, ecrire_run, reussite

DORE = Path(__file__).resolve().parent / "dore"
ROBOTS = "https://example.org/robots.txt"
ROBOTS_WAYBACK = "https://web.archive.org/robots.txt"
EXISTE = "https://example.org/programme"
MORT = "https://example.org/retire"
INACCESSIBLE = "https://example.org/reserve"
ECARTE = "https://example.org/ferme"
ECHEC = "https://example.org/fragile"
INTERDIT = "https://example.org/prive/note"
PAGE = "<!DOCTYPE html>\r\n<p>Programme — « éducation »</p>\r\n".encode()
COPIE = "<!DOCTYPE html>\r\n<p>Réservé — copie archivée</p>\r\n".encode()
INSTANTANE = "http://web.archive.org/web/20260918071500/https://example.org/reserve"
BRUTE = "https://web.archive.org/web/20260918071500id_/https://example.org/reserve"
INSTANTANE_ECARTE = "http://web.archive.org/web/20260917080000/https://example.org/ferme"
INSTANTANE_ECHEC = "http://web.archive.org/web/20260916090000/https://example.org/fragile"
BRUTE_ECHEC = "https://web.archive.org/web/20260916090000id_/https://example.org/fragile"


@dataclass
class ChercheurParUrl:
    resultats: dict[str, Recherche]
    demandes: list[tuple[str, datetime]] = field(default_factory=list)

    def chercher(self, url: str, instant: datetime) -> Recherche:
        self.demandes.append((url, instant))
        return self.resultats[url]


def _routes() -> dict[str, Route]:
    return {
        ROBOTS: reponse(200, b"User-agent: *\nDisallow: /prive/\n", content_type="text/plain"),
        EXISTE: reponse(200, PAGE, content_type="text/html; charset=utf-8"),
        MORT: reponse(404, b"absent"),
        INACCESSIBLE: reponse(403, b"interdit"),
        ECARTE: reponse(403, b"interdit"),
        ECHEC: reponse(403, b"interdit"),
        ROBOTS_WAYBACK: reponse(200, b"User-agent: *\nAllow: /\n", content_type="text/plain"),
        BRUTE: reponse(200, COPIE, content_type="text/html; charset=utf-8"),
        BRUTE_ECHEC: reponse(503, b"indisponible"),
    }


def _monter(tmp_path: Path, routes: dict[str, Route], fin: str | None = None) -> tuple[Path, Banc]:
    run = tmp_path / "runs" / "2026-09-22"
    ecrire_run(run) if fin is None else ecrire_run(run, fin)
    ecrire_reponse(run, "01JD0000000000000000000001", [EXISTE, MORT], "2026-09-21T09:15:00+02:00")
    ecrire_reponse(run, "01JD0000000000000000000002", [INACCESSIBLE, INTERDIT, EXISTE], "2026-09-20T18:40:12+02:00")
    ecrire_reponse(run, "01JD0000000000000000000003", [], "2026-09-20T18:41:00+02:00", refus_api=True)
    ecrire_manquante(run, "01JD0000000000000000000004")
    ecrire_reponse(run, "01JD0000000000000000000005", [ECARTE, ECHEC], "2026-09-21T08:00:00+02:00")
    chercheur = ChercheurParUrl({
        INACCESSIBLE: InstantaneTrouve(INSTANTANE, "20260918071500", BRUTE),
        ECARTE: InstantaneEcarte(INSTANTANE_ECARTE, "20260917080000", "404"),
        ECHEC: InstantaneTrouve(INSTANTANE_ECHEC, "20260916090000", BRUTE_ECHEC),
        INTERDIT: InstantaneAbsent(),
    })
    return run, banc(routes, archiveur=ArchiveurFactice(reussite(EXISTE)), chercheur=chercheur)  # type: ignore[arg-type]


def _construire(b: Banc):
    """Les dépendances du banc, avec la table que `principal` a chargée (`--table` compris)."""

    def construire(table: TableLiens) -> Dependances:
        return replace(b.deps, table=table)

    return construire


def test_passage_nominal_code_0_et_fichiers_dores(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run, b = _monter(tmp_path, _routes())

    code = principal([str(run)], _construire(b))

    assert code == 0
    sortie = capsys.readouterr().out
    assert "teste : 6 (existe 1, inaccessible 3, mort 1, non_testable 1)" in sortie
    assert f"Échecs Wayback (consignés, verdict inchangé) : 1\n    {ECHEC} — telechargement_instantane : " in sortie
    liens = run / "volume" / "liens"
    for url, dore in [(EXISTE, "existe.json"), (MORT, "mort.json"), (INACCESSIBLE, "inaccessible-instantane.json"),
                      (INTERDIT, "non-testable-robots.json"), (ECARTE, "inaccessible-instantane-ecarte.json"),
                      (ECHEC, "inaccessible-telechargement-echec.json")]:
        assert (liens / nom_resultat(url)).read_bytes() == (DORE / dore).read_bytes(), dore
    pages = sorted(f"{hashlib.sha256(octets).hexdigest()}.html" for octets in (PAGE, COPIE))
    assert sorted(p.name for p in (liens / "pages").iterdir()) == pages
    assert b.archiveur.urls == [EXISTE]
    assert b.chercheur.demandes == [  # type: ignore[attr-defined]  # ordre trié des URL
        (ECARTE, datetime.fromisoformat("2026-09-21T08:00:00+02:00")),
        (ECHEC, datetime.fromisoformat("2026-09-21T08:00:00+02:00")),
        (INTERDIT, datetime.fromisoformat("2026-09-20T18:40:12+02:00")),
        (INACCESSIBLE, datetime.fromisoformat("2026-09-20T18:40:12+02:00")),
    ]


def test_fenetre_encore_ouverte_code_2_aucune_requete(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run, b = _monter(tmp_path, _routes(), fin="2026-09-22T14:30:06+02:00")

    assert principal([str(run)], _construire(b)) == 2
    assert "FenetreOuverte" in capsys.readouterr().err
    assert b.transport.urls() == []
    assert not (run / "volume" / "liens").exists()


def test_fenetre_fermee_exactement_a_l_instant_du_passage(tmp_path: Path) -> None:
    """La fenêtre est semi-ouverte [debut, fin) : à `fin` exactement, elle est fermée."""
    run, b = _monter(tmp_path, _routes(), fin="2026-09-22T14:30:05+02:00")
    assert principal([str(run)], _construire(b)) == 0


def test_table_refusee_code_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run, b = _monter(tmp_path, _routes())
    table = tmp_path / "table.toml"
    table.write_text('version = "table-liens-v2"\n', encoding="utf-8")

    assert principal([str(run), f"--table={table}"], _construire(b)) == 2
    assert "TableIncomplete" in capsys.readouterr().err
    assert b.transport.urls() == []


def test_reponse_illisible_code_2_aucune_requete(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    run, b = _monter(tmp_path, _routes())
    (run / "volume" / "reponses" / "01JD0000000000000000000009.json").write_text("{ pas du json", encoding="utf-8")

    assert principal([str(run)], _construire(b)) == 2
    assert "EntreeRefusee" in capsys.readouterr().err
    assert b.transport.urls() == []


def test_url_sans_verdict_code_1(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    """La table v2 classe tout : une table qui ne classe pas 3xx sert à atteindre ce cas."""
    routes = _routes()
    routes[MORT] = reponse(304)
    run, b = _monter(tmp_path, routes)
    table = tmp_path / "table.toml"
    contenu = CHEMIN_TABLE.read_text(encoding="utf-8").replace('"1xx", "3xx", ', '"1xx", ')
    table.write_text(contenu.replace('"table-liens-v3"', '"table-liens-v99"'), encoding="utf-8")

    assert principal([str(run), f"--table={table}"], _construire(b)) == 1
    assert "reponse_http (code HTTP 304) hors de la table table-liens-v99" in capsys.readouterr().out
    assert not (run / "volume" / "liens" / nom_resultat(MORT)).exists()


def test_d21_cas_4_delai_s_lu_dans_la_table_et_passe_aux_transports(tmp_path: Path) -> None:
    chemin = tmp_path / "table.toml"
    chemin.write_text(CHEMIN_TABLE.read_text(encoding="utf-8").replace("delai_s = 30", "delai_s = 7.5"), encoding="utf-8")
    table = charger_table(chemin)
    delais: list[float] = []

    def transport(delai_s: float) -> Transport:
        delais.append(delai_s)
        return TransportUrllib(delai_s=delai_s)

    deps = dependances_reelles(table, transport)

    assert delais == [7.5, DELAI_WAYBACK_S, 7.5]  # sonde (liens et instantanés bruts), Save Page Now, API de disponibilité
    assert deps.table is table


def test_relance_apres_passage_complet_ne_teste_rien(tmp_path: Path) -> None:
    run, b = _monter(tmp_path, _routes())
    assert principal([str(run)], _construire(b)) == 0

    _run, relance = _monter(tmp_path / "autre", {})
    assert principal([str(run)], _construire(relance)) == 0
    assert relance.transport.urls() == []
