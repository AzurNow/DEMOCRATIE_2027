"""Les événements de la file des dues lus par `pnpm notifier` (D72 (12), §10 et annexe E, 0.30).

`EVENEMENTS` recopie l'énumération de `schema/notification-due.schema.json` : Python ne valide pas
contre JSON Schema (aucune dépendance de plus), la recopie est confrontée au schéma ici.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from pipeline.notification.journal import EVENEMENTS, FichierNotificationsInvalide, lire_dues
from tests.notification.doubles import due

SCHEMA = Path(__file__).resolve().parents[2] / "schema" / "notification-due.schema.json"


def _ecrire(repertoire: Path, *dues: dict) -> None:
    (repertoire / "dues.jsonl").write_text("".join(json.dumps(d) + "\n" for d in dues), encoding="utf-8")


def test_evenements_recopient_l_enumeration_du_schema() -> None:
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    assert EVENEMENTS == tuple(schema["properties"]["evenement"]["enum"])


def test_deliberation_sans_majorite_acceptee(tmp_path: Path) -> None:
    _ecrire(tmp_path, due(1, "demo-a", "deliberation_sans_majorite"))
    assert [d.evenement for d in lire_dues(tmp_path)] == ["deliberation_sans_majorite"]


def test_evenement_inconnu_refuse(tmp_path: Path) -> None:
    _ecrire(tmp_path, due(1, "demo-a", "egalite_des_voix"))
    with pytest.raises(FichierNotificationsInvalide, match="valeur mal formée"):
        lire_dues(tmp_path)
