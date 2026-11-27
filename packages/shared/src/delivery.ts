import { z } from "zod";
import { id } from "./common.js";
import { fcfa } from "./money.js";

/** Vitrine publique, réglages de la boutique et quartiers livrés (cahier des charges, module 5). */

const text = z.string().trim().max(200);
const atLeastOne = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== undefined);
const atLeastOneField = { message: "Au moins un champ à modifier" };

export const shopSettings = z.object({
  /** Horaires d'ouverture et de prise de commande : texte libre affiché au client. */
  openingHours: text,
  orderHours: text,
  phone: text,
  address: text,
  /** Montant minimum d'une commande en FCFA ; 0 = aucun. */
  minimumOrder: fcfa,
  /** Frais de livraison par bouteille quand le quartier n'a pas son propre montant. */
  deliveryFeePerBottle: fcfa,
  /** Plafond fixé par le PDG ; null = aucun. */
  deliveryFeeCeiling: fcfa.nullable(),
});
export type ShopSettings = z.infer<typeof shopSettings>;

export const updateShopSettingsInput = shopSettings
  .omit({ deliveryFeeCeiling: true })
  .partial()
  .refine(atLeastOne, atLeastOneField);
export type UpdateShopSettingsInput = z.infer<typeof updateShopSettingsInput>;

export const setDeliveryFeeCeilingInput = z.object({ ceiling: fcfa.nullable() });
export type SetDeliveryFeeCeilingInput = z.infer<typeof setDeliveryFeeCeilingInput>;

const neighbourhoodName = z.string().trim().min(1).max(80);

export const createNeighbourhoodInput = z.object({
  name: neighbourhoodName,
  /** Absent : le montant par défaut de la boutique. */
  feePerBottle: fcfa.optional(),
});
export type CreateNeighbourhoodInput = z.infer<typeof createNeighbourhoodInput>;

export const updateNeighbourhoodInput = z
  .object({
    name: neighbourhoodName.optional(),
    feePerBottle: fcfa.optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateNeighbourhoodInput = z.infer<typeof updateNeighbourhoodInput>;

export const neighbourhood = z.object({
  id,
  name: z.string(),
  feePerBottle: fcfa,
  active: z.boolean(),
});
export type Neighbourhood = z.infer<typeof neighbourhood>;
export const neighbourhoods = z.array(neighbourhood);

/** GET /shop/catalogue : sans compte. Aucun coût d'achat ni quantité en stock n'y figure. */
export const publicCatalogue = z.object({
  gas: z.array(
    z.object({
      brandId: id,
      brandName: z.string(),
      formatId: id,
      formatLabel: z.string(),
      /** Prix de la recharge, contribution transport comprise, hors livraison. */
      price: fcfa,
      available: z.boolean(),
    }),
  ),
  articles: z.array(z.object({ id, name: z.string(), price: fcfa, available: z.boolean() })),
  neighbourhoods: z.array(neighbourhood.pick({ id: true, name: true, feePerBottle: true })),
  shop: shopSettings.omit({ deliveryFeeCeiling: true }),
});
export type PublicCatalogue = z.infer<typeof publicCatalogue>;
