"""Le passage du test des liens sur un run : une URL après l'autre, en ordre trié (D20).

Pour chaque URL : si son résultat est déjà écrit (relance après interruption), il est repris tel
quel, ni retesté ni réécrit. Sinon, jusqu'à `tentatives.maximum` tentatives tant que le résultat
est transitoire (table), espacées de `tentatives.espacement_s` sur l'horloge injectée ; le dernier
résultat est traduit en verdict par la table. Puis la copie : page et Save Page Now pour `existe`,
recherche d'instantané existant pour `inaccessible` et `non_testable`, rien pour `mort` (D19 : un
lien mort ne soutient jamais rien). D21 : un instantané de statut 200 est téléchargé en version
brute (`id_`) par la même sonde, octets intacts sous `pages/` ; seul ce téléchargement réussi pose
`archive_url` et `sha256_contenu`. Un instantané d'un autre statut est écarté, un téléchargement en
échec est consigné : ni l'un ni l'autre ne change le verdict. D22 : la recherche et le
téléchargement portent l'URI convertie par la règle `conversion_iri` de la table ; `archive_url` est
l'instantané réellement servi, lu dans l'URL finale du téléchargement, l'instantané demandé reste
dans le journal Wayback. Enfin le résultat est contrôlé et écrit une fois.

Un résultat que la table ne classe pas n'a pas de verdict : aucun fichier n'est écrit, le lien
reste « en attente du test des liens » pour la notation, et le bilan le signale.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Protocol

from pipeline.collecte.horloge import Horloge, instant_iso
from pipeline.collecte.wayback import SERVICE, ArchivageReussi, Archiveur
from pipeline.liens.constat import REPONSE_HTTP, Constat
from pipeline.liens.instantanes import (
    STATUT_RETENU,
    InstantaneAbsent,
    InstantaneEcarte,
    InstantaneTrouve,
    Recherche,
    RechercheEchouee,
    instantane_servi,
)
from pipeline.liens.iri import CONVERSIONS_IRI, IriInconvertible
from pipeline.liens.schemas import ResultatNonConforme
from pipeline.liens.sortie import (
    Copie,
    Tentative,
    conserver_page,
    construire_resultat,
    ecrire_resultat,
    lire_resultat,
    nom_resultat,
)
from pipeline.liens.table import TableLiens

STATUT_TELECHARGEMENT = 200
"""Le téléchargement de la version brute d'un instantané ne réussit que sur une réponse finale 200."""


class Sonde(Protocol):
    def sonder(self, url: str) -> Constat: ...


class Chercheur(Protocol):
    def chercher(self, uri: str, instant: datetime) -> Recherche: ...


@dataclass(frozen=True)
class Dependances:
    sonde: Sonde
    archiveur: Archiveur
    chercheur: Chercheur
    horloge: Horloge
    table: TableLiens


@dataclass(frozen=True)
class Bilan:
    url: str
    etat: str
    """`teste`, `repris`, `sans_verdict` ou `refuse` (résultat non conforme : rien n'est écrit)."""
    verdict: str | None = None
    motif: str | None = None
    echec_wayback: str | None = None


@dataclass(frozen=True)
class _Contexte:
    url: str
    instant_reference: datetime
    repertoire: Path
    deps: Dependances
    tentatives: list[Tentative] = field(default_factory=list)


# ------------------------------------------------------------------------------ tentatives


def tester(url: str, deps: Dependances) -> list[Tentative]:
    """Les tentatives faites, la dernière portant le résultat qui décide du verdict."""
    tentatives: list[Tentative] = []
    for numero in range(1, deps.table.tentatives_max + 1):
        if numero > 1:
            deps.horloge.dormir(deps.table.espacement_s)
        horodatage = instant_iso(deps.horloge.maintenant())
        constat = deps.sonde.sonder(url)
        tentatives.append(Tentative(numero=numero, horodatage=horodatage, constat=constat))
        if not deps.table.est_transitoire(constat):
            break
    return tentatives


# ------------------------------------------------------------------------------ copies


def _copie_existe(ctx: _Contexte) -> Copie:
    """D22 : Save Page Now reçoit l'URI convertie par la règle de la table, comme la sonde qui a
    obtenu le verdict `existe` pour `ctx.url` (même règle, même chaîne) : jamais `IriInconvertible`
    ici, une IRI qui ne se convertit pas est `url_malformee`, donc jamais `existe`."""
    sha256, page = conserver_page(ctx.repertoire, ctx.tentatives[-1].constat)
    uri = CONVERSIONS_IRI[ctx.deps.table.conversion_iri](ctx.url)
    archivage = ctx.deps.archiveur.sauvegarder(uri)
    if isinstance(archivage, ArchivageReussi):
        wayback: dict[str, object] = {"operation": SERVICE, "issue": "reussi", "archive_url": archivage.archive_url}
        return Copie(wayback=wayback, page=page, sha256_contenu=sha256, archive_url=archivage.archive_url)
    wayback = {"operation": SERVICE, "issue": "echec", "motif": archivage.motif, "tentatives": archivage.tentatives}
    return Copie(wayback=wayback, page=page, sha256_contenu=sha256)


def _copie_mort(_ctx: _Contexte) -> Copie:
    return Copie(wayback={"operation": "aucune"})


def _motif_d_echec(constat: Constat) -> str:
    detail = f" : {constat.motif}" if constat.motif is not None else ""
    return f"{constat.issue}, code HTTP {constat.code_http}{detail}"


def _servi(constat: Constat) -> str | tuple[str, str]:
    """D21, D22 : `(url_finale, instantané servi)` d'un téléchargement réussi, ou le motif de son échec :
    réponse finale autre que 200, ou URL finale hors de la forme `/web/<14 chiffres>id_/…`."""
    if constat.issue != REPONSE_HTTP or constat.code_http != STATUT_TELECHARGEMENT or constat.url_finale is None:
        return _motif_d_echec(constat)
    servi = instantane_servi(constat.url_finale)
    if servi is None:
        return f"URL finale hors de la forme /web/<14 chiffres>id_/ sur web.archive.org : {constat.url_finale}"
    return constat.url_finale, servi


def _trouve(ctx: _Contexte, recherche: InstantaneTrouve, wayback: dict[str, object]) -> Copie:
    """D21 : la version brute (`id_`) de l'instantané est téléchargée, même politesse, même agent
    (la sonde du passage), une fois. Octets intacts sous `pages/` ; `archive_url` et `sha256_contenu`
    ne sont posés que si le téléchargement réussit. D22 : `archive_url` est l'instantané réellement
    servi (forme publique de l'URL finale, sans `id_`) ; l'instantané demandé reste `url_instantane`."""
    wayback |= {
        "issue": "trouve",
        "url_instantane": recherche.url_instantane,
        "horodatage_instantane": recherche.horodatage,
        "statut_instantane": STATUT_RETENU,
    }
    constat = ctx.deps.sonde.sonder(recherche.url_brute)
    servi = _servi(constat)
    if isinstance(servi, str):
        echec = {"issue": "echec", "url_brute": recherche.url_brute, "motif": servi}
        return Copie(wayback=wayback | {"telechargement": echec})
    url_finale, archive_url = servi
    sha256, page = conserver_page(ctx.repertoire, constat)
    reussi = {"issue": "reussi", "url_brute": recherche.url_brute, "url_finale": url_finale, **page}
    return Copie(wayback=wayback | {"telechargement": reussi}, sha256_contenu=sha256, archive_url=archive_url)


def _ecarte(recherche: InstantaneEcarte, wayback: dict[str, object]) -> Copie:
    """D21 : instantané de statut autre que 200 consigné avec son statut (s'il est renvoyé), jamais retenu."""
    wayback |= {"issue": "ecarte", "url_instantane": recherche.url_instantane, "horodatage_instantane": recherche.horodatage}
    if recherche.statut is not None:
        wayback["statut_instantane"] = recherche.statut
    return Copie(wayback=wayback)


def _copie_recherche(ctx: _Contexte) -> Copie:
    """D22 : la recherche porte l'URI convertie par la règle de la table. Une IRI inconvertible
    (`url_malformee`, donc non testable) n'a pas d'URI : aucune requête, l'échec est consigné."""
    wayback: dict[str, object] = {
        "operation": "recherche_instantane",
        "instant_reference": instant_iso(ctx.instant_reference),
    }
    try:
        uri = CONVERSIONS_IRI[ctx.deps.table.conversion_iri](ctx.url)
    except IriInconvertible as erreur:
        return Copie(wayback=wayback | {"issue": "echec", "motif": f"IRI inconvertible, aucune recherche : {erreur}"})
    recherche = ctx.deps.chercheur.chercher(uri, ctx.instant_reference)
    match recherche:
        case InstantaneTrouve():
            return _trouve(ctx, recherche, wayback)
        case InstantaneEcarte():
            return _ecarte(recherche, wayback)
        case InstantaneAbsent():
            return Copie(wayback=wayback | {"issue": "absent"})
        case RechercheEchouee():
            return Copie(wayback=wayback | {"issue": "echec", "motif": recherche.motif})
    raise TypeError(f"issue de recherche inconnue : {recherche!r}")


COPIES: dict[str, Callable[[_Contexte], Copie]] = {
    "existe": _copie_existe,
    "mort": _copie_mort,
    "inaccessible": _copie_recherche,
    "non_testable": _copie_recherche,
}
"""D20, « copie conservée ». Un verdict du schéma absent d'ici lève `KeyError` : jamais de copie par défaut."""


# ------------------------------------------------------------------------------ une URL


def _echec_wayback(wayback: Mapping[str, object]) -> str | None:
    """L'échec à signaler au bilan : Save Page Now ou recherche en échec, ou téléchargement de
    l'instantané en échec (D21) ; `None` sinon."""
    if wayback.get("issue") == "echec":
        return f"{wayback['operation']} : {wayback['motif']}"
    telechargement = wayback.get("telechargement")
    if isinstance(telechargement, dict) and telechargement["issue"] == "echec":
        return f"telechargement_instantane : {telechargement['motif']}"
    return None


def _reprendre(chemin: Path, url: str) -> Bilan:
    try:
        resultat = lire_resultat(chemin, url)
    except ResultatNonConforme as refus:
        return Bilan(url, "refuse", motif=f"résultat déjà écrit mais non conforme : {refus}")
    return Bilan(url, "repris", verdict=str(resultat["verdict_existence"]))


def traiter(url: str, instant_reference: datetime, repertoire: Path, deps: Dependances) -> Bilan:
    chemin = repertoire / nom_resultat(url)
    if chemin.exists():
        return _reprendre(chemin, url)
    ctx = _Contexte(url, instant_reference, repertoire, deps, tester(url, deps))
    finale = ctx.tentatives[-1].constat
    verdict = deps.table.verdict(finale)
    if verdict is None:
        motif = f"{finale.issue} (code HTTP {finale.code_http}) hors de la table {deps.table.version}"
        return Bilan(url, "sans_verdict", motif=motif)
    copie = COPIES[verdict](ctx)
    resultat = construire_resultat(url, verdict, ctx.tentatives, deps.table.version, copie)
    try:
        ecrire_resultat(repertoire, resultat)
    except ResultatNonConforme as refus:
        return Bilan(url, "refuse", verdict=verdict, motif=str(refus))
    return Bilan(url, "teste", verdict=verdict, echec_wayback=_echec_wayback(copie.wayback))


def passer(liens: Mapping[str, datetime], repertoire_liens: Path, deps: Dependances) -> list[Bilan]:
    """Toutes les URL, en ordre trié de la chaîne exacte : le passage est déterministe."""
    repertoire_liens.mkdir(parents=True, exist_ok=True)
    return [traiter(url, liens[url], repertoire_liens, deps) for url in sorted(liens)]


# ------------------------------------------------------------------------------ bilan


def formater_bilan(bilans: list[Bilan], version_table: str) -> str:
    lignes = [f"Test des liens, table {version_table} : {len(bilans)} URL."]
    for etat in ("teste", "repris"):
        par_verdict: dict[str, int] = {}
        for bilan in (b for b in bilans if b.etat == etat and b.verdict is not None):
            par_verdict[bilan.verdict] = par_verdict.get(bilan.verdict, 0) + 1
        detail = ", ".join(f"{verdict} {nombre}" for verdict, nombre in sorted(par_verdict.items()))
        lignes.append(f"  {etat} : {sum(par_verdict.values())} ({detail or 'aucun'})")
    lignes += _section("Échecs Wayback (consignés, verdict inchangé)", [(b.url, b.echec_wayback) for b in bilans])
    lignes += _section("Sans verdict (en attente du test des liens)", [(b.url, b.motif) for b in bilans if b.etat == "sans_verdict"])
    lignes += _section("Refusés (rien d'écrit)", [(b.url, b.motif) for b in bilans if b.etat == "refuse"])
    return "\n".join(lignes)


def _section(titre: str, paires: list[tuple[str, str | None]]) -> list[str]:
    retenues = [(url, motif) for url, motif in paires if motif is not None]
    return [f"  {titre} : {len(retenues)}", *(f"    {url} — {motif}" for url, motif in retenues)]


def code_de_sortie(bilans: list[Bilan]) -> int:
    """1 si une URL n'a pas reçu de verdict pour une raison qui n'est pas un verdict ; sinon 0."""
    return 1 if any(b.etat in ("sans_verdict", "refuse") for b in bilans) else 0
