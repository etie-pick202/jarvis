import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import type { BottleState, StockMoveReason } from "@jarvis/shared";
import { and, eq, sql } from "drizzle-orm";

const { stockMoves } = schema;

/** Verrou de transaction sur un couple marque/format : sérialise les ventes concurrentes (pas de stock négatif). */
export async function lockStock(tx: Database, brandId: string, formatId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stock:${brandId}:${formatId}`}))`);
}

/** Stock courant = somme des mouvements du journal (jamais une valeur saisie). */
export async function stockOf(tx: Database, brandId: string, formatId: string, state: BottleState) {
  const [row] = await tx
    .select({ total: sql<string>`coalesce(sum(${stockMoves.delta}), 0)` })
    .from(stockMoves)
    .where(
      and(eq(stockMoves.brandId, brandId), eq(stockMoves.formatId, formatId), eq(stockMoves.state, state)),
    );
  return Number(row?.total ?? 0);
}

export interface StockMoveInput {
  brandId: string;
  formatId: string;
  state: BottleState;
  delta: number;
  reason: StockMoveReason;
  authorId: string;
  saleId?: string | null;
  receptionId?: string | null;
  reversalOf?: string | null;
  justification?: string | null;
  createdAt?: Date;
}

export async function appendStockMove(tx: Database, move: StockMoveInput) {
  const [row] = await tx
    .insert(stockMoves)
    .values({
      ...move,
      saleId: move.saleId ?? null,
      receptionId: move.receptionId ?? null,
      reversalOf: move.reversalOf ?? null,
      justification: move.justification ?? null,
    })
    .returning();
  if (!row) throw new Error("Mouvement de stock non enregistré");
  return row;
}
