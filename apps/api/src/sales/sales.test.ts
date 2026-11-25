import { schema } from "@jarvis/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerBalance } from "../cash/ledger.js";
import { appendStockMove, stockOf } from "../stock/ledger.js";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

type G = Awaited<ReturnType<typeof seedGas>>;
const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("ventes au comptoir (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let gerant: string;
  let g: G;
  let counter = 0;

  const sale = (body: unknown, token = gerant, key?: string) =>
    t.app.request(
      "/api/v1/sales",
      jsonPost(body, token, { "Idempotency-Key": key ?? `cle-vente-${++counter}-${Math.random()}` }),
    );
  const gas = (brandId: string, quantity = 1, returnedBrandId?: string) => ({
    kind: "gas" as const,
    brandId,
    formatId: g.format.id,
    quantity,
    ...(returnedBrandId ? { returnedBrandId } : {}),
  });
  const full = (brandId: string) => stockOf(t.deps.db, brandId, g.format.id, "full");
  const empty = (brandId: string) => stockOf(t.deps.db, brandId, g.format.id, "empty");

  beforeAll(async () => {
    t = await createTestApp();
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    g = await seedGas(t.deps, id, 3);
    gerant = await t.tokenFor("gerant1");
  });
  afterAll(() => t.close());

  it("exige une session et un profil autorisé", async () => {
    const body = { customerName: "Awa", paymentMethod: "cash", lines: [gas(g.alpha.id)] };
    expect((await t.app.request("/api/v1/sales", jsonPost(body))).status).toBe(401);
    expect((await sale(body, await t.tokenFor("livreur1"))).status).toBe(403);
  });

  it("refuse une vente de gaz sans nom de client", async () => {
    expect((await sale({ paymentMethod: "cash", lines: [gas(g.alpha.id)] })).status).toBe(422);
  });

  it("refuse toute vente à crédit", async () => {
    const res = await sale({ customerName: "Awa", paymentMethod: "credit", lines: [gas(g.alpha.id)] });
    expect(res.status).toBe(422);
  });

  it("vend une recharge à 6 800 : stock, journal de caisse et solde calculés", async () => {
    const res = await sale({
      customerName: "Aïssatou Diop",
      paymentMethod: "cash",
      lines: [gas(g.alpha.id)],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { total: number; number: string; lines: { packagingGap: number }[] };
    expect(body.total).toBe(6800);
    expect(body.number).toBe("TK000001");
    expect(body.lines[0]?.packagingGap).toBe(0);
    expect(await full(g.alpha.id)).toBe(2);
    expect(await empty(g.alpha.id)).toBe(1);
    expect(await registerBalance(t.deps.db, "sales_cash")).toBe(6800);
    const entry = await t.deps.db.query.cashEntries.findFirst();
    expect(entry).toMatchObject({ type: "REG", direction: "in", amount: 6800, balanceAfter: 6800 });
    expect(entry?.number).toBe("RG000001");
  });

  it("livraison : +400 par bouteille, encaissée dans la caisse OM et MoMo", async () => {
    const res = await sale({
      customerName: "Moussa",
      paymentMethod: "orange_money",
      deliveryFeePerBottle: 400,
      lines: [gas(g.boreal.id)],
    });
    expect(((await res.json()) as { total: number }).total).toBe(7200);
    expect(await registerBalance(t.deps.db, "settlement_om_momo")).toBe(7200);
  });

  it("échange entre marques : un plein retiré, un vide rapporté, écart en perte, prix inchangé", async () => {
    const res = await sale({
      customerName: "Fatou",
      paymentMethod: "cash",
      lines: [gas(g.alpha.id, 1, g.boreal.id)],
    });
    const body = (await res.json()) as {
      total: number;
      lines: { packagingGap: number; returnedBrandId: string }[];
    };
    expect(body.total).toBe(6800);
    expect(body.lines[0]).toMatchObject({ packagingGap: -2500, returnedBrandId: g.boreal.id });
    expect(await full(g.alpha.id)).toBe(1);
    expect(await empty(g.boreal.id)).toBe(2); // 1 de la livraison + 1 rapporté ici
    expect(await empty(g.alpha.id)).toBe(1);
  });

  it("échange gagnant : la bouteille rapportée vaut plus que celle remise", async () => {
    const res = await sale({
      customerName: "Fatou",
      paymentMethod: "cash",
      lines: [gas(g.cobalt.id, 1, g.alpha.id)],
    });
    const body = (await res.json()) as { lines: { packagingGap: number }[] };
    expect(body.lines[0]?.packagingGap).toBe(4100);
  });

  it("bloque la vente à stock nul, sans rien écrire", async () => {
    const before = await t.deps.db.select().from(schema.sales);
    const res = await sale({ customerName: "Awa", paymentMethod: "cash", lines: [gas(g.alpha.id, 2)] });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("out_of_stock");
    expect(await t.deps.db.select().from(schema.sales)).toHaveLength(before.length);
    expect(
      (await sale({ customerName: "Awa", paymentMethod: "cash", lines: [gas(g.alpha.id)] })).status,
    ).toBe(201);
    expect(
      (await sale({ customerName: "Awa", paymentMethod: "cash", lines: [gas(g.alpha.id)] })).status,
    ).toBe(409);
  });

  it("compte ensemble les lignes de même marque", async () => {
    const res = await sale({
      customerName: "Awa",
      paymentMethod: "cash",
      lines: [gas(g.boreal.id), gas(g.boreal.id, 3)],
    });
    expect(res.status).toBe(409);
  });

  it("rejouer la même clé d'idempotence ne crée aucun doublon", async () => {
    const body = { customerName: "Idem", paymentMethod: "cash", lines: [gas(g.cobalt.id)] };
    const first = await sale(body, gerant, "cle-rejeu-0001");
    const stockAfterFirst = await full(g.cobalt.id);
    const second = await sale(body, gerant, "cle-rejeu-0001");
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("Idempotent-Replay")).toBe("true");
    expect(await second.json()).toEqual(await first.json());
    expect(await full(g.cobalt.id)).toBe(stockAfterFirst);
  });

  it("refuse la même clé avec un autre contenu", async () => {
    const other = { customerName: "Autre", paymentMethod: "cash", lines: [gas(g.cobalt.id)] };
    const res = await sale(other, gerant, "cle-rejeu-0001");
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("idempotency_conflict");
  });

  it("un échec n'est pas mémorisé : la même clé peut être retentée", async () => {
    const body = { customerName: "Awa", paymentMethod: "cash", lines: [gas(g.alpha.id, 5)] };
    expect((await sale(body, gerant, "cle-echec-0001")).status).toBe(409);
    expect((await sale(body, gerant, "cle-echec-0001")).status).toBe(409);
  });

  it("refuse une clé d'idempotence invalide", async () => {
    const res = await sale(
      { customerName: "A", paymentMethod: "cash", lines: [gas(g.cobalt.id)] },
      gerant,
      "court",
    );
    expect(res.status).toBe(422);
  });

  it("vend un article libre sans nom de client (Client comptoir) et suit son stock", async () => {
    const [art] = await t.deps.db
      .insert(schema.articles)
      .values({ name: "Détendeur", price: 3000, trackStock: true, stockQty: 2 })
      .returning();
    if (!art) throw new Error("fixture");
    const line = { kind: "article", articleId: art.id, quantity: 2 };
    const res = await sale({ paymentMethod: "momo", lines: [line] });
    expect(res.status).toBe(201);
    expect(((await res.json()) as { customerName: string }).customerName).toBe("Client comptoir");
    expect((await sale({ paymentMethod: "momo", lines: [{ ...line, quantity: 1 }] })).status).toBe(409);
  });

  it("refuse un article ou une marque inconnus", async () => {
    const article = { kind: "article", articleId: UNKNOWN, quantity: 1 };
    expect((await sale({ paymentMethod: "cash", lines: [article] })).status).toBe(404);
    expect((await sale({ customerName: "A", paymentMethod: "cash", lines: [gas(UNKNOWN)] })).status).toBe(
      404,
    );
  });

  it("refuse une livraison au-dessus du plafond fixé par le PDG", async () => {
    await t.deps.db.insert(schema.settings).values({ key: "delivery_fee_ceiling", value: "500" });
    const res = await sale({
      customerName: "A",
      paymentMethod: "cash",
      deliveryFeePerBottle: 600,
      lines: [gas(g.cobalt.id)],
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("price_above_ceiling");
  });

  it("liste et relit les ventes ; recherche de client dès les premières lettres", async () => {
    const list = await t.app.request("/api/v1/sales", authGet(gerant));
    const sales = (await list.json()) as { id: string }[];
    expect(sales.length).toBeGreaterThan(3);
    expect((await t.app.request(`/api/v1/sales/${sales[0]?.id}`, authGet(gerant))).status).toBe(200);
    expect((await t.app.request(`/api/v1/sales/${UNKNOWN}`, authGet(gerant))).status).toBe(404);
    const search = async (q: string) =>
      (await (await t.app.request(`/api/v1/customers?q=${q}`, authGet(gerant))).json()) as { name: string }[];
    expect((await search("ais")).map((c) => c.name)).toEqual(["Aïssatou Diop"]);
    expect(await search("dio")).toHaveLength(1);
    expect(await search("")).toHaveLength(0);
  });

  it("le journal ne peut être modifié, même par accès direct à la base", async () => {
    await expect(t.deps.db.update(schema.sales).set({ total: 1 })).rejects.toThrow();
    await expect(t.deps.db.delete(schema.stockMoves)).rejects.toThrow();
  });

  it("échange avec une valeur d'emballage inconnue : vente acceptée, écart non calculé, PDG notifié", async () => {
    const author = (await t.deps.db.query.users.findFirst())?.id ?? "";
    const [delta] = await t.deps.db
      .insert(schema.brands)
      .values({ name: "Delta", packagingValue: 0, packagingValueKnown: false })
      .returning();
    if (!delta) throw new Error("marque");
    await appendStockMove(t.deps.db, {
      brandId: delta.id,
      formatId: g.format.id,
      state: "full",
      delta: 3,
      reason: "reception",
      authorId: author,
    });
    const body = { customerName: "Awa", paymentMethod: "cash" };
    const same = await sale({ ...body, lines: [gas(delta.id, 1, delta.id)] });
    const sameLine = ((await same.json()) as { lines: Record<string, unknown>[] }).lines[0];
    expect(sameLine).toMatchObject({ packagingGap: 0, packagingGapPending: false });
    const res = await sale({ ...body, lines: [gas(delta.id, 1, g.boreal.id)] });
    expect(res.status).toBe(201);
    const made = (await res.json()) as { total: number; number: string; lines: Record<string, unknown>[] };
    expect(made.total).toBe(6800);
    expect(made.lines[0]).toMatchObject({ packagingGap: 0, packagingGapPending: true });
    const notes = await t.deps.db.query.notifications.findMany();
    expect(
      notes.some((n) => n.message.includes("valeur d'emballage inconnue") && n.message.includes(made.number)),
    ).toBe(true);
    const audit = await t.deps.db.query.auditLog.findMany({
      where: (a, { eq }) => eq(a.action, "sale.packaging_unknown"),
    });
    expect(audit).toHaveLength(1);
  });
});
