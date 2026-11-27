import { toE164 } from "@jarvis/shared";

/**
 * Numéro pour un lien `wa.me` : chiffres seuls avec l'indicatif. Un numéro camerounais saisi sans indicatif
 * (9 chiffres) reçoit le 237 ; un numéro déjà international est gardé.
 */
export function numeroWhatsapp(saisie: string): string {
  // Même règle que le serveur ; à défaut (numéro libre ou incomplet), les chiffres tels quels.
  return (toE164(saisie.trim()) ?? saisie).replace(/\D/gu, "");
}

/** Sans numéro, WhatsApp laisse choisir le contact. */
export const lienWhatsappPour = (telephone: string, message: string): string =>
  `https://wa.me/${numeroWhatsapp(telephone)}?text=${encodeURIComponent(message)}`;
