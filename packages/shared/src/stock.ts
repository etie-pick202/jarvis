import { z } from "zod";
import { id, isoDateTime, justification, signedInt } from "./common.js";

export const bottleState = z.enum(["full", "empty"]);
export type BottleState = z.infer<typeof bottleState>;

export const stockMoveReason = z.enum([
  "sale",
  "exchange",
  "reception",
  "supplier_return",
  "inventory_adjustment",
  "evening_adjustment",
  "reversal",
]);
export type StockMoveReason = z.infer<typeof stockMoveReason>;

/** Mouvement de stock gaz (ajout seul) : `delta` est positif ou négatif, jamais nul. */
export const stockMove = z.object({
  id,
  brandId: id,
  formatId: id,
  state: bottleState,
  delta: signedInt.refine((n) => n !== 0, { message: "Variation nulle" }),
  reason: stockMoveReason,
  saleId: id.nullable(),
  receptionId: id.nullable(),
  reversalOf: id.nullable(),
  justification: justification.nullable(),
  authorId: id,
  createdAt: isoDateTime,
});
export type StockMove = z.infer<typeof stockMove>;

export const stockLevel = z.object({
  brandId: id,
  formatId: id,
  full: signedInt,
  empty: signedInt,
});
export type StockLevel = z.infer<typeof stockLevel>;
