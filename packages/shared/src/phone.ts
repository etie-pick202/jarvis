import { z } from "zod";

/** Numéros de téléphone au format international E.164, indispensable aux liens WhatsApp. */

/** Indicatif par défaut : Cameroun. */
export const DEFAULT_COUNTRY_CODE = "237";

/** Longueur d'un numéro national camerounais. */
const NATIONAL_LENGTH = 9;

/**
 * « 6 90 00 00 00 », « 237690000000 » ou « 00237 690-000-000 » deviennent « +237690000000 ». Un autre pays s'écrit
 * avec son indicatif (« +33 … »). Renvoie `null` si ce n'est pas un numéro.
 */
export function toE164(raw: string): string | null {
  const compact = raw.replace(/[\s.\-()/]/g, "").replace(/^00/, "+");
  if (!/^\+?\d+$/.test(compact)) return null;
  let digits = compact.replace("+", "");
  if (!compact.startsWith("+")) {
    if (digits.length === NATIONAL_LENGTH) digits = `${DEFAULT_COUNTRY_CODE}${digits}`;
    else if (!(digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length === 12)) return null;
  }
  // Un numéro camerounais a toujours 9 chiffres après l'indicatif.
  if (digits.startsWith(DEFAULT_COUNTRY_CODE) && digits.length !== 12) return null;
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}

/** Champ de saisie : accepte les écritures usuelles et rend la forme E.164. */
export const phoneNumber = z
  .string()
  .max(30)
  .transform((raw, ctx) => {
    const normalized = toE164(raw.trim());
    if (normalized) return normalized;
    ctx.addIssue({ code: "custom", message: "Numéro de téléphone invalide" });
    return z.NEVER;
  });
