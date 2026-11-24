import { schema } from "@jarvis/db";
import {
  type CashEntry,
  type CloseRegisterInput,
  type CreateExpenseInput,
  type CreateTransferInput,
  WALKIN_CUSTOMER,
} from "@jarvis/shared";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { AppError, type Deps } from "../http.js";
import { appendCashEntry, registerBalance } from "./ledger.js";
import {
  businessDate,
  closureGap,
  dayRange,
  defaultPaymentMethod,
  hasSufficientBalance,
  needsJustification,
} from "./rules.js";

const { cashRegisters, cashEntries, cashClosures, settings } = schema;

type EntryRow = typeof cashEntries.$inferSelect;

export function toCashEntry(r: EntryRow): CashEntry {
  return {
    id: r.id,
    number: r.number,
    registerId: r.registerId as CashEntry["registerId"],
    direction: r.direction as CashEntry["direction"],
    type: r.type as CashEntry["type"],
    paymentMethod: r.paymentMethod as CashEntry["paymentMethod"],
    customerName: r.customerName,
    label: r.label,
    amount: r.amount,
    balanceAfter: r.balanceAfter,
    operatorId: r.operatorId,
    createdAt: r.createdAt.toISOString(),
    saleId: r.saleId,
    reversalOf: r.reversalOf,
  };
}

async function activeRegister(deps: Deps, registerId: string) {
  const [reg] = await deps.db.select().from(cashRegisters).where(eq(cashRegisters.id, registerId));
  if (!reg) throw new AppError(404, "not_found", "Caisse introuvable");
  if (!reg.active) throw new AppError(422, "invalid_request", `La caisse « ${reg.label} » est en stand-by`);
  return reg;
}

export async function listRegisters(deps: Deps) {
  const regs = await deps.db.select().from(cashRegisters);
  return Promise.all(regs.map(async (r) => ({ ...r, balance: await registerBalance(deps.db, r.id) })));
}

export async function setRegisterActive(deps: Deps, actorId: string, registerId: string, active: boolean) {
  const [row] = await deps.db
    .update(cashRegisters)
    .set({ active })
    .where(eq(cashRegisters.id, registerId))
    .returning();
  if (!row) throw new AppError(404, "not_found", "Caisse introuvable");
  await recordAudit(deps.db, {
    action: "register.active",
    entity: "cash_register",
    entityId: registerId,
    actorId,
    details: { active },
  });
  return row;
}

export async function listEntries(deps: Deps, registerId: string, day?: string) {
  const conditions = [eq(cashEntries.registerId, registerId)];
  if (day) {
    const [from, to] = dayRange(day);
    conditions.push(gte(cashEntries.createdAt, from), lt(cashEntries.createdAt, to));
  }
  const rows = await deps.db
    .select()
    .from(cashEntries)
    .where(and(...conditions))
    .orderBy(desc(cashEntries.createdAt), desc(cashEntries.number));
  return rows.map(toCashEntry);
}

/** Dépense : sortie de caisse (MSC). Le solde ne peut pas devenir négatif. */
export async function createExpense(deps: Deps, operatorId: string, input: CreateExpenseInput) {
  await activeRegister(deps, input.registerId);
  return deps.db.transaction(async (tx) => {
    const entry = await appendCheckedEntry(tx, deps, {
      registerId: input.registerId,
      direction: "out",
      type: "MSC",
      paymentMethod: input.paymentMethod ?? defaultPaymentMethod(input.registerId),
      label: input.label,
      amount: input.amount,
      operatorId,
    });
    return toCashEntry(entry);
  });
}

type Tx = Parameters<Parameters<Deps["db"]["transaction"]>[0]>[0];

async function appendCheckedEntry(
  tx: Tx,
  deps: Deps,
  e: Omit<Parameters<typeof appendCashEntry>[1], "createdAt" | "customerName"> & {
    customerName?: string | null;
  },
) {
  if (e.direction === "out") {
    // Verrouille la caisse puis relit le solde : deux sorties simultanées ne peuvent pas la vider deux fois.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`cash:${e.registerId}`}))`);
    const balance = await registerBalance(tx, e.registerId);
    if (!hasSufficientBalance(balance, e.amount)) {
      throw new AppError(409, "conflict", `Solde insuffisant (${balance} FCFA) pour sortir ${e.amount} FCFA`);
    }
  }
  return appendCashEntry(tx, {
    ...e,
    customerName: e.direction === "in" ? (e.customerName ?? WALKIN_CUSTOMER) : (e.customerName ?? null),
    createdAt: deps.now(),
  });
}

/** Transfert entre deux caisses : une sortie (MSC) et une entrée (MEC) écrites ensemble ou pas du tout. */
export async function createTransfer(deps: Deps, operatorId: string, input: CreateTransferInput) {
  await activeRegister(deps, input.fromRegisterId);
  await activeRegister(deps, input.toRegisterId);
  return deps.db.transaction(async (tx) => {
    const label = `Transfert ${input.fromRegisterId} → ${input.toRegisterId} : ${input.label}`;
    const out = await appendCheckedEntry(tx, deps, {
      registerId: input.fromRegisterId,
      direction: "out",
      type: "MSC",
      paymentMethod: defaultPaymentMethod(input.fromRegisterId),
      label,
      amount: input.amount,
      operatorId,
    });
    const inn = await appendCheckedEntry(tx, deps, {
      registerId: input.toRegisterId,
      direction: "in",
      type: "MEC",
      paymentMethod: defaultPaymentMethod(input.toRegisterId),
      label,
      amount: input.amount,
      operatorId,
    });
    return { out: toCashEntry(out), in: toCashEntry(inn) };
  });
}

export async function closureThreshold(deps: Deps): Promise<number> {
  const row = await deps.db.query.settings.findFirst({
    where: (s, { eq }) => eq(s.key, "closure_gap_threshold"),
  });
  const n = Number(row?.value);
  return row && Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function setClosureThreshold(deps: Deps, actorId: string, threshold: number) {
  const value = String(threshold);
  await deps.db
    .insert(settings)
    .values({ key: "closure_gap_threshold", value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await recordAudit(deps.db, {
    action: "closure.threshold.change",
    entity: "setting",
    entityId: "closure_gap_threshold",
    actorId,
    details: { threshold },
  });
  return { threshold };
}

/**
 * Clôture quotidienne d'une caisse : comptage physique, écart avec le solde théorique, justification au-delà du
 * seuil. En cas d'écart, un mouvement « fond de caisse » (FDC) aligne le solde sur le comptage : le fond du matin
 * est le comptage de clôture de la veille. Une seule clôture par caisse et par jour.
 */
export async function closeRegister(deps: Deps, authorId: string, input: CloseRegisterInput) {
  const reg = await activeRegister(deps, input.registerId);
  const now = deps.now();
  const day = businessDate(now);
  const threshold = await closureThreshold(deps);
  return deps.db.transaction(async (tx) => {
    const [already] = await tx
      .select({ id: cashClosures.id })
      .from(cashClosures)
      .where(and(eq(cashClosures.registerId, reg.id), eq(cashClosures.businessDate, day)));
    if (already)
      throw new AppError(409, "conflict", `La caisse « ${reg.label} » est déjà clôturée pour le ${day}`);
    const theoretical = await registerBalance(tx, reg.id);
    const gap = closureGap(input.countedAmount, theoretical);
    if (needsJustification(gap, threshold) && !input.justification) {
      throw new AppError(422, "justification_required", `Écart de ${gap} FCFA : justification obligatoire`);
    }
    const [closure] = await tx
      .insert(cashClosures)
      .values({
        registerId: reg.id,
        businessDate: day,
        theoreticalAmount: theoretical,
        countedAmount: input.countedAmount,
        gap,
        justification: input.justification ?? null,
        authorId,
        createdAt: now,
      })
      .returning();
    if (!closure) throw new Error("Clôture non enregistrée");
    if (gap !== 0) {
      await appendCashEntry(tx, {
        registerId: input.registerId,
        direction: gap > 0 ? "in" : "out",
        type: "FDC",
        paymentMethod: defaultPaymentMethod(input.registerId),
        customerName: gap > 0 ? WALKIN_CUSTOMER : null,
        label: `Écart de clôture du ${day}`,
        amount: Math.abs(gap),
        operatorId: authorId,
        justification: input.justification ?? null,
        createdAt: now,
      });
      await auditAndNotifyPdg(
        tx,
        {
          action: "closure.gap",
          entity: "cash_closure",
          entityId: closure.id,
          actorId: authorId,
          details: { registerId: reg.id, gap, justification: input.justification },
        },
        `Écart de clôture de ${gap} FCFA sur « ${reg.label} »`,
      );
    }
    return closure;
  });
}

export async function listClosures(deps: Deps, day?: string) {
  return deps.db
    .select()
    .from(cashClosures)
    .where(day ? eq(cashClosures.businessDate, day) : undefined)
    .orderBy(desc(cashClosures.createdAt));
}
