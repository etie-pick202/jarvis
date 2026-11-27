import type { MobileOperator, MoneyOperation, MoneyOperationKind } from "@jarvis/shared";

export const OPERATEURS: readonly MobileOperator[] = ["orange_money", "momo"];

/** Caisse « transaction » qui porte le float de chaque opérateur. */
export const CAISSE_FLOAT: Record<MobileOperator, string> = {
  orange_money: "transaction_om",
  momo: "transaction_momo",
};

/** Un dépôt sort du float, un retrait sort des espèces : aucun des deux soldes ne devient négatif. */
export function soldeInsuffisant(
  sens: MoneyOperationKind,
  montant: number,
  soldes: { float?: number; especes?: number },
): boolean {
  const disponible = sens === "deposit" ? soldes.float : soldes.especes;
  return disponible !== undefined && montant > disponible;
}

/** La référence de l'opérateur est unique : on compare sans casse ni espaces autour. */
export function referenceDejaVue(
  reference: string,
  operateur: MobileOperator,
  vues: readonly { operator?: unknown; reference?: unknown }[],
): boolean {
  const r = reference.trim().toLowerCase();
  return (
    r !== "" && vues.some((v) => v.operator === operateur && String(v.reference).trim().toLowerCase() === r)
  );
}

/** Seule une opération ni annulée ni elle-même une annulation peut être annulée. */
export const annulable = (o: Pick<MoneyOperation, "cancelled" | "reversalOf">): boolean =>
  !o.cancelled && o.reversalOf === null;

/** Taux saisi en pourcentage (« 1,5 ») vers des points de base ; deux décimales au plus, 100 % au plus. */
export function lireTaux(saisie: string): number | null {
  const t = saisie.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/u.test(t)) return null;
  const points = Math.round(Number(t) * 100);
  return points <= 10_000 ? points : null;
}
