import { createSaleInput, settlePackagingInput } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { cancelSale } from "./cancel.js";
import { createSale, getSale, listSales } from "./service.js";
import { exchangePage, settlePackaging } from "./settlements.js";

export const salesRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .post("/", requirePermission("sale.create"), async (c) => {
    const input = await parseJson(c, createSaleInput);
    return c.json(await createSale(c.get("deps"), c.get("user").id, input), 201);
  })
  .get("/", requirePermission("sale.read"), async (c) => {
    const query = parse(
      z.object({
        date: z.iso.date().optional(),
        type: z.enum(["exchange"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      }),
      c.req.query(),
    );
    return c.json(
      await listSales(c.get("deps"), {
        ...(query.limit ? { limit: query.limit } : {}),
        ...(query.offset ? { offset: query.offset } : {}),
        ...(query.date ? { day: query.date } : {}),
        exchangeOnly: query.type === "exchange",
      }),
    );
  })
  .get("/exchanges", requirePermission("sale.read"), async (c) => {
    const query = parse(
      z.object({
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0),
        pending: z.enum(["0", "1"]).default("0"),
      }),
      c.req.query(),
    );
    return c.json(
      await exchangePage(c.get("deps"), {
        limit: query.limit,
        offset: query.offset,
        pendingOnly: query.pending === "1",
      }),
    );
  })
  .post("/:id/settle-packaging", requirePermission("sale.settle"), async (c) =>
    c.json(
      await settlePackaging(
        c.get("deps"),
        c.get("user"),
        parse(z.uuid(), c.req.param("id")),
        await parseJson(c, settlePackagingInput),
      ),
    ),
  )
  .post("/:id/cancel", requirePermission("sale.cancel"), async (c) => {
    const body = await parseJson(c, z.object({ justification: z.string().optional() }));
    const id = parse(z.uuid(), c.req.param("id"));
    return c.json(await cancelSale(c.get("deps"), c.get("user"), id, body.justification), 201);
  })
  .get("/:id", requirePermission("sale.read"), async (c) =>
    c.json(await getSale(c.get("deps"), parse(z.uuid(), c.req.param("id")))),
  );
