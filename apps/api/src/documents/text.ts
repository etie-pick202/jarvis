import type { CsvCell } from "../reports/compute.js";

/** Montant en FCFA avec séparateur de milliers (espace ordinaire). */
export function fcfaText(amount: number): string {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} FCFA`;
}

/** Date et heure à la boutique (UTC+1), « 24/11/2026 09:00 ». */
export function shopDateTime(at: Date): string {
  const local = new Date(at.getTime() + 3_600_000).toISOString();
  return `${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)} ${local.slice(11, 16)}`;
}

/**
 * Tableau en colonnes de largeur fixe. Les colonnes trop larges sont raccourcies pour tenir dans `maxWidth`
 * caractères ; les nombres sont alignés à droite.
 */
export function textTable(
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  maxWidth = 160,
): string[] {
  const show = (value: CsvCell | undefined) => (value === null || value === undefined ? "" : String(value));
  const widths = headers.map((h, c) => Math.max(h.length, ...rows.map((r) => show(r[c]).length)));
  const total = () => widths.reduce((n, w) => n + w + 1, 0);
  while (total() > maxWidth) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] = (widths[widest] ?? 1) - 1;
  }
  const line = (cells: readonly (CsvCell | undefined)[]) =>
    cells
      .map((value, c) => {
        const width = widths[c] ?? 0;
        const text = show(value).slice(0, width);
        return typeof value === "number" ? text.padStart(width) : text.padEnd(width);
      })
      .join(" ")
      .trimEnd();
  return [line(headers), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)];
}
