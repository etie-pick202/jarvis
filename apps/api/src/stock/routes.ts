import {
  countInput,
  createReceptionInput,
  createSupplierInput,
  setThresholdInput,
  updateSupplierInput,
} from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./service.js";

const uuid = z.uuid();

export const stockRoutes = new Hono<AppEnv>()
  // Sécurité limitée aux préfixes de ce module (monté à la racine de l'API).
  .use("/stock/*", requireAuth, idempotency)
  .use("/suppliers/*", requireAuth, idempotency)
  .use("/receipts/*", requireAuth, idempotency)
  .use("/receptions/*", requireAuth, idempotency)
  .use("/inventory/*", requireAuth, idempotency)
  // Niveaux plein/vide par marque et format (le caissier lit le stock) et alertes de seuil bas
  .get("/stock", requirePermission("stock.read"), async (c) => c.json(await svc.stockLevels(c.get("deps"))))
  .get("/stock/alerts", requirePermission("stock.write"), async (c) =>
    c.json(await svc.stockAlerts(c.get("deps"))),
  )
  .put("/stock/thresholds", requirePermission("inventory.validate"), async (c) =>
    c.json(await svc.setThreshold(c.get("deps"), c.get("user").id, await parseJson(c, setThresholdInput))),
  )
  // Fournisseurs
  .get("/suppliers", requirePermission("stock.write"), async (c) =>
    c.json(await svc.listSuppliers(c.get("deps"))),
  )
  .post("/suppliers", requirePermission("stock.write"), async (c) =>
    c.json(
      await svc.createSupplier(c.get("deps"), c.get("user").id, await parseJson(c, createSupplierInput)),
      201,
    ),
  )
  .patch("/suppliers/:id", requirePermission("stock.write"), async (c) =>
    c.json(
      await svc.updateSupplier(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateSupplierInput),
      ),
    ),
  )
  // Pièces justificatives : envoi du fichier (corps brut), puis réception qui y fait référence
  .post("/receipts", requirePermission("stock.write"), async (c) => {
    const data = Buffer.from(await c.req.arrayBuffer());
    const contentType = c.req.header("content-type") ?? "";
    return c.json(await svc.saveReceipt(c.get("deps"), c.get("user").id, contentType, data), 201);
  })
  .get("/receipts/:id", requirePermission("stock.write"), async (c) => {
    const file = await svc.getReceipt(c.get("deps"), parse(uuid, c.req.param("id")));
    return c.body(new Uint8Array(file.data), 200, { "content-type": file.contentType });
  })
  .post("/receptions", requirePermission("stock.write"), async (c) =>
    c.json(
      await svc.createReception(c.get("deps"), c.get("user").id, await parseJson(c, createReceptionInput)),
      201,
    ),
  )
  .get("/receptions", requirePermission("stock.write"), async (c) => {
    const supplierId = c.req.query("supplierId");
    const brandId = c.req.query("brandId");
    return c.json(
      await svc.listReceptions(c.get("deps"), {
        ...(supplierId ? { supplierId: parse(uuid, supplierId) } : {}),
        ...(brandId ? { brandId: parse(uuid, brandId) } : {}),
      }),
    );
  })
  // Inventaire hebdomadaire, confirmation du soir, validation par le PDG
  .post("/inventory/weekly", requirePermission("stock.write"), async (c) =>
    c.json(
      await svc.recordCount(c.get("deps"), c.get("user").id, "weekly", await parseJson(c, countInput)),
      201,
    ),
  )
  .post("/inventory/evening", requirePermission("stock.write"), async (c) =>
    c.json(
      await svc.recordCount(c.get("deps"), c.get("user").id, "evening", await parseJson(c, countInput)),
      201,
    ),
  )
  .get("/inventory", requirePermission("stock.write"), async (c) =>
    c.json(await svc.listCounts(c.get("deps"), c.req.query("pending") === "1")),
  )
  .post("/inventory/:id/validate", requirePermission("inventory.validate"), async (c) =>
    c.json(await svc.validateCount(c.get("deps"), c.get("user").id, parse(uuid, c.req.param("id")))),
  )
  .post("/inventory/:id/reject", requirePermission("inventory.validate"), async (c) => {
    const { reason } = await parseJson(c, z.object({ reason: z.string().optional() }));
    return c.json(
      await svc.rejectCount(c.get("deps"), c.get("user").id, parse(uuid, c.req.param("id")), reason),
    );
  });
