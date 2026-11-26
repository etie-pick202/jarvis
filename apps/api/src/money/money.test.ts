import { floatStates, moneyOperation, moneyOperations } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { commissionFor, movements } from "./rules.js";

describe("règles Orange Money et MoMo", () => {
  it("dépôt et retrait déplacent les espèces et le float en sens inverse", () => {
    expect(movements("deposit")).toEqual({ cashDirection: "in", floatDirection: "out" });
    expect(movements("withdrawal")).toEqual({ cashDirection: "out", floatDirection: "in" });
  });

  it("commission en FCFA entiers", () => {
    expect(commissionFor(10_000, 150)).toBe(150);
    expect(commissionFor(999, 100)).toBe(9);
    expect(commissionFor(5000, 0)).toBe(0);
  });
});

describe("dépôts, retraits et float (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;

  const send = (path: string, body: unknown, token = gerant, method = "POST") =>
    t.app.request(`/api/v1${path}`, { ...jsonPost(body, token), method });
  const get = async (path: string, token = gerant) =>
    (await t.app.request(`/api/v1${path}`, authGet(token))).json();
  const balances = async () => {
    const rows = (await get("/cash/registers")) as { id: string; balance: number }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.balance]));
  };
  const operation = (kind: string, amount: number, reference: string) => ({
    operator: "orange_money",
    kind,
    amount,
    phone: "690000000",
    reference,
  });

  beforeAll(async () => {
    t = await createTestApp(3000);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    [pdg, gerant, caissier] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
    ];
  });
  afterAll(() => t.close());

  it("en stand-by par défaut ; activée par le PDG, refus si le float manque", async () => {
    const deposit = operation("deposit", 2000, "OM-001");
    expect((await send("/money/operations", deposit)).status).toBe(422);
    expect((await send("/money/operations", deposit, caissier)).status).toBe(403);
    await send("/cash/registers/transaction_om", { active: true }, pdg, "PATCH");
    expect(floatStates.parse(await get("/money/float"))).toEqual([
      { operator: "orange_money", active: true, float: 0 },
      { operator: "momo", active: false, float: 0 },
    ]);
    expect((await send("/money/operations", deposit)).status).toBe(409);
  });

  it("retrait et dépôt : espèces et float suivent, commission au taux réglé, annulation tracée", async () => {
    const rates = { deposit: 100, withdrawal: 200 };
    const settings = { orange_money: rates, momo: rates };
    expect((await send("/money/commissions", settings, gerant, "PUT")).status).toBe(403);
    expect((await send("/money/commissions", settings, pdg, "PUT")).status).toBe(200);
    expect(await get("/money/commissions")).toEqual(settings);
    expect((await send("/money/operations", operation("withdrawal", 3000, "OM-002"))).status).toBe(409);

    // Fond de départ : la clôture aligne la caisse sur les espèces comptées.
    const opening = { registerId: "sales_cash", countedAmount: 10_000, justification: "Fond de départ" };
    await send("/cash/closures", opening);
    const withdrawal = moneyOperation.parse(
      await (await send("/money/operations", operation("withdrawal", 3000, "OM-002"))).json(),
    );
    expect(withdrawal.commission).toBe(60);
    expect(await balances()).toMatchObject({ sales_cash: 7000, transaction_om: 3000 });
    const deposit = moneyOperation.parse(
      await (await send("/money/operations", operation("deposit", 1000, "OM-003"))).json(),
    );
    expect(await balances()).toMatchObject({ sales_cash: 8000, transaction_om: 2000 });
    expect((await send("/money/operations", operation("deposit", 500, "OM-003"))).status).toBe(409);

    const cancel = (id: string, justification?: string) =>
      send(`/money/operations/${id}/cancel`, { justification });
    expect((await cancel(deposit.id)).status).toBe(422);
    const reversal = moneyOperation.parse(await (await cancel(deposit.id, "Erreur de numéro")).json());
    expect(reversal.reversalOf).toBe(deposit.id);
    expect((await cancel(deposit.id, "Encore une fois")).status).toBe(409);
    expect((await cancel(reversal.id, "Encore une fois")).status).toBe(422);
    expect((await cancel("3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e", "Encore une fois")).status).toBe(404);
    expect(await balances()).toMatchObject({ sales_cash: 7000, transaction_om: 3000 });
    const list = moneyOperations.parse(await get("/money/operations?date=2026-11-24"));
    expect(list).toHaveLength(3);
    expect(list.filter((o) => o.cancelled).map((o) => o.id)).toEqual([deposit.id]);
    expect(moneyOperations.parse(await get("/money/operations"))).toHaveLength(3);
  });
});
