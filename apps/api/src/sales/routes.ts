import { createSaleInput } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { createSale, getSale, listSales } from "./service.js";

export const salesRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .post("/", requirePermission("sale.create"), async (c) => {
    const input = await parseJson(c, createSaleInput);
    return c.json(await createSale(c.get("deps"), c.get("user").id, input), 201);
  })
  .get("/", requirePermission("sale.read"), async (c) => c.json(await listSales(c.get("deps"))))
  .get("/:id", requirePermission("sale.read"), async (c) =>
    c.json(await getSale(c.get("deps"), parse(z.uuid(), c.req.param("id")))),
  );
