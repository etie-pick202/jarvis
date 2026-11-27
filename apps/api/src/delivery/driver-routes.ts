import { completeOrderInput, deliveryProblemInput } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./fulfilment.js";

const uuid = z.uuid();

/** Mode livreur : la liste du jour et trois actions (Parti, Livré, Problème). */
export const driverRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/", requirePermission("delivery.drive"), async (c) =>
    c.json(await svc.myDeliveries(c.get("deps"), c.get("user").id)),
  )
  .post("/:id/depart", requirePermission("delivery.drive"), async (c) =>
    c.json(await svc.depart(c.get("deps"), c.get("user").id, parse(uuid, c.req.param("id")))),
  )
  .post("/:id/delivered", requirePermission("delivery.drive"), async (c) =>
    c.json(
      await svc.deliver(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, completeOrderInput),
      ),
    ),
  )
  .post("/:id/problem", requirePermission("delivery.drive"), async (c) => {
    const { note } = await parseJson(c, deliveryProblemInput);
    return c.json(
      await svc.reportProblem(c.get("deps"), c.get("user").id, parse(uuid, c.req.param("id")), note),
    );
  });
