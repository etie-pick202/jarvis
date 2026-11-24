/** Pourcentage de marge, arrondi à deux décimales (0 si aucun chiffre d'affaires). */
export function marginPercent(margin: number, revenue: number): number {
  return revenue === 0 ? 0 : Math.round((margin / revenue) * 10_000) / 100;
}

/** Une annulation (écriture inverse) compte en négatif dans les rapports ; la vente d'origine reste positive. */
export function signed(amount: number, isReversal: boolean): number {
  return isReversal ? -amount : amount;
}

export type CsvCell = string | number | null;

/**
 * CSV pour Excel en français : séparateur `;`, BOM UTF-8, guillemets doublés. Une cellule de texte qui commencerait
 * par `=`, `+`, `-`, `@` est préfixée d'une apostrophe pour ne jamais être interprétée comme une formule.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const cell = (value: CsvCell): string => {
    if (value === null) return "";
    const raw = typeof value === "number" ? String(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[";\n\r]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
  };
  const lines = [headers, ...rows].map((r) => r.map(cell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Libellé d'une ligne de gaz : « Recharge gaz OLA » ou, pour un échange, « Recharge gaz OLA/TOTAL » (remise/rapportée). */
export function gasLabel(givenBrand: string, returnedBrand: string | null, format: string): string {
  const brands =
    returnedBrand && returnedBrand !== givenBrand ? `${givenBrand}/${returnedBrand}` : givenBrand;
  return `Recharge gaz ${brands} ${format}`;
}

/** Mouvements signés d'une caisse : entrée positive, sortie négative. */
export function signedEntry(direction: "in" | "out", amount: number): number {
  return direction === "in" ? amount : -amount;
}

export const CASH_REGISTERS_IN_CASH = ["sales_cash", "canal_cash"] as const;
