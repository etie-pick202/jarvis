import { schema } from "@jarvis/db";
import type { CanalPayment, CanalPaymentInput, SessionUser } from "@jarvis/shared";
import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { businessDate, dayRange } from "../cash/rules.js";
import { appendCheckedEntry, type Tx } from "../cash/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { requireJustification } from "../sales/cancel.js";
import { canalRegister, nextExpiry } from "./rules.js";

const { canalPayments, canalSubscribers, canalFormulas, cashEntries, cashRegisters, users } = schema;

type PaymentRow = typeof canalPayments.$inferSelect;

/** Verrouille la fiche : deux encaissements simultanés ne prolongent pas deux fois la même échéance. */
async function lockSubscriber(tx: Tx, subscriberId: string) {
  return requireRow(
    await tx.select().from(canalSubscribers).where(eq(canalSubscribers.id, subscriberId)).for("update"),
    "Abonné introuvable",
  );
}

async function select(db: Deps["db"] | Tx, where?: SQL): Promise<CanalPayment[]> {
  const reversal = alias(canalPayments, "reversal");
  const rows = await db
    .select({
      payment: canalPayments,
      subscriber: canalSubscribers,
      formula: canalFormulas.name,
      author: users.displayName,
      cancelledBy: reversal.id,
    })
    .from(canalPayments)
    .innerJoin(canalSubscribers, eq(canalSubscribers.id, canalPayments.subscriberId))
    .innerJoin(canalFormulas, eq(canalFormulas.id, canalPayments.formulaId))
    .innerJoin(users, eq(users.id, canalPayments.authorId))
    .leftJoin(reversal, eq(reversal.reversalOf, canalPayments.id))
    .where(where)
    .orderBy(desc(canalPayments.createdAt), desc(canalPayments.newExpiry));
  return rows.map(({ payment: p, subscriber, formula, author, cancelledBy }) => ({
    id: p.id,
    subscriberId: p.subscriberId,
    subscriberName: subscriber.name,
    decoderNumber: subscriber.decoderNumber,
    formulaId: p.formulaId,
    formulaName: formula,
    months: p.months,
    amount: p.amount,
    commission: p.commission,
    paymentMethod: p.paymentMethod as CanalPayment["paymentMethod"],
    registerId: p.registerId as CanalPayment["registerId"],
    previousExpiry: p.previousExpiry,
    newExpiry: p.newExpiry,
    authorId: p.authorId,
    authorName: author,
    createdAt: p.createdAt.toISOString(),
    reversalOf: p.reversalOf,
    cancelled: cancelledBy !== null,
  }));
}

async function byId(db: Deps["db"] | Tx, paymentId: string): Promise<CanalPayment> {
  return requireRow(await select(db, eq(canalPayments.id, paymentId)), "Encaissement introuvable");
}

export function listPayments(deps: Deps, filter: { day?: string; subscriberId?: string }) {
  const conditions: SQL[] = [];
  if (filter.subscriberId) conditions.push(eq(canalPayments.subscriberId, filter.subscriberId));
  if (filter.day) {
    const [from, to] = dayRange(filter.day);
    conditions.push(gte(canalPayments.createdAt, from), lt(canalPayments.createdAt, to));
  }
  return select(deps.db, and(...conditions));
}

/**
 * Abonnement ou réabonnement : l'argent entre dans la caisse Canal+ (espèces ou Orange Money) et l'échéance est
 * prolongée, dans une seule transaction.
 */
export async function recordPayment(
  deps: Deps,
  authorId: string,
  subscriberId: string,
  input: CanalPaymentInput,
  /** Instant réel d'un encaissement saisi hors ligne. */
  occurredAt?: Date,
): Promise<CanalPayment> {
  const now = deps.now();
  const paidOn = businessDate(occurredAt && occurredAt < now ? occurredAt : now);
  const registerId = canalRegister(input.paymentMethod);
  if (!registerId) {
    throw new AppError(422, "invalid_request", "Canal+ s'encaisse en espèces ou par Orange Money");
  }
  return deps.db.transaction(async (tx) => {
    const subscriber = await lockSubscriber(tx, subscriberId);
    const formulaId = input.formulaId ?? subscriber.formulaId;
    const [formula] = await tx.select().from(canalFormulas).where(eq(canalFormulas.id, formulaId));
    if (!formula?.active) throw new AppError(422, "invalid_request", "Formule inconnue ou désactivée");
    const [register] = await tx.select().from(cashRegisters).where(eq(cashRegisters.id, registerId));
    if (!register?.active) {
      throw new AppError(422, "invalid_request", "La caisse Canal+ de ce paiement est en stand-by");
    }
    const newExpiry = nextExpiry(subscriber.expiresOn, paidOn, formula.months);
    const entry = await appendCheckedEntry(tx, deps, {
      registerId,
      direction: "in",
      type: "REG",
      paymentMethod: input.paymentMethod,
      customerName: subscriber.name,
      label: `Abonnement Canal+ ${subscriber.decoderNumber} (${formula.name})`,
      amount: formula.price,
      operatorId: authorId,
    });
    const row = requireRow(
      await tx
        .insert(canalPayments)
        .values({
          subscriberId,
          formulaId,
          months: formula.months,
          amount: formula.price,
          commission: formula.commission,
          paymentMethod: input.paymentMethod,
          registerId,
          cashEntryId: entry.id,
          previousExpiry: subscriber.expiresOn,
          newExpiry,
          authorId,
          createdAt: now,
        })
        .returning(),
    );
    await tx
      .update(canalSubscribers)
      .set({ expiresOn: newExpiry, formulaId, active: true })
      .where(eq(canalSubscribers.id, subscriberId));
    await recordAudit(tx, {
      action: "canal.payment",
      entity: "canal_payment",
      entityId: row.id,
      actorId: authorId,
      details: { amount: row.amount, newExpiry },
    });
    return byId(tx, row.id);
  });
}

/**
 * Annulation : rien n'est effacé. On ajoute un encaissement inverse et une sortie de caisse, l'échéance revient à sa
 * valeur d'avant et le PDG est prévenu. Seul le dernier encaissement d'un abonné peut être annulé.
 */
export async function cancelPayment(
  deps: Deps,
  actor: SessionUser,
  paymentId: string,
  rawJustification: unknown,
): Promise<CanalPayment> {
  const why = requireJustification(rawJustification);
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const [original] = await tx.select().from(canalPayments).where(eq(canalPayments.id, paymentId));
    if (!original) throw new AppError(404, "not_found", "Encaissement introuvable");
    if (original.reversalOf) {
      throw new AppError(422, "invalid_request", "Une annulation ne peut pas être annulée");
    }
    const subscriber = await lockSubscriber(tx, original.subscriberId);
    await assertCancellable(tx, original, subscriber.expiresOn);

    const cash = requireRow(
      await tx.select().from(cashEntries).where(eq(cashEntries.id, original.cashEntryId)),
    );
    const out = await appendCheckedEntry(tx, deps, {
      registerId: cash.registerId as Parameters<typeof appendCheckedEntry>[2]["registerId"],
      direction: "out",
      type: "MSC",
      paymentMethod: cash.paymentMethod as Parameters<typeof appendCheckedEntry>[2]["paymentMethod"],
      customerName: subscriber.name,
      label: `Annulation abonnement Canal+ ${subscriber.decoderNumber}`,
      amount: cash.amount,
      operatorId: actor.id,
      reversalOf: cash.id,
      justification: why,
    });
    const { id: _id, createdAt: _at, ...copy } = original;
    const reversal = requireRow(
      await tx
        .insert(canalPayments)
        .values({
          ...copy,
          cashEntryId: out.id,
          authorId: actor.id,
          reversalOf: original.id,
          justification: why,
          createdAt: now,
        })
        .returning(),
    );
    await tx
      .update(canalSubscribers)
      .set({ expiresOn: original.previousExpiry })
      .where(eq(canalSubscribers.id, original.subscriberId));
    await auditAndNotifyPdg(
      tx,
      {
        action: "canal.payment.cancel",
        entity: "canal_payment",
        entityId: original.id,
        actorId: actor.id,
        details: { amount: original.amount, justification: why },
      },
      `${actor.displayName} a annulé un abonnement Canal+ de ${original.amount} FCFA (${subscriber.name}) le ${now.toISOString()} : ${why}`,
    );
    return byId(tx, reversal.id);
  });
}

async function assertCancellable(tx: Tx, original: PaymentRow, currentExpiry: string | null) {
  const [already] = await tx
    .select({ id: canalPayments.id })
    .from(canalPayments)
    .where(eq(canalPayments.reversalOf, original.id));
  if (already) throw new AppError(409, "conflict", "Cet encaissement est déjà annulé");
  if (currentExpiry !== original.newExpiry) {
    throw new AppError(
      409,
      "conflict",
      "Seul le dernier encaissement de cet abonné peut être annulé (échéance modifiée depuis)",
    );
  }
}
