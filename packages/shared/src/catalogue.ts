import { z } from "zod";
import { id, isoDateTime } from "./common.js";
import { fcfa } from "./money.js";

const atLeastOne = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== undefined);
const atLeastOneField = { message: "Au moins un champ à modifier" };

export const createBrandInput = z.object({
  name: z.string().trim().min(1).max(60),
  /** Valeur d'emballage d'une bouteille vide de cette marque (FCFA). */
  packagingValue: fcfa,
});
export type CreateBrandInput = z.infer<typeof createBrandInput>;

export const updateBrandInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    packagingValue: fcfa.optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateBrandInput = z.infer<typeof updateBrandInput>;

export const brand = z.object({
  id,
  name: z.string(),
  packagingValue: fcfa,
  active: z.boolean(),
});
export type Brand = z.infer<typeof brand>;

export const createFormatInput = z.object({
  label: z.string().trim().min(1).max(60),
  weightGrams: z.number().int().positive(),
  /** Plafond de prix optionnel (prix réglementé). */
  priceCeiling: fcfa.nullable().optional(),
});
export type CreateFormatInput = z.infer<typeof createFormatInput>;

export const updateFormatInput = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    priceCeiling: fcfa.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateFormatInput = z.infer<typeof updateFormatInput>;

export const format = z.object({
  id,
  label: z.string(),
  weightGrams: z.number().int(),
  priceCeiling: fcfa.nullable(),
  active: z.boolean(),
});
export type Format = z.infer<typeof format>;

/** Prix de la recharge pour un format ; `brandId` absent = prix du format, présent = exception de marque. */
export const setGasPriceInput = z.object({
  formatId: id,
  brandId: id.nullable().optional(),
  amount: fcfa,
  transportContribution: fcfa.default(0),
  purchaseCost: fcfa.default(0),
});
export type SetGasPriceInput = z.infer<typeof setGasPriceInput>;

export const gasPrice = z.object({
  id,
  formatId: id,
  brandId: id.nullable(),
  amount: fcfa,
  transportContribution: fcfa,
  purchaseCost: fcfa,
  changedBy: id.nullable(),
  effectiveFrom: isoDateTime,
});
export type GasPrice = z.infer<typeof gasPrice>;

export const createArticleInput = z.object({
  name: z.string().trim().min(1).max(120),
  price: fcfa,
  purchaseCost: fcfa.default(0),
  trackStock: z.boolean().default(false),
});
export type CreateArticleInput = z.infer<typeof createArticleInput>;

export const updateArticleInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    price: fcfa.optional(),
    purchaseCost: fcfa.optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateArticleInput = z.infer<typeof updateArticleInput>;

export const article = z.object({
  id,
  name: z.string(),
  price: fcfa,
  purchaseCost: fcfa,
  trackStock: z.boolean(),
  stockQty: z.number().int(),
  active: z.boolean(),
});
export type Article = z.infer<typeof article>;
