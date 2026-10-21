"""`uv run python -m pipeline.liens <repertoire_du_run>` (ou `pnpm liens <repertoire_du_run>`).

Un passage par run, après la fermeture de la fenêtre d'interrogation, avant la notation (D20, D21).
Écrit `volume/liens/<sha256 de l'URL>.json` et `volume/liens/pages/` (pages des liens qui existent,
versions brutes des instantanés téléchargés). Une relance reprend les
résultats déjà écrits sans les retester ni les réécrire, et teste les autres.

Codes de sortie : 0 si chaque URL a son verdict (un échec Wayback est consigné, il ne compte pas) ;
1 si au moins une URL n'a pas de verdict (résultat hors de la table) ou si un résultat est refusé
(non conforme au schéma, déjà écrit mais incohérent) ; 2 si le passage est refusé avant toute
requête (table refusée, run ou réponse illisible, fenêtre d'interrogation encore ouverte).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Callable, Sequence
from pathlib import Path

from pipeline.collecte.horloge import HorlogeSysteme
from pipeline.collecte.politesse import Cadence
from pipeline.collecte.reseau import LECTURES_LOCATION, Transport, TransportUrllib
from pipeline.collecte.wayback import ArchiveurWayback
from pipeline.liens.entree import EntreeRefusee, liens_cites, lire_run
from pipeline.liens.instantanes import ChercheurInstantanes
from pipeline.liens.iri import CONVERSIONS_IRI
from pipeline.liens.passage import Dependances, code_de_sortie, formater_bilan, passer
from pipeline.liens.sonde import AGENT_LIENS, SondeLiens
from pipeline.liens.table import CHEMIN_TABLE, TableInvalide, TableLiens, charger_table

DELAI_WAYBACK_S = 120.0  # Save Page Now capture la page avant de répondre : c'est lent.
CODE_PASSAGE_REFUSE = 2


class FenetreOuverte(Exception):
    """La fenêtre d'interrogation n'est pas fermée : le test des liens passe après, jamais pendant."""


def dependances_reelles(table: TableLiens, transport: Callable[[float], Transport] = TransportUrllib) -> Dependances:
    """D21 : le délai d'une requête (`table.delai_s`) et la conversion IRI → URI (`table.conversion_iri`)
    viennent de la table. D55 (2) : la relecture de `Location` (`table.lecture_location`) de même. La
    sonde sert aussi à télécharger la version brute des instantanés. Save Page Now garde son propre
    délai. `transport` fabrique un transport à partir d'un délai."""
    horloge = HorlogeSysteme()
    cadence = Cadence(horloge)
    return Dependances(
        sonde=SondeLiens(
            transport(table.delai_s),
            cadence,
            CONVERSIONS_IRI[table.conversion_iri],
            LECTURES_LOCATION[table.lecture_location],
        ),
        archiveur=ArchiveurWayback(transport(DELAI_WAYBACK_S), cadence, horloge, agent_utilisateur=AGENT_LIENS),
        chercheur=ChercheurInstantanes(transport(table.delai_s), cadence),
        horloge=horloge,
        table=table,
    )


def _arguments(arguments: Sequence[str]) -> argparse.Namespace:
    analyseur = argparse.ArgumentParser(
        prog="python -m pipeline.liens",
        description="Test HTTP déterministe des liens cités par les réponses d'un run (§7, D20).",
    )
    analyseur.add_argument("repertoire_run", type=Path, help="runs/<date>, qui porte run.json et volume/reponses/")
    analyseur.add_argument("--table", type=Path, default=CHEMIN_TABLE, help="table résultat → verdict (TOML)")
    return analyseur.parse_args(list(arguments))


def principal(
    arguments: Sequence[str],
    construire: Callable[[TableLiens], Dependances] = dependances_reelles,
) -> int:
    options = _arguments(arguments)
    try:
        deps = construire(charger_table(options.table))
        run = lire_run(options.repertoire_run)
        maintenant = deps.horloge.maintenant()
        if maintenant < run.fin_fenetre:
            raise FenetreOuverte(f"la fenêtre d'interrogation ferme le {run.fin_fenetre.isoformat()}")
        liens = liens_cites(options.repertoire_run, run)
    except (TableInvalide, EntreeRefusee, FenetreOuverte) as refus:
        print(f"passage refusé, aucune requête envoyée — {type(refus).__name__} :", file=sys.stderr)
        print(f"  {refus}", file=sys.stderr)
        return CODE_PASSAGE_REFUSE
    bilans = passer(liens, options.repertoire_run / "volume" / "liens", deps)
    print(formater_bilan(bilans, deps.table.version))
    return code_de_sortie(bilans)


if __name__ == "__main__":
    sys.exit(principal(sys.argv[1:]))
