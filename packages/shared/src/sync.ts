import { z } from "zod";
import { idempotencyKey, isoDateTime } from "./common.js";
import { errorCode } from "./errors.js";

export const syncOperationType = z.enum([
  "sale",
  "expense",
  "transfer",
  "reception",
  "inventory_weekly",
  "inventory_evening",
  "canal_payment",
]);
export type SyncOperationType = z.infer<typeof syncOperationType>;

/** Une opération de la file hors ligne. `clientOpId` sert de clé d'idempotence : rejouer un lot ne crée aucun doublon. */
export const syncOperation = z.object({
  clientOpId: idempotencyKey,
  type: syncOperationType,
  occurredAt: isoDateTime,
  /** Corps de la requête correspondante (même schéma que l'écriture en ligne). */
  payload: z.unknown(),
});
export type SyncOperation = z.infer<typeof syncOperation>;

export const MAX_SYNC_BATCH = 200;

export const syncBatch = z.object({ operations: z.array(syncOperation).min(1).max(MAX_SYNC_BATCH) });
export type SyncBatch = z.infer<typeof syncBatch>;

/**
 * - applied : enregistrée.
 * - duplicate : déjà enregistrée par un rejeu précédent (résultat identique).
 * - conflict : enregistrée avec un écart de stock signalé au PDG, ou refusée pour conflit de stock (rien d'écrasé).
 * - rejected : refusée (droit, données invalides...), à corriger côté appareil.
 */
export const syncStatus = z.enum(["applied", "duplicate", "conflict", "rejected"]);
export type SyncStatus = z.infer<typeof syncStatus>;

export const syncResult = z.object({
  clientOpId: z.string(),
  status: syncStatus,
  applied: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({ code: errorCode, message: z.string() }).optional(),
  conflict: z.string().optional(),
});
export type SyncResult = z.infer<typeof syncResult>;
