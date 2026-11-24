import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { nextBalance, registerForPayment } from "./ledger.js";
import {
  businessDate,
  closureGap,
  dayRange,
  defaultPaymentMethod,
  hasSufficientBalance,
  needsJustification,
} from "./rules.js";

describe("règles de caisse", () => {
  it("calcule le solde après chaque mouvement", () => {
    expect(nextBalance(1000, "in", 500)).toBe(1500);
    expect(nextBalance(1000, "out", 400)).toBe(600);
  });
  it("route les paiements vers la bonne caisse", () => {
    expect(registerForPayment("cash")).toBe("sales_cash");
    expect(registerForPayment("momo")).toBe("settlement_om_momo");
    expect(registerForPayment("orange_money")).toBe("settlement_om_momo");
  });
  it("rattache un instant à son jour d'activité (UTC+1)", () => {
    expect(businessDate(new Date("2026-11-24T22:59:00Z"))).toBe("2026-11-24");
    expect(businessDate(new Date("2026-11-24T23:00:00Z"))).toBe("2026-11-25");
    const [from, to] = dayRange("2026-11-25");
    expect(from.toISOString()).toBe("2026-11-24T23:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-25T23:00:00.000Z");
  });
  it("exige une justification au-delà du seuil", () => {
    expect(closureGap(9500, 10000)).toBe(-500);
    expect(needsJustification(0, 0)).toBe(false);
    expect(needsJustification(-1, 0)).toBe(true);
    expect(needsJustification(500, 500)).toBe(false);
    expect(needsJustification(501, 500)).toBe(true);
  });
  it("refuse de sortir plus que le solde", () => {
    expect(hasSufficientBalance(100, 100)).toBe(true);
    expect(hasSufficientBalance(99, 100)).toBe(false);
  });
  it("choisit le mode de paiement par caisse", () => {
    expect(defaultPaymentMethod("sales_cash")).toBe("cash");
    expect(defaultPaymentMethod("canal_om")).toBe("orange_money");
    expect(defaultPaymentMethod("transaction_momo")).toBe("momo");
  });
});

describe("caisses (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let livreur: string;
  let n = 0;
  const post = (path: string, body: unknown, token = gerant) =>
    t.app.request(
      `/api/v1/cash${path}`,
      jsonPost(body, token, { "Idempotency-Key": `cle-caisse-${++n}-${Math.random()}` }),
    );
  const registers = async () =>
    (await (await t.app.request("/api/v1/cash/registers", authGet(gerant))).json()) as {
      id: string;
      balance: number;
      active: boolean;
    }[];
  const balanceOf = async (id: string) => (await registers()).find((r) => r.id === id)?.balance;

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    const g = await seedGas(t.deps, id, 20);
    pdg = await t.tokenFor("pdg1");
    gerant = await t.tokenFor("gerant1");
    caissier = await t.tokenFor("caissier1");
    livreur = await t.tokenFor("livreur1");
    // Trois ventes en espèces : 20 400 FCFA en caisse « ventes en espèces ».
    for (let i = 0; i < 3; i++) {
      const res = await t.app.request(
        "/api/v1/sales",
        jsonPost(
          {
            customerName: `Client ${i}`,
            paymentMethod: "cash",
            lines: [{ kind: "gas", brandId: g.alpha.id, formatId: g.format.id, quantity: 1 }],
          },
          caissier,
          { "Idempotency-Key": `vente-caisse-${i}-0001` },
        ),
      );
      expect(res.status).toBe(201);
    }
  });
  afterAll(() => t.close());

  it("liste six caisses dont deux en stand-by, avec le solde calculé ; le livreur n'y a pas accès", async () => {
    const all = await registers();
    expect(all).toHaveLength(6);
    expect(
      all
        .filter((r) => !r.active)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["transaction_momo", "transaction_om"]);
    expect(await balanceOf("sales_cash")).toBe(20400);
    expect((await t.app.request("/api/v1/cash/registers", authGet(livreur))).status).toBe(403);
    expect((await t.app.request("/api/v1/cash/registers")).status).toBe(401);
  });

  it("enregistre une dépense (sortie MSC) et recalcule le solde ; jamais de solde négatif", async () => {
    const res = await post(
      "/expenses",
      { registerId: "sales_cash", amount: 2400, label: "Transport" },
      caissier,
    );
    expect(res.status).toBe(201);
    const entry = (await res.json()) as { type: string; direction: string; balanceAfter: number };
    expect(entry).toMatchObject({ type: "MSC", direction: "out", balanceAfter: 18000 });
    const tooMuch = await post("/expenses", { registerId: "sales_cash", amount: 99999, label: "Trop" });
    expect(tooMuch.status).toBe(409);
    expect(await balanceOf("sales_cash")).toBe(18000);
    expect((await post("/expenses", { registerId: "sales_cash", amount: 1.5, label: "x" })).status).toBe(422);
    expect(
      (await post("/expenses", { registerId: "sales_cash", amount: 5, label: "x" }, livreur)).status,
    ).toBe(403);
  });

  it("un transfert écrit une sortie et une entrée ensemble", async () => {
    const res = await post("/transfers", {
      fromRegisterId: "sales_cash",
      toRegisterId: "canal_cash",
      amount: 5000,
      label: "Fonds Canal+",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      out: { type: string; balanceAfter: number };
      in: { type: string; customerName: string };
    };
    expect(body.out).toMatchObject({ type: "MSC", balanceAfter: 13000 });
    expect(body.in).toMatchObject({ type: "MEC", customerName: "Client comptoir" });
    expect(await balanceOf("canal_cash")).toBe(5000);
    const same = await post("/transfers", {
      fromRegisterId: "canal_cash",
      toRegisterId: "canal_cash",
      amount: 1,
      label: "x",
    });
    expect(same.status).toBe(422);
  });

  it("un transfert refusé n'écrit rien (solde insuffisant)", async () => {
    const res = await post("/transfers", {
      fromRegisterId: "canal_cash",
      toRegisterId: "canal_om",
      amount: 6000,
      label: "Trop",
    });
    expect(res.status).toBe(409);
    expect(await balanceOf("canal_om")).toBe(0);
    expect(await balanceOf("canal_cash")).toBe(5000);
  });

  it("une caisse en stand-by refuse les mouvements jusqu'à son activation par le PDG", async () => {
    const blocked = await post("/transfers", {
      fromRegisterId: "sales_cash",
      toRegisterId: "transaction_om",
      amount: 100,
      label: "x",
    });
    expect(blocked.status).toBe(422);
    const patch = (token: string) =>
      t.app.request("/api/v1/cash/registers/transaction_om", {
        ...jsonPost({ active: true }, token),
        method: "PATCH",
      });
    expect((await patch(gerant)).status).toBe(403);
    expect((await patch(pdg)).status).toBe(200);
    const ok = await post("/transfers", {
      fromRegisterId: "sales_cash",
      toRegisterId: "transaction_om",
      amount: 100,
      label: "x",
    });
    expect(ok.status).toBe(201);
    const missing = await t.app.request("/api/v1/cash/registers/inconnue", {
      ...jsonPost({ active: true }, pdg),
      method: "PATCH",
    });
    expect(missing.status).toBe(422);
  });

  it("lit le journal d'une caisse, filtré par jour", async () => {
    const all = await t.app.request("/api/v1/cash/registers/sales_cash/entries", authGet(caissier));
    expect(((await all.json()) as unknown[]).length).toBe(6);
    const today = await t.app.request(
      "/api/v1/cash/registers/sales_cash/entries?date=2026-11-24",
      authGet(caissier),
    );
    expect(((await today.json()) as unknown[]).length).toBe(6);
    const other = await t.app.request(
      "/api/v1/cash/registers/sales_cash/entries?date=2026-11-23",
      authGet(caissier),
    );
    expect(await other.json()).toEqual([]);
    expect(
      (await t.app.request("/api/v1/cash/registers/sales_cash/entries?date=hier", authGet(caissier))).status,
    ).toBe(422);
  });

  it("le caissier ne clôture pas la caisse ; le gérant clôture sans écart", async () => {
    const theoretical = (await balanceOf("canal_cash")) ?? 0;
    expect(
      (await post("/closures", { registerId: "canal_cash", countedAmount: theoretical }, caissier)).status,
    ).toBe(403);
    const ok = await post("/closures", { registerId: "canal_cash", countedAmount: theoretical });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ gap: 0, theoreticalAmount: 5000, countedAmount: 5000 });
    expect(await balanceOf("canal_cash")).toBe(5000);
    expect((await post("/closures", { registerId: "canal_cash", countedAmount: 5000 })).status).toBe(409);
  });

  it("un écart de clôture exige une justification, aligne le solde et prévient le PDG", async () => {
    const theoretical = (await balanceOf("sales_cash")) ?? 0;
    const counted = theoretical - 300;
    const noWhy = await post("/closures", { registerId: "sales_cash", countedAmount: counted });
    expect(noWhy.status).toBe(422);
    expect(((await noWhy.json()) as { error: { code: string } }).error.code).toBe("justification_required");
    const ok = await post("/closures", {
      registerId: "sales_cash",
      countedAmount: counted,
      justification: "Monnaie rendue en trop",
    });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ gap: -300 });
    expect(await balanceOf("sales_cash")).toBe(counted);
    const fdc = (await t.deps.db.query.cashEntries.findMany()).find((e) => e.type === "FDC");
    expect(fdc).toMatchObject({ direction: "out", amount: 300, justification: "Monnaie rendue en trop" });
    const notes = await t.deps.db.query.notifications.findMany();
    expect(notes.some((x) => x.message.includes("-300"))).toBe(true);
    const list = await t.app.request("/api/v1/cash/closures?date=2026-11-24", authGet(pdg));
    expect(((await list.json()) as unknown[]).length).toBe(2);
    expect(
      ((await (await t.app.request("/api/v1/cash/closures", authGet(pdg))).json()) as unknown[]).length,
    ).toBe(2);
  });

  it("le seuil d'écart sans justification est réglable par le PDG", async () => {
    const put = (threshold: number, token: string) =>
      t.app.request("/api/v1/cash/closure-threshold", { ...jsonPost({ threshold }, token), method: "PUT" });
    expect((await put(500, gerant)).status).toBe(403);
    expect((await put(500, pdg)).status).toBe(200);
    const theoretical = (await balanceOf("canal_om")) ?? 0;
    const small = await post("/closures", { registerId: "canal_om", countedAmount: theoretical + 200 });
    expect(small.status).toBe(201);
    t.clock.advanceMinutes(24 * 60);
    const big = await post("/closures", { registerId: "canal_om", countedAmount: theoretical + 200 + 501 });
    expect(big.status).toBe(422);
  });

  it("la clôture du lendemain est de nouveau possible", async () => {
    const theoretical = (await balanceOf("canal_cash")) ?? 0;
    const res = await post("/closures", { registerId: "canal_cash", countedAmount: theoretical });
    expect(res.status).toBe(201);
  });
});
