export interface PriceRow {
  formatId: string;
  brandId: string | null;
  amount: number;
  transportContribution: number;
  purchaseCost: number;
  effectiveFrom: Date;
}

/**
 * Prix en vigueur à la date `at` : l'exception de marque la plus récente l'emporte,
 * sinon le prix du format le plus récent. Aucun prix applicable : `null`.
 */
export function resolveGasPrice(
  rows: readonly PriceRow[],
  formatId: string,
  brandId: string,
  at: Date,
): PriceRow | null {
  const applicable = rows.filter((r) => r.formatId === formatId && r.effectiveFrom.getTime() <= at.getTime());
  const latest = (list: PriceRow[]) =>
    list.reduce<PriceRow | null>(
      (best, r) => (best === null || r.effectiveFrom.getTime() >= best.effectiveFrom.getTime() ? r : best),
      null,
    );
  return (
    latest(applicable.filter((r) => r.brandId === brandId)) ??
    latest(applicable.filter((r) => r.brandId === null))
  );
}

/** Un prix dépasse-t-il le plafond réglementé (s'il y en a un) ? Le plafond porte sur le prix du gaz seul. */
export function exceedsCeiling(amount: number, ceiling: number | null): boolean {
  return ceiling !== null && amount > ceiling;
}
