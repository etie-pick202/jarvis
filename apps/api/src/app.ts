import { deliveryTotal, pickupTotal } from "@jarvis/shared";
import { Hono } from "hono";
import { z } from "zod";

const quoteQuery = z.object({
  bottles: z.coerce.number().int().min(1),
  mode: z.enum(["pickup", "delivery"]).default("pickup"),
});

export const app = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .get("/api/v1/quote", (c) => {
    const parsed = quoteQuery.safeParse(c.req.query());
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_request", message: "Paramètres invalides" } }, 422);
    }
    const { bottles, mode } = parsed.data;
    const total = mode === "pickup" ? pickupTotal(bottles) : deliveryTotal(bottles);
    return c.json({ bottles, mode, total });
  });

export type AppType = typeof app;
