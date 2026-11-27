import { schema } from "@jarvis/db";
import { type CashRegisterId, DEFAULT_SAGE_ACCOUNTS, type SageAccounts, sageAccounts } from "@jarvis/shared";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { businessDate, dayRange } from "../cash/rules.js";
import type { Deps } from "../http.js";

const { cashEntries, saleLines, canalPayments, moneyOperations, settings } = schema;

const KEY = "sage_accounts";
type Entry = typeof cashEntries.$inferSelect;

export async function readAccounts(deps: Deps): Promise<SageAccounts> {
  const [row] = await deps.db.select().from(settings).where(eq(settings.key, KEY));
  return row ? sageAccounts.parse(JSON.parse(row.value)) : DEFAULT_SAGE_ACCOUNTS;
}

export async function writeAccounts(deps: Deps, actorId: string, input: SageAccounts) {
  const value = JSON.stringify(input);
  await deps.db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await recordAudit(deps.db, {
    action: "sage.accounts.change",
    entity: "setting",
    entityId: KEY,
    actorId,
    details: input,
  });
  return input;
}

export interface JournalLine {
  journal: string;
  date: string;
  piece: string;
  account: string;
  label: string;
  debit: number;
  credit: number;
}

/** Contreparties d'un mouvement : une seule, sauf la livraison d'une vente, isolée en prestation de service. */
type Counterpart = { account: string; amount: number };

interface Context {
  accounts: SageAccounts;
  /** Frais de livraison par vente (positifs). */
  delivery: Map<string, number>;
  canal: Set<string>;
  mobile: Set<string>;
}

function counterparts(entry: Entry, origin: Entry, context: Context): Counterpart[] {
  const { accounts } = context;
  const one = (account: string) => [{ account, amount: entry.amount }];
  if (origin.saleId) {
    const delivery = Math.min(context.delivery.get(origin.saleId) ?? 0, entry.amount);
    return [
      { account: accounts.goods, amount: entry.amount - delivery },
      { account: accounts.services, amount: delivery },
    ].filter((c) => c.amount > 0);
  }
  if (context.canal.has(origin.id)) return one(accounts.services);
  // Dépôts, retraits et transferts : l'argent change de caisse, il passe par un compte de virements.
  if (context.mobile.has(origin.id) || origin.label.startsWith("Transfert ")) return one(accounts.transfers);
  if (origin.type === "FDC") {
    return one(origin.direction === "in" ? accounts.closureGain : accounts.closureLoss);
  }
  return one(origin.type === "MSC" ? accounts.expenses : accounts.suspense);
}

const journalCode = (registerId: string) => (registerId.endsWith("cash") ? "CAI" : "MOB");

/** Écritures en partie double de tous les mouvements de caisse de la période : débits et crédits équilibrés. */
export async function journalLines(deps: Deps, days: string[]): Promise<JournalLine[]> {
  const [from] = dayRange(days[0] ?? "");
  const [, to] = dayRange(days.at(-1) ?? "");
  const entries = await deps.db
    .select()
    .from(cashEntries)
    .where(and(gte(cashEntries.createdAt, from), lt(cashEntries.createdAt, to)))
    .orderBy(asc(cashEntries.createdAt), asc(cashEntries.number));

  // Une écriture inverse se classe comme celle qu'elle annule, même passée avant la période.
  const byId = new Map(entries.map((e) => [e.id, e]));
  let missing = entries.flatMap((e) => (e.reversalOf && !byId.has(e.reversalOf) ? [e.reversalOf] : []));
  while (missing.length > 0) {
    const found = await deps.db.select().from(cashEntries).where(inArray(cashEntries.id, missing));
    for (const e of found) byId.set(e.id, e);
    missing = found.flatMap((e) => (e.reversalOf && !byId.has(e.reversalOf) ? [e.reversalOf] : []));
  }
  const originOf = (entry: Entry): Entry => {
    const previous = entry.reversalOf ? byId.get(entry.reversalOf) : undefined;
    return previous ? originOf(previous) : entry;
  };

  const origins = entries.map(originOf);
  const saleIds = origins.flatMap((e) => (e.saleId ? [e.saleId] : []));
  const lines = saleIds.length
    ? await deps.db.select().from(saleLines).where(inArray(saleLines.saleId, saleIds))
    : [];
  const delivery = new Map<string, number>();
  for (const l of lines) delivery.set(l.saleId, (delivery.get(l.saleId) ?? 0) + l.deliveryFee * l.quantity);
  const [payments, operations] = await Promise.all([
    deps.db.select({ id: canalPayments.cashEntryId }).from(canalPayments),
    deps.db
      .select({ cash: moneyOperations.cashEntryId, float: moneyOperations.floatEntryId })
      .from(moneyOperations),
  ]);
  const context: Context = {
    accounts: await readAccounts(deps),
    delivery,
    canal: new Set(payments.map((p) => p.id)),
    mobile: new Set(operations.flatMap((o) => [o.cash, o.float])),
  };

  return entries.flatMap((entry, i) => {
    const incoming = entry.direction === "in";
    const base = {
      journal: journalCode(entry.registerId),
      date: businessDate(entry.createdAt),
      piece: entry.number,
      label: entry.label,
    };
    const side = (amount: number, debit: boolean) =>
      debit ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };
    return [
      {
        ...base,
        account: context.accounts.registers[entry.registerId as CashRegisterId],
        ...side(entry.amount, incoming),
      },
      ...counterparts(entry, origins[i] ?? entry, context).map((c) => ({
        ...base,
        account: c.account,
        ...side(c.amount, !incoming),
      })),
    ];
  });
}

/** Un libellé ne peut ni ajouter une colonne, ni devenir une formule dans un tableur. */
const clean = (text: string) =>
  text
    .replace(/[;\r\n\t]+/g, " ")
    .replace(/→/g, "->")
    .replace(/^[=+\-@]+/, "")
    .slice(0, 69);

/**
 * Fichier d'import : point-virgule, une ligne par écriture, date JJMMAA, montants entiers, encodage Windows
 * (Latin-1) et fins de ligne CRLF.
 */
export function sageCsv(lines: readonly JournalLine[]): Buffer {
  const date = (day: string) => `${day.slice(8, 10)}${day.slice(5, 7)}${day.slice(2, 4)}`;
  const rows = lines.map((l) =>
    [l.journal, date(l.date), l.piece, l.account, clean(l.label), l.debit, l.credit].join(";"),
  );
  const header = "Code journal;Date;N° pièce;N° compte;Libellé;Débit;Crédit";
  const text = `${[header, ...rows].join("\r\n")}\r\n`;
  return Buffer.from([...text].map((c) => ((c.codePointAt(0) ?? 0) < 256 ? c : "?")).join(""), "latin1");
}
