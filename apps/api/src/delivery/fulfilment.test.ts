import { schema } from "@jarvis/db";
import { deliveries, delivery, order, placedOrder, trackedOrder } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

let n = 0;
const ref = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("tournée du livreur et remise (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: Awaited<ReturnType<typeof seedGas>>;
  let articleId: string;
  let driverId: string;
  let gerant: string;
  let livreur: string;
  let autre: string;

  const api = (path: string, body?: unknown, token = gerant) =>
    t.app.request(`/api/v1${path}`, body === undefined ? authGet(token) : jsonPost(body, token));
  const json = async (path: string, body?: unknown, token?: string) => (await api(path, body, token)).json();
  const gas = (quantity = 1) => ({ kind: "gas", brandId: g.alpha.id, formatId: g.format.id, quantity });

  /** Passe une commande, la valide et, sauf retrait, la confie au livreur. */
  async function ready(extra: Record<string, unknown> = {}) {
    const placed = placedOrder.parse(
      await json("/shop/orders", {
        clientRef: ref(),
        customerName: "Awa",
        phone: `69${String(n).padStart(7, "0")}`,
        mode: "delivery",
        neighbourhoodName: "Akwa",
        paymentMethod: "cash",
        lines: [gas()],
        ...extra,
      }),
    );
    const list = (await json("/orders")) as { id: string; number: string }[];
    const id = list.find((o) => o.number === placed.number)?.id ?? "";
    expect((await api(`/orders/${id}/validate`, {})).status).toBe(200);
    if (extra.mode !== "pickup") await api(`/orders/${id}/assign`, { driverId });
    return { id, token: placed.trackingToken, total: placed.total, code: placed.deliveryCode ?? "" };
  }
  const balance = async () => {
    const rows = (await json("/cash/registers")) as { id: string; balance: number }[];
    return rows.find((r) => r.id === "sales_cash")?.balance ?? 0;
  };
  const stock = async (brandId: string) => {
    const rows = (await json("/stock")) as { brandId: string; full: number; empty: number }[];
    return rows.find((r) => r.brandId === brandId);
  };

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    driverId = await addUser(t.deps, "livreur1", ["livreur"]);
    await addUser(t.deps, "livreur2", ["livreur"]);
    g = await seedGas(t.deps, id, 10);
    const [article] = await t.deps.db
      .insert(schema.articles)
      .values({ name: "Tuyau", price: 1500, trackStock: true, stockQty: 5 })
      .returning();
    articleId = article?.id ?? "";
    [gerant, livreur, autre] = [
      await t.tokenFor("gerant1"),
      await t.tokenFor("livreur1"),
      await t.tokenFor("livreur2"),
    ];
  });
  afterAll(() => t.close());

  it("départ puis livraison : vente, stock, vide récupéré et caisse, aux prix de la commande", async () => {
    const cmd = await ready({ lines: [gas(2), { kind: "article", articleId, quantity: 1 }] });
    expect(cmd.total).toBe(2 * 7200 + 1500);
    // Un prix qui change après la commande ne s'applique pas à elle.
    await t.deps.db.update(schema.articles).set({ price: 9999 });
    const list = deliveries.parse(await json("/deliveries", undefined, livreur));
    expect(list.map((d) => d.status)).toEqual(["validated"]);
    expect((await api(`/deliveries/${cmd.id}/delivered`, {}, livreur)).status).toBe(409);
    expect((await api(`/deliveries/${cmd.id}/depart`, {}, autre)).status).toBe(404);
    expect((await api(`/deliveries/${cmd.id}/depart`, {}, livreur)).status).toBe(200);
    const status = await (await t.app.request(`/api/v1/shop/orders/${cmd.token}`)).json();
    expect(trackedOrder.parse(status).status).toBe("out_for_delivery");

    expect(cmd.code).toMatch(/^\d{4}$/);
    const wrong = cmd.code === "0000" ? "1111" : "0000";
    expect((await api(`/deliveries/${cmd.id}/delivered`, {}, livreur)).status).toBe(422);
    expect((await api(`/deliveries/${cmd.id}/delivered`, { code: wrong }, livreur)).status).toBe(422);
    const onArticle = { code: cmd.code, returnedEmpties: [{ line: 1, returnedBrandId: g.boreal.id }] };
    expect((await api(`/deliveries/${cmd.id}/delivered`, onArticle, livreur)).status).toBe(422);
    const body = { code: cmd.code, returnedEmpties: [{ line: 0, returnedBrandId: g.boreal.id }] };
    const done = delivery.parse(await json(`/deliveries/${cmd.id}/delivered`, body, livreur));
    expect(done.status).toBe("delivered");
    expect(await balance()).toBe(cmd.total);
    expect(await stock(g.alpha.id)).toMatchObject({ full: 8, empty: 0 });
    expect(await stock(g.boreal.id)).toMatchObject({ empty: 2 });
    const seen = order.parse(await json(`/orders/${cmd.id}`));
    expect(seen.saleId).not.toBeNull();
    const sale = (await json(`/sales/${seen.saleId}`)) as { total: number };
    expect(sale.total).toBe(cmd.total);
    expect((await api(`/deliveries/${cmd.id}/delivered`, {}, livreur)).status).toBe(409);
  });

  it("problème signalé puis nouvelle tentative ; mobile non confirmé refusé, sauf en espèces", async () => {
    const cmd = await ready({ paymentMethod: "momo", paymentReference: "MM-1" });
    await api(`/deliveries/${cmd.id}/depart`, {}, livreur);
    expect((await api(`/deliveries/${cmd.id}/problem`, { note: "" }, livreur)).status).toBe(422);
    const failed = delivery.parse(
      await json(`/deliveries/${cmd.id}/problem`, { note: "Client absent" }, livreur),
    );
    expect(failed).toMatchObject({ status: "problem", problemNote: "Client absent" });
    expect((await api(`/deliveries/${cmd.id}/depart`, {}, livreur)).status).toBe(200);
    const before = await balance();
    const code = { code: cmd.code };
    expect((await api(`/deliveries/${cmd.id}/delivered`, code, livreur)).status).toBe(409);
    expect(order.parse(await json(`/orders/${cmd.id}`)).status).toBe("out_for_delivery");
    const inCash = { ...code, paymentMethod: "cash" };
    expect((await api(`/deliveries/${cmd.id}/delivered`, inCash, livreur)).status).toBe(200);
    expect(await balance()).toBe(before + cmd.total);
  });

  it("affectation réservée aux livraisons validées et au profil livreur ; retrait en boutique", async () => {
    const list = (await json("/orders/drivers")) as { id: string }[];
    expect(list.map((d) => d.id)).toContain(driverId);
    const pickup = await ready({ mode: "pickup", neighbourhoodName: undefined });
    expect((await api(`/orders/${pickup.id}/assign`, { driverId })).status).toBe(422);
    expect((await api(`/orders/${pickup.id}/assign`, { driverId: UNKNOWN })).status).toBe(422);
    const collected = order.parse(await json(`/orders/${pickup.id}/collect`, {}));
    expect(collected.status).toBe("delivered");
    expect((await api(`/orders/${pickup.id}/collect`, {})).status).toBe(409);
    const delivering = await ready();
    expect((await api(`/orders/${delivering.id}/collect`, {})).status).toBe(422);
    expect((await api("/deliveries", undefined, gerant)).status).toBe(200);
    const today = deliveries.parse(await json("/deliveries", undefined, livreur));
    expect(today.filter((d) => d.status === "delivered")).toHaveLength(2);
  });
});
