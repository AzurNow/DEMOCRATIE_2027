# Grille de lecture

Cinq axes. Pour chaque module, se poser les questions de chaque axe ; chaque « non » est un constat
candidat, à trier ensuite (`tri.md`). Les exemples sont tirés de ce dépôt.

## 1. Robustesse

- **Une donnée absente reste-t-elle absente et visible ?** `?? 0`, `|| ""`, `or []`,
  `.get(clé, défaut)` sont légitimes pour un compteur ou un champ facultatif qui a un sens par
  défaut ; ils sont un défaut quand ils remplacent une donnée qui aurait dû être là (CLAUDE.md,
  anti-patterns). Question à poser : *si cette valeur manquait, quelqu'un le saurait-il ?*
- **Une erreur capturée est-elle traitée pour ce qu'elle est ?** Un `catch` sans nom, ou qui
  attrape tout pour afficher un message spécifique (« Aucune décision à annuler » alors que le
  réseau est tombé), transforme une panne en fausse information.
- **Les frontières sont-elles validées ?** Tout ce qui entre (fichier JSON lu, réponse HTTP, argument
  de ligne de commande, octets téléchargés) est vérifié avant usage. Une conversion `as T` sur un
  `JSON.parse` est une promesse, pas une vérification : elle est acceptable seulement si la donnée
  vient du dépôt et qu'un schéma la garde ailleurs, et le rapport le dit.
- **Le code est-il indépendant de la plateforme ?** Séparateurs de chemin (`\` sous Windows), fins
  de ligne, encodage par défaut (`open()` sans `encoding=`), fuseau horaire, locale de tri
  (`localeCompare` vs comparaison de code). Un test qui passe en CI Linux et échoue sous Windows est
  un constat. Les scripts de `package.json` passent par `cmd.exe` sous Windows : une variable posée
  en préfixe (`VAR=1 commande`) y échoue, comme un `execFileSync("pnpm", …)` sans shell (revue du
  2026-11-09, constat 3).
- **Le résultat est-il déterministe ?** Horloge injectée, ordre de parcours de répertoire trié, pas
  d'itération sur un `Set`/`dict` dont l'ordre dépendrait d'autre chose que de l'insertion.
- **Les écritures sont-elles atomiques et non destructives** là où le protocole exige l'immuabilité ?
  Relancer une commande d'écriture deux fois doit être sans effet, ou refusé.
- **Le source ne contient-il que ce qu'on voit ?** Un caractère de contrôle écrit brut (NUL,
  échappement, espace insécable dans du code) se lit comme autre chose, et un NUL fait classer le
  fichier comme binaire par Git : ses diffs disparaissent des PR. Revue du 2026-09-23 : la
  dérivation de toutes les graines en dépendait. `grep -laP '\x00'` sur les fichiers suivis.

## 2. Structure

- **Chaque règle, constante ou calcul vit-il à un seul endroit ?** Une métrique calculée deux fois,
  une énumération recopiée au lieu d'être lue dans `schema/commun.schema.json`, une configuration
  redéclarée « à l'identique » dans un test. Un filtre recopié en ligne est une règle aussi : une
  population (« les réponses obtenues du run ») écrite six fois sans fonction qui la nomme a laissé
  passer un canal que le protocole excluait ailleurs (revue du 2026-11-09, constat 1). Chercher
  les conditions de `filter` identiques d'un module à l'autre.
- **Le flux reste-t-il à sens unique ?** `collecte → staging → validation → data → runs → analysis →
  site`. Un import de `analysis/` depuis `pipeline/`, ou du site vers `staging/`, est un constat.
- **Y a-t-il du code mort ?** Export jamais importé, branche inatteignable, paramètre toujours passé
  avec la même valeur.
- **Un module a-t-il une seule raison de changer ?** Un fichier de 900 lignes qui mêle rendu, état
  et appels réseau en a plusieurs.
- **Un cas particulier est-il écrit en code au lieu d'être une donnée ?** (`if` sur un candidat, un
  outil, un gabarit.)

## 3. Lisibilité

- **Les noms disent-ils ce que la chose est**, dans la langue du dépôt (français, termes du
  protocole) ? Un même concept a-t-il un seul nom partout ?
- **Une fonction se lit-elle sans remonter ailleurs ?** Longueur (signal au-delà de 50 lignes),
  niveaux d'imbrication, paramètres booléens qui changent le sens de l'appel.
- **Les commentaires disent-ils pourquoi, et disent-ils vrai ?** Un compte écrit en dur (« les seize
  schémas ») ment dès l'ajout suivant ; une référence à un fichier ou une fonction renommés aussi.
  Un commentaire qui paraphrase la ligne suivante est à retirer.
- **Les types portent-ils le sens ?** Une union discriminée plutôt que des champs optionnels
  corrélés ; un `readonly` là où rien ne doit muter.

## 4. Tests

- **Chaque assertion vise-t-elle la bonne raison ?** Un exemple invalide doit échouer sur la règle
  visée seulement (voir `LESSONS.md`, *Tests*).
- **Le test est-il indépendant de la plateforme et de l'ordre d'exécution ?**
- **Teste-t-il un comportement, pas une implémentation ?** Un test qui casse à chaque refactoring
  sans changement de comportement coûte plus qu'il ne protège.
- **Les cas limites de CLAUDE.md sont-ils couverts** là où la logique de calcul les rencontre ?

## 5. Cohérence documentaire

- **Ce que promettent CLAUDE.md, les README et les docstrings existe-t-il ?** Commandes, fichiers,
  fonctions nommées.
- **Les fichiers de doc sont-ils lisibles par tous les outils ?** Encodage UTF-8, fins de ligne LF.
- **La feuille de route et la dette disent-elles l'état réel ?**
