"""Contrôle mot pour mot des citations du registre et de la passe du 2026-11-10.

Usage, depuis la racine du dépôt :
    PYTHONDONTWRITEBYTECODE=1 python3 scratch/fondations/2026-11-10/verif_citations.py

Chaque texte entre guillemets français des deux documents doit figurer tel quel, après
normalisation des blancs (les textes sont repliés à la ligne), dans l'un des fichiers de CORPUS.
Une citation coupée par « … » est cherchée morceau par morceau dans un même fichier. C'est une
comparaison de chaînes, jamais un jugement (même principe que la règle 5 de CLAUDE.md).

Ce que le script ne vérifie pas : qu'une citation trouvée hors du protocole est attribuée au bon
fichier (il affiche où il l'a trouvée, la relecture fait le reste), ni qu'une page du web dit ce
que `verification.md` en rapporte (c'est l'étape 4 de la passe).

Deux listes d'exceptions, écrites ici pour être relues :
- CHERCHES_EN_VAIN : termes que la passe dit absents du protocole ; le script vérifie qu'ils le
  sont, sans tenir compte de la casse ;
- PAS_DES_CITATIONS : textes entre guillemets que la passe a écrits elle-même (désignations,
  questions des essais, gabarits de retour) ; ils n'ont pas de source à retrouver.

Sortie 0 si tout est retrouvé, 1 sinon.
"""
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parents[3]
DOCUMENTS = ["docs/fondations/registre.md", "docs/fondations/2026-11-10.md"]
PROTOCOLE = "docs/PROTOCOLE.md"
CORPUS = [
    PROTOCOLE,
    "CLAUDE.md",
    "HANDOFF.md",
    "docs/PLAN-PAGE-PEDAGOGIQUE.md",
    "runs/README.md",
    "site/src/pages/exemple.astro",
    ".claude/skills/critique-protocole/SKILL.md",
    ".claude/skills/hypotheses-structurantes/SKILL.md",
    "scratch/fondations/2026-11-10/verification.md",
]
CHERCHES_EN_VAIN = [
    "diffusion",
    "presse",
    "destinataire",
    "lecteur visé",
    "utilité",
    "impact",
    "mesure de succès",
]
PAS_DES_CITATIONS = [
    "H2 du protocole",
    "H5 du protocole",
    "que propose X",
    "[candidat]",
    "type de destinataire — action nommée (oui ou non) — forme demandée",
    "voie de capacité (oui ou non, délai)",
    "Qu'avez-vous lu en premier ? Qu'en avez-vous compris ? Qu'en feriez-vous si c'était vrai ? "
    "Que manque-t-il pour que vous puissiez agir ? Sous quelle forme l'auriez-vous voulu ?",
    "Votre laboratoire ou votre école pourrait-il fournir des annotateurs rémunérés, sans rôle "
    "dans la méthode, et dans quel délai ?",
    "Si vous vouliez savoir ce qu'un candidat propose, et que vous utilisiez une IA, laquelle "
    "ouvririez-vous, où, et que lui taperiez-vous, mot pour mot ?",
    "Sous quelle forme un signalement d'erreur factuelle sur une position de candidat vous "
    "est-il utile, et par quel canal (adresse, formulaire, programme de signalement, contact "
    "presse) ?",
    "Un jeu public de positions vérifiées et sourcées, sous licence ouverte, vous serait-il "
    "utile, et sous quel format ?",
]


def normaliser(texte: str) -> str:
    """Retire le gras et les accents graves du Markdown, réduit tout blanc à une espace."""
    return re.sub(r"\s+", " ", texte.replace("**", "").replace("`", "")).strip()


def lire(chemin: str) -> str:
    return normaliser((RACINE / chemin).read_text(encoding="utf-8"))


def citations(texte: str) -> list[str]:
    """Les textes entre guillemets français, dans l'ordre, sans doublon."""
    return list(dict.fromkeys(re.findall(r"«\s*([^«»]+?)\s*»", texte)))


def fichier_qui_porte(citation: str, corpus: dict[str, str]) -> str | None:
    morceaux = [m.strip() for m in citation.split("…") if m.strip()]
    for chemin, contenu in corpus.items():
        if all(m in contenu for m in morceaux):
            return chemin
    return None


def controler_document(chemin: str, corpus: dict[str, str]) -> int:
    """Affiche les citations trouvées hors du protocole, renvoie le nombre d'introuvables."""
    a_chercher = [c for c in citations(lire(chemin)) if c not in CHERCHES_EN_VAIN + PAS_DES_CITATIONS]
    trouvees = {c: fichier_qui_porte(c, corpus) for c in a_chercher}
    introuvables = [c for c, ou in trouvees.items() if ou is None]
    print(f"== {chemin} : {len(a_chercher)} citations à retrouver, {len(introuvables)} introuvable(s)")
    for c, ou in trouvees.items():
        if ou != PROTOCOLE:
            print(f"  [{ou if ou else 'INTROUVABLE'}] « {c[:110]} »")
    return len(introuvables)


def controler_absences(protocole: str) -> int:
    """Vérifie que les termes dits absents du protocole le sont ; renvoie le nombre de présents."""
    presents = [t for t in CHERCHES_EN_VAIN if t.lower() in protocole.lower()]
    print(f"== termes cherchés en vain dans {PROTOCOLE} : {len(CHERCHES_EN_VAIN)}, présent(s) : {presents}")
    return len(presents)


def main() -> int:
    corpus = {chemin: lire(chemin) for chemin in CORPUS}
    echecs = sum(controler_document(chemin, corpus) for chemin in DOCUMENTS)
    echecs += controler_absences(corpus[PROTOCOLE])
    print("Tout est retrouvé." if echecs == 0 else f"{echecs} échec(s).")
    return 0 if echecs == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
