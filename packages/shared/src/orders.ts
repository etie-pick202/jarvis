import { z } from "zod";
import { paymentMethod } from "./cash.js";
import { id, isoDateTime } from "./common.js";
import { fcfa } from "./money.js";
import { saleLineInput } from "./sales.js";

/** Commandes sans compte : choisir, indiquer son nom et son adresse, payer, suivre (module 5). */

export const orderMode = z.enum(["pickup", "delivery"]);
export type OrderMode = z.infer<typeof orderMode>;

export const orderStatus = z.enum([
  "pending",
  "validated",
  "out_for_delivery",
  "delivered",
  "problem",
  "cancelled",
]);
export type OrderStatus = z.infer<typeof orderStatus>;

const paymentReference = z.string().trim().min(3).max(60);

export const createOrderInput = z
  .object({
    /** Identifiant tiré par l'appareil : renvoyer la même commande ne la duplique pas. */
    clientRef: z.uuid(),
    customerName: z.string().trim().min(1).max(120),
    phone: z.string().trim().min(6).max(30),
    mode: orderMode,
    /** Quartier connu (liste de la vitrine), ou à défaut son nom. */
    neighbourhoodId: id.optional(),
    neighbourhoodName: z.string().trim().min(1).max(80).optional(),
    /** Repère d'adresse. */
    landmark: z.string().trim().max(300).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    paymentMethod,
    /** Référence de la transaction Orange Money ou MoMo, confirmée ensuite par le gérant. */
    paymentReference: paymentReference.optional(),
    lines: z.array(saleLineInput).min(1).max(20),
  })
  .superRefine((o, ctx) => {
    if (o.mode === "delivery" && !o.neighbourhoodId && !o.neighbourhoodName) {
      ctx.addIssue({ code: "custom", path: ["neighbourhoodName"], message: "Quartier obligatoire" });
    }
  });
export type CreateOrderInput = z.infer<typeof createOrderInput>;

export const setPaymentReferenceInput = z.object({ paymentReference });

/** Validation par le gérant, qui peut changer les frais de livraison (montant mémorisé pour le quartier). */
export const validateOrderInput = z.object({ deliveryFeePerBottle: fcfa.optional() });
export type ValidateOrderInput = z.infer<typeof validateOrderInput>;

export const orderLine = z.object({
  kind: z.enum(["gas", "article"]),
  brandId: id.nullable(),
  formatId: id.nullable(),
  returnedBrandId: id.nullable(),
  articleId: id.nullable(),
  label: z.string(),
  quantity: z.number().int().min(1),
  /** Prix unitaire payé, contribution transport comprise, hors livraison. */
  unitPrice: fcfa,
  deliveryFee: fcfa,
  total: fcfa,
});
export type OrderLine = z.infer<typeof orderLine>;

/** Ce que le client voit par son lien de suivi. */
export const trackedOrder = z.object({
  number: z.string(),
  status: orderStatus,
  mode: orderMode,
  paymentMethod,
  paymentConfirmed: z.boolean(),
  total: fcfa,
  lines: z.array(orderLine.pick({ label: true, quantity: true, total: true })),
  createdAt: isoDateTime,
});
export type TrackedOrder = z.infer<typeof trackedOrder>;

/** Réponse à la prise de commande : le jeton ouvre le suivi. */
export const placedOrder = trackedOrder.extend({ trackingToken: z.string() });
export type PlacedOrder = z.infer<typeof placedOrder>;

export const order = z.object({
  id,
  number: z.string(),
  source: z.enum(["online", "phone"]),
  status: orderStatus,
  mode: orderMode,
  customerName: z.string(),
  phone: z.string(),
  neighbourhoodName: z.string().nullable(),
  landmark: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  paymentMethod,
  paymentReference: z.string().nullable(),
  paymentConfirmedAt: isoDateTime.nullable(),
  deliveryFeePerBottle: fcfa,
  total: fcfa,
  lines: z.array(orderLine),
  createdAt: isoDateTime,
  /** Livreur à qui la commande est confiée. */
  assignedTo: id.nullable().optional(),
  problemNote: z.string().nullable().optional(),
  /** Vente créée à la remise. */
  saleId: id.nullable().optional(),
});
export type Order = z.infer<typeof order>;
export const orders = z.array(order);

/** Pastilles : commandes à traiter et à livrer. */
export const orderSummary = z.object({ pending: z.number().int(), toDeliver: z.number().int() });
export type OrderSummary = z.infer<typeof orderSummary>;

export const assignOrderInput = z.object({ driverId: id });

/** Remise au client : encaissement confirmé et vides récupérés. */
export const completeOrderInput = z.object({
  /** Moyen réellement encaissé ; absent = celui de la commande. */
  paymentMethod: paymentMethod.optional(),
  /** Marque du vide rapporté, par ligne de gaz (`line` = rang dans la commande) ; absent = même marque. */
  returnedEmpties: z.array(z.object({ line: z.number().int().min(0), returnedBrandId: id })).optional(),
});
export type CompleteOrderInput = z.infer<typeof completeOrderInput>;

export const deliveryProblemInput = z.object({ note: z.string().trim().min(3).max(300) });

/** Une livraison de la tournée, telle que le mode livreur l'affiche. */
export const delivery = z.object({
  id,
  number: z.string(),
  status: orderStatus,
  customerName: z.string(),
  phone: z.string(),
  neighbourhoodName: z.string().nullable(),
  landmark: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  paymentMethod,
  paymentConfirmed: z.boolean(),
  total: fcfa,
  lines: z.array(orderLine),
  problemNote: z.string().nullable(),
});
export type Delivery = z.infer<typeof delivery>;
export const deliveries = z.array(delivery);
