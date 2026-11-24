import { serve } from "@hono/node-server";
import { createDb } from "@jarvis/db";
import { errorBody } from "@jarvis/shared";
import { Hono } from "hono";
import { app as baseApp, createApp } from "./app.js";

const databaseUrl = process.env.DATABASE_URL;
let fetchHandler: (req: Request) => Response | Promise<Response>;
if (databaseUrl) {
  const { db } = createDb(databaseUrl);
  fetchHandler = createApp({
    db,
    now: () => new Date(),
    sessionIdleMinutes: Number(process.env.SESSION_IDLE_MINUTES ?? 30),
  }).fetch;
} else {
  // Sans base (test de fumée de l'image) : seul /health répond, le reste est refusé clairement.
  console.error("DATABASE_URL absente : seules les routes sans base répondent.");
  const degraded = new Hono();
  degraded.route("/", baseApp);
  degraded.all("*", (c) => c.json(errorBody("internal_error", "Base de données non configurée"), 503));
  fetchHandler = degraded.fetch;
}
const port = Number(process.env.PORT ?? 3000);
serve({ fetch: fetchHandler, port }, (info) => {
  console.log(`API JARVIS prête sur le port ${info.port}`);
});
