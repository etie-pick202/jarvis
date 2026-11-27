import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import type { CashEntryType, CashRegisterId, Direction, PaymentMethod } from "@jarvis/shared";
import { and, desc, eq, lt, sql } from "drizzle-orm";

const { cashEntries } = schema;

export function formatNumber(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(6, "0")}`;
}

/** Solde après un mouvement : toujours calculé à partir du précédent, jamais saisi. */
export function nextBalance(previous: number, direction: Direction, amount: number): number {
  return direction === "in" ? previous + amount : previous - amount;
}

/** Caisse qui reçoit un paiement de vente : espèces au comptoir, sinon règlement OM et MoMo. */
export function registerForPayment(method: PaymentMethod): CashRegisterId {
  return method === "cash" ? "sales_cash" : "settlement_om_momo";
}

export async function nextSequence(
  tx: Database,
  sequence: "sale_number_seq" | "cash_entry_number_seq" | "order_number_seq",
) {
  const res = await tx.execute(sql`select nextval(${sequence}::regclass) as n`);
  const row = (res as unknown as { rows: { n: string | number }[] }).rows[0];
  return Number(row?.n);
}

export async function registerBalance(tx: Database, registerId: string): Promise<number> {
  const [last] = await tx
    .select({ balance: cashEntries.balanceAfter })
    .from(cashEntries)
    .where(eq(cashEntries.registerId, registerId))
    .orderBy(desc(cashEntries.createdAt), desc(cashEntries.number))
    .limit(1);
  return last?.balance ?? 0;
}

/** Solde d'une caisse juste avant un instant (fond de caisse d'ouverture d'un jour). */
export async function balanceBefore(tx: Database, registerId: string, at: Date): Promise<number> {
  const [last] = await tx
    .select({ balance: cashEntries.balanceAfter })
    .from(cashEntries)
    .where(and(eq(cashEntries.registerId, registerId), lt(cashEntries.createdAt, at)))
    .orderBy(desc(cashEntries.createdAt), desc(cashEntries.number))
    .limit(1);
  return last?.balance ?? 0;
}

export interface CashEntryInput {
  registerId: CashRegisterId;
  direction: Direction;
  type: CashEntryType;
  paymentMethod: PaymentMethod;
  customerName?: string | null;
  label: string;
  amount: number;
  operatorId: string;
  saleId?: string | null;
  reversalOf?: string | null;
  justification?: string | null;
  createdAt: Date;
}

/** Ajoute un mouvement de caisse et calcule le solde après opération (verrou par caisse). */
export async function appendCashEntry(tx: Database, input: CashEntryInput) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cash:${input.registerId}`}))`);
  const previous = await registerBalance(tx, input.registerId);
  const number = formatNumber("RG", await nextSequence(tx, "cash_entry_number_seq"));
  const [row] = await tx
    .insert(cashEntries)
    .values({
      ...input,
      number,
      customerName: input.customerName ?? null,
      saleId: input.saleId ?? null,
      reversalOf: input.reversalOf ?? null,
      justification: input.justification ?? null,
      balanceAfter: nextBalance(previous, input.direction, input.amount),
    })
    .returning();
  if (!row) throw new Error("Mouvement de caisse non enregistré");
  return row;
}
