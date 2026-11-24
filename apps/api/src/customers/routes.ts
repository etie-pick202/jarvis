import { Hono } from "hono";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import type { AppEnv } from "../http.js";
import { searchCustomers } from "./service.js";

/** Recherche de client dès les premières lettres : GET /customers?q=aw */
export const customerRoutes = new Hono<AppEnv>()
  .use("*", requireAuth)
  .get("/", requirePermission("sale.read"), async (c) =>
    c.json(await searchCustomers(c.get("deps").db, c.req.query("q") ?? "")),
  );
