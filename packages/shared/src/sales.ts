import { z } from "zod";
import { paymentMethod } from "./cash.js";
import { id, isoDateTime, justification, signedInt } from "./common.js";
import { fcfa } from "./money.js";

/** Nom du client des ventes non gaz lorsqu'aucun nom n'est donné. */
export const WALKIN_CUSTOMER = "Client comptoir";

export const gasLine = z.object({
  kind: z.literal("gas"),
  brandId: id,
  formatId: id,
  quantity: z.number().int().min(1),
  /** Marque du vide rapporté ; absente = même marque que le plein remis. */
  returnedBrandId: id.optional(),
});

export const articleLine = z.object({
  kind: z.literal("article"),
  articleId: id,
  quantity: z.number().int().min(1),
});

export const saleLineInput = z.discriminatedUnion("kind", [gasLine, articleLine]);
export type SaleLineInput = z.infer<typeof saleLineInput>;

export const createSaleInput = z
  .object({
    customerName: z.string().trim().max(120).optional(),
    paymentMethod,
    deliveryFeePerBottle: fcfa.optional(),
    lines: z.array(saleLineInput).min(1),
  })
  .superRefine((sale, ctx) => {
    const hasGas = sale.lines.some((l) => l.kind === "gas");
    if (hasGas && !sale.customerName) {
      ctx.addIssue({
        code: "custom",
        path: ["customerName"],
        message: "Nom du client obligatoire pour le gaz",
      });
    }
  });
export type CreateSaleInput = z.infer<typeof createSaleInput>;

export const saleLine = z.object({
  kind: z.enum(["gas", "article"]),
  brandId: id.nullable(),
  formatId: id.nullable(),
  articleId: id.nullable(),
  quantity: z.number().int().min(1),
  /** Prix unitaire de l'article ou du gaz seul (hors contribution transport et livraison). */
  unitPrice: fcfa,
  transportContribution: fcfa,
  deliveryFee: fcfa,
  returnedBrandId: id.nullable(),
  /** Écart de valeur d'emballage : positif = gain, négatif = perte, nul hors échange. */
  packagingGap: signedInt,
  /** Vrai si l'écart n'a pas pu être calculé (valeur d'emballage inconnue) : il vaut 0, à régulariser. */
  packagingGapPending: z.boolean().optional(),
  total: fcfa,
});
export type SaleLine = z.infer<typeof saleLine>;

export const sale = z.object({
  id,
  number: z.string(),
  customerName: z.string(),
  paymentMethod,
  total: fcfa,
  lines: z.array(saleLine),
  authorId: id,
  createdAt: isoDateTime,
  /** Renseigné quand cette écriture en inverse une autre. */
  reversalOf: id.nullable(),
});
export type Sale = z.infer<typeof sale>;

export const cancelSaleInput = z.object({ justification });
export type CancelSaleInput = z.infer<typeof cancelSaleInput>;

/** Reçu d'une vente, prêt à être partagé. */
export const saleReceipt = z.object({
  number: z.string(),
  lines: z.array(z.string()),
  message: z.string(),
  /** Lien WhatsApp prérempli ; sans numéro connu, WhatsApp laisse choisir le contact. */
  whatsappUrl: z.url(),
});
export type SaleReceipt = z.infer<typeof saleReceipt>;

/** Solder un écart « à régulariser » : sans montant, il est calculé avec les valeurs désormais connues. */
export const settlePackagingInput = z.object({ packagingGap: signedInt.optional() });
export type SettlePackagingInput = z.infer<typeof settlePackagingInput>;

/** GET /sales/exchanges : page d'échanges entre marques. */
export const exchangePage = z.object({
  items: z.array(sale),
  /** Nombre total de ventes correspondant au filtre, toutes pages confondues. */
  total: z.number().int(),
  /** Ventes dont un écart d'emballage reste à solder. */
  pendingCount: z.number().int(),
});
export type ExchangePage = z.infer<typeof exchangePage>;
