import { randomBytes } from "node:crypto";
import { schema } from "@jarvis/db";
import type {
  CreateOrderInput,
  Order,
  OrderLine,
  OrderStatus,
  OrderSummary,
  PlacedOrder,
  SessionUser,
  TrackedOrder,
  ValidateOrderInput,
} from "@jarvis/shared";
import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { formatNumber, nextSequence } from "../cash/ledger.js";
import type { Tx } from "../cash/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { requireJustification } from "../sales/cancel.js";
import { lockStock } from "../stock/ledger.js";
import { quoteLines } from "./quote.js";
import { RESERVING } from "./reservations.js";
import { assertUnderCeiling, readSettings } from "./settings.js";

const { orders, orderLines, neighbourhoods } = schema;

/** Nombre de commandes en attente qu'un même numéro de téléphone peut accumuler (garde-fou sans compte). */
export const MAX_PENDING_PER_PHONE = 3;

type OrderRow = typeof orders.$inferSelect;
type LineRow = typeof orderLines.$inferSelect;

const toLine = (l: LineRow): OrderLine => ({
  kind: l.kind as OrderLine["kind"],
  brandId: l.brandId,
  formatId: l.formatId,
  returnedBrandId: l.returnedBrandId,
  articleId: l.articleId,
  label: l.label,
  quantity: l.quantity,
  unitPrice: l.unitPrice,
  deliveryFee: l.deliveryFee,
  total: l.total,
});

export const toOrder = (o: OrderRow, lines: LineRow[]): Order => ({
  id: o.id,
  number: o.number,
  source: o.source as Order["source"],
  status: o.status as OrderStatus,
  mode: o.mode as Order["mode"],
  customerName: o.customerName,
  phone: o.phone,
  neighbourhoodName: o.neighbourhoodName,
  landmark: o.landmark,
  latitude: o.latitude,
  longitude: o.longitude,
  paymentMethod: o.paymentMethod as Order["paymentMethod"],
  paymentReference: o.paymentReference,
  paymentConfirmedAt: o.paymentConfirmedAt?.toISOString() ?? null,
  deliveryFeePerBottle: o.deliveryFeePerBottle,
  total: o.total,
  lines: lines.map(toLine),
  createdAt: o.createdAt.toISOString(),
});

export async function selectOrders(db: Deps["db"] | Tx, where?: SQL): Promise<Order[]> {
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt), desc(orders.number));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const lines = await db
    .select()
    .from(orderLines)
    .where(inArray(orderLines.orderId, ids))
    .orderBy(asc(orderLines.position));
  return rows.map((r) =>
    toOrder(
      r,
      lines.filter((l) => l.orderId === r.id),
    ),
  );
}

export async function getOrder(db: Deps["db"] | Tx, orderId: string): Promise<Order> {
  return requireRow(await selectOrders(db, eq(orders.id, orderId)), "Commande introuvable");
}

export const listOrders = (deps: Deps, status?: OrderStatus) =>
  selectOrders(deps.db, status ? eq(orders.status, status) : undefined);

export async function summary(deps: Deps): Promise<OrderSummary> {
  const rows = await deps.db
    .select({ status: orders.status, n: count() })
    .from(orders)
    .groupBy(orders.status);
  const of = (statuses: readonly string[]) =>
    rows.filter((r) => statuses.includes(r.status)).reduce((n, r) => n + r.n, 0);
  return { pending: of(["pending"]), toDeliver: of(RESERVING) };
}

const tracked = (o: Order): TrackedOrder => ({
  number: o.number,
  status: o.status,
  mode: o.mode,
  paymentMethod: o.paymentMethod,
  paymentConfirmed: o.paymentConfirmedAt !== null,
  total: o.total,
  lines: o.lines.map((l) => ({ label: l.label, quantity: l.quantity, total: l.total })),
  createdAt: o.createdAt,
});

const placed = async (db: Deps["db"], row: OrderRow): Promise<PlacedOrder> => ({
  ...tracked(await getOrder(db, row.id)),
  trackingToken: row.trackingToken,
});

/** Quartier choisi ou nommé ; son montant, sinon celui de la boutique. */
async function deliveryTarget(deps: Deps, input: CreateOrderInput) {
  if (input.mode === "pickup") return { neighbourhoodName: null, fee: 0 };
  const shop = await readSettings(deps.db);
  const [known] = await deps.db
    .select()
    .from(neighbourhoods)
    .where(
      input.neighbourhoodId
        ? eq(neighbourhoods.id, input.neighbourhoodId)
        : eq(neighbourhoods.name, input.neighbourhoodName ?? ""),
    );
  if (input.neighbourhoodId && !known?.active) {
    throw new AppError(422, "invalid_request", "Quartier inconnu ou non desservi");
  }
  return {
    neighbourhoodName: known?.name ?? input.neighbourhoodName ?? null,
    fee: known?.feePerBottle ?? shop.deliveryFeePerBottle,
  };
}

/**
 * Prise de commande, sans compte (en ligne) ou saisie par le gérant (téléphone). La commande attend la validation :
 * rien n'est réservé avant.
 */
export async function placeOrder(
  deps: Deps,
  input: CreateOrderInput,
  source: "online" | "phone",
): Promise<PlacedOrder> {
  const [existing] = await deps.db.select().from(orders).where(eq(orders.clientRef, input.clientRef));
  if (existing) return placed(deps.db, existing);
  if (source === "online") {
    const waiting = await deps.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.phone, input.phone), eq(orders.status, "pending")));
    if (waiting.length >= MAX_PENDING_PER_PHONE) {
      throw new AppError(
        409,
        "conflict",
        "Trop de commandes en attente pour ce numéro : contactez la boutique",
      );
    }
  }
  const { neighbourhoodName, fee } = await deliveryTarget(deps, input);
  const lines = await quoteLines(deps, input.lines, fee);
  const total = lines.reduce((n, l) => n + l.total, 0);
  const { minimumOrder } = await readSettings(deps.db);
  if (source === "online" && total < minimumOrder) {
    throw new AppError(422, "invalid_request", `Commande minimale : ${minimumOrder} FCFA`);
  }
  const row = await deps.db.transaction(async (tx) => {
    const number = formatNumber("CMD", await nextSequence(tx, "order_number_seq"));
    const created = requireRow(
      await tx
        .insert(orders)
        .values({
          number,
          clientRef: input.clientRef,
          trackingToken: randomBytes(18).toString("base64url"),
          source,
          mode: input.mode,
          customerName: input.customerName,
          phone: input.phone,
          neighbourhoodName,
          landmark: input.landmark ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
          paymentMethod: input.paymentMethod,
          paymentReference: input.paymentReference ?? null,
          deliveryFeePerBottle: fee,
          total,
          createdAt: deps.now(),
        })
        .returning(),
    );
    await tx.insert(orderLines).values(lines.map((l, position) => ({ ...l, position, orderId: created.id })));
    return created;
  });
  return placed(deps.db, row);
}

async function byToken(deps: Deps, token: string) {
  return requireRow(
    await deps.db.select().from(orders).where(eq(orders.trackingToken, token)),
    "Commande introuvable",
  );
}

export async function track(deps: Deps, token: string): Promise<TrackedOrder> {
  return tracked(await getOrder(deps.db, (await byToken(deps, token)).id));
}

/** Le client indique la référence de sa transaction mobile ; elle reste à confirmer. */
export async function setPaymentReference(deps: Deps, token: string, paymentReference: string) {
  const row = await byToken(deps, token);
  if (row.paymentMethod === "cash" || row.paymentConfirmedAt || row.status === "cancelled") {
    throw new AppError(409, "conflict", "Cette commande n'attend pas de référence de paiement");
  }
  await deps.db.update(orders).set({ paymentReference }).where(eq(orders.id, row.id));
  return track(deps, token);
}

/** Verrouille la commande le temps d'une transition d'état. */
export async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow> {
  return requireRow(
    await tx.select().from(orders).where(eq(orders.id, orderId)).for("update"),
    "Commande introuvable",
  );
}

export async function confirmPayment(deps: Deps, actorId: string, orderId: string): Promise<Order> {
  return deps.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    if (row.paymentMethod === "cash") {
      throw new AppError(422, "invalid_request", "Un paiement en espèces se règle à la remise");
    }
    if (!row.paymentReference)
      throw new AppError(409, "conflict", "Aucune référence de transaction à confirmer");
    if (row.paymentConfirmedAt) throw new AppError(409, "conflict", "Paiement déjà confirmé");
    if (row.status === "cancelled") throw new AppError(409, "conflict", "Commande annulée");
    await tx
      .update(orders)
      .set({ paymentConfirmedAt: deps.now(), paymentConfirmedBy: actorId })
      .where(eq(orders.id, orderId));
    await recordAudit(tx, {
      action: "order.payment.confirm",
      entity: "order",
      entityId: orderId,
      actorId,
      details: { reference: row.paymentReference },
    });
    return getOrder(tx, orderId);
  });
}

/** Mémorise le montant retenu pour le quartier : il sera proposé la fois suivante. */
async function rememberFee(tx: Tx, name: string, feePerBottle: number) {
  await tx
    .insert(neighbourhoods)
    .values({ name, feePerBottle })
    .onConflictDoUpdate({ target: neighbourhoods.name, set: { feePerBottle } });
}

/**
 * Validation par le gérant : le stock est vérifié sous verrou puis réservé. Les frais de livraison peuvent être
 * changés ; la modification est tracée.
 */
export async function validateOrder(
  deps: Deps,
  actorId: string,
  orderId: string,
  input: ValidateOrderInput,
): Promise<Order> {
  const shop = await readSettings(deps.db);
  return deps.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    if (row.status !== "pending") throw new AppError(409, "conflict", "Commande déjà traitée");
    const current = await getOrder(tx, orderId);
    const fee = input.deliveryFeePerBottle ?? row.deliveryFeePerBottle;
    if (fee !== row.deliveryFeePerBottle) {
      if (row.mode !== "delivery")
        throw new AppError(422, "invalid_request", "Retrait en boutique : sans frais");
      assertUnderCeiling(fee, shop.deliveryFeeCeiling);
    }
    for (const l of current.lines) {
      if (l.brandId && l.formatId) await lockStock(tx, l.brandId, l.formatId);
    }
    // La requête client n'a rien réservé : le stock est revérifié maintenant, réservations des autres comprises.
    await quoteLines(
      { ...deps, db: tx },
      current.lines.map((l) =>
        l.kind === "gas"
          ? { kind: "gas", brandId: l.brandId ?? "", formatId: l.formatId ?? "", quantity: l.quantity }
          : { kind: "article", articleId: l.articleId ?? "", quantity: l.quantity },
      ),
      fee,
    );
    let total = row.total;
    if (fee !== row.deliveryFeePerBottle) {
      const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
      total = 0;
      for (const l of lines) {
        const deliveryFee = l.kind === "gas" ? fee : 0;
        const lineTotal = l.quantity * (l.unitPrice + deliveryFee);
        total += lineTotal;
        await tx.update(orderLines).set({ deliveryFee, total: lineTotal }).where(eq(orderLines.id, l.id));
      }
      if (row.neighbourhoodName) await rememberFee(tx, row.neighbourhoodName, fee);
    }
    await tx
      .update(orders)
      .set({ status: "validated", deliveryFeePerBottle: fee, total })
      .where(eq(orders.id, orderId));
    await recordAudit(tx, {
      action: "order.validate",
      entity: "order",
      entityId: orderId,
      actorId,
      details: { deliveryFeePerBottle: fee, previousFee: row.deliveryFeePerBottle },
    });
    return getOrder(tx, orderId);
  });
}

/** Annulation avec justificatif : le stock réservé est libéré, le PDG prévenu. */
export async function cancelOrder(
  deps: Deps,
  actor: SessionUser,
  orderId: string,
  rawJustification: unknown,
): Promise<Order> {
  const why = requireJustification(rawJustification);
  return deps.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    if (row.status === "cancelled" || row.status === "delivered") {
      throw new AppError(409, "conflict", "Cette commande ne peut plus être annulée");
    }
    await tx.update(orders).set({ status: "cancelled", cancelReason: why }).where(eq(orders.id, orderId));
    await auditAndNotifyPdg(
      tx,
      {
        action: "order.cancel",
        entity: "order",
        entityId: orderId,
        actorId: actor.id,
        details: { number: row.number, justification: why },
      },
      `${actor.displayName} a annulé la commande ${row.number} (${row.total} FCFA) le ${deps.now().toISOString()} : ${why}`,
    );
    return getOrder(tx, orderId);
  });
}
