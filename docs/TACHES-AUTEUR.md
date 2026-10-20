# Tâches de l'auteur

Tout ce qui attend l'auteur, et que ni le code ni un agent ne peut faire à sa place, rassemblé pour être
traité d'un coup. Chaque ligne dit quoi, où, et d'où vient la demande. Une tâche faite est cochée,
puis retirée à la clôture de session suivante.

Mis à jour le 2026-10-16. Sources relues : `docs/feuille-de-route.json`, `docs/DETTE.md`,
`docs/PROTOCOLE.md` 0.16, `docs/conformite/2026-09-29.md`, `schema/README.md`, PR #28 à #75.

---

## 0. Fusions en attente

- [ ] **#136** (texte de D51 dans le bloc 0.17), CI verte après mise à jour sur `main`.
- [x] (2026-10-16) #135, #137 et #138 fusionnées (lot gel, PR 3 et 4 ; dépôts de test sans gc).
- [x] (2026-10-12) #109, #104, #110 et #111 fusionnées. Conflit de #104 réglé par l'agent (D34 et
      D35 gardées toutes deux). Le contrôle de Claude Code refuse toujours `gh pr merge` à l'agent.
- [x] (2026-10-16, par l'agent avec l'accord de l'auteur) Supprimer les branches locales `worktree-agent-a691960d77994bec2` et
      `worktree-agent-a6f6673166d1cef6a` (contenu déjà dans `main` par #95, mais `-d` les refuse) :
      `git branch -D`, que l'agent n'emploie pas.
- [x] (2026-10-15) #118, #120 et #122 à #124 fusionnées (mesures validées, lot reformulation).
- [x] #67 à #75 fusionnées le 2026-10-02 (protocole 0.15, décisions du 2026-10-02, clôture,
      chargeur du périmètre, modèle 0.2.0 de `config/perimetre.yaml`, D12, lot interrogation en
      mode simulé).
- [x] (2026-10-03) Supprimer les branches `lots/*`, `protocole/*` et `docs/*` déjà fusionnées (#38 à #66), et
      les worktrees d'agents sous `.claude/worktrees/` (sept créés le 2026-10-02). Ne plus fusionner une PR dont la base est la branche d'une autre
      PR : c'est ainsi que #54 a manqué `main` (rattrapée par #55, `LESSONS.md`).

---

## 1. Avant le gel du protocole (J1, 15 octobre 2026)

### Protocole (`docs/PROTOCOLE.md`)

- [x] **0.13 écrite** (#48) : les seize décisions du 2026-09-27 sont dans le protocole, et le code
      est aligné sur toutes (#49 : symétrie, run, générateurs ; #50 : format, dates, attestation,
      renvoi après correction de thème, tiers de la fiche).
- [x] **Faire refaire la passe de conformité** sur la 0.13 : faite le 2026-09-29
      (`docs/conformite/2026-09-29.md`). Constats n° 1 à 4, 7 à 9, 14, 24, 31 et 33 traités
      (#53 à #57). n° 15, 27 et 29 traités dans #61, n° 10, 12 et 30 dans #62, n° 5, 22 et 32 dans #64,
      n° 6 dans #65, n° 11 dans #66, n° 35 dans #63, n° 23 et 25 dans #72 (chargeur du
      périmètre). Reste ouvert du côté code : le contrôle du n° 18 (lot notation).
- [x] **0.15 écrite** (branche `protocole/0.15`) : les décisions ci-dessous non encore écrites en
      0.14 (accord n° 12, décisions 12 et 13) et les douze décisions du 2026-10-02 sur les constats
      « réviser le protocole » de la conformité du 2026-09-29, plus l'annexe A corrigée (n° 34),
      désormais gardée par `tests/protocole-annexe-a.test.ts`.

  Décisions du 2026-10-02 (conformité 2026-09-29), selon la recommandation, écrites en 0.15 :
  - n° 13 : grammaire de la clé de graine d'une différence. Rien à coder.
  - n° 16 : décisions figées sur un lot terminé par ses deux annotateurs. *Codé (#69).*
  - n° 18 : après le retrait d'un juge, ses notations sont écartées, note du juge restant hors
    échantillon humain, revue humaine des drapeaux graves. *À coder au lot notation* : aucun
    contrôle croisé verdict × notations × run n'existe (un verdict peut s'appuyer sur une note du
    juge retiré ; une note « juge unique » sans drapeau peut cacher un drapeau grave du juge restant).
    **Tranché le 2026-10-03 (D13)** : oui, les notations du juge retiré sont aussi écartées de
    l'accord juges-humains et du kappa des juges publiés avec le run. *À écrire en 0.16* : l'accord
    ne porte alors que sur le juge restant.
  - n° 19 : grappes rangées par `grappe_id`, consommation du générateur écrite. *Codé (#70).*
  - n° 20 : seuls les items à réponse classée entrent dans la permutation. Rien à coder.
  - n° 21 : tendance alignée sur les effets de condition, appariée par question. *Codé (#70).*
  - n° 34 : annexe A corrigée (`format`, empreinte) et testée. *Fait (0.15).*
  - n° 36 : normalisation des URL de sondage, `normalisation-url-v1`. *Codé (#68).*
  - n° 37 : la question d'écoute ne décide que d'un item que les deux décisions vérifieraient.
    Rien à coder.
  - n° 41 : « d'une à quatre questions ». Rien à coder.
  - n° 42 : un candidat cité à tort dans une Q-ATT est une mauvaise attribution ; le drapeau
    fabrication y reste une erreur de notation. Rien à coder.
  - n° 43 : l'accord de deux humains porte sur le seul sourçage valide. *Codé (#70).*
  - n° 44 : couple sans test hors de la famille de Holm, mention « test sans objet ». Rien à coder.
  Les n° 17 (écrit en 0.14) et 38 (outillage) ne demandent pas de texte.

  Historique des décisions écrites en 0.14 et 0.15 :

  Accord du 2026-10-01 (conformité 2026-09-29, n° 12, trou signalé), selon la recommandation :
  §8, tendance : « un couple outil × mode marqué run incomplet au premier ou au dernier run sort de
  la comparaison de tendance, et est rapporté avec le run où il est incomplet ». *Codé (#62).*

  Décisions du 2026-10-02 (conformité 2026-09-29, n° 6 et 11), selon la recommandation :
  12. §4, grille (n° 6) : à la place de la phrase sur l'attestation, « L'attestation n'existe que
     sur un item vérifié ; elle est conservée si le panel retire ensuite l'item ou le déclare non
     évaluable. » Le schéma admet l'attestation sur un item non évaluable dont la dernière décision
     du panel est une non-évaluabilité. *Codé (#65).*
  13. §8 (n° 11, trou signalé) : les « items P de référence » de la couverture d'un comparateur
     sont ceux qui comptent pour le seuil de couverture, soit les items P vérifiés au gel des
     candidats interrogés, non contestés et sur la version courante de leur mesure (même base que
     le tirage). Texte proposé : « Les items P de référence d'un run sont ceux qui comptent pour le
     seuil de couverture de leur candidat ; chacun reçoit une lecture de chaque comparateur. »
     *Codé (#66).*

  Décisions du 2026-09-28 sur le renvoi après correction de thème (PR #50), selon la
  recommandation. La 1 précise le texte du §4 (« retournent en attente ») : à écrire dans la
  prochaine révision.
  1. §4 (n° 69) : un item déjà publié dans `data/` et jugé contre l'ancien thème n'est pas renvoyé
     par `pnpm mesures --renvoyer` ; il se reprend par la contestation et le panel (`pnpm contester`,
     `pnpm panel`), seul chemin de modification d'un item publié. *Codé (#50) : la commande le
     nomme et sort en erreur.*
  2. §4 (n° 69) : un item d'un lot en cours attend la fin de son lot avant d'être renvoyé ; le lot
     et son kappa ne changent pas. *Codé (#50).*
  3. Outillage : quand des items restent bloqués, la commande écrit ceux qu'elle peut renvoyer puis
     sort en code 1 ; une relance ne refait rien. *Codé (#50).*

  Décision du 2026-09-29 (conformité 2026-09-29, n° 1), selon la recommandation :
  4. §4 (droit de réponse) : un maintien ou une correction décidé après une non-évaluabilité
     prononcée par le panel rend à l'item le statut qu'il avait avant, comme après un retrait.
     Texte proposé : « un maintien ou une correction décidé sur un item que le panel avait retiré ou
     déclaré non évaluable lui rend le statut qu'il avait avant cette décision ». *Codé (PR du
     n° 1).*

  Décisions du 2026-09-29 (conformité 2026-09-29, n° 2 et 3), selon la recommandation :
  5. §4 (n° 2) : texte à écrire à la suite de « Correction de thème » : « Un item déjà publié ne
     retourne pas en attente : un item publié ne change que par la contestation et le panel.
     L'auteur le conteste dès que la correction est acceptée ; contesté, il n'engendre aucune
     question jusqu'à la décision du panel, qui le juge sur la nouvelle version de la mesure. »
     Garde-fou retenu en plus : le tirage refuse un item vérifié dont `mesure_version` n'est pas la
     version courante de sa mesure, et le compte dans les exclusions. *Codé (#54, arrivé sur `main`
     par #55).*
  6. §5 (n° 3) : texte à insérer après la phrase sur la position conditionnelle ou sans objet :
     « Pour la même raison, une question d'attribution n'est pas tirée lorsque l'item d'un candidat
     interrogé au run sur la mesure est contesté à la date du gel : sa position fait l'objet d'une
     contestation, et la liste attendue n'est pas établie. La question est exclue et comptée à part
     dans le rapport du run, comme une question dont la réponse attendue n'est pas définie. Un item
     en attente de validation, retiré ou déclaré non évaluable n'appartient pas à la vérité de
     référence : il n'entre pas dans la liste et ne la rend pas indéfinie. » (Branche « arbitré sans
     réintégration » écartée le même jour : un retrait bloquerait la question pour toujours.)
     *Codé (#54, arrivé sur `main` par #55).*

  Décisions du 2026-09-29, suite du lot #54, selon la recommandation :
  7. §5 : une mesure dont le seul porteur a son item contesté n'a pas de question d'attribution au
     gel : elle n'est ni tirée ni comptée (application de « contesté, il n'engendre aucune
     question »). Phrase à écrire en 0.14. *Codé (#54).*
  8. §5 : le rapport du run publie, par candidat interrogé, les items P vérifiés mais contestés au
     gel, donc absents du tirage (compte par item, pas par question). Texte proposé : « Le rapport
     du run publie, pour chaque candidat interrogé, les items P vérifiés que leur contestation tient
     hors du tirage à la date du gel. » Précision du même jour : y figure tout item P vérifié,
     contesté et en vigueur au gel, quelle que soit la version de sa mesure. *Codé (#54).*

  Décisions du 2026-10-01 (conformité 2026-09-29, n° 8 et 9) :
  9. §5 (n° 8) : la répartition par thème lit le retard sur les questions **propres** de chaque
     candidat, quel que soit l'écart des totaux, puis juge strate par strate le thème en retard ;
     une compensation inscrite répond à un déficit réel de sa strate. Lecture retenue contre la
     lecture stricte, qui faisait rougir un échange de gabarit sur un même item. Texte proposé, à la
     suite de « sans compter dans leur thème d'origine les questions reçues par compensation » :
     « un candidat est en retard sur un thème s'il y a reçu moins de questions propres que le mieux
     servi des candidats comparés ; ses strates de ce thème sont alors jugées une à une. Une
     compensation inscrite répond au déficit d'une strate, que ses propres questions tirables ne
     pouvaient combler. » *Codé (#57).*
  10. §5 (n° 9) : les items reçus par la barrière sont recoupés avec ceux du commit
     `versions.donnees_commit`, que le run inscrit dès le gel. *Codé (#57).* Tranché le 2026-10-01 :
     le schéma l'exige de tout run. *Codé (#59).*
  11. Tranché le 2026-10-01 : septième condition bloquante de la symétrie, « aucune strate
     candidat × thème × gabarit ne reçoit plus de questions propres que le quota du tirage ».
     Texte proposé, à la suite de la liste des garanties du §5 : « aucune strate ne reçoit plus de
     questions que le quota publié avec le tirage, les questions reçues par compensation ne
     comptant pas dans leur strate d'origine ». *Codé (#59).*

  Le constat n° 81 est déjà réglé par le §8 depuis la 0.8 (les questions d'attribution sortent
  du test et de l'exactitude par candidat) : rien à faire.
- [ ] **Signer le protocole.** L'en-tête porte encore « @Someone » (ligne 5).
- [ ] **Nommer le fournisseur SMTP de l'adresse dédiée** au §10, à la place de
      `[fournisseur à nommer par l'auteur avant le gel]` (protocole 0.10, PR #32).
- [ ] **Relecture par un avocat** (§10 : diffamation, droit d'auteur, RGPD, conditions d'utilisation
      des API).
- [ ] **Déposer la version 1.0 sur Zenodo** et publier l'empreinte et le DOI (critère de J1).
- [ ] **Transmettre le protocole à l'Arcom, à Viginum et à la CNIL** pour information (§10).

- [x] (2026-10-15, écrit en 0.16) **Écrire la 0.16 : quatre décisions du 2026-10-02 sur l'interrogation (§6)**, prises avant
      d'en écrire le code, selon la recommandation, et codées par le lot interrogation. Un agent ne
      peut pas écrire `docs/PROTOCOLE.md` : le texte est proposé ici, à appliquer tel quel ou à
      reprendre.
  1. Délais : 30 s avant la 2e tentative, 120 s avant la 3e ; une tentative est abandonnée au bout
     de 180 s. Valeurs fixes, sans aléa, les mêmes pour tous les outils.
  2. Refus de l'API : un refus de modération signalé par une erreur de l'éditeur est une réponse
     **obtenue**, non retentée, classée non-réponse ; sa réponse brute est le corps de l'erreur.
     (Avant : le schéma en faisait une tentative en échec, donc une manquante.)
  3. Ordre : une file par outil, indépendante des autres ; tous les premiers échantillons avant
     les seconds ; dans un échantillon, ordre croissant de question_id, mode, formulation_id.
  4. Hors fenêtre : fenêtre semi-ouverte de 48 h absolues ; aucune tentative ne commence à sa fin
     ou après ; une requête inachevée est manquante, motif « hors fenêtre », et compte pour le
     seuil de 20 % du §8.

  Texte proposé, à la place de la phrase « Une requête est tentée au plus trois fois […] (section
  7). » du §6 :

  > Une requête est tentée au plus trois fois au total, avec délai croissant : 30 secondes avant la
  > deuxième tentative, 120 secondes avant la troisième ; une tentative sans réponse au bout de 180
  > secondes est abandonnée et comptée comme un échec. Ces valeurs sont fixes et identiques pour
  > tous les outils. Après trois échecs, la réponse est « manquante », comptée comme telle et
  > jamais comme une erreur. Un refus de répondre ou une esquive est enregistré comme
  > « non-réponse » (section 7) ; il en va de même d'un refus opposé par l'API elle-même, quand
  > l'éditeur le signale par une erreur propre à la modération : la réponse est obtenue, n'est pas
  > retentée, et sa réponse brute est le corps de cette erreur tel que reçu.
  >
  > La fenêtre est l'intervalle semi-ouvert de 48 heures comptées en heures absolues à partir de
  > son ouverture. Aucune tentative ne commence à sa fin ou après ; une requête dont les
  > tentatives n'ont pas pu commencer ou s'achever dans la fenêtre est manquante, avec le motif
  > « hors fenêtre », et compte pour le seuil de réponses manquantes de la section 8 comme toute
  > autre. Chaque outil reçoit ses requêtes dans sa propre file, indépendante de celles des autres
  > outils : tous les premiers échantillons partent avant les seconds, et, au sein d'un même
  > échantillon, les requêtes partent dans l'ordre croissant de l'identifiant de question, puis du
  > mode, puis de l'identifiant de formulation. L'identifiant de question étant une empreinte, cet
  > ordre mêle les candidats et les thèmes sans tirage ; un incident survenu en cours de fenêtre
  > ne frappe ainsi ni un candidat ni un échantillon en particulier.

  Ligne de révision proposée : « 0.16, 2026-10-02 : quatre décisions de l'auteur sur
  l'interrogation des outils, prises avant d'en écrire le code. Section 6 : les délais entre
  tentatives et le délai d'abandon d'une tentative sont fixés ; l'ordre d'envoi des requêtes est
  écrit ; aucune tentative ne part hors de la fenêtre, et une requête qui n'a pas pu aboutir dans
  la fenêtre est manquante ; un refus opposé par l'API elle-même est une réponse obtenue, classée
  non-réponse. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D13 et D14 (§7, notation)**, tranchées le 2026-10-03 et le
      2026-10-05 avant le code du lot notation, selon la recommandation. Texte proposé :

  À la fin du paragraphe « Test contrefactuel de biais du juge », à la place de « Les notations
  déjà rendues par le juge retiré […] revue par un humain. » :

  > Le test contrefactuel est exécuté avant la notation des autres réponses du run, de sorte qu'un
  > retrait est connu avant le tirage de l'échantillon humain ; l'échantillon de 25 % prolonge
  > l'ordre de tirage de celui de 10 % et le contient. Les permutations sont un dérangement des
  > candidats du run, tiré avec sa graine dérivée, appliqué par remplacement exact du libellé et
  > du nom seul déclarés au périmètre ; les 200 réponses sont tirées parmi celles dont la réponse
  > ou l'item nomme au moins un candidat. Une note change lorsqu'elle diffère sur l'un des
  > éléments que lisent les métriques primaires : catégorie, drapeaux, fraîcheur de
  > l'obsolescence, sourçage valide. Les notations déjà rendues par le juge retiré sont écartées de
  > tout le run, y compris de l'accord juges-humains et du kappa des juges publiés avec lui, qui ne
  > portent plus que sur le juge restant ; hors de l'échantillon humain, la note retenue est celle
  > du juge restant, et toute réponse qu'il marque « fabrication » ou « mauvaise attribution »
  > reste revue par un humain.

  Dans le paragraphe « Conflit d'intérêts », remplacer « en renotant un sous-ensemble après
  permutation des noms d'outils dans les métadonnées » par « en renotant un sous-ensemble après
  permutation des noms d'outils dans le texte des réponses, seule trace de leur identité que voit
  le juge ».

  Ligne de révision, à fusionner avec celle ci-dessus : « Section 7 : le test contrefactuel précède
  la notation du run, et l'échantillon de 25 % contient celui de 10 % ; la permutation, le
  sous-ensemble et ce qu'est un changement de note sont écrits ; les notations d'un juge retiré
  sortent aussi des chiffres d'accord ; le contrefactuel outil permute les noms dans le texte des
  réponses. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D15 (§7)**, tranchée le 2026-10-05 et codée par la PR #79. Texte
      proposé :

  Dans « Juges automatiques », après « (texte, liens, citations) » : « , chaque citation réduite à
  son lien et à son texte, sous une forme commune à tous les éditeurs ».

  Dans « Règle de décision », à la fin du premier point (« Accord des deux juges : note retenue. ») :
  « Si les deux notations s'accordent sur ce que lisent les métriques primaires mais diffèrent sur
  un autre champ que porte la note retenue (motif d'inexactitude, citation d'une source, existence
  d'un lien), la réponse est notée par un humain. »

  Dans le point sur l'échantillon, après « de chaque run » : « , parmi les réponses obtenues, sa
  taille arrondie à l'entier supérieur ».

  Dans le point sur l'extrait justificatif, ajouter : « la notation humaine porte alors ce motif ».

  Ligne de révision, à fusionner : « Section 7 : les citations transmises au juge sont projetées ;
  un accord partiel des juges est tranché par un humain ; l'échantillon humain est tiré parmi les
  réponses obtenues, arrondi au supérieur. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D16 (§7, test contrefactuel)**, tranchée le 2026-10-06 avant la
      PR B du lot notation. Texte proposé, dans « Test contrefactuel de biais du juge », après
      « dans la réponse et dans l'item de référence » : « , ainsi que dans la question transmise au
      juge » ; puis, après « Une note qui change avec le nom seul révèle un biais du juge. » :

  > Une paire dont l'une des deux notations porte un extrait justificatif invalide compte comme un
  > changement ; le taux n'est calculé qu'une fois les deux notations de chaque paire rendues. Si
  > les deux juges dépassent 3 %, la notation du run s'arrête et le run est marqué invalide, avec
  > cette raison (section 12).

  Le contrefactuel outil (paragraphe « Conflit d'intérêts ») reste à préciser par une décision
  propre : taille du sous-ensemble, réponses éligibles, noms d'outils déclarés.

  Ligne de révision, à fusionner : « Section 7 : le contrefactuel permute aussi la question ; un
  extrait invalide compte comme un changement ; le retrait des deux juges invalide le run. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D17 (§7, accord des notations)**, tranchée le 2026-10-06. Dans
      le point de la « Règle de décision » sur l'échantillon aléatoire, remplacer « identiques sur
      tout ce que lisent les métriques primaires : catégorie, drapeaux, fraîcheur de l'obsolescence
      et, pour le sourçage, le seul sourçage valide (un même lien cité, existant et soutenant). »
      par « identiques sur la catégorie, sur tous les drapeaux, sur la fraîcheur de l'obsolescence
      et, pour le sourçage, sur le seul sourçage valide (un même lien cité, existant et
      soutenant) ; c'est un peu plus que ce que lisent les métriques primaires, les drapeaux de
      mauvaise attribution et de déformation n'étant lus que par la répartition des drapeaux. »
      Au §11, après la définition de l'obsolescence fraîche : « La fraîcheur n'est portée que par
      une note qui pose le drapeau obsolescence. »

  Ligne de révision, à fusionner : « Section 7 : l'accord de deux notations porte sur tous les
  drapeaux. Section 11 : la fraîcheur n'existe qu'avec le drapeau obsolescence. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D18 (§7, notation humaine)**, tranchée le 2026-10-06. Texte
      proposé, dans « Annotateurs humains », après « (sans voir l'outil, ni l'autre annotateur) » :
      « ni la note des juges : un humain reçoit exactement ce que reçoit un juge » ; dans le point
      sur l'échantillon, après « arbitrée par un troisième humain » : « qui la note à son tour à
      l'aveugle » ; dans « Calibration et fiabilité publiée », après « 300 réponses issues d'un run
      pilote » : « , tirées parmi ses réponses obtenues avec une graine dérivée de la graine publiée
      et de la clé « jeu_or », indépendamment de l'échantillon humain, ».

  Ligne de révision, à fusionner : « Section 7 : l'humain ne voit pas la note des juges ; le
  troisième humain de l'échantillon note à l'aveugle ; le jeu d'or a son propre tirage. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D19 (§7, test contrefactuel et sourçage)**, tranchée le
      2026-10-06. Texte proposé, dans « Test contrefactuel de biais du juge », après la phrase sur
      le sous-ensemble : « Une réponse refusée par l'outil n'y entre pas : elle n'a pas de texte à
      permuter. » ; dans « Sourçage », après « Un lien mort ne soutient jamais rien » : « : quand
      le test HTTP dit un lien mort, un soutien déclaré par le juge est noté non applicable ».
      (Corrigé à la clôture du 2026-10-06 : la question tranchée ne portait que sur « soutient » ;
      `ne_soutient_pas` et `indetermine` restent tels quels, ce que fait le code, #91.)

  Ligne de révision, à fusionner : « Section 7 : un refus n'entre pas au test contrefactuel ; un
  lien mort déclaré soutenant par le juge est noté non applicable. »

- [ ] **Traçabilité de l'avis du juge (D19, `docs/DETTE.md` 2026-10-06 soir, point 2).** Le forçage
      efface ce que le juge avait dit, et la sortie brute des juges n'est stockée nulle part.
      Options : champ facultatif `verdict_soutien_juge` sur le lien, présent seulement en cas de
      forçage (amendement du schéma, recommandé) ; ou sortie brute des juges dans l'archive du run.

- [ ] **Lien inaccessible noté soutenant sans copie archivée** : le schéma le refuse (conformité
      n° 29), un juge peut le produire, et l'écriture échoue alors visiblement. À trancher avec le
      cadrage du lot `test-liens` (forcer, refuser, ou exiger la copie du test HTTP).

- [ ] **Trois questions de la notation humaine (#87, #88)** :
      (1) dans l'échantillon, deux humains d'accord au sens de `notationsConcordent` sans note
      commune restent en attente : le §7 n'admet pas d'arbitre ici ; faut-il un troisième humain ?
      (2) `reponse.normalisation.fonction` est montrée au juge et à l'humain : imposer aux
      adaptateurs un nom neutre, qui ne trahisse pas l'outil ? Tranché en D55 (1) le 2026-10-17 :
      `normalisation` sort de la charge du juge, codé dans #PR. (3) double soumission : garder deux
      messages (« tâche indisponible », « fichier déjà écrit ») ou un seul ?

- [ ] **Cadrer l'écrivain du gel** (lot notation, #89) : aucun code n'écrit `run.json` ni
      `questions.json` pour un vrai run, et personne n'inscrit un run invalide (D16 (3)), dont le
      schéma exige `publication` et `depot`. Dire quel outil gèle un run et quand il est invalidé.

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D20 (§7, test des liens)**, tranchée le 2026-10-08. Texte proposé,
      dans « Sourçage », après « le lien cité existe (test HTTP déterministe) » : « Le test passe une
      fois par run, après la fermeture de la fenêtre d'interrogation et avant la notation, sur chaque
      URL citée prise telle qu'écrite, en requête GET, selon la norme de collecte de la section 6
      (robots.txt, une requête par seconde et par hôte, cinq redirections au plus). Un lien
      qu'interdit robots.txt est non testable. Une erreur passagère (délai dépassé, connexion
      refusée, code 429 ou 5xx) est retentée deux fois au plus, à soixante secondes d'intervalle ;
      un code 404 ou 410 est définitif. La table qui fait passer du résultat au verdict (existe, mort,
      inaccessible, non testable) est publiée et versionnée ; un domaine inexistant est un lien
      mort, une page servie avec succès existe quel que soit son contenu. La page d'un lien existant
      est conservée avec son empreinte et sauvegardée sur la Wayback Machine ; pour un lien
      inaccessible ou non testable, l'instantané existant le plus proche de la réponse est
      recherché, jamais créé. »

  Ligne de révision, à fusionner : « Section 7 : règles du test HTTP des liens (moment, méthode,
  tentatives, table des verdicts publiée, copie conservée). »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D21 (§7, test des liens, suite)**, tranchée le 2026-10-08. Texte
      proposé, à la suite du texte de D20 : « Une erreur qui n'est ni un code HTTP classé ni un
      refus de robots.txt rend le lien inaccessible ; une erreur réseau et un robots.txt injoignable
      sont retentés comme les autres erreurs passagères. Une URL écrite avec des caractères non
      ASCII est envoyée sous sa forme encodée standard, et reste identifiée par la chaîne citée.
      L'instantané archivé retenu pour un lien inaccessible ou non testable est une capture réussie
      de la page ; il est téléchargé et conservé avec son empreinte, et le lien d'archive publié est
      celui de la capture effectivement téléchargée (D22). Sans cette copie, le soutien
      d'un tel lien est noté non applicable, quelle que soit la note du juge. » Écrire aussi, à
      l'endroit qui nomme les fichiers de configuration, que la table des verdicts vit dans
      `config/test-liens.toml` (TOML : aucune dépendance Python ajoutée).

  Ligne de révision, à fusionner : « Section 7 : cas non classés du test des liens, URL non ASCII,
  copie archivée téléchargée, soutien sans copie non applicable. »

- [x] (2026-10-09, PR #95 fusionnée) **Relire `config/test-liens.toml`** (PR #95) avant sa fusion :
      c'est la table de mesure de D20 et D21.

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D24 (§7 et §12, go/no-go)**, tranchée le 2026-10-09. Texte proposé,
      au §12, après « le kappa juges-humains de l'échantillon de 10 % est ≥ 0,75 » : « pour chaque
      juge retenu, sur la catégorie primaire, entre sa note et la note humaine retenue de la réponse
      (section 7) ; un kappa indéfini ne satisfait pas ce critère ». Et, à la fin du paragraphe :
      « Un run dont tous les critères sont satisfaits est publié sans la mention. La checklist de
      l'annexe F est enregistrée avec le run et contresignée par l'auteur, nom et date. »

  D25 (2026-10-09), à la suite : « Une réponse dont la note humaine retenue est indéterminée n'entre
  pas dans ce kappa ; leur nombre est publié. Un test contrefactuel indéfini ne satisfait pas son
  critère. »

  Ligne de révision, à fusionner : « Section 12 : kappa de l'échantillon par juge retenu, kappa
  indéfini non satisfaisant, décision de publication déduite des critères, contreseing enregistré. »

- [x] (2026-10-08, D20) **Cadrer le lot « test des liens »** (feuille de route, `test-liens`) : le §7 exige un test
      HTTP déterministe de l'existence des liens cités, et aucun code ne le fait. C'est un appel
      réseau nouveau, à autoriser, avec ses règles (redirections, délais, « inaccessible »).

- [ ] **Pour le premier `run:live` (lot interrogation)** : fournir, pour chaque outil, un corps
      d'erreur de modération authentique (documentation de l'éditeur ou appel d'essai archivé), qui
      servira de test à son adaptateur (`docs/DETTE.md`, 2026-10-02, lot interrogation, point 1).
      `pnpm run:live` n'est jamais lancé par un agent.

### Adresse et courriels

- [ ] **Ouvrir l'adresse de contestation dédiée** chez le fournisseur nommé au §10 (D4).
- [ ] **Réécrire le gabarit de notification** `validation/notifications/gabarits/courriel.txt`,
      marqué « Gabarit provisoire ». Tant que ce marquage reste, `pnpm notifier --envoyer` refuse
      d'envoyer (PR #35).
- [ ] **Choisir la machine qui envoie les courriels.** Le journal des envois n'évite un double envoi
      que sur la machine qui l'a écrit : soit une seule machine envoie, soit on fait refuser l'envoi
      tant que la branche est en retard (`docs/DETTE.md`, 2026-09-25, point 3).

### Périmètre (`config/perimetre.yaml`)

Critère de J1 : la liste nominative des outils et des candidats est publiée. D5 : l'auteur applique
les règles du §3 à la date du jour, archive les preuves, et révise la liste au gel.

- [ ] **Candidats** : pour chacun, `candidat_id`, `libelle`, `nom`, la déclaration de candidature
      archivée, au moins deux sondages archivés datés des 60 jours avant le gel, `statut_au_gel` et
      `interroge`, au gabarit commenté dans le fichier.
- [ ] **Contact de notification de chaque candidat** : clé `contact_notification`, avec l'adresse
      générique publiée par la campagne et sa preuve archivée, ou `null` explicite si la campagne
      n'en publie aucune (protocole 0.10, `outils/contacts.ts`).
- [ ] **Outils** : assistants (classement de store archivé, Le Chat d'office) et comparateurs, au
      gabarit commenté, avec le SDK et sa version épinglée (D3).
- [ ] **Relire les conditions d'utilisation de l'API de chaque outil** : une clause qui interdirait de
      publier des résultats comparatifs est soumise à l'avocat avant d'inclure l'outil (§10).
- [ ] **Quotas du tirage** : `tirage.questions_par_strate` et
      `tirage.questions_attribution_par_theme` (noms du modèle 0.2.0, #73), lus par le chargeur
      (#72).
- [ ] **Corriger deux commentaires du fichier** (le troisième, `modes`, est réglé par #73).
      - Ligne 83 : « faux pour un candidat retiré, dont les items O restent mesurés » contredit la
        0.9, où un candidat retiré sort des runs (n° 32).
      - Ligne 136, comparateurs : « jamais d'API » contredit le §6, qui prévoit l'export ouvert ou
        l'API d'un comparateur quand il en offre une (n° 52 et 62).
- [x] `tirage.part_reprise` et `tirage.part_absence_et_fictifs_min` retirés (#73).

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D26 (§3 et §7)**, tranchée le 2026-10-09. Texte proposé au §3,
      après la règle des candidats : « La liste publiée avec la version 1.0 applique ces règles au
      15 octobre 2026 ; elles sont réappliquées telles quelles au gel de chaque run, et tout écart
      avec la liste publiée est rapporté. » Dans le tableau des outils, « figurant dans le top des
      applications de la catégorie » devient « figurant dans les 50 premières applications gratuites
      de la catégorie Productivité de l'App Store ou de Google Play en France, classement archivé ».
      (Point 4 révisé le 2026-10-09 : une telle réponse est « inexacte », motif `ajout_fabrique`,
      déjà prévu par le schéma ; rien à écrire au §7 pour ce point.) Juges : Claude Sonnet 5.5 et
      Mistral Large, versions épinglées au gel (l'exemple du §7 reste exact).

  Ligne de révision, à fusionner : « Section 3 : date d'application de la liste publiée, classement
  des stores précisé. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D27 (§7 et annexe D, charge du juge)**, tranchée le 2026-10-09. Au §7,
      la liste de ce que reçoit chaque juge s'allonge : « … la date du run, la réponse attendue, la
      prémisse de la formulation lorsqu'elle est fausse, le texte de chaque page citée tel que conservé
      ou archivé, et la grille ». Et : « La fraîcheur d'une obsolescence se calcule depuis les dates ;
      sur une question d'attribution, le juge relève les noms cités, que le code rattache aux
      candidats. » L'annexe D s'aligne sur `charge-juge-v3` (noms des variables, plusieurs références,
      forme du sourçage et de l'extrait).

  D29 (2026-10-09), à la suite : « Sur une question d'attribution, la catégorie, le motif et les
  drapeaux se calculent en comparant les candidats cités, que relève le juge, à la liste attendue. Le
  taux de changement du test contrefactuel ne compte pas le soutien des pages citées, qui ne sont
  pas permutées. » (D30 (1) : un changement reste « tout ce que lisent les métriques primaires »,
  sourçage excepté ; le motif n'en fait pas partie.) D30 (2) : « Quand la règle ne détermine pas
  la note d'une question d'attribution, la réponse est notée par un humain ; leur nombre est
  publié. »

  Ligne de révision, à fusionner : « Section 7 et annexe D : contenu de la charge du juge, note
  d'une question d'attribution calculée, sourçage hors du test contrefactuel. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D28 (§3, §8)**, tranchée le 2026-10-09. Au §3, après la phrase sur
      les primaires : « Un candidat éliminé à un tour de primaire est retiré dès la proclamation du
      résultat. Une candidature est déclarée par une déclaration explicite de l'intéressé ou une
      investiture de son parti ; une intention ou une réflexion annoncée ne suffit pas. » Au §8,
      après « Les deux modes sont toujours publiés côte à côte » : « sauf pour un outil dont l'API
      n'offre pas la recherche web : il est mesuré dans le seul mode sans recherche, l'autre est
      publié sans objet, et aucune comparaison des modes n'est faite pour lui. »

  Ligne de révision, à fusionner : « Section 3 : élimination à une primaire, déclaration de
  candidature explicite. Section 8 : outil sans recherche web par API. »

  D37 (2026-10-15), à la suite du texte du §8 de D28 : « Il en va de même, à l'inverse, d'un outil
  dont l'API n'offre que la recherche web : il est mesuré dans le seul mode avec recherche. » Ligne
  de révision : « Section 8 : outil à un seul mode par API, dans un sens comme dans l'autre. »

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D40 (§5, graines)**, tranchée le 2026-10-15. Texte proposé, au
      paragraphe « Tirage », après « ce qui rend le tirage reproductible. » : « Les graines d'un run
      ne sont choisies par personne : elles sont dérivées de la valeur d'une balise publique d'aléa
      (drand), au premier tour émis à l'instant de gel ou après. La réponse signée de la balise est
      archivée avec le run ; chacune des graines publiées (tirage, échantillon humain, test
      contrefactuel, bootstrap, permutation) en est dérivée par une clé lisible, publiée avec elle.
      Nul, l'auteur compris, ne peut connaître une graine avant le gel, et chacun peut la
      recalculer. » Ligne de révision : « Section 5 : les graines sont dérivées d'une balise publique
      d'aléa, au premier tour qui suit le gel. » (Déjà inséré dans le projet de 0.16.)

- [x] (2026-10-15) relu et recopié, avec six derniers choix de rédaction (fin de `NOTES.md`) : **Relire le projet de 0.16 assemblé** dans `scratch/protocole-0.16/` (2026-10-15) : copie du
      protocole avec les textes de cette section appliqués, diff, et `NOTES.md` (placements
      validés le 2026-10-15, textes rédigés par l'agent à relire, corrections minimales de trois
      phrases de la 0.15). Puis recopier dans `docs/PROTOCOLE.md`.

- [ ] **Ajouter à la relecture de l'avocat (J1) : conditions de l'API Gemini en mode web** (D28, 4).
      Elles interdisent d'« analyser » les résultats ancrés, limitent leur conservation à deux ans
      et en réservent l'affichage à l'utilisateur (citations exactes : `scratch/perimetre/dossier-2026-10-15.md`,
      §2.3). Question : le projet peut-il mesurer et publier ces réponses (règle 7, §8, §10) ? En
      attendant, le mode web de Gemini est suspendu ; avis défavorable ⇒ publié « non mesurable ».

- [ ] **Refaire les relevés du périmètre le 15 octobre** (D26, 1) : sondages publiés du 10 au 15
      (Commission des sondages), résultat du premier tour de la primaire PS–Place publique–GRS
      (D28, 1), primaire de la gauche unitaire du 11, déclaration éventuelle de Le Maire,
      classements Productivité des stores (Perplexity, DeepSeek, Grok Bot proches du rang 50) ;
      preuve d'adhésion de YouGov et Cluster17. Puis archiver (`pnpm preuve --fichier
      scratch/perimetre/urls-a-archiver.txt`) et remplir `config/perimetre.yaml`.
      *Fait le 2026-10-15 matin* (`scratch/perimetre/dossier-2026-10-15-final.md`, 171 URL dans
      `urls-a-archiver-2026-10-15.txt`) : 13 candidats inclus, outils inchangés. D36 : la date du
      15 est repoussable ; le relevé des faits datés du 15 au plus tard reste à compléter
      (notices publiées avec retard), puis archiver ce fichier-là. Perdants de la primaire exclus,
      Gemini Notebook, Grok Bot et Meta AI exclus avec motif ; D37 : mode de Perplexity à figer sur
      sa documentation primaire.

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D32 (§7)**, tranchée le 2026-10-10. Après la règle de décision :
      « Un refus de l'API est noté non-réponse sans être soumis aux juges. » D33 : à l'annexe C,
      « extrait justificatif obligatoire pour toute note autre qu'exacte, sauf sur un refus de
      l'API, qui n'a rien à citer » ; au §7, « un refus tiré dans l'échantillon reste doublement
      noté par des humains et n'entre pas dans l'accord juges-humains ; leur nombre est publié ».

- [x] (2026-10-15) recopié dans `prompts/judge-1.0.0.md` : **Inscrire le prompt juge** : `scratch/prompts/judge-1.0.0.md` (charge-juge-v3). Les sept
      choix de rédaction sont validés (D34, 2026-10-12) ; reste à recopier le prompt dans
      `prompts/judge-1.0.0.md`. Recopier ce fichier-là, daté du 2026-10-12 : la proposition
      du 2026-10-09, à points ouverts, est rangée dans `scratch/prompts/archives/` et ne sert plus.

- [x] (2026-10-15, écrit en 0.16) **Écrire aussi en 0.16 : D34 (§7)**, tranchée le 2026-10-12. Au verdict de soutien : « Un lien
      dont le texte transmis est tronqué et ne contient pas l'affirmation, ou dont le texte n'a pu
      être extrait, est jugé indéterminé ; ne soutient pas exige la page entière. » Au motif
      d'inexactitude : « Le juge retient le premier motif applicable dans l'ordre : candidat confondu,
      position inventée, position opposée, quantification fausse, périmètre faux, omission, ajout
      fabriqué, autre. »

- [x] (2026-10-16, écrit en 0.18 : le numéro 0.17 a été pris par #148) **Écrire la 0.17 : D42 à D51**, texte relu par l'auteur le 2026-10-16 (il remplace les quatre
      propositions séparées de D42, D44, D45 et D46 ; D51 ajoutée le même jour). En tête : « version 0.17 ».

      **§5, « Formulations ».** Remplacer « Les formulations sont produites par un modèle puis
      relues par un annotateur qui vérifie qu'elles ne changent pas le sens. » par : « La
      formulation neutre est écrite par le gabarit ; la familière et l'orientée sont produites par un
      modèle ; les trois sont relues ensemble par un annotateur qui vérifie qu'elles ne changent pas
      le sens. » Remplacer les deux phrases « Sur un item O, la vérité de la prémisse dépend de la
      date : le relecteur note […] que le relecteur note. » par : « La position qu'affirme une
      formulation orientée est fixée par une règle par type d'item, jamais choisie par le
      relecteur : « pour » sur un item F, la position de l'item sur un item P, la position de l'état
      antérieur sur un item O, y compris pour une question sur le changement de position ; sur un
      item A et sur une question d'attribution, elle n'affirme aucune position. Cette position est
      recalculée sur l'item en vigueur au gel : une formulation relue sur une autre position est
      rappelée en relecture, et sa question n'est pas gelée. Sur un item O, la vérité de la prémisse
      dépend de la date : à l'instant de gel, la prémisse est fausse si la position qu'elle affirme
      diffère de la position en vigueur. »

      **§5, nouveau paragraphe « Gel », avant « Tirage ».** Il remplace, dans « Tirage », le passage
      de « Les graines d'un run ne sont choisies par personne » à « chacun peut la recalculer. » :
      « **Gel.** Chaque run déclare un instant de gel, qui précède l'ouverture de sa fenêtre
      d'interrogation (section 6). Le gel engendre le jeu complet des questions, fait le tirage et
      dérive les graines. Il est exécuté à l'instant de gel ou après, et strictement avant
      l'ouverture de la fenêtre ; une fenêtre qui ne s'ouvre pas strictement après l'instant de gel
      est refusée. Un gel exécuté plus tôt est refusé. Un gel exécuté plus tard est
      refusé aussi : des réponses obtenues avant lui ne seraient couvertes par aucun tirage publié.
      Avant l'instant de gel, l'auteur publie le commit à geler et fait archiver sa page publique
      par la Wayback Machine. Le gel exige que le dépôt soit exactement à ce commit et vérifie auprès
      de la Wayback Machine que la capture précède l'instant de gel. La réponse de la Wayback
      Machine est archivée avec le run, telle que reçue, avec son empreinte. Les données sont ainsi
      figées publiquement avant que l'aléa existe : nul ne peut lire l'aléa, rejouer le tirage, puis
      modifier les données. Ces exigences valent pour tout run, run pilote compris.

      Les graines d'un run ne sont choisies par personne. Elles sont dérivées de la balise publique
      d'aléa drand, sur sa chaîne quicknet, dont l'empreinte est publiée avec le code, au premier
      tour émis à l'instant de gel ou après. La réponse de ce tour est lue sur deux relais
      indépendants, qui doivent rendre la même réponse ; elle est archivée avec le run telle que
      reçue. L'aléa est l'empreinte SHA-256 de sa signature. Pour n'ajouter aucune dépendance, le
      projet ne vérifie pas lui-même la signature cryptographique ; la procédure est documentée
      pour qu'un tiers la fasse. Chaque graine publiée (tirage, échantillon humain, test
      contrefactuel, bootstrap, permutation) est dérivée de l'aléa par une clé lisible, publiée avec
      elle. On prend l'empreinte SHA-256 de l'aléa écrit en hexadécimal, suivi d'un octet nul puis
      de la clé. On lit ses 8 premiers octets comme un entier gros-boutiste, que l'on décale de 11
      bits vers la droite : c'est la graine, un entier de 53 bits. L'identifiant du run est dérivé
      de même, par la clé « run_id ». Nul, l'auteur compris, ne peut connaître une graine avant le
      gel, et chacun peut la recalculer. »

      **§5, « Tirage », après « …compte comme neuve. »** : « Le run précédent est le plus récent des
      runs publiés, à titre définitif ou provisoire, dont l'instant de gel précède strictement celui
      du run, le run pilote excepté : un run planifié, en cours ou invalidé n'en est pas un. Le run
      inscrit son précédent, ou déclare qu'il n'en a pas : le premier run public n'en a pas, et
      toutes ses questions sont neuves. Chaque run publie l'empreinte SHA-256 de son tirage et celle
      de son jeu de questions. Au gel, ces empreintes sont recalculées sur les fichiers du run
      précédent, et un précédent dont une empreinte diffère est refusé. »

      **§6, après « …à partir de son ouverture. »** : « Elle s'ouvre après l'exécution du gel du run
      (section 5) : aucune requête ne part avant que le tirage existe. »

      **§6, D51.** Remplacer « Si un incident technique invalide un run, le run entier est réexécuté
      et les deux runs sont publiés, le premier marqué invalide avec la raison. » par : « Un run est
      planifié à son gel et passe en cours avant la première tentative de sa fenêtre. Si un incident
      technique invalide un run, l'invalidation est enregistrée dès qu'elle est connue, avec sa
      raison et sa date, et le statut du run reste inchangé jusqu'à son dépôt (section 12). Seul un
      run planifié ou en cours s'invalide ; un run publié, à titre définitif ou provisoire, ne
      s'invalide plus. Un run qui porte une invalidation n'est plus interrogé ni noté, et ne passe
      pas les critères de publication. Le run entier est réexécuté par un nouveau run, qui désigne
      dès son gel le run invalidé qu'il remplace ; la réexécution ne modifie jamais le run invalidé.
      Les deux runs sont publiés, le premier marqué invalide avec la raison. »

      **§7, « Juges automatiques », après « …sur la position. »** : « Chaque réponse porte un alias
      aveugle de son outil, saisi par l'auteur à chaque gel et publié avec le run : c'est sous ce
      seul nom que l'outil est désigné là où la notation doit rester aveugle. Un alias est formé
      d'une à trois lettres capitales suivies de deux à quatre chiffres. Un alias partagé par deux
      outils est refusé. Les alias sont comparés après une normalisation fixe : décomposition
      Unicode, diacritiques retirés, minuscules, espaces repliés. Un alias est aussi refusé s'il
      contient un mot de trois lettres au moins du nom, de l'éditeur ou de l'identifiant d'un outil
      du périmètre, ou l'un de ces trois écrit sans espaces quand il compte trois lettres au
      moins. »

      **§7, D51.** Remplacer « la notation du run s'arrête et le run est marqué invalide, avec cette
      raison (section 12) » par : « la notation du run s'arrête et l'invalidation du run est
      enregistrée, avec cette raison (sections 6 et 12) ».

      **§12, D51.** Dans « Critères go/no-go avant chaque publication », après « mais déclare sa
      publication et son dépôt comme tout run publié », ajouter : « ; il prend le statut invalide
      avec ce dépôt, son invalidation ayant été enregistrée dès qu'elle a été connue (section 6) ».

      **Ligne de révision** : « 0.17, 2026-10-16 : décisions de l'auteur des 15 et 16 octobre sur la
      reformulation et le gel. Section 5 : la formulation neutre est écrite par le gabarit, la
      position qu'affirme une formulation orientée suit une règle fixe par type d'item et se
      recalcule au gel ; le gel a lieu entre l'instant de gel et l'ouverture de la fenêtre, sur un
      commit archivé avant l'instant de gel ; la balise, ses relais, la règle de dérivation des
      graines et de l'identifiant du run sont écrits ; le run précédent est le dernier run publié, et
      il est engagé par les empreintes de son tirage et de ses questions. Section 6 : la fenêtre
      s'ouvre après le gel ; un run passe en cours avant sa première tentative ; son invalidation
      est enregistrée dès qu'elle est connue, sur un run planifié ou en cours seulement ; sa
      réexécution désigne dès le gel le run qu'elle remplace. Section 7 : format et règles de refus
      des alias aveugles ; le retrait des deux juges enregistre l'invalidation du run. Section 12 :
      un run invalide prend ce statut avec son dépôt. »

      Le code applique déjà D42 à D50 (D48 à D50 par la PR 2c du lot gel, #134) et D51 sauf
      l'écriture de `en_cours` (PR 3, #135 ; `en_cours` arrive avec la PR 4). Le prompt de
      reformulation 1.0.1 aligné sur D42 suit la 0.17 (lot reformulation).
- [x] (2026-10-16, protocole 0.17, #148) **Écrire D52 (2) à (4) au §4 à la prochaine révision** (0.18). Proposition, après la phrase
      « l'extraction est faite deux fois par des modèles de familles différentes et tout désaccord
      d'existence ou de contenu est signalé » : « Les deux extractions portent sur le même texte
      canonique, celui que produit la version de l'extracteur de texte épinglée par le code ; un item
      déjà validé reste attaché au texte et aux offsets sur lesquels il l'a été. Deux items sont
      appariés quand leurs citations, après le test verbatim, se recouvrent et qu'ils portent le même
      thème ; à plusieurs candidats, le plus grand recouvrement l'emporte, puis le plus petit offset.
      Un item sans partenaire est proposé à la validation avec un désaccord d'existence ; deux items
      appariés dont le type, la position ou la quantification diffèrent le sont avec un désaccord de
      contenu. Une paire donne un seul item, dont les champs viennent du modèle nommé en premier ; le
      libellé et la paraphrase ne sont pas comparés. » Nommer au §4 les deux modèles (D52 (1)) :
      Claude Sonnet 5.5 et Mistral Large, version exacte au premier appel réel.
      Ajouter ensuite (D53 (2) à (4)) : « Si l'une des deux sorties est illisible, la source n'est pas
      proposée et l'extraction est relancée. Une citation qui figure plusieurs fois dans le texte
      canonique est rejetée. L'extrait d'une source T2 va du début du segment de transcription qui
      contient le premier caractère de la citation, à la seconde inférieure, à la fin de celui qui
      contient le dernier, à la seconde supérieure. » Et (D53 (1)) : « Un item extrait n'est promu
      qu'une fois rattaché par la validation à une mesure, existante ou nouvelle, dont la
      formulation canonique a été relue. »
- [x] (2026-10-19, protocole 0.19, #163) (D54, 2026-10-17) **Écrire D54 (2) au §4 et D54 (4) au §5
      à la prochaine révision.** Proposition au §4, après « Si l'une des deux sorties est illisible, la source n'est pas
      proposée et l'extraction est relancée » : « Une réponse au statut 408, 429 ou 5xx n'est pas une
      sortie illisible mais un échec de transport : elle est gardée, et la source est reprise. »
      Proposition au §5, dans la règle de la position qu'affirme une formulation orientée : « Un
      état sans objet n'en affirme aucune, comme une question d'attribution. » La phrase d'ancrage
      du §4 n'y figurant pas telle quelle, D54 (2) est écrit juste après la phrase actuelle sur la
      sortie illisible.
- [x] (2026-10-19, protocole 0.19, #163) (D55, 2026-10-17) **Écrire D55 (4), (5) et (9) à la
      prochaine révision.** §7, test
      contrefactuel : « Les permutations sont un dérangement des candidats interrogés au run » (au
      lieu de « des candidats du run »). §7, juges : « Dans ce que reçoit le juge, chaque candidat est
      désigné par un alias aveugle stable du run, jamais par son identifiant. » §6 : « Une réponse
      reçue que le banc ne peut stocker est gardée telle quelle et n'est pas renvoyée : elle n'est
      pas une tentative de l'outil, et la question attend l'opérateur. »
- [x] (2026-10-19, protocole 0.20, #166) (D55 (9), 2026-10-19, passe de conformité du 19 octobre)
      **Écrire la forme de l'alias aveugle de candidat, option 1 (alias calculé par le code,
      jamais saisi par l'auteur).** §7 : « L'alias d'un candidat est formé de la lettre « C »
      suivie d'un rang, de 1 à n, n étant le nombre de candidats interrogés au run. L'ordre des
      rangs est tiré avec une graine dérivée de l'aléa par la clé « alias_candidats », comme les
      autres graines du run, sans aucune saisie de l'auteur. La table qui associe chaque alias à
      son candidat est publiée avec le run. » Codé par la PR #168 : graine `alias_candidats`
      (sixième graine du run), table publiée dans `run.json#/alias_candidats`, `candidat_id` et
      `candidats_attendus` aliasés dans la charge du juge (charge-juge-v4).
- [ ] (D55, 2026-10-17) **Écrire, à la nouvelle version de la table des liens (D55 (2)), la règle
      de relecture UTF-8 de `Location`.** Pas dans la 0.19 : elle suit le code de D55 (2).
- [ ] **Fusionner #149 (renommage du dépôt) et #150 (relecture étendue, F ⇔ fictive)** : CI verte ;
      le contrôle de Claude Code refuse `gh pr merge`.
- [ ] **Avant chaque gel (D46)** : pousser le commit à geler, puis demander à la Wayback Machine
      une capture de sa page GitHub (`https://github.com/AzurNow/DEMOCRATIE_2027/commit/<sha>`),
      avant `date_gel`.

### Prompts (`prompts/`)

- [x] (2026-10-15) `prompts/judge-1.0.0.md` ; ajout inventé non contradictoire ⇒ inexacte, `ajout_fabrique` (D26 (4) révisée) : **Écrire les prompts des juges** `prompts/judge-*`. Ils appartiennent à l'auteur (lot notation),
      et le prompt doit dire comment classer une réponse qui donne la bonne position et y ajoute une
      position inventée non contradictoire (`schema/README.md`, points ouverts, 3).
- [x] **Relire les prompts d'extraction et de reformulation** (PR #104) : relus le 2026-10-12,
      choix tranchés en D35 ; fusion de la PR après la CI.

---

## 2. Avant la première collecte réelle (J2, 31 octobre 2026)

- [ ] **Écrire `config/sources.toml`** : une poignée de sources pour le premier essai réel de collecte
      (lot collecte).
- [ ] **Décider où vit la copie de référence des textes canoniques et des transcriptions**, hors Git
      depuis #31 (Zenodo en accès restreint, sauvegarde chiffrée…), et comment les deux machines se
      synchronisent. Une transcription T2 perdue ne se refait pas à l'identique
      (`docs/DETTE.md`, 2026-09-25, point 2).
- [ ] **Dire si une réextraction du texte invalide les items déjà validés sur l'ancien texte**
      (`docs/DETTE.md`, 2026-09-23, point 1).

---

- [ ] **Relire `prompts/reformulation-1.0.1.md`** avant tout appel réel. Elle remplace la 1.0.0 :
      ses tableaux suivent D42 (3) (position fixée par type d'item, état antérieur pour un item O,
      aucune position sur une Q-ATT, mesure fictive comprise, décision du 2026-10-17). Le texte
      envoyé au modèle ne change qu'à deux endroits : « ou l'a abandonnée » est retiré de la
      consigne « contre », et la parenthèse sur Q-ATT est retirée de la consigne « pour ».
- [ ] **Remplir `config/reformulation.json`** (PR #123) : identifiant épinglé de Mistral Large,
      `temperature`, `max_tokens`, `random_seed`, et `delai_abandon_ms` (délai d'abandon d'un
      appel, jamais envoyé à l'API ; ajouté le 2026-10-16). Puis `pnpm reformuler --simule`, et seulement
      ensuite `MISTRAL_API_KEY=… pnpm reformuler --plafond=<n>`, une fois des items dans
      `data/items/` et les candidats dans `config/perimetre.yaml`.
- [ ] **Dérouler la section « Relecture des formulations » de `docs/CONTROLE-MANUEL.md`** sur un
      bac jetable (PR #124).

---

## 3. Avant la campagne d'annotation (J3, 15 novembre 2026)

- [ ] **Recruter et former les annotateurs** (pseudonymisés, §10). Critère de J3 : kappa ≥ 0,80 sur
      les deux derniers lots.
- [ ] **Constituer le panel d'arbitrage** : trois à cinq membres nommés publiquement, de sensibilités
      déclarées différentes, sans mandat ni fonction de campagne (§10). À défaut, déclarer la
      faiblesse (critère de J3).
- [ ] **Dérouler `docs/CONTROLE-MANUEL.md`** sur `pnpm validate` avant d'ouvrir la campagne.

---

## 4. Avant le premier run (J4, 22 novembre 2026)

- [ ] **Sourçage des pages tronquées** (DETTE 2026-10-12, point 1) : dire si le compteur publié des
      soutiens indéterminés par cause suffit, ou s'il faut relever la borne de 50 000 caractères
      ou découper la page citée (amendement du §7).
- [ ] **Âge de la copie archivée d'un lien** : `pipeline/liens/instantanes.py` retient l'instantané
      Wayback le plus proche de l'instant du run, sans limite d'âge. Le §7 et D21 ne la fixent pas :
      une copie de 2019 peut « soutenir » une réponse de 2027. Trou du protocole, à trancher.
- [ ] **Obtenir les clés API** de chaque éditeur inclus. Elles se passent en variables
      d'environnement, jamais dans le dépôt.
- [ ] **Fixer `date_gel`** dans `config/perimetre.yaml` au moment du gel du run.

---

## 5. Décisions à prendre seulement si le cas se présente

- [ ] **Défaut découvert après la publication d'un run** : D51 (4) n'admet l'invalidation que depuis
      `planifie` ou `en_cours`, et le protocole ne prévoit pas d'erratum. Faut-il un erratum publié
      à côté du run, et un statut ou un champ pour le porter ? (D51, texte de la 0.17 au §6.)
- [x] (2026-10-09, D24 (3) : décision dérivée, codée au lot `go-no-go`) **Run `publie_provisoire` dont les sept critères go/no-go sont verts** : le schéma l'accepte
      (#61), alors que le §12 (« Sinon, le run est publié … avec la mention provisoire ») suggère
      qu'un run tout vert est publié sans la mention. À trancher au plus tard au lot `go-no-go`.
- [ ] **PDF servi sans `Content-Type` exact** : exception déclarée par source dans
      `config/sources.toml`, ou lecture de la signature `%PDF-` (`docs/DETTE.md`, 2026-09-23,
      point 3).
- [ ] **Premier amendement qui touche un schéma lu à l'exécution** : chaque objet porte-t-il la
      version du schéma qui l'a validé, ou un amendement n'a-t-il le droit que d'élargir ?
      (`docs/DETTE.md`, 2026-09-24, lot 3, point 1).
- [ ] **Registre `validation/mesures/decisions.json` au-delà de quelques dizaines d'entrées** :
      passer ou non en `.jsonl`. Le nom vient d'une décision de l'auteur (`docs/DETTE.md`,
      2026-09-19, point 4).
