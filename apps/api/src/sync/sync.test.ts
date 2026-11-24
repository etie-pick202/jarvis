import { schema } from "@jarvis/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stockOf } from "../stock/ledger.js";
import { addUser, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { isStockConflict, operationHash } from "./service.js";

type G = Awaited<ReturnType<typeof seedGas>>;
type Result = {
  result?: unknown;
  clientOpId: string;
  status: string;
  applied: boolean;
  conflict?: string;
  error?: { code: string };
};

describe("règles de synchronisation", () => {
  it("l'empreinte dépend du type et du contenu", () => {
    const a = operationHash({ type: "sale", payload: { x: 1 } });
    expect(a).toBe(operationHash({ type: "sale", payload: { x: 1 } }));
    expect(a).not.toBe(operationHash({ type: "sale", payload: { x: 2 } }));
    expect(a).not.toBe(operationHash({ type: "expense", payload: { x: 1 } }));
  });
  it("reconnaît les conflits de stock", () => {
    expect(isStockConflict("out_of_stock")).toBe(true);
    expect(isStockConflict("stock_conflict")).toBe(true);
    expect(isStockConflict("forbidden")).toBe(false);
  });
});

describe("rejeu hors ligne (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: G;
  let gerant: string;
  let caissier: string;
  let livreur: string;

  const op = (
    clientOpId: string,
    type: string,
    payload: unknown,
    occurredAt = "2026-11-24T07:30:00.000Z",
  ) => ({
    clientOpId,
    type,
    occurredAt,
    payload,
  });
  const replay = async (operations: unknown[], token = gerant) => {
    const res = await t.app.request("/api/v1/sync/replay", jsonPost({ operations }, token));
    return { status: res.status, results: ((await res.json()) as { results: Result[] }).results };
  };
  const saleBody = (brandId: string, quantity = 1) => ({
    customerName: "Awa",
    paymentMethod: "cash",
    lines: [{ kind: "gas", brandId, formatId: g.format.id, quantity }],
  });
  const full = (b: string) => stockOf(t.deps.db, b, g.format.id, "full");

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    g = await seedGas(t.deps, id, 2);
    gerant = await t.tokenFor("gerant1");
    caissier = await t.tokenFor("caissier1");
    livreur = await t.tokenFor("livreur1");
  });
  afterAll(() => t.close());

  it("exige une session et un profil autorisé, et un lot valide", async () => {
    expect((await t.app.request("/api/v1/sync/replay", jsonPost({ operations: [] }))).status).toBe(401);
    expect((await replay([op("op-livreur-1", "sale", saleBody(g.alpha.id))], livreur)).status).toBe(403);
    expect((await replay([])).status).toBe(422);
    expect((await replay([{ clientOpId: "court", type: "sale", occurredAt: "x", payload: {} }])).status).toBe(
      422,
    );
  });

  it("applique les opérations dans l'ordre et rejouer le lot ne crée aucun doublon", async () => {
    const batch = [
      op("op-vente-0001", "sale", saleBody(g.alpha.id)),
      op("op-depense-001", "expense", { registerId: "sales_cash", amount: 500, label: "Sachets" }),
      op("op-vente-0002", "sale", saleBody(g.boreal.id)),
    ];
    const first = await replay(batch);
    expect(first.results.map((r) => r.status)).toEqual(["applied", "applied", "applied"]);
    const salesBefore = (await t.deps.db.select().from(schema.sales)).length;
    const second = await replay(batch);
    expect(second.results.map((r) => r.status)).toEqual(["duplicate", "duplicate", "duplicate"]);
    expect(second.results.every((r) => r.applied)).toBe(true);
    expect((await t.deps.db.select().from(schema.sales)).length).toBe(salesBefore);
    expect(await full(g.alpha.id)).toBe(1);
    const sale = (await t.deps.db.select().from(schema.sales))[0];
    expect(sale?.occurredAt?.toISOString()).toBe("2026-11-24T07:30:00.000Z");
  });

  it("une même clé avec un autre contenu est refusée", async () => {
    const { results } = await replay([op("op-vente-0001", "sale", saleBody(g.alpha.id, 2))]);
    expect(results[0]).toMatchObject({ status: "rejected", error: { code: "idempotency_conflict" } });
  });

  it("vente hors ligne en rupture : enregistrée, écart de stock signalé au PDG, rien d'écrasé", async () => {
    const { results } = await replay([op("op-vente-0003", "sale", saleBody(g.alpha.id, 3))], caissier);
    expect(results[0]).toMatchObject({ status: "conflict", applied: true });
    expect(results[0]?.conflict).toContain("Rupture");
    expect(await full(g.alpha.id)).toBe(-2); // le stock négatif montre l'écart au lieu de le cacher
    const notes = await t.deps.db.query.notifications.findMany();
    expect(notes.some((n) => n.message.includes("Conflit de stock"))).toBe(true);
    const again = await replay([op("op-vente-0003", "sale", saleBody(g.alpha.id, 3))], caissier);
    expect(again.results[0]).toMatchObject({
      status: "duplicate",
      conflict: expect.stringContaining("Rupture"),
    });
    const levels = await t.app.request("/api/v1/stock", { headers: { authorization: `Bearer ${gerant}` } });
    const alpha = ((await levels.json()) as { brandId: string; available: boolean; low: boolean }[]).find(
      (l) => l.brandId === g.alpha.id,
    );
    expect(alpha).toMatchObject({ available: false, low: true });
  });

  it("une réception en conflit de stock est conservée à l'audit, pas appliquée", async () => {
    const [supplier] = await t.deps.db.insert(schema.suppliers).values({ name: "Dépôt" }).returning();
    const user = await t.deps.db.query.users.findFirst();
    const [piece] = await t.deps.db
      .insert(schema.receiptFiles)
      .values({ contentType: "image/png", size: 1, data: Buffer.from("x"), uploadedBy: user?.id ?? "" })
      .returning();
    const payload = {
      supplierId: supplier?.id,
      receiptId: piece?.id,
      lines: [
        { brandId: g.cobalt.id, formatId: g.format.id, fullReceived: 0, emptyReturned: 5, unitCost: 6170 },
      ],
    };
    const { results } = await replay([op("op-reception-1", "reception", payload)]);
    expect(results[0]).toMatchObject({
      status: "conflict",
      applied: false,
      error: { code: "stock_conflict" },
    });
    const audit = await t.deps.db.query.auditLog.findMany({
      where: (a, { eq }) => eq(a.action, "sync.stock_conflict"),
    });
    expect(audit.some((a) => a.entityId === "op-reception-1")).toBe(true);
    // Une fois le stock corrigé, la même clé peut être rejouée avec succès.
    const ok = await replay([
      op("op-reception-1", "reception", {
        ...payload,
        lines: [{ ...payload.lines[0], emptyReturned: 0, fullReceived: 4 }],
      }),
    ]);
    expect(ok.results[0]?.status).toBe("applied");
  });

  it("refuse une opération invalide ou interdite sans bloquer les suivantes", async () => {
    const { results } = await replay(
      [
        op("op-invalide-1", "sale", { paymentMethod: "cash", lines: [] }),
        op("op-interdit-1", "reception", {}),
        op("op-comptage-1", "inventory_evening", {
          lines: [
            {
              brandId: g.boreal.id,
              formatId: g.format.id,
              countedFull: await full(g.boreal.id),
              countedEmpty: 1,
            },
          ],
          justification: "Vide non saisi",
        }),
        op("op-transfert-1", "transfer", {
          fromRegisterId: "sales_cash",
          toRegisterId: "canal_cash",
          amount: 100,
          label: "Fonds",
        }),
        op("op-hebdo-0001", "inventory_weekly", {
          lines: [
            {
              brandId: g.cobalt.id,
              formatId: g.format.id,
              countedFull: await full(g.cobalt.id),
              countedEmpty: 0,
            },
          ],
        }),
      ],
      gerant,
    );
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "applied", "applied", "applied"]);
    expect(results[0]?.error?.code).toBe("invalid_request");
    const forbidden = await replay([op("op-caissier-01", "reception", {})], caissier);
    expect(forbidden.results[0]).toMatchObject({ status: "rejected", error: { code: "forbidden" } });
  });

  it("utilise le prix en vigueur à l'heure réelle de la vente", async () => {
    t.clock.advanceMinutes(120);
    await t.deps.db.insert(schema.gasPrices).values({
      formatId: g.format.id,
      amount: 7000,
      transportContribution: 300,
      purchaseCost: 6170,
      effectiveFrom: new Date("2026-11-24T09:00:00.000Z"),
    });
    const early = await replay([
      op("op-prix-0001", "sale", saleBody(g.cobalt.id), "2026-11-24T08:00:00.000Z"),
    ]);
    const late = await replay([
      op("op-prix-0002", "sale", saleBody(g.cobalt.id), "2026-11-24T09:30:00.000Z"),
    ]);
    expect(early.results[0]?.result).toMatchObject({ total: 6800 });
    expect(late.results[0]?.result).toMatchObject({ total: 7300 });
  });
});
