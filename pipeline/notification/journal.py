"""Les deux fichiers des notifications : la file des dues (lue) et le journal des envois (ajout seul).

Python ne valide pas contre JSON Schema (aucune dépendance de plus) : la forme de chaque ligne due
est contrôlée ici, clé par clé ; les lignes d'envoi écrites ici sont validées contre
`schema/envoi-notification.schema.json` par `tests/notification-envois.test.ts`, sur le fichier
doré que pytest reproduit à l'octet.

Une ligne `en_cours` est écrite et synchronisée sur disque **avant** l'envoi : si le processus
meurt pendant l'envoi, la ligne reste sans issue, l'envoi est « indéterminé », et il n'est jamais
renvoyé sans décision humaine (`--relancer`).
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path

CLES_DUE = ("id", "item_id", "candidat_id", "evenement", "date", "commit")
# Recopie de `schema/notification-due.schema.json#/properties/evenement/enum` (contrôlée par pytest).
EVENEMENTS = ("creation", "modification", "contestation", "decision_panel", "deliberation_sans_majorite")
ETATS_FINAUX = ("envoyee", "echec")


class FichierNotificationsInvalide(Exception):
    """Une ligne illisible ou mal formée : rien n'est réparé, rien n'est envoyé."""


@dataclass(frozen=True)
class Due:
    id: str
    item_id: str
    candidat_id: str
    evenement: str
    date: str
    commit: str


def _lignes(chemin: Path) -> list[str]:
    if not chemin.exists():
        return []
    contenu = chemin.read_text(encoding="utf-8")
    if contenu == "":
        return []
    if not contenu.endswith("\n"):
        raise FichierNotificationsInvalide(f"{chemin} : dernière ligne interrompue")
    return contenu[:-1].split("\n")


def _due(ligne: str, provenance: str) -> Due:
    try:
        valeur = json.loads(ligne)
    except json.JSONDecodeError as erreur:
        raise FichierNotificationsInvalide(f"{provenance} : {erreur}") from erreur
    if not isinstance(valeur, dict) or sorted(valeur) != sorted(CLES_DUE):
        raise FichierNotificationsInvalide(f"{provenance} : clés attendues {CLES_DUE}")
    if not all(isinstance(valeur[cle], str) for cle in CLES_DUE) or valeur["evenement"] not in EVENEMENTS:
        raise FichierNotificationsInvalide(f"{provenance} : valeur mal formée")
    return Due(**valeur)


def lire_dues(repertoire: Path) -> list[Due]:
    chemin = repertoire / "dues.jsonl"
    return [_due(ligne, f"{chemin}, ligne {rang + 1}") for rang, ligne in enumerate(_lignes(chemin))]


def lire_envois(repertoire: Path) -> list[dict]:
    chemin = repertoire / "envois.jsonl"
    envois = []
    for rang, ligne in enumerate(_lignes(chemin)):
        try:
            envois.append(json.loads(ligne))
        except json.JSONDecodeError as erreur:
            raise FichierNotificationsInvalide(f"{chemin}, ligne {rang + 1} : {erreur}") from erreur
    return envois


def ajouter_envoi(repertoire: Path, envoi: dict) -> None:
    """Ajoute une ligne et la synchronise sur disque avant de rendre la main."""
    repertoire.mkdir(parents=True, exist_ok=True)
    ligne = json.dumps(envoi, ensure_ascii=False, separators=(",", ":")) + "\n"
    with open(repertoire / "envois.jsonl", "a", encoding="utf-8") as fichier:
        fichier.write(ligne)
        fichier.flush()
        os.fsync(fichier.fileno())


def envoi_id(notification_ids: list[str]) -> str:
    return hashlib.sha256("\n".join(sorted(notification_ids)).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Etat:
    """Ce que le journal dit des notifications : envoyées, et envois indéterminés."""

    envoyees: frozenset[str]
    orphelins: dict[str, dict]
    tentatives: dict[str, int]
    dernier_etat: dict[str, str]


def etat_du_journal(envois: list[dict]) -> Etat:
    """Un `en_cours` est orphelin tant qu'aucune issue de même envoi ne le suit, à sa tentative ou
    à une tentative ultérieure (une relance réglée clôt l'orphelin qu'elle relance)."""
    envoyees = {nid for envoi in envois if envoi["etat"] == "envoyee" for nid in envoi["notification_ids"]}
    derniere_issue: dict[str, int] = {}
    for envoi in envois:
        if envoi["etat"] in ETATS_FINAUX:
            derniere_issue[envoi["envoi_id"]] = max(derniere_issue.get(envoi["envoi_id"], 0), envoi["tentative"])
    orphelins = {
        envoi["envoi_id"]: envoi
        for envoi in envois
        if envoi["etat"] == "en_cours" and envoi["tentative"] > derniere_issue.get(envoi["envoi_id"], 0)
    }
    tentatives: dict[str, int] = {}
    dernier_etat: dict[str, str] = {}
    for envoi in envois:
        tentatives[envoi["envoi_id"]] = max(tentatives.get(envoi["envoi_id"], 0), envoi["tentative"])
        dernier_etat[envoi["envoi_id"]] = envoi["etat"]
    return Etat(frozenset(envoyees), orphelins, tentatives, dernier_etat)
