import type { CashRegisterId, PaymentMethod } from "@jarvis/shared";

/** Heure légale de la boutique : UTC+1 (Cameroun). Sert à rattacher une clôture à son jour d'activité. */
export const BUSINESS_UTC_OFFSET_MINUTES = 60;

/** Jour d'activité (AAAA-MM-JJ) d'un instant donné. */
export function businessDate(at: Date, offsetMinutes = BUSINESS_UTC_OFFSET_MINUTES): string {
  return new Date(at.getTime() + offsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Début (inclus) et fin (exclue) d'un jour d'activité, en UTC. */
export function dayRange(day: string, offsetMinutes = BUSINESS_UTC_OFFSET_MINUTES): [Date, Date] {
  const start = new Date(new Date(`${day}T00:00:00.000Z`).getTime() - offsetMinutes * 60_000);
  return [start, new Date(start.getTime() + 24 * 3_600_000)];
}

/** Mode de paiement d'un mouvement manuel selon la caisse (dépense, transfert) quand il n'est pas précisé. */
export function defaultPaymentMethod(registerId: CashRegisterId): PaymentMethod {
  if (registerId === "canal_om" || registerId === "settlement_om_momo" || registerId === "transaction_om") {
    return "orange_money";
  }
  return registerId === "transaction_momo" ? "momo" : "cash";
}

/** Écart de clôture : positif = excédent, négatif = manque. */
export function closureGap(counted: number, theoretical: number): number {
  return counted - theoretical;
}

/** Une justification est exigée dès que l'écart dépasse le seuil paramétrable (défaut 0 : tout écart). */
export function needsJustification(gap: number, threshold: number): boolean {
  return Math.abs(gap) > threshold;
}

export function hasSufficientBalance(balance: number, amount: number): boolean {
  return balance >= amount;
}
