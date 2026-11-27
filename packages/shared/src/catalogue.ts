import { z } from "zod";
import { id, isoDateTime } from "./common.js";
import { fcfa } from "./money.js";

const atLeastOne = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== undefined);
const atLeastOneField = { message: "Au moins un champ à modifier" };

const packagingValueNeeded = {
  message: "La valeur d'emballage est obligatoire quand elle est connue",
  path: ["packagingValue"],
};

export const createBrandInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    /** Valeur d'emballage d'une bouteille vide de cette marque (FCFA). Omise si elle est inconnue. */
    packagingValue: fcfa.optional(),
    /** Faux pour déclarer la valeur inconnue (marque non relevée) ; vrai par défaut. */
    packagingValueKnown: z.boolean().optional(),
  })
  .refine((b) => b.packagingValueKnown === false || b.packagingValue !== undefined, packagingValueNeeded);
export type CreateBrandInput = z.infer<typeof createBrandInput>;

export const updateBrandInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    packagingValue: fcfa.optional(),
    /** Faux : valeur inconnue (écart des échanges à régulariser) ; vrai exige `packagingValue`. */
    packagingValueKnown: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField)
  .refine((b) => b.packagingValueKnown !== true || b.packagingValue !== undefined, packagingValueNeeded);
export type UpdateBrandInput = z.infer<typeof updateBrandInput>;

export const brand = z.object({
  id,
  name: z.string(),
  /** 0 quand la valeur est inconnue (voir `packagingValueKnown`). */
  packagingValue: fcfa,
  /** Faux tant que la valeur d'emballage n'a pas été relevée ; absent = connue. */
  packagingValueKnown: z.boolean().optional(),
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
  category: z.string().trim().max(60).optional(),
  /** Seuil d'alerte de stock bas ; 0 = aucune alerte. */
  lowThreshold: z.number().int().min(0).optional(),
  /** Stock de départ, pour un article suivi. */
  initialQty: z.number().int().min(0).optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleInput>;

export const updateArticleInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    price: fcfa.optional(),
    purchaseCost: fcfa.optional(),
    category: z.string().trim().max(60).optional(),
    lowThreshold: z.number().int().min(0).optional(),
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
  category: z.string().optional(),
  lowThreshold: z.number().int().optional(),
});
export type Article = z.infer<typeof article>;

/** GET /catalogue/prices/current : prix en vigueur de chaque marque et format actifs. */
export const currentGasPrices = z.array(
  z.object({
    formatId: id,
    brandId: id,
    amount: fcfa,
    transportContribution: fcfa,
    purchaseCost: fcfa,
    effectiveFrom: isoDateTime,
  }),
);
export type CurrentGasPrices = z.infer<typeof currentGasPrices>;

export const adjustArticleInput = z.object({
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "Variation nulle" }),
  justification: z.string().optional(),
});
export type AdjustArticleInput = z.infer<typeof adjustArticleInput>;

export const restockArticleInput = z.object({
  quantity: z.number().int().min(1),
  /** Pièce du fournisseur, envoyée au préalable (POST /receipts). */
  receiptId: id,
  unitCost: fcfa.optional(),
  label: z.string().trim().min(1).max(200).optional(),
});
export type RestockArticleInput = z.infer<typeof restockArticleInput>;

export const articleMove = z.object({
  id,
  at: isoDateTime,
  kind: z.enum(["sale", "entry", "adjustment"]),
  label: z.string(),
  delta: z.number().int(),
  authorName: z.string(),
});
export type ArticleMove = z.infer<typeof articleMove>;
export const articleMoves = z.array(articleMove);
