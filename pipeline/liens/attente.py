"""La garde du §6 (protocole 0.22, D57 (2)) : le test des liens ne commence pas tant qu'une réponse attend l'opérateur.

La lecture du journal de tentatives (`recue_non_stockee`, `octets_sans_suite`) vit en TypeScript
(`pipeline/interrogation/journal.ts`, `JournalRequete.reprise()`) : elle n'est pas réécrite ici. Ce
module exécute la commande `pnpm interrogation:attente` (`outils/attente-operateur.ts`) en
sous-processus, avant toute requête et toute écriture, et refuse de poursuivre si elle échoue — y
compris si `node` est introuvable : une garde qui n'a pas pu être posée n'est pas une garde passée.

Codes de la commande : 0, rien n'attend ; 2, une requête attend ou le run est refusé (la raison est
sur sa sortie d'erreur) ; tout autre code, la commande elle-même a échoué.
"""

from __future__ import annotations

import subprocess
from collections.abc import Sequence
from pathlib import Path

RACINE_DEPOT = Path(__file__).resolve().parents[2]
COMMANDE_NODE: tuple[str, ...] = ("node", "--experimental-strip-types", str(RACINE_DEPOT / "outils" / "attente-operateur.ts"))
CODE_ATTENTE = 2


class AttenteOperateur(Exception):
    """Une réponse attend l'opérateur (ou le run est refusé par la garde) : rien n'est testé (§6, 0.22)."""


class GardeImpossible(Exception):
    """La garde n'a pas pu être exécutée (node introuvable, commande en échec) : rien n'est testé."""


def exiger_aucune_attente(repertoire_run: Path, commande: Sequence[str] = COMMANDE_NODE) -> None:
    """Refus nommé tant qu'une réponse du run attend l'opérateur ; ne lit ni n'écrit rien d'autre."""
    try:
        fini = subprocess.run(
            [*commande, f"--run={repertoire_run}"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=False,
            cwd=RACINE_DEPOT,
        )
    except OSError as erreur:
        raise GardeImpossible(f"la garde d'attente de l'opérateur n'a pas pu être lancée ({commande[0]}) : {erreur}") from erreur
    if fini.returncode == 0:
        return
    detail = fini.stderr.strip()
    if fini.returncode == CODE_ATTENTE:
        raise AttenteOperateur(detail)
    raise GardeImpossible(f"la garde d'attente de l'opérateur a échoué (code {fini.returncode}) : {detail}")
