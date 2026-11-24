export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** Écart de comptage : positif = plus de bouteilles que prévu. */
export function countGap(counted: number, theoretical: number): number {
  return counted - theoretical;
}

/** Alerte de seuil bas : le stock de pleins est au seuil ou en dessous. */
export function isLowStock(full: number, threshold: number): boolean {
  return full <= threshold;
}

/** Un produit est « indisponible » (au catalogue, au comptoir et en ligne) quand il n'y a plus de plein. */
export function isAvailable(full: number): boolean {
  return full > 0;
}

/** Clé de réglage d'un seuil : par marque et format, sinon le seuil par défaut. */
export function thresholdKey(brandId?: string, formatId?: string): string {
  return brandId && formatId ? `low_stock:${brandId}:${formatId}` : "low_stock:default";
}

/** Un réglage mal formé retombe sur la valeur par défaut plutôt que de bloquer le stock. */
export function parseThreshold(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return value !== undefined && Number.isInteger(n) && n >= 0 ? n : fallback;
}
