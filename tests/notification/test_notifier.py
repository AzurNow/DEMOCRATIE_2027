"""`pnpm notifier` (protocole 0.10, §4 « Droit de réponse » ; lot contestation-notification, V5).

Un courriel par campagne et par exécution ; idempotence par le journal ; `en_cours` écrit avant
l'envoi, orpheline jamais renvoyée seule ; échec journalisé et relancé à l'exécution suivante ;
campagne sans adresse ou hors périmètre journalisée sans envoi ; candidat retiré notifié s'il a une
adresse ; simulation qui n'écrit rien ; `--envoyer` refusé sans variables ou sur gabarit provisoire.
"""

from __future__ import annotations

import json
import smtplib
from dataclasses import fields
from email import message_from_bytes
from pathlib import Path

import pytest

from pipeline.notification.__main__ import principal
from pipeline.notification.journal import envoi_id
from pipeline.notification.notifier import Contact, lire_contacts
from pipeline.notification.transport import EchecEnvoi, ParametresSmtp, TransportSmtp
from tests.notification.doubles import ENV, Bac, Horloge, ServeurSmtpLocal, TransportFactice, contacts, due

DORE = Path(__file__).parent / "dore" / "envois.jsonl"
A1, A2, B1 = due(1, "demo-a"), due(2, "demo-a", "contestation"), due(3, "demo-b")
CONTACTS = contacts(("demo-a", "contact@demo-a.invalid", "actif"), ("demo-b", "presse@demo-b.invalid", "actif"))


@pytest.fixture
def bac(tmp_path: Path) -> Bac:
    return Bac(tmp_path)


def lancer(bac: Bac, *options: str, transport: TransportFactice | None = None, entree: str = CONTACTS, env=None):
    sortie: list[str] = []
    fabrique = (lambda _parametres: transport) if transport is not None else TransportSmtp
    code = principal(bac.arguments(*options), entree, ENV if env is None else env, fabrique, Horloge(), sortie.append)
    return code, "".join(sortie)


def test_la_simulation_n_ecrit_rien_et_liste_les_envois(bac: Bac) -> None:
    bac.dues(A1, A2, B1)
    code, sortie = lancer(bac)
    assert code == 0
    assert bac.envois() == []
    assert "Campagnes à notifier : 2" in sortie
    assert "Simulation" in sortie


def test_envoyer_sans_les_variables_smtp_est_refuse_sans_rien_ecrire(bac: Bac) -> None:
    bac.dues(A1)
    transport = TransportFactice()
    code, _ = lancer(bac, "--envoyer", transport=transport, env={"BANC_SMTP_HOTE": "x"})
    assert code == 2
    assert bac.envois() == [] and transport.envois == []


def test_un_gabarit_encore_provisoire_n_est_jamais_envoye(bac: Bac) -> None:
    bac.dues(A1)
    transport = TransportFactice()
    code, _ = lancer(bac, "--envoyer", f"--gabarits={bac.gabarit_provisoire}", transport=transport)
    assert code == 2
    assert bac.envois() == [] and transport.envois == []


def test_un_courriel_par_campagne_qui_liste_ses_items(bac: Bac) -> None:
    bac.dues(A1, A2, B1)
    transport = TransportFactice()
    code, _ = lancer(bac, "--envoyer", transport=transport)
    assert code == 0
    assert [destinataire for destinataire, _ in transport.envois] == ["contact@demo-a.invalid", "presse@demo-b.invalid"]
    courriel_a = message_from_bytes(transport.envois[0][1])
    assert A1["item_id"] in courriel_a.get_payload() and A2["item_id"] in courriel_a.get_payload()
    assert courriel_a["Message-ID"] == f"<{envoi_id([A1['id'], A2['id']])}@banc-essai.invalid>"
    assert [envoi["etat"] for envoi in bac.envois()] == ["en_cours", "envoyee", "en_cours", "envoyee"]
    assert bac.envois()[1]["notification_ids"] == sorted([A1["id"], A2["id"]])


def test_une_relance_n_envoie_rien_deux_fois(bac: Bac) -> None:
    bac.dues(A1, B1)
    lancer(bac, "--envoyer", transport=TransportFactice())
    seconde = TransportFactice()
    code, sortie = lancer(bac, "--envoyer", transport=seconde)
    assert code == 0 and seconde.envois == []
    assert "Campagnes à notifier : 0" in sortie
    assert len(bac.envois()) == 4


def test_une_nouvelle_due_part_seule_a_l_execution_suivante(bac: Bac) -> None:
    bac.dues(A1)
    lancer(bac, "--envoyer", transport=TransportFactice())
    bac.dues(A2)
    transport = TransportFactice()
    lancer(bac, "--envoyer", transport=transport)
    assert len(transport.envois) == 1
    assert bac.envois()[-1]["notification_ids"] == [A2["id"]]


def test_campagne_sans_adresse_journalisee_sans_envoi_et_sans_repetition(bac: Bac) -> None:
    bac.dues(B1)
    entree = contacts(("demo-b", None, "actif"))
    transport = TransportFactice()
    code, sortie = lancer(bac, "--envoyer", transport=transport, entree=entree)
    assert code == 0 and transport.envois == []
    assert [envoi["etat"] for envoi in bac.envois()] == ["sans_destinataire_connu"]
    assert bac.envois()[0]["destinataire"] is None
    assert "sans destinataire" in sortie
    lancer(bac, "--envoyer", transport=transport, entree=entree)
    assert len(bac.envois()) == 1


def test_une_adresse_publiee_ensuite_est_resolue_a_l_execution_suivante(bac: Bac) -> None:
    bac.dues(B1)
    lancer(bac, "--envoyer", transport=TransportFactice(), entree=contacts(("demo-b", None, "actif")))
    transport = TransportFactice()
    lancer(bac, "--envoyer", transport=transport)
    assert [destinataire for destinataire, _ in transport.envois] == ["presse@demo-b.invalid"]


def test_candidat_hors_perimetre_journalise_sans_destinataire(bac: Bac) -> None:
    bac.dues(due(9, "demo-z"))
    code, _ = lancer(bac, "--envoyer", transport=TransportFactice())
    assert code == 0
    assert bac.envois()[0]["etat"] == "sans_destinataire_connu"
    assert "absent du périmètre" in bac.envois()[0]["erreur"]


def test_candidat_retire_notifie_s_il_a_encore_une_adresse(bac: Bac) -> None:
    bac.dues(B1)
    transport = TransportFactice()
    lancer(bac, "--envoyer", transport=transport, entree=contacts(("demo-b", "presse@demo-b.invalid", "retire")))
    assert len(transport.envois) == 1


def test_contact_sans_statut_au_gel_declare_n_a_pas_de_valeur_none() -> None:
    """Constat 41 du 2026-10-12 : `statut_au_gel` n'était lu nulle part et valait la chaîne
    littérale "None" quand il manquait de l'entrée standard."""
    assert "statut_au_gel" not in {champ.name for champ in fields(Contact)}
    entree = json.dumps({"candidats": [{"candidat_id": "demo-a", "contact_notification": None}]})
    contact = lire_contacts(entree)["demo-a"]
    assert contact == Contact("demo-a", None)


@pytest.mark.parametrize("code_smtp", [451, 550])
def test_un_echec_est_journalise_et_relance_a_l_execution_suivante(bac: Bac, code_smtp: int) -> None:
    bac.dues(A1)
    code, sortie = lancer(bac, "--envoyer", transport=TransportFactice(echecs=[EchecEnvoi("refusé", code_smtp)]))
    assert code == 1
    assert [envoi["etat"] for envoi in bac.envois()] == ["en_cours", "echec"]
    assert bac.envois()[1]["code_smtp"] == code_smtp
    assert "ÉCHEC" in sortie
    transport = TransportFactice()
    assert lancer(bac, "--envoyer", transport=transport)[0] == 0
    assert len(transport.envois) == 1
    assert bac.envois()[-1]["etat"] == "envoyee" and bac.envois()[-1]["tentative"] == 2


def test_une_perte_de_connexion_est_un_echec_sans_code(bac: Bac) -> None:
    bac.dues(A1)
    code, _ = lancer(bac, "--envoyer", transport=TransportFactice(echecs=[EchecEnvoi("SMTPServerDisconnected", None)]))
    assert code == 1
    assert bac.envois()[-1]["etat"] == "echec" and bac.envois()[-1]["code_smtp"] is None


def test_un_envoi_orphelin_n_est_jamais_renvoye_seul(bac: Bac) -> None:
    bac.dues(A1)
    premier = TransportFactice(echecs=[EchecEnvoi("n'arrive pas", None)])
    lancer(bac, "--envoyer", transport=premier)
    # Simule un arrêt brutal pendant l'envoi : on ne garde que la ligne `en_cours`.
    chemin = bac.notifications / "envois.jsonl"
    chemin.write_text(chemin.read_text(encoding="utf-8").splitlines(keepends=True)[0], encoding="utf-8")
    transport = TransportFactice()
    code, sortie = lancer(bac, "--envoyer", transport=transport)
    assert code == 1 and transport.envois == []
    assert "INDÉTERMINÉ" in sortie
    identifiant = envoi_id([A1["id"]])
    assert lancer(bac, "--envoyer", f"--relancer={identifiant}", transport=transport)[0] == 0
    assert len(transport.envois) == 1
    assert message_from_bytes(transport.envois[0][1])["Message-ID"] == f"<{identifiant}@banc-essai.invalid>"
    assert bac.envois()[-1]["tentative"] == 2
    assert lancer(bac, "--envoyer", transport=transport)[0] == 0
    assert len(transport.envois) == 1


def test_relancer_un_envoi_qui_n_est_pas_indetermine_est_refuse(bac: Bac) -> None:
    bac.dues(A1)
    code, _ = lancer(bac, "--envoyer", f"--relancer={'0' * 64}", transport=TransportFactice())
    assert code == 2


def test_les_connexions_smtp_sont_interdites_hors_du_serveur_local() -> None:
    with pytest.raises(AssertionError, match="interdite"):
        smtplib.SMTP("smtp.example.invalid", 25)
    with pytest.raises(AssertionError, match="interdite"):
        smtplib.SMTP_SSL("smtp.example.invalid", 465)


def _transport_local(serveur: ServeurSmtpLocal):
    def fabrique(parametres: ParametresSmtp) -> TransportSmtp:
        local = ParametresSmtp("127.0.0.1", serveur.port, parametres.utilisateur, parametres.mot_de_passe, parametres.expediteur)
        return TransportSmtp(local, tls=False, delai_s=5.0)

    return fabrique


def test_integration_serveur_smtp_local(bac: Bac, serveur_smtp_local: ServeurSmtpLocal) -> None:
    bac.dues(A1, A2)
    code = principal(bac.arguments("--envoyer"), CONTACTS, ENV, _transport_local(serveur_smtp_local), Horloge(), lambda _: None)
    assert code == 0
    assert len(serveur_smtp_local.reglage.messages) == 1
    assert bac.envois()[-1]["etat"] == "envoyee" and bac.envois()[-1]["code_smtp"] == 250
    serveur_smtp_local.reglage.codes["RCPT"] = 550
    bac.dues(B1)
    code = principal(bac.arguments("--envoyer"), CONTACTS, ENV, _transport_local(serveur_smtp_local), Horloge(), lambda _: None)
    assert code == 1
    assert bac.envois()[-1]["etat"] == "echec" and bac.envois()[-1]["code_smtp"] == 550


def test_journal_dore(bac: Bac) -> None:
    """Reproduit à l'octet ; `tests/notification-envois.test.ts` le valide contre le schéma."""
    bac.dues(A1, A2, B1, due(9, "demo-z"))
    lancer(bac, "--envoyer", transport=TransportFactice(echecs=[EchecEnvoi("DATA refusé : b'busy'", 451)]))
    lancer(bac, "--envoyer", transport=TransportFactice())
    assert (bac.notifications / "envois.jsonl").read_bytes() == DORE.read_bytes()
