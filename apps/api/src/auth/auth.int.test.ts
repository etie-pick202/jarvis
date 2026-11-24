import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, jsonPost } from "../testing/db.js";
import { createPgTestApp } from "../testing/pg.js";

describe("authentification sur PostgreSQL", () => {
  let t: Awaited<ReturnType<typeof createPgTestApp>>;
  beforeAll(async () => {
    t = await createPgTestApp(30);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "gerant1", ["gerant"]);
  });
  afterAll(() => t.close());

  it("connexion, droits et expiration de session", async () => {
    const pdg = await t.tokenFor("pdg1");
    const gerant = await t.tokenFor("gerant1");
    const body = { username: "x1", displayName: "X", password: "12345678", roles: ["caissier"] };
    expect((await t.app.request("/api/v1/auth/users", jsonPost(body, gerant))).status).toBe(403);
    expect((await t.app.request("/api/v1/auth/users", jsonPost(body, pdg))).status).toBe(201);
    t.clock.advanceMinutes(31);
    expect((await t.app.request("/api/v1/auth/me", authGet(pdg))).status).toBe(401);
  });
});
