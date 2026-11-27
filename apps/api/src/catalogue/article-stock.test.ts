import { schema } from "@jarvis/db";
import { article, articleMoves } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";

const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("articles libres : stock, mouvements, ajustement, réapprovisionnement (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let gerant: string;
  let caissier: string;
  let receiptId: string;

  const api = (path: string, body?: unknown, token = gerant) =>
    t.app.request(`/api/v1${path}`, body === undefined ? authGet(token) : jsonPost(body, token));
  const create = async (extra: Record<string, unknown>) =>
    article.parse(await (await api("/catalogue/articles", { name: "Tuyau", price: 1500, ...extra })).json());
  const moves = async (id: string) =>
    articleMoves.parse(await (await api(`/catalogue/articles/${id}/moves`)).json());

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    const [piece] = await t.deps.db
      .insert(schema.receiptFiles)
      .values({ contentType: "image/png", size: 1, data: Buffer.from("x"), uploadedBy: id })
      .returning();
    receiptId = piece?.id ?? "";
    [gerant, caissier] = [await t.tokenFor("gerant1"), await t.tokenFor("caissier1")];
  });
  afterAll(() => t.close());

  it("catégorie, seuil et stock de départ à la création", async () => {
    const hose = await create({ category: "Accessoires", lowThreshold: 2, initialQty: 5, trackStock: true });
    expect(hose).toMatchObject({ category: "Accessoires", lowThreshold: 2, stockQty: 5 });
    expect(await moves(hose.id)).toMatchObject([{ kind: "entry", delta: 5, authorName: "gerant1" }]);
    const untracked = await api("/catalogue/articles", { name: "Service", price: 500, initialQty: 3 });
    expect(untracked.status).toBe(422);
    const bare = await create({ name: "Joint" });
    expect(bare).toMatchObject({ category: "", lowThreshold: 0, stockQty: 0 });
  });

  it("vente, annulation et ajustement apparaissent dans les mouvements", async () => {
    const item = await create({ name: "Détendeur", initialQty: 4, trackStock: true });
    const sold = await api("/sales", {
      paymentMethod: "cash",
      lines: [{ kind: "article", articleId: item.id, quantity: 2 }],
    });
    const { id: saleId } = (await sold.json()) as { id: string };
    await api(`/sales/${saleId}/cancel`, { justification: "Erreur de saisie" });
    const adjust = (body: unknown, token = gerant) =>
      api(`/catalogue/articles/${item.id}/adjust`, body, token);
    expect((await adjust({ delta: -1 })).status).toBe(422);
    expect((await adjust({ delta: 0, justification: "Rien à faire" })).status).toBe(422);
    expect((await adjust({ delta: -9, justification: "Casse en rayon" })).status).toBe(409);
    expect((await adjust({ delta: -1, justification: "Casse en rayon" }, caissier)).status).toBe(403);
    const done = await adjust({ delta: -1, justification: "Casse en rayon" });
    expect(article.parse(await done.json()).stockQty).toBe(3);
    expect((await moves(item.id)).map((m) => [m.kind, m.delta]).sort()).toEqual(
      [
        ["adjustment", -1],
        ["entry", 4],
        ["sale", -2],
        ["sale", 2],
      ].sort(),
    );
  });

  it("réapprovisionnement : refusé sans pièce, met à jour le coût d'achat", async () => {
    const item = await create({ name: "Réchaud", trackStock: true });
    const restock = (body: unknown, id = item.id) => api(`/catalogue/articles/${id}/restock`, body);
    expect((await restock({ quantity: 3 })).status).toBe(422);
    expect((await restock({ quantity: 3, receiptId: UNKNOWN })).status).toBe(422);
    const done = await restock({ quantity: 3, receiptId, unitCost: 900 });
    expect(article.parse(await done.json())).toMatchObject({ stockQty: 3, purchaseCost: 900 });
    expect((await restock({ quantity: 1, receiptId }, UNKNOWN)).status).toBe(404);
    const service = await create({ name: "Pose" });
    expect((await restock({ quantity: 1, receiptId }, service.id)).status).toBe(422);
    expect((await api(`/catalogue/articles/${UNKNOWN}/moves`)).status).toBe(404);
  });
});
