import { schema } from "@jarvis/db";
import { currentGasPrices, exchangePage, sale } from "@jarvis/shared";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

describe("écarts d'échange à régulariser et prix groupés (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: Awaited<ReturnType<typeof seedGas>>;
  let delta: string;
  let pdg: string;
  let gerant: string;

  const api = (path: string, body?: unknown, token = gerant) =>
    t.app.request(`/api/v1${path}`, body === undefined ? authGet(token) : jsonPost(body, token));
  const sell = async (...returned: string[]) =>
    sale.parse(
      await (
        await api("/sales", {
          customerName: "Awa",
          paymentMethod: "cash",
          lines: returned.map((returnedBrandId) => ({
            kind: "gas",
            brandId: g.alpha.id,
            formatId: g.format.id,
            quantity: 1,
            returnedBrandId,
          })),
        })
      ).json(),
    );
  const exchanges = async (query = "") =>
    exchangePage.parse(await (await api(`/sales/exchanges${query}`)).json());
  const settle = (id: string, body: unknown = {}, token = pdg) =>
    api(`/sales/${id}/settle-packaging`, body, token);
  const margin = async () =>
    ((await (await api("/reports/customers")).json()) as { totals: { margin: number } }).totals.margin;

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    g = await seedGas(t.deps, id, 20);
    const [brand] = await t.deps.db
      .insert(schema.brands)
      .values({ name: "Delta", packagingValue: 0, packagingValueKnown: false })
      .returning();
    delta = brand?.id ?? "";
    [pdg, gerant] = [await t.tokenFor("pdg1"), await t.tokenFor("gerant1")];
  });
  afterAll(() => t.close());

  it("liste paginée, avec le nombre d'écarts en attente", async () => {
    await sell(delta);
    await sell(g.boreal.id);
    await sell(delta);
    expect(await exchanges()).toMatchObject({ total: 3, pendingCount: 2 });
    expect((await exchanges("?limit=2")).items).toHaveLength(2);
    expect((await exchanges("?limit=2&offset=2")).items).toHaveLength(1);
    const waiting = await exchanges("?pending=1");
    expect(waiting.total).toBe(2);
    expect(waiting.items.every((s) => s.lines.some((l) => l.packagingGapPending))).toBe(true);
    const page = (await (await api("/sales?limit=1&offset=1")).json()) as unknown[];
    expect(page).toHaveLength(1);
    expect((await api("/sales/exchanges?offset=-1")).status).toBe(422);
  });

  it("solde un écart saisi par le PDG, répercuté sur la vente, la marge et l'annulation", async () => {
    const before = await margin();
    const pending = await sell(delta);
    const base = (await margin()) - before;
    expect((await settle(pending.id, {}, gerant)).status).toBe(403);
    expect((await settle(pending.id)).status).toBe(409); // valeur toujours inconnue
    const done = sale.parse(await (await settle(pending.id, { packagingGap: -1500 })).json());
    expect(done.lines[0]).toMatchObject({ packagingGap: -1500, packagingGapPending: false });
    expect(await margin()).toBe(before + base - 1500);
    expect((await settle(pending.id, { packagingGap: 1 })).status).toBe(409);
    // L'annulation reprend aussi l'écart soldé : la marge revient à son point de départ.
    await api(`/sales/${pending.id}/cancel`, { justification: "Erreur de saisie" });
    expect(await margin()).toBe(before);
    expect((await settle(pending.id, { packagingGap: 1 })).status).toBe(409);
  });

  it("calcule l'écart quand la valeur devient connue ; refuse une saisie pour plusieurs échanges", async () => {
    const two = await sell(delta, delta);
    expect((await settle(two.id, { packagingGap: 100 })).status).toBe(422);
    await t.deps.db
      .update(schema.brands)
      .set({ packagingValue: 17_000, packagingValueKnown: true })
      .where(eq(schema.brands.id, delta));
    const done = sale.parse(await (await settle(two.id)).json());
    expect(done.lines.map((l) => l.packagingGap)).toEqual([-3000, -3000]);
    expect((await exchanges("?pending=1")).total).toBe(2);
    expect((await settle("3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e")).status).toBe(404);
  });

  it("prix en vigueur de toutes les marques et de tous les formats en une lecture", async () => {
    const prices = currentGasPrices.parse(await (await api("/catalogue/prices/current")).json());
    expect(prices).toHaveLength(4);
    expect(prices.every((p) => p.amount === 6500 && p.formatId === g.format.id)).toBe(true);
  });
});
