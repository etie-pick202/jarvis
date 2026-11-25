import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { businessDate } from "../cash/rules.js";
import { type AppEnv, parse } from "../http.js";
import * as svc from "./service.js";

const day = z.iso.date();

/** Jour demandé (AAAA-MM-JJ), sinon le jour d'activité en cours. */
function dayOf(raw: string | undefined, now: Date): string {
  return raw ? parse(day, raw) : businessDate(now);
}

function csv(
  c: { body: (data: string, status: 200, headers: Record<string, string>) => Response },
  name: string,
  data: string,
) {
  return c.body(data, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${name}"`,
  });
}

export const reportRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, requirePermission("report.read"))
  .get("/dashboard", async (c) => {
    const deps = c.get("deps");
    return c.json(await svc.dashboard(deps, dayOf(c.req.query("date"), deps.now())));
  })
  .get("/customers", async (c) => {
    const deps = c.get("deps");
    return c.json(await svc.customerStats(deps, dayOf(c.req.query("date"), deps.now())));
  })
  .get("/cash-journal", async (c) => {
    const deps = c.get("deps");
    return c.json(await svc.cashJournal(deps, dayOf(c.req.query("date"), deps.now())));
  })
  .get("/x", async (c) => {
    const deps = c.get("deps");
    return c.json(await svc.xReport(deps, dayOf(c.req.query("date"), deps.now())));
  })
  .get("/gas-situation", async (c) => c.json(await svc.gasSituation(c.get("deps"))))
  .get("/export/sales.csv", async (c) => {
    const deps = c.get("deps");
    const d = dayOf(c.req.query("date"), deps.now());
    return csv(c, `ventes-${d}.csv`, await svc.salesCsv(deps, d));
  })
  .get("/export/cash.csv", async (c) => {
    const deps = c.get("deps");
    const d = dayOf(c.req.query("date"), deps.now());
    return csv(c, `caisse-${d}.csv`, await svc.cashCsv(deps, d));
  })
  .get("/export/stock.csv", async (c) => csv(c, "stock-gaz.csv", await svc.stockCsv(c.get("deps"))));
