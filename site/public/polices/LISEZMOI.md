# Polices hébergées

Deux polices sous licence SIL Open Font License 1.1 (texte de la licence à côté de chaque famille).
Aucune n'est chargée depuis un service tiers : la page les sert depuis ce dossier.

| Fichier | Famille | Usage | Version | SHA-256 |
|---|---|---|---|---|
| `silkscreen-400.woff2` | Silkscreen, graisse 400, sous-ensemble latin | titres seuls | @fontsource/silkscreen 5.1.1 | `11111c0d26af329a7cd21413d84956a8a0d93f543b14fba47a7d4181a66f5556` |
| `silkscreen-700.woff2` | Silkscreen, graisse 700, sous-ensemble latin | titres seuls | @fontsource/silkscreen 5.1.1 | `023d7c8fa71ccc0d83dad107fad75b6c9aedd3c1b4717aabbb68fdc39df0e683` |
| `atkinson-400.woff2` | Atkinson Hyperlegible, graisse 400, sous-ensemble latin | texte courant | @fontsource/atkinson-hyperlegible 5.1.1 | `b09653e3ba9d95e26da5c408979f40451990a4573ce5f96abe6982e2fcb09e6c` |
| `atkinson-700.woff2` | Atkinson Hyperlegible, graisse 700, sous-ensemble latin | texte courant gras | @fontsource/atkinson-hyperlegible 5.1.1 | `d8e8b1e0e929651439e25e23ade4b9d6cac073f2444aadb8e8b85431726c2036` |

## Provenance

- Les `.woff2` sont les fichiers `files/<famille>-latin-<graisse>-normal.woff2` du paquet npm
  `@fontsource/silkscreen@5.1.1` et `@fontsource/atkinson-hyperlegible@5.1.1`, récupérés une fois
  par téléchargement direct (par exemple
  `https://cdn.jsdelivr.net/npm/@fontsource/silkscreen@5.1.1/files/silkscreen-latin-400-normal.woff2`).
  Le paquet n'est pas une dépendance du projet : seuls les fichiers sont copiés ici, sans
  modification. Fontsource redistribue les fontes amont converties en WOFF2 (le dépôt
  `google/fonts` ne publie que du TTF).
- Silkscreen : Copyright 2001 The Silkscreen Project Authors
  (https://github.com/googlefonts/silkscreen). Licence : `Silkscreen-OFL.txt`, copiée de
  https://github.com/google/fonts/blob/main/ofl/silkscreen/OFL.txt.
- Atkinson Hyperlegible : Copyright 2020 Braille Institute of America, Inc. Licence :
  `AtkinsonHyperlegible-OFL.txt`, copiée de
  https://github.com/google/fonts/blob/main/ofl/atkinsonhyperlegible/OFL.txt.

## Vérifier

```bash
shasum -a 256 site/public/polices/*.woff2
```

Silkscreen est réservée aux titres (`--police-titre`) : c'est une police d'affichage, illisible en
texte courant. Le texte courant utilise Atkinson Hyperlegible (`--police-texte`), avec une pile de
repli système si le fichier manque.
