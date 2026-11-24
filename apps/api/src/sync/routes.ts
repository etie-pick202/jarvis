import { syncBatch } from "@jarvis/shared";
import { Hono } from "hono";
import { requireAuth, requirePermission } from "../auth/middleware.js";
import { type AppEnv, parseJson } from "../http.js";
import { replayBatch } from "./service.js";

/** Rejeu de la file hors ligne : POST /sync/replay { operations: [...] } → un résultat par opération. */
export const syncRoutes = new Hono<AppEnv>()
  .use("*", requireAuth, requirePermission("sync.replay"))
  .post("/replay", async (c) => {
    const { operations } = await parseJson(c, syncBatch);
    return c.json({ results: await replayBatch(c.get("deps"), c.get("user"), operations) });
  });
