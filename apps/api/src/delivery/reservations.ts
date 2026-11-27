import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import { and, eq, inArray, ne, type SQL, sql } from "drizzle-orm";

const { orders, orderLines } = schema;

/** Une commande validée réserve son stock jusqu'à la livraison ou l'annulation. */
export const RESERVING = ["validated", "out_for_delivery", "problem"] as const;

async function reserved(db: Database, product: SQL, excludeOrderId?: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${orderLines.quantity}), 0)` })
    .from(orderLines)
    .innerJoin(orders, eq(orders.id, orderLines.orderId))
    .where(
      and(
        product,
        inArray(orders.status, [...RESERVING]),
        excludeOrderId ? ne(orders.id, excludeOrderId) : undefined,
      ),
    );
  return Number(row?.total ?? 0);
}

/** Pleins d'une marque et d'un format promis à des commandes validées. */
export function reservedFull(db: Database, brandId: string, formatId: string, excludeOrderId?: string) {
  const product = and(eq(orderLines.brandId, brandId), eq(orderLines.formatId, formatId)) as SQL;
  return reserved(db, product, excludeOrderId);
}

export function reservedArticle(db: Database, articleId: string, excludeOrderId?: string) {
  return reserved(db, eq(orderLines.articleId, articleId), excludeOrderId);
}
