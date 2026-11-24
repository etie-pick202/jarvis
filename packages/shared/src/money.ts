import { z } from "zod";

/** Montant en FCFA : toujours un entier, jamais un décimal. */
export const fcfa = z.number().int().nonnegative();
export type Fcfa = z.infer<typeof fcfa>;

export function formatFcfa(amount: Fcfa): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}
