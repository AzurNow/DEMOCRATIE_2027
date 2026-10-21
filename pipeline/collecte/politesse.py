"""Téléchargement poli : robots.txt, une requête par seconde et par hôte, redirections contrôlées.

Norme du projet (`docs/PROTOCOLE.md` §6, appliquée à toute la collecte) : « dans le respect de
robots.txt et à un rythme d'au plus une page par seconde ». Une URL interdite par robots.txt est
refusée et consignée, jamais contournée ; un robots.txt injoignable (erreur réseau, 5xx) est une
erreur, jamais une autorisation implicite.
"""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from pipeline.collecte.horloge import Horloge
from pipeline.collecte.reseau import ErreurReseau, ReponseHttp, Transport, relire_location

AGENT_UTILISATEUR = "BancEssai2027-collecte/0.1 (+https://github.com/AzurNow/DEMOCRATIE_2027)"
INTERVALLE_PAR_HOTE_S = 1.0
MAX_REDIRECTIONS = 5
STATUTS_REDIRECTION = frozenset({301, 302, 303, 307, 308})
SCHEMAS_ADMIS = frozenset({"http", "https"})


class EchecCollecte(Exception):
    """Une source qui ne peut pas être collectée. Le motif est consigné dans le rapport."""

    def __init__(self, motif: str) -> None:
        super().__init__(motif)
        self.motif = motif


@dataclass(frozen=True)
class Telechargement:
    url_finale: str
    type_contenu: str | None
    """En-tête `Content-Type` tel que reçu ; `None` s'il est absent, jamais deviné."""
    corps: bytes


class Cadence:
    """Au moins `intervalle_s` entre deux débuts de requête vers un même hôte."""

    def __init__(self, horloge: Horloge, intervalle_s: float = INTERVALLE_PAR_HOTE_S) -> None:
        self._horloge = horloge
        self._intervalle_s = intervalle_s
        self._dernieres: dict[str, float] = {}

    def attendre(self, hote: str) -> None:
        if hote in self._dernieres:
            reste = self._intervalle_s - (self._horloge.monotone() - self._dernieres[hote])
            if reste > 0:
                self._horloge.dormir(reste)
        self._dernieres[hote] = self._horloge.monotone()


def hote(url: str) -> str:
    nom = urlsplit(url).hostname
    if nom is None:
        raise EchecCollecte(f"URL sans hôte : {url}")
    return nom


def _origine(url: str) -> str:
    morceaux = urlsplit(url)
    return f"{morceaux.scheme}://{morceaux.netloc}"


def _cible_de_redirection(courante: str, reponse: ReponseHttp) -> str:
    """L'en-tête `Location` est relu en UTF-8 quand l'aller-retour latin-1 → UTF-8 réussit (D55 (2)) :
    `http.client` décode tout en-tête en latin-1, et un `Location` envoyé en octets UTF-8 bruts en
    ressort mal décodé."""
    if "location" not in reponse.en_tetes:
        raise EchecCollecte(f"redirection HTTP {reponse.statut} sans en-tête Location : {courante}")
    cible = urljoin(courante, relire_location(reponse.en_tetes["location"]))
    if urlsplit(cible).scheme not in SCHEMAS_ADMIS:
        raise EchecCollecte(f"redirection hors http ou https : {courante} → {cible}")
    return cible


def interpreter_robots(reponse: ReponseHttp) -> RobotFileParser:
    """2xx : règles lues. 401/403 : tout est interdit. Autre 4xx : pas de robots.txt, tout est
    permis. Tout le reste (5xx, 1xx) : erreur. Public pour le test des liens (`pipeline/liens`),
    qui lit robots.txt selon les mêmes règles."""
    regles = RobotFileParser()
    if 200 <= reponse.statut < 300:
        regles.parse(_decoder_robots(reponse.corps).splitlines())
    elif reponse.statut in (401, 403):
        regles.disallow_all = True
    elif 400 <= reponse.statut < 500:
        regles.allow_all = True
    else:
        raise EchecCollecte(f"HTTP {reponse.statut}")
    return regles


def _decoder_robots(corps: bytes) -> str:
    try:
        return corps.decode("utf-8")
    except UnicodeDecodeError as erreur:
        raise EchecCollecte(f"contenu non UTF-8 : {erreur}") from erreur


class ClientPoli:
    def __init__(
        self,
        transport: Transport,
        cadence: Cadence,
        agent_utilisateur: str = AGENT_UTILISATEUR,
        max_redirections: int = MAX_REDIRECTIONS,
    ) -> None:
        self._transport = transport
        self._cadence = cadence
        self._agent = agent_utilisateur
        self._max_redirections = max_redirections
        self._robots: dict[str, RobotFileParser | EchecCollecte] = {}

    def telecharger(self, url: str) -> Telechargement:
        reponse, url_finale = self._suivre(url, verifier_robots=True)
        if reponse.statut != 200:
            raise EchecCollecte(f"HTTP {reponse.statut}")
        if not reponse.corps:
            raise EchecCollecte("réponse vide (0 octet) : un document vide n'est pas une source")
        type_contenu = reponse.en_tetes["content-type"] if "content-type" in reponse.en_tetes else None
        return Telechargement(url_finale=url_finale, type_contenu=type_contenu, corps=reponse.corps)

    def _suivre(self, url: str, verifier_robots: bool) -> tuple[ReponseHttp, str]:
        courante = url
        for _etape in range(self._max_redirections + 1):
            if verifier_robots:
                self.verifier_robots(courante)
            reponse = self._envoyer(courante)
            if reponse.statut not in STATUTS_REDIRECTION:
                return reponse, courante
            courante = _cible_de_redirection(courante, reponse)
        raise EchecCollecte(f"plus de {self._max_redirections} redirections depuis {url}")

    def _envoyer(self, url: str) -> ReponseHttp:
        self._cadence.attendre(hote(url))
        try:
            return self._transport.envoyer(url, {"User-Agent": self._agent})
        except ErreurReseau as erreur:
            raise EchecCollecte(str(erreur)) from erreur

    def verifier_robots(self, url: str) -> None:
        """Lève `EchecCollecte` si `robots.txt` interdit l'URL ou n'a pas pu être lu. Public pour les
        téléchargements qui ne passent pas par ce client (yt-dlp, `media.py`)."""
        origine = _origine(url)
        if origine not in self._robots:
            self._robots[origine] = self._lire_robots(origine)
        regles = self._robots[origine]
        if isinstance(regles, EchecCollecte):
            raise EchecCollecte(regles.motif)
        if not regles.can_fetch(self._agent, url):
            raise EchecCollecte(f"interdit par robots.txt : {url}")

    def _lire_robots(self, origine: str) -> RobotFileParser | EchecCollecte:
        """Le résultat, erreur comprise, est gardé pour la durée du lot : un hôte en panne n'est
        pas resollicité à chaque URL."""
        try:
            reponse, _url_finale = self._suivre(f"{origine}/robots.txt", verifier_robots=False)
            return interpreter_robots(reponse)
        except EchecCollecte as echec:
            return EchecCollecte(f"robots.txt injoignable ({origine}) : {echec.motif}")
