import { publicCatalogue, shopSettings, stockThresholds, userAccount, userAccounts } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost, TEST_PASSWORD } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("paramètres : comptes, réglages et seuils (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: Awaited<ReturnType<typeof seedGas>>;
  let pdgId: string;
  let otherId: string;
  let pdg: string;
  let gerant: string;

  const api = (path: string, body?: unknown, token = pdg, method = "POST") =>
    t.app.request(
      `/api/v1${path}`,
      body === undefined ? authGet(token) : { ...jsonPost(body, token), method },
    );
  const patch = (id: string, body: unknown, token = pdg) => api(`/auth/users/${id}`, body, token, "PATCH");
  const login = (username: string, password: string) =>
    t.app.request("/api/v1/auth/login", jsonPost({ username, password }));

  beforeAll(async () => {
    t = await createTestApp(3000);
    pdgId = await addUser(t.deps, "pdg1", ["pdg"]);
    otherId = await addUser(t.deps, "gerant1", ["gerant"]);
    g = await seedGas(t.deps, otherId, 1);
    [pdg, gerant] = [await t.tokenFor("pdg1"), await t.tokenFor("gerant1")];
  });
  afterAll(() => t.close());

  it("liste les comptes sans mot de passe, pour le PDG seul", async () => {
    const res = await api("/auth/users");
    const list = userAccounts.parse(await res.json());
    expect(list.map((u) => u.username)).toEqual(["gerant1", "pdg1"]);
    expect(JSON.stringify(list)).not.toContain("password");
    expect((await api("/auth/users", undefined, gerant)).status).toBe(403);
  });

  it("change profils et mot de passe : les sessions du compte se ferment", async () => {
    expect((await patch(otherId, {})).status).toBe(422);
    const updated = userAccount.parse(
      await (await patch(otherId, { roles: ["gerant", "livreur"], password: "nouveau-secret-1" })).json(),
    );
    expect(updated.roles.sort()).toEqual(["gerant", "livreur"]);
    expect((await api("/auth/me", undefined, gerant)).status).toBe(401);
    expect((await login("gerant1", TEST_PASSWORD)).status).toBe(401);
    expect((await login("gerant1", "nouveau-secret-1")).status).toBe(200);
    const audit = await (await api("/control/audit?action=user.update")).json();
    expect(JSON.stringify(audit)).not.toContain("nouveau-secret-1");
  });

  it("désactive un compte, mais jamais le sien", async () => {
    expect((await patch(pdgId, { active: false })).status).toBe(409);
    expect((await patch(pdgId, { roles: ["gerant"] })).status).toBe(409);
    expect((await patch(otherId, { active: false })).status).toBe(200);
    expect((await login("gerant1", "nouveau-secret-1")).status).toBe(401);
    expect((await patch(UNKNOWN, { active: true })).status).toBe(404);
  });

  it("heure de la confirmation du soir et numéros de paiement mobile", async () => {
    const values = { eveningCountTime: "18:30", omNumber: "690000001", momoNumber: "670000002" };
    expect((await api("/delivery/settings", values, pdg, "PUT")).status).toBe(200);
    expect((await api("/delivery/settings", { eveningCountTime: "25:00" }, pdg, "PUT")).status).toBe(422);
    expect(shopSettings.parse(await (await api("/delivery/settings")).json())).toMatchObject(values);
    const shop = publicCatalogue.parse(await (await t.app.request("/api/v1/shop/catalogue")).json());
    expect(shop.shop).toMatchObject({ omNumber: "690000001", momoNumber: "670000002" });
    expect(JSON.stringify(shop)).not.toContain("18:30");
  });

  it("relit les seuils de stock bas : par défaut et par marque et format", async () => {
    const read = async () => stockThresholds.parse(await (await api("/stock/thresholds")).json());
    expect(await read()).toEqual({ default: 5, overrides: [] });
    await api("/stock/thresholds", { threshold: 3 }, pdg, "PUT");
    const specific = { brandId: g.alpha.id, formatId: g.format.id, threshold: 8 };
    await api("/stock/thresholds", specific, pdg, "PUT");
    expect(await read()).toEqual({ default: 3, overrides: [specific] });
  });
});
