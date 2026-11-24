import { z } from "zod";
import { id, isoDateTime, justification, signedInt } from "./common.js";
import { fcfa } from "./money.js";

/** Les six caisses ; les deux dernières sont en stand-by (activables par réglage). */
export const cashRegisterId = z.enum([
  "sales_cash",
  "canal_om",
  "canal_cash",
  "settlement_om_momo",
  "transaction_om",
  "transaction_momo",
]);
export type CashRegisterId = z.infer<typeof cashRegisterId>;

export const paymentMethod = z.enum(["cash", "orange_money", "momo"]);
export type PaymentMethod = z.infer<typeof paymentMethod>;

/** Types de mouvement repris du X de caisse : règlement, acompte, entrée, sortie, fond de caisse. */
export const cashEntryType = z.enum(["REG", "ACP", "MEC", "MSC", "FDC"]);
export type CashEntryType = z.infer<typeof cashEntryType>;

export const direction = z.enum(["in", "out"]);
export type Direction = z.infer<typeof direction>;

/** Mouvement du journal de caisse (ajout seul). Le solde est calculé, jamais saisi. */
export const cashEntry = z.object({
  id,
  number: z.string(),
  registerId: cashRegisterId,
  direction,
  type: cashEntryType,
  paymentMethod,
  customerName: z.string().nullable(),
  label: z.string().min(1),
  amount: fcfa.positive(),
  balanceAfter: signedInt,
  operatorId: id,
  createdAt: isoDateTime,
  saleId: id.nullable(),
  /** Renseigné quand cette écriture en inverse une autre. */
  reversalOf: id.nullable(),
});
export type CashEntry = z.infer<typeof cashEntry>;

export const createExpenseInput = z.object({
  registerId: cashRegisterId,
  amount: fcfa.positive(),
  label: z.string().trim().min(1).max(200),
});
export type CreateExpenseInput = z.infer<typeof createExpenseInput>;

export const createTransferInput = z
  .object({
    fromRegisterId: cashRegisterId,
    toRegisterId: cashRegisterId,
    amount: fcfa.positive(),
    label: z.string().trim().min(1).max(200),
  })
  .refine((v) => v.fromRegisterId !== v.toRegisterId, {
    message: "Caisses identiques",
    path: ["toRegisterId"],
  });
export type CreateTransferInput = z.infer<typeof createTransferInput>;

export const closeRegisterInput = z.object({
  registerId: cashRegisterId,
  countedAmount: fcfa,
  justification: justification.optional(),
});
export type CloseRegisterInput = z.infer<typeof closeRegisterInput>;
