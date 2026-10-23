"""Ce que `pnpm notifier` fait d'une exécution, sans réseau ni horloge en dur (tout est injecté).

- **Un courriel par campagne et par exécution**, qui liste les items dus de la campagne (§4).
- **Idempotence** : une notification déjà citée par un envoi `envoyee` n'est plus due. Un envoi
  `en_cours` sans issue est « indéterminé » : ses notifications ne partent plus seules, et seul
  `--relancer=<envoi_id>` les renvoie, telles quelles, avec le même Message-ID.
- **Échec** : ligne `echec`, code de sortie non nul ; les notifications restent dues et repartent
  à l'exécution suivante.
- **Sans adresse** (contact `null`, ou candidat absent du périmètre) : ligne
  `sans_destinataire_connu`, re-résolue à chaque exécution ; une ligne identique à la précédente
  n'est pas répétée. Un candidat retiré est notifié s'il a encore une adresse : le statut au gel
  n'entre pas dans la décision.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Protocol

from pipeline.notification import courriel
from pipeline.notification.journal import (
    Due,
    Etat,
    FichierNotificationsInvalide,
    ajouter_envoi,
    envoi_id,
    etat_du_journal,
    lire_dues,
    lire_envois,
)
from pipeline.notification.transport import EchecEnvoi

CODE_SUCCES = 0
CODE_ECHEC = 1
CODE_REFUS = 2


class ContactsInvalides(Exception):
    """Entrée standard qui n'est pas la sortie de `outils/contacts.ts`."""


class Transport(Protocol):
    def envoyer(self, destinataire: str, octets: bytes) -> int: ...


@dataclass(frozen=True)
class Contact:
    candidat_id: str
    adresse: str | None


def _contact(brut: object) -> Contact:
    if not isinstance(brut, dict) or not isinstance(brut.get("candidat_id"), str):
        raise ContactsInvalides("candidat sans candidat_id")
    declare = brut.get("contact_notification", "absent")
    if declare != "absent" and declare is not None and not isinstance(declare, dict):
        raise ContactsInvalides(f"{brut['candidat_id']} : contact_notification mal formé")
    if declare == "absent":
        raise ContactsInvalides(f"{brut['candidat_id']} : contact_notification absent")
    adresse = None if declare is None else declare.get("adresse")
    if adresse is not None and not isinstance(adresse, str):
        raise ContactsInvalides(f"{brut['candidat_id']} : adresse mal formée")
    return Contact(brut["candidat_id"], adresse)


def lire_contacts(texte: str) -> dict[str, Contact]:
    try:
        valeur = json.loads(texte)
    except json.JSONDecodeError as erreur:
        raise ContactsInvalides(f"entrée standard illisible : {erreur}") from erreur
    if not isinstance(valeur, dict) or not isinstance(valeur.get("candidats"), list):
        raise ContactsInvalides("entrée standard : objet { candidats: [...] } attendu")
    contacts = [_contact(brut) for brut in valeur["candidats"]]
    return {contact.candidat_id: contact for contact in contacts}


@dataclass(frozen=True)
class Groupe:
    candidat_id: str
    dues: list[Due]

    @property
    def identifiant(self) -> str:
        return envoi_id([due.id for due in self.dues])

    @property
    def ids(self) -> list[str]:
        return sorted(due.id for due in self.dues)


def groupes_dus(dues: list[Due], etat: Etat) -> list[Groupe]:
    bloques = {nid for orphelin in etat.orphelins.values() for nid in orphelin["notification_ids"]}
    restants = [due for due in dues if due.id not in etat.envoyees and due.id not in bloques]
    par_candidat: dict[str, list[Due]] = {}
    for due in restants:
        par_candidat.setdefault(due.candidat_id, []).append(due)
    return [Groupe(candidat, par_candidat[candidat]) for candidat in sorted(par_candidat)]


def resoudre(groupe: Groupe, contacts: dict[str, Contact]) -> tuple[str | None, str | None]:
    """L'adresse du groupe, ou le motif de son absence."""
    contact = contacts.get(groupe.candidat_id)
    if contact is None:
        return None, "candidat absent du périmètre du run"
    if contact.adresse is None:
        return None, "aucune adresse de contact générique déclarée au périmètre"
    return contact.adresse, None


@dataclass
class Execution:
    repertoire: Path
    gabarits: courriel.Gabarits
    contacts: dict[str, Contact]
    maintenant: Callable[[], datetime]
    transport: Transport | None
    expediteur: str | None
    sortie: Callable[[str], None]
    ecrit: int = 0


def _ligne(groupe: Groupe, tentative: int, date: datetime, etat: str, **reste: object) -> dict:
    champs = {"destinataire": None, "preuve_sha256": None, "message_id": None, "code_smtp": None, "erreur": None}
    champs.update(reste)
    return {
        "envoi_id": groupe.identifiant,
        "notification_ids": groupe.ids,
        "candidat_id": groupe.candidat_id,
        "tentative": tentative,
        "date": date.isoformat(timespec="seconds"),
        "etat": etat,
        **champs,
    }


def _ecrire(execution: Execution, ligne: dict) -> None:
    ajouter_envoi(execution.repertoire, ligne)
    execution.ecrit += 1


def _sans_destinataire(execution: Execution, groupe: Groupe, etat: Etat, motif: str) -> None:
    execution.sortie(f"  {groupe.candidat_id} : {len(groupe.dues)} notification(s), sans destinataire ({motif})\n")
    if execution.transport is None or etat.dernier_etat.get(groupe.identifiant) == "sans_destinataire_connu":
        return
    tentative = etat.tentatives.get(groupe.identifiant, 0) + 1
    _ecrire(execution, _ligne(groupe, tentative, execution.maintenant(), "sans_destinataire_connu", erreur=motif))


def _envoyer(execution: Execution, transport: Transport, groupe: Groupe, etat: Etat, adresse: str) -> bool:
    date = execution.maintenant()
    tentative = etat.tentatives.get(groupe.identifiant, 0) + 1
    mid = courriel.message_id(groupe.identifiant, str(execution.expediteur))
    entetes = {"expediteur": str(execution.expediteur), "destinataire": adresse, "message_id": mid}
    octets = courriel.construire(execution.gabarits, groupe.dues, entetes, date)
    commun = {"destinataire": adresse, "preuve_sha256": courriel.preuve(octets), "message_id": mid}
    _ecrire(execution, _ligne(groupe, tentative, date, "en_cours", **commun))
    try:
        code = transport.envoyer(adresse, octets)
    except EchecEnvoi as erreur:
        _ecrire(execution, _ligne(groupe, tentative, execution.maintenant(), "echec", **commun, code_smtp=erreur.code, erreur=str(erreur)))
        execution.sortie(f"  {groupe.candidat_id} : ÉCHEC ({erreur})\n")
        return False
    _ecrire(execution, _ligne(groupe, tentative, execution.maintenant(), "envoyee", **commun, code_smtp=code))
    execution.sortie(f"  {groupe.candidat_id} : envoyé à {adresse} ({len(groupe.dues)} notification(s))\n")
    return True


def traiter(execution: Execution, groupe: Groupe, etat: Etat) -> bool:
    """Vrai si le groupe est réglé sans échec (envoyé, simulé, ou sans destinataire)."""
    adresse, motif = resoudre(groupe, execution.contacts)
    if adresse is None:
        _sans_destinataire(execution, groupe, etat, str(motif))
        return True
    if execution.transport is None:
        execution.sortie(f"  {groupe.candidat_id} : {len(groupe.dues)} notification(s) à envoyer à {adresse}\n")
        return True
    return _envoyer(execution, execution.transport, groupe, etat, adresse)


def _rapporter_orphelins(execution: Execution, etat: Etat) -> None:
    for identifiant, orphelin in sorted(etat.orphelins.items()):
        execution.sortie(
            f"  INDÉTERMINÉ : envoi {identifiant} (tentative {orphelin['tentative']}, {orphelin['candidat_id']}) "
            f"interrompu sans issue ; jamais renvoyé seul. Vérifier la boîte d'envoi, puis --relancer={identifiant}.\n"
        )


def executer(execution: Execution) -> int:
    etat = etat_du_journal(lire_envois(execution.repertoire))
    groupes = groupes_dus(lire_dues(execution.repertoire), etat)
    execution.sortie(f"Campagnes à notifier : {len(groupes)}\n")
    reussis = [traiter(execution, groupe, etat) for groupe in groupes]
    _rapporter_orphelins(execution, etat)
    if execution.transport is None:
        execution.sortie("\nSimulation : rien n'a été envoyé ni écrit. Ajouter --envoyer.\n")
    return CODE_ECHEC if not all(reussis) or etat.orphelins else CODE_SUCCES


def relancer(execution: Execution, identifiant: str) -> int:
    """Renvoie un envoi indéterminé, tel quel : mêmes notifications, même Message-ID, rien d'autre."""
    etat = etat_du_journal(lire_envois(execution.repertoire))
    orphelin = etat.orphelins.get(identifiant)
    if orphelin is None:
        execution.sortie(f"Aucun envoi indéterminé {identifiant} : rien n'est relancé.\n")
        return CODE_REFUS
    dues = {due.id: due for due in lire_dues(execution.repertoire)}
    manquantes = [nid for nid in orphelin["notification_ids"] if nid not in dues]
    if manquantes:
        raise FichierNotificationsInvalide(f"envoi {identifiant} : notifications absentes de dues.jsonl : {manquantes}")
    groupe = Groupe(orphelin["candidat_id"], [dues[nid] for nid in orphelin["notification_ids"]])
    return CODE_SUCCES if traiter(execution, groupe, etat) else CODE_ECHEC
