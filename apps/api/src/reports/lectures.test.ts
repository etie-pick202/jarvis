import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

type G = Awaited<ReturnType<typeof seedGas>>;

describe("lectures complémentaires (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: G;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let n = 0;
  const post = (path: string, body: unknown, token = gerant) =>
    t.app.request(`/api/v1${path}`, jsonPost(body, token, { "Idempotency-Key": `cle-lecture-${++n}` }));
  const get = (path: string, token = gerant) => t.app.request(`/api/v1${path}`, authGet(token));
  const sell = (brandId: string, returnedBrandId?: string) =>
    post(
      "/sales",
      {
        customerName: "Awa",
        paymentMethod: "cash",
        lines: [{ kind: "gas", brandId, formatId: g.format.id, quantity: 1, returnedBrandId }],
      },
      caissier,
    );

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    g = await seedGas(t.deps, id, 10);
    [pdg, gerant, caissier] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
    ];
  });
  afterAll(() => t.close());

  it("seuil de clôture : 0 par défaut puis la valeur fixée par le PDG", async () => {
    expect(await (await get("/cash/closure-threshold", caissier)).json()).toEqual({ threshold: 0 });
    expect((await get("/cash/closure-threshold", "inconnu")).status).toBe(401);
    await t.app.request("/api/v1/cash/closure-threshold", {
      ...jsonPost({ threshold: 500 }, pdg, { "Idempotency-Key": "cle-seuil-1" }),
      method: "PUT",
    });
    expect(await (await get("/cash/closure-threshold")).json()).toEqual({ threshold: 500 });
  });

  it("caisses : fond du matin = solde d'avant le jour d'activité", async () => {
    await sell(g.alpha.id); // 6 800 en espèces, aujourd'hui
    let rows = (await (await get("/cash/registers")).json()) as {
      id: string;
      opening: number;
      balance: number;
    }[];
    const cash = () => rows.find((r) => r.id === "sales_cash");
    expect(cash()).toMatchObject({ opening: 0, balance: 6800 });
    t.clock.advanceMinutes(24 * 60); // le lendemain, le solde d'hier devient le fond du matin
    rows = (await (await get("/cash/registers")).json()) as typeof rows;
    expect(cash()).toMatchObject({ opening: 6800, balance: 6800 });
  });

  it("prix courant d'un format, avec exception de marque", async () => {
    const res = await get(`/catalogue/prices/${g.format.id}/current`, caissier);
    expect(await res.json()).toMatchObject({ amount: 6500, transportContribution: 300 });
    expect((await get(`/catalogue/prices/${g.format.id}/current?brandId=${g.boreal.id}`)).status).toBe(200);
    const unknown = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
    expect((await get(`/catalogue/prices/${unknown}/current`)).status).toBe(404);
    expect((await get("/catalogue/prices/pas-un-uuid/current")).status).toBe(422);
  });

  it("prix courant : 404 si aucun prix n'est encore en vigueur", async () => {
    const { schema } = await import("@jarvis/db");
    const [fresh] = await t.deps.db
      .insert(schema.formats)
      .values({ label: "6 kg", weightGrams: 6000 })
      .returning();
    expect((await get(`/catalogue/prices/${fresh?.id}/current`)).status).toBe(404);
  });

  it("ventes : filtre par jour et par échange entre marques", async () => {
    await sell(g.cobalt.id, g.boreal.id); // échange (jour suivant)
    await sell(g.cobalt.id, g.cobalt.id); // même marque : pas un échange
    const all = (await (await get("/sales")).json()) as unknown[];
    const exchanges = (await (await get("/sales?type=exchange")).json()) as {
      lines: { returnedBrandId: string | null }[];
    }[];
    expect(all).toHaveLength(3);
    expect(exchanges).toHaveLength(1);
    expect(exchanges[0]?.lines[0]?.returnedBrandId).toBe(g.boreal.id);
    const today = (await (await get("/sales?date=2026-11-25")).json()) as unknown[];
    const yesterday = (await (await get("/sales?date=2026-11-24")).json()) as unknown[];
    expect(today).toHaveLength(2);
    expect(yesterday).toHaveLength(1);
    expect((await (await get("/sales?limit=1")).json()) as unknown[]).toHaveLength(1);
    expect((await get("/sales?type=autre")).status).toBe(422);
  });

  it("tableau de bord : ventes du jour, caisses, stock et alertes", async () => {
    const res = await get("/reports/dashboard?date=2026-11-25", pdg);
    expect(res.status).toBe(200);
    const d = (await res.json()) as {
      day: string;
      sales: { count: number; total: number };
      registers: { id: string; opening: number; balance: number }[];
      stock: { full: number; alerts: unknown[] };
      unreadNotifications: number;
    };
    expect(d.day).toBe("2026-11-25");
    expect(d.sales).toMatchObject({ count: 2, total: 13600 });
    expect(d.registers.find((r) => r.id === "sales_cash")).toMatchObject({ opening: 6800, balance: 20400 });
    expect(d.stock.full).toBe(27);
    expect(Array.isArray(d.stock.alerts)).toBe(true);
    expect(d.unreadNotifications).toBe(0);
    const byDefault = (await (await get("/reports/dashboard", pdg)).json()) as { day: string };
    expect(byDefault.day).toBe("2026-11-25");
    expect((await get("/reports/dashboard", caissier)).status).toBe(403);
  });
});
