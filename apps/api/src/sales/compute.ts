export interface GasPricing {
  amount: number;
  transportContribution: number;
  purchaseCost: number;
}

export interface GasLineResult {
  unitPrice: number;
  transportContribution: number;
  deliveryFee: number;
  purchaseCost: number;
  /** Écart de valeur d'emballage : positif = gain, négatif = perte. */
  packagingGap: number;
  /** Écart non calculable (valeur d'emballage inconnue dans un échange entre marques) : compté 0, à régulariser. */
  packagingGapPending: boolean;
  total: number;
}

/**
 * Montants d'une ligne de gaz. Le client paie le même prix quelle que soit la bouteille rapportée :
 * recharge (6 500) + contribution transport (300) + livraison par bouteille (400 si livré).
 * L'écart de valeur d'emballage (vide rapporté − plein remis) passe en gain ou en perte, pas dans le prix.
 */
export function computeGasLine(
  pricing: GasPricing,
  quantity: number,
  deliveryFeePerBottle: number,
  givenPackagingValue: number,
  returnedPackagingValue: number,
  packagingUnknown = false,
): GasLineResult {
  return {
    unitPrice: pricing.amount,
    transportContribution: pricing.transportContribution,
    deliveryFee: deliveryFeePerBottle,
    purchaseCost: pricing.purchaseCost,
    packagingGap: packagingUnknown ? 0 : quantity * (returnedPackagingValue - givenPackagingValue),
    packagingGapPending: packagingUnknown,
    total: quantity * (pricing.amount + pricing.transportContribution + deliveryFeePerBottle),
  };
}

/** Marge d'une ligne : (prix payé − livraison − coût d'achat) + écart d'emballage. La livraison paie le livreur, hors marge. */
export function lineMargin(
  line: { total: number; deliveryFee: number; purchaseCost: number; packagingGap: number },
  quantity: number,
): number {
  return line.total - quantity * line.deliveryFee - quantity * line.purchaseCost + line.packagingGap;
}

/** Quantités de pleins à sortir par couple marque/format, toutes lignes confondues. */
export function aggregateFullDemand(
  lines: readonly { brandId: string; formatId: string; quantity: number }[],
): Map<string, { brandId: string; formatId: string; quantity: number }> {
  const demand = new Map<string, { brandId: string; formatId: string; quantity: number }>();
  for (const l of lines) {
    const key = `${l.brandId}:${l.formatId}`;
    const current = demand.get(key);
    if (current) current.quantity += l.quantity;
    else demand.set(key, { ...l });
  }
  return new Map([...demand.entries()].sort(([a], [b]) => a.localeCompare(b)));
}
