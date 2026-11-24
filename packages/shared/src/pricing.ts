import type { Fcfa } from "./money.js";

/** Valeurs par défaut de la maquette : gaz 6 500, contribution transport 300, livraison +400 par bouteille. */
export const DEFAULT_GAS_PRICE: Fcfa = 6500;
export const TRANSPORT_CONTRIBUTION: Fcfa = 300;
export const DEFAULT_DELIVERY_FEE_PER_BOTTLE: Fcfa = 400;

/** Prix de retrait au comptoir pour `bottles` bouteilles. */
export function pickupTotal(bottles: number): Fcfa {
  assertBottles(bottles);
  return (DEFAULT_GAS_PRICE + TRANSPORT_CONTRIBUTION) * bottles;
}

/** Prix livré pour `bottles` bouteilles ; `extraPerBottle` = majoration de quartier (tracée, plafonnée par le PDG). */
export function deliveryTotal(bottles: number, extraPerBottle: Fcfa = 0): Fcfa {
  assertBottles(bottles);
  return (
    (DEFAULT_GAS_PRICE + TRANSPORT_CONTRIBUTION + DEFAULT_DELIVERY_FEE_PER_BOTTLE + extraPerBottle) * bottles
  );
}

function assertBottles(bottles: number): void {
  if (!Number.isInteger(bottles) || bottles < 1) {
    throw new RangeError("Le nombre de bouteilles doit être un entier d'au moins 1.");
  }
}
