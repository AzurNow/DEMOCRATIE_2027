# Brief — D75 lot H : troncature absente sur le canal application, point (24)

Agent : `codeur-opus`, worktree. Lis d'abord le fichier commun
`/private/tmp/claude-501/-Users-azur-now-Code-PROJETS-CODE-DEMOCRACIE-2027/915c284b-c71f-4c16-9657-0b2ce0a2f685/scratchpad/commun-d75.md`.

## Objectif

**(24)** Une saisie du canal application (testeur, §6) ne porte pas de troncature : aujourd'hui
`{reponse.troncature}` est exigé par la charge du juge, donc ces réponses ne peuvent pas aller au
juge. L'annexe D (0.33) dit désormais : « un champ facultatif absent de la charge, la prémisse hors
formulation orientée, les citations quand l'outil n'en joint pas ou le caractère tronqué d'une
saisie de l'application, qui n'en porte pas (section 6), est rendu par le mot `ABSENT` ».
Retenu : `reponse.troncature` devient facultative dans la charge (`pipeline/notation/charge-juge.ts`)
et dans la vue de l'annotateur (`pipeline/notation/vue-annotateur.ts`), absente sur le canal
application et présente partout ailleurs ; `VERSION_CHARGE_JUGE` passe à **`charge-juge-v6`** ;
le rendu (`pipeline/notation/rendu-prompt-juge.ts`) rend `ABSENT` quand elle manque.

## Zone d'arrêt

`prompts/judge-1.0.0.md` : tu n'y écris pas. La session principale mettra son en-tête à jour
(ligne Charge en `charge-juge-v6`, ligne de la variable `{reponse.troncature}`, phrase des champs
facultatifs) après ton rapport. D'ici là, le test « le vrai prompt tel qu'inscrit annonce
VERSION_CHARGE_JUGE » (`tests/notation/rendu-prompt-juge.test.ts`) et tout test qui rend le vrai
prompt échoueront : c'est attendu, ne les affaiblis pas, liste-les dans ton rapport. Mets à jour la
fixture `tests/notation/fixtures/prompt-juge/prompt-juge-fixture.md` en `charge-juge-v6`. Dis dans
ton rapport, mot pour mot, ce que l'en-tête du vrai prompt doit dire pour que ton code le rende
(si `rendu-prompt-juge.ts` lit la liste des champs facultatifs dans le prompt, cite la forme
attendue).

## Hors périmètre

`file-humaine.ts`, `note-retenue.ts`, `contrefactuel-outils.ts`, `derangement-outils.ts`,
`analysis/`, `pipeline/gel/`, `pipeline/run/`.

## Cas limites (au moins)

1. Canal API : troncature présente, rendue `true`/`false` ; absente : refus nommé, jamais `ABSENT`.
2. Canal application : troncature absente, rendue `ABSENT` ; présente : refus nommé (une saisie de
   testeur n'en porte pas).
3. Une charge `charge-juge-v5` est refusée (version discordante).
4. Vue de l'annotateur : même règle que la charge (un humain reçoit exactement ce que reçoit un juge).
5. Aucune autre variable ne change de rendu.
