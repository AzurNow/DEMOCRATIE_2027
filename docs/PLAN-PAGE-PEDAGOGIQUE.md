# Plan — page pédagogique du site (« Comment ça marche »)

Statut : **plan, non lancé.** Rédigé le 2026-11-05 à la demande de l'auteur ; aucun code n'est
écrit tant que l'auteur ne l'a pas validé et n'a pas dit de commencer.

## Place dans le projet

Cette page est **la seule partie du site faite avant que le reste du code soit terminé et
optimisé.** Le site fonctionnel — résultats des runs, items, réponses brutes, notations,
contestations, tout ce qui affiche un chiffre — n'est commencé qu'après : fin du code de D75 et des
décisions suivantes, matrice de conformité close hors site, passe d'optimisation, revue de code.
Le lot `site` de `docs/feuille-de-route.json` reste à T0 et garde ses dépendances (`analyse`,
`go-no-go`) ; cette page n'en est pas le début déguisé.

Elle sert de **documentation utilisateur** : expliquer à un électeur, un journaliste ou un éditeur
d'outil ce que le banc mesure, comment, et ce qu'il ne mesure pas, sans lire les 570 lignes du
protocole. Elle renvoie au protocole pour tout ce qui fait foi.

## Ce que la page n'a pas le droit de faire

Les huit règles de `CLAUDE.md` valent ici comme ailleurs.

- **Aucun chiffre de mesure.** Pas de taux, de classement ni de résultat, même « pour l'exemple » :
  aucun chiffre du site ne vient d'ailleurs que de `runs/`, et il n'existe aucun run. Les exemples
  sont explicitement fictifs et marqués comme tels (« Candidat A », « Outil X », « Mesure M »).
  Les seuls nombres admis sont des paramètres du protocole (deux juges, 10 % d'échantillon humain,
  fenêtre de 48 heures…), chacun avec le paragraphe qui le fixe.
- **Aucun candidat réel ni aucun outil réel dessiné, nommé ou caricaturé.** Un portrait pixel est
  déjà un traitement ; la symétrie se joue aussi là. Les outils sont nommés seulement dans la liste
  du périmètre, en texte, quand elle sera gelée — pas sur cette page.
- **Aucun appel réseau au runtime** (règle 1) : polices, images et scripts sont servis par le site
  lui-même. Pas de Google Fonts en ligne, pas d'analytics, pas de CDN.
- **Aucun contenu qui contredit le protocole.** Chaque étape cite sa section (« §5 ») avec un lien
  vers `docs/PROTOCOLE.md` publié. Le texte décrit des principes stables, pas les détails que les
  révisions avant la 1.0 changent encore.
- **Inspiration, pas copie.** Le rythme éditorial de 16personalities (grandes sections illustrées,
  parcours en étapes, ton accessible) et l'esthétique pixel art (Terraria pour les décors en tuiles,
  Hotline Miami pour les couleurs saturées et les contrastes) servent de référence d'ambiance.
  Aucun sprite, aucune palette signature, aucune police ni aucune composition de ces œuvres n'est
  reprise.

## Contenu

Une page longue, en sections défilantes, plus une FAQ. Ordre proposé :

1. **Accroche.** « Que répondent les IA quand on leur demande ce que propose un candidat ? » Une
   phrase sur l'objet (§2) et une sur ce que le projet n'est pas : ni un comparateur de programmes,
   ni un avis sur les candidats, ni un classement des candidats.
2. **Le parcours d'une question**, en sept étapes illustrées, chacune avec son « pourquoi » :
   1. *Collecter* ce que les candidats ont publiquement dit, sources archivées et empreintes (§4).
   2. *Valider* : deux humains vérifient chaque position, la citation doit figurer mot pour mot
      dans sa source (§4).
   3. *Poser les mêmes questions à tous* : gabarits, formulations neutre, familière et orientée,
      tirage à graine publique, tests de symétrie bloquants (§5).
   4. *Interroger les outils* dans les mêmes conditions, fenêtre de 48 heures, réponses brutes
      gardées telles quelles (§6).
   5. *Noter* : deux juges automatiques de familles différentes, des humains sur un échantillon et
      sur tout désaccord, tests contrefactuels contre les biais (§7).
   6. *Analyser* avec des règles écrites avant les résultats, intervalles de confiance, hypothèses
      publiées qu'elles soient confirmées ou non (§8).
   7. *Tout publier* : données, réponses brutes, notations, code, ou rien (§9).
3. **Les questions de recherche** (QR1 à QR9), en cartes : une question en langage courant, la
   métrique en une ligne.
4. **Ce qu'on ne mesure pas** : une sélection des limites du §11 (API ≠ application, vérité de
   référence = ce qui est public et explicite, le juge est un modèle, français seul, projet à une
   personne), avec un lien vers la liste complète.
5. **Préenregistrement** : pourquoi la méthode est publiée et gelée avant toute mesure (§1).
6. **Contester** : comment signaler une erreur sur une position de référence (§4, annexe E).
7. **FAQ** : « Qui finance ? », « Pourquoi ces outils ? », « Un candidat peut-il demander une
   correction ? », « Pourquoi des IA notent-elles des IA ? », « Où sont les données ? ».

Le texte est rédigé par la session à partir du protocole, puis **relu intégralement par l'auteur**
avant fusion : c'est la parole publique du projet. Aucune formulation ne promet plus que le
protocole.

## Direction visuelle

- **Pixel art sobre au service de la clarté** : décors en tuiles et petits personnages anonymes
  (un archiviste, deux annotateurs, un juge-robot, un « outil » représenté par une boîte qui parle)
  qui illustrent chaque étape. Le ton visuel est ludique, le texte reste sérieux : la crédibilité
  du projet ne doit pas pâtir de l'habillage.
- **Palette** : fond sombre et deux ou trois couleurs saturées pour les accents (inspiration néon),
  plus une palette claire équivalente ; contrastes AA au minimum sur tout le texte.
- **Typographie** : police pixel sous licence libre (SIL OFL), hébergée dans le dépôt, réservée aux
  titres ; texte courant dans une police lisible, elle aussi hébergée.
- **Animations** : apparitions au défilement et petites boucles de sprites, en CSS ; toutes
  coupées sous `prefers-reduced-motion`. La page se lit entièrement sans JavaScript.
- **Illustrations** : dessinées en SVG pixel (une grille de rectangles, `shape-rendering:
  crispEdges`) par les agents. C'est faisable et cohérent, mais simple. Des scènes riches au niveau
  de 16personalities demandent un pixel artiste ; la page prévoit des emplacements au format fixe
  pour remplacer plus tard les SVG par des sprites commandés, sans toucher au reste.
- **Accessibilité** : textes alternatifs sur chaque illustration, navigation au clavier, lecture
  correcte à 320 px de large.

## Technique

- **Cadre** : Astro en export statique, comme le prévoit `CLAUDE.md` (Astro ou Next). Astro est
  recommandé : zéro JavaScript envoyé par défaut, pages en HTML pur, et ce socle servira tel quel
  au site fonctionnel. **Nouvelle dépendance : accord de l'auteur requis** (zone d'arrêt).
- **Emplacement** : `site/`, avec `pnpm build:site` (sortie ignorée par Git) et une étape de
  construction dans la CI `verification.yml`.
- **Tests** : la construction réussit ; aucune ressource externe dans le HTML produit (test qui
  cherche `http` hors liens documentaires) ; aucun nom de candidat ni d'outil du périmètre dans
  la page (test lu sur `config/perimetre.yaml`) ; chaque renvoi « §n » pointe vers une section qui
  existe dans `docs/PROTOCOLE.md`.
- **Aucune logique métier** dans `site/` ; aucun import depuis `pipeline/` ni `analysis/`.
- **Déploiement** : aucun. La page n'est publiée que par l'auteur, à la main, quand il le décide.

## Découpage en PR (quand l'auteur dira de commencer)

1. **Socle** : Astro, `pnpm build:site`, CI, page vide, tests de garde (ressources externes, noms
   du périmètre, renvois au protocole). Après accord sur la dépendance.
2. **Texte** : contenu complet en HTML sobre, sans habillage. Relu par l'auteur avant fusion.
3. **Habillage** : palette, typographie, mise en page des sections, thème clair et sombre.
4. **Pixel art** : illustrations SVG des sept étapes et de l'accroche, animations.
5. **Finition** : accessibilité, mobile, mouvement réduit, relecture visuelle.

Les PR 3 et 4 peuvent avancer en parallèle de la 2.

## Coût estimé

- **Code** : faible à moyen, quatre ou cinq PR, une demi-journée à une journée d'agents.
- **Auteur** : accord sur Astro ; relecture complète du texte (le poste le plus lourd pour lui) ;
  avis sur la direction visuelle au premier rendu.
- **Entretien** : faible si la page reste aux principes ; une relecture à chaque révision du
  protocole qui touche un principe, et une obligatoire au gel de la 1.0.
- **Hors code, facultatif** : commande d'illustrations à un pixel artiste.

## Décisions à prendre par l'auteur avant de commencer

1. Astro comme cadre du site (recommandé), donc une dépendance nouvelle.
2. Direction visuelle : fond sombre néon par défaut, ou clair par défaut.
3. Illustrations : SVG faits par les agents seulement, ou emplacements prévus pour une commande.
4. Langue : français seul au départ (recommandé, comme la mesure).
