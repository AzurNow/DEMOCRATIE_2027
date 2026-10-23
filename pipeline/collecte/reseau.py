"""Transport HTTP : une requête GET, une réponse, sans suivre les redirections.

Les redirections sont suivies plus haut (`politesse.py`), une étape à la fois, pour que chaque étape
passe par la cadence et par robots.txt, et que le schéma de chaque cible soit vérifié.
"""

from __future__ import annotations

import http.client
import socket
import ssl
import urllib.error
import urllib.request
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class ReponseHttp:
    statut: int
    en_tetes: Mapping[str, str]
    """Noms d'en-têtes en minuscules. Un en-tête absent est absent, jamais remplacé."""
    corps: bytes


class ErreurReseau(Exception):
    """Aucune réponse HTTP exploitable : délai dépassé, connexion refusée, corps tronqué.

    Les sous-classes ci-dessous classent la cause quand le transport la reconnaît. La collecte n'en
    lit que le message, inchangé ; le test des liens (`pipeline/liens`, décision D20) en a besoin
    parce que sa table distingue un domaine inexistant (mort) d'un délai dépassé (inaccessible).
    Une cause non reconnue reste une `ErreurReseau` générale, jamais rangée dans une classe voisine.
    """


class DelaiDepasse(ErreurReseau):
    """Le serveur n'a pas répondu dans le délai."""


class ConnexionRefusee(ErreurReseau):
    """La connexion TCP a été refusée par l'hôte."""


class ErreurTls(ErreurReseau):
    """La négociation TLS a échoué (certificat invalide, protocole refusé)."""


class NomIntrouvable(ErreurReseau):
    """Le résolveur affirme que le nom n'existe pas (EAI_NONAME, EAI_NODATA). Une panne du
    résolveur (EAI_AGAIN, EAI_FAIL) n'en est pas une : elle reste une `ErreurReseau` générale."""


CODES_NOM_INTROUVABLE = frozenset({socket.EAI_NONAME, socket.EAI_NODATA})


class Transport(Protocol):
    def envoyer(self, url: str, en_tetes: dict[str, str]) -> ReponseHttp: ...


class _SansRedirection(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args: object, **kwargs: object) -> None:
        return None


def _en_tetes(message: http.client.HTTPMessage) -> dict[str, str]:
    return {cle.lower(): valeur for cle, valeur in message.items()}


def relire_location(valeur: str) -> str:
    """D55 (2) : `http.client` décode tout en-tête en latin-1 (RFC 7230, bytes 8 bits sans charset).
    Un serveur qui envoie `Location` en octets UTF-8 bruts (pratique courante pour un slug accentué,
    non conforme mais suivie par tout navigateur) en ressort donc mal décodée. Si l'aller-retour
    latin-1 → UTF-8 réussit, la chaîne réellement envoyée est rendue (même règle que `requests`) ;
    sinon, `valeur` est rendue telle quelle. Une valeur ASCII est inchangée dans les deux cas. Ne
    fait rien d'autre : pas de percent-encoding, qui est le rôle de la conversion IRI (`pipeline.liens.iri`)."""
    try:
        octets = valeur.encode("latin-1")
    except UnicodeEncodeError:
        return valeur
    try:
        return octets.decode("utf-8")
    except UnicodeDecodeError:
        return valeur


LECTURES_LOCATION: dict[str, Callable[[str], str]] = {"utf-8-si-aller-retour-latin-1": relire_location}
"""Règles de relecture de `Location` qu'une table peut déclarer (`lecture_location`, D55 (2))."""


class TransportUrllib:
    """Transport réel, bibliothèque standard seulement (décision D2)."""

    def __init__(self, delai_s: float) -> None:
        self._delai_s = delai_s
        self._ouvreur = urllib.request.build_opener(_SansRedirection)

    def envoyer(self, url: str, en_tetes: dict[str, str]) -> ReponseHttp:
        requete = urllib.request.Request(url, headers=en_tetes, method="GET")
        try:
            with self._ouvreur.open(requete, timeout=self._delai_s) as flux:
                return ReponseHttp(flux.status, _en_tetes(flux.headers), flux.read())
        except urllib.error.HTTPError as erreur:
            return self._reponse_d_erreur(erreur)
        except (TimeoutError, socket.timeout) as erreur:
            raise DelaiDepasse(f"délai dépassé ({self._delai_s:g} s)") from erreur
        except (OSError, http.client.HTTPException) as erreur:
            raise classe_d_erreur_reseau(erreur)(_motif_reseau(erreur, self._delai_s)) from erreur
        except ValueError as erreur:
            raise ErreurReseau(f"URL non encodable pour l'envoi : {erreur}") from erreur

    def _reponse_d_erreur(self, erreur: urllib.error.HTTPError) -> ReponseHttp:
        """4xx, 5xx et 3xx non suivis : ce sont des réponses, pas des pannes du réseau."""
        try:
            corps = erreur.read()
        except (OSError, http.client.HTTPException) as lecture:
            raise ErreurReseau(f"HTTP {erreur.code}, corps illisible : {lecture}") from lecture
        return ReponseHttp(erreur.code, _en_tetes(erreur.headers), corps)


def _cause(erreur: BaseException) -> BaseException:
    """`URLError` enveloppe la cause dans `reason` ; les autres erreurs sont leur propre cause."""
    raison = erreur.reason if isinstance(erreur, urllib.error.URLError) else None
    return raison if isinstance(raison, BaseException) else erreur


def classe_d_erreur_reseau(erreur: BaseException) -> type[ErreurReseau]:
    """La classe de l'erreur levée par le transport, d'après sa cause. Le message n'en dépend pas."""
    cause = _cause(erreur)
    if isinstance(cause, (TimeoutError, socket.timeout)):
        return DelaiDepasse
    if isinstance(cause, ConnectionRefusedError):
        return ConnexionRefusee
    if isinstance(cause, ssl.SSLError):
        return ErreurTls
    if isinstance(cause, socket.gaierror) and cause.errno in CODES_NOM_INTROUVABLE:
        return NomIntrouvable
    return ErreurReseau


def _motif_reseau(erreur: BaseException, delai_s: float) -> str:
    """Même cause que `classe_d_erreur_reseau` (`_cause`), pour que la classe et le message
    s'accordent toujours sur ce qui a échoué."""
    detail = _cause(erreur)
    if isinstance(detail, (TimeoutError, socket.timeout)):
        return f"délai dépassé ({delai_s:g} s)"
    return f"erreur réseau : {type(detail).__name__}: {detail}"
