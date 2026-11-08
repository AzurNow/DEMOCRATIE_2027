# Contrôle manuel avant une campagne d'annotation

Ce que les tests automatisés ne voient pas — parce que `validation/client/` s'exécute dans un
navigateur et que Vitest tourne sans DOM (docs/DETTE.md, décision du 2026-09-18). À dérouler une
fois, sur `pnpm validate`, avant d'ouvrir une campagne à de vrais annotateurs. Chaque ligne est un
geste à faire et une observation à constater, pas une intention.

- [ ] **Focus clavier.** Ouvrir un item, appuyer sur `Tab` à répétition sans toucher la souris :
      vérifier que le focus visite les boutons de décision, les champs de réponse à la grille, puis
      les boutons de navigation, dans cet ordre, sans jamais sortir de l'écran ni sauter un élément
      interactif.
- [ ] **Page d'ouverture d'un PDF.** Ouvrir un item dont la source est un PDF portant une page
      enregistrée (`source.page` non nul) : vérifier que le visionneur natif du navigateur s'ouvre
      directement sur cette page, sans qu'il faille faire défiler.
- [ ] **Position du lecteur audio ou vidéo.** Ouvrir un item dont la source est un enregistrement
      audio ou vidéo : vérifier que le lecteur, une fois les métadonnées chargées, est positionné
      sur l'instant de la citation, pas au tout début du fichier.
- [ ] **Question d'écoute d'une source T2.** Avec le jeu de démonstration (`BANC_DEMO=1`), ouvrir
      un item O dont l'état postérieur est un enregistrement vidéo : vérifier que la question
      « J'ai écouté l'extrait et la transcription est fidèle » s'affiche, avec les questions propres
      au type, qu'une décision est refusée tant qu'elle reste sans réponse, et qu'elle est acceptée
      avec « non » comme avec « oui ». Ouvrir ensuite un item dont la seule source est un PDF :
      vérifier que la question n'apparaît pas (conformité n° 12 ; la logique est testée sans DOM
      dans `tests/transcription-t2.test.ts`).
- [ ] **Ordre des boutons de décision.** Ouvrir un item : vérifier que les boutons Accepter,
      Rejeter et Non évaluable apparaissent dans le même ordre et à la même taille sur plusieurs
      items successifs — aucun raccourci visuel ne doit rendre l'un plus rapide à atteindre que les
      autres.
- [ ] **Surlignage effectivement visible.** Ouvrir un item dont la citation se situe loin dans le
      texte canonique (au-delà du premier écran) : vérifier que la zone de texte défile
      automatiquement jusqu'à amener la citation surlignée dans la fenêtre, sans qu'il faille faire
      défiler à la main pour la trouver.
- [ ] **Source introuvable.** Renommer temporairement le fichier archivé d'une source citée par un
      item (puis le restaurer), rouvrir l'item : vérifier qu'un message explicite signale la source
      absente, à la place du document, plutôt qu'un cadre vide ou une erreur de navigateur brute.
- [ ] **Empreinte divergente.** Modifier d'un octet une copie temporaire du fichier archivé d'une
      source citée (puis restaurer l'original), rouvrir l'item : vérifier que l'interface refuse
      d'afficher le document et signale la divergence d'empreinte, plutôt que de servir le fichier
      modifié.
- [ ] **Reprise de session.** Décider un item, fermer complètement l'onglet ou le navigateur,
      relancer `pnpm validate` et rouvrir la même session annotateur : vérifier que l'item suivant
      proposé est bien celui qui suit la dernière décision enregistrée, jamais le premier du lot ni
      celui déjà décidé.

## Relecture des formulations (décisions D39 et D42)

À dérouler sur un bac jetable, jamais sur le `data/` réel : `BANC_DATA`, `BANC_DATA_MESURES`,
`BANC_DATA_FORMULATIONS`, `BANC_PERIMETRE`, `BANC_STAGING` et `BANC_REFUS_FORMULATIONS` pointés vers
un répertoire temporaire qui porte un item et sa mesure publiés, un périmètre qui nomme son candidat,
et deux propositions acceptées sous `staging/formulations/<question_id>/` (l'une avec des guillemets
« » et des apostrophes ’ dans ses textes).

- [ ] **Accès.** Sur l'accueil, cliquer « Relire les formulations » : vérifier que la liste nomme le
      gabarit, le candidat (un tiret pour une question d'attribution) et la mesure, et ne nomme
      jamais le modèle qui a reformulé.
- [ ] **Périmètre absent.** Pointer `BANC_PERIMETRE` vers un fichier inexistant, relancer : vérifier
      que l'écran affiche un message qui nomme le périmètre introuvable, plutôt qu'une liste vide.
- [ ] **Trois textes côte à côte.** Ouvrir une question : vérifier que les trois textes s'affichent
      dans trois colonnes (neutre, familière, orientée), tels quels, guillemets et apostrophes
      typographiques compris, et qu'aucun n'est modifiable.
- [ ] **Aucune case pré-cochée.** À l'ouverture, vérifier que les trois cases « Sens préservé » et la
      case de prémisse sont décochées, et que les deux boutons sont inactifs. Sur une question
      d'attribution, vérifier que la case dit « La prémisse n'affirme aucune position ».
- [ ] **Promotion.** Cocher les quatre cases : vérifier que seul « Promouvoir » s'active ; cliquer,
      puis vérifier que la question quitte la liste et que `data/formulations/<question_id>.json`
      existe, textes identiques à ceux de la proposition.
- [ ] **Refus.** Sur une autre question, décocher une case : vérifier que « Refuser » reste inactif
      tant que le commentaire est vide ou fait d'espaces, puis s'active ; refuser, puis vérifier
      qu'une ligne s'est ajoutée à la fin de `refus.jsonl` et que la question quitte la liste.
- [ ] **Focus du commentaire.** Taper un commentaire de plusieurs mots : vérifier que le curseur ne
      quitte pas la zone de texte à chaque frappe.

## Après un arrêt brutal (processus tué, coupure de courant)

Rien n'est supprimé automatiquement : une commande qui trouve ce qu'un arrêt a laissé s'arrête sur
une erreur nommée, parce que le fichier peut aussi signaler un écrivain concurrent (docs/DETTE.md,
2026-09-24 n° 5). Avant de supprimer quoi que ce soit : vérifier qu'aucune commande du banc ne
tourne (`ps aux | grep -E "pnpm|tsx|node"`, puis l'identifiant noté dans le verrou), et qu'aucun
autre terminal ni aucune autre machine n'écrit le même dépôt. Un fichier supprimé pendant qu'un
écrivain vivant le tient fait perdre ou doubler une écriture.

- [ ] **Verrou d'un registre à ajout seul** (corrections de thème, relectures, rattachements :
      `validation/mesures/<registre>.json`). Fichier `<registre>.json.verrou`, à côté du registre.
      Reconnu à l'erreur `RegistreVerrouille`, qui nomme le fichier ; il contient une ligne
      `pid <n>, posé le <date>` : vérifier que ce processus n'existe plus (`ps -p <n>`), puis
      supprimer le `.verrou` seul. Le registre lui-même n'est jamais touché (le renommage atomique
      ne le tronque pas) ; relancer la commande, qui relit l'état courant.
- [ ] **Temporaire d'une écriture par renommage** (`run.json`, `checklist.json`…). Fichier
      `<fichier>.<suffixe>` à côté de la cible, le suffixe disant quelle écriture s'est interrompue
      (`demarrage`, `inscription`, `inscription-outils`, `reponses-obtenues`, `invalidation`,
      `contestations-posterieures`, `go-no-go`…). Reconnu à l'erreur `TemporaireOrphelin`, qui
      nomme le temporaire et la cible. La cible est restée intacte : supprimer le temporaire seul,
      relancer. Les réponses brutes de l'interrogation ont leur propre temporaire,
      `<id>.json.partiel` : `DepotReponses.ouvrir` le refuse de la même façon ; même geste, après
      la même vérification.
- [ ] **Réponse 5xx gardée** (staging de l'extraction, `reponses-extraction/<source>/<sha256>/`).
      Fichier `<modèle>.<empreinte du prompt>.echec-transport-<hex>.json`. Ce n'est pas un résidu
      d'arrêt : c'est une réponse brute (statut 408, 429 ou 5xx) gardée sous un nom distinct
      (règle 7), que la relance ne relit jamais comme réponse utilisable et refait donc l'appel. Ne
      pas la supprimer ni la modifier : elle fait partie de ce que l'outil a répondu. Si une
      relance semble attendre ou s'arrêter, c'est un verrou ou un temporaire ci-dessus, pas ce
      fichier.
