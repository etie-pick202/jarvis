import { createOrderInput, orderStatus, setPaymentReferenceInput, validateOrderInput } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./orders.js";

const uuid = z.uuid();
const token = z.string().min(10).max(64);

/** Commande et suivi par le client, sans compte. */
export const publicOrderRoutes = new Hono<AppEnv>()
  .post("/", async (c) =>
    c.json(await svc.placeOrder(c.get("deps"), await parseJson(c, createOrderInput), "online"), 201),
  )
  .get("/:token", async (c) => c.json(await svc.track(c.get("deps"), parse(token, c.req.param("token")))))
  .put("/:token/payment-reference", async (c) => {
    const { paymentReference } = await parseJson(c, setPaymentReferenceInput);
    return c.json(
      await svc.setPaymentReference(c.get("deps"), parse(token, c.req.param("token")), paymentReference),
    );
  });

/** Traitement des commandes par la boutique. */
export const orderRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/", requirePermission("order.read"), async (c) => {
    const status = c.req.query("status");
    return c.json(await svc.listOrders(c.get("deps"), status ? parse(orderStatus, status) : undefined));
  })
  .get("/summary", requirePermission("order.read"), async (c) => c.json(await svc.summary(c.get("deps"))))
  .get("/:id", requirePermission("order.read"), async (c) =>
    c.json(await svc.getOrder(c.get("deps").db, parse(uuid, c.req.param("id")))),
  )
  // Commande reçue par téléphone : même parcours, saisie par le gérant
  .post("/", requirePermission("order.manage"), async (c) =>
    c.json(await svc.placeOrder(c.get("deps"), await parseJson(c, createOrderInput), "phone"), 201),
  )
  .post("/:id/confirm-payment", requirePermission("order.manage"), async (c) =>
    c.json(await svc.confirmPayment(c.get("deps"), c.get("user").id, parse(uuid, c.req.param("id")))),
  )
  .post("/:id/validate", requirePermission("order.manage"), async (c) =>
    c.json(
      await svc.validateOrder(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, validateOrderInput),
      ),
    ),
  )
  .post("/:id/cancel", requirePermission("order.manage"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { justification?: unknown };
    return c.json(
      await svc.cancelOrder(c.get("deps"), c.get("user"), parse(uuid, c.req.param("id")), body.justification),
    );
  });
