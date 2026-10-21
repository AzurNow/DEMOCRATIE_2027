"""Une tentative de test d'un lien cité : GET seul, selon la norme de collecte du §6 (D20, D21).

Réutilise la pile de la collecte : transport sans redirection automatique (`reseau.py`), cadence
d'une requête par seconde et par hôte (`politesse.Cadence`), lecture de robots.txt selon les mêmes
règles (`politesse.interpreter_robots`), cinq redirections au plus, suivies une à une, chaque cible
passant par la cadence, par robots.txt et par le contrôle du schéma. Jamais HEAD.

La différence avec `politesse.ClientPoli` est l'issue : la collecte lève une erreur et s'arrête ;
le test des liens rend un `Constat` nommé, que la table (`config/test-liens.toml`) traduit en
verdict. Un lien interdit par robots.txt n'est jamais demandé.

D21 : une URL non ASCII (IRI) est convertie en URI pour l'envoi, par la règle que déclare la table
(`conversion_iri`, `pipeline/liens/iri.py`) ; une URL ASCII est envoyée telle qu'écrite, sans
normalisation. La chaîne de redirections est suivie sur les URI envoyées (`url_finale` est donc
l'URI qui a répondu) ; `url_citee` reste la chaîne exacte, posée par le passage. Une IRI
inconvertible, citée ou cible de redirection, est `url_malformee`. robots.txt lu avec succès reste
valable pour le passage ; un échec de lecture n'est pas retenu, robots.txt est relu à la tentative
suivante.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import replace
from urllib.parse import urljoin, urlsplit
from urllib.robotparser import RobotFileParser

from pipeline.collecte.politesse import (
    MAX_REDIRECTIONS,
    SCHEMAS_ADMIS,
    STATUTS_REDIRECTION,
    Cadence,
    EchecCollecte,
    hote,
    interpreter_robots,
)
from pipeline.collecte.reseau import (
    ConnexionRefusee,
    DelaiDepasse,
    ErreurReseau,
    ErreurTls,
    NomIntrouvable,
    ReponseHttp,
    Transport,
)
from pipeline.liens.constat import REPONSE_HTTP, Constat
from pipeline.liens.iri import IriInconvertible

AGENT_LIENS = "BancEssai2027-liens/0.1 (+https://github.com/AzurNow/DEMOCRATIE_2027)"

ISSUE_PAR_ERREUR: dict[type[ErreurReseau], str] = {
    ErreurReseau: "erreur_reseau",
    DelaiDepasse: "delai_depasse",
    ConnexionRefusee: "connexion_refusee",
    ErreurTls: "erreur_tls",
    NomIntrouvable: "domaine_inexistant",
}
"""Classe exacte de l'erreur → issue. Une sous-classe absente lève `KeyError` : jamais rangée ailleurs."""

Controle = Callable[[str], Constat | None]
Conversion = Callable[[str], str]


def _sans_controle(_url: str) -> Constat | None:
    return None


def _forme_refusee(url: str) -> str | None:
    """Issue d'une URL qu'on ne peut pas demander telle qu'écrite, ou `None`."""
    if any(c.isspace() or not c.isprintable() for c in url):
        return "url_malformee"
    try:
        morceaux = urlsplit(url)
        _port = morceaux.port
    except ValueError:
        return "url_malformee"
    if not morceaux.scheme:
        return "url_malformee"
    if morceaux.scheme not in SCHEMAS_ADMIS:
        return "schema_non_http"
    return None if morceaux.hostname else "url_malformee"


def preparer(url: str, convertir: Conversion) -> Constat | str:
    """L'URI à envoyer pour `url`, ou le constat qui la refuse avant toute requête."""
    issue = _forme_refusee(url)
    if issue is not None:
        return Constat(issue=issue, code_http=None, motif=url)
    try:
        return convertir(url)
    except IriInconvertible as erreur:
        return Constat(issue="url_malformee", code_http=None, motif=str(erreur))


def _origine(url: str) -> str:
    morceaux = urlsplit(url)
    return f"{morceaux.scheme}://{morceaux.netloc}"


def _type_contenu(reponse: ReponseHttp) -> str | None:
    return reponse.en_tetes["content-type"] if "content-type" in reponse.en_tetes else None


def _cible(
    courante: str, reponse: ReponseHttp, vues: list[str], convertir: Conversion, lire_location: Conversion
) -> Constat | str:
    """L'URI de la cible d'une redirection, ou le constat qui arrête la chaîne. `location` est relu
    par `lire_location` (D55 (2) : un en-tête `Location` en octets UTF-8 bruts, décodé en latin-1 par
    `http.client`) avant d'être résolu, pour que la conversion IRI → URI qui suit ne le double-encode
    pas."""
    if "location" not in reponse.en_tetes:
        return Constat("redirection_sans_location", reponse.statut, motif=courante)
    cible = urljoin(courante, lire_location(reponse.en_tetes["location"]))
    envoi = preparer(cible, convertir)
    if isinstance(envoi, Constat):
        return replace(envoi, code_http=reponse.statut, motif=f"{courante} → {cible}")
    if envoi in vues:
        return Constat("boucle_redirection", reponse.statut, motif=f"{courante} → {cible}")
    return envoi


class SondeLiens:
    def __init__(
        self,
        transport: Transport,
        cadence: Cadence,
        convertir: Conversion,
        lire_location: Conversion,
        agent_utilisateur: str = AGENT_LIENS,
        max_redirections: int = MAX_REDIRECTIONS,
    ) -> None:
        """`convertir` : la règle IRI → URI que déclare la table (`CONVERSIONS_IRI[table.conversion_iri]`).
        `lire_location` : la règle de relecture de `Location` que déclare la table (D55 (2),
        `LECTURES_LOCATION[table.lecture_location]`)."""
        self._transport = transport
        self._cadence = cadence
        self._convertir = convertir
        self._lire_location = lire_location
        self._agent = agent_utilisateur
        self._max_redirections = max_redirections
        self._robots: dict[str, RobotFileParser] = {}

    def sonder(self, url: str) -> Constat:
        """Une tentative : la chaîne de redirections depuis `url`, jusqu'à une réponse ou une issue."""
        envoi = preparer(url, self._convertir)
        if isinstance(envoi, Constat):
            return envoi
        return self._suivre(envoi, self._controle_robots)

    def _suivre(self, url: str, controle: Controle) -> Constat:
        vues: list[str] = []
        courante, dernier_code = url, None
        for _etape in range(self._max_redirections + 1):
            suite = self._etape(courante, vues, controle)
            if isinstance(suite, Constat):
                return suite
            courante, dernier_code = suite
        motif = f"plus de {self._max_redirections} redirections depuis {url}"
        return Constat("redirections_excessives", dernier_code, motif=motif)

    def _etape(self, courante: str, vues: list[str], controle: Controle) -> Constat | tuple[str, int]:
        refus = controle(courante)
        if refus is not None:
            return refus
        try:
            reponse = self._envoyer(courante)
        except ErreurReseau as erreur:
            return Constat(ISSUE_PAR_ERREUR[type(erreur)], None, motif=str(erreur))
        if reponse.statut not in STATUTS_REDIRECTION:
            return Constat(REPONSE_HTTP, reponse.statut, courante, reponse.corps, _type_contenu(reponse))
        vues.append(courante)
        cible = _cible(courante, reponse, vues, self._convertir, self._lire_location)
        return cible if isinstance(cible, Constat) else (cible, reponse.statut)

    def _envoyer(self, url: str) -> ReponseHttp:
        self._cadence.attendre(hote(url))
        return self._transport.envoyer(url, {"User-Agent": self._agent})

    def _controle_robots(self, url: str) -> Constat | None:
        origine = _origine(url)
        if origine not in self._robots:
            lu = self._lire_robots(origine)
            if isinstance(lu, Constat):
                return lu
            self._robots[origine] = lu
        if not self._robots[origine].can_fetch(self._agent, url):
            return Constat("robots_interdit", None, motif=url)
        return None

    def _lire_robots(self, origine: str) -> RobotFileParser | Constat:
        """Un robots.txt lu avec succès est retenu pour le passage ; un échec ne l'est pas (D21) :
        robots.txt est relu à la tentative suivante. Un nom introuvable est le domaine du lien qui
        n'existe pas (`domaine_inexistant`) ; toute autre panne rend robots.txt injoignable, ce qui
        n'est jamais une autorisation implicite."""
        constat = self._suivre(f"{origine}/robots.txt", _sans_controle)
        if constat.issue == "domaine_inexistant":
            return constat
        if constat.issue != REPONSE_HTTP or constat.code_http is None or constat.corps is None:
            return Constat("robots_injoignable", None, motif=f"{origine} : {constat.issue} {constat.motif}")
        try:
            return interpreter_robots(ReponseHttp(constat.code_http, {}, constat.corps))
        except EchecCollecte as echec:
            return Constat("robots_injoignable", None, motif=f"{origine} : {echec.motif}")
