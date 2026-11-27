import { schema } from "@jarvis/db";
import type {
  CompleteOrderInput,
  Delivery,
  Order,
  OrderStatus,
  PaymentMethod,
  SessionUser,
} from "@jarvis/shared";
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { businessDate, dayRange } from "../cash/rules.js";
import type { Tx } from "../cash/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";
import { createSaleDetailed } from "../sales/service.js";
import { getOrder, lockOrder, selectOrders } from "./orders.js";
import { RESERVING } from "./reservations.js";

const { orders, users, userRoles } = schema;

type OrderRow = typeof orders.$inferSelect;

/** Utilisateurs à qui une livraison peut être confiée. */
export const drivers = (deps: Deps) =>
  deps.db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .where(and(eq(userRoles.role, "livreur"), eq(users.active, true)))
    .orderBy(asc(users.displayName));

function assertStatus(row: OrderRow, allowed: readonly OrderStatus[]) {
  if (!allowed.includes(row.status as OrderStatus)) {
    throw new AppError(409, "conflict", "Action impossible dans l'état actuel de la commande");
  }
}

export async function assign(deps: Deps, actorId: string, orderId: string, driverId: string): Promise<Order> {
  const available = await drivers(deps);
  if (!available.some((d) => d.id === driverId)) {
    throw new AppError(422, "invalid_request", "Cet utilisateur n'a pas le profil livreur");
  }
  return deps.db.transaction(async (tx) => {
    const row = await lockOrder(tx, orderId);
    if (row.mode !== "delivery") throw new AppError(422, "invalid_request", "Commande à retirer en boutique");
    assertStatus(row, RESERVING);
    await tx.update(orders).set({ assignedTo: driverId }).where(eq(orders.id, orderId));
    await recordAudit(tx, {
      action: "order.assign",
      entity: "order",
      entityId: orderId,
      actorId,
      details: { driverId },
    });
    return getOrder(tx, orderId);
  });
}

const toDelivery = (o: Order): Delivery => ({
  id: o.id,
  number: o.number,
  status: o.status,
  customerName: o.customerName,
  phone: o.phone,
  neighbourhoodName: o.neighbourhoodName,
  landmark: o.landmark,
  latitude: o.latitude,
  longitude: o.longitude,
  paymentMethod: o.paymentMethod,
  paymentConfirmed: o.paymentConfirmedAt !== null,
  total: o.total,
  lines: o.lines,
  problemNote: o.problemNote ?? null,
});

/** Tournée du jour du livreur connecté : ses livraisons à faire, et celles livrées aujourd'hui. */
export async function myDeliveries(deps: Deps, driverId: string): Promise<Delivery[]> {
  const [today] = dayRange(businessDate(deps.now()));
  const mine = await selectOrders(
    deps.db,
    and(
      eq(orders.assignedTo, driverId),
      or(
        inArray(orders.status, [...RESERVING]),
        and(eq(orders.status, "delivered"), gte(orders.deliveredAt, today)),
      ),
    ),
  );
  return mine.reverse().map(toDelivery);
}

/** Une livraison n'est visible et modifiable que par le livreur à qui elle est confiée. */
async function lockMine(tx: Tx, driverId: string, orderId: string) {
  const row = await lockOrder(tx, orderId);
  if (row.assignedTo !== driverId) throw new AppError(404, "not_found", "Livraison introuvable");
  return row;
}

export async function depart(deps: Deps, driverId: string, orderId: string): Promise<Delivery> {
  return deps.db.transaction(async (tx) => {
    assertStatus(await lockMine(tx, driverId, orderId), ["validated", "problem"]);
    await tx
      .update(orders)
      .set({ status: "out_for_delivery", startedAt: deps.now() })
      .where(eq(orders.id, orderId));
    return toDelivery(await getOrder(tx, orderId));
  });
}

export async function reportProblem(
  deps: Deps,
  driverId: string,
  orderId: string,
  note: string,
): Promise<Delivery> {
  return deps.db.transaction(async (tx) => {
    assertStatus(await lockMine(tx, driverId, orderId), ["validated", "out_for_delivery"]);
    await tx.update(orders).set({ status: "problem", problemNote: note }).where(eq(orders.id, orderId));
    await recordAudit(tx, {
      action: "order.problem",
      entity: "order",
      entityId: orderId,
      actorId: driverId,
      details: { note },
    });
    return toDelivery(await getOrder(tx, orderId));
  });
}

/** Moyen de paiement réellement encaissé ; un paiement mobile doit avoir été confirmé par le gérant. */
function settledBy(row: OrderRow, input: CompleteOrderInput): PaymentMethod {
  const method = input.paymentMethod ?? (row.paymentMethod as PaymentMethod);
  const confirmed = row.paymentConfirmedAt !== null && method === row.paymentMethod;
  if (method !== "cash" && !confirmed) {
    throw new AppError(
      409,
      "conflict",
      "Paiement mobile non confirmé par le gérant (ou encaisser en espèces)",
    );
  }
  return method;
}

/**
 * Remise au client : la commande devient une vente (stock, caisse, rapports), aux prix de la commande, dans la même
 * transaction. Sans cela rien n'est enregistré : aucune vente à crédit.
 */
async function complete(tx: Tx, deps: Deps, actorId: string, row: OrderRow, input: CompleteOrderInput) {
  const paymentMethod = settledBy(row, input);
  const order = await getOrder(tx, row.id);
  // Statut changé avant la vente : sa propre réservation ne bloque pas son stock.
  await tx.update(orders).set({ status: "delivered", deliveredAt: deps.now() }).where(eq(orders.id, row.id));
  const returned = new Map(input.returnedEmpties?.map((e) => [e.line, e.returnedBrandId]));
  for (const position of returned.keys()) {
    if (order.lines[position]?.kind !== "gas") {
      throw new AppError(422, "invalid_request", "Vide rapporté sur une ligne qui n'est pas du gaz");
    }
  }
  const { sale } = await createSaleDetailed(
    { ...deps, db: tx },
    actorId,
    {
      customerName: order.customerName,
      paymentMethod,
      deliveryFeePerBottle: order.deliveryFeePerBottle,
      lines: order.lines.map((l, position) => {
        if (l.kind === "article")
          return { kind: "article", articleId: l.articleId ?? "", quantity: l.quantity };
        const empty = returned.get(position) ?? l.returnedBrandId ?? undefined;
        return {
          kind: "gas",
          brandId: l.brandId ?? "",
          formatId: l.formatId ?? "",
          quantity: l.quantity,
          ...(empty ? { returnedBrandId: empty } : {}),
        };
      }),
    },
    {
      priceAt: row.createdAt,
      articlePrices: new Map(
        order.lines.flatMap((l) => (l.articleId ? [[l.articleId, l.unitPrice] as const] : [])),
      ),
    },
  );
  await tx.update(orders).set({ saleId: sale.id, paymentMethod }).where(eq(orders.id, row.id));
  await recordAudit(tx, {
    action: "order.delivered",
    entity: "order",
    entityId: row.id,
    actorId,
    details: { saleNumber: sale.number, total: sale.total, paymentMethod },
  });
}

export async function deliver(
  deps: Deps,
  driverId: string,
  orderId: string,
  input: CompleteOrderInput,
): Promise<Delivery> {
  return deps.db.transaction(async (tx) => {
    const row = await lockMine(tx, driverId, orderId);
    assertStatus(row, ["out_for_delivery"]);
    // Preuve de remise : sans le code du client, rien n'est enregistré.
    if (row.deliveryCode && input.code !== row.deliveryCode) {
      throw new AppError(422, "invalid_request", "Code de livraison incorrect");
    }
    await complete(tx, deps, driverId, row, input);
    return toDelivery(await getOrder(tx, orderId));
  });
}

/** Retrait en boutique d'une commande validée. */
export async function collect(
  deps: Deps,
  actor: SessionUser,
  orderId: string,
  input: CompleteOrderInput,
): Promise<Order> {
  return deps.db.transaction(async (tx) => {
    const row = requireRow(await tx.select().from(orders).where(eq(orders.id, orderId)).for("update"));
    if (row.mode !== "pickup") throw new AppError(422, "invalid_request", "Commande à livrer");
    assertStatus(row, ["validated"]);
    await complete(tx, deps, actor.id, row, input);
    return getOrder(tx, orderId);
  });
}
