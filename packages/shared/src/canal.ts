import { z } from "zod";
import { cashRegisterId, paymentMethod } from "./cash.js";
import { id, isoDateTime, signedInt } from "./common.js";
import { fcfa } from "./money.js";
import { phoneNumber } from "./phone.js";

/** Canal+ : formules, abonnés et échéances (cahier des charges, « Canal+ et services annexes »). */

const decoderNumber = z.string().trim().min(3).max(40);
const atLeastOne = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== undefined);
const atLeastOneField = { message: "Au moins un champ à modifier" };

export const createCanalFormulaInput = z.object({
  name: z.string().trim().min(1).max(60),
  price: fcfa.positive(),
  /** Durée couverte par un paiement, en mois. */
  months: z.number().int().min(1).max(24).default(1),
  /** Commission perçue par paiement si COCOSAB est agent agréé ; 0 sinon (point ouvert). */
  commission: fcfa.default(0),
});
export type CreateCanalFormulaInput = z.infer<typeof createCanalFormulaInput>;

export const updateCanalFormulaInput = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    price: fcfa.positive().optional(),
    months: z.number().int().min(1).max(24).optional(),
    commission: fcfa.optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateCanalFormulaInput = z.infer<typeof updateCanalFormulaInput>;

export const canalFormula = z.object({
  id,
  name: z.string(),
  price: fcfa,
  months: z.number().int(),
  commission: fcfa,
  active: z.boolean(),
});
export type CanalFormula = z.infer<typeof canalFormula>;
export const canalFormulas = z.array(canalFormula);

export const createCanalSubscriberInput = z.object({
  name: z.string().trim().min(1).max(120),
  phone: phoneNumber,
  decoderNumber,
  formulaId: id,
  /** Échéance en cours si l'abonné en a déjà une (saisie progressive, aucun import). */
  expiresOn: z.iso.date().nullable().optional(),
});
export type CreateCanalSubscriberInput = z.infer<typeof createCanalSubscriberInput>;

export const updateCanalSubscriberInput = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    phone: phoneNumber.optional(),
    decoderNumber: decoderNumber.optional(),
    formulaId: id.optional(),
    expiresOn: z.iso.date().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine(atLeastOne, atLeastOneField);
export type UpdateCanalSubscriberInput = z.infer<typeof updateCanalSubscriberInput>;

export const canalSubscriber = z.object({
  id,
  name: z.string(),
  phone: z.string(),
  decoderNumber: z.string(),
  formulaId: id,
  formulaName: z.string(),
  formulaPrice: fcfa,
  /** Dernier jour couvert (AAAA-MM-JJ) ; null si aucun abonnement enregistré. */
  expiresOn: z.iso.date().nullable(),
  /** Jours restants jusqu'à l'échéance (négatif : dépassée) ; null sans échéance. */
  daysLeft: signedInt.nullable(),
  active: z.boolean(),
  createdAt: isoDateTime,
});
export type CanalSubscriber = z.infer<typeof canalSubscriber>;
export const canalSubscribers = z.array(canalSubscriber);

/** Encaissement d'un abonnement ou réabonnement : prix et durée viennent de la formule. */
export const canalPaymentInput = z.object({
  /** Espèces ou Orange Money (les deux caisses Canal+). */
  paymentMethod,
  /** Changement de formule à l'occasion du paiement ; absent = formule de la fiche. */
  formulaId: id.optional(),
});
export type CanalPaymentInput = z.infer<typeof canalPaymentInput>;

export const canalPayment = z.object({
  id,
  subscriberId: id,
  subscriberName: z.string(),
  decoderNumber: z.string(),
  formulaId: id,
  formulaName: z.string(),
  months: z.number().int(),
  amount: fcfa,
  commission: fcfa,
  paymentMethod,
  registerId: cashRegisterId,
  previousExpiry: z.iso.date().nullable(),
  newExpiry: z.iso.date(),
  authorId: id,
  authorName: z.string(),
  createdAt: isoDateTime,
  /** Renseigné quand cette ligne annule un encaissement. */
  reversalOf: id.nullable(),
  /** Vrai si cet encaissement a été annulé. */
  cancelled: z.boolean(),
});
export type CanalPayment = z.infer<typeof canalPayment>;
export const canalPayments = z.array(canalPayment);

/** Rejeu hors ligne d'un encaissement : le même corps, avec la fiche visée. */
export const canalPaymentSyncPayload = canalPaymentInput.extend({ subscriberId: id });

/** Langue d'un message envoyé au client. */
export const language = z.enum(["fr", "en"]);
export type Language = z.infer<typeof language>;

/** Relance prête à envoyer : le gérant ouvre le lien, WhatsApp est prérempli. */
export const canalReminder = canalSubscriber.extend({ message: z.string(), whatsappUrl: z.url() });
export type CanalReminder = z.infer<typeof canalReminder>;
export const canalReminders = z.array(canalReminder);
