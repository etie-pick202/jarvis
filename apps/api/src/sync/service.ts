import { createHash } from "node:crypto";
import { schema } from "@jarvis/db";
import {
  canalPaymentSyncPayload,
  countInput,
  createExpenseInput,
  createReceptionInput,
  createSaleInput,
  createTransferInput,
  type ErrorCode,
  type SessionUser,
  type SyncOperation,
  type SyncResult,
} from "@jarvis/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditAndNotifyPdg } from "../audit/service.js";
import { can, type Permission } from "../auth/permissions.js";
import { recordPayment } from "../canal/payments.js";
import { createExpense, createTransfer } from "../cash/service.js";
import { AppError, type Deps, parse } from "../http.js";
import { createSaleDetailed } from "../sales/service.js";
import { createReception, recordCount } from "../stock/service.js";

const { idempotencyKeys } = schema;

const PERMISSION_OF: Record<SyncOperation["type"], Permission> = {
  sale: "sale.create",
  expense: "cash.write",
  transfer: "cash.write",
  reception: "stock.write",
  inventory_weekly: "stock.write",
  inventory_evening: "stock.write",
  canal_payment: "canal.write",
};

/** Empreinte du contenu d'une opération : une même clé avec un autre contenu est refusée. */
export function operationHash(op: Pick<SyncOperation, "type" | "payload">): string {
  return createHash("sha256")
    .update(`${op.type}\n${JSON.stringify(op.payload)}`)
    .digest("hex");
}

export function isStockConflict(code: ErrorCode): boolean {
  return code === "out_of_stock" || code === "stock_conflict";
}

/** Applique une opération avec les mêmes services que l'écriture en ligne. */
async function apply(deps: Deps, user: SessionUser, op: SyncOperation) {
  switch (op.type) {
    case "sale": {
      const input = parse(createSaleInput, op.payload);
      // Hors ligne, la bouteille est déjà remise : on enregistre la vente et on signale l'écart de stock.
      const { sale, shortages } = await createSaleDetailed(deps, user.id, input, {
        occurredAt: new Date(op.occurredAt),
        allowOutOfStock: true,
      });
      return { body: sale, conflict: shortages.length ? shortages.join(" ; ") : undefined };
    }
    case "expense":
      return { body: await createExpense(deps, user.id, parse(createExpenseInput, op.payload)) };
    case "transfer":
      return { body: await createTransfer(deps, user.id, parse(createTransferInput, op.payload)) };
    case "reception":
      return { body: await createReception(deps, user.id, parse(createReceptionInput, op.payload)) };
    case "inventory_weekly":
      return { body: await recordCount(deps, user.id, "weekly", parse(countInput, op.payload)) };
    case "inventory_evening":
      return { body: await recordCount(deps, user.id, "evening", parse(countInput, op.payload)) };
    case "canal_payment": {
      const { subscriberId, ...input } = parse(canalPaymentSyncPayload, op.payload);
      return {
        body: await recordPayment(deps, user.id, subscriberId, input, new Date(op.occurredAt)),
      };
    }
  }
}

function toError(err: unknown): { code: ErrorCode; message: string } {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  console.error(err);
  return { code: "internal_error", message: "Erreur interne" };
}

/** Rejoue une opération une seule fois (clé = clientOpId, propre à l'utilisateur). */
export async function replayOperation(deps: Deps, user: SessionUser, op: SyncOperation): Promise<SyncResult> {
  const hash = operationHash(op);
  const reserved = await deps.db
    .insert(idempotencyKeys)
    .values({ key: op.clientOpId, userId: user.id, requestHash: hash, status: 0, response: {} })
    .onConflictDoNothing()
    .returning({ key: idempotencyKeys.key });
  const mine = and(eq(idempotencyKeys.userId, user.id), eq(idempotencyKeys.key, op.clientOpId));

  if (reserved.length === 0) {
    const [prior] = await deps.db.select().from(idempotencyKeys).where(mine);
    if (!prior || prior.requestHash !== hash) {
      return {
        clientOpId: op.clientOpId,
        status: "rejected",
        applied: false,
        error: { code: "idempotency_conflict", message: "Cette clé a déjà servi pour une autre opération" },
      };
    }
    if (prior.status === 0) {
      return {
        clientOpId: op.clientOpId,
        status: "rejected",
        applied: false,
        error: { code: "conflict", message: "Opération déjà en cours de traitement" },
      };
    }
    const previous = prior.response as { result?: unknown; conflict?: string };
    return {
      clientOpId: op.clientOpId,
      status: "duplicate",
      applied: true,
      result: previous.result,
      ...(previous.conflict ? { conflict: previous.conflict } : {}),
    };
  }

  try {
    if (!can(user.activeRole, PERMISSION_OF[op.type])) {
      throw new AppError(403, "forbidden", "Droit insuffisant pour cette opération");
    }
    const { body, conflict } = await apply(deps, user, op);
    await deps.db
      .update(idempotencyKeys)
      .set({ status: 200, response: { result: body, conflict: conflict ?? null } })
      .where(mine);
    if (conflict) {
      await auditAndNotifyPdg(
        deps.db,
        {
          action: "sync.stock_conflict",
          entity: "sync",
          entityId: op.clientOpId,
          actorId: user.id,
          details: { type: op.type, occurredAt: op.occurredAt, conflict },
        },
        `Conflit de stock à la synchronisation (${op.type} du ${op.occurredAt}) : ${conflict}. Vente enregistrée, stock à vérifier.`,
      );
    }
    return {
      clientOpId: op.clientOpId,
      status: conflict ? "conflict" : "applied",
      applied: true,
      result: body,
      ...(conflict ? { conflict } : {}),
    };
  } catch (err) {
    await deps.db.delete(idempotencyKeys).where(mine);
    const error = toError(err);
    if (isStockConflict(error.code)) {
      // Conflit de stock : rien n'est écrasé ni perdu, l'opération est conservée au journal d'audit pour décision.
      await auditAndNotifyPdg(
        deps.db,
        {
          action: "sync.stock_conflict",
          entity: "sync",
          entityId: op.clientOpId,
          actorId: user.id,
          details: {
            type: op.type,
            occurredAt: op.occurredAt,
            payload: z.json().safeParse(op.payload).data ?? null,
            error,
          },
        },
        `Opération hors ligne refusée pour conflit de stock (${op.type} du ${op.occurredAt}) : ${error.message}`,
      );
      return {
        clientOpId: op.clientOpId,
        status: "conflict",
        applied: false,
        error,
        conflict: error.message,
      };
    }
    return { clientOpId: op.clientOpId, status: "rejected", applied: false, error };
  }
}

/** Rejoue un lot dans l'ordre reçu. Une opération refusée n'empêche pas les suivantes. */
export async function replayBatch(
  deps: Deps,
  user: SessionUser,
  operations: SyncOperation[],
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const op of operations) results.push(await replayOperation(deps, user, op));
  return results;
}
