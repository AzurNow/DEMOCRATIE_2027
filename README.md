# Banc d'essai 2027

Audit indépendant, public et reproductible de ce que les intermédiaires IA disent des candidats à
la présidentielle française de 2027.

- `docs/PROTOCOLE.md` : le protocole préenregistré, qui fait autorité sur tout.
- `CLAUDE.md` : comment travailler dans ce dépôt (règles non négociables, frontière d'autonomie,
  commandes, pièges), pour un agent comme pour un contributeur humain.
- `docs/FEUILLE-DE-ROUTE.md` : l'état d'avancement, généré depuis `docs/feuille-de-route.json`.

## Démarrer depuis un clone neuf

Prérequis : Git, Node **22.23.3** (`.nvmrc` ; plancher `>=22.6.0`, car tous les outils tournent par
`node --experimental-strip-types`), pnpm **10.34.5** via corepack (champ `packageManager`), Python
**3.12.14** (`.python-version`) et uv **0.12.17**. Rien d'autre : pas de base de données, pas de
Docker, pas de ffmpeg système (yt-dlp et `av` s'en passent). Machine Linux neuve : `HANDOFF.md`,
« Installation dans le cloud ».

```bash
git clone https://github.com/AzurNow/DEMOCRATIE_2027.git && cd DEMOCRATIE_2027
nvm install && nvm use          # ou fnm/volta : lit .nvmrc
corepack enable                 # fournit pnpm à la version de packageManager
pnpm install --frozen-lockfile
pnpm check && pnpm test         # doit être vert avant toute chose
python3 -m venv ~/.outils-uv && ~/.outils-uv/bin/pip install uv==0.12.17 \
  && export PATH="$HOME/.outils-uv/bin:$PATH"  # si uv est absent (pip --user est refusé sur Debian/Ubuntu récents)
uv sync --frozen                # crée .venv depuis uv.lock
pnpm check:py && pnpm test:py
pnpm build                      # clients navigateur (sortie dans */client/dist, ignorée)
ANNOTATEUR_ID=a1 pnpm dev       # http://127.0.0.1:4173/, jeu de démonstration
```

Variables d'environnement : toutes listées dans `.env.example`, aucune n'est requise pour
installer, vérifier ou tester. Aucun code ne lit `.env` : charger à la main (`set -a; . ./.env;
set +a`).

## Arborescence

```
docs/PROTOCOLE.md      Le protocole. Lecture seule sans révision ou amendement.
docs/DETTE.md          Ce qui peut casser plus tard, par session. Rempli à la clôture.
LESSONS.md             Bonnes pratiques payées par l'expérience. Complété à la clôture.
schema/                JSON Schema : item, question, reponse, notation. Source de vérité du modèle.
config/perimetre.yaml  Candidats, outils, thèmes du run courant. Modifié à la main uniquement.
prompts/               Prompts versionnés : extraction, juges, reformulations.
pipeline/
  collecte/            Crawl, yt-dlp, transcription, archivage (hash + Wayback).
  extraction/          Double extraction, test verbatim, mise en staging.
  interrogation/       Appels API aux outils, conditions figées, réponses brutes.
  notation/            Juges, désaccords, échantillonnage, test contrefactuel.
  questions/ gel/ run/ reformulation/ liens/ preuve/ notification/ go-no-go/
                       Gabarits de questions, gel d'un run, statut des runs, reformulations,
                       test des liens, preuves du périmètre, courriels aux candidats, go/no-go.
staging/               Sortie du pipeline. Jamais lu par le site.
data/                  Items validés par des humains. Le seul jeu de données de production.
runs/<date>/           Questions, tirage, graines, verdicts, métriques. Le volume est en dépôt Zenodo.
                       Mode d'emploi de chaque commande de run : runs/README.md.
validation/            Interface locale de validation humaine (serveur, client, domaine, fixtures).
analysis/              Métriques §8, bootstrap, tests de permutation, robustesse.
notation-humaine/      Écran local de notation humaine des réponses (serveur + client).
outils/                Points d'entrée des commandes `pnpm <script>` (fines enveloppes).
tests/                 Vitest (*.test.ts) et pytest (test_*.py), miroir de l'arborescence.
site/                  Site statique généré. Aucune logique métier. (Pas encore créé.)
scratch/               Explorations jetables. Hors CI, hors production.
docs/                  Protocole, CONTRATS.md, DETTE.md, TACHES-AUTEUR.md, revues/, conformite/,
                       critiques/, contexte-agentique/, feuille-de-route.json (l'état d'avancement
                       qui fait foi).
.claude/               Compétences, agents et briefs de sous-agents (GABARIT.md).
.github/workflows/     CI unique : verification.yml (check, test, ruff, pytest).
```

## Services externes

Aucun au runtime du site. Le pipeline, lancé à la main par l'auteur, appelle :
- **API Anthropic et Mistral** : double extraction (`pnpm extraire`), reformulations
  (`pnpm reformuler`, Mistral). Clés en variables d'environnement. Mode `--simule` sans réseau.
- **Internet Archive / Wayback Machine** : archivage des sources et des liens
  (`pipeline/collecte/wayback.py`, `pipeline/liens`).
- **Sites des sources** (crawl poli, `pipeline/collecte/politesse.py`) et **yt-dlp** pour l'audio
  et la vidéo.
- **Hugging Face** : poids de faster-whisper (~1,6 Go) téléchargés au premier
  `pnpm transcriptions`, révision épinglée, dans `modeles/` (ignoré).
- **SMTP** de l'adresse de contestation (`pnpm notifier --envoyer`) : fournisseur pas encore choisi.
- **Zenodo** : dépôt du protocole et du volume des runs (manuel, par l'auteur).
- **GitHub Actions** : CI `verification.yml`, obligatoire sur `main`, administrateurs compris.

## Ce qui n'existe que sur la machine de l'auteur

- `archives/`, `modeles/`, `staging/textes/*.txt`, `staging/transcriptions/*.vtt`,
  `scratch/perimetre/preuves/` et les pages capturées de `scratch/perimetre/releves-*/` :
  ignorés par Git par décision (droits d'autrui, volume). Le pipeline les retélécharge ; le
  contenu web a pu changer depuis, et ce sont les empreintes publiées qui font foi. Rien de tout
  cela n'est nécessaire pour travailler sur le code et le protocole.
- Les clés d'API et les identifiants SMTP (voir `.env.example`).
- La mémoire de Claude Code (`~/.claude/projects/...`) : ses consignes durables sont recopiées dans
  `HANDOFF.md`, section « Façon de travailler ».
