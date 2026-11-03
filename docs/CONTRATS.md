# Contrats d'artefacts entre la collecte et la validation

`docs/PROTOCOLE.md` fait autorité sur ce qu'on mesure. Ce fichier fige la **forme des fichiers**
qu'un étage du pipeline dépose pour l'étage suivant, quand `schema/` ne les décrit pas parce qu'ils
ne sont pas des objets JSON du modèle de données.

Un contrat entre ici quand un artefact est produit par un composant et consommé par un autre : sans
lui, les deux composants se mettent d'accord par hasard, et la divergence n'est découverte qu'au
moment où un chiffre est faux.

---

## 1. Texte canonique d'une source — `staging/textes/<texte_sha256>.txt`

Le texte extrait d'une source archivée. C'est **lui**, et lui seul, que les offsets d'un test
verbatim indexent, et c'est lui que l'interface de validation surligne.

| Propriété | Valeur | Pourquoi |
| --- | --- | --- |
| Nom du fichier | `<texte_sha256>.txt`, l'empreinte du fichier lui-même ; immuable | Une réextraction (autre version de l'extracteur) produit un autre fichier au lieu d'écraser le premier : les offsets des items déjà validés continuent de désigner le texte contre lequel ils ont été vérifiés. Le lien vers le document d'origine passe par la fiche d'extraction (§1.1), jamais par le nom |
| Encodage | UTF-8, sans BOM | — |
| Normalisation Unicode | **NFC** | Sans forme fixée, « é » composé et « é » décomposé donnent deux longueurs et deux jeux d'offsets pour le même texte |
| Fins de ligne | **LF** (`\n`) seulement | CRLF décale tous les offsets d'un fichier d'une unité par ligne |
| Unité des offsets | **points de code Unicode** | Ni octets (UTF-8 est de largeur variable) ni unités UTF-16 (les emojis et certains caractères comptent double en JavaScript). C'est la seule unité que TypeScript et Python comptent identiquement sans conversion |

L'item enregistre `source.texte_sha256` : l'empreinte du fichier `.txt` lui-même, distincte de
`source.sha256` qui est celle du document d'origine. Deux empreintes parce que ce sont deux
documents : le PDF publié par un candidat, et le texte qu'on en a extrait.

**Offsets.** `test_verbatim.offset_debut` et `offset_fin` désignent un intervalle **semi-ouvert**
`[debut, fin)` de ce texte brut, en points de code. La comparaison verbatim, elle, se fait après la
normalisation du test (espaces et guillemets, §4 du protocole) : la normalisation sert à **comparer**,
les offsets à **montrer**. Confondre les deux produit un surlignage décalé de quelques caractères sur
toute source contenant des guillemets typographiques.

**Personne ne corrige un texte canonique depuis l'interface de validation.** Un texte extrait faux
(OCR défaillant, transcription erronée) se solde par un rejet de l'item sous le motif
énuméré « texte extrait erroné », qui renvoie la source à la réextraction. L'interface n'a aucun chemin
d'écriture vers `staging/textes/`.

Le texte est écrit tel que l'extracteur le rend, après les deux seules transformations du tableau
ci-dessus (fins de ligne en LF, puis NFC) : aucun saut de ligne final ajouté, aucun espace retiré,
aucune ligature, césure ou coquille corrigée. Une citation se vérifie contre ce que le document
contient, pas contre ce qu'il aurait dû contenir.

### 1.1 Fiche d'extraction — `staging/extractions/<sha256_source>/<texte_sha256>.json`

Décrite par `schema/extraction-texte.schema.json`. Une fiche par document archivé **et** par texte
qu'on en a tiré ; mêmes règles d'écriture que les fichiers de §5 (JSON UTF-8, deux espaces, ordre des
clés fixe, saut de ligne final, écriture atomique, immuable). Le texte est écrit **avant** sa fiche :
une fiche n'existe jamais sans son texte.

| Champ | Contenu |
| --- | --- |
| `sha256_source` | empreinte du document archivé (manifeste de §5.4) |
| `texte_sha256` | empreinte du fichier `.txt` ; nomme la fiche et le texte |
| `longueur` | nombre de points de code du texte |
| `date_extraction` | instant de la première extraction qui a produit ce texte |
| `extracteur` | `{outil, version, options}` : `pymupdf`, `html.parser` ou `webvtt` (texte dérivé d'une transcription, §2), version exacte, options fixées par le code |
| `pages` | PDF seulement : `[{numero, debut, fin}]`, intervalle semi-ouvert en points de code de chaque page, séparateur exclu |
| `encodage` | HTML seulement : `{nom, origine}`, le codec Python employé et d'où il vient (`bom`, `content-type`, `meta`) |
| `vtt_sha256` | audio et vidéo seulement : empreinte du `.vtt` dont le texte est dérivé (§2) |

Deux extracteurs qui rendent le même texte donnent la même empreinte : la fiche existante est
gardée, et elle nomme l'extracteur qui l'a produit en premier.

`pages` sert à l'extraction à remplir `source.page`, obligatoire pour un `programme_pdf` : la page
d'une citation est celle dont l'intervalle contient `[offset_debut, offset_fin)`. Une citation à
cheval sur deux pages n'a pas de page unique et est refusée.

### 1.2 Texte d'un PDF — pymupdf

- Chaque page est lue par `page.get_text("text", flags=…)` avec exactement les drapeaux
  `TEXT_PRESERVE_LIGATURES | TEXT_PRESERVE_WHITESPACE | TEXT_MEDIABOX_CLIP` : ligatures conservées
  (`ﬁ` reste `ﬁ`), aucune suppression de césure, aucun réordonnancement des blocs.
- Les pages sont jointes par `\f` (U+000C, un point de code) : ni avant la première, ni après la
  dernière. Une page dont le texte contient déjà `\f` est une erreur.
- En-têtes, pieds de page et numéros de page répétés restent dans le texte.
- Un document dont **toutes** les pages sont vides ou blanches est refusé (« sans couche texte ») :
  aucune OCR tant qu'elle n'a pas été décidée. Une page blanche parmi d'autres garde son intervalle,
  vide.

### 1.3 Texte d'une page HTML — `html.parser` de la bibliothèque standard

- **Encodage**, dans l'ordre de la norme WHATWG : marque d'ordre des octets, sinon paramètre
  `charset` du `Content-Type` reçu (`type_contenu_recu` du manifeste), sinon `<meta charset>` ou
  `<meta http-equiv="Content-Type">` dans les 1 024 premiers octets. Rien de tout cela : **échec**,
  jamais une supposition. Comme un navigateur, `iso-8859-1`, `latin1`, `ascii` et `us-ascii` sont
  lus en `cp1252`. Un octet invalide pour l'encodage retenu est un échec.
- Le contenu de `script`, `style`, `noscript` et `template` est ignoré, ainsi que les commentaires.
  Les entités sont décodées (`&nbsp;` donne U+00A0, conservé).
- Chaque élément de bloc (`p`, `div`, `li`, `h1` à `h6`, `br`, `tr`, `td`, `section`… : liste fermée
  dans `pipeline/collecte/textes/page_html.py`) marque une coupure de ligne. Dans une ligne, toute suite
  d'espaces ASCII (espace, tabulation, saut de ligne, retour chariot, saut de page) devient une
  espace ; les espaces en début et fin de ligne sont retirées ; les lignes vides disparaissent ; les
  lignes restantes sont jointes par `\n`. `pre` suit la même règle que les autres blocs.
- Une page dont le texte est vide est refusée.

### 1.4 Autres contenus

Un contenu `audio/*` ou `video/*` n'a pas d'extracteur propre : son texte est dérivé de sa
transcription (§2), après vérification du `.vtt` contre l'empreinte que sa fiche de transcription
consigne. Transcription absente, fiche absente ou `.vtt` altéré : échec nommé, jamais un succès
silencieux. Tout autre type reçu, ou un type absent, est un échec nommé : le type se lit dans
`type_contenu_recu`, jamais dans les octets.

## 2. Transcription minutée — `staging/transcriptions/<sha256_source>.vtt`

Obligatoire pour toute source `enregistrement_audio` ou `enregistrement_video`. Format WebVTT
standard, lisible tel quel par l'élément `<track>` d'un navigateur.

Le texte canonique d'une source audio ou vidéo n'est pas produit indépendamment : il est **dérivé**
du `.vtt` de façon déterministe, en joignant le texte des cues dans l'ordre par un saut de ligne
(`\n`), après normalisation NFC. Un seul modèle de texte vaut donc pour les trois types de source, et
un seul code de surlignage les traite tous.

De cette dérivation découle une propriété utile : un offset dans le texte canonique se retrouve dans
un cue, donc dans un horodatage. C'est ce qui positionne le lecteur audio ou vidéo sur la citation,
sans que l'item ait à stocker un horodatage par citation.

```
WEBVTT

00:42:10.000 --> 00:42:14.500
Première phrase de l'extrait.

00:42:14.500 --> 00:42:19.000
Seconde phrase de l'extrait.
```

Texte canonique dérivé : `Première phrase de l'extrait.\nSeconde phrase de l'extrait.`

**Règle de dérivation** (`vtt-1`, `pipeline/collecte/textes/transcription_vtt.py`, identique à
`validation/domaine/webvtt.ts` qui relit les mêmes fichiers) :

- blocs séparés par une ligne vide ; CRLF lu comme LF, un CR isolé est un échec ;
- l'en-tête `WEBVTT` et ses métadonnées sont ignorés, comme les blocs `NOTE`, `STYLE` et `REGION`,
  qui ne réservent aucun offset ;
- dans un cue, les lignes avant la flèche (identifiant) et les réglages après la borne de fin sont
  ignorés ; le texte du cue est sa charge utile telle qu'écrite, **lignes jointes par `\n`**, en NFC ;
- un cue sans texte, ou dont le texte contient `<` ou `&` (balise ou entité WebVTT), est un échec :
  l'interface garderait la balise dans le texte, la retirer ici donnerait deux jeux d'offsets.

Un offset tombe dans le dernier cue dont le premier point de code le précède ou l'égale : le `\n`
qui joint deux cues appartient au premier.

**Extrait d'une citation.** L'extrait que l'annotateur écoute va de la borne de début du cue qui
contient `offset_debut`, arrondie à la seconde inférieure, à la borne de fin du cue qui contient
`offset_fin − 1`, arrondie à la seconde supérieure. Une citation à cheval sur plusieurs cues donne
un extrait qui les couvre tous.

### 2.1 Copie locale d'un enregistrement — yt-dlp

Une source `enregistrement_audio` ou `enregistrement_video` pointe une page ; `pnpm collecte` la
copie par yt-dlp (`pipeline/collecte/media.py`) au lieu d'un téléchargement HTTP, puis suit §5 à
l'identique (SHA-256, `archives/`, Wayback de la page listée, manifeste, fiche). `robots.txt` de la
page est vérifié avant d'appeler yt-dlp ; yt-dlp espace ses requêtes d'au moins une seconde et porte
le User-Agent de la collecte.

- Un seul fichier tel que servi, jamais une fusion ni un post-traitement : pour la vidéo, le
  meilleur format qui porte déjà l'image et le son ; pour l'audio, le meilleur flux audio seul.
  « Meilleur » est l'ordre de yt-dlp. Un format sans codec déclaré, ou servi par fragments (HLS,
  DASH), n'est pas admissible. Aucun format admissible : échec nommé.
- `type_contenu_recu` n'est pas ici un en-tête HTTP (yt-dlp n'en expose pas) : c'est le type du
  conteneur retenu, lu dans une table fermée (`media.TYPES_MEDIA`, par exemple `mp4` vidéo →
  `video/mp4`, `m4a` → `audio/mp4`). Conteneur hors table : échec, jamais une supposition.
- `url_finale` de la fiche est la page que yt-dlp a effectivement lue (`webpage_url`).
- Le média n'entre jamais dans Git (`archives/`, §10 du protocole).

### 2.2 Production du `.vtt` et fiche de transcription — `staging/transcriptions/<sha256_source>.json`

`pnpm transcriptions` (`pipeline/collecte/transcription`) transcrit en local, avec faster-whisper,
chaque contenu `audio/*` ou `video/*` collecté qui n'a pas encore de `.vtt`.

- **Modèle** : `large-v3-turbo` au format CTranslate2, dépôt Hugging Face et révision (hash de
  commit) épinglés dans `pipeline/collecte/transcription/poids.py` avec la taille et l'empreinte de
  chaque fichier de poids. Les poids sont téléchargés au premier lancement dans `modeles/` (hors
  Git), puis vérifiés **avant tout chargement** à chaque lancement ; un fichier absent ou d'empreinte
  fausse arrête tout (code de sortie 2), jamais retéléchargé en silence. Ensuite tout tourne hors
  ligne.
- **Paramètres** : fixés dans `pipeline/collecte/transcription/modele.py` et écrits tels quels dans
  la fiche (CPU, `int8`, langue `fr`, température 0 seule, VAD désactivée…).
- **Écriture du `.vtt`** : un cue par segment, `HH:MM:SS.mmm --> HH:MM:SS.mmm`, sans identifiant ;
  le texte du segment perd ses espaces de début et de fin, rien d'autre. Un segment vide ou blanc est
  exclu et compté (`segments_exclus`), jamais écrit en cue vide. Un texte contenant un saut de ligne,
  `-->`, `<` ou `&`, ou des segments hors d'ordre ou chevauchants : refus, rien n'est écrit. Aucun
  segment porteur de texte : refus, aucun `.vtt` vide.
- **Non-réécriture** : un `.vtt` existant n'est **jamais** réécrit, même si une nouvelle
  transcription différerait ; il est signalé « déjà transcrite ». Le `.vtt` est écrit avant sa fiche
  (une fiche n'existe jamais sans lui) ; un `.vtt` sans fiche, ou une fiche sans `.vtt`, est un refus
  nommé : aucune fiche n'est reconstituée après coup.

Fiche décrite par `schema/transcription.schema.json`, mêmes règles d'écriture qu'en §5 (JSON UTF-8,
deux espaces, ordre des clés fixe, saut de ligne final, écriture atomique, immuable) :

| Champ | Contenu |
| --- | --- |
| `sha256_source` | empreinte du média archivé ; nomme le `.vtt` et la fiche |
| `vtt_sha256` | empreinte des octets du `.vtt` |
| `date_transcription` | instant de la transcription |
| `duree_audio_s` | durée du flux audio décodé, en secondes |
| `cues`, `segments_exclus` | nombre de cues écrits, nombre de segments vides ou blancs exclus |
| `modele` | `{alias, depot, revision, fichiers: [{nom, sha256}]}` : SHA-256 de chaque fichier de poids chargé, calculé sur le disque |
| `moteur` | `{faster_whisper, ctranslate2}` : versions exactes |
| `parametres` | `{chargement, decodage}` : arguments de `WhisperModel` et de `transcribe`, tous écrits |

## 3. Copie locale d'une source — `source.chemin_local`

Chemin relatif à la racine du dépôt, vers le document archivé tel quel : le PDF publié, la page HTML
capturée, le fichier audio ou vidéo. Jamais réécrit, jamais reformaté.

L'interface de validation **recalcule le sha256 de ce fichier avant tout affichage** et refuse
d'afficher en cas de divergence avec `source.sha256`. « La source telle qu'archivée » est ainsi une
propriété vérifiée à chaque affichage, pas une promesse tenue par convention.

## 4. Ce que l'interface de validation lit et écrit

| Chemin | Accès | Remarque |
| --- | --- | --- |
| `staging/items/*.json` | lecture seule | |
| `staging/mesures/*.json` | lecture seule | |
| `staging/textes/*.txt` | lecture seule | |
| `staging/transcriptions/*.vtt` | lecture seule | |
| `source.chemin_local` | lecture seule | servi après vérification d'empreinte |
| `validation/lots/*.json` | lecture ; écriture par `pnpm lots` uniquement | manifeste immuable une fois écrit |
| `validation/decisions/<annotateur>/*.jsonl` | ajout en fin de fichier uniquement | jamais de réécriture, jamais de suppression |
| `validation/brouillons/<annotateur>.json` | lecture et écriture | hors dépôt, hors publication |
| `validation/mesures/decisions.json` | lecture ; ajout par `pnpm mesures --ecrire` uniquement | registre publié des corrections de thème, en ajout seul : une entrée n'est jamais modifiée ni retirée, un revirement est une entrée de plus. `pnpm promote` le lit, ne l'écrit jamais |
| `data/` | **aucun** | seul `pnpm promote --ecrire`, lancé par un humain, y écrit |

## 5. Collecte des sources — `config/sources.toml`, `archives/`, `staging/sources/`, `staging/archivages/`

La collecte (`pipeline/collecte`, `pnpm collecte config/sources.toml`) récupère une **liste
explicite** d'URL tenue par l'auteur, sans crawl ni suivi de liens. Pour chaque source, elle
télécharge le document et calcule le SHA-256 des octets reçus. Un contenu nouveau est copié tel quel
dans `archives/`, sauvegardé sur la Wayback Machine et décrit par un **manifeste de contenu** ;
chaque source reçoit en outre sa **fiche**, qui pointe ce contenu. §4 du protocole : « la collecte
est horodatée et archivée (copie locale, empreinte SHA-256, sauvegarde Wayback Machine) ».

Le contenu et la source sont séparés parce que deux sources peuvent servir les mêmes octets (un
programme commun à deux adresses, ou listé pour deux candidats) : le document est archivé une seule
fois, et aucune source listée ne perd ses métadonnées.

### 5.1 Liste des sources — `config/sources.toml`

Écrite à la main par l'auteur seul ; aucun script ne l'écrit. Exemple commenté :
`pipeline/collecte/exemples/sources.exemple.toml`. TOML parce que `tomllib` est dans la
bibliothèque standard de Python 3.12 et accepte les commentaires.

```toml
[[source]]
url = "https://example.org/candidat-a/programme-2027.pdf"
candidat_id = "candidat-a"
tier = "T1"
type_document = "programme_pdf"
date_source = 2026-09-01          # date TOML nue : ni guillemets, ni heure
publication = "publique"

[[source]]
url = "https://example.org/parti-b/propositions"
candidat_id = "candidat-b"
tier = "T1"
type_document = "site_parti"
date_source = 2026-08-15
publication = "publique"
site_parti_tient_lieu_de_campagne = true
```

| Champ | Obligatoire | Valeurs |
| --- | --- | --- |
| `url` | oui | URL `http` ou `https` avec un hôte |
| `candidat_id` | oui | `commun#/$defs/identifiant_court` |
| `tier` | oui | `commun#/$defs/tier` : `T1`, `T2`, `T3` |
| `type_document` | oui | énumération de `commun#/$defs/source/properties/type_document` |
| `date_source` | oui | date TOML nue `AAAA-MM-JJ` : date de la source elle-même (§4) |
| `publication` | oui | `publique` ou `interne` (§10, droit d'auteur) |
| `site_parti_tient_lieu_de_campagne` | si et seulement si `type_document = "site_parti"` | `true` ou `false` |

Aucune autre clé n'est admise, ni dans une source ni au premier niveau. Un seul problème (champ
manquant, inconnu, hors énumération, mal typé) **refuse tout le fichier avant le moindre
téléchargement** ; chaque problème est rapporté avec le numéro et l'URL de la source fautive. Aucune
valeur par défaut. Les énumérations sont lues dans `schema/commun.schema.json`, jamais recopiées.

Le tier suit le type de document (§4, protocole 0.13), selon une table fermée écrite une fois dans
`commun#/$defs/tier_selon_type_document`, lue par la collecte et appliquée par
`schema/fiche-source.schema.json` :

| `type_document` | Tier admis |
| --- | --- |
| `programme_pdf`, `site_officiel`, `tribune_signee`, `communique_campagne` | `T1` |
| `site_parti` avec `site_parti_tient_lieu_de_campagne = true` | `T1` |
| `site_parti` avec `site_parti_tient_lieu_de_campagne = false` | `T3` |
| `enregistrement_video`, `enregistrement_audio` | `T2` |
| `article_presse` | `T3` |

Un tier qui contredit son type refuse tout le fichier, comme tout autre problème.

### 5.2 Politesse

Norme du §6, appliquée à toute la collecte : respect de `robots.txt` et au plus une requête par
seconde **par hôte**, mesurée entre deux débuts de requête, `robots.txt` et redirections compris.
User-Agent : `BancEssai2027-collecte/0.1 (+https://github.com/AzurNow/DEMOCRATIE_2027)`.

| `robots.txt` répond | Effet |
| --- | --- |
| 2xx | règles appliquées ; une URL interdite est refusée et consignée, jamais contournée |
| 401 ou 403 | tout l'hôte est interdit |
| autre 4xx (404…) | pas de `robots.txt` : tout est permis |
| 5xx, erreur réseau, délai dépassé, contenu non UTF-8 | **erreur consignée**, jamais une autorisation |

`robots.txt` est lu une fois par origine et par lot ; son résultat, erreur comprise, vaut pour tout
le lot. Les redirections (301, 302, 303, 307, 308) sont suivies une à une, cinq au plus, chaque
étape repassant par la cadence et par le `robots.txt` de sa cible ; une cible hors `http`/`https`
est un échec.

### 5.3 Copie locale — `archives/<sha256[0:2]>/<sha256><extension>`

Hors Git (`.gitignore`). Octets reçus écrits tels quels : ni BOM retiré, ni fins de ligne
converties, ni réencodage ; le SHA-256 porte sur ces octets. L'extension vient d'une table fermée
de `Content-Type` (`pipeline/collecte/archivage.py`) ; un type absent de la table, ou un en-tête
absent, donne `.bin`, et le type reçu reste consigné dans le manifeste. Écriture atomique (fichier
temporaire `.<nom>.*.partiel` dans le même répertoire, puis renommage) : une interruption ne laisse
jamais de fichier partiel sous le nom définitif. Une archive n'est jamais écrasée.

### 5.4 Manifeste de contenu — `staging/sources/<sha256>.json`

Décrit par `schema/collecte.schema.json`. Écrit à la **première** collecte de ces octets, quelle
que soit la source qui les a servis. JSON UTF-8, indentation de deux espaces, ordre des clés fixe,
saut de ligne final, écriture atomique. **Immuable une fois écrit.**

| Champ | Origine |
| --- | --- |
| `sha256` | empreinte des octets archivés ; c'est aussi le nom du fichier |
| `chemin_local` | chemin de l'archive, relatif à la racine du dépôt |
| `taille_octets` | nombre d'octets reçus, au moins 1 |
| `type_contenu_recu` | en-tête `Content-Type` tel que reçu à la première collecte, ou `null` s'il manquait ; pour un enregistrement copié par yt-dlp, type du conteneur retenu (§2.1) |
| `date_premiere_collecte` | instant de fin du premier téléchargement qui a produit ces octets, ISO 8601 avec décalage |
| `url_soumise` | URL soumise à Save Page Now : l'`url` listée (jamais `url_finale`) de la source qui a servi ces octets en premier |
| `archive_url` | instantané daté renvoyé par Save Page Now — **ou** — |
| `echec_archivage` | `{service: "wayback_save_page_now", motif, tentatives}` quand la sauvegarde a échoué |

Exactement un des deux derniers est présent. `archive_url` n'est jamais fabriqué : seule une URL
`/web/<AAAAMMJJhhmmss>/…` renvoyée par le service (en-tête `Location` ou `Content-Location`) en
tient lieu. La sauvegarde est tentée trois fois, espacées de dix secondes.

Ce que le manifeste **ne porte pas** : les métadonnées d'une source (elles sont dans la fiche, §5.5)
et le texte canonique. `texte_sha256` (§1) est produit par le sous-lot C2 dans une fiche
d'extraction à part (§1.1), rangée sous le même `sha256` ; le manifeste étant immuable, il ne peut
pas le recevoir après coup.

### 5.5 Fiche de source — `staging/sources/par-source/<cle_source>/<sha256>.json`

Décrite par `schema/fiche-source.schema.json`. Une fiche par entrée de `config/sources.toml` **et**
par contenu obtenu ; mêmes règles d'écriture que le manifeste, immuable.

`cle_source` est le SHA-256 (hexadécimal minuscule) de la chaîne UTF-8 `candidat_id + "\n" + url`.
La même `url` listée pour deux candidats donne donc deux sources et deux fiches : un programme
commun appartient aux deux. Le répertoire d'une source garde l'historique de ses contenus
successifs, un fichier par `sha256`.

| Champ | Origine |
| --- | --- |
| `url`, `candidat_id`, `tier`, `type_document`, `site_parti_tient_lieu_de_campagne`, `date_source`, `publication` | repris de la liste des sources ; la mention `site_parti_…` si et seulement si `type_document = "site_parti"` |
| `url_finale` | URL qui a servi les octets à cette collecte, après redirections |
| `sha256` | contenu obtenu, qui nomme le manifeste de §5.4 |
| `date_collecte` | instant de fin du téléchargement de cette source qui a produit ces octets |

La fiche est écrite **après** le manifeste qu'elle pointe : une fiche n'existe jamais sans son
manifeste. Avec lui, elle alimente champ pour champ `commun#/$defs/source`, le lien d'archive
venant de §5.7.

### 5.6 Reprise d'archivage — `staging/archivages/<sha256>.json`

Décrite par `schema/reprise-archivage.schema.json`. Le manifeste étant immuable, un échec de Save
Page Now se reprend dans un fichier à part, jamais en réécrivant le manifeste.

**Déclencheur, et seulement lui** : la collecte télécharge une source, obtient un `sha256` dont le
manifeste existe déjà, porte `echec_archivage`, et pour lequel aucun fichier de reprise n'existe.
Le contenu servi aujourd'hui est alors identique au document archivé : c'est la seule condition où
un instantané Wayback pris maintenant lui correspond. Save Page Now est retenté pour l'`url` listée
de cette source (trois tentatives, comme en §5.4).

- Succès : `staging/archivages/<sha256>.json` est écrit avec `sha256`, `date_reprise`,
  `url_soumise` et `archive_url`. Il est immuable.
- Échec : rien n'est écrit, l'échec est nommé dans le rapport, le code de sortie est non nul. La
  collecte suivante des mêmes octets retentera.
- Contenu changé : aucune reprise pour l'ancien `sha256`, qui ne correspond plus à ce que le serveur
  sert ; le nouveau contenu suit le chemin normal avec son propre archivage.

### 5.7 Lien d'archive effectif — `pipeline/collecte/lien_archive.py:archive_url_de`

`archive_url_de(racine, sha256)` est la seule résolution du lien d'archive d'un contenu. L'extraction
(C2) et tout ce qui affiche une source l'appellent au lieu de lire les fichiers :

| Manifeste | Reprise | Résultat |
| --- | --- | --- |
| `archive_url` | absente | l'`archive_url` du manifeste |
| `echec_archivage` | présente | l'`archive_url` de la reprise |
| `echec_archivage` | absente | `None` : la source ne peut pas s'afficher (règle 2 de `CLAUDE.md`), l'appelant doit traiter l'absence |
| `archive_url` | présente | erreur `ArchivageIncoherent` |
| absent | — | erreur `ManifesteAbsent` |

Une reprise dont le `sha256` diffère du nom de son fichier, ou un manifeste qui porte les deux
branches ou aucune, lèvent aussi `ArchivageIncoherent`. Aucun lien n'est jamais inventé.

Le bloc `commun#/$defs/source` d'un item s'assemble, lui, par `pipeline/collecte/source.py:source_de`,
qui appelle `archive_url_de` et lit la fiche de source, le manifeste et la fiche d'extraction (§1.1) ;
une source sans lien d'archive effectif y lève `SourceSansArchive`. C'est le seul assemblage : un
consommateur qui recomposerait la source lui-même manquerait une reprise.

### 5.8 Cas de collecte

| Situation | Archive | Manifeste de contenu | Fiche | Reprise | Rapport, code de sortie |
| --- | --- | --- | --- | --- | --- |
| contenu nouveau, Wayback en succès | écrite | écrit, avec `archive_url` | écrite | — | « collecté », 0 |
| contenu nouveau, Wayback en échec | écrite | écrit, avec `echec_archivage` | écrite | — | « ARCHIVAGE EN ÉCHEC », 1 |
| fiche de cette source pour ce contenu déjà présente, lien effectif présent | inchangée | inchangé | inchangée | inchangée | « déjà collectée », 0 |
| nouvelle source (ou fiche manquante) dont le contenu est déjà archivé, lien effectif présent | inchangée | inchangé | **écrite** | inchangée | « contenu déjà archivé, fiche ajoutée », 0 |
| contenu connu, manifeste en échec, sans reprise, Wayback en succès | inchangée | inchangé | écrite si absente | **écrite** | « archivage repris » (« , fiche ajoutée »), 0 |
| contenu connu, manifeste en échec, sans reprise, Wayback en échec | inchangée | inchangé | écrite si absente | aucune | « REPRISE D'ARCHIVAGE EN ÉCHEC », 1 |
| même source, contenu différent | nouvelle | nouveau ; l'ancien reste | nouvelle, dans le même répertoire ; l'ancienne reste | — | « collecté », 0 |
| HTTP autre que 200 après redirections, délai dépassé, erreur réseau, réponse de 0 octet, `robots.txt` interdit ou injoignable, redirection hors http(s) | aucune | aucun | aucune | aucune | « ÉCHEC » avec le motif, 1 |
| liste des sources invalide | aucune | aucun | aucune | aucune | erreurs sur la sortie d'erreur, 2, rien n'est téléchargé |

Un échec n'arrête pas le lot : les sources suivantes sont collectées, et le code de sortie final
est non nul. Deux sources du même lot qui servent les mêmes octets sont traitées dans l'ordre de la
liste : si la sauvegarde de la première échoue, la seconde déclenche aussitôt une reprise (§5.6).
