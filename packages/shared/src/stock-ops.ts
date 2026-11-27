import { z } from "zod";
import { id, isoDateTime, justification } from "./common.js";
import { fcfa } from "./money.js";

/** Pièce justificative : photo ou PDF, 8 Mo au plus (les photos sont compressées avant l'envoi). */
export const RECEIPT_MAX_BYTES = 8 * 1024 * 1024;
export const RECEIPT_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

export const createSupplierInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  /** Marques fournies : un fournisseur peut en fournir plusieurs, une marque plusieurs fournisseurs. */
  brandIds: z.array(id).default([]),
});
export type CreateSupplierInput = z.infer<typeof createSupplierInput>;

export const updateSupplierInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    brandIds: z.array(id).optional(),
    active: z.boolean().optional(),
  })
  .refine((o) => Object.values(o).some((v) => v !== undefined), { message: "Au moins un champ à modifier" });
export type UpdateSupplierInput = z.infer<typeof updateSupplierInput>;

export const receptionLineInput = z
  .object({
    brandId: id,
    formatId: id,
    fullReceived: z.number().int().min(0),
    emptyReturned: z.number().int().min(0),
    /** Prix d'achat unitaire (FCFA). */
    unitCost: fcfa,
  })
  .refine((l) => l.fullReceived + l.emptyReturned > 0, { message: "Ligne vide" });

/** Réception fournisseur à sa date réelle. La pièce (bon de commande ou reçu) est obligatoire. */
export const createReceptionInput = z.object({
  supplierId: id,
  receivedAt: isoDateTime.optional(),
  /** Identifiant de la pièce envoyée par POST /receipts. */
  receiptId: id,
  lines: z.array(receptionLineInput).min(1),
});
export type CreateReceptionInput = z.infer<typeof createReceptionInput>;

export const countLineInput = z.object({
  brandId: id,
  formatId: id,
  countedFull: z.number().int().min(0),
  countedEmpty: z.number().int().min(0),
});

/** Inventaire hebdomadaire ou confirmation du soir : comptage physique, écart calculé par l'API. */
export const countInput = z.object({
  lines: z.array(countLineInput).min(1),
  /** Obligatoire dès qu'un écart apparaît. */
  justification: justification.optional(),
});
export type CountInput = z.infer<typeof countInput>;

export const setThresholdInput = z.object({
  /** Absents : seuil par défaut de tout le stock. */
  brandId: id.optional(),
  formatId: id.optional(),
  threshold: z.number().int().min(0),
});
export type SetThresholdInput = z.infer<typeof setThresholdInput>;

/** GET /stock/thresholds : seuil par défaut et exceptions par marque et format. */
export const stockThresholds = z.object({
  default: z.number().int(),
  overrides: z.array(z.object({ brandId: id, formatId: id, threshold: z.number().int() })),
});
export type StockThresholds = z.infer<typeof stockThresholds>;
