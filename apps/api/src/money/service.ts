import { schema } from "@jarvis/db";
import {
  type CommissionSettings,
  commissionSettings,
  type MobileOperator,
  type MoneyOperation,
  type MoneyOperationInput,
  type SessionUser,
} from "@jarvis/shared";
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { registerBalance } from "../cash/ledger.js";
import { dayRange } from "../cash/rules.js";
import { appendCheckedEntry, type Tx } from "../cash/service.js";
import { guardUnique, requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { requireJustification } from "../sales/cancel.js";
import { commissionFor, floatRegister, movements, SHOP_CASH } from "./rules.js";

const { moneyOperations, cashEntries, cashRegisters, settings, users } = schema;

type EntryInput = Parameters<typeof appendCheckedEntry>[2];

const COMMISSION_KEY = "mobile_money_commissions";
const NO_COMMISSION: CommissionSettings = {
  orange_money: { deposit: 0, withdrawal: 0 },
  momo: { deposit: 0, withdrawal: 0 },
};

export async function commissions(deps: Deps): Promise<CommissionSettings> {
  const [row] = await deps.db.select().from(settings).where(eq(settings.key, COMMISSION_KEY));
  return row ? commissionSettings.parse(JSON.parse(row.value)) : NO_COMMISSION;
}

export async function setCommissions(deps: Deps, actorId: string, input: CommissionSettings) {
  const value = JSON.stringify(input);
  await deps.db
    .insert(settings)
    .values({ key: COMMISSION_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await recordAudit(deps.db, {
    action: "money.commissions.change",
    entity: "setting",
    entityId: COMMISSION_KEY,
    actorId,
    details: input,
  });
  return input;
}

/** Float (solde électronique) de chaque opérateur. */
export async function floats(deps: Deps) {
  const registers = await deps.db.select().from(cashRegisters);
  return Promise.all(
    (["orange_money", "momo"] as const).map(async (operator) => {
      const registerId = floatRegister(operator);
      return {
        operator,
        active: registers.find((r) => r.id === registerId)?.active ?? false,
        float: await registerBalance(deps.db, registerId),
      };
    }),
  );
}

async function select(db: Deps["db"] | Tx, where?: SQL): Promise<MoneyOperation[]> {
  const reversal = alias(moneyOperations, "reversal");
  const rows = await db
    .select({ op: moneyOperations, author: users.displayName, cancelledBy: reversal.id })
    .from(moneyOperations)
    .innerJoin(users, eq(users.id, moneyOperations.authorId))
    .leftJoin(reversal, eq(reversal.reversalOf, moneyOperations.id))
    .where(where)
    .orderBy(desc(moneyOperations.createdAt), desc(moneyOperations.reference));
  return rows.map(({ op, author, cancelledBy }) => ({
    id: op.id,
    operator: op.operator as MobileOperator,
    kind: op.kind as MoneyOperation["kind"],
    amount: op.amount,
    commission: op.commission,
    phone: op.phone,
    customerName: op.customerName,
    reference: op.reference,
    authorId: op.authorId,
    authorName: author,
    createdAt: op.createdAt.toISOString(),
    reversalOf: op.reversalOf,
    cancelled: cancelledBy !== null,
  }));
}

const byId = async (db: Deps["db"] | Tx, operationId: string) =>
  requireRow(await select(db, eq(moneyOperations.id, operationId)), "Opération introuvable");

export function listOperations(deps: Deps, day?: string) {
  if (!day) return select(deps.db);
  const [from, to] = dayRange(day);
  return select(deps.db, and(gte(moneyOperations.createdAt, from), lt(moneyOperations.createdAt, to)));
}

/** Écrit les deux mouvements d'une opération, la sortie d'abord : un solde insuffisant arrête tout. */
async function writeMovements(
  tx: Tx,
  deps: Deps,
  authorId: string,
  input: MoneyOperationInput,
): Promise<{ cashEntryId: string; floatEntryId: string }> {
  const { cashDirection, floatDirection } = movements(input.kind);
  const common = {
    label: `${input.kind === "deposit" ? "Dépôt" : "Retrait"} ${input.reference}`,
    amount: input.amount,
    operatorId: authorId,
    customerName: input.customerName ?? null,
  };
  const type = (direction: "in" | "out") => (direction === "in" ? "MEC" : "MSC");
  const cash: EntryInput = {
    ...common,
    registerId: SHOP_CASH,
    paymentMethod: "cash",
    direction: cashDirection,
    type: type(cashDirection),
  };
  const float: EntryInput = {
    ...common,
    registerId: floatRegister(input.operator),
    paymentMethod: input.operator,
    direction: floatDirection,
    type: type(floatDirection),
  };
  const cashFirst = cashDirection === "out";
  const first = await appendCheckedEntry(tx, deps, cashFirst ? cash : float);
  const second = await appendCheckedEntry(tx, deps, cashFirst ? float : cash);
  return cashFirst
    ? { cashEntryId: first.id, floatEntryId: second.id }
    : { cashEntryId: second.id, floatEntryId: first.id };
}

/** Dépôt ou retrait : les deux mouvements et l'opération sont écrits ensemble ou pas du tout. */
export async function recordOperation(
  deps: Deps,
  authorId: string,
  input: MoneyOperationInput,
): Promise<MoneyOperation> {
  const rates = await commissions(deps);
  return guardUnique(
    () =>
      deps.db.transaction(async (tx) => {
        const [register] = await tx
          .select()
          .from(cashRegisters)
          .where(eq(cashRegisters.id, floatRegister(input.operator)));
        if (!register?.active) {
          throw new AppError(422, "invalid_request", "Cette caisse de transaction est en stand-by");
        }
        const entries = await writeMovements(tx, deps, authorId, input);
        const row = requireRow(
          await tx
            .insert(moneyOperations)
            .values({
              ...input,
              ...entries,
              customerName: input.customerName ?? null,
              commission: commissionFor(input.amount, rates[input.operator][input.kind]),
              authorId,
              createdAt: deps.now(),
            })
            .returning(),
        );
        await recordAudit(tx, {
          action: "money.operation",
          entity: "money_operation",
          entityId: row.id,
          actorId: authorId,
          details: { kind: row.kind, operator: row.operator, amount: row.amount },
        });
        return byId(tx, row.id);
      }),
    "Cette référence de transaction est déjà enregistrée",
  );
}

async function reverseEntry(tx: Tx, deps: Deps, entryId: string, actorId: string, why: string) {
  const entry = requireRow(await tx.select().from(cashEntries).where(eq(cashEntries.id, entryId)));
  const direction = entry.direction === "in" ? "out" : "in";
  return appendCheckedEntry(tx, deps, {
    registerId: entry.registerId as EntryInput["registerId"],
    paymentMethod: entry.paymentMethod as EntryInput["paymentMethod"],
    direction,
    type: direction === "in" ? "MEC" : "MSC",
    label: `Annulation ${entry.label}`,
    amount: entry.amount,
    customerName: entry.customerName,
    operatorId: actorId,
    reversalOf: entry.id,
    justification: why,
  });
}

/** Annulation : mouvements inverses, opération inverse, justificatif et notification du PDG. */
export async function cancelOperation(
  deps: Deps,
  actor: SessionUser,
  operationId: string,
  rawJustification: unknown,
): Promise<MoneyOperation> {
  const why = requireJustification(rawJustification);
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(moneyOperations)
      .where(eq(moneyOperations.id, operationId))
      .for("update");
    if (!original) throw new AppError(404, "not_found", "Opération introuvable");
    if (original.reversalOf) {
      throw new AppError(422, "invalid_request", "Une annulation ne peut pas être annulée");
    }
    const [already] = await tx
      .select({ id: moneyOperations.id })
      .from(moneyOperations)
      .where(eq(moneyOperations.reversalOf, operationId));
    if (already) throw new AppError(409, "conflict", "Cette opération est déjà annulée");

    const cash = await reverseEntry(tx, deps, original.cashEntryId, actor.id, why);
    const float = await reverseEntry(tx, deps, original.floatEntryId, actor.id, why);
    const { id: _id, createdAt: _at, ...copy } = original;
    const row = requireRow(
      await tx
        .insert(moneyOperations)
        .values({
          ...copy,
          cashEntryId: cash.id,
          floatEntryId: float.id,
          authorId: actor.id,
          reversalOf: original.id,
          justification: why,
          createdAt: now,
        })
        .returning(),
    );
    await auditAndNotifyPdg(
      tx,
      {
        action: "money.operation.cancel",
        entity: "money_operation",
        entityId: original.id,
        actorId: actor.id,
        details: { reference: original.reference, amount: original.amount, justification: why },
      },
      `${actor.displayName} a annulé l'opération ${original.reference} (${original.amount} FCFA) le ${now.toISOString()} : ${why}`,
    );
    return byId(tx, row.id);
  });
}
