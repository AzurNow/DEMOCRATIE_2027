# Brief — D75 lot F : arbitrage humain sur le sourçage partiel, point (15)

Agent : `codeur-opus`, worktree. Lis d'abord le fichier commun
`/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.

## Objectif

**(15)** Dans l'échantillon, deux humains d'accord sur la note et sur le motif d'inexactitude mais
divergents sur `cite` ou `au_moins_un_lien_existant` restent aujourd'hui sans arbitre :
`decider` attend un humain (`accord_sans_note_commune`) et la file les rend à part
(`sans_motif_admis`). La 0.33 a amendé le §7 pour les arbitrer comme chez les juges (cherche le
texte). Retenu : `pipeline/notation/note-retenue.ts:humainsAArbitrer` arbitre aussi `cite` et
`au_moins_un_lien_existant` ; `sans_motif_admis` est retiré de `pipeline/notation/file-humaine.ts`
(la catégorie, son en-tête et ce qui la sert ou l'affiche, `notation-humaine/` compris).

## Hors périmètre

L'ordre de la file (D79, fusionné : ne pas y toucher), `contrefactuel-outils.ts`,
`derangement-outils.ts`, `analysis/`, `pipeline/gel/`, `pipeline/run/`, `schema/run.schema.json`.

## Cas limites (au moins)

1. Accord sur note et motif, divergence sur `cite` seul : tâche `arbitrage_echantillon_10` ouverte,
   fermée aux deux premiers.
2. Divergence sur `au_moins_un_lien_existant` seul ; sur les deux.
3. Divergence sur le motif (cas déjà couvert) : inchangé.
4. Accord complet : aucun arbitre.
5. Après l'arbitrage, `decider` rend un verdict ; la note retenue suit la règle du §7 0.33.
6. Plus aucune réponse n'est rendue sous `sans_motif_admis` ; le type ne l'expose plus.
7. `tests/notation-humaine/aveuglement.test.ts` vert sans modification de ses assertions.
