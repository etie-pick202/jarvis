import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost, TEST_PASSWORD } from "../testing/db.js";
import { bearerToken } from "./middleware.js";
import { can, PERMISSIONS } from "./permissions.js";
import { defaultActiveRole, isExpired, nextExpiry } from "./service.js";

describe("règles pures", () => {
  it("lit l'en-tête Bearer", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(undefined)).toBeNull();
  });
  it("choisit le profil actif par priorité et refuse un compte sans profil", () => {
    expect(defaultActiveRole(["livreur", "gerant"])).toBe("gerant");
    expect(() => defaultActiveRole([])).toThrow();
  });
  it("calcule l'expiration par inactivité", () => {
    const now = new Date("2026-11-24T08:00:00Z");
    const exp = nextExpiry(now, 30);
    expect(isExpired(exp, new Date("2026-11-24T08:29:59Z"))).toBe(false);
    expect(isExpired(exp, new Date("2026-11-24T08:30:00Z"))).toBe(true);
  });
  it("applique la matrice des droits", () => {
    expect(can("pdg", "catalog.gas.write")).toBe(true);
    expect(can("gerant", "catalog.gas.write")).toBe(false);
    expect(can("gerant", "user.manage")).toBe(false);
    expect(can("caissier", "sale.cancel")).toBe(false);
    expect(can("caissier", "cash.close")).toBe(false);
    expect(can("livreur", "stock.read")).toBe(false);
    expect(can("livreur", "cash.read")).toBe(false);
    expect(can("livreur", "report.read")).toBe(false);
    expect(Object.keys(PERMISSIONS).length).toBeGreaterThan(10);
  });
});

describe("authentification (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  beforeAll(async () => {
    t = await createTestApp(30);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "gerant1", ["gerant", "livreur"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
  });
  afterAll(() => t.close());

  it("refuse un mauvais mot de passe et un inconnu avec le même message", async () => {
    const bad = await t.app.request(
      "/api/v1/auth/login",
      jsonPost({ username: "pdg1", password: "faux-faux-faux" }),
    );
    const unknown = await t.app.request(
      "/api/v1/auth/login",
      jsonPost({ username: "nobody", password: TEST_PASSWORD }),
    );
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await bad.json()).toEqual(await unknown.json());
  });
  it("refuse une requête de connexion invalide au format commun", async () => {
    const res = await t.app.request("/api/v1/auth/login", jsonPost({ username: "x" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
  });
  it("ouvre une session et ne renvoie jamais le hachage", async () => {
    const res = await t.app.request(
      "/api/v1/auth/login",
      jsonPost({ username: "gerant1", password: TEST_PASSWORD }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; user: { activeRole: string; roles: string[] } };
    expect(body.user.activeRole).toBe("gerant");
    expect(body.user.roles).toEqual(expect.arrayContaining(["gerant", "livreur"]));
    expect(JSON.stringify(body)).not.toContain("scrypt");
  });
  it("exige une session sur /me", async () => {
    expect((await t.app.request("/api/v1/auth/me")).status).toBe(401);
    expect((await t.app.request("/api/v1/auth/me", authGet("jeton-bidon"))).status).toBe(401);
    const token = await t.tokenFor("pdg1");
    const me = await t.app.request("/api/v1/auth/me", authGet(token));
    expect(((await me.json()) as { username: string }).username).toBe("pdg1");
  });
  it("déconnecte automatiquement après l'inactivité, mais prolonge la session active", async () => {
    const token = await t.tokenFor("pdg1");
    t.clock.advanceMinutes(20);
    expect((await t.app.request("/api/v1/auth/me", authGet(token))).status).toBe(200);
    t.clock.advanceMinutes(20); // 40 min depuis la connexion, 20 depuis la dernière activité
    expect((await t.app.request("/api/v1/auth/me", authGet(token))).status).toBe(200);
    t.clock.advanceMinutes(31);
    expect((await t.app.request("/api/v1/auth/me", authGet(token))).status).toBe(401);
  });
  it("la déconnexion invalide le jeton", async () => {
    const token = await t.tokenFor("pdg1");
    expect((await t.app.request("/api/v1/auth/logout", jsonPost({}, token))).status).toBe(204);
    expect((await t.app.request("/api/v1/auth/me", authGet(token))).status).toBe(401);
  });
  it("bascule de profil seulement vers un profil possédé", async () => {
    const token = await t.tokenFor("gerant1");
    const ok = await t.app.request("/api/v1/auth/switch-role", jsonPost({ role: "livreur" }, token));
    expect(((await ok.json()) as { activeRole: string }).activeRole).toBe("livreur");
    const me = await t.app.request("/api/v1/auth/me", authGet(token));
    expect(((await me.json()) as { activeRole: string }).activeRole).toBe("livreur");
    const ko = await t.app.request("/api/v1/auth/switch-role", jsonPost({ role: "pdg" }, token));
    expect(ko.status).toBe(403);
  });
  it("seul le PDG crée des utilisateurs (vérifié côté serveur, profil actif)", async () => {
    const newUser = {
      username: "caissier1",
      displayName: "Caissier",
      password: "un-mot-de-passe",
      roles: ["caissier"],
    };
    const gerant = await t.tokenFor("gerant1");
    expect((await t.app.request("/api/v1/auth/users", jsonPost(newUser, gerant))).status).toBe(403);
    expect((await t.app.request("/api/v1/auth/users", jsonPost(newUser))).status).toBe(401);
    const pdg = await t.tokenFor("pdg1");
    expect((await t.app.request("/api/v1/auth/users", jsonPost(newUser, pdg))).status).toBe(201);
    expect((await t.app.request("/api/v1/auth/users", jsonPost(newUser, pdg))).status).toBe(409);
    const login = await t.app.request(
      "/api/v1/auth/login",
      jsonPost({ username: "caissier1", password: "un-mot-de-passe" }),
    );
    expect(login.status).toBe(200);
  });
  it("un livreur n'a aucun droit de gestion", async () => {
    const token = await t.tokenFor("livreur1");
    const body = { username: "zz", displayName: "z", password: "12345678", roles: ["pdg"] };
    expect((await t.app.request("/api/v1/auth/users", jsonPost(body, token))).status).toBe(403);
  });
  it("renvoie 404 au format commun pour une route inconnue", async () => {
    expect((await t.app.request("/api/v1/nulle-part")).status).toBe(404);
  });
});
