# Polices hébergées

Deux polices sous licence SIL Open Font License 1.1 (texte de la licence à côté de chaque famille).
Aucune n'est chargée depuis un service tiers : la page les sert depuis ce dossier.

| Fichier | Famille | Usage | Version | SHA-256 |
|---|---|---|---|---|
| `silkscreen-400.woff2` | Silkscreen, graisse 400, sous-ensemble latin | titres seuls | @fontsource/silkscreen 5.1.1 | `11111c0d26af329a7cd21413d84956a8a0d93f543b14fba47a7d4181a66f5556` |
| `silkscreen-700.woff2` | Silkscreen, graisse 700, sous-ensemble latin | titres seuls | @fontsource/silkscreen 5.1.1 | `023d7c8fa71ccc0d83dad107fad75b6c9aedd3c1b4717aabbb68fdc39df0e683` |
| `chakra-petch-400.woff2` | Chakra Petch, graisse 400, sous-ensemble latin | texte courant | @fontsource/chakra-petch 5.1.1 | `9a83115d983bb1324c79a41db6d60d85583835c268939115a41025b4d388f3fa` |
| `chakra-petch-700.woff2` | Chakra Petch, graisse 700, sous-ensemble latin | texte courant gras | @fontsource/chakra-petch 5.1.1 | `04324f621defc72007c4e635cfd12903161b5f8aa1067ad5f619314fc153be56` |

## Provenance

- Les `.woff2` sont les fichiers `files/<famille>-latin-<graisse>-normal.woff2` du paquet npm
  `@fontsource/silkscreen@5.1.1` et `@fontsource/chakra-petch@5.1.1`, récupérés une fois
  par téléchargement direct (par exemple
  `https://cdn.jsdelivr.net/npm/@fontsource/silkscreen@5.1.1/files/silkscreen-latin-400-normal.woff2`).
  Le paquet n'est pas une dépendance du projet : seuls les fichiers sont copiés ici, sans
  modification. Fontsource redistribue les fontes amont converties en WOFF2 (le dépôt
  `google/fonts` ne publie que du TTF).
- Silkscreen : Copyright 2001 The Silkscreen Project Authors
  (https://github.com/googlefonts/silkscreen). Licence : `Silkscreen-OFL.txt`, copiée de
  https://github.com/google/fonts/blob/main/ofl/silkscreen/OFL.txt.
- Chakra Petch : Copyright 2018 The Chakra Petch Project Authors
  (https://github.com/m4rc1e/Chakra-Petch). Licence : `ChakraPetch-OFL.txt`, copiée de
  https://github.com/google/fonts/blob/main/ofl/chakrapetch/OFL.txt. Choisie le 2026-11-05 à la
  place d'Atkinson Hyperlegible, jugée trop ronde à côté du pixel art : ses coins biseautés
  s'accordent aux titres sans nuire à la lecture.

## Vérifier

```bash
shasum -a 256 site/public/polices/*.woff2
```

Silkscreen est réservée aux titres (`--police-titre`) : c'est une police d'affichage, illisible en
texte courant. Le texte courant utilise Chakra Petch (`--police-texte`), avec une pile de
repli système si le fichier manque.
