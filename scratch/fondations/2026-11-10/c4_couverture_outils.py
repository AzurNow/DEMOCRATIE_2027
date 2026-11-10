"""C4 : couverture de la liste d'outils par la règle d'inclusion du §3 (hypothèse H2 de la passe).

Usage : python3 scratch/fondations/2026-11-10/c4_couverture_outils.py   (depuis la racine du dépôt)

Données : scratch/perimetre/dossier-2026-10-15-final.md (§2.1 relevés des deux stores le 2026-10-15, §2.2 fiches,
§5.2 synthèse), protocole 0.34 §3 (ligne 100) et §11 (lignes 393, 404), pages officielles des éditeurs lues le
2026-11-10 (URL dans le tableau). Aucune part d'usage ici (autre agent). Le script compte et imprime ; il ne
décide rien. Les intermédiaires « hors règle par construction » sont une liste de catégories : ceux que le dossier
ou le §11 nomment sont marqués « dossier » ou « §11 », les autres « ajout de l'agent, non relevé ».
"""

from __future__ import annotations

# (nom dans le store, éditeur, rang App Store le 15, rang Google Play le 15, verdict du dossier, motif,
#  API publique du même modèle : oui/non/incertain, source lue le 2026-11-10)
TOP50 = [
    ("Claude by Anthropic", "Anthropic", 1, 4, "inclus", "règle remplie (2 modes)", "oui : claude-sonnet-5-5 / claude-opus-5-5 ; le modèle par défaut de l'application n'est pas documenté", "https://platform.claude.com/docs/en/about-claude/models/overview"),
    ("Google Gemini", "Google", 2, 9, "inclus", "règle remplie ; mode web suspendu (D28-4, clause restrictive)", "oui : gemini-3.6-flash / gemini-4-argon (notes de version de l'appli : 3 Flash « par défaut » le 2025-12-17)", "https://aistudio.google.com/docs/pricing ; https://gemini.google/release-notes/"),
    ("ChatGPT", "OpenAI", 3, 1, "inclus", "règle remplie (2 modes)", "oui : gpt-6-luna (Free, Go) / gpt-6-sol (payant), d'après le help center (lu en extrait, page 403)", "https://developers.openai.com/api/docs/pricing"),
    ("Meta AI", "Meta", 5, 5, "incertain", "API : ouverture en France / UE et conditions non établies ; dev.meta.ai/terms 404 le 15 oct.", "incertain : « Meta Model API » (Muse Wonder en préversion, Muse Spark) ; la page ne dit pas si c'est le modèle de l'application ni rien sur l'UE", "https://dev.meta.ai/docs/overview"),
    ("Grok - Assistant IA", "xAI", 10, 25, "inclus", "règle remplie (2 modes)", "oui : grok-4.7 (« flagship ») ; le modèle par défaut de l'application n'est pas documenté", "https://docs.x.ai/developers/models"),
    ("Microsoft Copilot", "Microsoft", 11, 19, "exclu", "pas d'API du produit grand public", "non : seules des API Microsoft 365 Copilot (préversion, licence requise, sans choix de modèle) ; aucune API du Copilot grand public trouvée", "https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/copilot-apis-overview"),
    ("Gemini Notebook", "Google", 27, 33, "incertain", "catégorie discutable (est-ce un assistant conversationnel ?)", "préversion publique : « Gemini Notebook API », comptes personnels seulement, pré-GA", "https://developers.google.com/notebook/docs"),
    ("IA Chatbot Français - Genie AI", "Appnation (tiers)", 35, 43, "exclu", "application tierce, pas d'API officielle trouvée", "non (dossier ; non recherché à nouveau)", "dossier §2.2"),
    ("Perplexity - Vos questions", "Perplexity AI", 36, 55, "inclus", "règle remplie (App Store 36) ; mode sans web à vérifier", "partiel : Agent API et Search API ; le « modèle par défaut » de l'application n'est pas nommé par le help center", "https://docs.perplexity.ai/getting-started/models ; help center art. 10354930"),
    ("DeepSeek - Assistant IA", "DeepSeek", 43, 52, "inclus", "règle remplie ; sans web seul (D28-3)", "oui : deepseek-flash = DeepSeek-V4.1-Flash-1017, « official web and APP models updated » (2026-10-17)", "https://api-docs.deepseek.com/updates/"),
    ("Vibe by Mistral (ex-Le Chat)", "Mistral AI", 44, 40, "inclus d'office", "§3 : l'assistant édité en France", "oui : mistral-medium-3-5, « default model in Le Chat » (2026-05-22) ; tarif non affiché", "https://mistral.ai/news/vibe-remote-agents-mistral-medium-3-5/"),
    ("Grok Bot", "xAI", 47, 57, "incertain", "doublon ou produit distinct ? catégorie", "même API que Grok (dossier)", "dossier §2.2"),
    ("Open Chat - AI bot app", "AceTools Team (tiers)", None, 42, "exclu", "application tierce, pas d'API officielle trouvée", "non (dossier)", "dossier §2.2"),
    ("Chatbot App - AI Assistant", "TapSuite (tiers)", None, 50, "exclu", "application tierce, pas d'API officielle trouvée (rang 50 exactement, D26 lu comme inclusif)", "non (dossier)", "dossier §2.2"),
]
# Sortis du top 50 au 15 octobre (dossier §2.1) : AI Chat App (Oxylab, 44 le 9 → absent du top 100), ChatOn (62 ; 99 → absent), Genora AI, Chat Smith.
SORTIS = ["AI Chat App- Chatbot Assistant (Oxylab, tiers)", "ChatOn (AIBY, tiers)", "Genora AI (tiers)", "Chat Smith (tiers)"]

# Intermédiaires IA structurellement hors de la règle du §3 (pas une application « assistant » du top 50 Productivité
# avec API, ou pas une application du tout). Statut de la mention : « §11 », « dossier » ou « ajout de l'agent ».
HORS_REGLE = [
    ("réponses générées des moteurs de recherche (aperçus et modes IA de Google, de Bing, de Qwant, de DuckDuckGo, de Brave, d'Ecosia)", "§11 ligne 393 : « un outil très utilisé hors stores (site web seul) » ; §11 ligne 404 : « les intermédiaires sans API, hors des comparateurs lus, sont hors champ » ; noms : ajout de l'agent"),
    ("assistants intégrés aux messageries (Meta AI dans WhatsApp, Messenger, Instagram ; My AI de Snapchat ; Le Chat dans WhatsApp)", "dossier §2.2 : Meta AI « incertain » comme application ; l'intégration aux messageries n'est ni une application du classement ni accessible par API : ajout de l'agent"),
    ("assistants des téléphones et systèmes (Siri et Apple Intelligence, Gemini sur Android en remplacement de l'Assistant, Galaxy AI et Bixby de Samsung)", "§3 ligne 113 : « réponses hors ligne des outils (résumés d'actualité, notifications) : hors périmètre » ; les assistants système ne sont pas des applications du top 50 : ajout de l'agent"),
    ("assistants des opérateurs et des constructeurs (applications d'opérateurs classées en Productivité, par exemple l'application « Free » au rang 7 du relevé Google Play du 15 octobre, qui n'est pas un assistant)", "dossier §0.2 : « le HTML passe de la ligne 5 (Meta AI) à la ligne 7 (Free) » ; catégorie : ajout de l'agent"),
    ("assistants vocaux et enceintes (Alexa+, Google Home)", "pas d'application Productivité, pas d'API du produit : ajout de l'agent"),
    ("interfaces conversationnelles des comparateurs et des médias (« chat Live 2027 » d'un site de comparaison relevé par le dossier, assistants de rédactions)", "dossier §3 : site « incertain, probablement exclu (contenu généré, interface conversationnelle) » ; la famille comparateur exige du contenu lisible sans script tiers"),
    ("applications tierces qui réemballent un modèle d'autrui (Genie AI, Chatbot App, Open Chat, ChatOn, AI Chat App)", "dossier §2.2 : « exclues faute d'API officielle » ; leur modèle sous-jacent est mesuré par l'API de son éditeur, pas leur interface"),
    ("assistants de bureautique et de navigateur (Copilot dans Windows, Edge et Office ; Gemini dans Workspace ; Leo de Brave)", "§3 ligne 100 : la règle ne voit que l'application du top 50 Productivité ; Copilot est exclu « pas d'API du produit » (dossier §5.2) ; déclinaisons : ajout de l'agent"),
]


def main() -> None:
    print("C4. Assistants relevés dans le top 50 gratuit Productivité d'au moins un store, France, 2026-10-15 (dossier §2.1)")
    print("  | assistant | éditeur | App Store | Google Play | verdict (dossier §5.2) | motif | API publique du même modèle | source (lue le 2026-11-10) |")
    print("  |---|---|---|---|---|---|---|---|")
    for nom, ed, a, g, v, motif, api, src in TOP50:
        print(f"  | {nom} | {ed} | {a if a is not None else '—'} | {g if g is not None else '—'} | {v} | {motif} | {api} | {src} |")
    n = len(TOP50)
    inclus = [x for x in TOP50 if x[4].startswith("inclus")]
    incertains = [x for x in TOP50 if x[4] == "incertain"]
    exclus = [x for x in TOP50 if x[4] == "exclu"]
    print(f"\n  Décompte : {n} assistants dans le top 50 d'au moins un store ; {len(inclus)} retenus par la règle (dont 1 d'office) ; "
          f"{len(incertains)} incertains ; {len(exclus)} exclus ; {len(SORTIS)} sortis du top 50 entre le 9 et le 15 octobre ou jamais entrés.")
    motifs = {
        "pas d'API officielle du produit": sum(1 for x in exclus if "API" in x[5]) ,
        "pas gratuit": 0,
        "pas de français": 0,
        "catégorie discutable": sum(1 for x in incertains if "catégorie" in x[5] or "doublon" in x[5]),
        "ouverture de l'API non établie (UE)": sum(1 for x in incertains if "UE" in x[5]),
    }
    print("  Motifs d'écart : " + " ; ".join(f"{k} : {v}" for k, v in motifs.items()) + ". Le lookup Apple du 15 octobre donne « Gratuit » et « FR » pour les 12 applications d'éditeur (dossier §2.1) : aucun écart pour prix ou langue.")
    print(f"  Part des assistants du top 50 couverte par la règle : {len(inclus)}/{n} = {100 * len(inclus) / n:.0f} % ; en comptant les trois incertains comme hors mesure : {n - len(inclus)} assistants classés ne sont pas mesurés.")
    print("  Rangs des exclus et incertains au 15 octobre : Meta AI 5 et 5 ; Copilot 11 et 19 ; Gemini Notebook 27 et 33 ; Genie AI 35 et 43 ; Grok Bot 47 et 57 ; Open Chat — et 42 ; Chatbot App — et 50 (deux des trois mieux classés que Perplexity, DeepSeek et Le Chat ne sont pas mesurés).")

    print("\n  Intermédiaires IA structurellement hors de la règle (catégories)")
    print("  | catégorie (exemples) | ce que disent le dossier et le protocole ; statut de la mention |")
    print("  |---|---|")
    for cat, base in HORS_REGLE:
        print(f"  | {cat} | {base} |")
    print("\n  Ce que le tableau permet : compter ce que la règle du §3 retient et écarte au 15 octobre, et dire pour chaque écarté si une API du même modèle existe. "
          "Ce qu'il ne permet pas : mesurer l'usage de chacun (autre agent), ni dire si un intermédiaire hors règle répond autrement que l'API de son éditeur.")


if __name__ == "__main__":
    main()
