## Essais de terrain préparés

Trois essais que seul l'auteur peut exécuter, hors du dépôt. Aucun outil évalué n'y est interrogé sur
un candidat ; aucun nom de personne ne revient au registre ; aucune donnée personnelle n'entre au
dépôt. Ce que le §10 impose à chacun est écrit.

### E1. Un rapport d'exemple, un destinataire (H5, H10, H11)

- **Hypothèses testées** : un résultat publié sur un site trouve seul ceux qui peuvent agir (H5) ;
  un tableau de taux par outil est la forme qui change quelque chose (H10) ; ce qui compterait comme
  un succès est observable (H11).
- **Procédure** :
  1. Assembler le « rapport » avec ce qui existe : le site pédagogique construit (`pnpm build:site`),
     sa page `/exemple/` (déjà fictive : « Candidat A », « Outil X », mention « Exemple fictif »), et
     le fichier de métriques d'un run simulé (`pnpm run:dry` puis `pnpm analyze` sur le jeu de
     démonstration), renommé « FICTIF ». Le rapport de run lisible n'existe pas encore (lot `site`,
     T0) : c'est précisément ce que l'essai teste avant de le construire. Aucun chiffre réel
     n'existe ; aucun ne peut fuir.
  2. Le remettre à trois personnes qui pourraient agir sur un vrai rapport, une par type : une
     journaliste ou un journaliste qui couvre la campagne ou le numérique ; une chercheuse ou un
     chercheur (évaluation des modèles, science politique) ; une personne d'une institution
     compétente (voir H5), à titre personnel ou institutionnel selon ce que le §10 permet. Même
     message à chacune, sans aucune question du banc, sans résultat réel.
  3. Trente minutes d'entretien : « Qu'avez-vous lu en premier ? Qu'en avez-vous compris ? Qu'en
     feriez-vous si c'était vrai ? Que manque-t-il pour que vous puissiez agir ? Sous quelle forme
     l'auriez-vous voulu ? » Noter les réponses sans nom.
- **Ce qu'il faut observer** : l'ordre de lecture (tableau, erreurs in extenso, méthode, limites) ;
  les contresens (lu comme un classement de candidats ?) ; l'action nommée ; la forme demandée (note
  courte, jeu de données, alerte par outil, graphique, flux).
- **Falsifie si** : aucune des trois personnes ne nomme une action qu'elle ferait vraiment, ou si la
  seule action nommée est une action que le §10 interdit (classer des candidats, recommander un vote).
- **Coût** : 2 h pour produire le rapport fictif (code existant), 3 × 45 min d'entretien et de
  prise de notes, 1 h de synthèse : environ 6 h.
- **§10** : aucun accès anticipé à un résultat réel n'est donné (il n'en existe pas) ; la personne
  d'institution ne reçoit aucun rôle ; le message envoyé est conservé pour être publié avec la
  passe suivante si l'auteur le juge utile.
- **Retour au registre** : trois lignes « type de destinataire — action nommée (oui/non) — forme
  demandée », sans nom.

### E2. De vraies questions d'électeurs (H1, H2, H3)

- **Hypothèses testées** : le canal, les outils et l'objet mesurés sont ceux par lesquels un
  électeur s'informe (H1, H2), et ses questions ressemblent aux gabarits de l'annexe B (H3).
- **Procédure** :
  1. Demander à dix à quinze personnes hors du milieu technique et hors de l'entourage politique
     de l'auteur, de générations et de milieux différents : « Si vous vouliez savoir ce qu'un
     candidat propose, et que vous utilisiez une IA, laquelle ouvririez-vous, où, et que lui
     taperiez-vous, mot pour mot ? » Ne pas suggérer d'outil ni de thème.
  2. Noter seulement : l'intermédiaire (application, site, moteur de recherche avec réponse
     générée, assistant d'une messagerie, assistant du téléphone), le nom de l'outil, le canal
     (gratuit, abonnement), la question dans ses mots, le thème. Ne noter ni la réponse d'un outil
     (aucun outil n'est interrogé), ni l'opinion politique de la personne, ni son nom.
  3. Classer chaque question : tombe-t-elle sous un gabarit de l'annexe B (fermé, négatif,
     orienté, attribution, obsolescence) ? Porte-t-elle sur une position programmatique, ou sur
     autre chose (biographie, affaires, modalités du vote, « pour qui voter », sondages) ? Passe-t-elle
     par un intermédiaire de la liste du §3 ?
- **Ce qu'il faut observer** : la part des questions couvertes par les gabarits ; la part des
  intermédiaires couverts par la règle d'inclusion ; la part des questions hors objet (§3).
- **Falsifie si** : plus de la moitié des questions tombent hors des gabarits ou hors de l'objet,
  ou plus de la moitié des intermédiaires nommés sont hors de la règle d'inclusion.
- **Coût** : 15 × 10 min, 1 h de dépouillement : environ 4 h.
- **§10** : rien à publier ; aucune donnée personnelle conservée au-delà du dépouillement.
- **Retour au registre** : trois parts (gabarits, objet, intermédiaires), en effectifs et en
  pourcentage, sans détail individuel.

### E3. La même question à chaque éditeur (H4)

- **Hypothèse testée** : un éditeur corrige son outil parce qu'un rapport mensuel de réponses
  notées lui est envoyé (§6).
- **Procédure** :
  1. Écrire un message unique, relu par l'avocat (§10) : le projet existe, le protocole est public,
     aucune question ni aucun résultat n'est communiqué avant publication (§6) ; « sous quelle forme
     un signalement d'erreur factuelle sur une position de candidat vous est-il utile, et par quel
     canal (adresse, formulaire, programme de signalement, contact presse) ? ». Rien d'autre.
  2. L'envoyer le même jour, dans les mêmes termes, à l'adresse de contact publique de chaque
     éditeur du périmètre (assistants et comparateurs), depuis l'adresse dédiée du projet.
  3. Publier le message et chaque réponse telle quelle, ou l'absence de réponse à 30 jours, avec la
     passe suivante.
- **Ce qu'il faut observer** : qui répond, en combien de temps, par quel canal, et si le canal
  utile nommé est un rapport mensuel, un formulaire de signalement, un programme formel, ou rien.
- **Falsifie si** : aucun éditeur ne répond en 30 jours, ou si aucune réponse ne désigne un canal
  par lequel un rapport serait traité.
- **Coût** : 2 h de rédaction, relecture de l'avocat (déjà prévue au §10), 1 h d'envoi et de suivi.
- **§10** : « Aucun éditeur d'outil … n'a d'accès anticipé, de droit de relecture ou de canal
  privilégié » : même message, même jour, à tous ; publication intégrale ; aucune question du banc.
  Question pour l'avocat : ce contact préalable change-t-il quelque chose à l'indépendance déclarée
  au §1 ?
- **Retour au registre** : nombre d'éditeurs contactés, nombre de réponses, canaux nommés.
