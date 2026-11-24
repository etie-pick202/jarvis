import { deliveryTotal, errorBody, pickupTotal } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";
import { authRoutes } from "./auth/routes.js";
import { cashRoutes } from "./cash/routes.js";
import { catalogueRoutes } from "./catalogue/routes.js";
import { controlRoutes } from "./control/routes.js";
import { customerRoutes } from "./customers/routes.js";
import { type AppEnv, type Deps, errorResponse, withDeps } from "./http.js";
import { reportRoutes } from "./reports/routes.js";
import { salesRoutes } from "./sales/routes.js";
import { stockRoutes } from "./stock/routes.js";
import { syncRoutes } from "./sync/routes.js";

const quoteQuery = z.object({
  bottles: z.coerce.number().int().min(1),
  mode: z.enum(["pickup", "delivery"]).default("pickup"),
});

/** Routes sans base de données : santé et devis. */
export const app = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/api/v1/quote", (c) => {
    const parsed = quoteQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json(errorBody("invalid_request", "Paramètres invalides"), 422);
    }
    const { bottles, mode } = parsed.data;
    const total = mode === "pickup" ? pickupTotal(bottles) : deliveryTotal(bottles);
    return c.json({ bottles, mode, total });
  });

/** Application complète : routes de base + modules métier, avec leurs dépendances injectées. */
export function createApp(deps: Deps) {
  const api = new Hono<AppEnv>();
  api.use("*", withDeps(deps));
  api.route("/auth", authRoutes);
  api.route("/cash", cashRoutes);
  api.route("/catalogue", catalogueRoutes);
  api.route("/control", controlRoutes);
  api.route("/customers", customerRoutes);
  api.route("/reports", reportRoutes);
  api.route("/sales", salesRoutes);
  api.route("/sync", syncRoutes);
  api.route("/", stockRoutes);

  const root = new Hono<AppEnv>();
  root.route("/", app);
  root.route("/api/v1", api);
  root.onError((err, c) => errorResponse(c, err));
  root.notFound((c) => c.json(errorBody("not_found", "Route inconnue"), 404));
  return root;
}

export type AppType = typeof app;
