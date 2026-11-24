import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./service.js";

const uuid = z.uuid();
const justificationBody = z.object({ justification: z.string().optional() });

/** Contrôle et traçabilité : corrections, journal d'audit, notifications du PDG. */
export const controlRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .post("/corrections/stock", requirePermission("sale.cancel"), async (c) =>
    c.json(
      await svc.correctStock(c.get("deps"), c.get("user"), await parseJson(c, svc.stockCorrectionInput)),
      201,
    ),
  )
  .post("/corrections/cash/:entryId", requirePermission("sale.cancel"), async (c) => {
    const body = await parseJson(c, justificationBody);
    return c.json(
      await svc.reverseCashEntry(
        c.get("deps"),
        c.get("user"),
        parse(uuid, c.req.param("entryId")),
        body.justification,
      ),
      201,
    );
  })
  .get("/audit", requirePermission("audit.read"), async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 100) || 100, 500);
    const action = c.req.query("action");
    const entity = c.req.query("entity");
    return c.json(
      await svc.listAudit(c.get("deps"), {
        limit,
        ...(action ? { action } : {}),
        ...(entity ? { entity } : {}),
      }),
    );
  })
  .get("/notifications", requirePermission("inventory.validate"), async (c) =>
    c.json(await svc.listNotifications(c.get("deps"), c.req.query("unread") === "1")),
  )
  .post("/notifications/:id/read", requirePermission("inventory.validate"), async (c) =>
    c.json(await svc.markNotificationRead(c.get("deps"), parse(uuid, c.req.param("id")))),
  );
