"""Test HTTP des liens cités (§7 : « le lien cité existe (test HTTP déterministe) »), décisions D20 et D21.

Un passage par run, après la fermeture de la fenêtre d'interrogation et avant la notation :
`python -m pipeline.liens <repertoire_du_run>` (ou `pnpm liens <repertoire_du_run>`).

Flux : `volume/reponses/*.json` (réponses obtenues, `normalise.liens`) → URL dédoublonnées sur la
chaîne exacte, en ordre trié → pour chacune, une IRI convertie en URI pour l'envoi seulement
(RFC 3987 §3.1, règle `conversion_iri` de la table ; `iri.py`), puis GET poli selon la norme de
collecte du §6 (`pipeline/collecte` : robots.txt, une requête par seconde et par hôte, cinq
redirections au plus, suivies une à une, schéma vérifié à chaque étape, en-tête `Location` relu en
UTF-8 quand l'aller-retour latin-1 → UTF-8 réussit (D55 (2), règle `lecture_location` de la table) ;
délai `delai_s` de la table), jusqu'à trois tentatives pour un échec transitoire (robots.txt relu à
chaque tentative après un échec de lecture) → verdict lu dans la table `config/test-liens.toml`
(table-liens-v3) → copie conservée (corps et Save Page Now pour `existe` ; pour `inaccessible` et `non_testable`,
instantané Wayback existant le plus proche, jamais créé, retenu seulement de statut 200 et alors
téléchargé en version brute `id_` sous `volume/liens/pages/` ; rien pour `mort`) → un fichier par
URL, `volume/liens/<sha256 de l'URL citée exacte>.json` (`schema/existence-lien.schema.json`),
écrit une fois.

La notation lit ces fichiers par `pipeline/notation/fournisseur-fichiers.ts`.
"""
