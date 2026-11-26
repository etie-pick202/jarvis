import {
  canalPaymentInput,
  createCanalFormulaInput,
  createCanalSubscriberInput,
  language,
  updateCanalFormulaInput,
  updateCanalSubscriberInput,
} from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { cancelPayment, listPayments, recordPayment } from "./payments.js";
import * as svc from "./service.js";

const uuid = z.uuid();
const day = z.iso.date();
/** Fenêtre des échéances proches, en jours (7 par défaut). */
const within = z.coerce.number().int().min(0).max(90).default(7);

export const canalRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/formulas", requirePermission("canal.read"), async (c) =>
    c.json(await svc.listFormulas(c.get("deps"))),
  )
  .post("/formulas", requirePermission("canal.manage"), async (c) =>
    c.json(
      await svc.createFormula(c.get("deps"), c.get("user").id, await parseJson(c, createCanalFormulaInput)),
      201,
    ),
  )
  .patch("/formulas/:id", requirePermission("canal.manage"), async (c) =>
    c.json(
      await svc.updateFormula(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateCanalFormulaInput),
      ),
    ),
  )
  .get("/subscribers", requirePermission("canal.read"), async (c) =>
    c.json(await svc.searchSubscribers(c.get("deps"), c.req.query("q") ?? "")),
  )
  .get("/subscribers/:id", requirePermission("canal.read"), async (c) =>
    c.json(await svc.getSubscriber(c.get("deps"), parse(uuid, c.req.param("id")))),
  )
  .post("/subscribers", requirePermission("canal.write"), async (c) =>
    c.json(
      await svc.createSubscriber(
        c.get("deps"),
        c.get("user").id,
        await parseJson(c, createCanalSubscriberInput),
      ),
      201,
    ),
  )
  .patch("/subscribers/:id", requirePermission("canal.write"), async (c) =>
    c.json(
      await svc.updateSubscriber(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateCanalSubscriberInput),
      ),
    ),
  )
  .post("/subscribers/:id/payments", requirePermission("canal.write"), async (c) =>
    c.json(
      await recordPayment(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, canalPaymentInput),
      ),
      201,
    ),
  )
  .get("/payments", requirePermission("canal.read"), async (c) => {
    const date = c.req.query("date");
    const subscriberId = c.req.query("subscriberId");
    return c.json(
      await listPayments(c.get("deps"), {
        ...(date ? { day: parse(day, date) } : {}),
        ...(subscriberId ? { subscriberId: parse(uuid, subscriberId) } : {}),
      }),
    );
  })
  .post("/payments/:id/cancel", requirePermission("canal.cancel"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { justification?: unknown };
    return c.json(
      await cancelPayment(c.get("deps"), c.get("user"), parse(uuid, c.req.param("id")), body.justification),
      201,
    );
  })
  .get("/reminders", requirePermission("canal.read"), async (c) =>
    c.json(
      await svc.reminders(
        c.get("deps"),
        parse(within, c.req.query("within")),
        parse(language.default("fr"), c.req.query("lang")),
      ),
    ),
  )
  .get("/due", requirePermission("canal.read"), async (c) =>
    c.json(await svc.dueSubscribers(c.get("deps"), parse(within, c.req.query("within")))),
  );
