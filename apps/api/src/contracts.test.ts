import { schema } from "@jarvis/db";
import {
  auditRows,
  brand,
  cashJournal,
  closureThresholdResult,
  countRows,
  customerRows,
  customerStats,
  dashboard,
  format,
  gasPrice,
  gasSituation,
  loginResult,
  notificationRows,
  receiptSaved,
  receptionRows,
  registerRows,
  replayResponse,
  sale,
  stockRows,
  supplierRows,
  xReport,
} from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type ZodType, z } from "zod";
import { addUser, authGet, createTestApp, jsonPost, TEST_PASSWORD } from "./testing/db.js";
import { seedGas } from "./testing/fixtures.js";

/**
 * Contrat : les schémas de réponse publiés par `@jarvis/shared` décrivent exactement ce que le serveur renvoie.
 * Si une route change de forme, ce test échoue avant le front.
 */
describe("contrat des réponses de lecture", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let n = 0;
  const send = (path: string, body: unknown, token: string, method = "POST") =>
    t.app.request(`/api/v1${path}`, {
      ...jsonPost(body, token, { "Idempotency-Key": `cle-contrat-${++n}` }),
      method,
    });
  const read = async <T>(schema: ZodType<T>, path: string, token = gerant, status = 200): Promise<T> => {
    const res = await t.app.request(`/api/v1${path}`, authGet(token));
    expect(res.status, path).toBe(status);
    const parsed = schema.safeParse(await res.json());
    expect(parsed.success, `${path} : ${parsed.success ? "" : parsed.error.message}`).toBe(true);
    return parsed.data as T;
  };

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    const g = await seedGas(t.deps, id, 10);
    [pdg, gerant, caissier] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
    ];
    // Ventes : un retrait, un échange, une annulation.
    const line = (brandId: string, returned?: string) => ({
      kind: "gas",
      brandId,
      formatId: g.format.id,
      quantity: 1,
      ...(returned ? { returnedBrandId: returned } : {}),
    });
    await send("/sales", { customerName: "Awa", paymentMethod: "cash", lines: [line(g.alpha.id)] }, caissier);
    const swap = await send(
      "/sales",
      { customerName: "Moussa", paymentMethod: "momo", lines: [line(g.alpha.id, g.boreal.id)] },
      caissier,
    );
    await send(
      `/sales/${((await swap.json()) as { id: string }).id}/cancel`,
      { justification: "Erreur de saisie" },
      gerant,
    );
    await send("/cash/expenses", { registerId: "sales_cash", amount: 500, label: "Sachets" }, gerant);
    // Réception avec pièce, comptage en écart (à valider), clôture avec écart.
    const supplier = await send("/suppliers", { name: "Dépôt contrat", brandIds: [g.alpha.id] }, gerant);
    const supplierId = ((await supplier.json()) as { id: string }).id;
    const [piece] = await t.deps.db
      .insert(schema.receiptFiles)
      .values({ contentType: "image/png", size: 1, data: Buffer.from("x"), uploadedBy: id })
      .returning();
    await send(
      "/receptions",
      {
        supplierId,
        receiptId: piece?.id,
        lines: [
          { brandId: g.cobalt.id, formatId: g.format.id, fullReceived: 2, emptyReturned: 0, unitCost: 6170 },
        ],
      },
      gerant,
    );
    await send(
      "/inventory/weekly",
      {
        lines: [{ brandId: g.boreal.id, formatId: g.format.id, countedFull: 1, countedEmpty: 0 }],
        justification: "Bouteille cassée",
      },
      gerant,
    );
    await send("/cash/closures", { registerId: "canal_cash", countedAmount: 0 }, gerant);
    const replay = await send(
      "/sync/replay",
      {
        operations: [
          {
            clientOpId: "op-contrat-001",
            type: "expense",
            occurredAt: "2026-11-24T07:00:00.000Z",
            payload: { registerId: "sales_cash", amount: 100, label: "Café" },
          },
        ],
      },
      gerant,
    );
    expect(replayResponse.safeParse(await replay.json()).success).toBe(true);
  });
  afterAll(() => t.close());

  it("session, catalogue et ventes", async () => {
    const login = await t.app.request(
      "/api/v1/auth/login",
      jsonPost({ username: "gerant1", password: TEST_PASSWORD }),
    );
    expect(loginResult.safeParse(await login.json()).success).toBe(true);
    await read(z.array(brand), "/catalogue/brands");
    const formats = await read(z.array(format), "/catalogue/formats");
    const sales = (await (await t.app.request("/api/v1/sales", authGet(gerant))).json()) as {
      lines: unknown[];
    }[];
    expect(sales.length).toBeGreaterThanOrEqual(3);
    for (const s of sales) expect(sale.safeParse(s).success).toBe(true);
    await read(gasPrice, `/catalogue/prices/${formats[0]?.id}/current`, caissier);
  });

  it("stock, fournisseurs, réceptions et comptages", async () => {
    const stock = await read(stockRows, "/stock");
    expect(stock.length).toBeGreaterThan(0);
    expect((await read(supplierRows, "/suppliers")).length).toBe(1);
    expect((await read(receptionRows, "/receptions")).length).toBe(1);
    const counts = await read(countRows, "/inventory");
    expect(counts[0]).toMatchObject({ kind: "weekly", status: "pending", authorName: expect.any(String) });
    const piece = await t.app.request("/api/v1/receipts", {
      method: "POST",
      headers: { authorization: `Bearer ${gerant}`, "content-type": "image/png" },
      body: new Uint8Array([137, 80, 78, 71]),
    });
    expect(receiptSaved.safeParse(await piece.json()).success).toBe(true);
  });

  it("caisses, clients, audit et notifications", async () => {
    const registers = await read(registerRows, "/cash/registers");
    expect(registers.find((r) => r.id === "sales_cash")?.opening).toBe(0);
    await read(closureThresholdResult, "/cash/closure-threshold", caissier);
    await read(customerRows, "/customers?q=aw", caissier);
    const audit = await read(auditRows, "/control/audit", pdg);
    expect(audit.some((a) => a.actorName !== null)).toBe(true);
    await read(notificationRows, "/control/notifications", pdg);
  });

  it("rapports et tableau de bord", async () => {
    await read(customerStats, "/reports/customers?date=2026-11-24");
    await read(cashJournal, "/reports/cash-journal?date=2026-11-24");
    await read(xReport, "/reports/x?date=2026-11-24");
    await read(gasSituation, "/reports/gas-situation");
    const board = await read(dashboard, "/reports/dashboard?date=2026-11-24", pdg);
    expect(board.sales.count).toBeGreaterThanOrEqual(2);
  });
});
