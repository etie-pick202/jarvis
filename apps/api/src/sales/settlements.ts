import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import type { ExchangePage, SessionUser, SettlePackagingInput } from "@jarvis/shared";
import { and, count, eq, inArray, isNull, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditAndNotifyPdg } from "../audit/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { getSale, listSales } from "./service.js";

const { sales, saleLines, brands, packagingSettlements } = schema;

type SaleLineRow = typeof saleLines.$inferSelect;

/**
 * Le journal des ventes ne se modifie pas : un écart soldé est écrit à part. À la lecture, la ligne porte l'écart
 * soldé et n'est plus « à régulariser ».
 */
export async function withSettlements(db: Database, lines: SaleLineRow[]): Promise<SaleLineRow[]> {
  const pending = lines.filter((l) => l.packagingGapPending).map((l) => l.id);
  if (pending.length === 0) return lines;
  const settled = await db
    .select()
    .from(packagingSettlements)
    .where(inArray(packagingSettlements.saleLineId, pending));
  const gaps = new Map(settled.map((s) => [s.saleLineId, s.packagingGap]));
  return lines.map((l) => {
    const gap = gaps.get(l.id);
    return gap === undefined ? l : { ...l, packagingGap: gap, packagingGapPending: false };
  });
}

/** Ventes ayant un échange entre marques ; `pendingOnly` : celles dont l'écart reste à solder (non annulées). */
export const exchangeCondition = sql`exists (select 1 from ${saleLines} where ${saleLines.saleId} = ${sales.id} and ${saleLines.returnedBrandId} is not null and ${saleLines.returnedBrandId} <> ${saleLines.brandId})`;

export const pendingCondition = sql`${sales.reversalOf} is null
  and not exists (select 1 from sales as r where r.reversal_of = ${sales.id})
  and exists (select 1 from sale_lines as l where l.sale_id = ${sales.id} and l.packaging_gap_pending
    and not exists (select 1 from packaging_settlements as p where p.sale_line_id = l.id))`;

async function countSales(deps: Deps, where: SQL): Promise<number> {
  const [row] = await deps.db.select({ n: count() }).from(sales).where(where);
  return row?.n ?? 0;
}

export async function exchangePage(
  deps: Deps,
  page: { limit: number; offset: number; pendingOnly: boolean },
): Promise<ExchangePage> {
  const [items, total, pendingCount] = await Promise.all([
    listSales(deps, { ...page, exchangeOnly: true }),
    countSales(deps, page.pendingOnly ? pendingCondition : exchangeCondition),
    countSales(deps, pendingCondition),
  ]);
  return { items, total, pendingCount };
}

/**
 * Solde l'écart d'emballage d'une vente « à régulariser » : calculé avec les valeurs désormais connues des marques,
 * ou saisi par le PDG. Réservé au PDG, tracé.
 */
export async function settlePackaging(
  deps: Deps,
  actor: SessionUser,
  saleId: string,
  input: SettlePackagingInput,
) {
  await deps.db.transaction(async (tx) => {
    const sale = requireRow(
      await tx.select().from(sales).where(eq(sales.id, saleId)).for("update"),
      "Vente introuvable",
    );
    const [reversal] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.reversalOf, saleId));
    if (sale.reversalOf || reversal) throw new AppError(409, "conflict", "Vente annulée : rien à solder");
    const returned = alias(brands, "returned");
    const rows = await tx
      .select({ line: saleLines, given: brands, back: returned })
      .from(saleLines)
      .innerJoin(brands, eq(brands.id, saleLines.brandId))
      .innerJoin(returned, eq(returned.id, saleLines.returnedBrandId))
      .leftJoin(packagingSettlements, eq(packagingSettlements.saleLineId, saleLines.id))
      .where(
        and(
          eq(saleLines.saleId, saleId),
          eq(saleLines.packagingGapPending, true),
          isNull(packagingSettlements.id),
        ),
      );
    if (rows.length === 0) throw new AppError(409, "conflict", "Aucun écart à régulariser sur cette vente");
    if (input.packagingGap !== undefined && rows.length > 1) {
      throw new AppError(422, "invalid_request", "Plusieurs échanges : renseigner les valeurs des marques");
    }
    let total = 0;
    for (const { line, given, back } of rows) {
      const known = given.packagingValueKnown && back.packagingValueKnown;
      if (input.packagingGap === undefined && !known) {
        throw new AppError(
          409,
          "conflict",
          `Valeur d'emballage encore inconnue (${given.name}/${back.name})`,
        );
      }
      const gap = input.packagingGap ?? line.quantity * (back.packagingValue - given.packagingValue);
      total += gap;
      await tx.insert(packagingSettlements).values({
        saleLineId: line.id,
        packagingGap: gap,
        authorId: actor.id,
        createdAt: deps.now(),
      });
    }
    await auditAndNotifyPdg(
      tx,
      {
        action: "sale.packaging_settled",
        entity: "sale",
        entityId: saleId,
        actorId: actor.id,
        details: { number: sale.number, packagingGap: total, manual: input.packagingGap !== undefined },
      },
      `Écart d'emballage de la vente ${sale.number} soldé : ${total} FCFA`,
    );
  });
  return getSale(deps, saleId);
}
