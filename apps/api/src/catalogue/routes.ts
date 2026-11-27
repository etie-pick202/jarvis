import {
  adjustArticleInput,
  createArticleInput,
  createBrandInput,
  createFormatInput,
  restockArticleInput,
  setGasPriceInput,
  updateArticleInput,
  updateBrandInput,
  updateFormatInput,
} from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { requireJustification } from "../sales/cancel.js";
import { adjustArticle, listArticleMoves, restockArticle } from "./article-stock.js";
import * as svc from "./service.js";

const uuid = z.uuid();

export const catalogueRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  // Lecture : marques, formats, prix en vigueur
  .get("/brands", requirePermission("catalog.reference.read"), async (c) =>
    c.json(await svc.listBrands(c.get("deps"))),
  )
  .get("/formats", requirePermission("catalog.reference.read"), async (c) =>
    c.json(await svc.listFormats(c.get("deps"))),
  )
  .get("/prices/current", requirePermission("catalog.gas.read"), async (c) =>
    c.json(await svc.currentPrices(c.get("deps"))),
  )
  .get("/prices/:formatId/current", requirePermission("catalog.gas.read"), async (c) => {
    const brandId = c.req.query("brandId");
    return c.json(
      await svc.currentPrice(
        c.get("deps"),
        parse(uuid, c.req.param("formatId")),
        brandId ? parse(uuid, brandId) : null,
      ),
    );
  })
  .get("/prices/:formatId/history", requirePermission("catalog.gas.read"), async (c) =>
    c.json(await svc.gasPriceHistory(c.get("deps"), parse(uuid, c.req.param("formatId")))),
  )
  // Écriture réservée au PDG (marques, formats, prix du gaz)
  .post("/brands", requirePermission("catalog.gas.write"), async (c) =>
    c.json(await svc.createBrand(c.get("deps"), c.get("user").id, await parseJson(c, createBrandInput)), 201),
  )
  .patch("/brands/:id", requirePermission("catalog.gas.write"), async (c) =>
    c.json(
      await svc.updateBrand(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateBrandInput),
      ),
    ),
  )
  .post("/formats", requirePermission("catalog.gas.write"), async (c) =>
    c.json(
      await svc.createFormat(c.get("deps"), c.get("user").id, await parseJson(c, createFormatInput)),
      201,
    ),
  )
  .patch("/formats/:id", requirePermission("catalog.gas.write"), async (c) =>
    c.json(
      await svc.updateFormat(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateFormatInput),
      ),
    ),
  )
  .put("/prices", requirePermission("catalog.gas.write"), async (c) =>
    c.json(await svc.setGasPrice(c.get("deps"), c.get("user").id, await parseJson(c, setGasPriceInput)), 201),
  )
  // Articles libres : le gérant (et le PDG) gèrent les leurs
  .get("/articles", requirePermission("sale.read"), async (c) =>
    c.json(await svc.listArticles(c.get("deps"))),
  )
  .get("/articles/:id/prices", requirePermission("sale.read"), async (c) =>
    c.json(await svc.articlePrices(c.get("deps"), parse(uuid, c.req.param("id")))),
  )
  .get("/articles/:id/moves", requirePermission("sale.read"), async (c) =>
    c.json(await listArticleMoves(c.get("deps"), parse(uuid, c.req.param("id")))),
  )
  .post("/articles/:id/adjust", requirePermission("catalog.article.write"), async (c) => {
    const input = await parseJson(c, adjustArticleInput);
    return c.json(
      await adjustArticle(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        input,
        requireJustification(input.justification),
      ),
    );
  })
  .post("/articles/:id/restock", requirePermission("catalog.article.write"), async (c) =>
    c.json(
      await restockArticle(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, restockArticleInput),
      ),
    ),
  )
  .post("/articles", requirePermission("catalog.article.write"), async (c) =>
    c.json(
      await svc.createArticle(c.get("deps"), c.get("user").id, await parseJson(c, createArticleInput)),
      201,
    ),
  )
  .patch("/articles/:id", requirePermission("catalog.article.write"), async (c) =>
    c.json(
      await svc.updateArticle(
        c.get("deps"),
        c.get("user").id,
        parse(uuid, c.req.param("id")),
        await parseJson(c, updateArticleInput),
      ),
    ),
  );
