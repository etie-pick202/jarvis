import {
  cashRegisterId,
  closeRegisterInput,
  createExpenseInput,
  createTransferInput,
  setClosureThresholdInput,
  setRegisterActiveInput,
} from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parse, parseJson } from "../http.js";
import { idempotency } from "../idempotency.js";
import * as svc from "./service.js";

const day = z.iso.date();

export const cashRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, idempotency)
  .get("/registers", requirePermission("cash.read"), async (c) =>
    c.json(await svc.listRegisters(c.get("deps"))),
  )
  .patch("/registers/:id", requirePermission("cash.manage"), async (c) => {
    const { active } = await parseJson(c, setRegisterActiveInput);
    return c.json(
      await svc.setRegisterActive(
        c.get("deps"),
        c.get("user").id,
        parse(cashRegisterId, c.req.param("id")),
        active,
      ),
    );
  })
  .get("/registers/:id/entries", requirePermission("cash.read"), async (c) => {
    const date = c.req.query("date");
    return c.json(
      await svc.listEntries(
        c.get("deps"),
        parse(cashRegisterId, c.req.param("id")),
        date ? parse(day, date) : undefined,
      ),
    );
  })
  .post("/expenses", requirePermission("cash.write"), async (c) =>
    c.json(
      await svc.createExpense(c.get("deps"), c.get("user").id, await parseJson(c, createExpenseInput)),
      201,
    ),
  )
  .post("/transfers", requirePermission("cash.write"), async (c) =>
    c.json(
      await svc.createTransfer(c.get("deps"), c.get("user").id, await parseJson(c, createTransferInput)),
      201,
    ),
  )
  .post("/closures", requirePermission("cash.close"), async (c) =>
    c.json(
      await svc.closeRegister(c.get("deps"), c.get("user").id, await parseJson(c, closeRegisterInput)),
      201,
    ),
  )
  .get("/closures", requirePermission("cash.read"), async (c) => {
    const date = c.req.query("date");
    return c.json(await svc.listClosures(c.get("deps"), date ? parse(day, date) : undefined));
  })
  .put("/closure-threshold", requirePermission("cash.manage"), async (c) => {
    const { threshold } = await parseJson(c, setClosureThresholdInput);
    return c.json(await svc.setClosureThreshold(c.get("deps"), c.get("user").id, threshold));
  });
