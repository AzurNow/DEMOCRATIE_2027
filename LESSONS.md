# Bonnes pratiques — Banc d'essai 2027

Ce qui a été appris en travaillant sur ce dépôt, et qu'il serait coûteux de réapprendre. Complété au
fil des sessions. Une leçon n'entre ici que si elle a été **payée** : une décision prise, un piège
évité, une erreur commise.

`CLAUDE.md` dit comment travailler ; ce fichier dit ce que l'expérience a ajouté.

---

## Modélisation des données

**Encoder la règle dans le schéma, pas dans un commentaire.** « Au plus une page par seconde » (§6)
est devenu un `maximum: 1`. « Un juge n'attribue jamais *indéterminée* » (§7) est devenu une
restriction d'énumération conditionnelle, au lieu d'une phrase adressée au modèle dans le prompt —
un modèle finit toujours par ignorer une consigne en langage naturel, et la valeur serait alors
entrée dans les dénominateurs sans que personne ne la voie.

**Un identifiant ne doit rien signifier.** `2027-LEP-FISC-0012` encode le candidat et le thème :
il devient faux dès qu'un annotateur corrige le thème, ce que la grille de validation lui demande
explicitement de faire. Il fait aussi fuiter l'identité de l'outil vers un juge censé être aveugle.
Identifiants opaques, champs séparés, étiquette lisible décorative et gelée.

**Ne jamais stocker deux fois une valeur qui peut diverger.** La frontière d'obsolescence d'un item O
est portée par un champ unique (`date_changement`), pas recopiée dans les deux états. Deux dates
décrivant le même instant finissent toujours par ne plus coïncider.

**Avant d'unifier deux calculs identiques, vérifier qu'ils couvrent le même objet.** La PR A du
16 octobre notait en dette que l'empreinte de relecture dupliquait `mesure.empreinte` et proposait
de les fusionner. Le protocole 0.17 a ensuite exigé que la relecture couvre aussi alias, origine et
vérification de fictivité : fusionner aurait soit sorti ces champs de la relecture, soit changé
l'empreinte de toutes les mesures. Deux fonctions au même code aujourd'hui peuvent mesurer deux
choses ; les nommer d'après ce qu'elles couvrent (`empreinteRelecture`), pas d'après leur code.

**Un enum qui mélange des dimensions orthogonales est un bug qui attend.** Les sept statuts d'item du
protocole mêlaient validation, contestation et temporalité — alors qu'un item peut être vérifié,
contesté et obsolète en même temps. Trois champs indépendants, et l'obsolescence dérivée des dates.

**Une donnée absente reste absente.** Pas de `?? 0`, pas de `|| "inconnu"`, pas de recopie de
`modele_demande` dans `modele_renvoye` quand l'API ne renvoie rien. `null` est une information ;
une valeur plausible est un mensonge.

**Épingler la version de ce contre quoi on a jugé.** Git dit *quand* une donnée a changé, jamais
*contre quelle version* une mesure a été produite. Toute référence à un objet mutable porte son
numéro de version et son empreinte.

**Les bornes temporelles se déclarent.** Intervalles semi-ouverts partout (`debut <= t < fin`), un
instant de référence unique par run, et un décalage horaire explicite sur chaque horodatage. La
convention est même inscrite dans les données (`regle: "semi_ouvert"`), pour qu'un lecteur n'ait pas
à la deviner.

**Un offset n'existe pas sans son unité.** `projeter()` associait chaque caractère normalisé à sa
position en points de code, puis la recherche se faisait avec `indexOf`, qui compte en unités UTF-16.
Les deux coïncident jusqu'à la première source contenant un emoji ou un idéogramme, après quoi tout
le surlignage se décale d'un caractère — sans erreur, sans exception, sans test rouge. La correction
tient en une ligne (un index par unité UTF-16, valant le point de code d'origine) ; la trouver après
coup aurait supposé de soupçonner le surlignage plutôt que la source.

**En draft 2020-12, `items` ne contraint que ce qui suit `prefixItems`.** Le schéma `reponse`
déclarait la forme d'une tentative dans `items` et la numérotait dans `prefixItems` : avec au plus
trois tentatives, toutes couvertes par `prefixItems`, la forme n'était jamais contrôlée. Le défaut est
apparu le 2026-10-02 quand retirer `refus_api` de l'énumération des erreurs n'a rien changé à la
validation. Déclarer la forme dans `$defs` et la référencer depuis chaque `prefixItems`, et prouver
chaque restriction par un exemple invalide qui ne tombe que pour elle (`reponse/invalide-13`).

**Construire une charge aveugle en projetant aussi les sous-objets.** La charge du juge était
construite champ par champ pour ne rien laisser passer de l'outil, mais la PR #79 recopiait les
citations de l'éditeur telles quelles : leur forme (clés en camelCase ou snake_case, `type`,
indices) suffisait à reconnaître l'éditeur, donc l'outil noté. La fuite, signalée par l'agent comme
choix en attente, a été fermée par D15 (projection sur `{ url, texte }`). Un objet ouvert (`ObjetJson`) recopié dans une
structure aveugle annule l'aveuglement ; chaque niveau doit être projeté.

**Compter un dénominateur sur le plan, jamais sur les fichiers présents.** Une réponse reçue mais
non stockée (#170) n'avait pas de fichier de réponse : elle sortait du dénominateur des manquantes,
donc du seuil des 20 % et de `par_mode`, sans un message. La relecture du 2026-11-01 l'a vue ; D56 (2)
et #201 comptent désormais sur le plan d'interrogation. Tout ce qui manque doit rester compté comme
manquant.

## Tests

**Les exemples invalides sont les vrais tests.** Un exemple valide vérifie qu'on n'a rien oublié ;
un exemple invalide vérifie qu'une règle du protocole est réellement gardée. Trois invalides pour
deux valides, et chacun cible une règle nommée.

**Un manifeste fait la table de vérité.** Chaque exemple est accompagné du résultat attendu et de la
règle testée. Sans lui, un fichier `invalide-*` ressemble à une donnée cassée qu'on « corrigera »
plus tard.

**Vérifier qu'un test échoue pour la bonne raison.** Un exemple invalide peut passer au rouge par
accident (une virgule, un champ oublié) et sembler valider une règle qu'il n'atteint jamais. Lister
**toutes** les erreurs de validation, pas seulement la première : sur `notation/invalide-02`, la
règle visée ne produisait que la deuxième erreur du lot.

**Faire échouer volontairement le test qui protège une propriété critique.** Le test d'aveuglement
énumère toutes les routes et vérifie qu'aucune ne laisse filtrer le journal de l'autre annotateur.
Écrit d'un trait, il passait — ce qui ne prouvait rien. En ajoutant une fuite délibérée dans deux
routes, on a vu qu'il tombait *et* qu'il nommait la route fautive. Un test de sécurité qu'on n'a pas
vu échouer est une décoration.

**Un test de symétrie qui compare trois appels d'une même expression ne teste rien.** La première
version de `gestesPourDecision()` calculait le même terme pour « accepter », « rejeter » et « non
évaluable » : le test d'égalité était une tautologie et serait resté vert quoi qu'on fasse. Le coût
de chaque décision vit maintenant dans une table de données, `COUT_DECISION`, dont la symétrie est
la propriété testée. Faire porter l'assertion sur la donnée, pas sur le code qui la relit.

**Un test d'accord entre deux validateurs doit nommer aussi ce qu'ils ne partagent pas.** Le
registre des corrections de thème a deux gardiens : `validerEntreeRegistre()`, frontière d'exécution
aux messages lisibles, et `decision-mesure.schema.json`, contrat publié plus strict. La tentation
était de les faire coïncider en apprenant les dix thèmes à la frontière — au prix d'une troisième
copie de la liste, ou d'un import de `pipeline/` depuis `validation/`. La divergence est devenue une
assertion commentée : le schéma rejette un onzième thème, la frontière l'accepte. Le jour où
quelqu'un resserre la frontière, ce test tombe et l'oblige à le dire.

**Un identifiant de fixture respecte la forme qu'il imite.** Les fabriques de test portaient des
identifiants de mesure `01JBANCESSAI…` contenant `I` et `U`, hors de l'alphabet Crockford base32 que
`commun.schema.json` impose aux ULID. Rien ne les validait, donc personne ne l'avait vu ; le premier
schéma qui les regarde les refuse. Les corriger a fait tomber huit tests d'un coup, parce que
`entree().mesure_id` et `mesure().id` doivent rester égaux pour que l'appariement du registre
fonctionne — le défaut dormait depuis l'écriture des fabriques.

**Tester une bibliothèque sur l'entrée qu'elle devrait refuser.** Deux défauts muets trouvés par un
test de refus, aucun par la documentation. `pymupdf.open(stream=…, filetype="pdf")` ignore
`filetype` quand il reconnaît du HTML : une page servie en `application/pdf` aurait été « extraite »
par son moteur HTML, sans erreur (garde ajoutée : `document.is_pdf`). Et `codecs.lookup("iso-8859-1").name`
vaut `iso8859-1`, pas `latin-1` : la règle WHATWG « latin-1 se lit en windows-1252 » ne
s'appliquait jamais, et l'apostrophe `’` devenait un caractère de contrôle.

**Un test qui ne construit que le cas favorable passe par hasard.** Le test « rend la liste exacte
des candidats pour une question d'attribution » n'utilisait que des items « pour » : il est resté vert
alors que la liste attendue contenait aussi les candidats « contre » (conformité n° 2, 2026-09-24).
Pour une règle qui filtre, construire au moins un cas que le filtre doit écarter.

**Rejouer toute la suite avant de choisir entre deux lectures du protocole.** Le 2026-10-01, la
lecture stricte du §5 (« strate par strate », constat n° 8) corrigeait le cas de la sonde. Mais deux
tests de `symetrie.test.ts` rougissaient : un candidat qui reçoit une Q-NEG au lieu d'une Q-DIR sur
le même item, cas que la répartition des gabarits tolère à une question près. Codée sans relancer
la suite, la lecture stricte aurait bloqué des tirages légitimes. Le conflit, porté à l'auteur, a
donné la lecture « totaux propres par thème ».

**Un exemple normatif écrit dans le protocole se lit par un test.** L'instance d'item de l'annexe A
se disait « instance valide du schéma ». Elle a cessé de l'être avec #50 (source sans `format`), et
son empreinte n'était pas celle de son contenu notant : quatre jours sans qu'aucun test ne tombe,
découvert par une passe de conformité (n° 34). `tests/protocole-annexe-a.test.ts` lit désormais le
bloc JSON du protocole tel quel, et le valide au schéma et à l'empreinte.

**Tester une correspondance dans les deux sens.** `notationsConcordent` était censée distinguer
« tout ce que lisent les métriques primaires » : c'était écrit en commentaire depuis la 0.7, et
chaque sens était plausible à la lecture. Le garde de la PR #82, qui fait varier chaque champ un à un
et compare les métriques calculées, a trouvé quatre écarts (deux drapeaux lus seulement par une
métrique secondaire, la fraîcheur sans drapeau) ; ils sont devenus la décision D17. Le sens
« métriques différentes ⇒ notes différentes » protège la mesure ; l'autre révèle ce que le texte du
protocole dit de travers.

**Couper `gc` et `maintenance` automatiques dans un dépôt Git de test.** Le 2026-10-16, la CI de
#136, une PR qui ne touchait que de la documentation, a échoué deux fois de suite sur deux tests du
gel différents. L'erreur était `ENOTEMPTY` à la suppression de `/tmp/banc-gel-depot-…/.git`. Un
`git commit` peut lancer en arrière-plan un `gc --auto` qui écrit encore dans `.git` pendant que
`afterEach` supprime le dépôt. Corrigé dans `tests/aides/depot.ts`
(`-c gc.auto=0 -c maintenance.auto=false`, #138). Tout dépôt Git de test passe par cet outil.

**Après avoir fusionné `main` dans une branche, relancer `pnpm check`, pas seulement les tests du lot.**
Le 2026-11-04, #295 a rendu obligatoire la section `ecart_juge_editeur` de `metriques.json`
pendant que #289, écrite en parallèle, ajoutait l'exemple `metriques/valide-05`, qui ne l'avait pas.
Chaque branche était verte seule ; seul `pnpm check` lancé après la fusion de `main` a fait
apparaître l'exemple devenu invalide. Une propriété requise ajoutée par un lot casse les exemples
neufs des lots voisins, jamais les siens.

**Donner un délai explicite aux tests de bout en bout qui écrivent sur disque.** Le 2026-11-09, les
tests de bout en bout de `tests/notation/notation-reelle.test.ts` (gel, chaîne, puis deux fichiers
synchronisés par envoi avec l'archive D100) ont dépassé les 5 s par défaut chez trois agents sur
trois, et jusqu'à 18 s sous charge : verts seuls, rouges dans la suite. Un `describe(…, { timeout })`
commenté, jamais une assertion allégée (#397).

**Avant de resserrer une règle de `run.schema.json` sur un statut, chercher les tests qui fabriquent un run de ce statut.** #403 exigeait `protocole_sha256` d'un run invalide : les exemples de schéma passaient, mais `tests/go-no-go/commande.test.ts` bâtit un run invalide à la volée, sans empreinte, et la CI a échoué sur une assertion de message (le schéma refusait avant le go/no-go). `grep -rn 'statut: "invalide"' tests/` l'aurait montré avant la PR.

**Normaliser les chemins en `/` avant tout filtre `startsWith` dans un test de structure.** La garde des cycles d'import de `pipeline/questions/` comparait des chemins relatifs à `"pipeline/questions/"` : sous Windows, `relative()` rend des `\`, aucun fichier ne correspondait, et la garde passait en ne vérifiant rien (constaté par #404). Un test vert qui ne voit aucun fichier doit échouer : vérifier qu'il a lu au moins un fichier.

## Outillage

**Ne pas importer dans le site un module qui lit un fichier au chargement.** Le 2026-11-05 (#333), le
site devait importer neuf paramètres du protocole de `pipeline/` : Astro empaquette le code dans
`site/dist/.prerender/`, où les chemins relatifs à `import.meta.url` des modules de
`pipeline/questions/` n'existent plus, et `pnpm build:site` cassait sur `ENOENT`. Une constante que le
site affiche vit dans un module sans effet de bord (`analysis/parametres-protocole.ts`, #335).

**Ne jamais faire comparer des agents parallèles par `git stash`.** La pile de stash est commune au
dépôt et à tous ses worktrees. Le 2026-11-04, huit agents tournaient en parallèle avec un brief qui
leur disait de comparer leurs échecs « avec `git stash` » ; le premier a déclenché une alerte de
ressource partagée, et un `stash pop` aurait pu ramener le diff d'un autre lot dans le sien. Comparer
en lançant le test dans le dépôt principal en lecture seule, ou par un commit temporaire du worktree.

**Pousser vers l'adresse actuelle du dépôt, pas vers l'ancienne.** Le dépôt a été renommé
(`DEMOCRACIE_2027` → `DEMOCRATIE_2027`) et `origin` pointe encore l'ancienne adresse : le 2026-11-04,
un push sur trois échouait par la redirection (500, « failed to push some refs »), puis `gh pr create`
répondait « No commits between main and … ». `git push https://github.com/AzurNow/DEMOCRATIE_2027.git
<branche>` passe du premier coup ; vérifier le push avant d'ouvrir la PR.

**Mettre à jour une PR en conflit par un commit de fusion, pas par rebase.** Le 2026-11-04, le mode
auto a refusé le `push --force-with-lease` d'une branche rebasée (#279). Une branche partie du sommet
distant, `git merge` de `main`, puis `git checkout <branche rebasée> -- .` pour reprendre l'arbre
déjà résolu, a donné un push ordinaire au contenu identique.

**Valider avec ce qui est déjà là.** `jsonschema` était installé sur la machine : 45 exemples
vérifiés sans ajouter une seule dépendance au projet. Une dépendance de plus est une surface d'audit
de plus dans un projet dont la crédibilité repose sur l'auditabilité.

**Les scripts jetables vivent hors du dépôt.** Génération des exemples et validation : deux scripts
dans le répertoire temporaire de session, jamais dans `scratch/` ni dans le dépôt.

**Ne pas écrire de JSON accentué par heredoc.** Le heredoc `cat <<'JSON'` est mal digéré par
l'enveloppe shell de l'agent sur cette machine (erreur `unexpected EOF`). Pour tout contenu
multi-ligne avec accents et guillemets, utiliser l'outil d'écriture de fichier.

**Vérifier une fixture par ses propriétés, pas à l'œil.** Deux défauts silencieux dans le même
générateur : un identifiant dérivé d'un compteur sans largeur fixe faisait collisionner l'item 1 et
l'item 10 — dix items écrits, neuf fichiers sur le disque, aucune erreur ; et une `date_creation`
prise à l'heure courante rendait deux exécutions successives différentes, donc le jeu de
démonstration non reproductible. Compter les fichiers produits et comparer deux exécutions coûte
deux commandes, et les deux défauts sautent aux yeux.

**Enregistrer un schéma ne suffit pas à garder l'objet qu'il décrit.** La dette demandait d'ajouter
`decision.schema.json` au registre et de lui écrire des exemples : fait, et `pnpm check` les vérifie.
Le trou réel restait ouvert. Les exemples avaient été écrits à la main d'après le schéma, et
`JournalAnnotateur.ajouter()` sérialise toujours ce que le type TypeScript accepte, sans rien
valider : schéma et exemples restent d'accord entre eux pendant que le code s'en éloigne. Ce qui
garde un objet, c'est le chemin qui va du code qui l'écrit jusqu'au schéma — pas le schéma seul.

**Fixer les fins de ligne dans le dépôt, pas dans la configuration de chacun.** Sans
`.gitattributes`, `core.autocrlf=true` (réglage par défaut de Git pour Windows) convertissait les
fichiers dorés en CRLF au checkout : huit tests pytest échouaient sur `main` sous Windows, alors que
la CI Linux était verte. Le même mécanisme aurait changé l'empreinte et décalé les offsets de chaque
texte de `staging/textes/`. Un projet qui hache des fichiers texte déclare `eol=lf`, et `-text` pour
ce qui ne doit jamais être touché.

**Traiter « fichier binaire » sur un source comme une alarme.** La revue du 2026-09-23 a trouvé le
défaut le plus grave de la passe parce que `grep` refusait d'afficher `validation/domaine/alea.ts` :
un NUL brut y sépare les composants de toutes les graines (tirage, bootstrap, lots). À l'écran il
ressemblait à une espace ; pour Git, le fichier était binaire, donc ses diffs invisibles en PR. Aucun
signal mesurable ne l'aurait relevé : il faut regarder ce que les outils refusent de montrer.

**Écrire les caractères invisibles par échappement, puis vérifier les octets.** L'outil d'écriture
de l'agent a transformé `́` en accent combinant brut, et un `\n` dans une chaîne TypeScript en
vrai saut de ligne (erreur de compilation). Le test restait juste mais illisible : rien ne distingue
à l'œil `été` composé de `été` décomposé. Pour U+0301, U+00A0, U+00AD, U+FB01 : échappement dans le
code, `String.fromCodePoint` en TypeScript, et un `grep` sur les octets après écriture.

**Hors CI, un substitut de vitest exécute les hooks et les tests en série, ou il écrit dans le dépôt.**
Le 2026-10-01, la session cloud n'avait pas accès au registre npm, et les tests ont tourné sous un
substitut minimal de vitest. Sans `beforeEach`, `tests/data-items.test.ts` n'a pas créé son
répertoire temporaire et a écrit un item à la racine du dépôt. Lancés en parallèle, les tests CLI se
partageaient le même bac et échouaient à tort. Un substitut ne sert qu'aux fichiers qu'on touche :
il exécute `beforeEach`/`afterEach`, il lance les tests l'un après l'autre, et `git status` se
vérifie après chaque passe.

**Dans un worktree, installer les dépendances, puis vérifier le commit, pas la chaîne.** Le
2026-10-02, un worktree d'agent avait un `node_modules` vide : `pnpm check` a échoué sur « tsc:
command not found », ce qui n'était pas une erreur du code. Un autre avait un lien `node_modules`
ignoré par Git : `git add -A -- . ':!node_modules'` a refusé le chemin ignoré et sorti en erreur, et
tout ce qui suivait dans la chaîne `&&` (commit, fusion de `main`) n'a pas tourné. Le compte de
tests affiché ensuite venait d'une commande lancée après un `;`, et il a failli passer pour une
vérification du commit. Dans un worktree : `pnpm install --frozen-lockfile --offline`, puis
`git log -1` après tout enchaînement qui commite.

**Avant de retirer un worktree, comparer ses fichiers non suivis à ceux du dépôt, pas leurs noms.**
Le 2026-10-12, le worktree de #104 gardait un `scratch/prompts/judge-1.0.0.md` du même nom que le
prompt validé par D34 dans le `scratch/` principal ; `cmp` a montré une autre version (09-10, charge
v2, points ouverts). Un `--force` sur la foi du nom perdait un texte, une copie dans le mauvais sens
remplaçait le prompt validé. `git status --porcelain` puis `cmp` fichier par fichier, et archiver
plutôt que supprimer.

**Comparer des chemins comme le disque les compare.** Sur macOS (APFS insensible à la casse),
`Data/items/` passait la garde de sortie de `data/` (règle 3) : `realpathSync` non natif rend la casse
demandée, pas celle du disque. #189 compare après NFC et sans casse ; la règle n'est sûre que pour
refuser, jamais pour admettre.

**Vérifier le CSS construit, pas le CSS écrit.** Le 2026-11-06, le minificateur de la construction
fusionnait `animation-timeline` dans le raccourci `animation:` ; le navigateur rejetait la déclaration
entière, et l'apparition des sections et le bouton « Haut de page » ne tournaient plus depuis leur
écriture, sources et tests verts. Trouvé par hasard par l'agent de la page `/exemple/` (#354) ;
`tests/site/timeline-construite.test.ts` lit désormais `site/dist/`.

**Entre plusieurs worktrees, mettre un `cd` absolu dans chaque commande Git.** Le 2026-11-09, un
`cd ../agent-…` laissé dans une commande précédente n'a pas suivi : la commande suivante a créé la
branche de D100 et tenté son commit dans le worktree des constats de la revue (« nothing to
commit »). Rattrapé avant le push ; un `git add -A` réussi aurait mêlé deux PR.

## Méthode

**Une population de réponses se nomme par une fonction, pas par un filtre en ligne.** La revue du
2026-11-09 a trouvé `estDuRun(r) && r.statut_reponse === "obtenue"` recopié dans six modules (jeu
d'or, contrôle, simulation, lecture du run, go/no-go, écran humain). Le §5 compte le canal API seul,
mais ce filtre laisse entrer les saisies de l'application : l'échantillon humain d'un run désigné
pour l'application les aurait mêlées aux réponses API sans qu'aucun test ne le voie. Aucun signal de
`pnpm proprete` ne le relève ; il a fallu comparer les filtres d'un module à l'autre.

**Quand un filet textuel se tait après une retouche, demander pourquoi.** Le 2026-11-05 (#336), le
filet de la règle 3 signalait le gel simulé, qui écrit un `data/` fictif dans un dépôt jetable ;
l'agent a remplacé la table qui nommait `data/items` par un `cpSync` de tout l'arbre, et le filet s'est
tu sans que la garde réelle (`exigerSortieSimulee`) soit rattachée au filet. Un filet contourné doit
recevoir une exception nommée qui exige la garde, pas un silence (DETTE 2026-11-05 soir, n° 2).

**Lire `state = MERGED` avant toute suppression de branche, et ne rien chaîner derrière une fusion
avec `;`.** Le 2026-11-05, `gh pr checks --watch` est sorti en code 0 sur une erreur réseau
(« connection reset by peer ») alors que le contrôle était encore `pending` ; `gh pr merge` a refusé,
mais la chaîne de commandes a continué et a supprimé la branche locale puis distante de la PR #308,
ce qui l'a fermée : le commit n'existait plus que dans le reflog. Récupéré en recréant la branche
depuis son empreinte et en rouvrant la PR. La consigne de l'auteur le disait déjà (fusionner, lire
`state = MERGED`, s'arrêter au premier échec) ; une suppression derrière un `;` ne regarde pas
l'échec qui la précède, et un code de sortie 0 de `--watch` ne vaut pas CI verte : relire
`gh pr checks` sans `--watch` juste avant de fusionner.

**Un travail de fond lancé avant `/clear` survit au `/clear` et peut changer de branche sous les
pieds de la session suivante.** Le 2026-11-05, une commande d'attente de CI puis de fusion, lancée
en arrière-plan avant un `/clear`, a fusionné la PR et basculé l'arbre de travail sur `main`
pendant que la nouvelle session éditait des fichiers sur sa branche de passe. Rien n'a été perdu
(mêmes arbres), mais le commit serait parti sur `main`. Avant chaque commit, `git branch
--show-current` ; et ne pas lancer en arrière-plan ce qui change de branche.

**Quand une règle change, la corriger partout où elle est écrite, pas la contredire ailleurs.**
La règle de fusion des PR a vécu trois états à la fois : « l'auteur fusionne » dans `CLAUDE.md`,
« `gh pr merge` fonctionne, deux pièges de `CLAUDE.md` sont périmés » dans `HANDOFF.md`, « ne vaut
que pour la session cloud » ici même. La lecture à froid du 2026-11-05 les a trouvés tous les
trois. Un fichier qui dit qu'un autre est périmé n'est pas une correction : on corrige l'autre, et
la mémoire locale avec.

**Faire relire les calculs d'une critique par une défense, pas seulement les citations.** Lors de la
critique du protocole du 2 novembre, toutes les citations des quatre relecteurs étaient exactes, mais
trois constats chiffrés ne tenaient pas tels quels : un taux de recouvrement de 1,4 % que le script
lui-même corrigeait à 34 %, un taux de rejet à tort de 30 % qui ne valait que pour un scénario extrême,
et un dépassement de budget « ×3 à ×10 » qui ignorait le levier préenregistré et l'API par lots. La
défense a relancé chaque script et relu ses hypothèses : c'est elle qui a ramené 15 majeurs au rang
de mineurs. Un chiffre d'une critique se vérifie comme un chiffre publié.

**Clôturer chaque session, et écrire dans chaque PR ce qui pourrait casser.** Du 7 au 10 octobre,
seize PR (#93 à #108) ont été fusionnées sans clôture, et leurs descriptions ne disaient presque
jamais ce qui pourrait casser. Le 12, le tri a dû repartir de 21 000 lignes de diff. C'est là
seulement qu'est apparu le biais de sourçage des pages tronquées (DETTE 2026-10-12, point 1), créé
par D27 le 9. La ligne « ce qui pourrait casser » de la définition de terminé va dans le corps de
la PR, pas seulement dans la conversation.

**Porter le jour même à la feuille de route une question qu'une PR laisse ouverte.** Le choix (A)/(B)
de l'épinglage de l'extracteur, posé dans le corps de #161 le 19 octobre, et la question sans option
recommandée de #168 sont restés sans réponse jusqu'à la relecture du 1er novembre, alors que le code
fusionné appliquait déjà l'option contraire au §4 pour la première. Une question qui n'est que dans le
corps d'une PR fusionnée n'est plus lue par personne : elle entre comme décision Dn ou n'existe pas.
Récidive le 2026-11-02 : cinq PR des lots D59 (#230, #232 à #235) annonçaient leurs questions « à
inscrire dans la feuille de route avec celles des autres lots ». Personne ne l'a fait, et D60 n'en a
repris qu'une partie. La clôture en a retrouvé vingt et une, dont la fausse absence de
`rechercheAbsence` (DETTE 2026-11-02, point 2), devenues D62. « Plus tard, avec les autres » revient
à ne jamais les inscrire : la PR qui pose la question écrit aussi la ligne Dn.

**Une autorisation en mémoire ne lève pas une garde de l'outil.** Le 2026-10-12, `gh pr merge` a été
refusé par le contrôle automatique de Claude Code malgré l'autorisation de fusion du 2026-10-02.
Les PR #104 et #109 attendent la fusion de l'auteur. Ne pas contourner : le dire, et laisser
l'auteur ajouter une règle de permission. Récidive le 2026-11-02 : la fusion de #242 a été
refusée (« Merge Without Review ») alors que la consigne du 2026-11-01 et la mémoire l'autorisent.
Depuis le 2026-11-04, `gh pr merge` passe aussi en local ; la règle reste celle de `HANDOFF.md`,
section « Fusion » : tenter à chaque PR prête, et en cas de refus le dire sans contourner.

**Une dette marquée « réglée » se vérifie dans le code, pas dans le récit.** Le point de dette du
2026-09-20 sur l'exactitude des comparateurs a été barré avec la mention « jamais implémentée » ; la
fonction existait depuis deux jours et gardait les indéterminées au dénominateur. Seule la passe de
conformité l'a vu. Avant de barrer un point, `grep` la fonction qu'il nomme et lire ce qu'elle fait.

**Chercher la règle dans le protocole courant avant de la poser à l'auteur.** Le 2026-09-27, j'ai
demandé où passait la borne des 60 jours (§3). La 0.11, fusionnée deux jours plus tôt, l'écrivait
déjà : instant de gel, bornes comprises. L'auteur a répondu l'inverse du texte. Il a fallu reposer
la question, et une réponse non vérifiée aurait fait coder une règle contraire au protocole. Avant
chaque question de mesure, `grep` le protocole sur ses mots-clés et citer ce qu'il dit déjà.

**Une réponse de l'auteur ne vaut pas autorisation d'écrire le protocole.** Le même jour, après deux
décisions de l'auteur, j'ai voulu écrire la 0.12 dans `docs/PROTOCOLE.md`. Le mode automatique l'a
refusé, à juste titre : CLAUDE.md réserve ce fichier à un accord explicite. Préparer le texte exact
dans la réponse, et ne l'écrire que sur demande. Récidive le 2026-10-02 : quatre décisions de l'auteur sur le §6,
une branche `protocole/0.16` ouverte, l'écriture refusée de nouveau. Le texte proposé est allé dans
`docs/TACHES-AUTEUR.md`, avec la ligne de révision. Le faire d'emblée : une décision de l'auteur
s'écrit dans `TACHES-AUTEUR.md` et la feuille de route, jamais dans le protocole.

**Relire le plan contre les briefs avant de les lancer.** Le 2026-09-27, le constat n° 29
(intervalles du test d'asymétrie) figurait dans le groupe « analyse » du plan, mais dans aucun des
cinq briefs. Il n'est apparu qu'au décompte de clôture. Une liste de constats annoncée se coche
contre les briefs réellement envoyés.

**Une PR qui traite un constat change son état dans le rapport, dans le même diff.** Le 2026-09-25,
la PR #29 a traité six constats de conformité. Le rapport les marquait encore « ouvert », et la
matrice n'avait pas bougé depuis la 0.8 à travers sept PR. À la reprise du 2026-09-27, le décompte
des constats ouverts était faux dans les deux sens : six étaient comptés ouverts alors qu'ils étaient
traités, et trois « code à aligner » (n° 80, 82, 84) passaient pour traités. Le premier lot proposé
aurait refait du travail fait et oublié un écart haut. Une session menée sur l'autre machine se
clôture aussi là-bas : cinq points de dette réglés attendaient d'être barrés.

**Un sous-lot lancé s'inscrit hors de la conversation : son nom, son brief et son worktree.** Le
2026-09-27, le sous-lot G (items et sources) a été coupé par la limite d'utilisation, sans commit.
Son nom, son brief et son worktree ne vivaient que dans la conversation. Après un `/clear`, « reprenons
le sous-lot G » ne renvoyait à rien dans le dépôt : il a fallu fouiller les transcriptions de session
pour retrouver le brief. L'agent n'était pas non plus joignable depuis la nouvelle session, et il a
fallu en relancer un, pointé sur le worktree, avec l'inventaire de ce qui était déjà écrit. À chaque
lancement, noter dans `docs/TACHES-AUTEUR.md` (section 0) le sous-lot, sa branche et son worktree, et
garder le brief en fichier sous `.claude/briefs/`.

**Un sous-agent long écrit ses livrables au fil de l'eau.** Le 2026-09-24, la limite d'utilisation a
coupé les trois sous-agents de la passe de conformité après une heure de lecture : aucun n'avait
encore écrit une ligne de matrice. Ils ont pu reprendre avec leur contexte, mais le brief doit dire
d'écrire dès qu'il y a assez de matière, pas à la toute fin.

**Une passe de conformité trouve ce qu'aucune revue de code ne voit.** La revue du 2026-09-23 lisait
la qualité ; la passe du 2026-09-24 lisait le code contre le protocole et a trouvé neuf écarts graves,
dont une réponse attendue fausse et une graine publiée non rejouable, tous derrière des tests verts.
Lancer `conformite-protocole` après tout lot qui touche une règle de mesure.

**Suivre une règle jusqu'à tous ceux qui la lisent, pas seulement jusqu'au premier.** Le brief du
lot alignement-0-3 demandait de réintégrer l'item arbitré « au tirage » : le sous-agent l'a fait dans
`tirage.ts`, et l'engendrement comme la condition de symétrie continuaient de rejeter tout item
arbitré. Le premier item maintenu par le panel aurait bloqué le run sur un contrôle bloquant. Avant de
briefer un changement de règle, lister avec `grep` chaque endroit qui la lit (ici `statut_contestation`)
et les mettre tous dans le périmètre.

**Un brief ne contredit pas la définition de l'agent qui le reçoit.** Le brief demandait un commit
alors que `.claude/agents/codeur-*.md` l'interdit : les deux sous-agents ont suivi leur définition et
rendu un arbre non commité, ce qui était la bonne réponse mais a coûté un aller-retour. Le gabarit
`.claude/briefs/GABARIT.md` dit « Aucun commit » : s'y tenir, et commiter soi-même après relecture.

**Poser les questions bloquantes avant d'écrire la première ligne.** Sur un protocole préenregistré,
une hypothèse inventée coûte plus cher qu'une session de questions. Les décisions structurelles
(qu'est-ce qu'une « question » ? combien d'objets ?) changent la forme de tous les fichiers : les
trancher après coup, c'est tout réécrire.

**Séparer ce que je peux décider de ce qui appartient à l'auteur.** Précision d'implémentation :
je tranche et je le signale. Règle de mesure, seuil, règle d'inclusion : je propose, je n'exécute
pas, et je signale si un amendement (§9) est nécessaire.

**Enregistrer plus sans changer la métrique.** Face à un manque (la réponse partiellement correcte
n'existe pas dans la grille), ajouter un champ descriptif — `motif_inexactitude`,
`attribution{attendus, cites}` — plutôt que toucher à la catégorie primaire. Les métriques
préenregistrées ne bougent pas, et la nuance reste reconstructible en analyse exploratoire.

**Une contrainte qui s'applique en écrivant va dans `CLAUDE.md` ; une compétence ne porte que le
comment.** Le seuil de complexité doit être présent à chaque fonction écrite : le mettre dans une
compétence chargée à la demande, c'est garantir qu'il ne sera pas là au moment où il compte. Quatre
lignes dans `CLAUDE.md` pour la règle, la compétence `complexite-maitrisee` pour la façon de
découper sans violer les deux règles voisines du dépôt. Le critère de partage : *cette information
doit-elle être présente avant de savoir qu'on en a besoin ?*

**Chiffrer le volume avant de choisir le stockage.** « Fichiers JSON dans Git » se tenait jusqu'à
ce qu'on multiplie : 24 000 réponses par run, 20 runs, 4 à 12 Go. Le dépôt cessait d'être clonable,
donc vérifiable, ce qui supprimait la raison d'être du projet — et personne ne l'aurait vu avant la
première semaine de runs hebdomadaires. Trois multiplications valaient mieux qu'une intuition.

**Relire le texte qui fait autorité plutôt que le résumé qu'on en a fait.** Le protocole exige que
les réponses brutes soient *publiées* et que Git soit le journal des *modifications* : deux exigences
distinctes, fusionnées à tort en « tout dans Git ». La solution était déjà dans le §9, sous la forme
du DOI Zenodo imposé à chaque publication. Aucun amendement n'a été nécessaire.

**Un trou du protocole se signale, il ne se comble pas en silence.** Trois contradictions relevées
cette session (candidat retiré, symétrie et Q-ATT, ajout fabriqué non contraire) sont documentées
comme candidates à un amendement, pas résolues d'autorité dans le code.

**Reporter une décision de mesure dans le protocole dans la session qui la prend.** Six décisions
du 2026-09-17 (kappa à trois catégories, contenu notant, non-évaluabilité, grille par type) ont été
implémentées et testées, puis laissées hors du protocole. Les écrire le lendemain a exigé de relire
`kappa.ts`, `promotion.ts`, `grille.ts` et `empreinte.ts` pour retrouver exactement ce qui avait été
tranché : le code était devenu la seule source, alors que le protocole doit faire autorité sur lui.

**Poser une question ouverte, c'est souvent trouver un trou à côté.** En rédigeant les options sur
l'alerte de kappa, on a vu que `Lot.reannote` était déclaré, affiché, et jamais rempli : le vrai
manque n'était pas le bouton discuté, mais le lien entre un lot et sa réannotation, sans lequel le
critère go/no-go du §12 est ambigu. Vérifier ce que le code fait du champ avant de débattre de
l'écran qui le montre.

**Typer les dépendances avant de dessiner un graphe d'avancement.** La première idée de la feuille
de route était un arbre de compétences où un lot est verrouillé tant que ses prérequis ne sont
pas atteints. Sur ce dépôt, il aurait grisé l'extraction et la notation pendant des semaines, alors
que les deux se développent sur `validation/fixtures/` avant que la collecte existe. Deux types
d'arêtes, `bloque` et `informe`, et seul le premier entre dans le calcul de l'état ; le second se
dessine en pointillé pour dire « à relire quand l'amont change ».

**Générer une vue de pilotage, ne jamais l'éditer.** Un Markdown de suivi écrit à la main diverge
du réel en deux sessions, et un outil externe sort l'état du dépôt Git qui est le journal public du
projet. `docs/feuille-de-route.json` est la seule source, `pnpm feuille-de-route` la seule plume, et
`--verifier` dit quand les deux ne coïncident plus. Ce que l'agent lit et ce que l'auteur regarde
viennent du même fichier.

**Un brief qui liste ses cas limites en liste fermée et ses questions déjà tranchées revient sans
question.** Premier sous-agent lancé d'après `.claude/briefs/GABARIT.md` : 28 cas limites numérotés,
sept hésitations prévisibles réglées d'avance. Rapport rendu sans question ouverte, 29 tests verts
du premier coup, diff strictement dans le périmètre. Le temps passé à fermer la liste avant de
lancer se retrouve en tokens non dépensés à relancer.

**Écrire le code de mesure sur fixtures avant le gel : c'est la relecture la plus exigeante du
protocole.** Trois lots lancés en parallèle sur le §5 et le §8 ont remonté dix-sept questions que
deux lectures humaines n'avaient pas vues : item arbitré tirable ou non, Q-ORI sur un item obsolète
avant son changement, position conditionnelle face à une question fermée, valeur p absente pour une
famille où Holm est pourtant exigé, dénominateur de la confirmation de prémisse. Aucune n'était un
bug : chacune était une phrase du protocole qui ne se traduit pas en `if`. Le coût d'un amendement
après gel se paie en révision d'une ligne avant.

**Quand une décision exige deux commits, le brief exige deux fichiers de tests.** Le lot outillage
devait livrer ajv et ESLint « dans deux commits séparés ». Le sous-agent a livré un seul fichier de
tests mêlant les deux ; le premier commit, pris seul, ne compilait pas. Il a fallu scinder et
rejouer chaque commit dans un répertoire propre. Le brief disait « garde les deux travaux
séparables » ; il fallait dire quels fichiers.

**Rebasculer soi-même la base d'une pile de PR avant de dire de fusionner.** Le 2026-09-24, les
PR #13 à #16 étaient empilées, chacune visant la branche de la précédente. Fusionnées dans l'ordre
sans supprimer les branches, #14, #15 et #16 ont atterri dans leur branche parente : `main` n'a reçu
que #13, et il a fallu une PR de rattrapage (#17). GitHub ne rebascule une PR vers `main` que si sa
base est supprimée. Avant de donner l'ordre de fusion : `gh pr edit <n> --base main` sur chaque PR
de la pile, ou une seule PR depuis le sommet.

**`eslint .` parcourt les worktrees des sous-agents.** Ils vivent sous `.claude/worktrees/`, à
l'intérieur du dépôt, et ESLint y a signalé quatre fonctions déjà découpées, en double, depuis des
copies périmées. Le répertoire est désormais ignoré par ESLint et par Git ; la surprise aurait été
plus coûteuse en CI, où le répertoire n'existe pas et où l'erreur n'aurait jamais été reproduite.

**Un worktree neuf n'a pas de `node_modules` complet : lancer `pnpm install --frozen-lockfile
--offline` avant `pnpm check`.** Le 2026-09-27, après un rebase dans le worktree d'un sous-agent,
`pnpm check` est sorti en erreur sur « tsc: command not found ». Un sous-agent avait contourné le
problème en pointant `PATH` vers le dépôt principal, donc vers des binaires d'une autre version
possible. L'installation hors ligne prend deux secondes et ne touche pas au lockfile.

**Un garde-fou qu'on n'a pas vu attraper quelque chose ne garde rien.** L'extraction de la logique
pure du client l'a fait dépendre de `domaine/`, avec ce risque : un futur module de `domaine/`
important `node:*` casserait l'interface sans qu'aucun test ne le voie. J'ai ajouté la vérification
de types du client à `pnpm check`, puis j'ai délibérément glissé un `import { readFileSync } from
"node:fs"` dans `domaine/grille.ts` pour la voir tomber. Elle ne tombait pas : le client héritait des
types Node par `@types/node`. Il a fallu lui retirer (`"types": []`) pour que le garde-fou garde.
Même leçon que le test d'aveuglement, appliquée à l'outillage : écrire le garde-fou et le voir passer
au vert ne prouve rien.

**Durcir un parseur, c'est distinguer l'entrée malformée de l'entrée légale qu'on n'avait pas vue.**
`secondesDeHorodatage` rendait `NaN` sur « abc », `0` sur une chaîne vide et `1` sur « 1:2:3:4 » : un
lecteur positionné à la seconde zéro ferait vérifier à l'annotateur une autre portion de
l'enregistrement. En le durcissant, il refusait du même coup `00:00:08.000 align:start`, qui est du
WebVTT parfaitement légal. Les réglages de cue sont maintenant écartés avant l'analyse, et
l'horodatage nu refuse tout le reste. Un durcissement sans cette seconde moitié transforme un bug
silencieux en écran cassé sur des fichiers valides.

**Vérifier qu'un sous-agent n'a pas affaibli une assertion se lit dans le diff, pas dans son
rapport.** Le lot de réannotation changeait la signature de `Dossier`, donc `tests/promotion.test.ts`.
Un `git diff` filtré sur les seules lignes contenant `expect` a montré en une commande qu'aucune
attente n'avait bougé, seulement les appels. C'est deux secondes, et c'est la seule preuve que
l'anti-pattern « un test rendu vert en affaiblissant son assertion » n'a pas eu lieu.

**Ne pas fusionner une PR dont la base est la branche d'une autre PR.** Le 2026-09-29, #54 avait
pour base la branche de #53. #53 a été fusionnée dans `main`, puis #54 onze secondes plus tard dans
la branche de #53, que plus rien ne suivait. Ses sept commits (Q-ATT contestée, version de mesure
dépassée, `contestes_au_gel`) n'ont jamais atteint `main`, et la passe suivante aurait repris un
état sans eux. Il a fallu une PR de rattrapage (#55). Une PR empilée se rebase sur `main` avant sa
fusion. À la reprise d'une session, comparer `main` aux branches des dernières PR fusionnées. Payé une deuxième fois le 2026-10-15 : #119 fusionnée dans `lots/mesures-validees` après #118, rattrapée par #120. Depuis, une PR qui contient le commit d'une autre vise `main` et se fusionne après elle (#124 après #123).

**Pour l'aveuglement, vérifier ce que chaque champ servi révèle, pas seulement qui il nomme.** Le
brief de l'écran de notation humaine (#88) autorisait à servir la `TacheAnnotateur`, qui porte le
motif de la tâche. Or `desaccord_juges`, `erreur_grave`, `accord_partiel_juges` et
`arbitrage_echantillon_10` disent ce qu'ont noté les juges ou l'autre humain : l'aveuglement de D18
aurait fui par un champ sans nom d'outil ni de personne. L'agent l'a vu et n'a servi que le
`reponse_id`. Avant d'écrire « seulement X » dans un brief d'aveuglement, se demander pour chaque
champ de X ce qu'un annotateur en déduirait.

**Écrire le texte d'amendement dans les mots exacts de la question tranchée.** Pour D19, l'auteur a
choisi de forcer `non_applicable` quand un juge dit « soutient » sur un lien mort ; le texte proposé
pour la 0.16 disait « quelle que soit la note du juge », ce qui forçait aussi `ne_soutient_pas` et
`indetermine`. Le code (#91) suivait la question, le texte allait plus loin : l'agent l'a relevé.
Relire le texte d'amendement contre la question posée, mot pour mot, avant de le commiter.

**Rédiger le brief d'un sous-agent depuis `.claude/briefs/GABARIT.md`, sans en changer les règles.**
Le 2026-10-12, le brief de la contraction (#111) demandait un commit ; le gabarit et la définition de
`codeur-opus` l'interdisent. L'agent a tenu sa définition et l'a signalé, sans dégât, mais un agent
moins strict aurait commité un diff que personne n'avait relu. La relecture du diff avant commit
reste à la session principale.

**Rédiger l'amendement en même temps que le brief, pas après.** Le 2026-10-16, le brief de la PR 4
du gel admettait la reprise d'un run `en_cours` sans dire ce qu'il advient d'un run `en_cours` qui
porte une invalidation. Le trou est apparu en écrivant la phrase du §6 « un run qui porte une
invalidation n'est plus interrogé », et l'agent travaillait déjà. Il a fallu lui envoyer une
précision en cours de route (cas 12). S'il avait rendu son travail avant, la reprise d'un run
invalidé serait passée.

**Écrire le cas limite d'un brief à partir du texte de la décision, pas de mémoire.** Le 2026-11-04,
le brief de la dette n° 1 demandait de refuser « une contestation présente au commit gelé mais
absente de `run.json` », soit l'inverse de D73 (2), pour qui une contestation portée par le commit
gelé n'est jamais postérieure. L'agent a relu la décision, gardé le bon comportement et testé les
deux sens ; un agent moins prudent aurait codé le refus et rendu le contrôle faux en vert.

**Dans un brief d'agent lancé en parallèle, demander les tests ciblés et laisser la suite complète à
la CI.** Le 2026-11-06, quatre agents ont lancé chacun `pnpm test` (~6 400 tests) en même temps : charge
~40, aucune suite allée au bout, deux agents restés en attente de leur vitest d'arrière-plan à
arrêter à la main. `pnpm check` et les fichiers touchés en local, la suite complète sous Node 22 en CI.

**Après la fusion de PR écrites en parallèle, relancer les tests sur main.** Le 2026-11-09, #377
(test des liens) et #387 (juges réels) passaient chacune leur CI ; fusionnées, la notation réelle
exigeait le test des liens que la fixture de #387 ne posait pas, et `notation-reelle.test.ts` a cassé
sur main. Chaque PR était verte contre un main qui ne contenait pas l'autre.

**Marquer « réglé » dans le rapport daté de revue ou de conformité dès la fusion qui règle un constat.** Le constat 8 de la revue du 2026-11-09 était corrigé sur `main` (8678b9b) mais restait « ouvert » : un agent a été briefé dessus et l'a redécouvert. La clôture du 2026-11-09 après-midi a mis à jour les statuts des deux rapports du jour.
