/**
 * `outils/contacts.ts` — les adresses de contact des campagnes, lues dans `config/perimetre.yaml`
 * au moment de l'envoi, écrites en JSON sur la sortie standard pour `pnpm notifier`
 * (`node … outils/contacts.ts | uv run python -m pipeline.notification`).
 *
 * Protocole 0.10, §4 : la notification part « vers l'adresse de contact générique que la campagne
 * ou son parti publie, déclarée avec sa preuve archivée dans le périmètre du run ; une campagne qui
 * n'en publie aucune n'est pas notifiée, et ce manque est rapporté ». §10 : jamais une personne
 * nommée.
 *
 * Chaque candidat du périmètre porte donc la clé `contact_notification` : un objet `{ adresse,
 * preuve: { url, date, sha256, archive_url } }`, ou `null` **explicite** quand la campagne n'en
 * publie aucune. Une clé absente est une erreur : l'absence d'adresse est une donnée, pas un oubli.
 * Le fichier n'est ni écrit ni complété ici.
 *
 *   node --experimental-strip-types outils/contacts.ts [--perimetre=<chemin>]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { DATE_CIVILE } from "../validation/domaine/validateurs-champ.ts";
import { analyserArguments, texte } from "./arguments.ts";

const OPTIONS: readonly string[] = ["perimetre"];

export interface PreuveContact {
  readonly url: string;
  readonly date: string;
  readonly sha256: string;
  readonly archive_url: string;
}

export interface ContactCampagne {
  readonly candidat_id: string;
  readonly statut_au_gel: string;
  readonly contact_notification: { readonly adresse: string; readonly preuve: PreuveContact } | null;
}

export class PerimetreContactsInvalide extends Error {
  constructor(motifs: readonly string[]) {
    super(`config/perimetre.yaml : contacts de notification invalides :\n${motifs.map((motif) => `  ${motif}`).join("\n")}`);
    this.name = "PerimetreContactsInvalide";
  }
}

const ADRESSE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const URL_HTTP = /^https?:\/\//;

type Brut = Record<string, unknown>;

function objet(valeur: unknown): Brut | null {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur) ? (valeur as Brut) : null;
}

function chaine(brut: Brut, cle: string, motif: RegExp): string | null {
  const valeur = brut[cle];
  return typeof valeur === "string" && motif.test(valeur) ? valeur : null;
}

function motifsPreuve(preuve: Brut | null, qui: string): readonly string[] {
  if (preuve === null) return [`${qui} : contact_notification.preuve absente (§4 : preuve archivée exigée)`];
  const attendus: readonly [string, RegExp][] = [["url", URL_HTTP], ["date", DATE_CIVILE], ["sha256", SHA256], ["archive_url", URL_HTTP]];
  return attendus.filter(([cle, motif]) => chaine(preuve, cle, motif) === null).map(([cle]) => `${qui} : preuve.${cle} absente ou mal formée`);
}

function motifsContact(candidat: Brut, qui: string): readonly string[] {
  if (!Object.hasOwn(candidat, "contact_notification")) {
    return [`${qui} : clé contact_notification absente ; null explicite si la campagne ne publie aucune adresse`];
  }
  if (candidat["contact_notification"] === null) return [];
  const contact = objet(candidat["contact_notification"]);
  if (contact === null) return [`${qui} : contact_notification n'est ni null ni un objet`];
  const adresse = chaine(contact, "adresse", ADRESSE) === null ? [`${qui} : adresse absente ou mal formée`] : [];
  return [...adresse, ...motifsPreuve(objet(contact["preuve"]), qui)];
}

function motifsCandidat(candidat: unknown, rang: number): readonly string[] {
  const brut = objet(candidat);
  if (brut === null) return [`candidats[${rang}] n'est pas un objet`];
  const id = brut["candidat_id"];
  if (typeof id !== "string" || id.length === 0) return [`candidats[${rang}] : candidat_id absent`];
  if (typeof brut["statut_au_gel"] !== "string") return [`${id} : statut_au_gel absent`];
  return motifsContact(brut, id);
}

/** Les contacts de chaque candidat du périmètre, ou une erreur qui nomme chaque défaut. */
export function contactsDuPerimetre(perimetre: unknown): readonly ContactCampagne[] {
  const candidats = objet(perimetre)?.["candidats"];
  if (!Array.isArray(candidats)) throw new PerimetreContactsInvalide(["candidats n'est pas une liste"]);
  const motifs = candidats.flatMap((candidat, rang) => motifsCandidat(candidat, rang));
  if (motifs.length > 0) throw new PerimetreContactsInvalide(motifs);
  return candidats.map((candidat) => {
    const brut = candidat as Brut;
    return {
      candidat_id: brut["candidat_id"] as string,
      statut_au_gel: brut["statut_au_gel"] as string,
      contact_notification: brut["contact_notification"] as ContactCampagne["contact_notification"],
    };
  });
}

function principal(): void {
  const table = analyserArguments(process.argv.slice(2), OPTIONS);
  const chemin = texte(table, "perimetre", resolve(import.meta.dirname, "..", "config/perimetre.yaml"));
  const contacts = contactsDuPerimetre(parse(readFileSync(chemin, "utf8")) as unknown);
  process.stdout.write(`${JSON.stringify({ perimetre: chemin, candidats: contacts })}\n`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    principal();
  } catch (erreur) {
    process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
    process.exitCode = 1;
  }
}
