# Grille de la revue du contexte agentique

Sept axes. Chaque question appelle une réponse vérifiable ; un « non » n'est un constat que s'il
coûte quelque chose (étape 4 de la compétence). La veille du jour peut ajouter ou contredire une
question : c'est elle qui fait foi sur les pratiques, cette grille fixe seulement ce qu'on regarde.

## 1. Exactitude

- Chaque chemin, script `pnpm`, variable d'environnement, compétence et agent cité existe.
  Mécanique, pas de mémoire :

  ```bash
  # chemins cités entre accents graves dans le contexte versionné, absents du dépôt
  grep -ohE '`[A-Za-z0-9_.-]+/[A-Za-z0-9_./<>*-]*`' CLAUDE.md HANDOFF.md .claude/skills/*/SKILL.md \
    .claude/agents/*.md .claude/briefs/GABARIT.md | tr -d '`' | sort -u \
    | while read -r p; do case "$p" in *'<'*|*'*'*|*AAAA*) ;; *) [ -e "$p" ] || echo "absent : $p";; esac; done
  # scripts pnpm cités, absents de package.json
  grep -ohE 'pnpm [a-z:-]+' CLAUDE.md HANDOFF.md LESSONS.md .claude/skills .claude/agents .claude/briefs/GABARIT.md -r \
    | awk '{print $2}' | sort -u | grep -vxE 'install|run|exec|dlx' \
    | while read -r s; do node -e "process.exit(require('./package.json').scripts['$s']?0:1)" \
      || echo "script absent : $s"; done
  ```

  Jamais `.claude` en entier : `.claude/worktrees/` contient des copies complètes du dépôt (8,5 Mo
  de sortie à la passe du 2026-11-05). Un chemin absent n'est pas forcément faux (`data/`, `site/`
  naissent plus tard) : lire la phrase.
- `/doctor prompt-audit` (Claude Code 2.1.283 et plus, lancé par l'utilisateur, pas par l'agent)
  relève chemins et commandes périmés et fichiers d'instructions contradictoires : si l'auteur l'a
  lancé avant la passe, sa sortie entre comme signal, pas comme constat.
- Les faits datés (« pas encore écrit », « en cours », versions d'outils, dates d'absence) sont
  encore vrais.
- Les noms et alias de modèles des en-têtes (`model:`) et des consignes sont valides à date.

## 2. Économie du contexte toujours chargé

Mesurer avant et après, en caractères (une estimation en tokens se donne comme telle) :

```bash
wc -c CLAUDE.md                                         # + tout fichier importé par @chemin
grep -n '^@\|[[:space:]]@[A-Za-z.]' CLAUDE.md            # imports éventuels
wc -c ~/.claude/projects/*DEMOCRACIE*/memory/MEMORY.md  # index de mémoire (local)
for f in .claude/skills/*/SKILL.md .claude/agents/*.md; do
  printf '%6d %s\n' "$(sed -n 's/^description: //p' "$f" | wc -c)" "$f"; done
```

- Ce qui ne sert qu'à certaines tâches sort du `CLAUDE.md` vers une compétence ou une référence
  chargée à la demande.
- Rien n'est dit deux fois entre `CLAUDE.md`, `HANDOFF.md`, compétences, agents et mémoire.
- Rien n'énonce ce que le modèle sait déjà ou ce que le code, `package.json` ou un en-tête de
  script disent déjà.
- Les descriptions de compétences et d'agents sont chargées à chaque session : chaque phrase y sert
  au déclenchement ou au routage, le reste va dans le corps.

## 3. Efficacité des consignes

- Chaque consigne est actionnable et vérifiable ; une consigne non évidente porte son pourquoi.
- Aucune contradiction entre deux sources, et l'ordre de priorité est dit une fois.
- Le ton suit la veille du jour (par exemple sur l'emphase, les majuscules, les interdits sans
  alternative) ; une règle critique se distingue par sa place et sa raison, pas par sa typographie.
- Les exemples, s'il y en a, sont justes et représentatifs.

## 4. Déclenchement et routage

- Chaque description de compétence dit quoi, quand, et quand pas ; deux compétences ne se
  disputent pas la même demande.
- Une compétence coûteuse ou à effet de bord est réservée au lancement manuel.
- Chaque agent dit ce qu'on lui confie et ce qu'on ne lui confie pas ; le gabarit de brief
  produit un brief autonome (but, fichiers, ce qui est exclu, critère de fin).
- Un sous-agent reçoit sa définition, `CLAUDE.md` et l'état Git, pas la conversation ni la mémoire
  du parent (doc des sous-agents, vérifié par la lecture à froid du 2026-11-05) : sa définition ne
  répète pas `CLAUDE.md`, elle porte ce qui lui est propre.
- Les affectations de modèle et d'effort suivent la nature de la tâche et la veille du jour.

## 5. Garde-fous déterministes

- Une règle que la prose seule protège mal (écriture dans `data/`, publication, zones d'arrêt) a-t-
  elle, ou mériterait-elle, un garde mécanique (permission partagée, crochet, garde de script) ?
  Proposer seulement : tout nouveau mécanisme revient à l'auteur.
- Les permissions utiles à tous sont dans `.claude/settings.json` versionné ; `settings.local.json`
  ne garde que le propre à une machine.

## 6. Dépôt public

- Un contributeur qui clone, sans la machine ni la mémoire de l'auteur, trouve tout ce qu'il faut :
  les consignes durables de la mémoire sont recopiées dans le dépôt.
- Rien de personnel ni d'absolu à une machine dans le versionné (hors archives signalées comme
  telles).
- Un contributeur qui utilise un autre agent que Claude Code trouve le point d'entrée (selon la
  veille : `AGENTS.md` ou équivalent), sans doublon à maintenir.
- Langue, terminologie et ton cohérents d'un fichier à l'autre.

## 7. Mémoire locale

- Chaque entrée de l'index pointe vers un fichier existant ; chaque fichier est encore vrai.
- Pas de doublon avec le dépôt ; ce qui vaut pour tout contributeur est dans le dépôt, pas
  seulement en mémoire.
- Les entrées périmées sont corrigées ou supprimées (la mémoire est locale : hors PR, à noter au
  rapport).
