import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import { type CreateSaleInput, type Sale, WALKIN_CUSTOMER } from "@jarvis/shared";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { auditAndNotifyPdg } from "../audit/service.js";
import { appendCashEntry, formatNumber, nextSequence, registerForPayment } from "../cash/ledger.js";
import { dayRange } from "../cash/rules.js";
import { currentGasPrice } from "../catalogue/service.js";
import { findOrCreateCustomer } from "../customers/service.js";
import { AppError, type Deps } from "../http.js";
import { appendStockMove, lockStock, stockOf } from "../stock/ledger.js";
import { aggregateFullDemand, computeGasLine } from "./compute.js";

const { sales, saleLines, brands, formats, articles } = schema;

type SaleRow = typeof sales.$inferSelect;
type SaleLineRow = typeof saleLines.$inferSelect;

export function toSale(row: SaleRow, lines: SaleLineRow[]): Sale {
  return {
    id: row.id,
    number: row.number,
    customerName: row.customerName,
    paymentMethod: row.paymentMethod as Sale["paymentMethod"],
    total: row.total,
    lines: lines.map((l) => ({
      kind: l.kind as "gas" | "article",
      brandId: l.brandId,
      formatId: l.formatId,
      articleId: l.articleId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      transportContribution: l.transportContribution,
      deliveryFee: l.deliveryFee,
      returnedBrandId: l.returnedBrandId,
      packagingGap: l.packagingGap,
      packagingGapPending: l.packagingGapPending,
      total: l.total,
    })),
    authorId: row.authorId,
    createdAt: row.createdAt.toISOString(),
    reversalOf: row.reversalOf,
  };
}

async function loadBrand(tx: Database, brandId: string) {
  const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) throw new AppError(404, "not_found", "Marque introuvable");
  if (!brand.active) throw new AppError(422, "invalid_request", `La marque ${brand.name} est désactivée`);
  return brand;
}

/**
 * Vente au comptoir. Règles : nom du client obligatoire pour le gaz, aucune vente à crédit (le paiement est
 * toujours réglé à la remise), vente refusée à stock nul, échange entre marques (un plein remis, un vide rapporté,
 * écart de valeur d'emballage en gain ou perte). Tout est écrit dans une seule transaction.
 */
export interface SaleOptions {
  /** Instant réel de la vente (saisie hors ligne) : sert au prix en vigueur. */
  occurredAt?: Date;
  /** Rejeu hors ligne : la bouteille est déjà partie, on enregistre la vente et on signale l'écart de stock. */
  allowOutOfStock?: boolean;
}

export async function createSale(deps: Deps, authorId: string, input: CreateSaleInput): Promise<Sale> {
  return (await createSaleDetailed(deps, authorId, input)).sale;
}

export async function createSaleDetailed(
  deps: Deps,
  authorId: string,
  input: CreateSaleInput,
  options: SaleOptions = {},
): Promise<{ sale: Sale; shortages: string[] }> {
  const now = deps.now();
  const priceAt = options.occurredAt && options.occurredAt < now ? options.occurredAt : now;
  const shortages: string[] = [];
  const deliveryFee = input.deliveryFeePerBottle ?? 0;
  const gasLines = input.lines.flatMap((l) => (l.kind === "gas" ? [l] : []));
  const articleLinesIn = input.lines.flatMap((l) => (l.kind === "article" ? [l] : []));

  const ceilingRow = await deps.db.query.settings.findFirst({
    where: (s, { eq }) => eq(s.key, "delivery_fee_ceiling"),
  });
  if (ceilingRow && deliveryFee > Number(ceilingRow.value)) {
    throw new AppError(
      422,
      "price_above_ceiling",
      `La livraison dépasse le plafond de ${ceilingRow.value} FCFA par bouteille`,
    );
  }

  return deps.db.transaction(async (tx) => {
    const customerName = input.customerName?.trim() || WALKIN_CUSTOMER;
    const customer = input.customerName?.trim() ? await findOrCreateCustomer(tx, customerName) : null;

    // 1. Verrouiller puis contrôler le stock de pleins (toutes lignes confondues), dans un ordre fixe.
    const demand = aggregateFullDemand(gasLines);
    for (const d of demand.values()) await lockStock(tx, d.brandId, d.formatId);
    for (const d of demand.values()) {
      const brand = await loadBrand(tx, d.brandId);
      const available = await stockOf(tx, d.brandId, d.formatId, "full");
      if (available < d.quantity) {
        const message = `Rupture : ${brand.name} (${available} plein(s) en stock, ${d.quantity} demandé(s))`;
        if (!options.allowOutOfStock) throw new AppError(409, "out_of_stock", message);
        shortages.push(message);
      }
    }

    // 2. Calculer les lignes.
    const computed: (typeof saleLines.$inferInsert)[] = [];
    const moves: {
      brandId: string;
      formatId: string;
      state: "full" | "empty";
      delta: number;
      exchange: boolean;
    }[] = [];
    const pendingGaps: string[] = [];
    for (const line of gasLines) {
      const given = await loadBrand(tx, line.brandId);
      const returned = line.returnedBrandId ? await loadBrand(tx, line.returnedBrandId) : given;
      const [format] = await tx.select().from(formats).where(eq(formats.id, line.formatId)).limit(1);
      if (!format?.active) throw new AppError(422, "invalid_request", "Format inconnu ou désactivé");
      const price = await currentGasPrice(tx, line.formatId, line.brandId, priceAt);
      if (!price) throw new AppError(422, "invalid_request", "Aucun prix défini pour ce format");
      // Échange avec une marque dont la valeur d'emballage est inconnue : la vente passe (même prix pour le
      // client), l'écart n'est pas calculé et reste à régulariser par le PDG.
      const packagingUnknown =
        returned.id !== given.id && !(given.packagingValueKnown && returned.packagingValueKnown);
      if (packagingUnknown) pendingGaps.push(`${given.name}/${returned.name}`);
      const r = computeGasLine(
        price,
        line.quantity,
        deliveryFee,
        given.packagingValue,
        returned.packagingValue,
        packagingUnknown,
      );
      computed.push({
        saleId: "",
        kind: "gas",
        brandId: line.brandId,
        formatId: line.formatId,
        returnedBrandId: returned.id,
        quantity: line.quantity,
        unitPrice: r.unitPrice,
        transportContribution: r.transportContribution,
        deliveryFee: r.deliveryFee,
        packagingGap: r.packagingGap,
        packagingGapPending: r.packagingGapPending,
        purchaseCost: r.purchaseCost,
        total: r.total,
      });
      const exchange = returned.id !== given.id;
      moves.push({
        brandId: given.id,
        formatId: line.formatId,
        state: "full",
        delta: -line.quantity,
        exchange,
      });
      moves.push({
        brandId: returned.id,
        formatId: line.formatId,
        state: "empty",
        delta: line.quantity,
        exchange,
      });
    }

    const articleRows = articleLinesIn.length
      ? await tx
          .select()
          .from(articles)
          .where(
            inArray(
              articles.id,
              articleLinesIn.map((l) => l.articleId),
            ),
          )
      : [];
    const articleDemand = new Map<string, number>();
    for (const l of articleLinesIn)
      articleDemand.set(l.articleId, (articleDemand.get(l.articleId) ?? 0) + l.quantity);
    for (const line of articleLinesIn) {
      const art = articleRows.find((a) => a.id === line.articleId);
      if (!art?.active) throw new AppError(404, "not_found", "Article introuvable ou désactivé");
      if (art.trackStock && art.stockQty < (articleDemand.get(art.id) ?? 0)) {
        throw new AppError(409, "out_of_stock", `Rupture : ${art.name}`);
      }
      computed.push({
        saleId: "",
        kind: "article",
        articleId: art.id,
        quantity: line.quantity,
        unitPrice: art.price,
        purchaseCost: art.purchaseCost,
        total: line.quantity * art.price,
      });
    }

    // 3. Écrire : vente, lignes, mouvements de stock, mouvement de caisse (tous en ajout seul).
    const total = computed.reduce((n, l) => n + l.total, 0);
    const number = formatNumber("TK", await nextSequence(tx, "sale_number_seq"));
    const [saleRow] = await tx
      .insert(sales)
      .values({
        number,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? WALKIN_CUSTOMER,
        paymentMethod: input.paymentMethod,
        total,
        authorId,
        occurredAt: options.occurredAt ?? null,
        createdAt: now,
      })
      .returning();
    if (!saleRow) throw new Error("Vente non enregistrée");
    const lineRows = await tx
      .insert(saleLines)
      .values(computed.map((l) => ({ ...l, saleId: saleRow.id })))
      .returning();
    for (const m of moves) {
      await appendStockMove(tx, {
        brandId: m.brandId,
        formatId: m.formatId,
        state: m.state,
        delta: m.delta,
        reason: m.exchange ? "exchange" : "sale",
        authorId,
        saleId: saleRow.id,
        createdAt: now,
      });
    }
    for (const art of articleRows) {
      if (art.trackStock) {
        await tx
          .update(articles)
          .set({ stockQty: art.stockQty - (articleDemand.get(art.id) ?? 0) })
          .where(eq(articles.id, art.id));
      }
    }
    await appendCashEntry(tx, {
      registerId: registerForPayment(input.paymentMethod),
      direction: "in",
      type: "REG",
      paymentMethod: input.paymentMethod,
      customerName: saleRow.customerName,
      label: `Vente ${number}`,
      amount: total,
      operatorId: authorId,
      saleId: saleRow.id,
      createdAt: now,
    });
    if (pendingGaps.length > 0) {
      await auditAndNotifyPdg(
        tx,
        {
          action: "sale.packaging_unknown",
          entity: "sale",
          entityId: saleRow.id,
          actorId: authorId,
          details: { number, exchanges: pendingGaps },
        },
        `Échange ${pendingGaps.join(", ")} (vente ${number}) : valeur d'emballage inconnue, écart à régulariser`,
      );
    }
    return { sale: toSale(saleRow, lineRows), shortages };
  });
}

export interface SaleFilter {
  limit?: number;
  /** Jour d'activité (AAAA-MM-JJ). */
  day?: string;
  /** Seulement les ventes comportant un échange entre marques différentes. */
  exchangeOnly?: boolean;
}

export async function listSales(deps: Deps, filter: SaleFilter = {}): Promise<Sale[]> {
  const conditions = [];
  if (filter.day) {
    const [from, to] = dayRange(filter.day);
    conditions.push(gte(sales.createdAt, from), lt(sales.createdAt, to));
  }
  if (filter.exchangeOnly) {
    conditions.push(
      sql`exists (select 1 from ${saleLines} where ${saleLines.saleId} = ${sales.id} and ${saleLines.returnedBrandId} is not null and ${saleLines.returnedBrandId} <> ${saleLines.brandId})`,
    );
  }
  const rows = await deps.db
    .select()
    .from(sales)
    .where(and(...conditions))
    .orderBy(desc(sales.createdAt), desc(sales.number))
    .limit(filter.limit ?? 50);
  if (rows.length === 0) return [];
  const lines = await deps.db
    .select()
    .from(saleLines)
    .where(
      inArray(
        saleLines.saleId,
        rows.map((r) => r.id),
      ),
    );
  return rows.map((r) =>
    toSale(
      r,
      lines.filter((l) => l.saleId === r.id),
    ),
  );
}

export async function getSale(deps: Deps, id: string): Promise<Sale> {
  const [row] = await deps.db.select().from(sales).where(eq(sales.id, id)).limit(1);
  if (!row) throw new AppError(404, "not_found", "Vente introuvable");
  const lines = await deps.db.select().from(saleLines).where(eq(saleLines.saleId, id));
  return toSale(row, lines);
}
