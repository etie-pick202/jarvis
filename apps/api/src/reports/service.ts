import { schema } from "@jarvis/db";
import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { dayRange } from "../cash/rules.js";
import type { Deps } from "../http.js";
import { lineMargin } from "../sales/compute.js";
import { stockLevels } from "../stock/service.js";
import { CASH_REGISTERS_IN_CASH, gasLabel, marginPercent, signed, signedEntry, toCsv } from "./compute.js";

const { sales, saleLines, brands, formats, articles, cashEntries, cashRegisters, users } = schema;

// ---------- Statistiques clients ----------
export async function customerStats(deps: Deps, day: string) {
  const [from, to] = dayRange(day);
  const rows = await deps.db
    .select({ sale: sales, line: saleLines, brand: brands, format: formats, article: articles })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .leftJoin(brands, eq(brands.id, saleLines.brandId))
    .leftJoin(formats, eq(formats.id, saleLines.formatId))
    .leftJoin(articles, eq(articles.id, saleLines.articleId))
    .where(and(gte(sales.createdAt, from), lt(sales.createdAt, to)))
    .orderBy(asc(sales.createdAt), asc(sql`right(${sales.number}, 6)`), asc(saleLines.id));
  const allBrands = await deps.db.select().from(brands);
  const brandName = (id: string | null) => allBrands.find((b) => b.id === id)?.name ?? null;

  const lines = rows.map(({ sale, line, brand, format, article }) => {
    const reversal = sale.reversalOf !== null;
    const revenue = signed(line.total, reversal);
    const margin = signed(lineMargin(line, line.quantity), reversal);
    return {
      saleNumber: sale.number,
      at: sale.createdAt.toISOString(),
      customerName: sale.customerName,
      item:
        line.kind === "gas"
          ? gasLabel(brand?.name ?? "", brandName(line.returnedBrandId), format?.label ?? "")
          : (article?.name ?? ""),
      quantity: signed(line.quantity, reversal),
      unitPrice: Math.round(line.total / line.quantity),
      paymentMethod: sale.paymentMethod,
      total: revenue,
      margin,
      marginPercent: marginPercent(margin, revenue),
    };
  });
  const totalRevenue = lines.reduce((n, l) => n + l.total, 0);
  const totalMargin = lines.reduce((n, l) => n + l.margin, 0);
  return {
    day,
    lines,
    totals: {
      quantity: lines.reduce((n, l) => n + l.quantity, 0),
      total: totalRevenue,
      margin: totalMargin,
      marginPercent: marginPercent(totalMargin, totalRevenue),
    },
  };
}

// ---------- Journal de caisse ----------
async function balanceBefore(deps: Deps, registerId: string, at: Date): Promise<number> {
  const [last] = await deps.db
    .select({ balance: cashEntries.balanceAfter })
    .from(cashEntries)
    .where(and(eq(cashEntries.registerId, registerId), lt(cashEntries.createdAt, at)))
    .orderBy(desc(cashEntries.createdAt), desc(cashEntries.number))
    .limit(1);
  return last?.balance ?? 0;
}

export async function cashJournal(deps: Deps, day: string) {
  const [from, to] = dayRange(day);
  const entries = await deps.db
    .select({ entry: cashEntries, operator: users.displayName, register: cashRegisters.label })
    .from(cashEntries)
    .innerJoin(users, eq(users.id, cashEntries.operatorId))
    .innerJoin(cashRegisters, eq(cashRegisters.id, cashEntries.registerId))
    .where(and(gte(cashEntries.createdAt, from), lt(cashEntries.createdAt, to)))
    .orderBy(asc(cashEntries.createdAt), asc(cashEntries.number));
  const registers = await deps.db.select().from(cashRegisters);
  const closing = await Promise.all(
    registers.map(async (r) => ({
      registerId: r.id,
      label: r.label,
      balance: await balanceBefore(deps, r.id, to),
    })),
  );
  const total = closing.reduce((n, c) => n + c.balance, 0);
  const inCash = closing
    .filter((c) => (CASH_REGISTERS_IN_CASH as readonly string[]).includes(c.registerId))
    .reduce((n, c) => n + c.balance, 0);
  return {
    day,
    entries: entries.map(({ entry, operator, register }) => ({
      at: entry.createdAt.toISOString(),
      register,
      registerId: entry.registerId,
      number: entry.number,
      type: entry.type,
      direction: entry.direction,
      paymentMethod: entry.paymentMethod,
      customerName: entry.customerName,
      label: entry.label,
      amount: entry.amount,
      balanceAfter: entry.balanceAfter,
      operator,
    })),
    closing,
    total,
    inCash,
  };
}

// ---------- X de caisse ----------
export async function xReport(deps: Deps, day: string) {
  const [from] = dayRange(day);
  const journal = await cashJournal(deps, day);
  const registers = await deps.db.select().from(cashRegisters);
  const perRegister = await Promise.all(
    registers.map(async (r) => {
      const movements = journal.entries
        .filter((e) => e.registerId === r.id)
        .map((e, i) => ({
          line: i + 1,
          number: e.number,
          type: e.type,
          at: e.at,
          label: e.label,
          amount: signedEntry(e.direction as "in" | "out", e.amount),
        }));
      const opening = await balanceBefore(deps, r.id, from);
      const net = movements.reduce((n, m) => n + m.amount, 0);
      return { registerId: r.id, label: r.label, opening, movements, net, closing: opening + net };
    }),
  );
  return { day, registers: perRegister, grandTotal: perRegister.reduce((n, r) => n + r.closing, 0) };
}

// ---------- Situation gaz ----------
export async function gasSituation(deps: Deps) {
  const levels = await stockLevels(deps);
  const byBrand = new Map<string, { brand: string; full: number; empty: number; total: number }>();
  for (const l of levels) {
    const cur = byBrand.get(l.brandId) ?? { brand: l.brandName, full: 0, empty: 0, total: 0 };
    cur.full += l.full;
    cur.empty += l.empty;
    cur.total += l.full + l.empty;
    byBrand.set(l.brandId, cur);
  }
  const rows = [...byBrand.values()];
  return {
    rows,
    totals: {
      full: rows.reduce((n, r) => n + r.full, 0),
      empty: rows.reduce((n, r) => n + r.empty, 0),
      total: rows.reduce((n, r) => n + r.total, 0),
    },
  };
}

// ---------- Exports CSV ----------
export async function salesCsv(deps: Deps, day: string) {
  const r = await customerStats(deps, day);
  return toCsv(
    [
      "Ticket",
      "Date",
      "Client",
      "Article",
      "Quantité",
      "Prix unitaire",
      "Paiement",
      "Total",
      "Marge",
      "Marge %",
    ],
    r.lines.map((l) => [
      l.saleNumber,
      l.at,
      l.customerName,
      l.item,
      l.quantity,
      l.unitPrice,
      l.paymentMethod,
      l.total,
      l.margin,
      l.marginPercent,
    ]),
  );
}

export async function cashCsv(deps: Deps, day: string) {
  const r = await cashJournal(deps, day);
  return toCsv(
    [
      "Date",
      "Caisse",
      "Pièce",
      "Sens",
      "Paiement",
      "Client",
      "Libellé",
      "Montant",
      "Solde après",
      "Opérateur",
    ],
    r.entries.map((e) => [
      e.at,
      e.register,
      e.number,
      e.direction === "in" ? "Entrée" : "Sortie",
      e.paymentMethod,
      e.customerName,
      e.label,
      e.amount,
      e.balanceAfter,
      e.operator,
    ]),
  );
}

export async function stockCsv(deps: Deps) {
  const r = await gasSituation(deps);
  return toCsv(
    ["Marque", "Pleines", "Vides", "Total"],
    [
      ...r.rows.map((x) => [x.brand, x.full, x.empty, x.total]),
      ["TOTAL", r.totals.full, r.totals.empty, r.totals.total],
    ],
  );
}
