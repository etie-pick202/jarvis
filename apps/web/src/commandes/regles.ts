import type { Order, OrderStatus } from "@jarvis/shared";
import { ApiError } from "../api/client.js";

export type Filtre = "attente" | "cours" | "finies";

export const FILTRES: Record<Filtre, readonly OrderStatus[]> = {
  attente: ["pending"],
  cours: ["validated", "out_for_delivery", "problem"],
  finies: ["delivered", "cancelled"],
};

export type Action = "validate" | "confirm-payment" | "assign" | "collect" | "cancel";

/** Les gestes que le serveur acceptera dans l'état actuel de la commande. */
export function actionsPossibles(o: Order): Action[] {
  if (o.status === "delivered" || o.status === "cancelled") return [];
  const actions: Action[] = [];
  if (o.status === "pending") actions.push("validate");
  if (o.paymentMethod !== "cash" && o.paymentConfirmedAt === null) actions.push("confirm-payment");
  if (o.status !== "pending" && o.mode === "delivery") actions.push("assign");
  if (o.status === "validated" && o.mode === "pickup") actions.push("collect");
  // En cours de livraison, on attend la remise ou le problème signalé par le livreur.
  if (o.status !== "out_for_delivery") actions.push("cancel");
  return actions;
}

/** Message du serveur à montrer tel quel, ou null pour une panne (réseau, serveur). */
export function refus(erreur: unknown): string | null {
  return erreur instanceof ApiError && erreur.status < 500 ? erreur.message : null;
}
