import { commissionSettings, moneyOperationInput } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./service.js";

export const moneyRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/float", requirePermission("money.read"), async (c) => c.json(await svc.floats(c.get("deps"))))
  .get("/commissions", requirePermission("money.read"), async (c) =>
    c.json(await svc.commissions(c.get("deps"))),
  )
  .put("/commissions", requirePermission("money.manage"), async (c) =>
    c.json(await svc.setCommissions(c.get("deps"), c.get("user").id, await parseJson(c, commissionSettings))),
  )
  .get("/operations", requirePermission("money.read"), async (c) => {
    const date = c.req.query("date");
    return c.json(await svc.listOperations(c.get("deps"), date ? parse(z.iso.date(), date) : undefined));
  })
  .post("/operations", requirePermission("money.write"), async (c) =>
    c.json(
      await svc.recordOperation(c.get("deps"), c.get("user").id, await parseJson(c, moneyOperationInput)),
      201,
    ),
  )
  .post("/operations/:id/cancel", requirePermission("money.write"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { justification?: unknown };
    return c.json(
      await svc.cancelOperation(
        c.get("deps"),
        c.get("user"),
        parse(z.uuid(), c.req.param("id")),
        body.justification,
      ),
      201,
    );
  });
