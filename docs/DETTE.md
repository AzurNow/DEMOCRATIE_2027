# Dette et risques de casse

Journal des points qui peuvent casser plus tard **à cause de ce qui a été implémenté**. Une entrée
par session, la plus récente en tête. Un point n'est retiré que lorsqu'il est réglé : on barre la
ligne et on dit par quoi.

Ce fichier ne recense pas les bugs ouverts ni les fonctionnalités manquantes : seulement les
décisions dont la facture arrivera plus tard. Les trous du protocole lui-même (ce qui demande un
amendement §9) vivent à côté du code concerné — pour les schémas, en fin de `schema/README.md`.

Convention de gravité : **haute** = casse silencieuse d'une mesure publiée · **moyenne** = casse
visible, coûteuse à réparer · **basse** = friction.

---

## 2026-10-19 — Lot 5, extraction et reprise : relance sans doublon, épinglage périmé, échec de transport, `modele_different` (constats 2 à 4 et 17 de `docs/revues/2026-10-17.md`, PR #161 et #167 : `pipeline/extraction/`)

### 1. `staging/identifiants-extraction/` n'est jamais purgé — *basse*

La relance sans doublon (constat 3) enregistre les identifiants tirés pour chaque source dans
`staging/identifiants-extraction/<source>/<sha>.json`, jamais nettoyé après la promotion.

**Pourquoi ça casse.** Friction seulement : une purge de `staging/` pour une source oubliera ce
fichier si elle n'est pas écrite pour en tenir compte.

**Ce qu'il faut faire.** Y penser si une commande de purge de `staging/` est un jour écrite.

### 2. Une relance n'audite pas les items déjà déposés — *basse*

À la relance, un item déjà présent (d'après `staging/identifiants-extraction/`) n'est ni comparé ni
réécrit : seul le nombre d'identifiants est confronté à la tentative précédente, sous peine de
`RepriseIncoherente`.

**Pourquoi ça casse.** Si le code change entre deux tentatives d'une même source sans changer le
nombre d'identifiants produits, la relance garde les anciens items sans avertir que leur contenu ne
correspond plus à ce que produirait le code actuel.

**Ce qu'il faut faire.** Rien tant que ce cas reste théorique ; au premier incident, comparer aussi
le contenu, pas seulement le compte.

### 3. Une réponse 2xx sans champ `model` échappe au contrôle de l'épinglage — *moyenne*

Le refus `modele_different` (constat 17) compare le `model` rendu par l'éditeur à l'identifiant
épinglé ; une réponse 2xx qui omettrait ce champ est acceptée, rien n'étant affirmé sans pouvoir le
lire.

**Pourquoi ça casse.** Un éditeur qui cesserait de renvoyer `model` (changement de version de SDK,
par exemple) ferait disparaître silencieusement ce contrôle, sans qu'aucun test ne le voie puisque
l'éditeur simulé renvoie toujours ce champ.

**Ce qu'il faut faire.** Au premier appel réel, vérifier que chaque éditeur renvoie bien `model` à
chaque réponse ; sinon, décider si son absence doit refuser la source.

### 4. Une source refusée avant #167 sur un 408/429/5xx reste sautée après la reprise — *basse*

Le nouveau traitement de l'échec de transport (constat 2) ne s'applique qu'aux refus écrits depuis
la PR #167 ; une source déjà refusée par l'ancien code sur l'un de ces statuts garde son journal de
refus (lecture illisible) et reste sautée aux relances suivantes.

**Pourquoi ça casse.** Aucune donnée réelle n'existe encore (`staging/` est vide dans un clone) :
le cas est théorique. S'il se produisait sur un vrai run, il faudrait reprendre ces sources à la
main.

**Ce qu'il faut faire.** Si une telle source existe un jour, retirer son entrée du journal
d'extraction avant de relancer `pnpm extraire`.

---

## 2026-10-17 — Lot 1, gardes de sortie (constats 6 et 32 de `docs/revues/2026-10-17.md`, branche `lots/gardes-de-sortie` : `pipeline/gardes-sortie.ts`, `pipeline/reformulation/commande.ts`, `pipeline/extraction/commande.ts`, `pipeline/gel/destination.ts`, `pipeline/notation/*`)

### 1. La liste des zones protégées est figée dans le code, pas dérivée de l'arborescence — *basse*

`exigerHorsDesZonesProtegees` refuse `staging/`, `data/` et `runs/` par une liste écrite en dur
(`ZONES_PROTEGEES`). Si un futur répertoire de production voit le jour à la racine du dépôt (à la
manière de `data/`), rien ne le protège d'une sortie simulée tant que la liste n'est pas éditée à la
main.

**Pourquoi ça casse.** Casse silencieuse : une sortie simulée vers le nouveau répertoire ne serait
refusée par aucun test, puisqu'aucun test n'existe encore pour un répertoire qui n'existe pas.

**Ce qu'il faut faire.** À la création d'un nouveau répertoire de production à la racine, relire
`pipeline/gardes-sortie.ts` et ajouter le nom à `ZONES_PROTEGEES` si une commande peut y écrire en
mode simulé.

### 2. Toute commande qui gagnera un mode simulé devra appeler la garde partagée elle-même — *basse*

`pnpm reformuler` et `pnpm extraire` appellent `exigerHorsDesZonesProtegees` explicitement ; rien
dans `analyserArguments` ni dans le typage ne force une future commande simulée (ex. un lot qui
ajouterait un mode simulé à une commande existante) à faire de même.

**Pourquoi ça casse.** Casse silencieuse, seulement si une commande future ignore la convention : un
item ou une proposition simulée s'écrirait sous `data/` sans qu'aucun refus n'apparaisse.

**Ce qu'il faut faire.** Rien tant qu'aucune commande simulée de plus n'existe ; à la revue de code
suivante, vérifier que toute nouvelle commande `--simule` appelle cette garde avant d'écrire.

---

## 2026-10-16 — Refus `empreinte_incoherente` à la promotion des mesures (branche `lots/empreinte-mesure` : `validation/domaine/empreinte.ts`, `validation/io/data-mesures.ts`, `pipeline/extraction/assemblage.ts`, `tests/aides/fabriques.ts`)

### 1. Toute mesure éditée à la main en staging doit voir son empreinte recopiée à la main — *basse*

Après une correction de thème acceptée ou une formulation reprise, `pnpm promote` refuse la
mesure tant que son champ `empreinte` n'est pas celui qu'indique le refus. Aucun outil ne le
recalcule : c'est voulu (la promotion ne réécrit rien en silence), mais l'auteur doit copier un
sha256 depuis le rapport.

**Pourquoi ça casse.** Friction à chaque édition manuelle ; une erreur de copie donne un second
refus, jamais une mesure fausse.

**Ce qu'il faut faire.** Si la friction pèse : faire afficher l'empreinte attendue par
`pnpm mesures --relire`, ou une commande explicite qui la recalcule en staging. Décision de l'auteur.

### 2. `data/mesures/` n'est pas contrôlé à la lecture — *basse*

`lireMesuresData` valide le schéma mais pas l'empreinte. Une mesure publiée ne peut y entrer que
par la promotion, qui la contrôle désormais ; un fichier de `data/mesures/` modifié à la main ne
serait pas détecté avant la promotion suivante qui le compare.

**Ce qu'il faut faire.** Rien tant que `data/` reste écrit par la seule promotion.

---

## 2026-10-16 — D53 (1), PR D : relecture étendue et rattachement F ⇔ fictive (branche `lots/relecture-etendue`, PR #150 : `validation/domaine/relectures-mesure.ts`, `validation/domaine/rattachements-item.ts`, `outils/mesures.ts`, `schema/relecture-mesure.schema.json`)

### 1. Toute réécriture automatique des champs relus d'une mesure annule sa relecture — *basse*

L'empreinte de relecture couvre désormais `alias`, `origine_fictive` et `verification_fictivite`,
au caractère près, ordre des tableaux compris (`corpus_verifies`, `alias`). Un futur outil qui
trierait les alias ou ajouterait un corpus balayé à une mesure déjà relue la ferait refuser par
`pnpm promote` (`sans_relecture`).

**Pourquoi ça casse.** Casse visible (refus), mais déroutante : rien n'a changé « au fond ».

**Ce qu'il faut faire.** Tout code qui écrit dans `staging/mesures/` après l'extraction le fait
avant la relecture, ou dit à l'auteur qu'une nouvelle `--relire` est due.

### 2. Deux empreintes de mesure coexistent volontairement — *basse*

`mesure.empreinte` (schéma, `assemblage.ts`) couvre quatre champs ; `empreinteRelecture` en couvre
sept. Le nom « empreinte de la mesure » désigne donc deux choses.

**Pourquoi ça casse.** Qui unifierait les deux « pour supprimer un doublon » (proposition de la
PR A, point 2) ferait soit sortir les alias de la relecture, soit changer `mesure.empreinte` de
toutes les mesures publiées.

**Ce qu'il faut faire.** Rien ; l'en-tête de `relectures-mesure.ts` et le schéma le disent.

### ~~3. La fabrique `itemO` de `tests/aides/fabriques.ts` produit un item invalide depuis la 0.17~~ — réglé le 2026-10-16 : extrait T2 dans la fabrique, contournement retiré, fabriques validées contre leur schéma (`tests/fabriques-schemas.test.ts`)

Sa source T2 n'a pas d'`extrait`, que `item.schema.json` exige désormais : l'item ne passe pas
`chargerStaging`. `tests/rattacher-item.test.ts` contourne en ajoutant l'extrait localement.

**Pourquoi ça casse.** Un test écrit sur la fabrique telle quelle échoue au chargement, pas sur la
règle visée ; ou pire, un test qui attend un refus le reçoit pour la mauvaise raison.

**Ce qu'il faut faire.** Petit lot : corriger la fabrique, retirer le contournement, et valider
chaque fabrique contre son schéma dans un test.

---

## 2026-10-16 — D53 (1), PR B : `pnpm mesures --relire` et `--rattacher` (branche `lots/relecture-rattacher` : `outils/mesures.ts`, `outils/rattachement-mesure.ts`, `validation/domaine/rattachements-item.ts`, `validation/io/rattachements-fichier.ts`, `validation/io/relectures-fichier.ts`, `schema/rattachement-item.schema.json`)

### ~~1. `--rattacher` ne vérifie pas que l'item et la mesure cible s'accordent~~ — réglé le 2026-10-16 par le protocole 0.17 (§4 : F ⇔ fictive, sans refus du doublon candidat × mesure) et la PR #150 (refus `type_incompatible`)

Rien n'empêche de rattacher un item P à une mesure fictive, ni deux items du même candidat à la
même mesure. Un tel contrôle serait une règle d'inclusion, donc une décision de l'auteur.

**Ce qu'il faut faire.** Trancher entre aucun contrôle, refus si `fictive` ne correspond pas au type
de l'item, ou ce refus plus celui du doublon candidat × mesure ; l'écrire au §4 avec la PR C.

### 2. Un rattachement interrompu entre staging et registre se répare à la main — *basse*

L'item est réécrit en staging, puis l'entrée est ajoutée au registre. Si l'ajout échoue, une
relance tombe sur `deja_rattache` sans rien inscrire : seule la remise en état donnée par
`RattachementInacheve` (`git checkout -- staging/items/<id>.json`, l'arbre était propre) rattrape
le cas.

**Ce qu'il faut faire.** Rien tant que le cas reste théorique (tous les contrôles passent avant la
première écriture).

### 3. Tout nouveau chemin de renvoi doit s'inscrire dans `CHANGEMENTS_QUI_RENVOIENT` — *moyenne*

`renvoyeDepuis` (`validation/domaine/renvoi-mesure.ts`) ne reconnaît que les préfixes de cette
liste. Une réécriture d'item qui l'oublierait laisserait un lot juger encore un contenu qui a changé.

**Ce qu'il faut faire.** Le rappeler à toute PR qui ajoute une écriture dans `staging-renvoi.ts`.

### 4. `poserRegistreAjoutSeul` vit dans `relectures-fichier.ts` et sert aux deux registres — *basse*

Déplacer ou renommer ce module casse aussi celui des rattachements.

**Ce qu'il faut faire.** Le sortir dans un module commun si un troisième registre en ajout seul apparaît.

---

## 2026-10-16 — D53 (1), PR A : verrou de relecture des mesures avant promotion (branche `lots/relecture-verrou` : `validation/domaine/relectures-mesure.ts`, `validation/io/relectures-fichier.ts`, `validation/io/data-mesures.ts`, `schema/relecture-mesure.schema.json`)

### ~~1. Toute nouvelle version d'une mesure bloque `pnpm promote` jusqu'à sa relecture, sans commande pour l'inscrire~~ — réglé le 2026-10-16 par `pnpm mesures --relire` (PR #147)

Règle uniforme voulue (D53 (1), choix de l'auteur du 2026-10-16) : une correction de thème acceptée
produit une version 2 qui doit être relue à son tour. Tant que la PR B (`pnpm mesures --rattacher`)
n'existe pas, `validation/mesures/relectures.json` s'écrit à la main ; le refus `sans_relecture`
affiche l'empreinte attendue.

**Ce qu'il faut faire.** PR B : commande d'écriture du registre, réutilisant `relectureDe`.

### ~~2. L'empreinte d'une mesure est définie à deux endroits~~ — sans objet le 2026-10-16 : les deux empreintes divergent volontairement (PR #150, `empreinteRelecture` sur sept champs ; voir PR D, point 2)

`pipeline/extraction/assemblage.ts:mesureDe` et `validation/domaine/relectures-mesure.ts:empreinteContenuMesure`
calculent chacun le sha256 de {libelle, theme, formulation_canonique, fictive}.

**Pourquoi ça casse.** Si l'une change sans l'autre, aucune relecture ne correspond plus (casse
visible : tout est refusé), ou le champ `empreinte` stocké diverge du contenu relu.

**Ce qu'il faut faire.** Faire appeler `empreinteContenuMesure` par `assemblage.ts` (PR B ou petit lot).

### ~~3. Le champ `mesure.empreinte` n'est contrôlé nulle part contre le contenu~~ — réglé le 2026-10-16 : refus `empreinte_incoherente` dans `planifierMesures`, définition unique `empreinteMesure`, fixtures corrigées (branche `lots/empreinte-mesure`)

Le verrou compare la relecture à l'empreinte **recalculée**, donc il n'est pas trompé. Mais un
fichier de `data/mesures/` peut porter une empreinte fausse sans que rien n'échoue (les fixtures
portent `"3".repeat(64)`).

**Ce qu'il faut faire.** Lot séparé : refus `empreinte_incoherente` à la promotion, fixtures corrigées.

### ~~4. `alias`, `origine_fictive` et `verification_fictivite` changent sans relecture~~ — réglé le 2026-10-16 par le protocole 0.17 (§4) et la PR #150 (empreinte de relecture étendue)

L'empreinte de `mesure.schema.json` ne les couvre pas : une nouvelle version qui ne modifie qu'eux
exige une relecture (version différente), mais une relecture d'une version couvre n'importe quelle
valeur de ces champs. `alias` sert à l'appariement (§6) et `verification_fictivite` à la fictivité
(§5) : deux entrées de mesure qui ne sont pas relues comme la formulation.

**Ce qu'il faut faire.** Décision de l'auteur : étendre l'empreinte de relecture ou non.

---

## 2026-10-16 — Lot extraction, PR 3 : `pnpm extraction:entrees`, `pnpm extraire`, lecture illisible (PR #144, #145 : `pipeline/extraction/`, `pipeline/collecte/entrees_extraction.py`)

### ~~1. Une lecture illisible est transmise au cœur comme une chaîne vide, le motif publié est `json_invalide` au lieu de la vraie raison~~ — réglé le même jour par la PR #145 (`SortieModele` typée, `{ lisible: true, texte }` ou `{ lisible: false, raison }`, motif `lecture_illisible` ajouté à `schema/journal-extraction.schema.json`)

`pnpm extraction:entrees` écrit une fiche par source dans `staging/entrees-extraction/`, et `pnpm
extraire` appelle les deux éditeurs sur chaque source. Une réponse HTTP illisible (hors 2xx, sortie
coupée, refus, enveloppe inattendue) était transmise au cœur comme une chaîne vide avant #145.

**Pourquoi ça casse.** Le journal publié donnait une raison fausse (`json_invalide`) à une source
pourtant inaccessible pour une autre cause : un audit du corpus aurait cherché le mauvais défaut.

### ~~2. Un arrêt entre le dépôt des items et celui du journal fait redéposer les mêmes items~~ — réglé le 2026-10-19 par la PR #161 (constat 3 de `docs/revues/2026-10-17.md` ; identifiants tirés persistés dans `staging/identifiants-extraction/`, réutilisés à la relance)

`deposer` écrivait items, mesures, puis le journal, seule garde de reprise : un arrêt entre les deux
puis une relance redéposait les mêmes items sous de nouveaux identifiants.

**Pourquoi ça casse.** Une extraction interrompue deux fois ferait entrer la même position en
double en validation, sans qu'aucun refus ne le signale.

### 3. `pnpm extraire` n'a jamais fait un seul appel réel — *basse*

Les 17 cas limites du brief et les cas de #145 sont couverts sur éditeurs simulés uniquement ; la
PR d'interface qui bloque la promotion d'un item extrait jusqu'à son rattachement (D53 (1)) est
livrée depuis (#146, #147, #150), mais aucune clé d'API n'a encore servi.

**Pourquoi ça casse.** Un défaut propre à un éditeur réel (en-têtes, pagination, format de refus non
couvert par l'éditeur simulé) ne se verra qu'au premier run réel.

**Ce qu'il faut faire.** Au premier `pnpm extraire` sans `--simule` : relire les tentatives en
erreur HTTP de chaque éditeur (même recommandation que DETTE 2026-10-02, lot interrogation, point 1).

---

## 2026-10-16 — Lot extraction, PR 2 : éditeurs des deux extracteurs, rendu du prompt, éditeur simulé (branche `lots/extraction-editeurs` : `pipeline/extraction/editeur*.ts`, `configuration-editeurs.ts`, `prompt.ts`, `config/extraction.json`, `tests/extraction/`)

### 1. La requête Mistral de l'extraction est celle de la reformulation, par import — *moyenne*

`pipeline/extraction/editeur-mistral.ts:adaptateurMistralExtraction` réutilise
`pipeline/reformulation/editeur-mistral.ts:adaptateurMistral` (corps, en-têtes, refus d'une clé
vide), avec les réglages de `config/extraction.json`. Le prompt est lu par
`pipeline/reformulation/prompt.ts:extraireTexteDuPrompt`, dont l'erreur dit « Prompt de
reformulation illisible » même pour le prompt d'extraction (le chemin du fichier est nommé).

**Pourquoi ça casse.** Un paramètre ajouté au corps de la reformulation partirait aussi dans chaque
appel d'extraction, sans qu'aucun test de l'extraction n'échoue s'il n'en vérifie pas le corps
exact ; le test « corps : exactement les réglages envoyés » de `tests/extraction/editeur-mistral.test.ts`
est la seule garde.

**Ce qu'il faut faire.** Si l'une des deux requêtes doit évoluer seule, déplacer la construction
commune dans `pipeline/interrogation/` ou la dédoubler, par une PR qui touche la reformulation. Les
petites règles de validation de la configuration (`modele`, `max_tokens`, `delai_abandon_ms`…) et
l'accès à `choices[0]` sont redéclarés dans `pipeline/extraction/` : `REGLES` et `suivre` de la
reformulation ne sont pas exportés.

### 2. Une clé répétée dans `config/extraction.json` est nommée sans son chemin — *basse*

`premiereCleDupliquee` rend la clé, pas sa position : `temperature : clé répétée`, sans
`extracteurs[1].`. Le refus a lieu, seul le message est moins précis que les autres.

---

## 2026-10-16 — Lot extraction, PR 1 : cœur pur de l'extraction double (branche `lots/extraction-coeur` : `pipeline/extraction/`, `schema/sortie-extraction.schema.json`, `tests/extraction/`)

### ~~1. La mesure d'un item extrait reçoit le libellé du modèle comme formulation canonique, et aucune mesure n'est partagée~~ — réglé le 2026-10-16 par les PR #146, #147 et #150 (verrou de relecture au `pnpm promote`, registre `validation/mesures/relectures.json`, commande `pnpm mesures --rattacher`)

`mesure.schema.json` exige `formulation_canonique`, que le prompt ne demande pas.
`pipeline/extraction/assemblage.ts:formulationProposee` y recopie le libellé proposé. Chaque item
extrait reçoit en outre sa propre mesure de staging : l'interface de validation ne sait ni rattacher
un item à une mesure existante (`mesure_id` n'est pas un chemin corrigeable), ni corriger un libellé
ou une formulation (seul `/theme` passe par le registre).

**Pourquoi ça casse.** `pnpm promote` crée la mesure dans `data/mesures/` telle quelle. La
formulation canonique est le texte substitué dans les gabarits (§5) : un libellé écrit par un modèle
deviendrait le texte des questions, sans relecture humaine. Et deux candidats qui proposent la même
mesure resteraient sur deux mesures : la liste attendue d'une Q-ATT et le drapeau « mauvaise
attribution » seraient faux sans que rien n'échoue.

**Ce qu'il faut faire.** Décision D53 (1) du 2026-10-16 : le dépôt reste tel quel, et une PR
séparée de l'interface de validation bloque la promotion d'un item extrait jusqu'à son
rattachement à une mesure existante ou nouvelle et à la relecture de `formulation_canonique`. La
règle ne vit qu'à un seul endroit, `formulationProposee`.

### ~~2. Trois règles tranchées par D53 ne sont écrites ni au §4 ni dans `docs/CONTRATS.md`~~ — réglé par la PR #148 (protocole 0.17, §4) et `docs/CONTRATS.md` §2

(a) D53 (3) : une citation présente plusieurs fois dans le texte est rejetée (`citation_ambigue`)
et n'entre pas dans l'appariement. (b) D53 (4) : l'extrait minuté d'une source T2 va du début du cue
de son premier point de code à la fin du cue de son dernier, arrondi à la seconde vers l'extérieur,
même à cheval sur plusieurs cues. (c) D53 (2) : une sortie rejetée en entier fait refuser la source.

**Pourquoi ça casse.** Ces règles décident de l'extrait montré à l'annotateur et de ce qui entre en
validation, mais ne vivent aujourd'hui que dans le code et `tests/extraction/` (blocs marqués
« décision D53 »). Une réécriture du §4 qui les omettrait les rendrait invérifiables.

**Ce qu'il faut faire.** Les écrire au §4 avec les points 2 à 4 de D52, et dans `docs/CONTRATS.md`
§2 pour l'extrait.

### 3. Les items O ne sont pas déposés — *moyenne*

Un item O tiré d'une seule source n'a que son état postérieur, alors que `item.schema.json` exige
les deux. L'item retenu d'une paire qui est un O part donc au journal (`portee: "depot"`,
`etat_o_sans_etat_anterieur`), pas dans `staging/`.

**Pourquoi ça casse.** Toute position modifiée déclarée par une source reste hors de la validation,
tant que le rapprochement de l'état antérieur n'existe pas. C'est visible dans le journal, mais le
journal n'est pas encore écrit sur le disque.

**Ce qu'il faut faire.** Au lot qui écrira le rapprochement des deux états : lire ces entrées du
journal.

### 4. La page d'une citation se calcule à deux endroits, en Python et en TypeScript — *basse*

`pipeline/extraction/localisation.ts:pageDe` reproduit `pipeline/collecte/textes/pages.py:page_de`.
`source_de` sait aussi calculer la page quand on lui passe une citation. Le cœur, lui, attend une
source assemblée sans citation et calcule la page seul.

**Pourquoi ça casse.** Si l'on change la règle d'un côté seulement, l'interface et l'extraction
divergent sur la page d'une même citation.

**Ce qu'il faut faire.** À la PR 3, qui obtiendra la source : appeler `source_de` sans citation, et
ajouter un test qui confronte les deux règles sur les mêmes intervalles.

---

## 2026-10-16 — Lot gel, PR 2b à 4 : taux d'échantillon, statuts du run, `run:invalider`, `run:dry --run`, D51 ; dépôts de test sans gc (PR #135, #137, #138 : `pipeline/run/`, `pipeline/interrogation/run-gele.ts`, `pipeline/gel/precedent.ts`, `tests/aides/depot.ts`)

### ~~1. Le taux de l'échantillon humain est encore écrit en dur dans le test contrefactuel~~ — réglé le 2026-10-16 par la branche `qualite/dette-taux-contrefactuel` (constantes de `taux-echantillon.ts` importées par les deux fichiers, ajoutés à `APPELANTS`)

La PR 2b a mis les taux du §7 (10 %, 25 % après retrait d'un juge) dans
`pipeline/notation/taux-echantillon.ts`, lu par le gel et le contrôle croisé. Mais
`pipeline/notation/contrefactuel.ts` (lignes 113, 147, 334) et
`pipeline/notation/publication-contrefactuel.ts` (lignes 89, 122) écrivent encore `0.1` et `0.25`
en littéraux.

**Pourquoi ça casse.** Si un amendement change un taux, seule `taux-echantillon.ts` sera modifiée.
Le contrefactuel continuera d'inscrire l'ancien taux dans `run.json`, et le contrôle croisé refusera
alors le run. La casse est visible, mais elle arrive à la notation d'un vrai run.
`tests/gel/taux-echantillon.test.ts` ne surveille que deux appelants, le gel et le contrôle croisé.

**Ce qu'il faut faire.** Importer les deux constantes dans les deux fichiers et ajouter ceux-ci à
`APPELANTS` dans le test. C'est une petite PR, à faire avant le run pilote.

### 2. `lireRunGele` mêle la lecture du gel et la garde propre au simulé — *basse*

`pipeline/interrogation/run-gele.ts:lireRunGele` commence par `exigerHorsDeRuns`, qui refuse tout
répertoire sous `runs/`. Or c'est exactement là que `run:live` lira le vrai run. Le seul écrivain
de `en_cours` est donc, aujourd'hui, le chemin simulé.

**Pourquoi ça casse.** Si `run:live` réutilise `lireRunGele` tel quel, il est refusé sur tout vrai
run : ça se voit tout de suite. S'il écrit sa propre lecture pour contourner ce refus, il risque de
sauter la vérification des empreintes, ou `inscrireDemarrage`. Le run serait alors interrogé au
statut `planifie`, ou sur un tirage non vérifié, sans qu'aucun test ne le signale.

**Ce qu'il faut faire.** À l'écriture de `run:live`, sortir `exigerHorsDeRuns` de `lireRunGele` et
le laisser à `outils/run-dry.ts`. Ajouter un test qui vérifie que `run:live` passe par la même
vérification et par la même transition.

---

## 2026-10-15 — Mesures validées, garde de `data/mesures`, lot reformulation, D38 à D43 (PR #118, #120, #122 à #124 : `validation/io/`, `pipeline/reformulation/`, `validation/serveur/formulations.ts`)

### ~~1. La liste des noms interdits dans une Q-ATT est construite à deux endroits~~ — réglé le 2026-10-16 par la branche `qualite/dette-reformulation` (`nomsCherchesEnAttribution` dans `pipeline/questions/libelles.ts`, lue par `controle.ts` et `symetrie.ts` ; équivalence testée dans `tests/questions/noms-en-attribution.test.ts`)

`nomsInterdits` (`pipeline/reformulation/controle.ts`) et `libellesDuPerimetre`
(`pipeline/questions/symetrie.ts`) assemblent chacune `candidat_id`, `libelle` et `nom` du périmètre.
Le commentaire du premier dit qu'il doit rester identique au second ; aucun test ne compare les deux.

**Pourquoi ça casse.** Si la barrière de symétrie apprend à chercher un nom de plus (un alias, un nom
d'usage), le contrôle de la reformulation accepte des formulations familières et orientées qu'elle
refusera ensuite : relues pour rien, puis le gel est bloqué la veille du run. Visible, mais tard.

**Ce qu'il faut faire.** Exporter une seule fonction depuis `libelles.ts`, lue par les deux, au
prochain passage sur l'un des deux fichiers.

### ~~2. `pnpm reformuler` n'a aucun délai d'abandon, et un échec de transport sort à 0~~ — réglé le 2026-10-16 par la branche `qualite/dette-reformulation` (`delai_abandon_ms` dans `config/reformulation.json`, lu par `executer.ts` ; code de sortie 2 dans `commande.ts`)

`executer.ts` passe à `fetch` un `AbortController` jamais déclenché ; un échec de transport est
signalé dans le bilan, mais `process.exitCode` reste 0.

**Pourquoi ça casse.** Un appel Mistral qui ne répond pas fige la commande sans fin ; un lot à moitié
échoué paraît réussi à qui ne lit que le code de sortie. Les questions manquantes se découvrent au gel
(`FormulationsEnDefautAuGel`), jamais en silence.

**Ce qu'il faut faire.** Avant le premier appel réel : un délai fixe, et un code de sortie non nul
dès qu'une question n'a reçu aucune réponse.

### 3. `tests/notation/chaine.test.ts` a bloqué environ 16 minutes, deux fois, sans cause trouvée — *basse*

Une fois chez un agent, une fois dans la session principale, pendant le lot reformulation. Relancé
seul puis dans la suite, il passe en 38 à 57 s. Non reproduit.

**Pourquoi ça casse.** Un blocage en CI retient une PR jusqu'au délai du job ; si sa cause est un
ordre ou une course réels dans la chaîne de notation, il réapparaîtra pendant un run.

**Ce qu'il faut faire.** À la prochaine occurrence, relever le processus bloqué (`ps`, trace de
vitest) avant de relancer.

---

## 2026-10-12 (après-midi) — Contraction « à le », « à les » au remplissage des gabarits, D35 (4) (PR #111 : `pipeline/questions/gabarits.ts`)

### ~~1. La mesure contractée n'existe que dans le texte rempli, et le contrôle de la reformulation devra la retrouver~~ — réglé le 2026-10-15 par la PR #122 (`formesAdmisesDeMesure` et `mesureFigureSousFormeAdmise` dans `gabarits.ts`, lues par `controle.ts`)

`remplirTexteNeutre` applique la contraction en interne (`joindreMesure`, non exportée) et ne rend que
la question entière. D35 (4) exige que le contrôle de la reformulation, encore à écrire, compare la
recopie à la mesure **contractée** (« au budget »), pas à `formulation_canonique` (« le budget »).

**Pourquoi ça casse.** Si le contrôle lit `formulation_canonique`, les formulations familière et
orientée correctes d'une Q-NEG en « le »/« les » sont rejetées : deux registres sur trois perdus pour
ces mesures, visible au rejet. S'il réécrit la contraction de son côté, la règle vit à deux endroits
et peut diverger sans qu'aucun test ne le voie.

**Ce qu'il faut faire.** En écrivant le contrôle, exporter de `gabarits.ts` une fonction qui rend la
mesure telle qu'elle est écrite dans le gabarit, et la faire lire par le contrôle et par
`remplirTexteNeutre`. Un test : Q-NEG + « le budget » accepte « au budget », refuse « le budget ».

### 2. Une mesure en « Le »/« Les » derrière « à » bloque l'engendrement de ses questions — *basse*

`ArticleMajusculeApresA` est levée au remplissage, donc à l'engendrement des questions du run, pas à
la validation de la mesure (`schema/mesure.schema.json` n'a aucun motif sur `formulation_canonique`).

**Pourquoi ça casse.** Une faute de saisie validée des semaines plus tôt se découvre la veille d'un
run, et arrête l'engendrement de toute la batterie. Erreur visible, mais tardive.

**Ce qu'il faut faire.** Faire contrôler la même règle par `pnpm check` sur `data/mesures/`, ou par
l'interface de validation à la saisie, quand la première mesure y entre.

### 3. « LE … » en capitales et un « le » suivi d'une espace insécable passent sans contraction ni erreur — *basse*

Le déclencheur suit la décision à la lettre : `/^le /`, `/^les /`, `/^Les? /`, espace ASCII.

**Pourquoi ça casse.** La question neutre part avec « à LE … » ou « à le … » (insécable), sans
alerte. La formulation est unique pour tous les candidats (§5), la symétrie tient ; seule la question
est fautive.

**Ce qu'il faut faire.** Rien tant qu'aucune mesure ne s'écrit ainsi ; le point 2 réglé, étendre la
règle si l'auteur le souhaite.

---

## 2026-10-07 au 2026-10-12 — Test des liens, go/no-go, `pnpm preuve`, charge-juge-v3, refus de l'API, prompts 1.0.0, D20 à D35 (PR #93 à #109 : `pipeline/liens/`, `pipeline/go-no-go/`, `pipeline/notation/`, `notation-humaine/`, `prompts/`, `scratch/prompts/`)

Clôture tardive : les sessions du 7 au 10 octobre n'avaient pas été clôturées, et leurs PR ne
disaient pas ce qui pourrait casser. Le tri ci-dessous repart du diff et du code.

### 1. Le soutien d'une page de plus de 50 000 caractères tombe en « indéterminé » sans compteur publié — *haute*

`pipeline/notation/pages-citees.ts` coupe le texte d'une page citée à `LONGUEUR_MAX_TEXTE_PAGE`
(D27). Le prompt juge 1.0.0 (D34 (1), (2)) rend `indetermine` quand l'affirmation n'est pas dans la
partie transmise, ou quand l'extraction a été refusée. Seul `soutient` compte pour le sourçage valide
du §8, et `analysis/` ne publie aucune répartition des verdicts `indetermine` par cause.

**Pourquoi ça casse.** Un programme en PDF dépasse souvent 50 000 caractères. Un outil qui cite le
programme officiel, la meilleure source possible, voit son sourçage valide baisser chaque fois que
la mesure est au-delà de la coupure. Le lecteur lit un écart de sourçage entre outils qui tient à la
longueur des pages citées, et rien ne le signale.

**Ce qu'il faut faire.** Avant le pilote (J4) : publier par outil et par mode le nombre de soutiens
`indetermine` par cause (page tronquée, extraction refusée, page lue). L'auteur décide s'il faut
aussi relever la borne ou découper la page autour de l'affirmation (amendement : §7, charge).

### ~~2. Le gabarit Q-NEG écrit « à le » et « à les » devant une mesure en « le » ou « les »~~ — réglé le 2026-10-12 par la PR #111 (contraction au remplissage) ; le contrôle de la reformulation sur la mesure contractée reste à écrire (entrée du 2026-10-12 après-midi, point 1)

`pipeline/questions/gabarits.ts:remplirTexteNeutre` substitue `formulation_canonique` telle quelle
dans « s'oppose-t-il ou elle à [mesure] ? ». Défaut antérieur, rendu exigible par le prompt de
reformulation 1.0.0 (PR #104), qui exige la mesure recopiée à l'identique.

**Pourquoi ça casse.** La formulation neutre, que personne ne relit, part aux outils avec une faute.
Les formulations familière et orientée correctes (« au relèvement ») sont rejetées par le contrôle
de recopie : la question perd deux registres sur trois. La perte se voit au rejet.

**Ce qu'il faut faire.** D35 (4) : contracter « à le » en « au » et « à les » en « aux » au
remplissage, et contrôler la reformulation sur la mesure contractée. Tests d'abord. À faire avant
le premier appel du prompt de reformulation.

### ~~3. Le prompt juge validé (D34) ne vit que dans `scratch/`, hors Git~~ — réglé par la PR #121 (`prompts/judge-1.0.0.md`)

`scratch/prompts/judge-1.0.0.md` n'est suivi par aucun commit ; D34 le cite par ce chemin.

**Pourquoi ça casse.** Un nettoyage de `scratch/` perd le texte validé. Il faudrait le réécrire et
le faire revalider, et rien ne prouverait que ce soit le même.

**Ce qu'il faut faire.** L'auteur le recopie dans `prompts/judge-1.0.0.md` (`docs/TACHES-AUTEUR.md`).

---

## 2026-10-06 (soir) — Notation humaine, chaîne de notation simulée, D19 (PR #87 à #91 : `pipeline/notation/`, `notation-humaine/`, `outils/notation-humaine.ts`, `outils/notation-dry.ts`)

### ~~1. L'écran de notation humaine affiche la vue champ par champ, et rien ne garde qu'il montre tout ce que voit le juge~~ — réglé le 2026-10-08 par la PR #94 (`tests/notation-humaine/completude-affichage.test.ts`, `notation-humaine/client/contenu-vue.ts`)

`notation-humaine/client/affichage.ts` rend la `VueAnnotateur` champ par champ, sur des types
recopiés à la main dans `notation-humaine/client/types.ts` : aucun type n'est partagé avec
`pipeline/notation/vue-annotateur.ts`. D18 exige que l'humain voie exactement la charge du juge.

**Pourquoi ça casse.** Un champ ajouté à la charge du juge (une date de validité, un état d'item)
arrive au client et n'y est pas affiché : les humains notent avec moins que les juges, l'accord
juges-humains et le kappa du jeu d'or (J4) baissent ou montent pour une raison qui n'est pas le juge,
et tous les tests restent verts.

**Ce qu'il faut faire.** Un test qui énumère les feuilles d'une `VueAnnotateur` de fixture et vérifie
que chacune est lue par `affichage.ts` (ou une liste explicite des champs volontairement non
affichés), à écrire avant la formation des annotateurs.

### 2. L'avis du juge n'est conservé nulle part, et le forçage de D19 l'efface — *moyenne*

Le port `pipeline/notation/juge.ts` reçoit une `SortieJuge` que seule la notation assemblée garde ;
`soutienApresTestHttp` remplace « soutient » par `non_applicable` sur un lien mort, et le schéma de
notation (`additionalProperties: false`) n'a aucun champ pour l'avis d'origine.

**Pourquoi ça casse.** Un juge qui déclare soutenants des liens morts (signe qu'il invente le contenu
des pages) devient indiscernable d'un juge correct : le taux n'est calculable par personne, ni par
nous ni par un tiers qui voudrait auditer les juges, alors que le §7 promet que tout est renotable.

**Ce qu'il faut faire.** L'auteur choisit (`docs/TACHES-AUTEUR.md`, D19) : champ facultatif
`verdict_soutien_juge` présent seulement en cas de forçage, ou sortie brute des juges dans l'archive
du run.

### 3. `pnpm notation:dry` n'exerce plus de lien existant et soutenant — *basse*

L'éditeur simulé ne cite qu'un lien, devenu mort dans la table du fournisseur simulé (#91) pour
atteindre le cas D19. Le chemin fournisseur → notation → `sourcage_retenu` vrai n'est plus parcouru
de bout en bout ; les tests unitaires de `juge.ts` et `note-retenue.ts` le couvrent.

**Ce qu'il faut faire.** Un second lien dans `pipeline/interrogation/editeur-simule.ts`, existant et
soutenant, au prochain passage sur l'éditeur simulé.

---

## 2026-10-06 — Lot notation, PR B et C, décisions D16 et D17 (PR #81 à #84 : `pipeline/notation/`, `analysis/lecture-run.ts`, `outils/notation-controle.ts`, `schema/run.schema.json`, `schema/notation.schema.json`, `schema/verdict.schema.json`)

### 1. Les mentions résiduelles sont publiées, mais rien ne réagit à leur nombre — *haute*

La PR B compte les mentions de candidat que le remplacement exact laisse en clair (casse
différente) et la PR C les publie dans `run.json#/contrefactuel_candidats/mentions_residuelles`.
C'est la moitié du point 3 de l'entrée du 2026-10-05 : le compte existe, aucune règle ne le lit.

**Pourquoi ça casse.** Un run où le juge voit encore « LE PEN » à côté du nom substitué publie un
taux de changement trop bas, et le go/no-go du §12 le compare à 3 % sans regarder ce compte.

**Ce qu'il faut faire.** Au premier run pilote, lire ce compte. S'il n'est pas nul, l'auteur décide :
élargir les formes déclarées au périmètre, ou faire du compte un critère du go/no-go (amendement).

### 2. `pnpm notation:controle` confond un run invalide et un run illisible — *basse*

Sur un run dont les deux juges sont retirés (D16 (3)), `jugesDuRun` lève et l'outil sort en 2, le
code d'une erreur de lecture.

**Ce qu'il faut faire.** Quand l'outil sera branché sur la chaîne de publication, traiter le run
`invalide` à part (rapport sans contrôle croisé des verdicts, qui n'existent pas).

### 3. Relire un run exige Git et le commit des données gelées — *basse*

`analysis/lecture-run.ts` relit les items par `git show <donnees_commit>:data/items/…`. Un tiers qui
clone en profondeur 1, ou qui n'a que l'archive Zenodo, obtient une erreur nommée.

**Ce qu'il faut faire.** Dire dans le README de publication qu'un clone complet est requis, ou
joindre à l'archive les items au gel avec leurs empreintes.

---

## 2026-10-05 — Décisions D13 à D15 et noyau pur du lot notation (PR #77, #78, #79 : `pipeline/notation/`, `analysis/note-lue.ts`, `schema/notation.schema.json`)

### ~~1. Une seule égalité, tenue par convention, gouverne désormais trois mesures~~ — réglé le 2026-10-06 par la PR #82 (`tests/analysis/egalite-metriques.test.ts`) et la décision D17

`analysis/note-lue.ts:notationsConcordent` définit depuis D14 (3) l'accord des humains (kappa,
recalcul (a)), l'accord des juges (`decision.ts`) et, à la PR B, « la note change » du test
contrefactuel. Ce qu'elle compare (`NoteLue`) est censé être exactement ce que lisent les
métriques primaires de `analysis/metriques.ts` ; seul un commentaire le dit, aucun test ne relie
les deux.

**Pourquoi ça casse.** Qu'une métrique primaire se mette à lire un champ de plus (le motif
d'inexactitude, `au_moins_un_lien_existant`) sans que `NoteLue` suive : deux juges qui divergent
sur ce champ sont déclarés d'accord, aucun humain ne tranche, le taux de changement contrefactuel
sous-estime le biais et un juge qui aurait dû être retiré passe sous les 3 %. Tous les tests
restent verts.

**Ce qu'il faut faire.** Un test qui énumère les champs de notation lus par `metriques.ts` (par
une notation témoin dont on fait varier chaque champ un à un) et exige que `notationsConcordent`
distingue exactement ceux-là. À écrire dans la PR B, avant que le contrefactuel n'en dépende.

### 2. Une citation d'adaptateur réel non ramenée à `{ url, texte }` arrive vide au juge — *haute*

`charge-juge.ts:citationSoumise` ne lit que les clés `url` et `texte` (D15). La projection d'un
adaptateur (`reponse.normalise.citations`) est typée `ObjetJson[]` : rien n'oblige un adaptateur à
produire ces deux clés. L'éditeur simulé n'en produit qu'une (`url`).

**Pourquoi ça casse.** Un adaptateur réel qui laisse `uri`, `title` ou `cited_text` tels quels
remet au juge des citations `{}` : il juge le soutien des sources sans leur texte, le sourçage
valide des notations change, et rien ne le signale, puisqu'un objet vide est une citation
admise.

**Ce qu'il faut faire.** Au premier adaptateur réel, typer la projection des citations en
`{ url?, texte? }` à la frontière de l'adaptateur, et faire lever `construireCharge` sur une
citation qui ne porte ni l'une ni l'autre clé.

### 3. Une mention de candidat hors de la forme déclarée échappe au dérangement — *haute*

`candidats.ts:occurrencesDeNom` cherche le libellé et le nom en casse exacte et en mot entier,
lecture restrictive de D14 (2). « LE PEN », « Mme Le Pen » ou un prénom seul ne sont pas trouvés,
donc ni comptés pour l'éligibilité ni permutés par la PR B.

**Pourquoi ça casse.** Une réponse permutée garde alors une mention du vrai candidat à côté du nom
substitué. Le juge peut s'y raccrocher, la note change moins qu'elle ne le devrait, et le taux de
changement contrefactuel sous-estime le biais du juge sans qu'aucun test ne tombe.

**Ce qu'il faut faire.** Dans la PR B, après permutation, compter les mentions résiduelles sous
une recherche large (casse ignorée), sans rien remplacer de plus, et publier ce compte avec le
résultat du contrefactuel. Si le compte n'est pas nul, c'est à l'auteur de décider s'il faut
élargir les formes déclarées au périmètre.

---

## 2026-10-02 — Lot interrogation en mode simulé, décision D12 (PR #74 et #75 : `pipeline/interrogation/`, `schema/reponse.schema.json`, `outils/run-dry.ts`, `runs/README.md`)

### 1. Un refus de modération mal reconnu par un adaptateur devient une manquante sans signal — *haute*

D12 fait d'un refus de l'API une réponse obtenue, classée non-réponse. C'est l'adaptateur de chaque
éditeur qui le reconnaît, par un statut HTTP et un code d'erreur déclarés en données
(`editeur-simule.ts:REGLES_SIMULE.refus`, `estRefus`). Seul l'éditeur simulé existe : aucune de ces
règles n'a été confrontée à une vraie erreur de modération.

**Pourquoi ça casse.** Si un éditeur renvoie son refus sous un autre code que celui déclaré, le
refus est retenté trois fois puis compté manquant. Le taux de non-réponse de l'outil baisse, son
taux de manquantes monte vers le seuil de 20 % du §8 (« run incomplet »), et aucun test ne tombe :
les tests ne connaissent que les codes que l'adaptateur déclare lui-même.

**Ce qu'il faut faire.** Pour chaque adaptateur réel, un test sur un corps de refus authentique,
archivé depuis la documentation de l'éditeur ou un appel d'essai, avant `run:live`. Au premier run
réel, relire les tentatives en erreur `http` 4xx de chaque outil.

### 2. `brut_octets_sha256` ne prouve rien si le transport réel rend des octets déjà décodés — *moyenne*

L'empreinte des octets reçus est prise sur `ReponseHttp.corps` (`tentatives.ts:empreinteOctets`),
avant toute lecture. Un SDK officiel (D3) décompresse et décode souvent le corps avant de le rendre.

**Pourquoi ça casse.** Branché tel quel, un transport réel ferait hacher un corps reconstruit :
l'empreinte publiée n'est plus celle de ce que l'éditeur a envoyé, et rien ne le signale. Aucun
chiffre publié ne change, mais la preuve d'immuabilité de la règle 7 devient fausse.

**Ce qu'il faut faire.** Au premier adaptateur réel, lire le corps au niveau HTTP (réponse brute du
SDK ou `fetch`), et un test qui compare l'empreinte au SHA-256 d'un corps compressé connu.

### 3. Les tests de délais et de fenêtre ne valent que pour un code synchrone — *moyenne*

`HorlogeVirtuelle` (`horloge.ts`) suppose que le code qu'elle pilote ne fait que des entrées-sorties
synchrones ; c'est écrit dans son contrat, pas vérifié.

**Pourquoi ça casse.** Un transport asynchrone, ou un stockage passé en `fs/promises`, laisse le
temps virtuel immobile pendant une opération en vol : les tests des attentes de 30 s et 120 s, de
l'abandon à 180 s et de la borne de fin de fenêtre restent verts sans plus rien mesurer.

**Ce qu'il faut faire.** Avant le premier transport réel, un test qui fait échouer l'horloge
virtuelle quand une promesse non résolue traverse un pas de temps, ou un `run:live` piloté par
l'horloge système seule.

### 4. Les en-têtes enregistrés gardent leur casse d'envoi — *basse*

`requete.entetes` stocke les noms tels qu'envoyés. Un changement de version de SDK qui change la
casse produit des clés différentes pour le même en-tête d'un run à l'autre ; un lecteur qui compare
deux runs croit voir un en-tête apparaître et un autre disparaître.

**Ce qu'il faut faire.** Décider au premier adaptateur réel : normaliser en minuscules à l'écriture
(ce qui est une transformation, à justifier contre la règle 7), ou documenter la casse dans
`runs/README.md`.

---

## 2026-10-02 — Constats de la conformité du 2026-09-29 soldés côté code, protocole 0.14 et 0.15 (PR #59 à #70 : `analysis/`, `schema/`, `validation/domaine/`, `validation/serveur/routes.ts`, `pipeline/questions/`, `docs/PROTOCOLE.md`)

### 1. Les métriques secondaires acceptent encore le canal application sans marque exploratoire — *haute*

#62 a fermé le canal application aux métriques primaires (`parOutilEtMode` lève, `metriquesApplication`
marque `exploratoire: true`). `repartitionDrapeaux`, `exactitudeParCle` et ses dérivées (par
candidat, thème, gabarit, formulation) prennent toujours toutes les unités qu'on leur donne.

**Pourquoi ça casse.** Si le futur `pnpm analyze` leur passe les unités assemblées sans filtrer le
canal, l'exactitude par candidat publiée mélange API et application. Le chiffre est faux, il ne porte
pas la marque « exploratoire » du §8, et aucun test ne tombe.

**Ce qu'il faut faire.** Faire lever ces fonctions sur une unité du canal application, comme
`parOutilEtMode`, au lot analyse. C'est la même porte que le point 2 du 2026-09-27.

### 2. Une lecture de comparateur n'est pas confrontée à la version de l'item au gel — *haute*

Depuis #66, le run fige `items_p_au_gel` (identifiants seuls), et `metriquesComparateur` vérifie
qu'il y a une lecture par item et par comparateur. `reference_item.item_version` et `item_empreinte`
de la lecture ne sont comparés à rien.

**Pourquoi ça casse.** Un item corrigé entre la lecture et le gel est lu et noté sur son ancien
contenu. La lecture passe tous les contrôles, et l'exactitude du comparateur mesure un contenu que le
run ne retient plus, sans signal.

**Ce qu'il faut faire.** Figer `{id, version, empreinte}` dans `items_p_au_gel` et refuser une
lecture dont la version ou l'empreinte diffère (`LecturesComparateurIncoherentes`). Lot analyse ou
interrogation, avant le premier run avec comparateurs.

### ~~3. La règle du juge retiré est écrite, et rien ne la garde entre verdict, notations et run~~ — réglé le 2026-10-06 par `controle-croise.ts` (#84), exercé de bout en bout sur un retrait par `chaine.ts` (#89, test 3)

La 0.15 (§7, n° 18) écarte les notations du juge retiré et exige une revue humaine de tout drapeau
grave du juge restant. `verdict.schema.json` ne voit qu'un verdict à la fois : il admet
`accord_juges` ou des `notations_sources` du juge retiré dans un run où `run.juges[].retire` est
vrai. Il admet aussi `juge_unique_apres_retrait` sans drapeau alors que la notation du juge restant
porte « fabrication ». `analysis/filtre.ts:assembler` ne lit ni `mode_resolution` ni
`notations_sources`.

**Pourquoi ça casse.** Dans un run où un juge est retiré, environ 75 % des notes peuvent venir du
juge biaisé, ou une fabrication peut sortir sans revue. Toutes les exactitudes du run en dépendent,
et le run reste vert.

**Ce qu'il faut faire.** Écrire au lot notation un contrôle croisé bloquant verdict × notations ×
run. L'auteur doit dire avant si « écartées de tout le run » vaut aussi pour l'accord juges-humains
et le kappa des juges (`docs/TACHES-AUTEUR.md`).

### 4. Le verrou d'un lot terminé n'est imposé que par les deux routes qui l'appellent — *moyenne*

#69 refuse décision et annulation sur un lot terminé (`routes.ts:refuserSiLotTermine`). Rien
d'autre n'empêche d'écrire au journal d'un lot : `JournalAnnotateur.ajouter` n'en sait rien.

**Pourquoi ça casse.** Une future route, ou un outil en ligne de commande qui écrit au journal, peut
changer une décision après le kappa. Le lot repasse au-dessus de 0,80 sans réannotation, ce que la
0.15 interdit. Le journal en garde la trace, mais aucun test ne tombe.

**Ce qu'il faut faire.** Au prochain chemin d'écriture, déplacer le verrou dans la couche qui écrit
au journal, pas dans chaque route.

### 5. La non-évaluabilité par le panel ne se lit pas sur la dernière décision — *basse*

`item.schema.json` (#65) admet l'attestation d'écoute sur un item `non_evaluable` qui porte une
décision `non_evaluabilite` et une décision ayant trouvé l'item vérifié, quel que soit leur rang.
JSON Schema ne sait pas désigner la dernière décision.

**Pourquoi ça casse.** Un fichier de `data/items/` corrigé à la main (non évaluable resté après un
maintien) passe la validation. `pnpm panel` ne produit jamais cet état, et la relecture de la PR qui
toucherait `data/` est le seul garde.

**Ce qu'il faut faire.** Un contrôle TS dans `data-items.ts` (lecture et `reecrireItem`) : statut
`non_evaluable` avec attestation ⇒ dernière décision `non_evaluabilite`.

## 2026-10-01 — Rattrapage de #54, tests manquants, barrière de symétrie (PR #55, #56, #57 : `pipeline/questions/symetrie.ts`, `pipeline/questions/completude.ts`, `outils/symmetry.ts`, `outils/items-au-gel.ts`, `schema/tirage.schema.json`, `tests/`)

### ~~1. Aucune condition de symétrie ne voit une strate remplie au-delà du quota~~ — réglé le 2026-10-01 par #59 (condition bloquante `quota_par_strate_respecte`, décision de l'auteur)

Depuis #57, `repartition_themes` lit le retard sur les totaux **propres** par thème, puis juge les
strates du thème en retard (décision de l'auteur du 2026-10-01). Un candidat qui reçoit deux
questions dans une strate et zéro dans une autre du même thème, sans compensation déclarée, a le
même total propre que les autres : rien n'est jugé. Le test `repartition-themes.test.ts « sans
compensation déclarée, les totaux propres sont égaux »` fige ce comportement.

**Pourquoi ça casse.** Une régression de `tirage.ts`, ou un tirage retouché à la main, qui déplace
une question d'une strate à l'autre au sein d'un thème garde des totaux égaux par thème, par gabarit
à une question près et par candidat. La barrière sort verte, et la répartition thème × gabarit
publiée diffère entre candidats sans que rien ne l'ait signalé.

**Ce qu'il faut faire.** Une condition ou un invariant « aucune strate candidat × thème × gabarit
au-delà de `tirage.parametres.questions_par_strate`, compensations comprises dans leur strate
d'origine ». C'est le quota que le §5 écrit déjà, mais une condition de plus dans `CODES_CONDITION` et `run.schema.json`
se décide avec l'auteur.

### 2. La règle du déficit d'une strate vit à deux endroits — *moyenne*

`symetrie.ts:excesDeCompensation` recalcule le déficit d'une strate, `min(quota, max des tirables
des comparés) − min(quota, ses tirables)`, sans lire `tirage.ts:ciblesDesCompares` et `planifier`.
C'est voulu : la barrière doit attraper un tirage fautif d'où qu'il vienne.

**Pourquoi ça casse.** Un amendement du §5 qui change la cible d'une strate, appliqué dans
`tirage.ts` seul, fait rougir chaque tirage réel qui compense. C'est visible, mais un jour de gel.

**Ce qu'il faut faire.** Tout changement de la règle de compensation touche les deux fonctions, et
le test « les compensations du tirage réel répondent toutes à un déficit » le rappelle. Le citer
dans l'amendement.

### ~~3. `pnpm symmetry` exige `versions.donnees_commit` dès le gel, le schéma du run seulement à la publication~~ — réglé le 2026-10-01 par #59 pour le schéma (obligatoire pour tout run) ; reste le clone complet, à exiger du futur `pnpm run:live`

Depuis #57, `outils/items-au-gel.ts` recoupe `--items` avec le commit `run.versions.donnees_commit`,
et refuse un run qui ne le porte pas. `schema/run.schema.json` ne l'exige que des statuts publiés.
La commande lit aussi l'historique Git local jusqu'à ce commit.

**Pourquoi ça casse.** Un run planifié, conforme à son schéma, est refusé par la barrière le jour du
gel. Un clone superficiel qui ne remonte pas au commit du gel est refusé de même (« commit
introuvable »). Les deux sont visibles, mais ils bloquent le départ d'un run.

**Ce qu'il faut faire.** Exiger `donnees_commit` dans le schéma pour tout run qui a un tirage, avec
un exemple invalide. Le futur `pnpm run:live` doit lancer la barrière depuis un clone complet.

---

## 2026-09-28 — Protocole 0.12 et 0.13, intervalles de l'asymétrie, symétrie et run 0.13, items et sources 0.13 (PR #44 à #50 : `docs/PROTOCOLE.md`, `analysis/`, `pipeline/questions/`, `outils/symmetry.ts`, `schema/`, `pipeline/collecte/source.py`, `validation/`, `outils/mesures.ts`, `outils/lots.ts`, `outils/promote.ts`)

### 1. Un item renvoyé redevient jugé par son ancien lot si le libellé de son entrée d'historique change — *haute*

Depuis #50, `validation/domaine/renvoi-mesure.ts:renvoyeDepuis` reconnaît un item renvoyé après une
correction de thème au préfixe `CHANGEMENT_RENVOI` de l'entrée d'historique, écrite en staging par
`pnpm mesures --renvoyer`. `lotJugeEncore` en dépend, et à travers lui `outils/evaluation-lots.ts`
(promotion) et `outils/lots.ts` (réserve). Les tests fabriquent leurs historiques avec la même
constante.

**Pourquoi ça casse.** Si le libellé change alors que des items renvoyés vivent déjà en staging avec
l'ancien, `renvoyeDepuis` rend faux : l'ancien lot les juge de nouveau, ses deux décisions
concordent (même version d'item), et `pnpm promote` publie des items validés contre l'ancien thème.
La répartition par thème du tirage part de ces items, et aucun test ne tombe.

**Ce qu'il faut faire.** Tenir le libellé pour un format publié : un test qui fige sa valeur
littérale, ou un champ typé dans l'entrée d'historique (`renvoi_depuis_version`) au lieu d'un
préfixe de texte, avec une migration si des items renvoyés existent déjà.

### ~~2. `pnpm symmetry` ne vérifie pas que les items reçus sont ceux du gel~~ — réglé le 2026-10-01 par #57 (`outils/items-au-gel.ts` : `--items` recoupé avec le commit `versions.donnees_commit` du run)

Depuis #49, la barrière refuse un jeu de questions incomplet, mais la référence « questions
engendrées » est recalculée sur les items que l'appelant lui passe. Rien ne compare ces items au
gel du run.

**Pourquoi ça casse.** Un appel avec une partie des items seulement réduit la référence dans la même
proportion : le jeu incomplet paraît complet, et le point 1 du 2026-09-27 revient par une autre
porte. La répartition par thème redevient verte en silence.

**Ce qu'il faut faire.** Au lot qui branchera `pnpm symmetry` sur un vrai run : comparer l'empreinte
des items reçus à celle que le run publie au gel, avec un test sur un sous-ensemble d'items.

### 3. Un run planifié peut encore porter un go/no-go — *basse*

#49 interdit `go_no_go` sur un run invalide, mais `schema/run.schema.json` ne l'interdit pas hors
des statuts publiés.

**Pourquoi ça casse.** Un run planifié qui porte un go/no-go se lit comme décidé avant d'avoir
tourné. Le lecteur du fichier s'en aperçoit, mais aucun contrôle ne l'arrête.

**Ce qu'il faut faire.** Une contrainte `if` sur le statut, avec un exemple invalide.

### 4. `pnpm validate` montre un item renvoyé dans son ancien lot sans le signaler — *basse*

Depuis #50, un item renvoyé reste listé par son ancien lot dans l'interface de validation. Une
décision prise là est enregistrée au journal, mais la promotion ne la lit plus.

**Pourquoi ça casse.** Un annotateur juge pour rien, et le rapport de `pnpm promote` (« renvoyés
en attente, que leur lot ne juge plus ») est le seul endroit où cela se voit.

**Ce qu'il faut faire.** Marquer l'item comme renvoyé dans l'écran du lot, à partir de
`lotJugeEncore`.

---

## 2026-09-27 — Constats moyens et bas de la conformité (PR #38 à #42 : `analysis/`, `pipeline/questions/`, `pipeline/collecte/sources.py`, `validation/domaine/`, `outils/promote.ts`, `schema/`)

### ~~1. La répartition par thème redevient verte en silence si `pnpm symmetry` ne reçoit que les questions tirées~~ — réglé le 2026-09-27 par `JeuDeQuestionsIncomplet` (protocole 0.13 §5, #49) ; reste la provenance des items, point 2 du 2026-09-28

Depuis #41 (n° 23), `repartition_themes` ne passe au rouge que si le candidat en retard avait des
questions tirables pour combler l'écart. Elle les cherche dans les questions passées à
`verifierSymetrie`. L'en-tête de `outils/symmetry.ts` parle des « questions publiées du run », et
rien n'impose que ce soit le jeu engendré complet.

**Pourquoi ça casse.** Avec les seules questions tirées, un candidat en retard n'a jamais de
tirable en réserve : la condition rend `ecart_tolere` pour tout écart, y compris celui d'un tirage
fautif. Le test bloquant du §5 est vert, le run part, et la répartition par thème, déséquilibrée
entre candidats, fausse les comparaisons sans que rien ne le signale.

**Ce qu'il faut faire.** L'auteur écrit au §5, en 0.12, que la barrière reçoit le jeu engendré
complet. Ensuite, `pnpm symmetry` refuse un jeu de questions qui ne contient pas toutes les
questions engendrées au gel (comparer à `tirage.entrees` et `tirage.exclusions`), avec un test.

### 2. Les seuils de l'analyse ne tiennent que si le futur `pnpm analyze` passe par les bonnes portes — *haute*

Depuis #38, les statistiques par candidat et la famille de Holm exigent un partage :
`candidatsComparables(run)` et `couplesComparables(reponses)`. Rien n'empêche un appelant de
fabriquer son propre partage (les tests utilisent `TOUS_COMPARES`), ni d'appeler `corrigerHolm`
directement. Les graines `bootstrap` et `permutation` du run ne sont pas non plus contrôlées
contre le générateur employé (n° 24, côté analyse, #41).

**Pourquoi ça casse.** Un `pnpm analyze` qui passe « tous comparés » publie l'exactitude d'un
candidat sous le seuil et garde un couple incomplet dans la famille de Holm. Toutes les valeurs p
corrigées sont alors fausses, et aucun test ne tombe, puisque les fonctions sont justes.

**Ce qu'il faut faire.** Au lot qui écrira `pnpm analyze` : un seul point d'entrée, qui dérive les
deux partages du run et des réponses et vérifie les graines de l'analyse avec
`GENERATEUR_DU_TIRAGE`, et un test de bout en bout avec un candidat sous le seuil et un couple
incomplet.

### ~~3. Le code applique des règles que le protocole n'écrit pas encore~~ — réglé le 2026-09-27 par les révisions 0.12 et 0.13 (#45, #48) ; la passe de conformité reste due avant le gel (`docs/TACHES-AUTEUR.md`)

#38 à #42 implémentent des lectures tranchées par l'auteur le 2026-09-27 ou proposées par les
sous-agents, en attente de la 0.12 :
- items P comptés s'ils sont tirables au gel ;
- candidats sous le seuil hors de l'exactitude de référence ;
- question d'écoute T2 et arbitrage `transcription_non_verifiee` ;
- jugement par strate du n° 23 ;
- prémisse d'une Q-ACT sur un item O ;
- déclaration datée au plus tard du gel ;
- sondages distincts par URL.

La liste complète est dans `docs/TACHES-AUTEUR.md`.

**Pourquoi ça casse.** Si l'auteur tranche autrement en 0.12, le code mesure selon une règle que
le protocole gelé ne dit pas. Seule une passe de conformité le verrait.

**Ce qu'il faut faire.** Écrire la 0.12, puis refaire la passe de conformité avant le gel du
15 octobre, en vérifiant chacune de ces règles contre le texte.

### ~~4. Une correction de thème bloque la promotion des autres items de la mesure~~ — réglé le 2026-09-28 par `pnpm mesures --renvoyer` (#50)

`validation/domaine/promotion.ts:versionMesurePromue` (#42, n° 69) lève `VersionMesureEcart` pour
tout item vérifié qui épingle une version de mesure dépassée sans correction acceptée dans son
propre dossier. C'est le cas des items des autres candidats quand le thème a été corrigé via un
premier item.

**Pourquoi ça casse.** C'est bruyant, mais toute la promotion s'arrête, et aucun chemin ne permet
d'en sortir tant que l'auteur n'a pas dit ce que deviennent ces items (question dans
`docs/TACHES-AUTEUR.md`).

**Ce qu'il faut faire.** Décision de l'auteur, recommandé : retour en attente et nouvelle
validation. Puis un chemin outillé (par exemple `pnpm lots --revalider-mesure`), testé.

### 5. Le nombre d'exemples de schéma est écrit en dur à cinq endroits — *basse* — à moitié réglé le 2026-10-12 (revue de code, constat 15 du 2026-09-23) : les comptes sont retirés des commentaires de `outils/schemas*` et de `schema/README.md` ; restent trois assertions de compte dans les tests (`tests/schemas.test.ts`, deux, et `tests/questions/invariants.test.ts`)

`outils/schemas.ts`, `outils/schemas/registre.ts`, `schema/README.md`, `tests/schemas.test.ts` et
`tests/questions/invariants.test.ts` répètent le total d'exemples.

**Pourquoi ça casse.** Chaque lot qui ajoute un exemple modifie les cinq fichiers. Deux lots
parallèles entrent donc toujours en conflit : #40 et #41 l'ont fait, et il a fallu additionner à la
main (132 + 5 + 3 = 140).

**Ce qu'il faut faire.** Garder un seul compteur, dans le test qui compare le manifeste au disque,
et retirer les chiffres des commentaires et du README.

---

## 2026-09-25 (clôturée le 2026-09-27) — Protocole 0.9 à 0.11, alignement 0.9, textes hors Git, kappa publié, contestation et notification (PR #28 à #35 : `docs/PROTOCOLE.md`, `pipeline/questions/`, `analysis/`, `validation/`, `outils/`, `pipeline/notification/`, `.gitignore`)

### ~~1. Le seuil de 20 % se calcule encore par outil, alors que la 0.11 le calcule par outil et par mode~~ — réglé le 2026-09-27 par `couplesComparables`, `corrigerFamilleAsymetrie` et les motifs de kappa indéfini (conformité n° 80, 82, 84, #38)

`analysis/seuils.ts:partReponsesManquantes` filtre les réponses du run sur `outil_id` seul. Depuis
la 0.11 (n° 84), le §8 et le §12 appliquent le seuil par outil et par mode, sur le canal API. Deux
autres règles de la même révision attendent aussi le code : `kappa_juge_humain` pouvant valoir
`null` dans `run.schema.json` (n° 80), et la famille de Holm sur les couples outil × mode (n° 82).

**Pourquoi ça casse.** Un outil avec 30 % de réponses manquantes dans un mode et 5 % dans l'autre
passe à 17,5 % et entre dans les comparaisons, alors que le protocole exclut son premier mode.
Aucun test n'échoue : les tests actuels encodent la règle d'avant la 0.11.

**Ce qu'il faut faire.** Aligner `analysis/seuils.ts` et `run.schema.json` avant le premier run,
avec un test à deux modes déséquilibrés. Le rapport de conformité les marque « code à aligner » et
non « ouvert » : les relire en même temps que les constats ouverts.

### 2. Les textes canoniques et les transcriptions n'existent plus que sur la machine qui les a produits — *moyenne*

Depuis #31, `staging/textes/*.txt` et `staging/transcriptions/*.vtt` sont hors Git, comme
`archives/`. Les fiches `.json` et les empreintes restent versionnées. Le travail se fait sur deux
machines.

**Pourquoi ça casse.** Un item extrait sur une machine ne peut pas être validé sur l'autre :
`lireTexteCanonique` ne trouve pas le texte ou refuse son empreinte (409). C'est visible, mais un
texte perdu ne se régénère pas toujours. Un PDF se réextrait depuis son archive, mais une
transcription T2 ne se reproduit pas à l'octet près (§9), et les citations qui s'y appuient perdent
alors la base de leur test verbatim.

**Ce qu'il faut faire.** À décider par l'auteur avant la première collecte réelle : où vit la copie
de référence des textes et des transcriptions (Zenodo en accès restreint, sauvegarde chiffrée), et
comment on synchronise les deux machines.

### 3. Le journal des envois n'empêche un double courriel que sur la machine qui l'a écrit — *basse*

`pnpm notifier` tient son idempotence de `validation/notifications/envois.jsonl`, un fichier
versionné et lu localement.

**Pourquoi ça casse.** Si un envoi réel part d'une machine et que le journal n'est pas poussé avant
une exécution sur l'autre, la même campagne reçoit deux fois le même courriel. Aucune mesure n'est
faussée, mais c'est gênant vis-à-vis d'un interlocuteur que le §4 veut traiter avec rigueur.

**Ce qu'il faut faire.** N'envoyer que depuis une seule machine, ou faire refuser `--envoyer`
tant que la branche est en retard sur `origin`. Choix de l'auteur.

### 4. Les clés de quota de `config/perimetre.yaml` n'ont aucun lecteur, et deux noms circulent — *basse*

Le tirage lit `ParametresTirage.questions_par_strate` et `questions_attribution_par_theme`
(`pipeline/questions/tirage.ts`). Le fichier de périmètre porte `tirage.quota_par_strate`, et les
PR #28 et #30 demandent à l'auteur d'ajouter `quota_attribution_par_theme`. Aucun code ne charge
encore ces paramètres depuis le YAML.

**Pourquoi ça casse.** Le premier chargeur écrit trouvera des noms qui ne correspondent pas. C'est
bruyant si la clé est obligatoire, mais une valeur saisie sous un nom que personne ne lit se perd.

**Ce qu'il faut faire.** Au lot interrogation : choisir un nom par paramètre, écrire le chargeur, et
ajouter un test d'accord entre `config/perimetre.yaml` et `ParametresTirage`.

---

## 2026-09-25 — Protocole 0.8 et conformité n° 9 : le kappa lit la contestation au calcul (`validation/domaine/analyse-lot.ts`, `docs/PROTOCOLE.md` 0.8)

### 1. Un item du lot absent du staging sort du kappa sans signal — *moyenne*

`analyse-lot.ts:apparier` écarte sans bruit un item du lot qu'il ne trouve plus dans `staging/`
(promu puis retiré, renommé). Son statut de contestation n'est alors pas lisible, et il sort du
dénominateur sans être compté parmi les exclus.

**Pourquoi ça casse.** L'effectif `n` publié avec le kappa baisse sans explication, et un lot dont
plusieurs items ont quitté le staging peut voir son kappa calculé sur un effectif trop faible pour
décider du §12, sans que rien ne le dise.

**Ce qu'il faut faire.** Compter ces items à part dans le diagnostic (`absents_du_staging`), ou lire
leur statut dans `data/` quand ils y ont été promus. Décision d'implémentation, pas de protocole.

### ~~2. Un item arbitré reste hors du kappa de son lot pour toujours~~ — réglé le 2026-09-25 par `exclus_contestation` publié dans `validation/diagnostics/` (`pnpm diagnostics`, #33)

Décision du 2026-09-25 : une contestation close sort aussi l'item du dénominateur. Un item maintenu
ou corrigé par le panel n'y revient jamais, même s'il est ensuite tiré.

**Pourquoi ça casse.** Si les contestations se concentrent sur des items difficiles, le kappa publié
porte sur les items les plus consensuels et surestime l'accord. C'est un choix assumé, mais il faudra
le lire ainsi au §12.

**Ce qu'il faut faire.** Publier avec le kappa le nombre d'items exclus pour contestation (déjà dans
le diagnostic, `exclus_contestation`) dans le fichier publié du constat 16.

---

## 2026-09-25 — Conformité, lot validation : lots pleins seulement, numérotation continue (`validation/domaine/lot.ts`, `validation/io/lots-fichier.ts`, `outils/lots.ts`, `validation/domaine/analyse-lot.ts`)

### 1. Un lot de taille non conforme n'est signalé que dans la réponse de la route — *moyenne*

`diagnostiquerLot` porte désormais `taille_lot`, `taille_attendue` et `taille_conforme`, mais le
client (`validation/client/app.ts:bilanKappa`) ne les lit pas, et aucun fichier publié ne porte le
kappa d'un lot (conformité n° 16).

**Pourquoi ça casse.** Un lot écrit avant cette correction, ou composé à la main, voit son kappa
affiché et, demain, publié comme celui d'un lot de 50. S'il fait partie des « deux derniers lots »
du §12, il décide du jalon J3 sans que personne n'ait vu la mention.

**Ce qu'il faut faire.** Au lot des constats client : afficher la mention de taille. Au lot du
constat 16 : reprendre les trois champs dans le fichier publié et exclure un lot non conforme des
« deux derniers lots ».

### 2. La numérotation lit `lot_id`, pas le nom du fichier — *basse*

`numeroterLots` reprend après le plus grand `lot_id` du préfixe. Un manifeste renommé à la main,
dont le nom de fichier ne correspond plus à son `lot_id`, fausse le calcul ; la vérification des
chemins de `ecrireLots` bloque tout écrasement, mais l'échec surprend.

**Pourquoi ça casse.** `pnpm lots --ecrire` refuse d'écrire sans que la cause saute aux yeux.

**Ce qu'il faut faire.** Rien tant que les manifestes ne sont écrits que par `pnpm lots`. Un test
d'accord nom de fichier ↔ `lot_id` dans `lireLots` le jour où un autre outil en écrit.

---

## 2026-09-24 — Conformité, lot analyse : réponses obtenues, comparateurs, graines, recalcul (a) (`analysis/`, `schema/notation`, `schema/verdict`, `schema/run`, `docs/PROTOCOLE.md` 0.7)

### 1. Le futur lot notation doit construire le verdict avec les fonctions de l'analyse — *haute*

Le recalcul (a) dérive le sourçage d'une notation humaine par `robustesse.ts:sourcageDeNotation` (un
même lien qui existe et soutient) et décide de l'accord des deux humains par l'identité complète de
leurs notations. Le calcul principal, lui, lit `verdict.sourcage_retenu` et `categorie_retenue`,
que le lot notation écrira.

**Pourquoi ça casse.** Si le lot notation dérive le sourçage ou l'accord autrement (booléens pris
sur deux liens différents, accord sur la seule catégorie), le calcul principal et le recalcul (a)
ne mesurent plus la même chose : des résultats seront déclarés fragiles ou robustes à tort, sans
qu'aucun test ne rougisse.

**Ce qu'il faut faire.** Au lot notation : construire `sourcage_retenu` avec `sourcageDeNotation`
et décider de l'appel au troisième humain avec la même définition de l'accord, exportée d'un seul
endroit ; test d'accord entre verdict construit et recalcul (a) sur une même réponse.

### 2. Changer la composition d'une clé déplace des bornes publiées — *moyenne*

La graine de chaque intervalle dépend de sa clé (famille, outil, mode, métrique, strate ;
`PaireCondition.cle` ; `outil_id` pour la tendance). Renommer une métrique ou réordonner les
composants change la graine, donc les bornes.

**Pourquoi ça casse.** Un run déjà publié, rejoué avec un code où une clé a changé, donne d'autres
bornes. Visible au rejeu, mais un tiers conclura à une erreur.

**Ce qu'il faut faire.** Au lot qui écrit `pnpm analyze` : publier la clé de chaque intervalle avec
son résultat, et figer la liste des clés d'un run par un fichier doré.

### 3. L'accord humain par identité complète multipliera les arbitrages — *basse*

Deux humains d'accord sur la catégorie mais pas sur un drapeau ou un booléen de sourçage divergent,
et le recalcul (a) exige alors un troisième humain (`DivergenceSansArbitrage` sinon).

**Pourquoi ça casse.** Le volume d'arbitrages sur l'échantillon de 10 % sera plus élevé que ce que
suggère le kappa sur la catégorie : si le lot hors-code ne prévoit pas ce temps d'annotation, le
recalcul (a) ne se calcule pas au premier run.

**Ce qu'il faut faire.** Estimer le taux de divergence complète sur le jeu d'or (J4) et dimensionner
le temps d'annotation en conséquence.

---

## 2026-09-24 — Conformité, lot tirage : attribution résolue au gel, noms des candidats (`pipeline/questions/`, `schema/run.schema.json`, `docs/PROTOCOLE.md` 0.6)

### 1. Un item P resté ouvert à côté de l'item O qui le remplace bloque tous les runs — *moyenne*

`reponse-attendue.ts:listeAttendueAuGel` lève `PositionsContradictoires` quand un candidat interrogé
porte au gel deux positions incompatibles sur une mesure. C'est le cas dès qu'un item O remplace un
item P sans que `valide_au` du P ait été fermé.

**Pourquoi ça casse.** L'erreur est levée par la règle de tirabilité, avant la graine : un seul oubli
de date dans `data/` arrête le tirage entier, pour toutes les mesures. C'est bruyant, mais tardif.

**Ce qu'il faut faire.** Ajouter l'invariant « un candidat n'a qu'une position en vigueur par mesure »
à `pnpm symmetry` et à la promotion, pour qu'il se voie au moment où l'item O entre dans `data/`.

### 2. La liste d'attribution dépend de `interroge`, que rien ne recoupe — *moyenne*

La liste attendue d'une Q-ATT et sa tirabilité ne lisent que les candidats avec `interroge = true`
dans `run.perimetre.candidats[]`. Un appelant qui construit le périmètre à la main, ou un run où
`interroge` est mal renseigné, raccourcit la liste sans signal.

**Pourquoi ça casse.** Un candidat interrogé marqué `false` par erreur sort de toutes les listes
attendues : un outil qui le cite à juste titre est noté en fabrication ou en mauvaise attribution.

**Ce qu'il faut faire.** Au lot qui écrira le run à partir de `config/perimetre.yaml` : dériver
`interroge` de `statut_au_gel`, jamais saisi deux fois, avec un test d'accord.

### ~~3. Une Q-ATT non tirable disparaît du rapport de tirage sans être comptée~~ — réglé le 2026-09-25 par `tirage.exclusions` et le motif `reponse_attendue_indecidable` (conformité n° 36, #30)

Comme les items contestés, les Q-ATT écartées parce qu'un candidat est « conditionnel » ou
« sans_objet » au gel ne sont comptées nulle part dans `RapportTirage`.

**Pourquoi ça casse.** Si beaucoup de mesures ont un candidat conditionnel, la part des Q-ATT fond
sans que le rapport du run le dise, et la comparaison entre gabarits (§8) perd sa base.

**Ce qu'il faut faire.** Compter les questions écartées par motif dans le rapport de tirage (rejoint
le constat de conformité n° 36).

---

## 2026-09-24 — Lot collecte, sous-lot C3 : audio, vidéo, transcription locale (`pipeline/collecte/media.py`, `pipeline/collecte/transcription/`, `pipeline/collecte/textes/transcription_vtt.py`, `schema/transcription.schema.json`, `docs/CONTRATS.md` §2, `docs/PROTOCOLE.md` 0.5)

### 1. Un média est lu entier en mémoire avant d'être archivé — *moyenne*

`Telechargement.corps` porte les octets du média, comme pour un PDF. Un débat de deux heures en
vidéo pèse 1 à 2 Go, autant en mémoire vive, plus la copie de l'empreinte.

**Pourquoi ça casse.** La collecte d'une longue vidéo échoue par manque de mémoire, ou fait échouer
les autres sources du même passage. C'est visible, mais seulement au premier vrai débat collecté.

**Ce qu'il faut faire.** Avant la première collecte de sources T2 longues : laisser yt-dlp écrire
dans un fichier temporaire sous `archives/`, calculer l'empreinte en flux, puis renommer.

### 2. Un seul « & » ou « < » dans un segment fait refuser toute la transcription d'un média — *basse*

`webvtt.py` refuse ces caractères, parce que l'analyseur TypeScript (`validation/domaine/webvtt.ts`)
n'interprète pas les entités : les échapper donnerait deux textes dérivés différents, donc deux jeux
d'offsets.

**Pourquoi ça casse.** Un orateur qui cite « A & B » ou un chiffre avec « < » rend la source entière
intranscriptible. L'erreur est nommée, mais la source T2 est perdue tant que la règle ne change pas.

**Ce qu'il faut faire.** Au premier cas réel : échapper à l'écriture, déséchapper dans les deux
analyseurs en même temps, passer la règle en `vtt-2`. Les `.vtt` déjà produits en `vtt-1` restent.

### 3. yt-dlp est épinglé, les plateformes ne le sont pas — *moyenne*

`yt-dlp==2026.8.19`. YouTube et les autres plateformes changent régulièrement leurs formats et leurs
protections ; yt-dlp publie des correctifs en conséquence, souvent plusieurs fois par mois.

**Pourquoi ça casse.** Une source vidéo ressort « sans format admissible » ou en erreur de
téléchargement. C'est bruyant. Mais une montée de version de yt-dlp peut aussi changer le format
retenu, donc les octets et l'empreinte d'un média recollecté.

**Ce qu'il faut faire.** Monter yt-dlp par un commit dédié quand une collecte échoue, jamais en
passant. Les médias déjà archivés ne sont pas recollectés (non-réécriture de C1).

### ~~4. Les transcriptions des sources `interne` partent dans Git~~ — réglé le 2026-09-25 : plus aucune transcription intégrale n'est versionnée (conformité n° 31, #31)

Même cause que le point 2 de C2 (textes) : `staging/transcriptions/` est versionné et ne lit pas
`publication`. Le §10 publie « la transcription de l'extrait », pas la transcription intégrale.

**Pourquoi ça casse.** Le dépôt est public : la transcription intégrale d'un enregistrement T2 est
publiée dès son commit.

**Ce qu'il faut faire.** À trancher par l'auteur avec le point 2 de C2, avant la première collecte
réelle d'une source `interne`.

---

## 2026-09-24 — Lot 4 de la revue : listes du protocole confrontées aux schémas, règles écrites une fois (`analysis/types.ts`, `pipeline/questions/`, `validation/domaine/types.ts`, `validation/client/types.ts`, `tests/enumerations-schemas.test.ts`)

### 1. La symétrie lit `nomme_candidat` dans la table de gabarits courante, pas dans celle du tirage — *moyenne*

`symetrie.ts` reconnaît les questions d'attribution par `gabaritParCode(entree.gabarit).nomme_candidat`.
`gabaritParCode` lit la table chargée par `gabarits.ts` (`VERSION_FICHIER`), pas la version
`version_gabarits` portée par les questions du tirage contrôlé.

**Pourquoi ça casse.** Une version 1.1.0 des gabarits qui change `nomme_candidat` d'un gabarit fait
changer le verdict de `pnpm symmetry` rejoué sur un tirage déjà gelé et publié en 1.0.0. Le tiers
qui vérifie (§9) obtient un autre résultat que l'auteur, sans qu'aucun chiffre du tirage ait bougé.

**Ce qu'il faut faire.** Au lot qui introduira une deuxième version des gabarits : charger la table
par `version_gabarits` de la question, et refuser une version inconnue. Rien avant.

### 2. Trois copies de listes fermées restent privées, donc hors du test d'accord — *basse*

`analysis/conditions.ts:39` (`MODES`, typée `readonly Mode[]`, peut être un sous-ensemble sans que
rien ne le voie), `validation/io/lots-fichier.ts:13` (`NATURES_CONNUES`),
`pipeline/questions/contestation.ts:60` (`REINTEGRATION_PAR_DECISION`, table fermée sur
`decision_panel.decision`). Les clés de grille `CleGrille` et `CleSpecifique` sont des noms de
propriétés de `decision.schema.json`, pas des `enum`, et ne sont pas confrontées non plus.

**Pourquoi ça casse.** Un mode ou une nature de lot ajoutés au schéma par amendement passent le test
d'accord (les listes publiques sont à jour) mais restent refusés ou ignorés par ces copies privées.

**Ce qu'il faut faire.** Remplacer les deux premières par les constantes exportées (`MODES`,
`NATURES_LOT`), exporter la table de réintégration et l'ajouter au test, étendre le test aux clés de
propriétés de la grille. Un petit lot, sans changement de comportement.

---

## 2026-09-24 — Lot 3 de la revue : validation de schéma à l'exécution, barrière de symétrie complète (`outils/schemas/valider.ts`, `validation/io/`, `validation/serveur/routes.ts`, `outils/promote.ts`, `outils/symmetry.ts`)

### 1. Une évolution de schéma sans migration des données arrête l'interface, la promotion et la barrière — *moyenne*

`valider()` est désormais appelé à chaque lecture de `staging/items`, `staging/mesures`, des
journaux et du registre des mesures. Un seul fichier non conforme interrompt le chargement entier
(`chargerStaging`, `analyser()` du journal), y compris pour les items qui n'ont rien à voir.

**Pourquoi ça casse.** Un amendement qui resserre `item.schema.json` ou `decision.schema.json`
(un champ devenu obligatoire, une énumération réduite) rend illisibles des journaux append-only
déjà écrits et publiés, qu'on n'a pas le droit de réécrire (`docs/CONTRATS.md` §4). L'interface
ne démarre plus, `pnpm promote` et `pnpm symmetry` sortent en erreur. C'est bruyant, mais la
réparation suppose une règle de versionnement des schémas qui n'existe pas.

**Ce qu'il faut faire.** Avant tout amendement qui touche un schéma lu à l'exécution : décider
(auteur) si les objets portent la version de schéma qui les a validés, ou si un amendement
n'a le droit que d'élargir. Aucun code tant que le premier amendement de ce type n'est pas sur la table.

### ~~2. `pnpm symmetry --mesures` attend un tableau JSON que rien ne produit~~ — réglé le 2026-10-15 par le lot mesures-validees

`--items` lit maintenant `data/items/`, un fichier par item. `--mesures` est obligatoire mais
reste un tableau JSON, alors que `staging/mesures/` range un fichier par mesure et que `data/`
n'a pas encore de mesures validées.

**Pourquoi ça casse.** Au premier run, quelqu'un assemblera le tableau à la main pour franchir
la barrière. Un tableau incomplet (une mesure oubliée) fait lever l'invariant « item F ⇒ mesure
fictive » sur un item qui est pourtant correct, ou pire, un tableau assemblé depuis `staging/`
contrôle des mesures non validées.

**Ce qu'il faut faire.** Au lot qui fixera où vivent les mesures validées : lire ce répertoire
comme pour les items, avec le même test « répertoire vide ⇒ code 1 ».

### 3. Trois fabriques de test restent non conformes à leur schéma, faute d'avoir franchi une frontière — *basse*

`tests/aides/fabriques.ts` : `itemO()` a une source T2 sans `extrait` ni
`transcription_verifiee_*` ; `mesure({ fictive: true })` n'a ni `origine_fictive` ni
`verification_fictivite`. `tests/questions/fabriques.ts` : les items « verifie » ont
`validations: []` et `historique: []`, `mesure()` n'a pas d'historique.

**Pourquoi ça casse.** Le premier test qui fera passer l'une d'elles par `valider()` échouera sur
un champ sans rapport avec ce qu'il vise, et son auteur croira la règle fausse.

**Ce qu'il faut faire.** Les rendre conformes dans le lot qui les fera passer par une frontière,
avec un test « la fabrique produit un objet conforme » comme celui de `tests/symmetry-cli.test.ts`.

### 4. Deux textes affirment que le registre des mesures n'a pas de validation de schéma — *basse*

La `description` de `schema/decision-mesure.schema.json` dit que `validerEntreeRegistre()`
« reste la frontière d'exécution », la docstring de `validation/domaine/corrections-mesure.ts`
que « le registre n'a pas de JSON Schema ». Les deux sont faux depuis ce lot.

**Pourquoi ça casse.** Un contributeur qui les croit retire l'appel à `valider()` comme redondant,
ou ajoute une troisième garde.

**Ce qu'il faut faire.** Corriger les deux textes au prochain lot qui touche ces fichiers.

---

## 2026-09-23 — Lot collecte, sous-lot C2 : texte canonique PDF et HTML (`pipeline/collecte/textes/`, `pipeline/collecte/source.py`, `schema/extraction-texte.schema.json`, `docs/CONTRATS.md` §1, `.gitattributes`)

### ~~1. Plusieurs textes d'un même document coexistent sans règle qui désigne celui à extraire~~ — réglé le 2026-10-16 par la branche `lots/extraction-coeur` (décision D52 (4) : `pipeline/extraction/choix-texte.ts:choisirFiche` retient la seule fiche de l'extracteur épinglé par l'appelant, outil, version et options comparés en entier ; aucune ou plusieurs : refus nommé, sans repli ; un item validé reste attaché à son texte et à ses offsets)

Le texte est rangé sous sa propre empreinte (`staging/textes/<texte_sha256>.txt`) et chaque
extraction ajoute une fiche `staging/extractions/<sha256_source>/<texte_sha256>.json`. Une montée de
version de pymupdf, ou une nouvelle règle HTML (`REGLE = "blocs-2"`), fait apparaître un second texte
du même PDF à côté du premier. `source_de` exige qu'on lui nomme le texte ; rien ne dit lequel.

**Pourquoi ça casse.** Le lot extraction lira le répertoire de fiches. S'il en prend une au hasard
(ordre du système de fichiers), deux passages produisent des items rattachés à deux textes
différents du même document. Chaque item reste juste (ses offsets suivent son `texte_sha256`), mais
les doublons d'item et les déduplications ratées se voient seulement à la validation humaine.

**Ce qu'il faut faire.** Au lot extraction : règle écrite « le texte produit par l'extracteur en
service (version épinglée dans `uv.lock`, `REGLE` courante) », avec un test à deux fiches. À
l'auteur : dire si une réextraction invalide les items déjà validés sur l'ancien texte.

### ~~2. Les textes des sources `publication = "interne"` partent dans Git~~ — réglé le 2026-09-25 : plus aucun texte canonique n'est versionné (conformité n° 31, #31)

`staging/textes/` est versionné, comme `staging/sources/`. Le texte canonique d'une source que la
liste marque `interne` (§10, droit d'auteur) y est écrit intégralement, sans distinction : C2 ne lit
pas la fiche de source, seulement le manifeste de contenu.

**Pourquoi ça casse.** Le jour où le dépôt devient public (§9, publication intégrale), il publie des
textes que la liste avait justement exclus de la publication. Aucun test ne rougit : rien ne vérifie
qu'un fichier de `staging/textes/` provient d'une source publique.

**Ce qu'il faut faire.** À décider par l'auteur avant la première collecte réelle : ignorer ces
textes dans Git (et les verser à l'archive Zenodo seulement si §10 l'autorise), ou les garder hors
de `staging/`. Puis un test qui croise fiches de source et textes versionnés.

### 3. Un PDF servi sans `Content-Type` exact est refusé — *basse*

Le type se lit dans `type_contenu_recu`, jamais dans les octets (`docs/CONTRATS.md` §1.4). Un
serveur qui sert un programme en `application/octet-stream`, ou sans en-tête, le fait refuser.

**Pourquoi ça casse.** La source n'a pas de texte et ne peut porter aucun item. C'est visible : ligne
« REFUSÉ » au rapport de `pnpm textes`, code de sortie 1. Le coût est un aller-retour manuel.

**Ce qu'il faut faire.** Si le cas se présente en collecte réelle, l'auteur tranche entre une
exception déclarée dans `config/sources.toml` (type attendu par source) et la lecture de la signature
`%PDF-`. Ne rien deviner d'ici là.

---

## 2026-09-22 — Lot collecte, sous-lot C1 : socle Python et archivage (`pipeline/collecte/`, `schema/collecte.schema.json`, `docs/CONTRATS.md` §5)

### ~~1. Deux sources au contenu identique gardent une seule fiche, et la seconde disparaît~~ — réglé le 2026-09-22 par les fiches `staging/sources/par-source/` (C1-bis)

Le manifeste est indexé par le SHA-256 du document. Si deux entrées de `config/sources.toml` servent
les mêmes octets (un programme commun hébergé à deux adresses, un PDF repris par deux candidats), la
seconde ressort « déjà collectée ». Son `candidat_id`, son `tier` et sa `date_source` ne sont écrits
nulle part.

**Pourquoi ça casse.** Le corpus examiné d'un item d'absence (§4) se reconstruit depuis les
manifestes. Il y manquera une source que l'auteur avait bien listée pour ce candidat, sans aucune
erreur. Le rapport de collecte la mentionne, mais le code de sortie reste 0.

**Ce qu'il faut faire.** À décider par l'auteur : au minimum, signaler la collision et sortir en
erreur ; au mieux, un index source → sha256 en plus du manifeste par contenu.

### ~~2. Un archivage Wayback en échec ne peut plus être repris~~ — réglé le 2026-09-22 par `staging/archivages/<sha256>.json` et `archive_url_de()` (C1-bis)

Le manifeste est immuable, et une recollecte du même contenu s'arrête sur « déjà collecté » avant
d'appeler la Wayback Machine. Une source dont Save Page Now a échoué garde donc `echec_archivage`
pour toujours.

**Pourquoi ça casse.** Une source sans `archive_url` ne peut pas s'afficher (règle 2). Un échec
passager de la Wayback Machine au premier passage retire définitivement la source de la mesure, à
moins de supprimer le manifeste à la main, ce qui contredit son immuabilité.

**Ce qu'il faut faire.** Un fichier de reprise ajouté sans réécriture (`staging/archivages/<sha256>.json`),
lu en priorité sur le bloc d'échec. À écrire avant le premier lot de collecte réel.

### 3. `candidat_id` n'est vérifié contre aucun périmètre — *basse*

`sources.py` vérifie la forme de l'identifiant, pas son existence dans `config/perimetre.yaml`, faute
de parseur YAML côté Python.

**Pourquoi ça casse.** Une faute de frappe dans `candidat_id` produit des manifestes rattachés à un
candidat inexistant. Ce sera visible dès l'extraction ou la validation, mais après la collecte, donc
après les téléchargements et les demandes Wayback.

**Ce qu'il faut faire.** La vérifier dans le lecteur du périmètre, côté TypeScript, quand il existera.

### ~~4. Les exemples valides du schéma de collecte sont des copies des fichiers dorés~~ — réglé le 2026-09-22 par `tests/collecte/dores.test.ts` (C1-bis)

`schema/exemples/collecte/valide-0*.json` recopient `tests/collecte/dore/*.json`. Aucun test ne
compare les deux.

**Pourquoi ça casse.** Si le manifeste évolue, les fichiers dorés suivent, parce que pytest l'exige,
mais les exemples du schéma peuvent rester sur l'ancienne forme. Tant que les deux formes sont
valides, rien ne rougit, et le README montre alors un manifeste que le code ne produit plus.

**Ce qu'il faut faire.** Un test d'égalité entre chaque exemple valide et son fichier doré, ou un seul
fichier référencé des deux côtés.

### ~~5. Lire `archive_url` directement dans un manifeste rend une reprise invisible~~ — réglé le 2026-09-23 par `pipeline/collecte/source.py:source_de`, seul assemblage de `commun#/$defs/source`, et son test de reprise (C2)

Depuis C1-bis, le lien d'archive effectif d'un contenu peut venir du manifeste **ou** d'un fichier
de reprise, `staging/archivages/<sha256>.json`. `pipeline/collecte/lien_archive.py:archive_url_de()`
est le seul endroit qui combine les deux. Rien n'empêche un futur consommateur (extraction C2,
interface de validation, site) de lire `archive_url` dans le manifeste.

**Pourquoi ça casse.** Une source dont l'archivage a été repris apparaît sans lien d'archive, donc
ne s'affiche pas et n'entre pas dans le corpus. Aucun test ne rougit : le manifeste est valide, il
porte simplement `echec_archivage`.

**Ce qu'il faut faire.** Dans C2 et dans le lecteur TypeScript des sources, passer par
`archive_url_de` ou par son équivalent unique côté TypeScript, avec un test de reprise.

---

## 2026-09-22 — Lot alignement-0-3, CI et protocole 0.4 (`analysis/`, `pipeline/questions/`, `prompts/`, `schema/gabarits.schema.json`, `.github/workflows/`, `docs/PROTOCOLE.md`)

### ~~1. La symétrie d'un tirage passé dépend désormais de l'état actuel des items~~ — réglé le 2026-09-22 par `items_au_gel[].decision_panel_au_gel` (lot decision-au-gel)

Avant ce lot, `aucun_item_conteste_ou_en_attente` ne lisait que les statuts figés dans
`tirage.entrees[].items_au_gel`. Pour admettre un item arbitré puis maintenu, `symetrie.ts:motifDArbitrage`
lit maintenant la dernière décision du panel **sur le fichier d'items passé en argument**, sans la
borner à `date_gel`. `tirage.schema.json` promet au contraire qu'« une contestation reçue pendant la
fenêtre ne rend pas rétroactivement le tirage fautif ».

**Pourquoi ça casse.** Un tiers rejoue `pnpm symmetry` sur un run publié avec les items actuels de
`data/`. Si un item maintenu a depuis reçu une nouvelle contestation encore sans décision, la commande
lève `ArbitrageSansDecision`. S'il a depuis été retiré, la condition passe au rouge. Le run était
pourtant conforme au gel. La vérification publique du §9 donnerait un résultat différent de celui de
l'auteur, sans qu'aucun chiffre soit faux.

**Ce qu'il faut faire.** À décider par l'auteur avant le premier run publié. Soit figer la dernière
décision du panel dans `items_au_gel`, ce qui change le schéma de tirage mais rend le tirage
revérifiable seul. Soit ne retenir que les décisions datées au plus tard à `date_gel`. En attendant,
`pnpm symmetry` ne se lance que sur les items du gel.

### 2. L'import de `pipeline/questions/gabarits.ts` lit un fichier sur disque — *basse*

La table est chargée depuis `prompts/gabarits-1.0.0.json` au moment de l'import, par un chemin
relatif à `import.meta.url`, et la version est inscrite en dur dans `VERSION_FICHIER`.

**Pourquoi ça casse.** Un empaquetage, un déplacement de `pipeline/`, ou une image conteneur (§9) qui
n'embarque pas `prompts/`, fait échouer tout module qui importe l'engendrement ou le tirage, y compris
`pnpm symmetry`. L'échec est bruyant et immédiat. Une nouvelle version des gabarits exige un nouveau
fichier **et** la modification de `VERSION_FICHIER` : l'oubli de la seconde étape laisse l'ancienne
table en service, et `version_gabarits` des questions dit alors laquelle.

**Ce qu'il faut faire.** Rien tant que le code tourne depuis le dépôt. Inclure `prompts/` dans l'image
conteneur du lot hors-code.

---

## 2026-09-20 — Protocole 0.3 et squelette du périmètre (`docs/PROTOCOLE.md`, `schema/README.md`, `config/perimetre.yaml`, `package.json`)

### ~~1. Le protocole 0.3 tranche des points que `analysis/` implémente encore autrement~~ — réglé le 2026-09-22 par le lot alignement-0-3, sauf l'exactitude des comparateurs, déclarée à tort « jamais implémentée » : elle existait et gardait les indéterminées au dénominateur (conformité n° 5), réglée le 2026-09-24 par la PR #24

D6 est écrit dans le §8, pas dans le code. `analysis/conditions.ts` applique toujours Holm aux
effets de condition, alors que le §8 le retire de cette famille. `analysis/robustesse.ts` compte
trois recalculs (`Recalcul` n'a pas `reponses_tronquees`), alors que le §8 en exige quatre.
`analysis/filtre.ts` garde `inclure_tronquees` en paramètre libre, alors que le §8 fixe
l'inclusion. Côté questions, les gabarits vivent encore dans `pipeline/questions/gabarits.ts` et
non dans `prompts/` (D7, point 7). Ni l'interdiction de `premisse_fausse` sur un item P ni
l'exactitude des comparateurs ne sont vérifiées dans le code.

**Pourquoi ça casse.** `pnpm test` est vert, puisque les tests décrivent le code d'avant la
révision. Un run analysé en l'état publierait des valeurs p corrigées que le protocole ne définit
plus. Il qualifierait aussi de « robuste » un résultat qui ne survit pas à l'exclusion des
tronquées. Un lecteur qui confronte le rapport au protocole gelé trouverait l'écart, alors que
personne dans le projet ne l'aurait vu.

**Ce qu'il faut faire.** Un lot « alignement 0.3 » avant le run pilote du 22 novembre, en
commençant par les tests : un test par phrase du §8 révisée, rouge sur le code actuel.

### ~~2. Les dix thèmes sont écrits deux fois et aucun test ne vérifie qu'ils concordent~~ — réglé le 2026-10-02 par #72 (`schema/perimetre.schema.json` référence `commun#/$defs/theme`, et `charger-perimetre.ts` exige exactement l'ensemble du schéma) ; constaté par la revue du 2026-10-12

`config/perimetre.yaml` énumère les thèmes, `schema/commun.schema.json#/$defs/theme` aussi. Le
commentaire du YAML exige qu'ils restent identiques, mais aucun lecteur du périmètre n'existe
encore, donc aucune validation.

**Pourquoi ça casse.** Si l'auteur retire ou renomme un thème dans le YAML, le tirage l'ignorera et
la couverture par candidat baissera sans erreur. Un thème ajouté au YAML ne sera refusé qu'au moment
où les questions seront validées contre le schéma.

**Ce qu'il faut faire.** Au lot qui écrira le lecteur du périmètre, valider l'objet contre un
JSON Schema dont l'énumération `themes` référence `commun.schema.json`. Ajouter un test d'égalité
des deux listes.

---

## 2026-09-20 — Lot schemas-decision : `decision` et `decision-mesure` au registre, manifestes de lots validés (`schema/`, `outils/schemas/`, `validation/io/`)

### ~~1. Le journal de validation est gardé par ses exemples, pas par le code qui l'écrit~~ — réglé le 2026-09-24 par `valider("decision", …)` à la lecture et avant chaque ajout (lot 3 de la revue)

`decision.schema.json` est au registre ajv avec six exemples, et `pnpm check` les vérifie. Ce qui
manque est le lien entre le schéma et le code : `JournalAnnotateur.ajouter()` sérialise ce que le
type `EntreeJournal` de `validation/domaine/types.ts` accepte, `analyser()` recaste sans valider, et
les six exemples ont été écrits à la main d'après le schéma. Schéma et exemples restent donc
d'accord entre eux pendant que le code peut s'en éloigner. `decision-mesure`, lui, a la paire
`validerEntreeRegistre()` + test d'accord.

**Pourquoi ça casse.** Ajouter un champ à `EntreeDecision` — une sixième question spécifique, par
exemple — compile, s'écrit dans les journaux, et `additionalProperties: false` rend alors non
conforme à son propre schéma publié un journal que le §9 publie précisément pour qu'un tiers le
vérifie. `pnpm check` reste vert : rien n'y confronte une entrée **produite par le code** à son
schéma.

**Ce qu'il faut faire.** Le test d'accord écrit pour `decision-mesure`, transposé : fabriquer une
`EntreeDecision`, une `EntreeAnnulation` et un `EntreeRetrait` depuis `tests/aides/fabriques.ts`,
les valider contre `urn:banc-essai-2027:schema:decision`. Suppose le point 3 corrigé d'abord.
Valider à l'écriture dans `ajouter()` serait plus fort, mais mettrait ajv dans le chemin d'exécution
de l'interface de validation : à trancher seulement si le test ne suffit pas.

### ~~2. `lireLot()` refuse désormais un manifeste que `ecrireLot()` accepte d'écrire~~ — réglé le 2026-10-21 par le schéma `lot.schema.json` (revue du 2026-10-12, constat 4 ; D55 (3), #PR) : `lireLot`, `lireLots`, `ecrireLot` et `ecrireLots` valident désormais tous contre lui, avant toute écriture

La validation ajoutée cette session est en lecture seule. `ecrireLot()` écrit tout objet `Lot` que
le type TypeScript accepte, et un manifeste n'est jamais réécrit (`LotDejaExistant`,
`docs/CONTRATS.md` §4). Aujourd'hui `pnpm lots` compose toujours un lot complet ; rien ne garantit
que le prochain appelant le fera.

**Pourquoi ça casse.** Un lot de nature `reannotation` composé sans `date_calibration` s'écrit sans
broncher, puis devient illisible au premier `lireLot()` : le fichier est à la fois invalide et
censé ne jamais être réécrit. La réparation suppose de violer l'immutabilité du manifeste ou de
jeter un lot dont la graine et la composition étaient la garantie de reproductibilité du kappa.

**Ce qu'il faut faire.** Appeler la même validation dans `ecrireLot()`, avant l'écriture, le jour où
un second appelant que `pnpm lots` apparaît. Les fonctions existent déjà (`validerNature`,
`validerReannotation`) : c'est un appel, pas un mécanisme.

### ~~3. La moitié des identifiants de fixtures reste hors de l'alphabet Crockford~~ — réglé le 2026-09-24 par la mise en conformité des fabriques et des tests (lot 3 de la revue)

Cette session a corrigé les identifiants de **mesure** des fabriques de test (`I` et `U`, hors
Crockford base32) parce que le schéma neuf les refusait. Ceux des **items** portent le même défaut
et n'ont pas été touchés : `01JBANCESSAI00000000ITEM04`, `01JBANCESSAI00000ITEM${rang}`. Rien ne les
valide aujourd'hui.

**Pourquoi ça casse.** Le jour où un test confronte une fixture d'item à `item.schema.json`, ou une
entrée de journal fabriquée à `decision.schema.json` — exactement ce que demande le point 1 —, il
échoue sur la forme de l'identifiant avant d'atteindre la règle qu'il visait. Le lecteur du test
conclut que la règle est fausse. La demi-correction d'aujourd'hui aggrave le piège : elle fait
croire que les identifiants restants sont volontaires.

**Ce qu'il faut faire.** Les corriger dans le lot qui écrira le test d'accord du journal, pas avant :
un renommage de fixtures isolé ne se relit pas et ne prouve rien.

---

## 2026-09-19 — Lot dette-validation : réannotation, registre des mesures, logique pure du client (`validation/domaine/`, `outils/`, `validation/client/`)

### ~~1. Deux kappas coexistent pour un même lot, et rien ne choisit encore lequel compte~~ — réglé le 2026-09-25 : la sélection du §12 ne garde que les lots non supersédés et lève `DiagnosticPerime` (conformité n° 16, #33)

Le §4 dit : « le kappa retenu pour les critères de la section 12 est celui du lot de réannotation ».
Depuis cette session, un lot peut être supersédé, donc deux kappas existent pour les mêmes items.
`domaine/analyse-lot.ts:diagnostiquerLot()` les calcule tous les deux, volontairement, et **aucun
code ne sélectionne le dernier maillon** : le dépôt n'évalue pas encore les critères du §12.

**Pourquoi ça casse.** Le lot qui écrira les critères go/no-go lira la liste des lots et en tirera un
kappa. S'il ne filtre pas sur `domaine/lot.ts:supersediteurDe(lots, lot_id) === null`, le kappa du
lot supersédé — celui qui, précisément, était sous 0,80 et a motivé la réannotation — entre dans un
critère de publication et dans les diagnostics publiés au titre du §9. Aucun test ne tombe : les
deux kappas sont justes, c'est le choix entre eux qui est faux.

**Ce qu'il faut faire.** Dans le lot go/no-go, filtrer sur `supersediteurDe(...) === null` et nulle
part ailleurs, et ne jamais recalculer un kappa hors de `diagnostiquerLot`. Les données pour le
faire existent désormais : `Lot.reannote`, `supersediteurDe`, `lotsApresSupersession`.

### ~~2. La supersession repose sur un champ de manifeste que rien ne valide à l'écriture~~ — réglé le 2026-09-20 par la validation de `lireLot()`

`promote` ne déduit la chaîne de supersession que du champ `reannote` des manifestes de
`validation/lots/`. Un lot de réannotation écrit à la main sans ce champ redonne deux jeux de
décisions pour les mêmes items ; un `reannote` pointant un identifiant absent lève `LotIntrouvable`.

**Pourquoi ça casse.** Le manifeste est immuable une fois écrit (`docs/CONTRATS.md` §4) : un champ
oublié se répare en réécrivant un fichier censé ne jamais l'être. Le symptôme n'apparaît qu'au
lancement de `promote`, longtemps après la séance d'annotation.

**Ce qu'il faut faire.** Valider le champ à la lecture dans `validation/io/lots-fichier.ts:lireLot()`,
en même temps que le schéma du registre du point 3 : un lot de nature `reannotation` sans `reannote`
ni `date_calibration` est un manifeste invalide, pas un lot ordinaire. *Fait ; reste le versant
écriture, entrée du 2026-09-20, point 2.*

### ~~3. Le registre des corrections de mesure n'est gardé par aucun schéma~~ — réglé le 2026-09-20 par `schema/decision-mesure.schema.json` et le test d'accord

`validation/mesures/decisions.json` est publié au titre du §9, et sa forme n'est tenue que par
`domaine/corrections-mesure.ts:validerEntreeRegistre()`, écrite à la main. Aucun des 45 exemples ne
le concerne, `pnpm check` ne le regarde pas.

**Pourquoi ça casse.** C'est exactement le défaut déjà relevé au point 5 de l'entrée du 2026-09-18
pour `decision.schema.json` : un champ renommé ne fait échouer que la commande qui le lit. Deux
objets publiés échappent maintenant à la validation de schéma, là où les neuf autres sont couverts.

**Ce qu'il faut faire.** Un seul petit lot : `schema/decision-mesure.schema.json` et
`decision.schema.json` enregistrés, leurs exemples au manifeste, `mesures-fichier.ts` validant
contre le schéma. À faire avant le premier lot réel du 15 novembre.

### 4. Un registre en tableau JSON se réécrit en entier à chaque ajout — *basse*

« Ajout seul » est ici une propriété du module — `validation/io/mesures-fichier.ts` n'expose ni
modification ni suppression — et non du format : ajouter une entrée réécrit le fichier entier.
Le journal des annotateurs, lui, est en `.jsonl` et sait détecter une écriture interrompue.

**Pourquoi ça casse.** Une écriture interrompue tronque le registre entier, pas sa dernière ligne.
Le fichier est alors illisible, ce que `lireRegistre` signale — donc bruyant, pas silencieux — mais
les décisions déjà tranchées sont perdues et ne se retrouvent que dans l'historique Git.

**Ce qu'il faut faire.** Basculer en `.jsonl` si le registre dépasse quelques dizaines d'entrées.
Le nom `decisions.json` vient d'une décision de l'auteur du 2026-09-18 : le changer est sa décision.

### 5. Le champ `registre_corrections_mesure` est obligatoire, mais un tableau vide est accepté — *basse*

`Dossier.registre_corrections_mesure` est requis par le type, ce qui force tout futur appelant
d'`evaluerPromotion` à le fournir. Rien ne force à le **remplir**.

**Pourquoi ça casse.** Un appelant qui passerait `[]` par facilité transformerait toutes les
demandes refusées en demandes en attente : des items partiraient en attente au lieu de l'arbitrage,
sans qu'aucun test ne tombe. Visible seulement en comparant le rapport de `promote` au registre.

**Ce qu'il faut faire.** Quand un second appelant apparaîtra, lui faire charger le registre par la
même fonction que `promote`, plutôt que de construire un `Dossier` à la main.

---

## 2026-09-18 — Trois lots en parallèle : outillage, analyse, questions (`outils/schemas/`, `eslint.config.js`, `analysis/`, `pipeline/questions/`)

### ~~1. Les graines de l'analyse sont textuelles, celles du run sont des entiers~~ — réglé le 2026-09-24 par `analysis/graines.ts:graineDerivee` et la règle écrite au §8 (protocole 0.7, PR #24)

`analysis/bootstrap.ts` et `analysis/permutation.ts` amorcent `validation/domaine/alea.ts` avec une
graine **textuelle**, alors que `run.graines.bootstrap.valeur` et `run.graines.permutation.valeur`
sont des entiers dans `schema/run.schema.json`. Aucune fonction unique ne fait la conversion.

**Pourquoi ça casse.** Si l'appelant qui branchera `pnpm analyze` convertit l'entier autrement que
par `String(valeur)`, les intervalles publiés restent déterministes mais ne sont plus rejouables par
un tiers depuis le run publié. Pour un lecteur, un intervalle qu'il ne peut pas rejouer est
indistinguable d'un intervalle faux, et rien ne le signale.

**Ce qu'il faut faire.** Un unique `amorceDepuisGraine(run.graines.x)` dans `analysis/`, testé
contre une valeur attendue écrite, utilisé par le bootstrap, la permutation et l'échantillon humain.
À faire dans le lot qui écrit `pnpm analyze`.

### 2. Le tirage fige quatre conventions que le protocole n'écrit pas — *moyenne*

`pipeline/questions/` a retenu le comportement le plus restrictif sur quatre points non tranchés :
date civile comparée à `date_gel` à **minuit UTC** ; item `arbitree` exclu du tirage, contre
l'annexe E ; Q-ORI sur un item O avant son changement résolue par l'état en vigueur ; budget de
reprise 80 % appliqué aussi aux Q-ATT. Les décisions sont listées en D7 de
`docs/FEUILLE-DE-ROUTE.md`.

**Pourquoi ça casse.** Si l'auteur tranche autrement après un premier run réel, le jeu de questions
change entre deux runs et les « questions communes » de la tendance §8 se réduisent sans que le
lecteur sache pourquoi. C'est visible dans le rapport de reprise, à condition de le lire.

**Ce qu'il faut faire.** Trancher D7 **avant** le run pilote du 22 novembre et écrire chaque réponse
dans le protocole ou `schema/README.md`, section Temps. Chaque changement est une ligne dans un
prédicat nommé (`questionTirable`, `itemEngendreDesQuestions`, la table des résolveurs).

### 3. Le contrat d'entrée de l'analyse précède la disposition de `runs/` — *moyenne* — à moitié réglé le 2026-10-02 : `runs/README.md` écrit (#75) ; la lecture par `assembler()` reste au lot notation

`analysis/types.ts:EntreesAnalyse` suppose une entrée de tirage par `question_id` et exactement un
item principal par question, et `analysis/filtre.ts:assembler()` lève sur tout écart. La
disposition de `runs/<date>/` n'existe pas encore.

**Pourquoi ça casse.** Quand le lot interrogation fixera les fichiers d'un run, tout écart imposera
un adaptateur plutôt qu'un chargement direct ; et un thème absent d'une entrée de tirage fait
sortir l'unité de la ventilation par thème avec `theme: null`, visible dans le type mais muet dans
les chiffres.

**Ce qu'il faut faire.** Écrire `runs/README.md` avec la disposition des fichiers dans le lot
interrogation, et faire lire ces fichiers par `assembler()` sans couche intermédiaire.

### 4. ajv tourne en `strict: "log"` et compte ses avertissements sans les lire — *moyenne*

`outils/schemas/registre.ts` passe ajv en `strict: "log"` parce que le mode strict refuse des
combinaisons `if`/`then`/`not`/`contains` légitimes du draft 2020-12 utilisées par six schémas. Les
135 avertissements sont comptés dans le rapport, jamais catégorisés. (598 au 2026-10-12, revue de
code : le compte croît avec chaque schéma, ce qui rend une coquille nouvelle d'autant moins visible.)

**Pourquoi ça casse.** Une coquille dans un mot-clé de schéma (`requird`, `additionalProperty`)
est exactement ce que le mode strict attrape. En `log`, elle rejoint les 135 autres et `pnpm check`
reste vert, tant qu'aucun exemple `invalide-*` ne vise précisément la règle affaiblie.

**Ce qu'il faut faire.** Catégoriser les avertissements par code ajv et n'ignorer que les codes
connus, en erreur sur tout code nouveau. Petit lot Sonnet.

### ~~5. `decision.schema.json` n'est ni enregistré ni exemplifié~~ — réglé le 2026-09-20 par son entrée au registre et ses six exemples

`schema/` contient onze fichiers ; `schema/README.md` et le manifeste en connaissent dix.
`decision.schema.json`, ajouté avec le journal de validation, n'a aucun exemple et n'est pas dans
le registre d'`outils/schemas/noms.ts`.

**Pourquoi ça casse.** Le journal de validation, publié au §9, est le seul objet du dépôt dont la
forme n'est gardée par aucun test. Un champ renommé dans `validation/domaine/journal.ts` ne fera
échouer que la lecture croisée de `promote`, jamais `pnpm check`.

**Ce qu'il faut faire.** Cinq exemples au manifeste, une ligne dans le README, le fichier ajouté
au registre. Petit lot Sonnet, en même temps que le point 4. *Fait ; reste à relier le schéma au code qui
écrit les journaux, entrée du 2026-09-20, point 1.*

### ~~6. Les gabarits de questions vivent dans le code, pas dans `prompts/`~~ — réglé le 2026-09-22 par `prompts/gabarits-1.0.0.json` et `schema/gabarits.schema.json` (lot alignement-0-3)

`pipeline/questions/gabarits.ts` porte les six textes de l'annexe B en table de données, et
`question.version_gabarits` vaut `"annexe-B/protocole-0.2"`. `CLAUDE.md`, règle 6, dit « aucun
prompt en dur dans le code », et `schema/question.schema.json` décrit `version_gabarits` comme la
version d'un fichier de `prompts/`.

**Pourquoi ça casse.** Un changement de gabarit est un amendement (§9) ; dans le code, il se noie
dans un diff ordinaire. Visible à la relecture, mais après coup.

**Ce qu'il faut faire.** Déplacer la table vers `prompts/gabarits-1.0.0.json` dans le lot
`perimetre-prompts`, que seul l'auteur écrit ; `gabarits.ts` devient une lecture de fichier.

### 7. Deux gardes pour le même invariant, et un test qui recopie sa configuration — *basse*

`validation/domaine/promotion.ts:memeVersionJugee()` (privée) et
`pipeline/questions/invariants.ts` gardent la même règle « deux validations concordantes, même
version ». `tests/lint.test.ts` redéclare les deux règles d'`eslint.config.js` au lieu de l'importer.

**Pourquoi ça casse.** Deux copies d'une règle divergent ; un seuil changé dans la configuration
resterait testé à l'ancienne valeur. Visible à la lecture.

**Ce qu'il faut faire.** Exporter `memeVersionJugee` et l'appeler depuis `invariants.ts` ; faire
importer la configuration réelle par le test (`allowJs` ou déclaration de type minimale).

---

## 2026-09-18 — Feuille de route générée (`docs/feuille-de-route.json`, `outils/feuille-de-route/`)

### 1. Le niveau de preuve d'un lot est déclaré, jamais mesuré — *moyenne*

`docs/feuille-de-route.json` porte pour chaque lot un `niveau` T0 à T4 saisi à la main par la
session principale. Rien ne le confronte au dépôt : un lot marqué T2 sans test, ou laissé à T0
après une session qui l'a livré, produit un graphe faux et des états « débloqué » ou « bloqué »
faux en cascade, puisque `graphe.ts:calculerEtats()` ne raisonne que sur ces niveaux.

**Pourquoi ça casse.** Une session qui saute la clôture laisse le niveau d'un lot en retard ; la
suivante lit « bloqué par outillage » alors que l'outillage est livré, et n'ouvre pas un lot qui
pouvait démarrer. Aucun chiffre publié n'en dépend, mais le pilotage du calendrier du §12 en
dépend entièrement, et seule une relecture du dépôt le révèle.

**Ce qu'il faut faire.** La procédure de clôture exige désormais de mettre à jour le niveau des
lots touchés et de régénérer le Markdown (`.claude/skills/cloture-de-session/SKILL.md`, étape 6).
Aller plus loin — dériver T2 de l'existence d'un fichier de test nommé — est une décision à
prendre quand le pipeline existera, pas avant.

### 2. Un Markdown périmé peut être commité — *basse*

`pnpm feuille-de-route --verifier` existe mais n'est branché ni sur `pnpm check` ni sur une CI.
Éditer le JSON sans relancer le générateur laisse `docs/FEUILLE-DE-ROUTE.md` en retard d'une
version, et c'est lui que GitHub affiche.

**Pourquoi ça casse.** L'auteur lit sur GitHub un graphe qui ne correspond plus au JSON que
l'agent lit. Les deux « sources » divergent, exactement ce que le générateur devait empêcher.

**Ce qu'il faut faire.** Brancher `--verifier` sur `pnpm check` dans le lot `outillage`, en même
temps qu'ajv. Le script tourne en moins d'une seconde et ne dépend de rien.

### 3. Une barre verticale dans un titre de lot casse le tableau — *basse*

`markdown.ts` assemble les lignes du tableau des lots par jointure sur ` | ` sans échapper le
caractère `|` dans les titres, notes et agents. Aucun titre actuel n'en contient.

**Pourquoi ça casse.** Le jour où un titre en contient un, la ligne se scinde en colonnes
supplémentaires et GitHub affiche un tableau décalé. Visible dès la lecture.

**Ce qu'il faut faire.** Échapper `|` en `\|` dans une fonction de cellule unique, avec un test
sur un titre contenant une barre. À faire au prochain passage sur le générateur.

---

## 2026-09-18 — Décisions de validation reportées dans le protocole (`docs/PROTOCOLE.md` v0.2)

### ~~1. Le protocole promet trois comportements que le code n'a pas~~ — réglé le 2026-09-19 par `--reannote`, la supersession dans `promote` et `pnpm mesures`

*Correction du 2026-09-19 : ce point en annonçait trois, il n'y en avait que deux. Le suivi du taux
de « non évaluable » par annotateur était **déjà implémenté** dans `outils/promote.ts:imprimerNonEvaluables()`,
avec le commentaire qui cite le §4 ; il lui manquait seulement un test, désormais écrit. Une entrée
de dette qui décrit un manque inexistant use la confiance qu'on accorde aux autres.*

Le §4 décrit désormais la réannotation par lot supersédant (« Réannotation »), le registre des
corrections de mesure lu par `promote` (« Correction de thème ») et le suivi du taux de « non
évaluable » par annotateur. Aucun des trois n'est implémenté : `pnpm lots` n'a pas de `--reannote`,
`pnpm mesures` n'existe pas, `promote` ne lit aucun registre et ne connaît pas la supersession.

**Pourquoi ça casse.** Si un lot est réannoté avant que la supersession existe, le journal, indexé
par item, porte deux décisions par annotateur pour les mêmes items, et `promote` promeut sur une
paire dont on ne sait pas de quel lot elle vient ; le kappa publié au titre du §12 peut être celui
du lot supersédé. Rien ne l'arrête : le protocole affirme une règle que le dépôt ne tient pas, et
seul un lecteur qui compare le §4 au code s'en apercevrait.

**Ce qu'il faut faire.** Implémenter les trois, dans l'ordre déjà écrit au point 2 bis de l'entrée
du 2026-09-17, **avant** le premier lot réel du 15 novembre. Tant que ce n'est pas fait, ne pas
réannoter un lot.

---

## 2026-09-17 — Interface locale de validation humaine (`validation/`, `outils/`, `tests/`)

### ~~1. Le client n'est couvert par aucun test, et il redéclare des constantes du domaine~~ — réglé le 2026-09-19 par l'extraction vers `domaine/decoupage.ts` et `domaine/webvtt.ts`, l'import de `CLES_GRILLE`, et `docs/CONTROLE-MANUEL.md` pour ce que les tests ne verront jamais

Les 8 900 lignes livrées sont testées côté domaine, IO et routes (120 tests), mais rien n'exerce
`validation/client/`. Deux points précis : `app.ts:grilleComplete()` réécrit à la main la liste des
cinq clés de la grille, que `domaine/grille.ts:CLES_GRILLE` détient déjà ; et `source.ts:rendreTexte()`
découpe le texte canonique en **points de code** aux offsets reçus du serveur, convention qui ne vit
que dans `docs/CONTRATS.md`.

**Pourquoi ça casse.** Un extracteur qui livrerait des offsets en unités UTF-16 ferait surligner un
passage décalé de quelques caractères sur toute source contenant un caractère hors du plan de base.
L'annotateur compare alors la citation à la mauvaise portion de la source et valide ce qu'il croit
avoir lu. Aucun test, aucune alerte : le seul symptôme est un surlignage qui « tombe à côté », que
trente heures de fatigue rendent facile à ignorer.

**Ce qu'il faut faire.** Faire importer `CLES_GRILLE` au client plutôt que de la recopier — le
serveur l'envoie déjà dans `vue.questions`. Et ajouter un test de `rendreTexte` sur une source
contenant un emoji, sur le modèle de `tests/verbatim.test.ts`, ce qui suppose de choisir un
environnement DOM pour Vitest, donc une dépendance : décision à prendre, pas à prendre seul.

*Décision du 2026-09-18 : pas d'environnement DOM. Extraire vers `domaine/` la logique pure du
client (découpage aux offsets, parseur WebVTT) et la tester comme `verbatim.ts`, avec le cas emoji.
Ce que les tests ne verront pas (focus clavier, page du PDF, ordre des boutons) fait l'objet d'une
liste de contrôle manuelle versionnée, courte, à dérouler avant la campagne d'annotation.*

### ~~2. Une correction de thème peut retenir un item indéfiniment~~ — réglé le 2026-09-19 par `pnpm mesures` et le registre lu par `promote`, un refus étant désormais une décision tracée

`domaine/promotion.ts:correctionDeMesureEnAttente()` retient tout item dont une décision demande un
thème que la mesure ne porte pas encore. La commande qui appliquerait la correction au référentiel,
`pnpm mesures`, n'existe pas, et rien n'exprime un **refus** de l'auteur : une demande non satisfaite
et une demande refusée sont indiscernables dans les données.

**Pourquoi ça casse.** Les deux annotateurs corrigent le thème d'un item, l'auteur estime le thème
d'origine correct, et l'item reste en `correction_mesure_en_attente` à chaque exécution de
`pnpm promote` — jamais promu, jamais arbitré. Il sort du jeu de données sans décision. Si cela
frappe plusieurs items d'un même candidat, sa couverture passe sous le seuil de 10 items P du §4 et
il est rapporté « couverture insuffisante » pour une raison qui n'a rien à voir avec ses positions.
C'est visible dans le rapport de `promote` (`En attente : correction_mesure_en_attente : N`), à
condition de le lire.

**Ce qu'il faut faire.** Écrire `pnpm mesures`, et décider comment un refus s'enregistre — vraisem-
blablement en envoyant l'item en arbitrage, comme tout autre désaccord.

*Décision du 2026-09-18, reportée au §4 du protocole (« Correction de thème »).* Un refus est une
décision tracée. `pnpm mesures` écrit un registre en ajout seul, `validation/mesures/decisions.json`
(mesure, thème demandé, décision acceptée ou refusée, date, motif obligatoire sur un refus).
`promote` lit ce registre : acceptée **et** mesure portant effectivement le thème demandé →
promotion ; acceptée sans mesure modifiée → erreur bloquante ; refusée → arbitrage avec le motif
`correction_mesure_refusee` ; absente → attente, listée à part dans le rapport avec son âge en
jours. Jamais de refus implicite au bout de N jours.

### ~~2 bis. Rien ne relie un lot de réannotation à son lot d'origine~~ — réglé le 2026-09-19 par `--reannote` et `--calibration`, qui remplissent `Lot.reannote` et `Lot.date_calibration`, et par `lotsApresSupersession` dans `promote`

Relevé le 2026-09-18. `Lot.reannote` est déclaré dans `domaine/types.ts` et affiché par le client,
mais aucun code ne le remplit : `pnpm lots` n'a pas de drapeau pour le poser. Le §12 fait du kappa du
lot final un critère go/no-go, et le lien entre les deux kappas d'un même lot n'est enregistré nulle
part.

**Pourquoi ça casse.** Un lot réannoté produit deux jeux de décisions pour les mêmes items dans un
journal indexé par item. Sans lien ni règle de supersession, `promote` peut mélanger une décision du
lot d'origine et une décision du lot de réannotation, et le kappa « du lot » est ambigu.

**Ce qu'il faut faire.** *Décision du 2026-09-18, reportée au §4 (« Réannotation »).* Ajouter
`--reannote=lot-XXX` à `pnpm lots`, qui exige une date de séance de calibration, crée un lot de
nature `reannotation` avec les mêmes items et remplit le champ. `promote` prend les décisions du
lot de réannotation et ignore celles du lot supersédé, qui reste publié mais ne compte plus. Aucun
bouton dans l'interface : l'alerte informe, l'auteur agit.

### 3. Deux règles nouvelles ne vivent que dans le code, pas dans les schémas — *basse*

`source.texte_sha256` et `absence.confirmation_initiale` ont été ajoutés en **facultatifs**, pour ne
pas invalider les 45 exemples de `schema/exemples/` ni brouiller les motifs de rejet que les fichiers
`invalide-*` sont censés isoler. L'obligation vit donc ailleurs : l'interface refuse d'afficher une
source sans texte canonique, et `promote` refuse de promouvoir un item A sans confirmation.

**Pourquoi ça casse.** Un item A écrit à la main dans `data/`, ou par un futur script, passe la
validation de schéma sans confirmation d'absence — c'est-à-dire sans la double confirmation que le §4
exige pour qu'une absence existe. Le contrôle est réel mais il est dans `promote`, que ce chemin-là
contourne.

**Ce qu'il faut faire.** Ajouter les conditionnelles au schéma (`verifie` + type `A` ⇒
`confirmation_initiale` requise) en même temps que le validateur de schémas du point 3 de l'entrée
« JSON Schema » ci-dessous : même lot, et les exemples se corrigent une seule fois.

### ~~4. La facture de la règle de complexité est désormais exigible~~ — réglé le 2026-09-18 par le lot outillage (`eslint.config.js` : `complexity` à 9, `sonarjs/cognitive-complexity` à 15, sur `pnpm check`) ; constaté par la revue du 2026-10-12

L'entrée « Règle de complexité » ci-dessous annonçait le risque du report. Il s'est réalisé : le
dépôt contient maintenant 8 900 lignes écrites sans qu'aucun outil ne mesure quoi que ce soit.
J'ai compté les branches à la main et découpé quatre fonctions qui dépassaient (`construireItems`
des fixtures, les deux `lireOptions` des outils, `reinitialiserSaisie` du client), mais un comptage
manuel ne se rejoue pas.

**Pourquoi ça casse.** Pas de nombre faux. Le coût est que la mise en conformité, quand ESLint sera
branché, tombera d'un coup sur du code déjà écrit — dont `domaine/promotion.ts` et
`domaine/analyse-lot.ts`, c'est-à-dire là où un refactoring est le plus risqué.

**Ce qu'il faut faire.** Brancher `complexity` et `sonarjs/cognitive-complexity` sur `pnpm check`
maintenant que le socle TypeScript existe, plutôt qu'après le prochain millier de lignes.

*Décision du 2026-09-18 : ESLint, typescript-eslint et eslint-plugin-sonarjs autorisés, dans un
commit séparé de celui d'ajv, avec exactement deux règles actives en erreur : `complexity` à 9 et
`sonarjs/cognitive-complexity` à 15. Pas de preset « recommended », pas de règle de style. Toute
règle supplémentaire est une décision séparée.*

*Règle partiellement le point 1 de l'entrée « JSON Schema » ci-dessous : l'invariant « les deux
validations concordantes portent sur la même version » est désormais gardé par
`domaine/promotion.ts:memeVersionJugee()` et deux tests. Les trois autres invariants restent
non gardés.*

---

## 2026-09-17 — Stockage hors Git du volume des runs (`schema/run.schema.json`, `schema/tirage.schema.json`)

### 1. La reproductibilité dépend désormais d'un service tiers — *moyenne*

Les réponses brutes et les notations individuelles quittent Git pour une archive Zenodo, référencée
par DOI et SHA-256 depuis `run.depot`. Sans ce changement le dépôt aurait atteint plusieurs
gigaoctets et cessé d'être clonable ; avec lui, la commande unique de reproductibilité du §9 dépend
de la disponibilité de Zenodo.

**Pourquoi ça casse.** Si un dépôt Zenodo devient inaccessible, les métriques d'un run publié ne
sont plus rejouables, alors que Git continue d'affirmer qu'elles le sont. L'empreinte permet de
détecter une archive altérée, pas d'en retrouver une disparue.

**Ce qu'il faut faire.** Décider d'un second exemplaire — miroir sur un autre dépôt à DOI, ou copie
froide hors ligne — et le dire dans le rapport de run. Zenodo est adossé au CERN et annonce une
conservation longue, ce qui rend le risque faible mais pas nul pour un projet dont l'auditabilité
est l'unique actif.

### ~~2. `run.tirage[]` en tableau intégré~~ — réglé le 2026-09-17 par la sortie du tirage dans `tirage.schema.json`, référencé par chemin et empreinte

---

## 2026-09-17 — Règle de complexité (`CLAUDE.md`, `.claude/skills/complexite-maitrisee/`)

### ~~1. Aucun outil ne mesure la complexité, et la règle porte sur du code qui n'existe pas~~ — réglé le 2026-09-18 par le lot outillage (ESLint, `eslint.config.js`) et par Ruff (`C901` à 9, `pyproject.toml`) ; constaté par la revue du 2026-10-12

Les seuils — 9 en cyclomatique, 15 en cognitive — sont écrits dans `CLAUDE.md`, et la façon de s'y
conformer dans la compétence `complexite-maitrisee`. Rien ne le mesure : il n'y a ni `package.json`, ni ESLint, ni Ruff dans le
dépôt, et `pnpm check` n'existe pas encore. Les configurations sont prêtes à coller dans
`.claude/skills/complexite-maitrisee/references/outillage.md`, non installées.

**Pourquoi ça casse.** Pas de nombre faux : une fonction trop branchue ne ment pas, elle coûte. Le
risque réel est le report — la règle s'appliquera à des milliers de lignes écrites sans contrôle, et
la mise en conformité tombera d'un coup sur le code de notation et de métriques, c'est-à-dire là où
un refactoring est le plus risqué.

**Ce qu'il faut faire.** Brancher `complexity` (ESLint), `sonarjs/cognitive-complexity` et `C901`
(Ruff) sur `pnpm check` en même temps que le validateur de schémas du point 3 ci-dessous : même
décision, même lot de dépendances. D'ici là, mesurer à la main sur les fonctions de calcul.

---

## 2026-09-17 — Mécanisme de clôture de session (`.claude/skills/cloture-de-session/`)

### 1. Rien ne vérifie que la clôture a eu lieu — *basse*

`CLAUDE.md` pointe vers la compétence `cloture-de-session`, et la compétence décrit la procédure.
Mais aucun contrôle automatique ne vérifie qu'une session ayant modifié du code a bien complété
`docs/DETTE.md`. Un contributeur humain, ou un agent qui ne lit pas `CLAUDE.md`, ne verra rien.

**Pourquoi ça casse.** Pas de nombre faux : le journal cesse simplement d'être fiable, et un journal
incomplet est plus trompeur qu'un journal absent — on le croit exhaustif.

**Ce qu'il faut faire.** Décider si un contrôle en intégration continue (une entrée datée du jour
quand le diff touche `pipeline/`, `analysis/` ou `schema/`) vaut sa rigidité. Décision à prendre,
pas à prendre seul : un contrôle trop strict pousse à écrire des entrées vides pour le satisfaire.

---

## 2026-09-17 — JSON Schema des objets du projet (`schema/`)

### 1. Deux des quatre invariants inter-fichiers ne sont vérifiés par aucun code de production — *haute*

JSON Schema valide un fichier à la fois. Quatre cohérences essentielles échappent donc aux schémas :

- `question.grappe_id` doit être l'item marqué `principal` dans `question.items[]` : contrôlé en
  tant qu'invariant bloquant par `pipeline/gel/barriere.ts` (`grappeSuitItemPrincipal`) ;
- tout item de type `F` doit pointer une mesure dont `fictive` vaut `true` : contrôlé de même par
  `pipeline/gel/barriere.ts` (`itemsFictifsPointentMesureFictive`) ;
- `notation.contexte` et `verdict.contexte` doivent valoir celui de l'objet noté : non vérifié par
  l'invariant générique correspondant (`pipeline/questions/invariants.ts:contexteSuitObjetNote`,
  appelé par aucun code de production, seulement par `tests/questions/invariants.test.ts`), mais le
  contexte d'un verdict l'est à l'assemblage par `analysis/filtre.ts:estDuRun` ;
- les deux validations concordantes d'un item doivent porter sur la **même version** de cet item :
  gardé à l'entrée par `validation/domaine/promotion.ts:memeVersionJugee` (appelée par
  `evaluerPromotion`, refus `versions_differentes`) au moment de la promotion, mais l'invariant
  générique correspondant (`validationsConcordantesMemeVersion`) n'est pas non plus appelé par du
  code de production, un contrôle a posteriori sur tout le corpus déjà promu.

**Le trou qui reste.** `contexteSuitObjetNote` et `validationsConcordantesMemeVersion` existent,
sont testés, et ne tournent sur aucun corpus réel : une divergence de contexte ou de version
introduite par un autre chemin que ceux déjà gardés (`barriere.ts`, `filtre.ts`, `promotion.ts`)
passerait sans qu'aucun test ne la voie.

**Pourquoi ça casse.** Une divergence sur `grappe_id` ou sur la fictivité est désormais bloquée au
gel. Un `contexte` mal recopié par un chemin que `filtre.ts` ne lit pas, ou deux validations de
versions différentes entrées par un chemin que `promotion.ts` ne garde pas, feraient entrer une
donnée incohérente dans une métrique publiée sans qu'aucune validation n'échoue.

**Ce qu'il faut faire.** Brancher `contexteSuitObjetNote` et `validationsConcordantesMemeVersion`
sur un contrôle a posteriori du corpus (à la manière de `pipeline/gel/barriere.ts` pour les deux
premiers), ou documenter explicitement qu'ils sont redondants avec les gardes existantes si une
revue le confirme.

### ~~2. L'épinglage `version` + `empreinte` durcit toute correction d'item~~ — réglé le 2026-09-18 par la définition du contenu notant au §4 du protocole

La liste des champs entrant dans l'empreinte est figée et écrite dans le protocole : type, candidat,
mesure et sa version, dates de validité, position, citation normalisée, quantification, empreinte de
la source, corpus examiné pour un item A, date de changement et deux états pour un item O. La
**paraphrase est exclue** : corriger une coquille de paraphrase ne change plus l'empreinte ni la
reprise à 80 % du §5. Reste vrai, et voulu : corriger une citation ou une quantification change
l'empreinte, parce que c'est contre elles qu'une réponse a été jugée. Implémentation :
`validation/domaine/empreinte.ts:empreinteContenuNotant()`.

### ~~3. Les exemples ne sont pas encore exécutés en intégration continue~~ — réglé le 2026-09-18 par `outils/schemas.ts` sur `pnpm check`, rejoué en CI (`.github/workflows/`, décision D1) ; constaté par la revue du 2026-10-12

`schema/exemples/manifeste.json` est une table de vérité complète (45 exemples, résultat attendu et
règle du protocole testée), vérifiée une fois à la main avec `jsonschema` 4.26. Aucun runner n'est
branché sur `pnpm check`.

**Pourquoi ça casse.** Un schéma assoupli par mégarde ne fera échouer aucun test. Les exemples
invalides sont les seuls gardiens des règles du protocole encodées dans les schémas.

**Ce qu'il faut faire.** Brancher un validateur sur `pnpm check`. Suppose de choisir un validateur
côté TypeScript, donc une dépendance : décision à prendre, pas un raccourci à prendre seul.

*Décision du 2026-09-18 : ajv et ajv-formats autorisés, dans leur propre commit, avant ESLint. Les
45 exemples du manifeste deviennent des tests bloquants de `pnpm check`. `jsonschema` côté Python
n'est plus installé sur la machine, le runner TypeScript est donc le seul.*

### 4. `commun.schema.json` crée un couplage fort — *basse*

Les neuf schémas référencent une bibliothèque `$defs` commune par URN. Tout validateur doit charger
les dix fichiers dans un registre ; un schéma pris isolément ne se résout pas.

**Pourquoi ça casse.** Un outil tiers qui charge `item.schema.json` seul échouera sans message
clair. En contrepartie, les dix thèmes et les six gabarits ne peuvent pas diverger entre fichiers —
le couplage est le prix de cette garantie, et il est assumé.
