import {
  createNeighbourhoodInput,
  setDeliveryFeeCeilingInput,
  updateNeighbourhoodInput,
  updateShopSettingsInput,
} from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { publicCatalogue } from "./catalogue.js";
import * as svc from "./settings.js";

/** Routes sans compte, pour le client. */
export const shopRoutes = new Hono<AppEnv>().get("/catalogue", async (c) =>
  c.json(await publicCatalogue(c.get("deps"))),
);

/** Réglages de la boutique et quartiers, côté gestion. */
export const deliveryRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/settings", requirePermission("delivery.read"), async (c) =>
    c.json(await svc.readSettings(c.get("deps").db)),
  )
  .put("/settings", requirePermission("delivery.manage"), async (c) =>
    c.json(
      await svc.updateSettings(c.get("deps"), c.get("user").id, await parseJson(c, updateShopSettingsInput)),
    ),
  )
  .put("/fee-ceiling", requirePermission("delivery.ceiling"), async (c) => {
    const { ceiling } = await parseJson(c, setDeliveryFeeCeilingInput);
    return c.json(await svc.setFeeCeiling(c.get("deps"), c.get("user").id, ceiling));
  })
  .get("/neighbourhoods", requirePermission("delivery.read"), async (c) =>
    c.json(await svc.listNeighbourhoods(c.get("deps").db)),
  )
  .post("/neighbourhoods", requirePermission("delivery.manage"), async (c) =>
    c.json(
      await svc.createNeighbourhood(
        c.get("deps"),
        c.get("user").id,
        await parseJson(c, createNeighbourhoodInput),
      ),
      201,
    ),
  )
  .patch("/neighbourhoods/:id", requirePermission("delivery.manage"), async (c) =>
    c.json(
      await svc.updateNeighbourhood(
        c.get("deps"),
        c.get("user").id,
        parse(z.uuid(), c.req.param("id")),
        await parseJson(c, updateNeighbourhoodInput),
      ),
    ),
  );
