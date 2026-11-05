---
name: revue-contexte-agentique
description: Revue complète du contexte agentique du Banc d'essai 2027 — CLAUDE.md, HANDOFF.md, compétences, sous-agents, gabarit de briefs, réglages et mémoire — confrontée aux meilleures pratiques relevées en ligne le jour de la passe, puis amélioration. Vise l'efficacité (l'agent fait juste du premier coup) et l'efficience (pas un token chargé pour rien), avec un rendu propre pour un dépôt public. À lancer à la main (/revue-contexte-agentique) de temps en temps, après la sortie d'un nouveau modèle ou d'une version notable de Claude Code, ou quand des sessions se trompent sur une consigne. Pas pour le code (revue-de-code) ni pour le protocole (critique-protocole, conformite-protocole). Produit un rapport daté dans docs/contexte-agentique/ et une PR.
model: fable
effort: max
disable-model-invocation: true
---

# Revue du contexte agentique

Le contexte agentique est tout ce qu'un agent lit avant d'agir dans ce dépôt. Il est bon quand
une session neuve, ou un contributeur qui clone le dépôt avec un autre outil, fait juste du premier
coup **et** quand rien de ce qui est chargé à chaque tour n'y est pour rien. Les deux exigences se
tiennent : une consigne inutile n'est pas gratuite, elle dilue les consignes utiles.

**Ce qui est revu.** Versionné : `CLAUDE.md` (et tout `CLAUDE.md` ou `AGENTS.md` imbriqué),
`HANDOFF.md`, `LESSONS.md` en tant que consigne, `.claude/skills/`, `.claude/agents/`,
`.claude/briefs/GABARIT.md`, `.claude/settings.json` et tout fichier de crochets ou de serveurs MCP
versionné. Local, en lecture : `.claude/settings.local.json`, la mémoire de Claude Code
(`~/.claude/projects/<projet>/memory/`). Cette compétence se revoit elle-même.

**Ce qui n'est jamais touché :** `docs/PROTOCOLE.md`, `docs/CONTRATS.md`, `prompts/`, `config/`,
`data/`, le code, les anciens briefs de `.claude/briefs/` (archives). Les huit règles non
négociables et la frontière d'autonomie de `CLAUDE.md` peuvent être déplacées, resserrées ou mieux
formulées, **jamais affaiblies ni retirées** : toute proposition qui en change le sens revient à
l'auteur.

## Étape 0 — Modèle et budget

La passe est faite pour Claude Fable (alias `fable`) à l'effort maximal : c'est l'en-tête de ce
fichier. Vérifier `echo "${CLAUDE_CODE_EFFORT_LEVEL-non définie}"` : définie à autre chose que
`max`, s'arrêter et le dire. Inscrire au rapport le modèle de la session tel qu'elle le connaît.

L'efficience vaut aussi pour la passe : **deux sous-agents au plus**, lancés ensemble à l'étape 2,
chacun avec `model: "fable"` explicite. Le reste se fait dans la session, en lisant chaque fichier
une fois. Un lancement refusé ou retombé sur un autre modèle : le noter au rapport et continuer
seul plutôt que relancer.

## Procédure

1. **Arbre propre**, branche `docs/contexte-AAAA-MM-JJ` tirée de `main` à jour. Relire le rapport
   précédent de `docs/contexte-agentique/` s'il existe : ses constats acceptés ou refusés ne
   reviennent pas sans argument nouveau, ses constats ouverts sont repris avec leur date.

2. **Lancer les deux sous-agents en un seul message**, puis faire l'étape 3 pendant qu'ils
   travaillent :
   - **Veille** (`general-purpose`, `model: "fable"`) : relever les pratiques **en vigueur le jour
     de la passe**, sources primaires d'abord — documentation de Claude Code (mémoire et
     `CLAUDE.md`, compétences, sous-agents, crochets, réglages et permissions, modèles et efforts),
     guide de rédaction de prompts d'Anthropic, et la spécification `AGENTS.md` si elle a cours.
     Le brief lui donne les axes de `references/grille.md` comme liste de questions, et exige pour
     chaque pratique : l'énoncé, l'URL consultée, la date de la page si elle en a une, et ce qui a
     changé depuis la date du rapport précédent. Pas de pratique sans URL. Elle ne lit pas le dépôt.
   - **Lecture à froid** (`general-purpose`, `model: "fable"`) : un agent sans aucun contexte reçoit
     seulement le chemin du dépôt et trois tâches types tirées de `docs/feuille-de-route.json`
     (une de code de mesure, une d'interface, une de documentation). Pour chacune, il lit ce qu'un
     agent lirait, **sans rien modifier**, et rend : ce qu'il a lu, dans quel ordre ; ce qui était
     ambigu, contradictoire, périmé ou introuvable ; ce qu'il a dû deviner. Ne pas lui souffler les
     défauts déjà vus : un lecteur à qui l'on donne la réponse la confirme.

3. **Mesurer et lire.** Relever, pour le rapport, la taille de ce qui est chargé **à chaque
   session** (commandes dans `references/grille.md`, axe 2) : `CLAUDE.md` et ce qu'il importe,
   l'index de la mémoire, les descriptions des compétences et des sous-agents. Puis lire tout le
   périmètre une fois, avec la grille. Les vérifications d'exactitude (axe 1) sont mécaniques :
   chaque chemin, script `pnpm`, compétence ou agent cité est cherché, pas supposé.

4. **Confronter.** Croiser la grille, la veille et la lecture à froid. Une pratique de la veille ne
   devient constat que si le dépôt s'en écarte **et** que l'écart coûte quelque chose de concret :
   une erreur d'agent plausible, des tokens chargés pour rien, un contributeur bloqué. Une pratique
   à la mode qui n'apporte rien ici n'est pas un constat. Une pratique qui contredit une règle du
   projet est notée, pas appliquée.

5. **Vérifier chaque constat soi-même** avant de le garder : la citation existe mot pour mot
   (`grep`) ; le contexte n'y répond pas déjà ailleurs ; le coût est écrit en une phrase. Un
   constat de la lecture à froid se reproduit en relisant le chemin qu'elle a suivi.

6. **Corriger ce qui est sûr, proposer le reste**, selon le tri de `references/rapport.md` :
   - *appliqué dans la PR* : exactitude (chemin mort, commande renommée, fait périmé), doublon
     retiré au profit d'une seule source, déplacement d'un contenu de tâche hors du contexte
     toujours chargé vers une compétence ou une référence, description de compétence ou d'agent
     resserrée, mémoire locale corrigée ;
   - *proposé à l'auteur* : tout changement du sens d'une consigne, toute nouvelle compétence,
     agent, crochet ou permission partagée, tout changement d'affectation de modèle ou d'effort,
     tout ajout de fichier d'interopérabilité (`AGENTS.md`…).

   Chaque correction réduit ou garde la taille du contexte toujours chargé, sauf justification
   écrite. Préférer, dans l'ordre : supprimer, déplacer, raccourcir, reformuler, ajouter.

7. **Livrer.** Rapport `docs/contexte-agentique/AAAA-MM-JJ.md` au gabarit de
   `references/rapport.md`, avec les tailles avant et après. `pnpm check && pnpm test` passent.
   Commit, push, PR qui ne contient que le périmètre de la passe ; fusion selon la règle en vigueur
   (`HANDOFF.md`). Les propositions à l'auteur deviennent des décisions `en_attente` dans
   `docs/feuille-de-route.json` (recommandation en premier), puis `pnpm feuille-de-route`.

## Règles de la passe

1. **Une conséquence, ou rien.** Pas de constat de goût. Une phrase qui n'admet qu'une lecture ne
   se reformule pas.
2. **Une seule source par fait.** Une consigne vit à un endroit ; les autres y renvoient.
3. **Ne pas dire au modèle ce qu'il sait ni ce que le code dit.** Le contexte porte ce qui est
   propre au projet, non déductible du dépôt, et dont l'oubli coûte.
4. **Le pourquoi pour toute règle non évidente**, en une proposition : un agent qui comprend la
   raison généralise juste.
5. **Rien d'inventé.** Aucune pratique sans source consultée ce jour-là ; aucun chemin, script ou
   comportement d'outil supposé.
6. **Public par défaut.** Rien de personnel ni de propre à une machine dans ce qui est versionné :
   pas d'adresse, pas de chemin absolu, pas de consigne qui ne vaut que pour l'auteur sans le dire.

## Après la passe

Ce que la passe a payé d'inattendu va dans `LESSONS.md` ; une question de lecture qui a manqué va
dans `references/grille.md`.
