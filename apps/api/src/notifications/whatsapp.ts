/**
 * Messages WhatsApp : liens préremplis que le gérant envoie en un clic (cahier des charges : ni SMS payant ni API).
 */

/** Indicatif du Cameroun, ajouté aux numéros nationaux à 9 chiffres. */
const COUNTRY_CODE = "237";

/** Numéro au format attendu par wa.me : chiffres seuls, avec indicatif. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^00/, "");
  return digits.length === 9 ? `${COUNTRY_CODE}${digits}` : digits;
}

export function whatsappLink(phone: string, message: string): string {
  return `https://wa.me/${whatsappNumber(phone)}?text=${encodeURIComponent(message)}`;
}
