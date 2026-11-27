import type { ShopSettings, UpdateShopSettingsInput } from "@jarvis/shared";

export type SaisieReglages = Record<
  | "openingHours"
  | "orderHours"
  | "phone"
  | "address"
  | "omNumber"
  | "momoNumber"
  | "eveningCountTime"
  | "minimumOrder"
  | "deliveryFeePerBottle",
  string
>;

export function lireFrais(saisie: string): number | null {
  const t = saisie.trim();
  return /^\d{1,9}$/u.test(t) ? Number(t) : null;
}

export const depuisReglages = (r: ShopSettings): SaisieReglages => ({
  openingHours: r.openingHours,
  orderHours: r.orderHours,
  phone: r.phone,
  address: r.address,
  omNumber: r.omNumber ?? "",
  momoNumber: r.momoNumber ?? "",
  eveningCountTime: r.eveningCountTime ?? "",
  minimumOrder: String(r.minimumOrder),
  deliveryFeePerBottle: String(r.deliveryFeePerBottle),
});

/** Première erreur de la saisie (clé de traduction), ou null. */
export function erreurReglages(s: SaisieReglages, plafond: number | null) {
  const frais = lireFrais(s.deliveryFeePerBottle);
  if (frais === null || lireFrais(s.minimumOrder) === null) return "quartiers.erreur.montant" as const;
  if (plafond !== null && frais > plafond) return "quartiers.depasse" as const;
  const heure = s.eveningCountTime.trim();
  if (heure !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/u.test(heure)) return "quartiers.erreur.heure" as const;
  return null;
}

export function corpsReglages(s: SaisieReglages): UpdateShopSettingsInput {
  return {
    openingHours: s.openingHours.trim(),
    orderHours: s.orderHours.trim(),
    phone: s.phone.trim(),
    address: s.address.trim(),
    omNumber: s.omNumber.trim(),
    momoNumber: s.momoNumber.trim(),
    eveningCountTime: s.eveningCountTime.trim(),
    minimumOrder: lireFrais(s.minimumOrder) ?? 0,
    deliveryFeePerBottle: lireFrais(s.deliveryFeePerBottle) ?? 0,
  };
}
