import { z } from "zod";
import { id, isoDateTime, signedInt } from "./common.js";
import { fcfa } from "./money.js";
import { phoneNumber } from "./phone.js";

/** Dépôts et retraits Orange Money et MoMo (caisses « transaction », en stand-by par défaut). */

export const mobileOperator = z.enum(["orange_money", "momo"]);
export type MobileOperator = z.infer<typeof mobileOperator>;

/** deposit : le client verse des espèces et reçoit de la monnaie mobile ; withdrawal : l'inverse. */
export const moneyOperationKind = z.enum(["deposit", "withdrawal"]);
export type MoneyOperationKind = z.infer<typeof moneyOperationKind>;

export const moneyOperationInput = z.object({
  operator: mobileOperator,
  kind: moneyOperationKind,
  amount: fcfa.positive(),
  phone: phoneNumber,
  customerName: z.string().trim().min(1).max(120).optional(),
  /** Référence de la transaction donnée par l'opérateur (unique par opérateur). */
  reference: z.string().trim().min(3).max(60),
});
export type MoneyOperationInput = z.infer<typeof moneyOperationInput>;

export const moneyOperation = z.object({
  id,
  operator: mobileOperator,
  kind: moneyOperationKind,
  amount: fcfa,
  commission: fcfa,
  phone: z.string(),
  customerName: z.string().nullable(),
  reference: z.string(),
  authorId: id,
  authorName: z.string(),
  createdAt: isoDateTime,
  reversalOf: id.nullable(),
  cancelled: z.boolean(),
});
export type MoneyOperation = z.infer<typeof moneyOperation>;
export const moneyOperations = z.array(moneyOperation);

/** Taux de commission en points de base (100 = 1 %) ; 0 par défaut (agrément non confirmé). */
const rate = z.number().int().min(0).max(10_000);
export const commissionRates = z.object({ deposit: rate, withdrawal: rate });
export const commissionSettings = z.object({ orange_money: commissionRates, momo: commissionRates });
export type CommissionSettings = z.infer<typeof commissionSettings>;

export const floatState = z.object({
  operator: mobileOperator,
  /** Faux : caisse en stand-by, aucune opération acceptée. */
  active: z.boolean(),
  float: signedInt,
});
export type FloatState = z.infer<typeof floatState>;
export const floatStates = z.array(floatState);
