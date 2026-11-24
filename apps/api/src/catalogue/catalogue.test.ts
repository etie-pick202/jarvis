import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { exceedsCeiling, type PriceRow, resolveGasPrice } from "./pricing.js";

const row = (over: Partial<PriceRow>): PriceRow => ({
  formatId: "f1",
  brandId: null,
  amount: 6500,
  transportContribution: 300,
  purchaseCost: 6070,
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

describe("résolution du prix", () => {
  const rows = [
    row({}),
    row({ amount: 6600, effectiveFrom: new Date("2026-06-01T00:00:00Z") }),
    row({ brandId: "b1", amount: 7000, effectiveFrom: new Date("2026-03-01T00:00:00Z") }),
  ];
  it("prend le prix du format le plus récent à la date demandée", () => {
    expect(resolveGasPrice(rows, "f1", "b2", new Date("2026-02-01T00:00:00Z"))?.amount).toBe(6500);
    expect(resolveGasPrice(rows, "f1", "b2", new Date("2026-07-01T00:00:00Z"))?.amount).toBe(6600);
  });
  it("l'exception de marque l'emporte sur le prix du format", () => {
    expect(resolveGasPrice(rows, "f1", "b1", new Date("2026-07-01T00:00:00Z"))?.amount).toBe(7000);
    expect(resolveGasPrice(rows, "f1", "b1", new Date("2026-02-01T00:00:00Z"))?.amount).toBe(6500);
  });
  it("renvoie null sans prix applicable", () => {
    expect(resolveGasPrice(rows, "autre", "b1", new Date("2026-07-01T00:00:00Z"))).toBeNull();
    expect(resolveGasPrice(rows, "f1", "b1", new Date("2025-01-01T00:00:00Z"))).toBeNull();
  });
  it("détecte un dépassement de plafond", () => {
    expect(exceedsCeiling(6500, null)).toBe(false);
    expect(exceedsCeiling(6500, 6500)).toBe(false);
    expect(exceedsCeiling(6501, 6500)).toBe(true);
  });
});

describe("catalogue (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let brandId: string;
  let formatId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    pdg = await t.tokenFor("pdg1");
    gerant = await t.tokenFor("gerant1");
    caissier = await t.tokenFor("caissier1");
  });
  afterAll(() => t.close());

  it("exige une session", async () => {
    expect((await t.app.request("/api/v1/catalogue/brands")).status).toBe(401);
  });

  it("le PDG ajoute une marque et un format ; le gérant ne le peut pas", async () => {
    const brand = { name: "Marque essai", packagingValue: 17500 };
    expect((await t.app.request("/api/v1/catalogue/brands", jsonPost(brand, gerant))).status).toBe(403);
    expect((await t.app.request("/api/v1/catalogue/brands", jsonPost(brand, caissier))).status).toBe(403);
    const created = await t.app.request("/api/v1/catalogue/brands", jsonPost(brand, pdg));
    expect(created.status).toBe(201);
    brandId = ((await created.json()) as { id: string }).id;
    expect((await t.app.request("/api/v1/catalogue/brands", jsonPost(brand, pdg))).status).toBe(409);
    const format = await t.app.request(
      "/api/v1/catalogue/formats",
      jsonPost({ label: "12,5 kg", weightGrams: 12500, priceCeiling: 7000 }, pdg),
    );
    expect(format.status).toBe(201);
    formatId = ((await format.json()) as { id: string }).id;
  });

  it("le PDG désactive une marque ; le catalogue se lit par tous les profils de vente", async () => {
    const res = await t.app.request(`/api/v1/catalogue/brands/${brandId}`, {
      ...jsonPost({ active: false }, pdg),
      method: "PATCH",
    });
    expect(((await res.json()) as { active: boolean }).active).toBe(false);
    const list = await t.app.request("/api/v1/catalogue/brands", authGet(caissier));
    expect(((await list.json()) as unknown[]).length).toBe(1);
    const empty = await t.app.request(`/api/v1/catalogue/brands/${brandId}`, {
      ...jsonPost({}, pdg),
      method: "PATCH",
    });
    expect(empty.status).toBe(422);
  });

  it("garde l'historique des prix et refuse un prix au-dessus du plafond", async () => {
    const set = (amount: number, token: string) =>
      t.app.request("/api/v1/catalogue/prices", {
        ...jsonPost({ formatId, amount, transportContribution: 300, purchaseCost: 6070 }, token),
        method: "PUT",
      });
    expect((await set(6500, gerant)).status).toBe(403);
    expect((await set(6500, pdg)).status).toBe(201);
    t.clock.advanceMinutes(20);
    expect((await set(6600, pdg)).status).toBe(201);
    const over = await set(7001, pdg);
    expect(over.status).toBe(422);
    expect(((await over.json()) as { error: { code: string } }).error.code).toBe("price_above_ceiling");
    const history = await t.app.request(`/api/v1/catalogue/prices/${formatId}/history`, authGet(gerant));
    const rows = (await history.json()) as { amount: number }[];
    expect(rows.map((r) => r.amount)).toEqual([6600, 6500]);
  });

  it("le gérant ajoute ses articles et chaque changement de prix est tracé", async () => {
    const created = await t.app.request(
      "/api/v1/catalogue/articles",
      jsonPost({ name: "Détendeur", price: 3000, trackStock: true }, gerant),
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      (await t.app.request("/api/v1/catalogue/articles", jsonPost({ name: "x", price: 1 }, caissier))).status,
    ).toBe(403);
    const upd = await t.app.request(`/api/v1/catalogue/articles/${id}`, {
      ...jsonPost({ price: 3500 }, gerant),
      method: "PATCH",
    });
    expect(((await upd.json()) as { price: number }).price).toBe(3500);
    const prices = await t.app.request(`/api/v1/catalogue/articles/${id}/prices`, authGet(caissier));
    expect(((await prices.json()) as unknown[]).length).toBe(2);
    const audit = await t.deps.db.query.auditLog.findMany();
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "brand.create",
        "brand.update",
        "format.create",
        "price.change",
        "article.create",
      ]),
    );
  });

  it("liste et modifie les formats (plafond et activation), PDG seul", async () => {
    const list = await t.app.request("/api/v1/catalogue/formats", authGet(gerant));
    expect(((await list.json()) as unknown[]).length).toBe(1);
    const patch = (body: unknown, token: string) =>
      t.app.request(`/api/v1/catalogue/formats/${formatId}`, { ...jsonPost(body, token), method: "PATCH" });
    expect((await patch({ priceCeiling: 6800 }, gerant)).status).toBe(403);
    const ok = await patch({ priceCeiling: 6800, label: "12,5 kg (bouteille)" }, pdg);
    expect(((await ok.json()) as { priceCeiling: number }).priceCeiling).toBe(6800);
    const dup = await t.app.request(
      "/api/v1/catalogue/formats",
      jsonPost({ label: "12,5 kg (bouteille)", weightGrams: 12500 }, pdg),
    );
    expect(dup.status).toBe(409);
    const unknown = await t.app.request("/api/v1/catalogue/formats/3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e", {
      ...jsonPost({ active: false }, pdg),
      method: "PATCH",
    });
    expect(unknown.status).toBe(404);
  });

  it("refuse un montant décimal et un article inconnu", async () => {
    const bad = await t.app.request(
      "/api/v1/catalogue/articles",
      jsonPost({ name: "x", price: 10.5 }, gerant),
    );
    expect(bad.status).toBe(422);
    const unknown = await t.app.request("/api/v1/catalogue/articles/3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e", {
      ...jsonPost({ price: 5 }, gerant),
      method: "PATCH",
    });
    expect(unknown.status).toBe(404);
  });
});
