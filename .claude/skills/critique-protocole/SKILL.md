---
name: critique-protocole
description: Critique experte et contradictoire de docs/PROTOCOLE.md avant le gel de la version 1.0 — ce que diraient les meilleurs spécialistes (méthodologie et statistique, évaluation des modèles de langage, science politique, annotation, science ouverte, droit électoral) et un adversaire de bonne foi qui chercherait la faille — et ce que la sortie de modèles bien plus capables casserait dans un protocole qui ne sera plus modifié. Exhaustive dans la lecture, économe dans les propositions : rien n'est réécrit sans nécessité démontrée. À lancer à la main (/critique-protocole) avant une révision du protocole et obligatoirement avant le gel ; jamais après le gel. Pas pour la cohérence code ↔ protocole (compétence conformite-protocole) ni pour la qualité du code (revue-de-code). Produit un rapport daté dans docs/critiques/ ; n'écrit jamais dans le protocole.
model: fable
effort: max
disable-model-invocation: true
---

# Critique du protocole

Le protocole est ce que les spécialistes liront avant de croire un seul chiffre. Une faille de
méthode trouvée après la publication coûte la crédibilité du projet ; trouvée avant le gel, elle
coûte une révision. Cette passe cherche donc, avant le gel, **tout ce qu'un relecteur exigeant
reprocherait au protocole**, et ne propose de changer que ce qui doit l'être.

Deux exigences tirent en sens contraire, et la passe tient les deux :

- **Être impitoyable dans la lecture.** Chaque section, chaque seuil, chaque définition est lu
  comme le lirait un relecteur qui veut rejeter l'article, ou un éditeur d'outil mal noté qui veut
  faire tomber le résultat.
- **Être avare dans les propositions.** Un protocole meilleur n'est pas un protocole plus long.
  Chaque règle ajoutée coûte du code, des tests, du temps humain et une surface d'attaque. Une
  proposition ne survit que si elle change la validité d'une conclusion, la justesse d'un chiffre
  publié, la reproductibilité ou le risque juridique. Ce qui relève du goût, du style ou de la
  formulation « plus élégante » n'est **pas** proposé.

Ce que cette passe ne fait pas : vérifier que le code applique le protocole (`conformite-protocole`),
juger le code (`revue-de-code`), écrire dans `docs/PROTOCOLE.md`, `docs/CONTRATS.md`, `prompts/`,
`config/` ou `data/`, trancher à la place de l'auteur.

## Quand la lancer, et quand jamais

- Avant chaque révision 0.x substantielle, et **obligatoirement avant le gel de la 1.0** : le gel
  exige une passe sans constat bloquant ouvert (voir « Prêt à geler ? »).
- **Jamais après le gel.** L'auteur a décidé de ne plus affiner le protocole une fois gelé. Si la
  version lue au §1 est 1.0 ou plus, s'arrêter et le dire. Seule exception, que l'auteur tranche :
  un défaut qui rendrait **faux** un chiffre publié (pas moins bon : faux) se signale en une ligne,
  sans proposition de révision ; la procédure d'amendement du §9 est alors l'affaire de l'auteur.

## Étape 0 — Vérifier le modèle

La passe est faite pour Claude Fable 5.1 (alias `fable`) à l'effort maximal : c'est l'en-tête de
ce fichier pour la session, et un paramètre explicite pour chaque sous-agent. D'après la
documentation de Claude Code, l'en-tête est ignoré quand l'organisation exclut le modèle
(`availableModels`), quand le mode auto ne le prend pas en charge, et, pour l'effort, quand la
variable `CLAUDE_CODE_EFFORT_LEVEL` est définie.

- Vérifier la variable : `echo "${CLAUDE_CODE_EFFORT_LEVEL-non définie}"`. Définie à autre chose
  que `max` : s'arrêter et le dire à l'auteur.
- Le gros de la lecture (étapes 3 et 5) passe par des sous-agents lancés avec `model: "fable"` et
  `effort: "max"` explicitement ; cette compétence le demande, c'est l'instruction qui l'autorise.
  Si un lancement est refusé ou retombe sur un autre modèle, **s'arrêter** et le dire : ne pas
  faire la passe avec un modèle moindre sans l'accord écrit de l'auteur.
- Inscrire au rapport le modèle de la session tel qu'elle le connaît, et celui des sous-agents.

L'en-tête ne vaut que pour le tour en cours : tout le travail de l'étape 1 à l'étape 7 se fait
dans ce tour, sans s'arrêter pour poser de question.

## Procédure

1. **Partir d'un arbre propre**, sur une branche `docs/critique-AAAA-MM-JJ` tirée de `main`. Relever
   le commit, la version du protocole (§1) et les empreintes SHA-256 de `docs/PROTOCOLE.md` et
   `docs/CONTRATS.md`.

2. **Lire en entier, sans exception** — c'est la condition de tout le reste :
   - `docs/PROTOCOLE.md` et `docs/CONTRATS.md` (qui fait partie du protocole, §4) ;
   - `prompts/` (les prompts de juge relèvent du protocole, §9) et `config/perimetre.yaml` ;
   - `docs/feuille-de-route.json`, champ `decisions` : D1 à Dn, leurs options et leurs motifs ;
   - le rapport le plus récent de `docs/critiques/` s'il existe, celui de `docs/conformite/`,
     l'entrée la plus récente de `docs/DETTE.md`.

   Une passe précédente existe : ses constats acceptés ou refusés par l'auteur ne sont pas
   re-signalés, sauf argument nouveau ; ses constats ouverts sont repris. Sinon, c'est une première
   passe.

3. **Lire par lentilles, en parallèle et sans s'ancrer.** Lancer, dans un seul message, quatre
   sous-agents `general-purpose` (`model: "fable"`, `effort: "max"`), un par groupe de lentilles de
   `references/lentilles.md` :
   - A : méthodologie et statistique ; mesure et annotation humaine ;
   - B : évaluation des modèles de langage ; juges automatiques ; pérennité face aux modèles
     futurs ;
   - C : science politique et neutralité ; lecteur hostile ;
   - D : science ouverte et reproductibilité ; droit, éthique et gouvernance ; faisabilité.

   Chaque brief donne : le chemin des fichiers à lire en entier (étape 2), le texte de son groupe de
   lentilles, les règles de la passe (plus bas) et le format de constat de `references/rapport.md`.
   **Ne pas leur transmettre d'hypothèse** sur les failles : un relecteur à qui l'on souffle la
   réponse la confirme. Ils lisent, n'écrivent rien, et rendent leurs constats.

4. **Vérifier chaque constat soi-même**, un par un, avant de le garder. C'est l'étape qui empêche
   les erreurs, et elle ne se délègue pas :
   - **la citation existe**, mot pour mot, à la section indiquée (`grep` dans le fichier) ;
   - **le protocole n'y répond pas déjà ailleurs** : chercher dans tout `PROTOCOLE.md` et
     `CONTRATS.md` les termes du constat et leurs synonymes. Un protocole de cette densité répond
     souvent au §8 à ce qu'on croit manquer au §5 : c'est le faux positif le plus fréquent ;
   - **une décision ne l'a pas déjà tranché** : chercher dans `decisions`. Un constat qui rouvre
     une décision n'est gardé que s'il apporte un argument que les options et le motif de cette
     décision n'ont pas pesé, et il cite la décision ;
   - **la conséquence est réelle** : écrire le scénario concret (quelles données, quel chiffre
     publié change, dans quel sens, qui peut l'exploiter). Pas de scénario, pas de constat ;
   - **les faits extérieurs sont sourcés** (règle 6 ci-dessous), ou retirés.

5. **Faire plaider la défense.** Lancer un sous-agent (`model: "fable"`, `effort: "max"`) qui reçoit
   les constats retenus et le protocole, avec une seule mission : pour chacun, défendre le
   protocole tel qu'il est (le texte y répond-il, le coût de la correction dépasse-t-il le gain,
   une limite déclarée au §11 suffit-elle ?). Trancher chaque désaccord soi-même, sur pièces, et
   noter dans le rapport les constats que la défense a fait tomber, avec la raison, en une ligne.

6. **Trier et proposer** selon `references/rapport.md` : gravité, nécessité, coût, et pour chaque
   constat la **plus petite** réponse suffisante, dans cet ordre de préférence :
   1. rien, si la défense tient ;
   2. déclarer une limite au §11, quand corriger coûte plus que ce que la correction apporte et que
      le lecteur informé peut juger seul ;
   3. préciser un mot ou une phrase existante ;
   4. supprimer une règle qui n'apporte rien à la validité (la sobriété est un argument
      scientifique : chaque degré de liberté retiré est une critique évitée) ;
   5. ajouter une règle, en dernier recours, avec son coût en code et en temps humain.

   Un texte proposé est prêt à relire : citation de l'ancien texte, nouveau texte entre guillemets,
   section. Il ne réécrit que la phrase en cause.

7. **Écrire** `docs/critiques/AAAA-MM-JJ.md` au gabarit de `references/rapport.md`, y compris le
   verdict « Prêt à geler ? ». Ajouter à `docs/feuille-de-route.json` une décision `en_attente` par
   question qui revient à l'auteur (bloquants et majeurs), au format des décisions existantes,
   options réelles et recommandation en premier ; puis `pnpm feuille-de-route`. Commiter le rapport
   et la feuille de route, pousser, ouvrir une PR (code et documentation : la session la fusionne
   une fois la CI verte, comme le dit `HANDOFF.md`). **Rien d'autre ne change pendant la passe.**

8. **Après les décisions de l'auteur**, et dans des tours ultérieurs : texte de la révision dans une
   PR qui ne touche que `docs/PROTOCOLE.md` (et `CONTRATS.md` ou `prompts/judge-*` s'il le faut),
   que **l'auteur fusionne** ; puis `conformite-protocole` pour le code qui doit suivre.

## Règles de la passe

1. **Citer, jamais paraphraser.** Un constat porte la phrase exacte du protocole qu'il vise, avec
   sa section. Un constat sur une absence le dit, et donne les termes cherchés en vain.
2. **Une conséquence, ou rien.** « Un spécialiste pourrait trouver cela discutable » n'est pas un
   constat. « Avec 10 items par candidat et deux échantillons par question, l'intervalle de
   l'exactitude par candidat a une demi-largeur d'environ X points, ce qui rend H4 indécidable en
   pratique » en est un, **si le calcul est fait et montré**.
3. **Calculer plutôt qu'estimer.** Une affirmation sur la puissance, un effectif, une largeur
   d'intervalle, un taux d'erreur de type I se calcule (script jetable dans `scratch/`, hors
   production) et le calcul figure au rapport. Sinon elle est formulée comme une question ouverte.
4. **Ne rien inventer.** Aucun item, aucune position de candidat, aucun chiffre de sondage, aucun
   article de loi, aucune décision de justice, aucune référence bibliographique de mémoire.
5. **Ne jamais trancher à la place de l'auteur.** Une question de méthode ouverte reçoit ses
   options réelles, leur coût et une recommandation ; la décision reste la sienne.
6. **Un fait extérieur est sourcé ou retiré.** Une pratique de référence, une norme, une étude
   comparable, un texte juridique ne sont cités qu'après vérification en ligne (WebSearch,
   WebFetch), avec l'URL consultée et la date. Une source non vérifiée est retirée, pas gardée
   « à vérifier ». Une question juridique se formule comme une question **pour l'avocat** (§10),
   jamais comme un avis.
7. **Neutralité.** La critique porte sur la méthode, jamais sur un candidat, un parti ou un
   éditeur. Un constat qui ne tient que pour un camp politique est reformulé ou retiré.
8. **Ni style ni goût.** Pas de reformulation pour la clarté si la phrase actuelle n'admet qu'une
   lecture. Une phrase qui en admet deux est un constat (ambiguïté), avec les deux lectures.
9. **Exhaustif ne veut pas dire long.** Tout est lu ; seul ce qui survit à l'étape 4 et à la
   défense est écrit. Les mineurs tiennent en une ligne chacun.

## Prêt à geler ?

Le rapport conclut par un verdict, oui ou non, sur ces critères :

- aucun constat **bloquant** ouvert ;
- chaque constat **majeur** tranché par l'auteur : corrigé, ou déclaré au §11 ;
- aucune décision `en_attente` dans la feuille de route qui touche les sections 3 à 8 ;
- la dernière passe `conformite-protocole` est postérieure à la dernière révision, et n'a aucune
  exigence `contredite` ;
- les crochets à compléter par l'auteur (par exemple `[fournisseur à nommer par l'auteur avant le
  gel]`, §10) sont tous remplis : `grep -n "\[.*avant le gel\]" docs/PROTOCOLE.md` ne renvoie rien.

Un verdict négatif liste ce qui manque, dans l'ordre où le faire.

## Après la passe

Si la passe a payé quelque chose d'inattendu (une lentille qui a trouvé ce qu'une autre ratait, un
faux positif typique que l'étape 4 a dû écarter), l'ajouter à `LESSONS.md` et, s'il s'agit d'une
question de lecture, à `references/lentilles.md`.
