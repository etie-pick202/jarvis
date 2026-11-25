import { schema } from "@jarvis/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { stockOf } from "./ledger.js";
import { countGap, isAvailable, isLowStock, parseThreshold, thresholdKey } from "./rules.js";

type G = Awaited<ReturnType<typeof seedGas>>;
const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
const PNG = Buffer.from("89504e470d0a1a0a", "hex");

describe("règles de stock", () => {
  it("calcule l'écart, la disponibilité et le seuil bas", () => {
    expect(countGap(8, 10)).toBe(-2);
    expect(countGap(10, 10)).toBe(0);
    expect(isAvailable(0)).toBe(false);
    expect(isAvailable(1)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });
  it("lit les seuils et retombe sur le défaut si le réglage est invalide", () => {
    expect(thresholdKey()).toBe("low_stock:default");
    expect(thresholdKey("b", "f")).toBe("low_stock:b:f");
    expect(parseThreshold("3", 5)).toBe(3);
    expect(parseThreshold("abc", 5)).toBe(5);
    expect(parseThreshold("-1", 5)).toBe(5);
    expect(parseThreshold(undefined, 5)).toBe(5);
  });
});

describe("stock gaz (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: G;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let livreur: string;
  let supplierId: string;
  let n = 0;

  const post = (path: string, body: unknown, token = gerant) =>
    t.app.request(
      `/api/v1${path}`,
      jsonPost(body, token, { "Idempotency-Key": `cle-stock-${++n}-${Math.random()}` }),
    );
  const upload = (token = gerant, type = "image/png", data: Buffer = PNG) =>
    t.app.request("/api/v1/receipts", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": type },
      body: new Uint8Array(data),
    });
  const levels = async () =>
    (await (await t.app.request("/api/v1/stock", authGet(caissier))).json()) as {
      brandId: string;
      full: number;
      empty: number;
      low: boolean;
      available: boolean;
    }[];
  const line = (brandId: string, over: Record<string, number> = {}) => ({
    brandId,
    formatId: g.format.id,
    fullReceived: 5,
    emptyReturned: 0,
    unitCost: 6170,
    ...over,
  });
  const receipt = async () => ((await (await upload()).json()) as { id: string }).id;

  beforeAll(async () => {
    t = await createTestApp();
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    g = await seedGas(t.deps, id, 2);
    pdg = await t.tokenFor("pdg1");
    gerant = await t.tokenFor("gerant1");
    caissier = await t.tokenFor("caissier1");
    livreur = await t.tokenFor("livreur1");
  });
  afterAll(() => t.close());

  it("le caissier lit le stock, le livreur non ; les niveaux viennent du journal", async () => {
    expect((await t.app.request("/api/v1/stock", authGet(livreur))).status).toBe(403);
    expect((await t.app.request("/api/v1/stock")).status).toBe(401);
    const all = await levels();
    expect(all).toHaveLength(3);
    expect(all.every((l) => l.full === 2 && l.empty === 0 && l.available)).toBe(true);
  });

  it("alerte de seuil bas paramétrable (défaut 5, exception par marque)", async () => {
    const alerts = async () =>
      (await (await t.app.request("/api/v1/stock/alerts", authGet(gerant))).json()) as unknown[];
    expect(await alerts()).toHaveLength(3);
    const put = (body: unknown, token: string) =>
      t.app.request("/api/v1/stock/thresholds", { ...jsonPost(body, token), method: "PUT" });
    expect((await put({ threshold: 1 }, gerant)).status).toBe(403);
    expect((await put({ threshold: 1 }, pdg)).status).toBe(200);
    expect(await alerts()).toHaveLength(0);
    expect((await put({ brandId: g.alpha.id, formatId: g.format.id, threshold: 3 }, pdg)).status).toBe(200);
    expect(await alerts()).toHaveLength(1);
    expect((await put({ brandId: g.alpha.id, threshold: 3 }, pdg)).status).toBe(422);
  });

  it("le gérant crée les fournisseurs et leurs marques fournies", async () => {
    expect((await post("/suppliers", { name: "Dépôt Essai" }, caissier)).status).toBe(403);
    const res = await post("/suppliers", {
      name: "Dépôt Essai",
      phone: "000",
      brandIds: [g.alpha.id, g.boreal.id],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; brandIds: string[] };
    supplierId = body.id;
    expect(body.brandIds).toHaveLength(2);
    expect((await post("/suppliers", { name: "Dépôt Essai" })).status).toBe(409);
    expect((await post("/suppliers", { name: "Autre", brandIds: [UNKNOWN] })).status).toBe(422);
    const patch = await t.app.request(`/api/v1/suppliers/${supplierId}`, {
      ...jsonPost({ brandIds: [g.alpha.id], phone: "111" }, gerant),
      method: "PATCH",
    });
    expect(((await patch.json()) as { brandIds: string[]; phone: string }).brandIds).toEqual([g.alpha.id]);
    const onlyBrands = await t.app.request(`/api/v1/suppliers/${supplierId}`, {
      ...jsonPost({ brandIds: [g.alpha.id, g.boreal.id] }, gerant),
      method: "PATCH",
    });
    expect(onlyBrands.status).toBe(200);
    const missing = await t.app.request(`/api/v1/suppliers/${UNKNOWN}`, {
      ...jsonPost({ name: "x" }, gerant),
      method: "PATCH",
    });
    expect(missing.status).toBe(404);
    const list = await t.app.request("/api/v1/suppliers", authGet(gerant));
    expect(((await list.json()) as unknown[]).length).toBe(1);
  });

  it("refuse une réception sans pièce justificative : le stock ne bouge pas", async () => {
    const before = await stockOf(t.deps.db, g.alpha.id, g.format.id, "full");
    const missing = await post("/receptions", { supplierId, lines: [line(g.alpha.id)] });
    expect(missing.status).toBe(422);
    const ghost = await post("/receptions", { supplierId, receiptId: UNKNOWN, lines: [line(g.alpha.id)] });
    expect(ghost.status).toBe(422);
    expect(((await ghost.json()) as { error: { code: string } }).error.code).toBe("receipt_required");
    expect(await stockOf(t.deps.db, g.alpha.id, g.format.id, "full")).toBe(before);
  });

  it("accepte seulement photo ou PDF de taille raisonnable", async () => {
    expect((await upload(gerant, "text/plain")).status).toBe(422);
    expect((await upload(gerant, "image/png", Buffer.alloc(0))).status).toBe(422);
    expect((await upload(gerant, "image/png", Buffer.alloc(8 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(livreur)).status).toBe(403);
    const ok = await upload(gerant, "application/pdf; charset=binary");
    expect(ok.status).toBe(201);
    const { id } = (await ok.json()) as { id: string };
    const file = await t.app.request(`/api/v1/receipts/${id}`, authGet(gerant));
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await file.arrayBuffer())).toEqual(PNG);
    expect((await t.app.request(`/api/v1/receipts/${UNKNOWN}`, authGet(gerant))).status).toBe(404);
  });

  it("enregistre une réception à sa date réelle : pleins reçus, vides rendus", async () => {
    await t.deps.db.insert(schema.stockMoves).values({
      brandId: g.alpha.id,
      formatId: g.format.id,
      state: "empty",
      delta: 4,
      reason: "inventory_adjustment",
      authorId: (await t.deps.db.query.users.findFirst())?.id ?? "",
    });
    const receiptId = await receipt();
    const res = await post("/receptions", {
      supplierId,
      receiptId,
      receivedAt: "2026-11-20T09:00:00.000Z",
      lines: [line(g.alpha.id, { fullReceived: 6, emptyReturned: 4 })],
    });
    expect(res.status).toBe(201);
    expect(await stockOf(t.deps.db, g.alpha.id, g.format.id, "full")).toBe(8);
    expect(await stockOf(t.deps.db, g.alpha.id, g.format.id, "empty")).toBe(0);
    const history = await t.app.request(
      `/api/v1/receptions?supplierId=${supplierId}&brandId=${g.alpha.id}`,
      authGet(gerant),
    );
    const rows = (await history.json()) as { receivedAt: string; lines: unknown[] }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.receivedAt).toBe("2026-11-20T09:00:00.000Z");
    const other = await t.app.request(`/api/v1/receptions?brandId=${g.cobalt.id}`, authGet(gerant));
    expect(await other.json()).toEqual([]);
  });

  it("refuse une réception datée du futur, trop de vides rendus, ou un fournisseur inconnu", async () => {
    const receiptId = await receipt();
    const base = { supplierId, receiptId, lines: [line(g.alpha.id)] };
    expect((await post("/receptions", { ...base, receivedAt: "2027-01-01T00:00:00.000Z" })).status).toBe(422);
    const tooMany = await post("/receptions", {
      ...base,
      lines: [line(g.alpha.id, { fullReceived: 0, emptyReturned: 3 })],
    });
    expect(tooMany.status).toBe(409);
    expect(((await tooMany.json()) as { error: { code: string } }).error.code).toBe("stock_conflict");
    expect((await post("/receptions", { ...base, supplierId: UNKNOWN })).status).toBe(404);
    expect((await post("/receptions", { ...base, lines: [] })).status).toBe(422);
    expect((await post("/receptions", { ...base, lines: [line(UNKNOWN)] })).status).toBe(404);
  });

  it("inventaire : un écart exige un justificatif, le PDG valide et le stock est ajusté", async () => {
    const counted = { brandId: g.boreal.id, formatId: g.format.id, countedFull: 1, countedEmpty: 0 };
    const noWhy = await post("/inventory/weekly", { lines: [counted] });
    expect(noWhy.status).toBe(422);
    expect(((await noWhy.json()) as { error: { code: string } }).error.code).toBe("justification_required");
    const ok = await post("/inventory/weekly", { lines: [counted], justification: "Bouteille cassée" });
    expect(ok.status).toBe(201);
    const [row] = (await ok.json()) as { id: string; gapFull: number }[];
    expect(row?.gapFull).toBe(-1);
    expect(await stockOf(t.deps.db, g.boreal.id, g.format.id, "full")).toBe(2); // pas encore validé
    expect((await t.app.request(`/api/v1/inventory/${row?.id}/validate`, jsonPost({}, gerant))).status).toBe(
      403,
    );
    const pending = await t.app.request("/api/v1/inventory?pending=1", authGet(gerant));
    expect(((await pending.json()) as unknown[]).length).toBe(1);
    const valid = await t.app.request(`/api/v1/inventory/${row?.id}/validate`, jsonPost({}, pdg));
    expect(valid.status).toBe(200);
    expect(await stockOf(t.deps.db, g.boreal.id, g.format.id, "full")).toBe(1);
    expect((await t.app.request(`/api/v1/inventory/${row?.id}/validate`, jsonPost({}, pdg))).status).toBe(
      409,
    );
    expect((await t.app.request(`/api/v1/inventory/${UNKNOWN}/validate`, jsonPost({}, pdg))).status).toBe(
      404,
    );
    const moves = await t.deps.db.query.stockMoves.findMany({
      where: (m, { eq }) => eq(m.reason, "inventory_adjustment"),
    });
    expect(moves.some((m) => m.justification === "Bouteille cassée" && m.delta === -1)).toBe(true);
    const notes = await t.deps.db.query.notifications.findMany();
    expect(notes.some((x) => x.recipientRole === "pdg")).toBe(true);
  });

  it("inventaire : le PDG refuse avec un motif, le stock reste intact et les noms d'auteur sont lus", async () => {
    const counted = { brandId: g.cobalt.id, formatId: g.format.id, countedFull: 0, countedEmpty: 0 };
    const created = await post("/inventory/weekly", { lines: [counted], justification: "Recompter" });
    const [row] = (await created.json()) as { id: string }[];
    const before = await stockOf(t.deps.db, g.cobalt.id, g.format.id, "full");
    const reject = (id: string | undefined, body: unknown, token = pdg) =>
      t.app.request(`/api/v1/inventory/${id}/reject`, jsonPost(body, token));
    expect((await reject(row?.id, { reason: "Pas conforme" }, gerant)).status).toBe(403);
    expect((await reject(row?.id, {})).status).toBe(422);
    expect((await reject(UNKNOWN, { reason: "Pas conforme" })).status).toBe(404);
    const done = await reject(row?.id, { reason: "Comptage à refaire" });
    expect(done.status).toBe(200);
    expect(await stockOf(t.deps.db, g.cobalt.id, g.format.id, "full")).toBe(before);
    expect((await reject(row?.id, { reason: "Encore refusé" })).status).toBe(409);
    expect((await t.app.request(`/api/v1/inventory/${row?.id}/validate`, jsonPost({}, pdg))).status).toBe(
      409,
    );
    const list = await t.app.request("/api/v1/inventory", authGet(gerant));
    const found = ((await list.json()) as Record<string, unknown>[]).find((r) => r.id === row?.id);
    expect(found).toMatchObject({
      status: "rejected",
      rejectionReason: "Comptage à refaire",
      authorName: expect.any(String),
      rejectedByName: expect.any(String),
      validatedByName: null,
    });
    const pending = await t.app.request("/api/v1/inventory?pending=1", authGet(gerant));
    expect(((await pending.json()) as { id: string }[]).some((r) => r.id === row?.id)).toBe(false);
    const audit = await t.deps.db.query.auditLog.findMany({
      where: (a, { eq }) => eq(a.action, "inventory.reject"),
    });
    expect(audit).toHaveLength(1);
  });

  it("confirmation du soir : sans écart rien à valider, avec écart justification et notification", async () => {
    const exact = {
      brandId: g.cobalt.id,
      formatId: g.format.id,
      countedFull: await stockOf(t.deps.db, g.cobalt.id, g.format.id, "full"),
      countedEmpty: 0,
    };
    const fine = await post("/inventory/evening", { lines: [exact] });
    expect(fine.status).toBe(201);
    expect(((await fine.json()) as { validatedAt: string | null }[])[0]?.validatedAt).not.toBeNull();
    const gap = await post("/inventory/evening", {
      lines: [{ ...exact, countedFull: exact.countedFull + 2 }],
    });
    expect(gap.status).toBe(422);
    const justified = await post("/inventory/evening", {
      lines: [{ ...exact, countedFull: exact.countedFull + 2 }],
      justification: "Livraison non saisie",
    });
    expect(justified.status).toBe(201);
    const audit = await t.deps.db.query.auditLog.findMany();
    expect(audit.map((a) => a.action)).toContain("inventory.evening.gap");
  });
});
