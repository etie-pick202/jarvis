import type { MobileOperator, MoneyOperationKind } from "@jarvis/shared";

/** Les espèces des clients entrent et sortent de la caisse des ventes en espèces. */
export const SHOP_CASH = "sales_cash";

export function floatRegister(operator: MobileOperator): "transaction_om" | "transaction_momo" {
  return operator === "orange_money" ? "transaction_om" : "transaction_momo";
}

/** Dépôt : les espèces entrent, le float sort. Retrait : l'inverse. */
export function movements(kind: MoneyOperationKind) {
  return kind === "deposit"
    ? ({ cashDirection: "in", floatDirection: "out" } as const)
    : ({ cashDirection: "out", floatDirection: "in" } as const);
}

/** Commission en FCFA entiers, arrondie à l'inférieur, à partir d'un taux en points de base. */
export function commissionFor(amount: number, basisPoints: number): number {
  return Math.floor((amount * basisPoints) / 10_000);
}
