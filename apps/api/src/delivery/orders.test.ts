import { schema } from "@jarvis/db";
import { order, orders, placedOrder, publicCatalogue, trackedOrder } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

let n = 0;
const ref = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;

describe("commandes sans compte (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: Awaited<ReturnType<typeof seedGas>>;
  let articleId: string;
  let gerant: string;
  let caissier: string;
  let livreur: string;

  const api = (path: string, body?: unknown, token?: string, method = "POST") =>
    t.app.request(
      `/api/v1${path}`,
      body === undefined ? authGet(token ?? gerant) : { ...jsonPost(body, token), method },
    );
  const gas = (brandId: string, quantity = 1) => ({
    kind: "gas",
    brandId,
    formatId: g.format.id,
    quantity,
  });
  const orderBody = (extra: Record<string, unknown> = {}) => ({
    clientRef: ref(),
    customerName: "Awa",
    phone: `6900000${n}`,
    mode: "delivery",
    neighbourhoodName: "Bonamoussadi",
    paymentMethod: "cash",
    lines: [gas(g.alpha.id)],
    ...extra,
  });
  const place = async (extra: Record<string, unknown> = {}) =>
    placedOrder.parse(await (await api("/shop/orders", orderBody(extra))).json());
  const staffList = async (status = "pending") =>
    orders.parse(await (await api(`/orders?status=${status}`)).json());
  const find = async (number: string) => {
    const found = orders.parse(await (await api("/orders")).json()).find((o) => o.number === number);
    if (!found) throw new Error("commande absente");
    return found;
  };

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    g = await seedGas(t.deps, id, 3);
    const [article] = await t.deps.db
      .insert(schema.articles)
      .values({ name: "Tuyau", price: 1500, trackStock: true, stockQty: 1 })
      .returning();
    articleId = article?.id ?? "";
    [gerant, caissier, livreur] = [
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
      await t.tokenFor("livreur1"),
    ];
  });
  afterAll(() => t.close());

  it("retrait à 6 800, livraison à 7 200 ; suivi par le lien ; renvoi sans doublon", async () => {
    const pickup = await place({ mode: "pickup", neighbourhoodName: undefined });
    expect(pickup).toMatchObject({ total: 6800, status: "pending", mode: "pickup" });
    const body = orderBody();
    const first = placedOrder.parse(await (await api("/shop/orders", body)).json());
    expect(first.total).toBe(7200);
    const again = placedOrder.parse(await (await api("/shop/orders", body)).json());
    expect(again.trackingToken).toBe(first.trackingToken);
    const res = await t.app.request(`/api/v1/shop/orders/${first.trackingToken}`);
    const seen = trackedOrder.parse(await res.json());
    expect(seen).toMatchObject({ number: first.number, paymentConfirmed: false });
    expect((await t.app.request("/api/v1/shop/orders/jeton-inconnu-123")).status).toBe(404);
    expect((await (await api("/orders/summary")).json()) as unknown).toEqual({ pending: 2, toDeliver: 0 });
  });

  it("refuse : quartier manquant, rupture, produit inconnu, minimum non atteint, trop de commandes", async () => {
    expect((await api("/shop/orders", orderBody({ neighbourhoodName: undefined }))).status).toBe(422);
    expect((await api("/shop/orders", orderBody({ lines: [gas(g.alpha.id, 4)] }))).status).toBe(409);
    const twice = orderBody({ lines: [gas(g.alpha.id, 2), gas(g.alpha.id, 2)] });
    expect((await api("/shop/orders", twice)).status).toBe(409);
    const unknown = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
    expect((await api("/shop/orders", orderBody({ lines: [gas(unknown)] }))).status).toBe(422);
    expect((await api("/shop/orders", orderBody({ neighbourhoodId: unknown }))).status).toBe(422);
    const missing = [{ kind: "article", articleId: unknown, quantity: 1 }];
    expect((await api("/shop/orders", orderBody({ lines: missing }))).status).toBe(404);
    const tooMany = [{ kind: "article", articleId, quantity: 2 }];
    expect((await api("/shop/orders", orderBody({ lines: tooMany }))).status).toBe(409);

    await api("/delivery/settings", { minimumOrder: 10_000 }, gerant, "PUT");
    expect((await api("/shop/orders", orderBody())).status).toBe(422);
    expect((await api("/orders", orderBody(), gerant)).status).toBe(201); // par téléphone : pas de minimum
    await api("/delivery/settings", { minimumOrder: 0 }, gerant, "PUT");

    for (let i = 0; i < 3; i++) await place({ phone: "677000000" });
    expect((await api("/shop/orders", orderBody({ phone: "677000000" }))).status).toBe(409);
  });

  it("paiement mobile : référence du client, confirmation par le gérant", async () => {
    const cmd = await place({ paymentMethod: "momo" });
    const { id } = await find(cmd.number);
    expect((await api(`/orders/${id}/confirm-payment`, {}, gerant)).status).toBe(409);
    const reference = { paymentReference: "MM-778899" };
    const path = `/shop/orders/${cmd.trackingToken}/payment-reference`;
    expect((await api(path, reference, undefined, "PUT")).status).toBe(200);
    expect((await api(`/orders/${id}/confirm-payment`, {}, caissier)).status).toBe(403);
    const confirmed = order.parse(await (await api(`/orders/${id}/confirm-payment`, {}, gerant)).json());
    expect(confirmed.paymentConfirmedAt).not.toBeNull();
    expect((await api(`/orders/${id}/confirm-payment`, {}, gerant)).status).toBe(409);
    expect((await api(path, reference, undefined, "PUT")).status).toBe(409);
    const cash = await find((await place()).number);
    expect((await api(`/orders/${cash.id}/confirm-payment`, {}, gerant)).status).toBe(422);
  });

  it("validation : stock réservé, frais mémorisés pour le quartier ; annulation qui libère", async () => {
    const first = await find((await place({ lines: [gas(g.boreal.id, 2)] })).number);
    const second = await find((await place({ lines: [gas(g.boreal.id, 2)] })).number);
    expect((await api(`/orders/${first.id}/validate`, {}, livreur)).status).toBe(403);
    const validated = order.parse(
      await (await api(`/orders/${first.id}/validate`, { deliveryFeePerBottle: 600 }, gerant)).json(),
    );
    expect(validated).toMatchObject({ status: "validated", deliveryFeePerBottle: 600, total: 14_800 });
    expect((await api(`/orders/${first.id}/validate`, {}, gerant)).status).toBe(409);
    // 3 pleins, 2 réservés : la seconde ne passe plus, au comptoir il n'en reste qu'un.
    expect((await api(`/orders/${second.id}/validate`, {}, gerant)).status).toBe(409);
    const counter = (quantity: number) =>
      api(
        "/sales",
        { customerName: "Paul", paymentMethod: "cash", lines: [gas(g.boreal.id, quantity)] },
        caissier,
      );
    expect((await counter(2)).status).toBe(409);
    // Le montant retenu pour le quartier est proposé ensuite.
    expect((await place({ lines: [gas(g.cobalt.id)] })).total).toBe(7400);

    const cancel = (justification?: string) => api(`/orders/${first.id}/cancel`, { justification }, gerant);
    expect((await cancel()).status).toBe(422);
    expect((await cancel("Client injoignable")).status).toBe(200);
    expect((await cancel("Client injoignable")).status).toBe(409);
    expect((await counter(2)).status).toBe(201);
    expect((await staffList("cancelled")).map((o) => o.number)).toEqual([first.number]);
  });

  it("vitrine : un produit entièrement réservé est indisponible ; frais refusés au retrait et au-delà du plafond", async () => {
    const cmd = await find(
      (
        await place({
          mode: "pickup",
          neighbourhoodName: undefined,
          lines: [{ kind: "article", articleId, quantity: 1 }],
        })
      ).number,
    );
    expect((await api(`/orders/${cmd.id}/validate`, { deliveryFeePerBottle: 500 }, gerant)).status).toBe(422);
    expect((await api(`/orders/${cmd.id}/validate`, {}, gerant)).status).toBe(200);
    const shop = publicCatalogue.parse(await (await t.app.request("/api/v1/shop/catalogue")).json());
    expect(shop.articles.find((a) => a.id === articleId)?.available).toBe(false);
    const delivery = await find((await place({ lines: [gas(g.cobalt.id)] })).number);
    await t.deps.db.insert(schema.settings).values({ key: "delivery_fee_ceiling", value: "700" });
    const raised = { deliveryFeePerBottle: 900 };
    expect((await api(`/orders/${delivery.id}/validate`, raised, gerant)).status).toBe(422);
    expect((await api(`/orders/${delivery.id}`)).status).toBe(200);
  });
});
