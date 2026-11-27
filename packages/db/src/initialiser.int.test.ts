import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { createFreshDatabase } from "./fresh.js";
import { initialiser } from "./initialiser.js";
import { runMigrations } from "./migrate.js";
import { brands, formats, gasPrices, userRoles, users } from "./schema.js";

const adminUrl = process.env.DATABASE_URL;
if (!adminUrl) throw new Error("DATABASE_URL est obligatoire pour les tests d'intégration");
let url = "";
let db: ReturnType<typeof createDb>["db"];
let close: () => Promise<void>;
const pdg = { username: "pdg", displayName: "PDG", password: "mot-de-passe-pdg" };

beforeAll(async () => {
  url = await createFreshDatabase(adminUrl, "jarvis_test_init");
  ({ db, close } = createDb(url));
  await runMigrations(url);
});

afterAll(() => close());

describe("initialisation d'une base vide", () => {
  it("crée les six caisses et un seul compte PDG, sans aucune donnée métier", async () => {
    expect(await initialiser(url, pdg)).toEqual({ pdgCree: true });
    expect(await db.query.cashRegisters.findMany()).toHaveLength(6);
    const comptes = await db.select().from(users);
    expect(comptes.map((u) => u.username)).toEqual(["pdg"]);
    expect((await db.select().from(userRoles)).map((r) => r.role)).toEqual(["pdg"]);
    expect(await db.select().from(brands)).toHaveLength(0);
    expect(await db.select().from(formats)).toHaveLength(0);
    expect(await db.select().from(gasPrices)).toHaveLength(0);
  });

  it("est rejouable : n'ajoute aucun compte si la base en a déjà", async () => {
    expect(await initialiser(url, { ...pdg, username: "autre" })).toEqual({ pdgCree: false });
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("refuse un mot de passe trop court", async () => {
    await expect(initialiser(url, { ...pdg, password: "court" })).rejects.toThrow(/8 caractères/u);
  });
});

describe("connexions perdues", () => {
  it("le pool survit à la coupure de ses connexions inactives et en rouvre une", async () => {
    const { db: autre, pool, close: fermer } = createDb(url);
    await autre.select().from(users);
    const { pool: admin, close: fermerAdmin } = createDb(url);
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()",
    );
    await fermerAdmin();
    await new Promise((r) => setTimeout(r, 200));
    expect(await autre.select().from(users)).toHaveLength(1);
    expect(pool.totalCount).toBeGreaterThan(0);
    await fermer();
  });
});
