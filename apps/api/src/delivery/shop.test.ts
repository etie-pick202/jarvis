import { schema } from "@jarvis/db";
import { neighbourhoods, publicCatalogue, shopSettings } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

describe("vitrine publique, réglages et quartiers (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: Awaited<ReturnType<typeof seedGas>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;

  const send = (path: string, body: unknown, token = gerant, method = "POST") =>
    t.app.request(`/api/v1/delivery${path}`, { ...jsonPost(body, token), method });
  const get = async (path: string, token = gerant) =>
    (await t.app.request(`/api/v1/delivery${path}`, authGet(token))).json();
  const catalogue = async () => {
    const res = await t.app.request("/api/v1/shop/catalogue");
    expect(res.status).toBe(200);
    return publicCatalogue.parse(await res.json());
  };

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    g = await seedGas(t.deps, id, 2);
    await t.deps.db.insert(schema.brands).values({ name: "Vide", packagingValue: 1000 });
    await t.deps.db.insert(schema.articles).values([
      { name: "Détendeur", price: 3500, purchaseCost: 2000 },
      { name: "Tuyau", price: 1500, trackStock: true, stockQty: 0 },
    ]);
    [pdg, gerant, caissier] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
    ];
  });
  afterAll(() => t.close());

  it("sans compte : prix, disponibilité, sans coût ni quantité", async () => {
    const shop = await catalogue();
    expect(shop.gas.find((p) => p.brandId === g.alpha.id)).toMatchObject({ price: 6800, available: true });
    expect(shop.gas.find((p) => p.brandName === "Vide")).toMatchObject({ available: false });
    expect(shop.articles.map((a) => [a.name, a.available])).toEqual([
      ["Détendeur", true],
      ["Tuyau", false],
    ]);
    expect(shop.shop).toMatchObject({ minimumOrder: 0, deliveryFeePerBottle: 400 });
    const raw = JSON.stringify(await (await t.app.request("/api/v1/shop/catalogue")).json());
    expect(raw).not.toMatch(/purchaseCost|stockQty|packagingValue|Ceiling/);
  });

  it("réglages : horaires et contact par le gérant, plafond par le PDG", async () => {
    const values = { openingHours: "8 h à 19 h", phone: "690000000", minimumOrder: 5000 };
    expect((await send("/settings", values, caissier, "PUT")).status).toBe(403);
    expect((await send("/settings", values, gerant, "PUT")).status).toBe(200);
    expect((await send("/fee-ceiling", { ceiling: 600 }, gerant, "PUT")).status).toBe(403);
    expect((await send("/fee-ceiling", { ceiling: 600 }, pdg, "PUT")).status).toBe(200);
    expect((await send("/settings", { deliveryFeePerBottle: 700 }, gerant, "PUT")).status).toBe(422);
    expect((await send("/settings", { deliveryFeePerBottle: 500 }, gerant, "PUT")).status).toBe(200);
    expect(shopSettings.parse(await get("/settings"))).toMatchObject({
      ...values,
      deliveryFeePerBottle: 500,
      deliveryFeeCeiling: 600,
    });
    expect((await catalogue()).shop.openingHours).toBe("8 h à 19 h");
    await send("/fee-ceiling", { ceiling: null }, pdg, "PUT");
    expect(shopSettings.parse(await get("/settings")).deliveryFeeCeiling).toBeNull();
    await send("/fee-ceiling", { ceiling: 600 }, pdg, "PUT");
  });

  it("quartiers : montant mémorisé, plafonné, désactivable", async () => {
    const created = await send("/neighbourhoods", { name: "Akwa" });
    expect(created.status).toBe(201);
    const akwa = (await created.json()) as { id: string; feePerBottle: number };
    expect(akwa.feePerBottle).toBe(500);
    expect((await send("/neighbourhoods", { name: "Akwa" })).status).toBe(409);
    expect((await send("/neighbourhoods", { name: "Loin", feePerBottle: 900 })).status).toBe(422);
    const path = `/neighbourhoods/${akwa.id}`;
    expect((await send(path, { feePerBottle: 900 }, gerant, "PATCH")).status).toBe(422);
    expect((await send(path, { feePerBottle: 600 }, gerant, "PATCH")).status).toBe(200);
    expect((await catalogue()).neighbourhoods).toEqual([{ id: akwa.id, name: "Akwa", feePerBottle: 600 }]);
    await send(path, { active: false }, gerant, "PATCH");
    expect((await catalogue()).neighbourhoods).toEqual([]);
    expect(neighbourhoods.parse(await get("/neighbourhoods"))).toHaveLength(1);
    const unknown = "/neighbourhoods/3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
    expect((await send(unknown, { active: true }, gerant, "PATCH")).status).toBe(404);
  });
});
