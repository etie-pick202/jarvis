import { schema } from "@jarvis/db";
import { type BottleState, bottleState, type CashEntry, type SessionUser } from "@jarvis/shared";
import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { z } from "zod";
import { auditAndNotifyPdg } from "../audit/service.js";
import { appendCheckedEntry, toCashEntry } from "../cash/service.js";
import { AppError, type Deps } from "../http.js";
import { requireJustification } from "../sales/cancel.js";
import { appendStockMove, lockStock, stockOf } from "../stock/ledger.js";

const { cashEntries, auditLog, notifications, users } = schema;

export const stockCorrectionInput = z.object({
  brandId: z.uuid(),
  formatId: z.uuid(),
  state: bottleState,
  /** Variation à appliquer (positive ou négative, jamais nulle). */
  delta: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "Variation nulle" }),
  justification: z.string().optional(),
});

/** Correction de stock : un mouvement d'ajustement justifié, jamais une modification d'un mouvement passé. */
export async function correctStock(
  deps: Deps,
  actor: SessionUser,
  raw: z.infer<typeof stockCorrectionInput>,
) {
  const why = requireJustification(raw.justification);
  return deps.db.transaction(async (tx) => {
    await lockStock(tx, raw.brandId, raw.formatId);
    const current = await stockOf(tx, raw.brandId, raw.formatId, raw.state as BottleState);
    if (current + raw.delta < 0) {
      throw new AppError(409, "stock_conflict", `Le stock ne peut pas devenir négatif (${current} en stock)`);
    }
    const move = await appendStockMove(tx, {
      brandId: raw.brandId,
      formatId: raw.formatId,
      state: raw.state,
      delta: raw.delta,
      reason: "inventory_adjustment",
      authorId: actor.id,
      justification: why,
      createdAt: deps.now(),
    });
    await auditAndNotifyPdg(
      tx,
      {
        action: "stock.correct",
        entity: "stock_move",
        entityId: move.id,
        actorId: actor.id,
        details: { ...raw, justification: why },
      },
      `${actor.displayName} a corrigé le stock (${raw.state}, ${raw.delta > 0 ? "+" : ""}${raw.delta}) le ${deps.now().toISOString()} : ${why}`,
    );
    return move;
  });
}

/**
 * Correction d'un mouvement de caisse : on ajoute le mouvement inverse. Les mouvements d'une vente passent par
 * l'annulation de la vente ; une écriture déjà inversée ou elle-même inverse ne l'est pas deux fois.
 */
export async function reverseCashEntry(
  deps: Deps,
  actor: SessionUser,
  entryId: string,
  rawJustification: unknown,
): Promise<CashEntry> {
  const why = requireJustification(rawJustification);
  return deps.db.transaction(async (tx) => {
    const [entry] = await tx.select().from(cashEntries).where(eq(cashEntries.id, entryId));
    if (!entry) throw new AppError(404, "not_found", "Mouvement introuvable");
    if (entry.saleId)
      throw new AppError(422, "invalid_request", "Un mouvement de vente se corrige en annulant la vente");
    if (entry.reversalOf)
      throw new AppError(422, "invalid_request", "Une écriture inverse ne peut pas être inversée");
    const [done] = await tx
      .select({ id: cashEntries.id })
      .from(cashEntries)
      .where(eq(cashEntries.reversalOf, entryId));
    if (done) throw new AppError(409, "conflict", "Ce mouvement est déjà corrigé");
    const inverse = await appendCheckedEntry(tx, deps, {
      registerId: entry.registerId as Parameters<typeof appendCheckedEntry>[2]["registerId"],
      direction: entry.direction === "in" ? "out" : "in",
      type: entry.direction === "in" ? "MSC" : "MEC",
      paymentMethod: entry.paymentMethod as Parameters<typeof appendCheckedEntry>[2]["paymentMethod"],
      customerName: entry.customerName,
      label: `Correction du mouvement ${entry.number}`,
      amount: entry.amount,
      operatorId: actor.id,
      reversalOf: entry.id,
      justification: why,
    });
    await auditAndNotifyPdg(
      tx,
      {
        action: "cash.reverse",
        entity: "cash_entry",
        entityId: entry.id,
        actorId: actor.id,
        details: { number: entry.number, amount: entry.amount, justification: why },
      },
      `${actor.displayName} a corrigé le mouvement de caisse ${entry.number} (${entry.amount} FCFA) le ${deps.now().toISOString()} : ${why}`,
    );
    return toCashEntry(inverse);
  });
}

export async function listAudit(deps: Deps, filter: { action?: string; entity?: string; limit: number }) {
  const conditions = [
    ...(filter.action ? [eq(auditLog.action, filter.action)] : []),
    ...(filter.entity ? [eq(auditLog.entity, filter.entity)] : []),
  ];
  return deps.db
    .select({ ...getTableColumns(auditLog), actorName: users.displayName })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt))
    .limit(filter.limit);
}

export async function listNotifications(deps: Deps, unreadOnly: boolean) {
  return deps.db
    .select()
    .from(notifications)
    .where(and(eq(notifications.recipientRole, "pdg"), unreadOnly ? isNull(notifications.readAt) : undefined))
    .orderBy(desc(notifications.createdAt));
}

export async function markNotificationRead(deps: Deps, id: string) {
  const [row] = await deps.db
    .update(notifications)
    .set({ readAt: deps.now() })
    .where(eq(notifications.id, id))
    .returning();
  if (!row) throw new AppError(404, "not_found", "Notification introuvable");
  return row;
}
