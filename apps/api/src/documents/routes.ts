import { emailReportsInput, language } from "@jarvis/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { businessDate } from "../cash/rules.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import { emailReports, emailStatus } from "./email.js";
import { toPdf } from "./pdf.js";
import * as svc from "./service.js";

const uuid = z.uuid();

const pdf = (c: Context, name: string, bytes: Uint8Array) =>
  c.body(new Uint8Array(bytes), 200, {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${name}.pdf"`,
  });

const receiptOf = (c: Context<AppEnv>) =>
  svc.saleReceipt(
    c.get("deps"),
    parse(uuid, c.req.param("id")),
    parse(language.default("fr"), c.req.query("lang")),
  );

/** Reçus et rapports à partager (WhatsApp, e-mail). */
export const documentRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/reports/email", requirePermission("report.read"), async (c) =>
    c.json(await emailStatus(c.get("deps"))),
  )
  .post("/reports/email", requirePermission("report.read"), async (c) =>
    c.json(await emailReports(c.get("deps"), c.get("user").id, await parseJson(c, emailReportsInput))),
  )
  .get("/sales/:id/receipt", requirePermission("sale.read"), async (c) => c.json(await receiptOf(c)))
  .get("/sales/:id/receipt.pdf", requirePermission("sale.read"), async (c) => {
    const receipt = await receiptOf(c);
    return pdf(c, `recu-${receipt.number}`, toPdf(receipt.lines));
  });

for (const name of ["sales", "cash", "stock", "x"] as const) {
  documentRoutes.get(`/reports/${name}.pdf`, requirePermission("report.read"), async (c) => {
    const deps = c.get("deps");
    const raw = c.req.query("date");
    const day = raw ? parse(z.iso.date(), raw) : businessDate(deps.now());
    const lines = await svc.reportLines(deps, name, day);
    return pdf(c, `${name}-${day}`, toPdf(lines, { landscape: true }));
  });
}
