"""La table résultat → verdict (D20, D21), lue dans `config/test-liens.toml`, jamais écrite dans le code.

Cas limite 15 de D20 : une table ambiguë (un code dans deux verdicts), incomplète (clé manquante,
version absente) ou inconnue (clé, issue ou verdict que le code ne connaît pas) est refusée au
chargement, par une erreur nommée. Cas limite 4 de D21 : `delai_s` et `conversion_iri` sont lus dans
la table, une table sans `delai_s` ou avec une conversion inconnue est refusée. D55 (2) : `lecture_location`
suit la même règle. Puis la table réelle (table-liens-v3) est confrontée, ligne à ligne, au texte de
D20 et de D21.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pipeline.liens.constat import ISSUES_SANS_REPONSE, Constat
from pipeline.liens.table import (
    CHEMIN_TABLE,
    TableAmbigue,
    TableIllisible,
    TableIncomplete,
    TableInconnue,
    TableLiens,
    charger_table,
)

TABLE_MINIMALE = """
version = "table-liens-v9"
conversion_iri = "rfc3987-3.1"
lecture_location = "utf-8-si-aller-retour-latin-1"
delai_s = 12

[tentatives]
maximum = 3
espacement_s = 60

[transitoire]
codes_http = [429]
classes_http = ["5xx"]
issues = ["delai_depasse"]

[verdicts.existe]
codes_http = []
classes_http = ["2xx"]
issues = []

[verdicts.mort]
codes_http = [404]
classes_http = []
issues = ["domaine_inexistant"]

[verdicts.inaccessible]
codes_http = []
classes_http = ["4xx", "5xx"]
issues = ["delai_depasse"]

[verdicts.non_testable]
codes_http = []
classes_http = []
issues = ["robots_interdit"]
"""


def _ecrire(tmp_path: Path, contenu: str) -> Path:
    chemin = tmp_path / "table.toml"
    chemin.write_text(contenu, encoding="utf-8")
    return chemin


def _http(code: int) -> Constat:
    return Constat(issue="reponse_http", code_http=code)


def test_la_table_minimale_se_charge(tmp_path: Path) -> None:
    table = charger_table(_ecrire(tmp_path, TABLE_MINIMALE))
    assert table.version == "table-liens-v9"
    assert table.verdict(_http(404)) == "mort"


def test_d21_cas_4_delai_s_lu_dans_la_table(tmp_path: Path) -> None:
    assert charger_table(_ecrire(tmp_path, TABLE_MINIMALE)).delai_s == 12.0


def test_d21_cas_4_table_sans_delai_s_est_incomplete(tmp_path: Path) -> None:
    with pytest.raises(TableIncomplete, match="delai_s"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace("delai_s = 12\n", "")))


@pytest.mark.parametrize("valeur", ["0", "-1", '"30"', "true"])
def test_d21_cas_4_delai_s_non_positif_ou_non_numerique_refuse(tmp_path: Path, valeur: str) -> None:
    with pytest.raises(TableInconnue, match="delai_s"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace("delai_s = 12", f"delai_s = {valeur}")))


def test_d21_cas_4_conversion_iri_inconnue_est_refusee(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('conversion_iri = "rfc3987-3.1"', 'conversion_iri = "whatwg-url"')
    with pytest.raises(TableInconnue, match="whatwg-url"):
        charger_table(_ecrire(tmp_path, contenu))


def test_d21_table_sans_conversion_iri_est_incomplete(tmp_path: Path) -> None:
    with pytest.raises(TableIncomplete, match="conversion_iri"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace('conversion_iri = "rfc3987-3.1"\n', "")))


def test_d55_2_lecture_location_lue_dans_la_table(tmp_path: Path) -> None:
    table = charger_table(_ecrire(tmp_path, TABLE_MINIMALE))
    assert table.lecture_location == "utf-8-si-aller-retour-latin-1"


def test_d55_2_table_sans_lecture_location_est_incomplete(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('lecture_location = "utf-8-si-aller-retour-latin-1"\n', "")
    with pytest.raises(TableIncomplete, match="lecture_location"):
        charger_table(_ecrire(tmp_path, contenu))


def test_d55_2_lecture_location_inconnue_est_refusee(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace(
        'lecture_location = "utf-8-si-aller-retour-latin-1"', 'lecture_location = "latin-1-toujours"'
    )
    with pytest.raises(TableInconnue, match="latin-1-toujours"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_code_present_dans_deux_verdicts_est_ambigu(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace("[verdicts.inaccessible]\ncodes_http = []", "[verdicts.inaccessible]\ncodes_http = [404]")
    with pytest.raises(TableAmbigue, match="404"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_issue_presente_dans_deux_verdicts_est_ambigue(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('issues = ["robots_interdit"]', 'issues = ["robots_interdit", "delai_depasse"]')
    with pytest.raises(TableAmbigue, match="delai_depasse"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_classe_presente_dans_deux_verdicts_est_ambigue(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('classes_http = ["2xx"]', 'classes_http = ["2xx", "5xx"]')
    with pytest.raises(TableAmbigue, match="5xx"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_cle_manquante_est_une_table_incomplete(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace("espacement_s = 60\n", "")
    with pytest.raises(TableIncomplete, match="espacement_s"):
        charger_table(_ecrire(tmp_path, contenu))


def test_cas_15_verdict_manquant_est_une_table_incomplete(tmp_path: Path) -> None:
    debut = TABLE_MINIMALE.index("[verdicts.non_testable]")
    with pytest.raises(TableIncomplete, match="non_testable"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE[:debut]))


def test_cas_15_version_absente_est_une_table_incomplete(tmp_path: Path) -> None:
    contenu = TABLE_MINIMALE.replace('version = "table-liens-v9"\n', "")
    with pytest.raises(TableIncomplete, match="version"):
        charger_table(_ecrire(tmp_path, contenu))


@pytest.mark.parametrize(
    ("avant", "apres", "motif"),
    [
        ('version = "table-liens-v9"', 'version = "v9"', "version"),
        ('issues = ["robots_interdit"]', 'issues = ["robots_interdit", "lien_suspect"]', "lien_suspect"),
        ('classes_http = ["2xx"]', 'classes_http = ["2xx", "6xx"]', "6xx"),
        ("codes_http = [404]", "codes_http = [404, 999]", "999"),
        ("[verdicts.mort]", "[verdicts.perime]\ncodes_http = []\nclasses_http = []\nissues = []\n\n[verdicts.mort]", "perime"),
        ("[tentatives]", "agent = 'x'\n\n[tentatives]", "agent"),
    ],
)
def test_cas_15_table_inconnue(tmp_path: Path, avant: str, apres: str, motif: str) -> None:
    with pytest.raises(TableInconnue, match=motif):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace(avant, apres, 1)))


def test_tentatives_nulles_refusees(tmp_path: Path) -> None:
    with pytest.raises(TableInconnue, match="maximum"):
        charger_table(_ecrire(tmp_path, TABLE_MINIMALE.replace("maximum = 3", "maximum = 0")))


def test_toml_illisible_est_nomme(tmp_path: Path) -> None:
    with pytest.raises(TableIllisible):
        charger_table(_ecrire(tmp_path, "version = "))


# --------------------------------------------------------------------- la table réelle, contre D20


@pytest.fixture
def table() -> TableLiens:
    return charger_table(CHEMIN_TABLE)


@pytest.mark.parametrize("code", [200, 201, 204, 206, 299])
def test_d20_2xx_existe(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "existe"


@pytest.mark.parametrize("code", [404, 410])
def test_d20_404_410_mort(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "mort"


@pytest.mark.parametrize("code", [400, 401, 403, 405, 418, 429, 451, 500, 502, 503, 599])
def test_d20_autres_4xx_et_5xx_inaccessible(table: TableLiens, code: int) -> None:
    assert table.verdict(_http(code)) == "inaccessible"


@pytest.mark.parametrize(
    ("issue", "verdict"),
    [
        ("domaine_inexistant", "mort"),
        ("delai_depasse", "inaccessible"),
        ("connexion_refusee", "inaccessible"),
        ("erreur_tls", "inaccessible"),
        ("robots_injoignable", "inaccessible"),
        ("robots_interdit", "non_testable"),
        ("schema_non_http", "non_testable"),
        ("url_malformee", "non_testable"),
        ("redirections_excessives", "non_testable"),
        ("boucle_redirection", "non_testable"),
    ],
)
def test_d20_issues(table: TableLiens, issue: str, verdict: str) -> None:
    assert table.verdict(Constat(issue=issue, code_http=None)) == verdict


@pytest.mark.parametrize(
    "constat",
    [
        Constat(issue="erreur_reseau", code_http=None),
        Constat(issue="redirection_sans_location", code_http=302),
        Constat(issue="reponse_http", code_http=100),
        Constat(issue="reponse_http", code_http=103),
        Constat(issue="reponse_http", code_http=300),
        Constat(issue="reponse_http", code_http=304),
        Constat(issue="reponse_http", code_http=305),
    ],
)
def test_d21_cas_1_nouvelles_issues_inaccessibles(table: TableLiens, constat: Constat) -> None:
    assert table.verdict(constat) == "inaccessible"


def test_d21_url_non_ascii_n_est_plus_une_issue() -> None:
    with pytest.raises(ValueError, match="url_non_ascii"):
        Constat(issue="url_non_ascii", code_http=None)


def test_d21_la_table_v2_classe_toute_issue_et_toute_classe(table: TableLiens) -> None:
    """Plus aucun résultat sans verdict avec la table réelle : chaque issue et chaque classe a le sien."""
    for issue in ISSUES_SANS_REPONSE:
        assert table.verdict(Constat(issue=issue, code_http=None)) is not None, issue
    for code in range(100, 600):
        assert table.verdict(_http(code)) is not None, code


def test_d21_tentatives_transitoires_delai_et_conversion(table: TableLiens) -> None:
    assert table.version == "table-liens-v3"
    assert table.conversion_iri == "rfc3987-3.1"
    assert table.lecture_location == "utf-8-si-aller-retour-latin-1"
    assert table.delai_s == 30.0
    assert (table.tentatives_max, table.espacement_s) == (3, 60.0)
    transitoires = [_http(429), _http(500), _http(503), Constat(issue="delai_depasse", code_http=None),
                    Constat(issue="connexion_refusee", code_http=None), Constat(issue="erreur_reseau", code_http=None),
                    Constat(issue="robots_injoignable", code_http=None)]
    definitifs = [_http(404), _http(410), _http(403), _http(200), _http(304), Constat(issue="erreur_tls", code_http=None),
                  Constat(issue="domaine_inexistant", code_http=None),
                  Constat(issue="redirection_sans_location", code_http=302)]
    assert all(table.est_transitoire(c) for c in transitoires)
    assert not any(table.est_transitoire(c) for c in definitifs)
