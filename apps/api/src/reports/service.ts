import { schema } from "@jarvis/db";
import { and, asc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { dueSubscribers } from "../canal/service.js";
import { balanceBefore } from "../cash/ledger.js";
import { dayRange } from "../cash/rules.js";
import { listRegisters } from "../cash/service.js";
import type { Deps } from "../http.js";
import { lineMargin } from "../sales/compute.js";
import { withSettlements } from "../sales/settlements.js";
import { stockLevels } from "../stock/service.js";
import {
  CASH_REGISTERS_IN_CASH,
  type CsvCell,
  gasLabel,
  marginPercent,
  signed,
  signedEntry,
} from "./compute.js";

const { sales, saleLines, brands, formats, articles, cashEntries, cashRegisters, users, notifications } =
  schema;

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
  const effective = await withSettlements(
    deps.db,
    rows.map((r) => r.line),
  );
  const brandName = (id: string | null) => allBrands.find((b) => b.id === id)?.name ?? null;

  const lines = rows.map(({ sale, brand, format, article }, i) => {
    const line = effective[i] as (typeof effective)[number];
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
      balance: await balanceBefore(deps.db, r.id, to),
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
      const opening = await balanceBefore(deps.db, r.id, from);
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

// ---------- Exports (CSV ou Excel) ----------
export interface Table {
  headers: string[];
  rows: CsvCell[][];
}

/** Les jours d'activité de `from` à `to` inclus. */
export function daysOf(from: string, to: string): string[] {
  const days: string[] = [];
  for (
    let at = Date.parse(`${from}T00:00:00.000Z`);
    at <= Date.parse(`${to}T00:00:00.000Z`);
    at += 86_400_000
  ) {
    days.push(new Date(at).toISOString().slice(0, 10));
  }
  return days;
}

export async function salesTable(deps: Deps, days: string[]): Promise<Table> {
  const reports = await Promise.all(days.map((d) => customerStats(deps, d)));
  return {
    headers: [
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
    rows: reports.flatMap((r) =>
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
    ),
  };
}

export async function cashTable(deps: Deps, days: string[]): Promise<Table> {
  const journals = await Promise.all(days.map((d) => cashJournal(deps, d)));
  return {
    headers: [
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
    rows: journals.flatMap((r) =>
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
    ),
  };
}

export async function stockTable(deps: Deps): Promise<Table> {
  const r = await gasSituation(deps);
  return {
    headers: ["Marque", "Pleines", "Vides", "Total"],
    rows: [
      ...r.rows.map((x) => [x.brand, x.full, x.empty, x.total]),
      ["TOTAL", r.totals.full, r.totals.empty, r.totals.total],
    ],
  };
}

// ---------- Tableau de bord du PDG ----------
/** Vue agrégée : ventes et marge du jour, soldes des caisses, stock, alertes et notifications non lues. */
export async function dashboard(deps: Deps, day: string) {
  const [stats, levels, registers, unread, due] = await Promise.all([
    customerStats(deps, day),
    stockLevels(deps),
    listRegisters(deps),
    deps.db
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.recipientRole, "pdg"), isNull(notifications.readAt))),
    dueSubscribers(deps, 7),
  ]);
  const alerts = levels.filter((l) => l.low);
  return {
    day,
    sales: {
      count: new Set(stats.lines.map((l) => l.saleNumber)).size,
      quantity: stats.totals.quantity,
      total: stats.totals.total,
      margin: stats.totals.margin,
      marginPercent: stats.totals.marginPercent,
    },
    registers: registers.map((r) => ({
      id: r.id,
      label: r.label,
      active: r.active,
      opening: r.opening,
      balance: r.balance,
    })),
    stock: {
      full: levels.reduce((n, l) => n + l.full, 0),
      empty: levels.reduce((n, l) => n + l.empty, 0),
      alerts,
    },
    unreadNotifications: unread[0]?.n ?? 0,
    canalDue: due.length,
  };
}
