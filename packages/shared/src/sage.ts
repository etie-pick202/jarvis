import { z } from "zod";

/** Comptes de l'export comptable. Les valeurs par défaut sont à confirmer avec le comptable. */
const account = z.string().regex(/^[0-9A-Z]{3,13}$/, "Numéro de compte invalide");

export const sageAccounts = z.object({
  /** Un compte de trésorerie par caisse. */
  registers: z.object({
    sales_cash: account,
    canal_om: account,
    canal_cash: account,
    settlement_om_momo: account,
    transaction_om: account,
    transaction_momo: account,
  }),
  goods: account,
  services: account,
  expenses: account,
  transfers: account,
  closureGain: account,
  closureLoss: account,
  suspense: account,
});
export type SageAccounts = z.infer<typeof sageAccounts>;

/** Plan comptable OHADA (SYSCOHADA). */
export const DEFAULT_SAGE_ACCOUNTS: SageAccounts = {
  registers: {
    sales_cash: "571100",
    canal_om: "554100",
    canal_cash: "571200",
    settlement_om_momo: "554200",
    transaction_om: "554300",
    transaction_momo: "554400",
  },
  goods: "701000",
  services: "706000",
  expenses: "605000",
  transfers: "585000",
  closureGain: "758000",
  closureLoss: "658000",
  suspense: "471000",
};
