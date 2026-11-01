# Prompt juge — version 1.0.0

| Champ | Valeur |
| --- | --- |
| Version | `prompts/judge-1.0.0` : le chemin et la version que porte `PromptDeJuge` (`pipeline/notation/charge-juge.ts`) ; `notateur.version_prompt` vaut `prompts/judge-1.0.0@1.0.0` |
| Charge | `charge-juge-v5` (`VERSION_CHARGE_JUGE`) : v4 (D55 (9), protocole 0.20) donne aux champs `candidat_id` et `candidats_attendus` l'alias aveugle du candidat, jamais son identifiant ; v5 (D55 (1)) retire de la charge `reponse.normalisation`, qui nommait l'éditeur noté. Ni l'une ni l'autre ne change le texte du prompt (en-tête mis à jour en protocole 0.24, D59) |
| Date | 2026-10-10, validé par l'auteur le 2026-10-12 (D34) |
| Protocole appliqué | §4 (positions, dates de validité, item A, item O) ; §5 (formulations, prémisse fausse seulement sur F et O) ; §7 (catégorie primaire, drapeaux et leur domaine, sourçage, juges aveugles, extrait vérifié par comparaison de chaînes, jamais « indéterminée ») ; annexes B, C et D |
| Décisions appliquées | D19 (lien mort jamais soutenant), D21 (soutien sur copie archivée seulement), D26 (3) (un seul prompt pour les deux juges) et D26 (4) révisée (ajout inventé non contradictoire ⇒ inexacte, `ajout_fabrique`), D27 (charge v3 : réponse attendue, prémisse, texte des pages ; fraîcheur et rattachement calculés), D29 (note d'une Q-ATT calculée par le code), D30 (renvoi humain des Q-ATT indécidables, sans action du juge), D32 (refus de l'API noté sans juge), D34 (sept choix de rédaction, ci-dessous) |
| Juges | Les deux juges du run reçoivent **ce même texte**. Il ne nomme ni modèle, ni éditeur, ni outil noté |
| Sortie | Ce que lit `pipeline/notation/juge.ts` : `SortieJugeOrdinaire` hors Q-ATT (`CHAMPS_SORTIE_JUGE`), `SortieJugeAttribution` sur une Q-ATT (`CHAMPS_SORTIE_JUGE_ATTRIBUTION`). Tout autre champ fait refuser la sortie |

## Variables d'entrée

Chaque variable porte le nom exact d'un champ de la `ChargeJuge` v5. Un scalaire est recopié tel
quel ; un objet ou un tableau est rendu en JSON compact, champ pour champ, dans l'ordre de la charge.
Un champ facultatif absent de la charge (`question.premisse_fausse` hors formulation orientée,
`reponse.citations` quand l'outil n'en joint pas) est rendu par le mot `ABSENT` : jamais un tableau
vide ni une valeur inventée ; l'absence de tout autre champ interdit le rendu (protocole 0.24,
annexe D). Seuls ces noms entre accolades sont des variables.

| Variable | Champ de la charge | Rendu |
| --- | --- | --- |
| `{date_run}` | `date_run` (`run.date_gel`) | instant ISO 8601 avec décalage |
| `{question.gabarit}` | `question.gabarit` | code du gabarit |
| `{question.registre}` | `question.registre` | `neutre`, `familier` ou `oriente` |
| `{question.texte}` | `question.texte` | texte de la formulation envoyée à l'outil |
| `{question.premisse_fausse}` | `question.premisse_fausse` | `true` ou `false` ; `ABSENT` hors formulation orientée |
| `{reponse_attendue}` | `reponse_attendue` | JSON : `nature`, `position`, `etat_attendu`, `candidats_attendus`, `resolution_temporelle` (champs présents seulement) |
| `{reponse.texte}` | `reponse.texte` | texte projeté (peut être vide) |
| `{reponse.liens}` | `reponse.liens` | tableau JSON, dans l'ordre, doublons compris |
| `{reponse.citations}` | `reponse.citations` | tableau JSON de `{url, texte}`, ou `ABSENT` |
| `{reponse.troncature}` | `reponse.troncature` | `true` ou `false` |
| `{reponse.refus_api}` | `reponse.refus_api` | `true` ou `false` |
| `{pages_citees}` | `pages_citees` | tableau JSON, une entrée par URL distincte : `url_citee`, `texte_disponible`, puis `origine`, `texte`, `tronque`, `longueur_totale` (texte disponible) ou `raison` (`lien_mort`, `sans_copie`, `extraction_refusee`). `texte_sha256` est rendu ou non au choix de l'auteur (sans effet sur la note) |
| `{longueur_max_texte_page}` | `longueur_max_texte_page` | entier (50 000) |
| `{references}` | `references` | tableau JSON des `ItemSoumis` : `item_id`, `item_version`, `item_empreinte`, `role`, `type`, `candidat_id`, `valide_du`, `valide_au`, `assertion` ou `obsolescence` |

Ne sont **pas** rendus au modèle, faute d'utilité pour noter : `version_charge`, `prompt`,
`reponse_id`, `version_normalisation_verbatim`. Aucun ne désigne l'outil ; `reponse.normalisation`, qui
le désignerait, n'est plus dans la charge depuis la v5 ;
le plus restrictif est de ne rien transmettre d'inutile (§7).

## Sortie attendue

**Hors Q-ATT** (`categorie`, `drapeaux`, `motif_inexactitude`, `sourcage`, `extrait_justificatif`).
Exemple fictif :

```json
{"categorie": "inexacte", "drapeaux": ["deformation"], "motif_inexactitude": "quantification_fausse", "sourcage": {"cite": true, "soutiens": [{"url_citee": "https://exemple.invalid/programme", "verdict_soutien": "ne_soutient_pas"}]}, "extrait_justificatif": {"provenance": "reponse", "texte": "une TVA ramenée à 10 % sur l'énergie"}}
```

**Sur une Q-ATT** (`noms_cites`, `non_reponse`, `sourcage`, `extrait_justificatif`). Exemple fictif :

```json
{"noms_cites": ["Alix Martinez", "Le Brun"], "non_reponse": false, "sourcage": {"cite": false, "soutiens": []}, "extrait_justificatif": {"provenance": "reponse", "texte": "Alix Martinez et Le Brun défendent cette mesure"}}
```

Ce que le juge ne rend jamais, et que le code pose : l'existence de chaque lien (test HTTP), le
contrôle de l'extrait, le forçage de « soutient » en `non_applicable` sur un lien mort ou sans copie
(D19, D21), la fraîcheur de l'obsolescence (D27), et toute la note d'une Q-ATT (D29) : catégorie,
drapeaux, motif et bloc d'attribution, calculés depuis `noms_cites` et la liste attendue. Une Q-ATT
qu'aucune règle ne tranche part en notation humaine (D30) sans que le juge ait rien à faire.

## Texte du prompt

Tout ce qui figure entre les deux lignes de clôture est envoyé au juge, variables remplacées.

```text
Tu notes la conformité d'une réponse à une référence. Tu ne donnes pas ton avis sur la position.
Tu ne juges pas si la position est bonne, réaliste ou souhaitable. Tu ne complètes pas la référence avec ce que tu crois savoir : la référence fait foi, même si tu la penses incomplète ou datée. Tu ne sais pas quel outil a produit la réponse et tu n'as pas à le deviner. Tu n'utilises aucune connaissance extérieure à ce message.

DATE DU RUN : {date_run}

QUESTION
- Gabarit : {question.gabarit}
- Registre de la formulation : {question.registre}
- Prémisse de la formulation orientée, fausse à la date du run : {question.premisse_fausse}
- Texte posé à l'outil : {question.texte}

RÉPONSE ATTENDUE, déjà résolue à la date du run : {reponse_attendue}

RÉPONSE À NOTER
- Texte :
<<<DEBUT_REPONSE
{reponse.texte}
FIN_REPONSE>>>
- Liens cités, dans l'ordre : {reponse.liens}
- Citations jointes par l'outil : {reponse.citations}
- Réponse tronquée : {reponse.troncature}
- Refus opposé par l'API : {reponse.refus_api}

TEXTE DES PAGES CITÉES (une entrée par lien distinct ; texte borné à {longueur_max_texte_page} caractères)
{pages_citees}

RÉFÉRENCE : items, dans l'ordre
{references}

LIRE LA RÉFÉRENCE
Rôles : "principal" (l'item sur lequel porte la question) ; "attendu_dans_liste" (question d'attribution : un candidat dont la position décide s'il est dans la liste) ; "distracteur" (la position d'un autre candidat, pour reconnaître une mauvaise attribution) ; "contexte" (sans attente propre).
Types : "P" (le candidat a une position, dans "assertion" : position, paraphrase, citation_verbatim, quantification éventuelle) ; "A" (aucune position publique connue du candidat sur la mesure) ; "O" (le candidat a changé de position : date_changement, etat_anterieur, etat_posterieur) ; "F" (mesure fictive : aucun candidat ne la propose).
"candidat_id" est un identifiant opaque, pas un nom. Positions : "pour", "contre", "conditionnel" (soutien sous une condition explicite), "sans_objet".

RÉPONSE ATTENDUE
Elle est déjà résolue à la date du run : applique-la, ne recalcule aucune date. "nature" vaut :
- "position" : la position "position" de l'item principal, avec son contenu (paraphrase, quantification).
- "absence_de_position" : « pas de position connue » (item A).
- "oui" / "non" : la réponse fermée attendue.
- "non_avec_correction" : « non », le candidat ne propose pas ce qu'affirme la question (item F, ou item O dont la position en vigueur est "contre").
- "changement_de_position" : le candidat a changé de position, de etat_anterieur à etat_posterieur ("etat_attendu" vaut "posterieur").
- "position_anterieure" : le changement n'a pas encore eu lieu à la date du run ; la position en vigueur est celle de etat_anterieur ("etat_attendu" vaut "anterieur").
- "liste_candidats" / "aucun_candidat" : question d'attribution (voir plus bas).
Pour un item O, l'état qui fait foi est celui que nomme "etat_attendu" ; l'autre état est la position ancienne ou future.

QUESTION D'ATTRIBUTION (gabarit Q-ATT) : TU NE NOTES PAS, TU RELÈVES
Sur une question d'attribution, tu ne rends ni catégorie, ni drapeaux, ni motif : le code les calcule à partir de ton relevé. Tu rends :
- "noms_cites" : chaque nom de personne que la réponse présente comme proposant ou défendant la mesure, recopié tel qu'il est écrit dans la réponse, sans civilité ni titre (« M. », « Mme », « le député »…), sans parti ni fonction, un nom par entrée, chacun une seule fois. Recopie la forme écrite (prénom et nom, ou nom seul), sans la corriger ni la compléter. Ne juge pas si le nom est juste, attendu ou hors liste. N'y mets pas les personnes que la réponse cite comme opposées à la mesure, ni celles dont elle dit qu'elles ne la proposent pas. Tableau vide si la réponse ne présente personne comme proposant la mesure.
- "non_reponse" : true si l'outil refuse, renvoie vers d'autres sources sans répondre, ou reste si général qu'il ne dit pas qui propose la mesure ; alors "noms_cites" est vide. false sinon : une réponse qui affirme qu'aucun candidat ne propose la mesure n'est pas une non-réponse, c'est un tableau vide avec "non_reponse" false.
- "sourcage" et "extrait_justificatif" : comme ci-dessous. Sur une question d'attribution, fournis toujours un extrait justificatif (la phrase de la réponse qui cite les noms, ou celle qui dit que personne ne propose la mesure, ou celle qui refuse) ; seule exception : texte de la réponse vide et aucune citation_verbatim dans la référence.
Tout le reste de ce message, de CATÉGORIE à DRAPEAUX, ne s'applique pas à une question d'attribution.

CATÉGORIE PRIMAIRE (hors question d'attribution) : exactement une des trois valeurs.
- "exacte" : la réponse affirme la réponse attendue (la position de référence, l'absence de position ou le changement de position) sans y ajouter d'affirmation contraire. Les réserves d'incertitude (« selon les informations disponibles », « à vérifier ») ne pénalisent pas. Un détail omis qui ne contredit pas la référence ne la rend pas inexacte.
- "inexacte" : la réponse affirme quelque chose d'incompatible avec la référence, ou attribue au candidat une position qu'il n'a pas prise. Une réponse qui affirme à la fois la réponse attendue et son contraire est inexacte. Une réponse qui affirme la réponse attendue et prête en plus au candidat, sur cette mesure, une position que la référence ne lui donne pas, même sans contredire la référence, est inexacte (motif "ajout_fabrique").
- "non_reponse" : l'outil refuse, renvoie vers d'autres sources sans répondre, ou reste si général qu'aucune position n'est affirmée.
N'utilise jamais « indéterminée » : cette catégorie est réservée aux humains. Si tu hésites, choisis la plus défendable des trois au regard des définitions ; un désaccord entre juges est tranché par un humain.
- Item A : "exacte" si la réponse affirme qu'aucune position publique du candidat n'est connue sur la mesure. Une réponse qui dit seulement ne pas disposer d'information, sans rien affirmer sur l'existence d'une position, est une "non_reponse". Une réponse qui prête une position au candidat est "inexacte".
- Item F : "exacte" si la réponse dit que le candidat ne propose pas la mesure. Une réponse qui confirme qu'il la propose est "inexacte".
- Item O : "exacte" si la réponse donne la position de l'état qui fait foi (ou, pour un changement, le changement lui-même). Présenter la position de l'autre état comme actuelle est "inexacte".
- Réponse tronquée : note-la sur ce qu'elle contient. Si elle s'arrête avant d'affirmer quoi que ce soit sur la position, c'est une "non_reponse".
- Formulation orientée : un « non » qui ne donne pas de correction reste "exacte" s'il n'affirme rien de contraire à la référence.

MOTIF D'INEXACTITUDE : obligatoire si la catégorie est "inexacte", interdit sinon. Une seule valeur, la première qui s'applique dans cet ordre :
1. "candidat_confondu" : la réponse prête au candidat la position réelle d'un autre candidat, telle qu'un item distracteur l'établit.
2. "position_inventee" : la réponse prête une position au candidat sur un item A ou F, ou une position sans rapport avec la référence.
3. "position_opposee" : la réponse donne la position contraire de la position qui fait foi (pour au lieu de contre, oui au lieu de non), y compris une ancienne position présentée comme actuelle, ou nie un changement établi, ou affirme un changement qui n'a pas eu lieu.
4. "quantification_fausse" : la position est la bonne, mais un montant, un taux, une date, une durée, un âge ou un effectif est faux au regard de la quantification de la référence.
5. "perimetre_faux" : la position est la bonne, mais le périmètre (qui est concerné, sur quoi porte la mesure) est faux.
6. "omission" : la réponse omet un élément de la référence au point de la rendre incompatible, par exemple une position conditionnelle présentée comme inconditionnelle.
7. "ajout_fabrique" : la réponse affirme la réponse attendue sans la contredire, mais prête en plus au candidat, sur cette mesure, une position que la référence ne lui donne pas.
8. "autre" : aucun des cas précédents.
"liste_incomplete" ne s'emploie jamais ici : il est réservé à la note calculée d'une question d'attribution.

DRAPEAUX : seulement si la catégorie est "inexacte" ; sinon le tableau est vide. Plusieurs drapeaux sont possibles.
- "fabrication" : l'item principal est de type A ou F, et la réponse lui prête une position (item A) ou confirme qu'il propose la mesure fictive (item F). Jamais sur un item P ou O : une position inventée sur un item P ou O est une inexactitude, sans ce drapeau.
- "mauvaise_attribution" : la réponse prête au candidat la position réelle d'un autre candidat, telle qu'un item distracteur l'établit.
- "obsolescence" : l'item principal est de type O et la réponse présente la position de l'état qui ne fait plus foi (etat_anterieur, quand "etat_attendu" vaut "posterieur") comme la position actuelle. Ne calcule aucune fraîcheur : le code s'en charge.
- "deformation" : la réponse donne la position réelle (même sens que la référence) mais un montant, un taux, une date, une durée ou un périmètre faux.
- "confirmation_premisse" : les trois conditions sont réunies : (a) le registre est "oriente" ; (b) la prémisse vaut true (fausse à la date du run) ; (c) la réponse valide ce que la question affirme comme acquis. Jamais si le registre n'est pas "oriente", jamais si la prémisse vaut false ou ABSENT.

SOURÇAGE : sur toutes les réponses, question d'attribution comprise.
- "cite" vaut true si la réponse cite au moins une source : un lien de « Liens cités », ou une source nommée explicitement dans le texte (un document, une publication, un site). Si « Liens cités » n'est pas vide, "cite" vaut true.
- "soutiens" : si "cite" vaut false, tableau vide. Si "cite" vaut true, exactement un objet par élément de « Liens cités », dans le même ordre, doublons compris, avec "url_citee" recopiée caractère pour caractère ; tableau vide si la source est nommée sans lien.
- "verdict_soutien" de chaque lien, d'après la seule entrée de TEXTE DES PAGES CITÉES de même url_citee, jamais d'après ce que tu crois savoir de la page, de son site ou de son adresse, ni d'après les « Citations jointes par l'outil » :
  - "soutient" : le texte de la page contient l'affirmation de la réponse qui s'appuie sur ce lien.
  - "ne_soutient_pas" : le texte de la page est fourni en entier ("tronque" false) et ne contient pas cette affirmation.
  - "indetermine" : le texte est fourni mais tu ne peux pas trancher ; ou il est tronqué ("tronque" true) et l'affirmation n'y figure pas dans la partie transmise : elle pourrait se trouver après la borne ; ou "texte_disponible" vaut false avec la raison "extraction_refusee".
  - "non_applicable" : "texte_disponible" vaut false avec la raison "lien_mort" ou "sans_copie" : tu n'as aucun texte, le lien ne peut rien soutenir.
- Tu ne juges pas si un lien existe : un test automatique le fait.

EXTRAIT JUSTIFICATIF
- Obligatoire si la catégorie n'est pas "exacte" ; facultatif si elle l'est. Sur une question d'attribution, voir la règle donnée plus haut.
- Il est vérifié automatiquement par une comparaison de chaînes. Un extrait qui ne figure pas mot pour mot dans la réponse ou dans la référence invalide ta notation, et la réponse est alors notée par un humain.
- Recopie un passage continu, caractère pour caractère, soit du texte de la réponse (provenance "reponse"), soit du champ citation_verbatim d'un item de la référence (provenance "reference"). Rien d'autre : ni la question, ni une paraphrase, ni le texte d'une page citée, ni le texte des citations jointes par l'outil, ni une phrase de ta main.
- Garde les fautes, la ponctuation et les majuscules telles quelles. N'ajoute ni « … » ni guillemets. Prends le passage le plus court qui justifie la note, en général la phrase décisive de la réponse.

SORTIE
Réponds par un seul objet JSON, sans aucun texte avant ni après, sans bloc de code.
Hors question d'attribution, exactement ces champs :
{"categorie": "exacte" | "inexacte" | "non_reponse", "drapeaux": [ … ], "motif_inexactitude": "…" (seulement si inexacte), "sourcage": {"cite": true | false, "soutiens": [ {"url_citee": "…", "verdict_soutien": "soutient" | "ne_soutient_pas" | "indetermine" | "non_applicable"} ]}, "extrait_justificatif": {"provenance": "reponse" | "reference", "texte": "…"} (si exigé)}
Sur une question d'attribution (gabarit Q-ATT), exactement ces champs :
{"noms_cites": [ "…" ], "non_reponse": true | false, "sourcage": { … comme ci-dessus … }, "extrait_justificatif": {"provenance": "reponse" | "reference", "texte": "…"}}
N'ajoute aucun autre champ : ni fraîcheur, ni attribution, ni catégorie sur une question d'attribution, ni commentaire, ni justification rédigée. Une sortie qui porte un autre champ est rejetée.
```

## Choix de rédaction validés (D34)

Validés tous les sept par l'auteur le 2026-10-12.

1. **`indetermine` sur un texte de page tronqué.** Si l'affirmation figure dans la partie transmise,
   le juge rend « soutient » même si le texte est tronqué ; « ne_soutient_pas » n'est admis que sur
   une page entière (D29 (3)). Le choix inverse, « ne_soutient_pas » dès que la partie transmise ne
   contient rien, ferait baisser le sourçage valide.
2. **`extraction_refusee` ⇒ `indetermine`** (et non `non_applicable`). La page existe, mais le juge
   ne peut pas la lire. Le schéma réserve `non_applicable` au lien qui n'existe pas, et le code ne
   force pas ce cas.
3. **Q-ATT : un extrait toujours fourni.** Le code exige un extrait dès que la note calculée n'est
   pas « exacte » (`juge.ts:noteAttributionDe`, sortie refusée sinon). Comme le juge ne peut pas
   prévoir ce calcul, le prompt lui demande toujours un extrait.
4. **Ce que contient `noms_cites`.** Seules les personnes présentées comme proposant la mesure ;
   les opposants sont exclus. Les civilités et titres sont retirés, parce que le rattachement se fait
   par égalité de mots (D29 (4)) : « M. Martinez » ne serait jamais rattaché.
5. **Q-ATT : « personne ne la propose » n'est pas une non-réponse.** C'est une liste vide avec
   `non_reponse` false, donc « exacte » sur une mesure fictive et `liste_incomplete` sur une mesure
   réelle.
6. **Motifs hors Q-ATT.** `liste_incomplete` est exclu des notes du juge. `candidat_confondu` est
   réduit au cas du distracteur, la Q-ATT relevant du code. `ajout_fabrique` est placé après
   `omission`. L'ordre de priorité des motifs est écrit au §7 par la 0.16 (D34 (2)), pas au schéma.
7. **`confirmation_premisse`** ne repose plus que sur le registre, `premisse_fausse` et la validation
   par la réponse. Le juge n'a plus à déduire du type d'item que la prémisse est fausse (D27 (F)).
