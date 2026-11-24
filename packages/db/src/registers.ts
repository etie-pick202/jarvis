/** Les six caisses ; les deux dernières sont en stand-by (activables par réglage). */
export const REGISTERS = [
  { id: "sales_cash", label: "Ventes en espèces", active: true },
  { id: "canal_om", label: "Canal+ OM", active: true },
  { id: "canal_cash", label: "Canal+ espèces", active: true },
  { id: "settlement_om_momo", label: "Règlement OM et MoMo", active: true },
  { id: "transaction_om", label: "Transaction OM", active: false },
  { id: "transaction_momo", label: "Transaction MoMo", active: false },
];
