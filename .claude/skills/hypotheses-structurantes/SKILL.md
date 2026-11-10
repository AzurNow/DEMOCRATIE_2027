---
name: hypotheses-structurantes
description: Examen des hypothèses structurantes du Banc d'essai 2027 — l'objet mesuré, le canal (API plutôt qu'application), la liste d'outils, les destinataires, le levier par lequel un chiffre publié change quelque chose, le calendrier, l'ampleur de la rigueur, la forme des livrables, le projet à une personne, le gel définitif, les règles 1 et 3 de CLAUDE.md et les décisions déjà tranchées — traitées comme des paris falsifiables sur le monde, pas comme un étalon. Le critère est l'utilité réelle du projet, dont la crédibilité est un moyen. Chaque hypothèse reçoit les faits que le web et le calcul fournissent (usages révélés, littérature, analogues, tout sourcé et daté), ce qui la falsifierait, le test le moins cher, et la meilleure alternative avec ce qu'elle coûte en code écrit, en calendrier et en crédibilité. Ne remplace ni critique-protocole (qui cherche les failles du protocole à cadre donné et propose le moins possible) ni conformite-protocole. Hors champ, l'intégrité de la preuve, la neutralité entre candidats, l'honnêteté de la publication et l'indépendance. À lancer à la main (/hypotheses-structurantes) avant le gel de la 1.0, après le run pilote et les premiers runs réels, et quand un pari assumé rencontre un fait. Tient un registre dans docs/fondations/ ; ne réécrit rien ; chaque décision revient à l'auteur.
model: fable
effort: max
disable-model-invocation: true
---

# Hypothèses structurantes

Le protocole repose sur des énoncés qu'aucune relecture ne vérifie : que ce qu'une API répond
renseigne sur ce qu'un électeur lit, que les erreurs qui comptent portent sur les positions
programmatiques, qu'un éditeur corrige son outil parce qu'un chiffre est publié, qu'un régulateur ou
une rédaction s'en saisit, que le premier résultat arrive assez tôt pour servir. Ce sont des **paris
sur le monde**. `critique-protocole` les prend pour cadre et cherche ce qu'un relecteur reprocherait
à la méthode ; `conformite-protocole` vérifie que le code applique le texte. Cette passe prend le
cadre lui-même pour **hypothèse** et cherche ce que le monde en sait déjà.

**Le critère.** Décision de l'auteur du 2026-11-10 : le but du projet est son utilité réelle, un
effet positif sur la démocratie ; la crédibilité est un moyen de cet effet, pas une fin. Une règle
qui ajoute de la crédibilité sans que personne n'agisse sur le résultat est donc dans le champ, et
un résultat irréprochable que personne n'utilise est un échec. Le protocole n'écrit nulle part qui
agit sur un résultat ni ce qui compterait comme un succès : reconstruire cette chaîne (mesure,
publication, destinataire, action, effet pour l'électeur) est le premier travail de la passe, et
chaque maillon est une hypothèse.

La posture est générative mais disciplinée. Une hypothèse est **une phrase du protocole, le
mécanisme qu'elle suppose, et ce qui la falsifierait** ; « il faudrait réfléchir à » n'est pas une
hypothèse. La passe apporte des **faits** (un calcul, une source datée), pas des opinions ; une
opinion s'écrit « pari », jamais « constat ». Une hypothèse ne mérite le registre que si sa chute
changerait l'objet mesuré, le canal, les outils, les destinataires, la forme des livrables, le
calendrier, la gouvernance ou une règle du champ. Douze hypothèses au plus : au-delà, ce sont des
détails, et ils appartiennent à `critique-protocole`.

Contrairement à `critique-protocole`, cette passe n'est pas avare : elle a le droit de proposer de
changer un élément structurant. En échange, elle paie le prix complet de chaque proposition, parce
que le code existe déjà et que la date du premier tour ne bouge pas (voir « Statuer et proposer »).

## Hors champ

Quatre choses ne se négocient contre aucun gain d'utilité, parce qu'un projet qui les perd nuit à
l'élection qu'il veut servir. Liste retenue le 2026-11-10 sur l'option recommandée (D104 de
`docs/feuille-de-route.json`) ; l'auteur peut la rouvrir, la passe jamais. Une hypothèse qui
exigerait d'en affaiblir une s'écrit **impossible**, pas « option ».

1. **L'intégrité de la preuve.** Ne jamais rédiger, inventer ni compléter un item, une citation ou
   une position de candidat (`CLAUDE.md`, « Jamais, sous aucun prétexte ») ; rien ne s'affiche sans
   source (règle 2) ; le test verbatim est une comparaison de chaînes (règle 5) ; les réponses
   brutes sont immuables (règle 7).
2. **La neutralité entre candidats.** Les engagements de neutralité du §10, la symétrie testée
   (règle 4), et « Les outils sont notés ; les candidats ne le sont jamais » (§3).
3. **L'honnêteté de la publication.** La méthode est publique avant la mesure qu'elle gouverne ;
   les résultats sont publiés quels qu'ils soient ; aucun choix a posteriori de candidat, d'outil ou
   de question (§1) ; aucun chiffre ne sort sans ce qui le produit (règle 8).
4. **L'indépendance à l'égard des évalués.** Aucun financement, don ni accès privilégié venant d'un
   parti, d'un candidat, d'une campagne ou d'un éditeur d'outil évalué (§1).

Ce qui reste **dans le champ**, y compris quand le texte le présente comme acquis : *quand* geler
et *quoi* geler, la décision de ne plus affiner après le gel, la règle 1 (site statique, aucun
modèle au runtime) et la règle 3 (validation humaine de toute donnée) pour leur étendue et leur
coût, la forme et le volume de ce qui est publié, un partenariat avec un laboratoire, une rédaction
ou une institution, le projet à une personne, et toute décision D1 à Dn.

Hors champ aussi : le code, la cohérence code ↔ protocole, la qualité de la méthode à cadre donné.
Et deux interdits propres à cette passe :

- **Aucun outil évalué n'est interrogé sur un candidat**, ni par la session, ni par un sous-agent,
  ni « pour voir ». Regarder des réponses avant le gel ruinerait le préenregistrement (§1) ; le seul
  cadre où elles se regardent est le run pilote du protocole, que l'auteur lance.
- **Aucun candidat nommé** dans le registre, les passes ou les fichiers des sous-agents. Les faits
  portent sur des outils, des usages, des publics et des institutions ; jamais sur un candidat ou un
  parti. Un fait qui ne tiendrait que pour un camp est retiré.

## Les preuves admises, par force décroissante

1. **Calcul.** Ce que le protocole et l'état du projet impliquent réellement : effectifs, coûts,
   heures humaines, dates atteignables d'après `docs/feuille-de-route.json`, nombre de runs avant
   le premier tour, part d'un usage mesuré que couvre la liste d'outils. Script jetable dans
   `scratch/fondations/AAAA-MM-JJ/`, hypothèses écrites, versionné avec la passe pour que chaque
   chiffre se refasse. Les données extérieures se téléchargent hors du dépôt et n'y entrent pas.
2. **Usage révélé.** Ce que des gens ont *déjà fait* : audits comparables d'assistants IA sur une
   élection et ce qui les a suivis (correction par un éditeur, reprise par une rédaction, citation
   par un régulateur, rien), enquêtes d'usage qui mesurent qui interroge quoi et par quel canal,
   dépôts et jeux de données réutilisés ou non, post-mortems. Ce que des gens *disent* qu'ils
   feraient n'en fait pas partie.
3. **Littérature.** Ce qui est établi sur l'effet d'un audit public sur un éditeur, d'un
   classement sur un marché, d'une vérification des faits sur un électeur, de l'écart entre une API
   et son application ; une étude citée est lue, pas déduite de son titre.
4. **Analogues.** D'autres pays, d'autres élections, d'autres domaines d'audit ; chaque analogie
   dit où elle casse.
5. **Pari.** Le raisonnement seul. Admis, écrit comme tel, jamais déguisé.

Tout fait extérieur porte son URL et sa date de consultation, ou disparaît. Le modèle ne sait rien
du monde d'aujourd'hui de mémoire : parts d'usage, produits, textes en vigueur et études récentes se
cherchent (WebSearch, WebFetch). Une question de droit se formule **pour l'avocat** (§10), jamais
comme un avis.

**Le biais, écrit dans chaque passe.** Le web sur-représente les audits qui ont été publiés et
repris, les éditeurs qui communiquent, et l'anglais. L'électeur qui interroge un assistant ne
laisse aucune trace publique de sa question. L'absence de trace n'est pas une absence d'usage ; un
article de presse sur un audit n'est pas un outil corrigé. Le registre dit, pour chaque
destinataire, s'il est observé directement, par analogie, ou pas du tout.

**Ce que le web ne dira jamais.** Ce qu'un destinataire fera d'un rapport qui n'existe pas encore.
Pour les hypothèses de comportement (« l'éditeur corrigera », « la rédaction reprendra », « le
régulateur s'en saisira », « l'électeur vérifiera »), la passe ne conclut pas : elle prépare un
**essai de terrain** (étape 6) que seul l'auteur peut exécuter. Le mot « pilote » est réservé au run
pilote du protocole (§7, §12).

## Étape 0 — Vérifier le modèle

Mêmes vérifications que `critique-protocole`, étape 0 : `CLAUDE_CODE_EFFORT_LEVEL` non définie ou
`max`, sous-agents lancés avec `model: "fable"` et `effort: "max"` explicites, arrêt si l'un retombe
sur un autre modèle, modèles inscrits à la passe. L'en-tête ne vaut que pour le tour : tout se fait
dans ce tour, et tout ce qui est formé s'écrit au fil de l'eau dans le répertoire temporaire de la
session.

## Procédure

1. **Arbre propre**, branche `docs/fondations-AAAA-MM-JJ` tirée de `main`. Relever le commit, la
   version du protocole (§1) et dire si elle est gelée. Lire : `CLAUDE.md`, `HANDOFF.md`,
   `README.md` ; de `docs/PROTOCOLE.md`, en entier les §1 (hors liste des révisions), §2, §3 et §9 à
   §12, et le premier paragraphe de chaque rubrique des §4 à §8 ; `docs/feuille-de-route.json`
   (jalons, lots et leur avancement, décisions) ; `docs/PLAN-PAGE-PEDAGOGIQUE.md` ;
   `docs/TACHES-AUTEUR.md` ; le registre `docs/fondations/registre.md` et la passe la plus récente
   de `docs/fondations/` s'ils existent ; le rapport le plus récent de `docs/critiques/` (ses
   constats d'utilité et de faisabilité, et sa liste « Écartés », sont des candidats). Le détail des
   §4 à §8 se lit quand une hypothèse y renvoie.

2. **Reconstruire la chaîne d'utilité, puis extraire les hypothèses**, dans la session, sans
   sous-agent : c'est de la lecture du protocole, pas du monde. D'abord la chaîne, en cinq lignes au
   plus, telle que les textes la laissent lire : ce qui est mesuré, ce qui est publié, qui le
   reçoit, ce qu'il en fait, ce que l'électeur y gagne. Un maillon que rien n'écrit se note
   « rien », avec les termes cherchés en vain. Puis, pour chaque hypothèse : la phrase exacte, le
   mécanisme supposé, ce qui la falsifierait, ce qui changerait dans le projet si elle tombait. Les
   pistes de `references/pistes.md` sont un point de départ ; une hypothèse qu'aucune piste ne
   prévoit reste une hypothèse. Une passe suivante repart du registre : une hypothèse tranchée par
   l'auteur ne revient pas sans fait nouveau.

3. **Deux sous-agents, en un seul message**, `general-purpose`, `model: "fable"`, `effort: "max"`,
   chacun avec un fichier de résultats dans le répertoire temporaire, complété au fil de l'eau.
   Chaque brief porte les deux interdits de « Hors champ ».
   - **Relevé du monde** : reçoit les hypothèses sous forme de **questions**, jamais avec la réponse
     attendue, et les preuves admises 2 à 4. Pour chacune : ce qui existe, ce qui s'est passé
     ensuite, ce qui a échoué et pourquoi, ce que la littérature établit, les analogues et où ils
     cassent. URL et date pour tout ; rien de mémoire.
   - **Calculs** : reçoit les hypothèses quantifiables et les chemins du dépôt utiles (protocole,
     feuille de route, `config/`). Pour chacune : les données, le script, les hypothèses de calcul,
     le résultat, et ce qu'il permet ou non de conclure.

   Pendant qu'ils travaillent, la session fait l'étape 4 sur ce qui ne dépend pas d'eux.

4. **Vérifier soi-même**, sans déléguer : chaque citation du protocole existe mot pour mot (`grep
   -F`) ; le protocole ne répond pas déjà ailleurs (un texte de cette densité traite souvent au §11
   ce qu'on croit manquer au §3) ; chaque URL est ouverte et dit ce qu'on lui fait dire ; chaque
   calcul est relancé après relecture de ses hypothèses ; chaque fait a une date. Avant de changer
   le statut d'une hypothèse, écrire **l'argument contraire le plus fort** et y répondre sur pièces ;
   s'il tient, le statut ne change pas. Un fait non vérifié est retiré, pas gardé « à vérifier ».

5. **Statuer et proposer**, selon `references/registre.md`. Les statuts : **confirmée** (faits pour,
   rien contre), **infirmée** (faits contre), **à tester** (le test, son coût, qui l'exécute, ce qui
   compterait comme falsification), **pari assumé** (aucune preuve possible avant la réalité ;
   l'auteur choisit de parier et l'écrit). Pour chaque hypothèse infirmée ou à tester : **une seule
   alternative**, la meilleure, recommandation en premier, avec son prix complet :
   - ce qu'elle change dans le protocole (sections), et si c'est une révision avant gel ou, après
     le gel, un amendement du §9, jamais rétroactif ;
   - le code écrit qu'elle rend inutile et celui qu'elle demande, par lot de la feuille de route ;
   - son effet sur le calendrier, compté en runs publiés avant le premier tour ;
   - ce qu'elle coûte en crédibilité : quelle lentille de `critique-protocole` elle rouvre ;
   - l'effet attendu sur un maillon nommé de la chaîne d'utilité, et la preuve qui le fonde.

   Pas de liste d'options pour se couvrir. « Ne rien changer » est une conclusion légitime quand le
   prix dépasse le gain : elle s'écrit, avec le calcul. La qualité passe avant les dates
   (`HANDOFF.md`), mais le premier tour ne se repousse pas : la passe chiffre cette tension, l'auteur
   la tranche.

6. **Préparer les essais de terrain**, pour les hypothèses de comportement que le web ne tranche
   pas. Un essai est une procédure que l'auteur exécute seul, hors du dépôt : un rapport d'exemple,
   bâti sur le jeu de démonstration et marqué fictif, remis à une personne qui peut agir ; les
   questions que de vrais électeurs posent, et où ils les posent. La passe écrit pour chaque essai :
   l'hypothèse testée, la procédure pas à pas, ce qu'il faut observer, le résultat qui falsifierait,
   le coût en heures, et ce que le §10 lui impose (aucun canal privilégié : ce qui est demandé à un
   éditeur l'est à tous, dans les mêmes termes, et se publie). Le résultat revient au registre en
   agrégat ou en « oui / non », sans nom de personne ; aucune donnée personnelle n'entre au dépôt.

7. **Écrire** : le registre `docs/fondations/registre.md` (vivant, une entrée par hypothèse) et la
   passe datée `docs/fondations/AAAA-MM-JJ.md`, au gabarit de `references/registre.md`. Une décision
   qui revient à l'auteur devient une décision `en_attente` dans `docs/feuille-de-route.json`, au
   format des décisions existantes, options réelles et recommandation en premier ; puis `pnpm
   feuille-de-route`. Commiter le registre, la passe, ses scripts et la feuille de route, pousser,
   ouvrir une PR qui ne contient que cela ; fusion selon `HANDOFF.md`. **Rien d'autre ne change
   pendant la passe** : ni le protocole, ni une règle, ni un jalon.

8. **Après les décisions de l'auteur**, dans des tours ultérieurs : texte de la révision dans une PR
   qui ne touche que les zones d'arrêt, que **l'auteur fusionne** ; puis `critique-protocole` sur le
   nouveau cadre, et `conformite-protocole` pour le code qui doit suivre.

## Règles de la passe

1. **Une phrase, un mécanisme, une falsification.** Sans les trois, ce n'est pas une hypothèse.
2. **Des faits, pas des avis.** Un énoncé sur le monde porte sa preuve (1 à 4) et sa date, ou
   s'écrit « pari ».
3. **Calculer plutôt qu'estimer**, et montrer le calcul.
4. **Le biais est écrit**, pour chaque passe et pour chaque destinataire.
5. **Une alternative, la meilleure, avec son prix complet** ; jamais de réécriture du protocole
   dans la passe.
6. **Les quatre hors-champ ne se discutent pas** ; ce qui en aurait besoin s'écrit impossible.
7. **Aucun outil interrogé sur un candidat, aucun candidat nommé.**
8. **Ne jamais trancher à la place de l'auteur.** La passe recommande ; il décide.
9. **Ne rien inventer** : ni chiffre d'usage, ni étude, ni texte de loi, ni précédent de mémoire.
10. **Court.** Douze hypothèses au plus ; une entrée tient en une page ; une passe se lit en vingt
    minutes.

## Quand la lancer

- **Avant le gel de la 1.0.** Tant que le protocole est en 0.x, changer un élément structurant
  coûte une révision et le code bâti dessus ; après, un amendement, et des résultats rapportés
  séparément avant et après (§9). Polir un cadre par `critique-protocole` avant d'avoir demandé
  s'il est le bon, c'est risquer de travailler pour rien.
- **Après le run pilote, puis après les premiers runs publiés** et après chaque essai de terrain :
  la réalité a parlé, les statuts bougent.
- **Après le gel**, la passe reste permise, contrairement à `critique-protocole`. Elle dit alors
  pour chaque alternative ce qui se fait sans toucher au protocole (diffusion, forme du rapport et
  du site, destinataires, partenariat), ce qui exige un amendement, et ce qui attend un protocole
  suivant.
- **Quand un pari assumé rencontre un fait** : une passe courte, sur cette hypothèse seule.

## Après la passe

Ce que la passe a payé d'inattendu (une hypothèse que le calcul a renversée, une source qui disait
le contraire de son titre, un essai qui a mesuré autre chose que ce qu'il visait) va dans
`LESSONS.md` ; une question de lecture qui manquait va dans `references/pistes.md`.
