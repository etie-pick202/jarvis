import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stockOf } from "../stock/ledger.js";
import { addUser, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { createPgTestApp } from "../testing/pg.js";

describe("ventes sur PostgreSQL", () => {
  let t: Awaited<ReturnType<typeof createPgTestApp>>;
  beforeAll(async () => {
    t = await createPgTestApp();
  });
  afterAll(() => t.close());

  it("deux ventes simultanées de la dernière bouteille : une seule passe, jamais de stock négatif", async () => {
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    const g = await seedGas(t.deps, id, 1);
    const token = await t.tokenFor("gerant1");
    const body = {
      customerName: "Awa",
      paymentMethod: "cash",
      lines: [{ kind: "gas", brandId: g.alpha.id, formatId: g.format.id, quantity: 1 }],
    };
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        t.app.request("/api/v1/sales", jsonPost(body, token, { "Idempotency-Key": `cle-concurrente-${n}` })),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    expect(await stockOf(t.deps.db, g.alpha.id, g.format.id, "full")).toBe(0);
  });

  it("la même clé envoyée en parallèle ne crée qu'une vente", async () => {
    const [user] = await t.deps.db.query.users.findMany();
    if (!user) throw new Error("fixture");
    const g = await t.deps.db.query.brands.findFirst({ where: (b, { eq }) => eq(b.name, "Boreal") });
    const format = await t.deps.db.query.formats.findFirst();
    if (!g || !format) throw new Error("fixture");
    const token = await t.tokenFor("gerant1");
    const body = {
      customerName: "Awa",
      paymentMethod: "cash",
      lines: [{ kind: "gas", brandId: g.id, formatId: format.id, quantity: 1 }],
    };
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        t.app.request("/api/v1/sales", jsonPost(body, token, { "Idempotency-Key": "meme-cle-0001" })),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(
      3 - results.filter((r) => r.status === 409).length,
    );
    expect(results.some((r) => r.status === 201)).toBe(true);
    const sales = await t.deps.db.query.sales.findMany({ where: (s, { eq }) => eq(s.customerName, "Awa") });
    expect(sales.filter((s) => s.total === 6800)).toHaveLength(2); // 1 de l'essai précédent + 1 ici
  });
});
