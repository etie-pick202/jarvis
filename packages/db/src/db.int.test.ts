import { eq } from "drizzle-orm";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client.js";
import { runMigrations } from "./migrate.js";
import { brands, cashEntries, sales, stockMoves, users } from "./schema.js";
import { seed } from "./seed.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL est obligatoire pour les tests d'intégration");
const { db, close } = createDb(url);

async function reset() {
  const pool = new pg.Pool({ connectionString: url });
  await pool.query(
    "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;",
  );
  await pool.end();
}

beforeAll(async () => {
  await reset();
  await runMigrations(url);
  await seed(url, "mot-de-passe-d-essai");
});
afterAll(() => close());

describe("migrations et données de départ", () => {
  it("sont rejouables sans effet", async () => {
    await runMigrations(url);
    await seed(url, "mot-de-passe-d-essai");
    expect((await db.select().from(users)).length).toBe(3);
  });
  it("créent les six caisses et des marques fictives", async () => {
    const regs = await db.query.cashRegisters.findMany();
    expect(regs).toHaveLength(6);
    expect((await db.select().from(brands)).every((b) => b.name.includes("fictif"))).toBe(true);
  });
});

describe("journal en ajout seul", () => {
  async function insertSale() {
    const [user] = await db.select().from(users).limit(1);
    if (!user) throw new Error("graine absente");
    const [s] = await db
      .insert(sales)
      .values({
        number: `T-${Math.random()}`,
        customerName: "Essai",
        paymentMethod: "cash",
        total: 6800,
        authorId: user.id,
      })
      .returning();
    if (!s) throw new Error("insertion impossible");
    return { sale: s, user };
  }

  it("interdit de modifier une vente", async () => {
    const { sale } = await insertSale();
    await expect(db.update(sales).set({ total: 1 }).where(eq(sales.id, sale.id))).rejects.toThrow();
  });
  it("interdit d'effacer une vente", async () => {
    const { sale } = await insertSale();
    await expect(db.delete(sales).where(eq(sales.id, sale.id))).rejects.toThrow();
  });
  it("interdit de modifier ou effacer une écriture de caisse et un mouvement de stock", async () => {
    const { user } = await insertSale();
    const [e] = await db
      .insert(cashEntries)
      .values({
        number: `C-${Math.random()}`,
        registerId: "sales_cash",
        direction: "in",
        type: "REG",
        paymentMethod: "cash",
        label: "x",
        amount: 100,
        balanceAfter: 100,
        operatorId: user.id,
      })
      .returning();
    if (!e) throw new Error("insertion impossible");
    await expect(db.update(cashEntries).set({ amount: 5 }).where(eq(cashEntries.id, e.id))).rejects.toThrow();
    await expect(db.delete(cashEntries).where(eq(cashEntries.id, e.id))).rejects.toThrow();
    const [b] = await db.select().from(brands).limit(1);
    const f = await db.query.formats.findFirst();
    if (!b || !f) throw new Error("graine absente");
    const [m] = await db
      .insert(stockMoves)
      .values({
        brandId: b.id,
        formatId: f.id,
        state: "full",
        delta: 5,
        reason: "reception",
        authorId: user.id,
      })
      .returning();
    if (!m) throw new Error("insertion impossible");
    await expect(db.update(stockMoves).set({ delta: 9 }).where(eq(stockMoves.id, m.id))).rejects.toThrow();
    await expect(db.delete(stockMoves).where(eq(stockMoves.id, m.id))).rejects.toThrow();
  });
  it("refuse une vente à crédit", async () => {
    const [user] = await db.select().from(users).limit(1);
    if (!user) throw new Error("graine absente");
    await expect(
      db.insert(sales).values({
        number: "CR-1",
        customerName: "Essai",
        paymentMethod: "credit",
        total: 1,
        authorId: user.id,
      }),
    ).rejects.toThrow();
  });
  it("n'autorise qu'une seule inversion par vente", async () => {
    const { sale, user } = await insertSale();
    const reversal = {
      customerName: "Essai",
      paymentMethod: "cash",
      total: 6800,
      authorId: user.id,
      reversalOf: sale.id,
      justification: "Erreur de saisie",
    };
    await db.insert(sales).values({ ...reversal, number: `R-${Math.random()}` });
    await expect(db.insert(sales).values({ ...reversal, number: `R-${Math.random()}` })).rejects.toThrow();
  });
});
