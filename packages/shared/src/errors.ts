import { z } from "zod";

export const errorCode = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "idempotency_conflict",
  "customer_name_required",
  "credit_not_allowed",
  "out_of_stock",
  "stock_conflict",
  "receipt_required",
  "justification_required",
  "price_above_ceiling",
  "internal_error",
]);
export type ErrorCode = z.infer<typeof errorCode>;

/** Format d'erreur commun de toute l'API : `{ error: { code, message } }`. */
export const apiError = z.object({
  error: z.object({ code: errorCode, message: z.string() }),
});
export type ApiError = z.infer<typeof apiError>;

export function errorBody(code: ErrorCode, message: string): ApiError {
  return { error: { code, message } };
}
