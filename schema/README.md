# schema/ — modèle de données du Banc d'essai 2027

`docs/PROTOCOLE.md` fait autorité. Ce répertoire le traduit en contraintes vérifiables par une
machine. Quand un schéma est plus strict que le protocole, c'est que le protocole laissait un trou
qu'il fallait combler pour pouvoir implémenter les sections 4 à 8 ; chaque comblement est motivé
dans le champ `description` du schéma concerné, et les comblements qui touchent une **règle de
mesure** sont listés plus bas comme candidats à un amendement (§9).

## Les fichiers

| Fichier | Objet | Pourquoi il existe |
| --- | --- | --- |
| `commun.schema.json` | bibliothèque de `$defs` | Les énumérations du protocole (dix thèmes, quatre types d'item, six gabarits, trois registres) vivent ici **une seule fois**. Ne décrit aucun objet stockable, donc pas d'exemples. |
| `item.schema.json` | item de référence | §4 |
| `question.schema.json` | question | §5 |
| `reponse.schema.json` | réponse d'outil | §6 |
| `notation.schema.json` | notation individuelle | §7 |
| `verdict.schema.json` | note retenue | §7, règle de décision |
| `mesure.schema.json` | référent partagé | §5 Q-ATT, §7 mauvaise attribution, §6 QR9 |
| `run.schema.json` | run | §9 publication, §5 symétrie, §12 go/no-go |
| `tirage.schema.json` | questions tirées d'un run | §5 tirage, §9 publication des questions |
| `lecture-comparateur.schema.json` | lecture d'un comparateur | §6, QR9 |
| `decision.schema.json` | entrée du journal de validation | §4, une ligne du journal append-only écrit par l'interface de validation humaine |
| `decision-mesure.schema.json` | arbitrage d'une correction de thème | §4, décision de l'auteur sur une demande de correction du thème d'une mesure, publiée dans `validation/mesures/decisions.json` |
| `relecture-mesure.schema.json` | relecture d'une mesure par l'auteur | Règle 3 de `CLAUDE.md`, décision D53 (1) : une entrée de `validation/mesures/relectures.json`, registre publié en ajout seul. Identifiant, version et empreinte de relecture (recalculée depuis {libelle, theme, formulation_canonique, fictive, alias, origine_fictive, verification_fictivite}, champs absents omis ; distincte de `mesure.empreinte`) du contenu relu, et date civile ; jamais le texte. `pnpm promote` refuse (`sans_relecture`) d'écrire dans `data/mesures/` toute mesure, créée ou réécrite, qu'aucune entrée ne couvre exactement |
| `rattachement-item.schema.json` | rattachement d'un item à une autre mesure | §4 et décision D53 (1) : une entrée de `validation/mesures/rattachements.json`, registre publié en ajout seul écrit par `pnpm mesures --rattacher`. Item et sa version d'avant, mesure d'avant, mesure cible et la version sur laquelle l'item est épinglé, date civile ; jamais le contenu. L'item est réécrit en `staging/` sur la mesure cible (version incrémentée, empreinte recalculée) et renvoyé en attente ; `pnpm promote` ne relit pas ce registre |
| `gabarits.schema.json` | table des gabarits de questions | §5 (protocole 0.3) : les gabarits sont versionnés dans `prompts/` ; décrit `prompts/gabarits-1.0.0.json`, lu par `pipeline/questions/gabarits.ts` |
| `collecte.schema.json` | manifeste de contenu collecté | §4, collecte horodatée et archivée : `staging/sources/<sha256>.json`, les faits d'un document archivé une seule fois (empreinte, copie locale, archivage Wayback), écrit par `pipeline/collecte` (Python), format dans `docs/CONTRATS.md` §5 |
| `fiche-source.schema.json` | fiche d'une source listée | §4 : `staging/sources/par-source/<cle_source>/<sha256>.json`, une par entrée de `config/sources.toml` et par contenu obtenu, pour qu'aucune source ne perde ses métadonnées quand deux servent les mêmes octets ; avec le manifeste de contenu qu'elle pointe, alimente champ pour champ `commun#/$defs/source` |
| `reprise-archivage.schema.json` | reprise d'un archivage Wayback | §4 et règle 2 de `CLAUDE.md` : `staging/archivages/<sha256>.json`, écrit sans réécrire le manifeste quand une collecte ultérieure des mêmes octets réussit la sauvegarde qui avait échoué |
| `extraction-texte.schema.json` | fiche d'extraction d'un texte canonique | §4, contrat des artefacts : `staging/extractions/<sha256_source>/<texte_sha256>.json`, écrite par `pipeline/collecte/textes` (sous-lot C2) après le texte qu'elle décrit ; dit quel extracteur, dans quelle version et avec quelles options a produit le texte, et donne les pages d'un PDF (`source.page`) ou l'encodage d'une page HTML. Format dans `docs/CONTRATS.md` §1.1 ; pour un enregistrement audio ou vidéo (outil `webvtt`, sous-lot C3), nomme le `.vtt` dont le texte est dérivé |
| `transcription.schema.json` | fiche de transcription d'un enregistrement | §4, contrat des artefacts : `staging/transcriptions/<sha256_source>.json`, écrite par `pipeline/collecte/transcription` (sous-lot C3) après le `.vtt` qu'elle décrit ; trace le modèle, le dépôt et la révision des poids, l'empreinte de chaque fichier de poids, les versions du moteur et les paramètres de décodage, parce que la transcription n'est pas reproductible à l'octet et n'est jamais refaite. Format dans `docs/CONTRATS.md` §2.2 |
| `diagnostic-lot.schema.json` | diagnostic de lot publié | §4, accord inter-annotateurs, et §9, « diagnostics de lot (kappa, accord observé, effectif, lien de réannotation) » : `validation/diagnostics/<lot_id>/<instant>.json`, écrit en ajout seul par `pnpm diagnostics` à partir de `diagnostiquerLot` ; kappa absent avec son motif quand il est indéfini, `supersede_par` qui écarte un lot réannoté des critères du §12 |
| `lot.schema.json` | manifeste de lot de validation | §4 : `validation/lots/<lot_id>.json`, écrit une fois par `pnpm lots` et jamais réécrit, décrivant la composition commune aux deux annotateurs sur laquelle le kappa du lot est calculé. Vérifié par `lireLot`, `lireLots`, `ecrireLot` et `ecrireLots` (`validation/io/lots-fichier.ts`) ; l'unicité des `item_id` de `items` reste un contrôle de code, hors de portée de JSON Schema (revue du 2026-10-12, constat 4) |
| `decision-arbitrage.schema.json` | décision d'arbitrage d'un désaccord d'annotation | §4, règle de concordance (protocole 0.10) : une entrée de `validation/arbitrage/decisions.json`, registre publié en ajout seul, écrit par `pnpm arbitrer` et relu par `pnpm promote`. L'arbitre (l'auteur ; le panel, ou l'auteur marqué `arbitre_seul` à sa place, pour la paire « non évaluable » / « rejeter ») choisit un contenu proposé par un annotateur (`contenu_retenu`), jamais un contenu rédigé ; la décision ne s'applique qu'à la version, l'empreinte, le lot et le motif sur lesquels elle a été prise. L'item promu porte alors un bloc `arbitrage`, et `item.schema.json` admet « vérifié » sur deux décisions concordantes **ou** sur un arbitrage d'issue « verifie » |
| `notification-due.schema.json` | notification due à une campagne | §4, droit de réponse (protocole 0.10) : une ligne de `validation/notifications/dues.jsonl`, file en ajout seul écrite au même `--ecrire` que l'item par `pnpm promote` (création), `pnpm contester` (contestation) et `pnpm panel` (décision du panel). Aucune adresse : le destinataire est résolu à l'envoi |
| `envoi-notification.schema.json` | envoi d'une notification | §4 : « chaque envoi, réussi ou non, est journalisé et publié ». Une ligne de `validation/notifications/envois.jsonl`, écrite par `pnpm notifier` (Python) seul : un courriel par campagne et par exécution, ligne `en_cours` synchronisée avant l'envoi, puis issue ; destinataire générique publié, empreinte du message, Message-ID, code SMTP. Remplace `item.notifications[]`, retiré du schéma d'item |
| `perimetre.schema.json` | périmètre saisi d'un run | §3, §5, §6, §10 : `config/perimetre.yaml`, écrit à la main par l'auteur seul, aux noms de `run.perimetre` (décision de l'auteur du 2026-10-02). Valide le brouillon (clés à null, listes vides) comme le périmètre complet ; `pipeline/questions/charger-perimetre.ts` refuse un brouillon pour un run, applique la règle d'inclusion du §3, compte les items P au gel et rend l'instantané `run.perimetre`, revalidé contre `run.schema.json`, et les `ParametresTirage`. Aucune clé calculée au gel n'y est admise. Pas d'exemples au manifeste : ses cas limites sont dans `tests/questions/charger-perimetre.test.ts` |
| `existence-lien.schema.json` | résultat du test HTTP d'un lien cité | §7, « le lien cité existe (test HTTP déterministe) », décisions D20 et D21 : `runs/<date>/volume/liens/<sha256 de l'URL>.json`, un par URL citée, écrit une fois par `pipeline/liens` (Python) et lu par la notation (`pipeline/notation/fournisseur-fichiers.ts`). Les champs d'un lien de notation (verdict, date du test, URL finale, code HTTP, empreinte, lien d'archive) renvoient à `notation.schema.json` ; s'y ajoutent la version de la table `config/test-liens.toml`, le journal des tentatives, la page conservée et l'issue Wayback (Save Page Now, recherche d'instantané avec téléchargement de sa version brute, ou rien). Vérifié comme la collecte : fichiers dorés de `tests/liens/dore/` |
| `extraction-page-lien.schema.json` | texte d'une copie de page citée | §7, « la page citée contient bien l'affirmation (juge, puis audit humain) », décision D27 (E) (charge-juge-v3) : `runs/<date>/volume/liens/extractions/<sha256_contenu>.json`, une fiche par copie conservée par le test des liens (page d'un lien qui existe, version brute d'un instantané téléchargé, D21), écrite une fois par `pipeline/liens/textes.py` (`pnpm liens:textes`) et lue par la notation. Extraite : le texte `volume/liens/textes/<texte_sha256>.txt` et l'extracteur de la collecte qui l'a produit (`html.parser` ou `pymupdf`, version, options, pages ou encodage, renvoyés à `extraction-texte.schema.json`) ; refusée : le motif. Vérifié comme la collecte : fichiers dorés de `tests/liens/dore-textes/` |
| `checklist.schema.json` | checklist de run de l'annexe F | Annexe F, décision D24 (4) : `runs/<date>/checklist.json`, écrite par `pnpm go-no-go` (cases calculées, avec leurs appuis et leur état) et contresignée par `pnpm go-no-go:contresigner` (état de chaque case déclarée, motif de chaque case non faite, nom et instant du contreseing). Le texte de chaque case est celui du protocole, mot pour mot |
| `renvoi-humain.schema.json` | renvoi d'un juge vers la notation humaine | §7, décision D30 (2) : `runs/<date>/volume/renvois/<id>.json`, écrit une fois par la chaîne de notation à la place de la note d'un juge, sur une question d'attribution qu'aucun texte ne permet de noter (candidat du périmètre non interrogé cité, nom ambigu dont un candidat possible est attendu, formulation orientée à prémisse fausse avec un nom cité). Porte les noms relevés, le bloc d'attribution rattaché et la raison ; la réponse part en notation humaine sous `attribution_indecidable`, et le nombre de renvois est publié dans `run.json` (`renvois_attribution_indecidable`) |
| `proposition-formulation.schema.json` | proposition de formulations familière et orientée | §5, décisions D39 et D42 : `staging/formulations/<question_id>/<id>.json`, écrit une fois par `pnpm reformuler` pour chaque réponse HTTP du modèle. Porte la demande (variables du prompt), la production (modèle épinglé, version du prompt), le corps reçu tel quel (règle 7) et l'issue : `echec_http`, `rejetee` avec motif nommé, ou `acceptee`. Seule une proposition acceptée, faite sur le texte neutre courant, est relue puis promue vers `data/formulations/` |
| `formulations-validees.schema.json` | formulations relues d'une question | §5, décisions D39 et D42 : `data/formulations/<question_id>.json`, écrit par la seule relecture de l'interface de validation (`validation/io/data-formulations.ts`, règle 3) quand l'annotateur juge les trois formulations fidèles au sens et la prémisse de l'orientée conforme à la position demandée. Porte la clé (`question_id`, `empreinte_texte_neutre`), la version des gabarits, la proposition promue et `formulations`, référence au tableau du schéma `question` (`$ref`, jamais recopié), avec `sens_preserve` à `true`. Lu par le gel (`pipeline/reformulation/lecture-au-gel.ts`), qui refuse une question absente ou relue sur un autre texte neutre ; invariants hors schéma dans `pipeline/questions/invariants.ts` |
| `refus-formulation.schema.json` | refus d'une proposition à la relecture | §5, décisions D39 et D42 : une ligne de `validation/formulations/refus.jsonl`, journal en ajout seul écrit par la relecture quand une formulation change le sens ou que la prémisse de l'orientée n'affirme pas la position demandée. Nomme la proposition, la question, l'empreinte du texte neutre, l'annotateur, les registres en cause, l'état de la case de prémisse et un commentaire obligatoire. Une proposition refusée n'est plus relue ; `pnpm reformuler` lit `proposition_id` pour rappeler le modèle |
| `config-gel.schema.json` | paramètres du gel d'un run | §6, §7, §9, décision D41 : `config/gel.json`, saisi à la main par l'auteur, lu par `pnpm geler` (`pipeline/gel/configuration.ts`). Porte ce que `run.json` exige et qu'aucune autre source ne porte : version du protocole, début de la fenêtre, juges, alias aveugles. Un brouillon (champs à `null`) est conforme ; la commande le refuse en nommant chaque champ. Les graines et l'identifiant viennent de la balise drand (D44, D45 (1)), l'engagement archivé de `--engagement` (D46) |
| `sortie-extraction.schema.json` | sortie brute d'un modèle extracteur | §4, extraction double, décision D52 : la forme exacte que `prompts/extraction-1.0.0.md` demande (`{"items": [...]}`, types P et O, position sans `sans_objet`, aucun champ en plus, pas de `page`). Lue par `pipeline/extraction/lecture-sortie.ts` sur la chaîne reçue telle quelle (règle 7) ; une sortie non conforme est rejetée en entier, jamais réparée. L'égalité de `candidat_id` avec la source est contrôlée par le code |
| `entree-extraction.schema.json` | entrée de l'extraction double d'une source | §4, décision D52 (PR 3 du lot extraction) : `staging/entrees-extraction/<cle_source>/<sha256>.json`, écrit une fois par `pnpm extraction:entrees` (Python) et lu par `pnpm extraire`. Porte l'extracteur de texte épinglé par le code pour ce contenu (D52 (4)) et un bloc `source` par fiche d'extraction, assemblé par `source_de` sans page ni extrait ; le choix de la fiche reste à `choix-texte.ts:choisirFiche`. Vérifié comme la collecte : fichier doré de `tests/collecte/dore/entrees-extraction/` |
| `reponse-extraction.schema.json` | réponse HTTP d'un modèle extracteur | §4, décision D52, règle 7 : `staging/reponses-extraction/<cle_source>/<sha256>/<modèle>.<prompt_sha256>.json`, écrit une fois par `pnpm extraire` avant toute lecture du corps (objet JSON dans `brut`, texte UTF-8 exact dans `brut_texte`). Clé de reprise : source, modèle, empreinte du prompt rendu |
| `journal-extraction.schema.json` | journal de l'extraction d'une source | §4, décisions D52 et D53 (2) : `staging/journal-extraction/<cle_source>/<sha256>.json`, écrit en dernier par `pnpm extraire`, après les items et les mesures ; marque la source traitée. Issue `extraite` (identifiants déposés, rejets du cœur) ou `refusee` (une sortie rejetée en entier, `extraction_double_incomplete`, aucun item) |

Quatre objets étaient demandés ; il en a fallu neuf. Les quatre ajoutés ne sont pas des commodités :
sans `mesure`, la réponse attendue d'une Q-ATT n'est pas calculable ; sans `run`, les cinq graines et
le périmètre gelé n'ont pas de domicile et finiraient en dur dans un script, hors publication ; sans
`verdict`, l'analyse de robustesse §8(a) ne peut pas isoler la notation humaine ; sans
`lecture-comparateur`, la famille des comparateurs remplirait l'objet `reponse` de champs nuls et
imposerait un embranchement par famille d'outil dans le code de notation. `tirage` est sorti de
`run` dans un second temps : environ 400 entrées que tout contrôle go/no-go aurait dû charger
entières, alors qu'une référence par chemin et empreinte suffit.

## Le flux, et où chaque objet est écrit

```
mesure ─┐
        ├─> item (staging/ puis data/ après validation humaine)
        │
        └─> question ──> run.tirage[] ──> reponse ──> notation ──> verdict ──> analysis/
                             (gel)          (48 h)     (2 juges)   (résolution)
```

`data/items/` n'est écrit que par l'interface de validation. Les schémas n'y changent rien : ils
décrivent la forme, pas le droit d'écrire.

## Conventions qui ne se devinent pas

**Identifiants opaques (ULID).** L'annexe A proposait `2027-LEP-FISC-0012`. Un id qui encode le
candidat et le thème devient faux dès qu'un annotateur corrige le thème — ce que la grille de
validation du §4 lui demande explicitement de vérifier — et il fait fuiter l'identité de l'outil
vers un juge que le §7 veut aveugle. Les ids sont donc opaques, `libelle_lisible` est décoratif et
gelé, et `reponse.alias_aveugle` rend l'aveuglement auditable après coup.

**Temps.** Tout instant porte son décalage. `run.date_gel` est l'instant de référence **unique** d'un
run : une réponse obtenue à +47 h dans la fenêtre de 48 h est jugée contre le même instant que
celle obtenue à +2 min. Les intervalles de validité sont **semi-ouverts** : `valide_du <= date_gel <
valide_au`. Un item dont `valide_au` (ou `obsolescence.date_changement`) tombe exactement sur
`date_gel` est donc **déjà obsolète**, et la réponse attendue est « position modifiée ». §4 disait
« avant » et « après » sans jamais définir l'égalité.

Une **date civile** (`AAAA-MM-JJ` : `valide_du`, `valide_au`, `date_changement`) comparée à
`date_gel` est lue à **minuit UTC**, décidé le 2026-09-20 (D7, point 6). Minuit à Paris aurait été
l'autre lecture défendable, et elle décale la bascule d'une ou deux heures selon la saison : un item
dont la source est datée du jour du gel serait obsolète pour l'auteur et pas encore pour un tiers
qui recalcule le run depuis une autre zone. UTC est aussi ce que rend `Date.parse("2026-11-22")`
partout, donc ce qu'obtient un tiers qui ne lit pas cette ligne.

**Versionnement et épinglage.** `item.version` + `item.empreinte` sont épinglés partout où un item
est utilisé (question, tirage, notation). Git dit *quand* un item a changé ; l'épinglage dit *contre
quelle version* une réponse a été notée. Sans lui, la robustesse §8(b) et toute relecture d'un run
publié sont impossibles.

**Statuts orthogonaux.** Les sept statuts du §4 mélangeaient trois dimensions. Ici :
`statut_validation` (en_attente, a_confirmer, verifie, rejete, non_evaluable, retire_par_panel),
`statut_contestation` (aucune, contestee, arbitree), et l'obsolescence **dérivée** des dates. Un item
peut être vérifié, contesté et obsolète en même temps, ce qu'un enum unique ne pouvait pas exprimer.

**Réponse brute immuable.** `brut` est opaque (`additionalProperties` libre), n'est jamais lu par la
notation, et `brut_sha256` rend l'immuabilité vérifiable. `normalise` est une projection
explicitement **avec perte**, produite par une fonction dont la version est stockée dans la réponse.
Un schéma commun typé sur les charges utiles des éditeurs aurait été un reformatage, donc une
violation de la règle 7.

**Ce que Git stocke, et ce qu'il ne stocke pas.** Un run produit de l'ordre de 24 000 réponses et
48 000 notations individuelles, soit plusieurs centaines de mégaoctets ; sur une saison d'environ
vingt runs, plusieurs gigaoctets. Dans Git, le dépôt cesserait d'être clonable, donc vérifiable —
exactement ce que le §9 exige qu'il reste. Git garde `data/`, `config/`, `prompts/`, le code, et par
run les questions, le tirage, les verdicts et les métriques. Le volume part en archive sur Zenodo,
avec le DOI que le §9 impose déjà, référencée depuis `run.depot` par DOI, empreinte SHA-256, taille
et nombre d'entrées. Aucun amendement n'est nécessaire : le protocole exige que les réponses brutes
soient **publiées**, jamais qu'elles soient dans Git. Effet de bord favorable sur la règle 7 — une
archive à DOI ne se réécrit pas.

**Ce qui n'alimente pas les métriques.** `contexte` vaut `run`, `pilote`, `jeu_or`,
`contrefactuel_candidat` ou `contrefactuel_outil`. Les 200 réponses permutées du test contrefactuel
(§7) sont des textes qu'aucun outil n'a produits. Le filtre `contexte == "run"` est la seule barrière
entre elles et un chiffre publié ; il vit dans `analysis/`, une fois.

**Contestation pendant un run.** Le tirage fige `statut_contestation_au_gel`. Une contestation reçue
après le gel n'entre pas dans le critère §12 — elle atterrit dans `run.contestations_posterieures[]`,
qui est exactement l'entrée de l'analyse de robustesse §8(b).

**Candidat entrant ou sortant.** `run.perimetre.candidats[]` est un instantané : `statut_au_gel`
(actif / nouveau / retire), `preuves_inclusion[]` (les deux sondages du §3, archivés, sans quoi la
règle d'inclusion est invérifiable par un tiers), `items_p_verifies` compté au gel et **stocké**, et
`interroge` (faux pour un candidat retiré). Le ratio de reprise 80/20 se calcule par candidat présent
aux deux runs ; un candidat `nouveau` en est exclu. `perimetre.regime_inclusion` déclare le régime du
§3 : `avant_liste_officielle` exige de tout candidat non retiré sa `declaration_candidature` et au
moins deux `preuves_inclusion` (la fenêtre de 60 jours, que le schéma ne sait pas comparer, est
contrôlée au chargement de `config/perimetre.yaml` par `pipeline/questions/charger-perimetre.ts`, qui
applique `pipeline/questions/perimetre.ts`) ; `liste_officielle` exige la liste du Conseil
constitutionnel archivée (`perimetre.liste_officielle`). `sous_seuil` est lié à `items_p_verifies`
dans les deux sens, et ce dernier se compte par `pipeline/questions/couverture.ts`.

**Réponse partiellement correcte.** La catégorie primaire reste binaire, donc les métriques
préenregistrées ne bougent pas. `notation.motif_inexactitude` et `notation.attribution{attendus,
cites}` enregistrent en plus de quoi reconstruire la nuance en analyse exploratoire : bonne position
avec mauvais chiffre, ajout fabriqué non contraire, liste d'attribution juste à 4 candidats sur 5.

**Plusieurs items pour une même question.** `question.items[]` porte un `role` par entrée, avec
exactement un `principal` — au plus un pour une question d'attribution, aucun sur une mesure réelle
(protocole 0.9) — et `grappe_id` **stocke** la grappe du bootstrap (§8 : « la grappe étant l'item
[…], et la mesure pour une question d'attribution ») au lieu de laisser l'analyse la recalculer.

## Exemples et table de vérité

`exemples/manifeste.json` liste les exemples avec, pour chacun, le résultat attendu de la
validation et la règle du protocole qu'il teste. Les fichiers `invalide-*` **doivent** être rejetés :
ce sont eux les tests. Les rejets attendus, objet par objet :

| Objet | Ce que les exemples invalides vérifient |
| --- | --- |
| item | source T3 déclarée vérifiée · item vérifié avec une seule validation · item d'absence portant une citation de position · item O vérifié dont l'état postérieur est T3 · item vérifié dont la source T2 n'a pas d'attestation d'écoute · item en attente dont la source T2 porte déjà une attestation · site de parti non déclaré de campagne déclaré T1 · citation tirée d'un PDF sans page (0.13) · source sans `format` (0.13) · item rejeté portant une attestation d'écoute (0.13) · item non évaluable portant une attestation d'écoute (0.13) · décision du panel sans statut antérieur · item portant son thème · item sans `mesure_version` · quantification hors de `dimensions[]` · contestation portant l'adresse du contestataire |
| mesure | mesure fictive sans vérification contre les corpus T1 · thème hors des dix · identifiant lisible au lieu d'opaque |
| question | deux items principaux · Q-ATT nommant un candidat · deux formulations au lieu de trois · question directe sans item principal · booléen `premisse_fausse` figé sur la formulation · position affirmée hors de la formulation orientée |
| reponse | réponse manquante portant un contenu · réponse d'API sans mode · artefact contrefactuel sans traçabilité · réponse d'API sans la clé `modele_renvoye` · manquante hors fenêtre avec trois tentatives · manquante sans `motif_manquante` · obtenue portant un `motif_manquante` · refus de l'API portant un texte · tentative classée `refus_api` · manquante pour échecs avec deux tentatives · `brut` et `brut_texte` ensemble · obtenue sans `brut_octets_sha256` · requête sans `entetes` |
| notation | juge attribuant « indéterminée » · drapeau sur une réponse exacte · note non exacte sans extrait justificatif · arbitrage de l'échantillon humain confié à un juge · échantillon humain noté par un juge · lien mort noté « soutient » · fraîcheur sans drapeau obsolescence · accord partiel des juges noté par un juge |
| verdict | fabrication retenue sans revue humaine · verdict sans notation source · désaccord avec une seule source · réponse de l'échantillon humain retenue sur l'accord des juges · soutien retenu sans lien existant · fraîcheur sans drapeau obsolescence |
| run | graine sans algorithme nommé · symétrie rouge et run publié · candidat à 8 items P déclaré au-dessus du seuil · candidat sans libellé · candidat sans nom seul · graine au-delà de 2^53 − 1 · juge d'un run publié sans kappa juge-humain ni motif · kappa de la paire publié avec un motif d'indéfinition · mode à 30 % de manquantes déclaré comparable · symétrie rouge et run en cours · candidat à 25 items P déclaré sous le seuil · candidat actif avec une seule preuve de sondage · candidat actif sans déclaration de candidature (régime avant la liste) · assistant inclus d'un run publié sans `par_mode` · run publié sans `donnees_commit` · run invalide portant un go/no-go · run invalide sans `publication` · run invalide sans `depot` · graine de l'échantillon humain en PCG64 · graine du contrefactuel en PCG64 · run planifié sans `donnees_commit` · symétrie sans la condition de quota · run publié sans le test contrefactuel (`contrefactuel_candidats`) · test contrefactuel indéfini et un juge qui publie un taux · taux de changement contrefactuel sans ses effectifs (`changements_contrefactuel`) · test contrefactuel terminé et un juge sans taux |
| tirage | entrée d'attribution nommant un candidat · deux items principaux dans une entrée · question reprise sans run d'origine · item arbitré sans décision du panel figée · décision figée sur un item non arbitré · graine au-delà de 2^53 − 1 · entrée sans prémisse résolue au gel · tirage sans ses quotas (`parametres`) · tirage sans `contestes_au_gel` · entrée sans `theme` · entrée sans `grappe_id` |
| lecture-comparateur | absence d'affichage portant un extrait · affichage sans extrait · cadence supérieure à une page par seconde · lecture de pages sans respect de robots.txt |
| decision | annulation portant une décision · decision=corriger avec corrections vide · item O portant reponses_grille au lieu de reponses_par_etat |
| decision-mesure | refus sans motif · theme_demande hors des dix thèmes fixes du §3 |
| gabarits | gabarit sans `positions_exclues` · gabarit présent deux fois |
| collecte | `archive_url` et `echec_archivage` à la fois · manifeste sans `url_soumise` |
| fiche-source | site de parti sans `site_parti_tient_lieu_de_campagne` · fiche portant `archive_url` · programme PDF déclaré T2, contraire à la table des tiers (0.13) |
| reprise-archivage | `archive_url` qui n'est pas un instantané daté |
| extraction-texte | fiche pymupdf portant un `encodage` · fiche html.parser sans `encodage` · fiche webvtt sans `vtt_sha256` |
| transcription | température de décodage non nulle · révision des poids qui n'est pas un hash de commit |
| diagnostic-lot | kappa indéfini remplacé par 0 à côté de son motif · diagnostic sans `supersede_par` · lot de réannotation sans date de calibration |
| lot | champ inconnu · trois annotateurs · annotateurs non distincts · `nature` inconnue · réannotation sans `date_calibration` · réannotation sans `reannote` |
| existence-lien | lien mort portant une page conservée · lien existant sans page · `archive_url` sans instantané renvoyé · verdict hors des quatre du schéma de notation · copie archivée sans empreinte · instantané écarté recopié en `archive_url` · téléchargement en échec avec `archive_url` · instantané retenu de statut 302 · issue `url_non_ascii` retirée (D21) |
| extraction-page-lien | refus portant un texte · texte extrait sans extracteur · extracteur `webvtt` sur une page citée (D27) |
| renvoi-humain | renvoi sur une question qui n'est pas d'attribution (D30) |
| proposition-formulation | corps à la fois `brut` et `brut_texte` · position affirmée recopiée « AUCUNE » au lieu d'être absente (D42) |
| formulations-validees | neutre produite par un modèle au lieu de la table de gabarits (D42 (2)) · formulation promue avec `sens_preserve` à `false` |
| refus-formulation | commentaire fait d'espaces · aucun registre en cause |
| config-gel | clé inconnue (`taux_echantillon_humain`) · juge sans `version_prompt` · début de fenêtre sans décalage |
| sortie-extraction | item de type A · position `sans_objet` · thème hors des dix · champ `page` fourni par le modèle (D35) |
| entree-extraction | bloc `source` portant déjà une page |
| reponse-extraction | `brut` et `brut_texte` ensemble |
| journal-extraction | issue `refusee` sans rejet de portée `source` · issue `extraite` portant `extraction_double_incomplete` |
| relecture-mesure | empreinte non hexadécimale · formulation recopiée dans l'entrée (champ en trop) |
| rattachement-item | entrée sans `mesure_avant` · version de la mesure cible à 0 · libellé recopié dans l'entrée (champ en trop) |

Vérification initiale faite avec `jsonschema` 4.26 (draft 2020-12) sur les douze premiers schémas ;
depuis, `pnpm check` rejoue le tout et imprime les comptes : chaque schéma au registre, chaque exemple
contre le manifeste. Le runner vit dans `outils/schemas.ts` (ajv 8.20.0 et
ajv-formats 3.0.1, draft 2020-12) : `pnpm schemas` le lance seul, `pnpm check` l'exécute avec les
types et ESLint.

## Points restés ouverts, qui demandent un amendement (§9)

Ces schémas les rendent *représentables* sans trancher la règle de mesure :

1. **§3, candidat retiré.** « Sort des runs suivants » et « ses items d'obsolescence servent à
   mesurer si les outils l'ont remarqué » sont contradictoires. Retenu : conservé, non interrogé
   (`interroge: false`). La seconde moitié de la phrase est à supprimer ou à préciser.
2. **§5, symétrie et Q-ATT.** « Même nombre de questions par candidat » ne peut pas s'appliquer aux
   questions d'attribution, que le même §5 interdit d'attribuer à un candidat. La condition
   `nombre_questions_par_candidat` porte donc sur les cinq autres gabarits.
3. **§7, ajout fabriqué non contraire.** Une réponse qui affirme la bonne position **et** une
   position inventée non contradictoire n'est ni « exacte » au sens plein ni « incompatible » au sens
   littéral. Le champ `motif_inexactitude: ajout_fabrique` permet de l'enregistrer dans les deux
   sens ; la règle de classement appartient au prompt du juge et reste à écrire.
4. **§6, troncature.** Retenu : une réponse tronquée est obtenue et notée telle quelle, avec
   `normalise.troncature`. Tranché par le protocole 0.3 (§8) : elle entre dans les métriques
   primaires, et un recalcul de robustesse (d) l'exclut.
5. **§12, kappa et seuils.** `taux_echantillon_humain` n'accepte que 0,10 et 0,25, les deux seules
   valeurs prévues par le §7. Tout autre taux exige un amendement, et c'est voulu.
6. **Annexe A, `obsolescence.date_changement`.** La frontière est portée par un champ unique, et non
   dupliquée dans les deux états, pour qu'aucune divergence ne soit possible entre deux dates
   décrivant le même instant.
