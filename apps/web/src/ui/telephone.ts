/**
 * Numéro pour un lien `wa.me` : chiffres seuls avec l'indicatif. Un numéro camerounais saisi sans indicatif
 * (9 chiffres commençant par 6 ou 2) reçoit le 237 ; un numéro déjà international est gardé.
 */
export function numeroWhatsapp(saisie: string): string {
  const texte = saisie.trim();
  const chiffres = texte.replace(/\D/gu, "");
  if (texte.startsWith("+")) return chiffres;
  if (chiffres.startsWith("00")) return chiffres.slice(2);
  return /^[26]\d{8}$/u.test(chiffres) ? `237${chiffres}` : chiffres;
}

/** Sans numéro, WhatsApp laisse choisir le contact. */
export const lienWhatsappPour = (telephone: string, message: string): string =>
  `https://wa.me/${numeroWhatsapp(telephone)}?text=${encodeURIComponent(message)}`;
