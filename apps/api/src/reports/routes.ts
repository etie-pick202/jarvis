import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { businessDate } from "../cash/rules.js";
import { type AppEnv, AppError, parse } from "../http.js";
import { toCsv } from "./compute.js";
import * as svc from "./service.js";
import { toXlsx } from "./xlsx.js";

const day = z.iso.date();

/** Jour demandé (AAAA-MM-JJ), sinon le jour d'activité en cours. */
function dayOf(raw: string | undefined, now: Date): string {
  return raw ? parse(day, raw) : businessDate(now);
}

/** Période la plus longue exportable en une fois, en jours. */
const MAX_DAYS = 92;

/** Jours exportés : `from` et `to` inclus, sinon `date`, sinon le jour d'activité en cours. */
function period(c: Context<AppEnv>): { days: string[]; label: string } {
  const { from, to, date } = c.req.query();
  if (from === undefined && to === undefined) {
    const d = dayOf(date, c.get("deps").now());
    return { days: [d], label: d };
  }
  const start = parse(day, from);
  const end = parse(day, to);
  const days = svc.daysOf(start, end);
  if (days.length === 0 || days.length > MAX_DAYS) {
    throw new AppError(422, "invalid_request", `Période invalide (1 à ${MAX_DAYS} jours)`);
  }
  return { days, label: `${start}_${end}` };
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Envoie un tableau en pièce jointe, au format demandé. */
function file(c: Context<AppEnv>, name: string, format: "csv" | "xlsx", table: svc.Table) {
  const headers = {
    "content-type": format === "csv" ? "text/csv; charset=utf-8" : XLSX_TYPE,
    "content-disposition": `attachment; filename="${name}.${format}"`,
  };
  const body =
    format === "csv"
      ? toCsv(table.headers, table.rows)
      : new Uint8Array(toXlsx(name.slice(0, 31), table.headers, table.rows));
  return c.body(body, 200, headers);
}

/** Les trois exports, en CSV et en Excel. */
const exportRoutes = new Hono<AppEnv>();
for (const format of ["csv", "xlsx"] as const) {
  exportRoutes
    .get(`/sales.${format}`, async (c) => {
      const { days, label } = period(c);
      return file(c, `ventes-${label}`, format, await svc.salesTable(c.get("deps"), days));
    })
    .get(`/cash.${format}`, async (c) => {
      const { days, label } = period(c);
      return file(c, `caisse-${label}`, format, await svc.cashTable(c.get("deps"), days));
    })
    .get(`/stock.${format}`, async (c) => file(c, "stock-gaz", format, await svc.stockTable(c.get("deps"))));
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
  .route("/export", exportRoutes);
