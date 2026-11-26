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
