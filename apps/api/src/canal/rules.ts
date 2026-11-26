import type { PaymentMethod } from "@jarvis/shared";

const DAY_MS = 24 * 3_600_000;

const toUtc = (day: string) => Date.parse(`${day}T00:00:00.000Z`);

/** Nombre de jours de `from` à `to` (négatif si `to` est passé). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Jour décalé de `n` jours. */
export function addDays(day: string, n: number): string {
  return new Date(toUtc(day) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Même quantième `months` mois plus tard ; ramené à la fin du mois s'il n'existe pas (31 janvier → 28 février). */
export function addMonths(day: string, months: number): string {
  const [y = 0, m = 1, d = 1] = day.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/** Nouvelle échéance : à partir de l'échéance en cours si elle n'est pas dépassée, sinon du jour du paiement. */
export function nextExpiry(current: string | null, paidOn: string, months: number): string {
  return addMonths(current && current > paidOn ? current : paidOn, months);
}

/** Les deux caisses Canal+ du cahier des charges ; MoMo n'en a pas. */
export function canalRegister(method: PaymentMethod): "canal_cash" | "canal_om" | null {
  if (method === "cash") return "canal_cash";
  return method === "orange_money" ? "canal_om" : null;
}
