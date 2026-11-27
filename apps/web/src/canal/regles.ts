import type { CanalPayment } from "@jarvis/shared";
import type { CanalSubscriber } from "../api/index.js";

const normaliser = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Même recherche que le serveur, sur la liste gardée sur l'appareil : nom (début de mot), décodeur ou téléphone. */
export function filtrerAbonnes(abonnes: readonly CanalSubscriber[], saisie: string): CanalSubscriber[] {
  const q = normaliser(saisie.trim());
  if (q === "") return [...abonnes];
  return abonnes.filter((a) => {
    const nom = normaliser(a.name);
    return (
      nom.startsWith(q) ||
      nom.split(" ").some((mot) => mot.startsWith(q)) ||
      normaliser(a.decoderNumber).startsWith(q) ||
      a.phone.includes(saisie.trim())
    );
  });
}

export type EtatEcheance = "aucune" | "depassee" | "proche" | "a-jour";

export function etatEcheance(a: Pick<CanalSubscriber, "daysLeft">): EtatEcheance {
  if (a.daysLeft === null) return "aucune";
  if (a.daysLeft < 0) return "depassee";
  return a.daysLeft <= 7 ? "proche" : "a-jour";
}

/** Date AAAA-MM-JJ affichée sans décalage de fuseau. */
export function dateCourte(jour: string, langue: string): string {
  return new Intl.DateTimeFormat(langue, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${jour}T00:00:00Z`));
}

/** Jour d'activité (heure de Douala, UTC+1), comme le serveur. */
export function jourActivite(instant: Date): string {
  return new Date(instant.getTime() + 3_600_000).toISOString().slice(0, 10);
}

/** Même quantième `mois` plus tard ; ramené à la fin du mois s'il n'existe pas (31 janvier → 28 février). */
function ajouterMois(jour: string, mois: number): string {
  const [a = 0, m = 1, j = 1] = jour.split("-").map(Number);
  const dernier = new Date(Date.UTC(a, m - 1 + mois + 1, 0)).getUTCDate();
  return new Date(Date.UTC(a, m - 1 + mois, Math.min(j, dernier))).toISOString().slice(0, 10);
}

/** Même règle que le serveur, pour annoncer l'échéance avant l'envoi (le serveur fait foi). */
export function nouvelleEcheance(actuelle: string | null, paiement: string, mois: number): string {
  return ajouterMois(actuelle && actuelle > paiement ? actuelle : paiement, mois);
}

type Ligne = Pick<CanalPayment, "id" | "subscriberId" | "amount" | "cancelled" | "reversalOf">;

/** Seul le dernier encaissement de chaque abonné peut être annulé (liste du plus récent au plus ancien). */
export function annulables(lignes: readonly Ligne[]): Set<string> {
  const vus = new Set<string>();
  const ids = new Set<string>();
  for (const l of lignes) {
    if (l.reversalOf !== null || l.cancelled || vus.has(l.subscriberId)) continue;
    vus.add(l.subscriberId);
    ids.add(l.id);
  }
  return ids;
}

/** Argent réellement gardé : les annulations (ligne inverse) et les lignes annulées se neutralisent. */
export function totalEncaisse(lignes: readonly Ligne[]): number {
  return lignes.reduce((n, l) => n + (l.cancelled || l.reversalOf !== null ? 0 : l.amount), 0);
}
