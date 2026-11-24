import { z } from "zod";

export const id = z.uuid();
export type Id = z.infer<typeof id>;

/** Date et heure ISO 8601 (UTC). */
export const isoDateTime = z.iso.datetime();

/** Entier relatif (écarts, variations de stock) : jamais décimal. */
export const signedInt = z.number().int();

/** En-tête `Idempotency-Key` : rejouer une requête avec la même clé ne crée pas de doublon. */
export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const idempotencyKey = z.string().min(8).max(128);

/** Justificatif obligatoire (annulation, correction, écart). */
export const justification = z.string().trim().min(5).max(500);
