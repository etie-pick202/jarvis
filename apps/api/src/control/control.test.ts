import { schema } from "@jarvis/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { registerBalance } from "../cash/ledger.js";
import { requireJustification } from "../sales/cancel.js";
import { stockOf } from "../stock/ledger.js";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

type G = Awaited<ReturnType<typeof seedGas>>;
const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("justificatif obligatoire", () => {
  it("refuse un justificatif absent, vide ou trop court", () => {
    expect(() => requireJustification(undefined)).toThrow();
    expect(() => requireJustification("   ")).toThrow();
    expect(() => requireJustification("ok")).toThrow();
    expect(requireJustification("  Erreur de saisie ")).toBe("Erreur de saisie");
  });
});

describe("contrôle et traçabilité (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: G;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let n = 0;
  const call = (path: string, body: unknown, token = gerant) =>
    t.app.request(
      `/api/v1${path}`,
      jsonPost(body, token, { "Idempotency-Key": `cle-ctrl-${++n}-${Math.random()}` }),
    );
  const sell = async (brandId: string, returnedBrandId?: string, method = "cash") => {
    const res = await call(
      "/sales",
      {
        customerName: "Awa",
        paymentMethod: method,
        lines: [
          {
            kind: "gas",
            brandId,
            formatId: g.format.id,
            quantity: 1,
            ...(returnedBrandId ? { returnedBrandId } : {}),
          },
        ],
      },
      caissier,
    );
    return (await res.json()) as { id: string; number: string };
  };
  const full = (b: string) => stockOf(t.deps.db, b, g.format.id, "full");
  const empty = (b: string) => stockOf(t.deps.db, b, g.format.id, "empty");

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    g = await seedGas(t.deps, id, 5);
    pdg = await t.tokenFor("pdg1");
    gerant = await t.tokenFor("gerant1");
    caissier = await t.tokenFor("caissier1");
  });
  afterAll(() => t.close());

  it("le caissier ne peut pas annuler une vente", async () => {
    const sale = await sell(g.alpha.id);
    expect(
      (await call(`/sales/${sale.id}/cancel`, { justification: "Erreur de saisie" }, caissier)).status,
    ).toBe(403);
  });

  it("annulation sans justificatif refusée, rien n'est écrit", async () => {
    const sale = await sell(g.alpha.id);
    const before = await t.deps.db.select().from(schema.sales);
    const res = await call(`/sales/${sale.id}/cancel`, {});
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("justification_required");
    expect((await call(`/sales/${sale.id}/cancel`, { justification: "x" })).status).toBe(422);
    expect(await t.deps.db.select().from(schema.sales)).toHaveLength(before.length);
  });

  it("annule une vente : écritures inverses de vente, de stock et de caisse, PDG notifié", async () => {
    const fullBefore = await full(g.alpha.id);
    const emptyBefore = await empty(g.alpha.id);
    const cashBefore = await registerBalance(t.deps.db, "sales_cash");
    const sale = await sell(g.alpha.id);
    expect(await full(g.alpha.id)).toBe(fullBefore - 1);
    const res = await call(`/sales/${sale.id}/cancel`, { justification: "Client a changé d'avis" });
    expect(res.status).toBe(201);
    const reversal = (await res.json()) as { reversalOf: string; number: string; total: number };
    expect(reversal).toMatchObject({ reversalOf: sale.id, total: 6800 });
    expect(reversal.number.startsWith("AN")).toBe(true);
    expect(await full(g.alpha.id)).toBe(fullBefore);
    expect(await empty(g.alpha.id)).toBe(emptyBefore);
    expect(await registerBalance(t.deps.db, "sales_cash")).toBe(cashBefore);
    // Le journal garde tout : la vente d'origine, son inverse, deux mouvements de stock de chaque, deux de caisse.
    const moves = await t.deps.db.query.stockMoves.findMany({
      where: (m, { eq }) => eq(m.reason, "reversal"),
    });
    expect(moves.every((m) => m.justification === "Client a changé d'avis" && m.reversalOf)).toBe(true);
    const cash = (await t.deps.db.query.cashEntries.findMany()).filter((e) => e.reversalOf);
    expect(cash.at(-1)).toMatchObject({
      direction: "out",
      amount: 6800,
      justification: "Client a changé d'avis",
    });
    const note = (await t.deps.db.query.notifications.findMany()).at(-1);
    expect(note?.recipientRole).toBe("pdg");
    expect(note?.message).toContain(sale.number);
    expect(note?.message).toContain("2026-11-24T");
  });

  it("une vente ne s'annule qu'une fois, et une annulation ne s'annule pas", async () => {
    const sale = await sell(g.boreal.id);
    const first = await call(`/sales/${sale.id}/cancel`, { justification: "Erreur de saisie" });
    const reversal = (await first.json()) as { id: string };
    expect((await call(`/sales/${sale.id}/cancel`, { justification: "Encore une fois" })).status).toBe(409);
    expect(
      (await call(`/sales/${reversal.id}/cancel`, { justification: "Annuler l'annulation" })).status,
    ).toBe(422);
    expect((await call(`/sales/${UNKNOWN}/cancel`, { justification: "Introuvable ici" })).status).toBe(404);
  });

  it("annule un échange entre marques : vide et plein reviennent à la bonne marque", async () => {
    const fullA = await full(g.alpha.id);
    const emptyB = await empty(g.boreal.id);
    const sale = await sell(g.alpha.id, g.boreal.id);
    expect(await empty(g.boreal.id)).toBe(emptyB + 1);
    expect((await call(`/sales/${sale.id}/cancel`, { justification: "Mauvaise marque" }, pdg)).status).toBe(
      201,
    );
    expect(await full(g.alpha.id)).toBe(fullA);
    expect(await empty(g.boreal.id)).toBe(emptyB);
  });

  it("refuse d'annuler si le vide rapporté a déjà quitté le stock", async () => {
    const sale = await sell(g.cobalt.id);
    const user = await t.deps.db.query.users.findFirst();
    await t.deps.db.insert(schema.stockMoves).values({
      brandId: g.cobalt.id,
      formatId: g.format.id,
      state: "empty",
      delta: -(await empty(g.cobalt.id)),
      reason: "supplier_return",
      authorId: user?.id ?? "",
    });
    const res = await call(`/sales/${sale.id}/cancel`, { justification: "Trop tard pour annuler" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("stock_conflict");
  });

  it("annule une vente d'article libre avec suivi de stock", async () => {
    const [art] = await t.deps.db
      .insert(schema.articles)
      .values({ name: "Détendeur", price: 3000, trackStock: true, stockQty: 4 })
      .returning();
    const res = await call(
      "/sales",
      { paymentMethod: "momo", lines: [{ kind: "article", articleId: art?.id, quantity: 3 }] },
      caissier,
    );
    const sale = (await res.json()) as { id: string };
    expect((await t.deps.db.query.articles.findFirst())?.stockQty).toBe(1);
    expect((await call(`/sales/${sale.id}/cancel`, { justification: "Article défectueux" })).status).toBe(
      201,
    );
    expect((await t.deps.db.query.articles.findFirst())?.stockQty).toBe(4);
  });

  it("corrige le stock avec un mouvement justifié, sans jamais passer sous zéro", async () => {
    const before = await full(g.cobalt.id);
    const body = {
      brandId: g.cobalt.id,
      formatId: g.format.id,
      state: "full",
      delta: -2,
      justification: "Bouteilles perdues",
    };
    expect((await call("/control/corrections/stock", body, caissier)).status).toBe(403);
    expect((await call("/control/corrections/stock", { ...body, justification: undefined })).status).toBe(
      422,
    );
    expect((await call("/control/corrections/stock", body)).status).toBe(201);
    expect(await full(g.cobalt.id)).toBe(before - 2);
    const tooMuch = await call("/control/corrections/stock", { ...body, delta: -999 });
    expect(tooMuch.status).toBe(409);
    expect((await call("/control/corrections/stock", { ...body, delta: 0 })).status).toBe(422);
  });

  it("corrige un mouvement de caisse par un mouvement inverse, une seule fois", async () => {
    const expense = await call("/cash/expenses", {
      registerId: "sales_cash",
      amount: 1000,
      label: "Fournitures",
    });
    const entry = (await expense.json()) as { id: string };
    const balance = await registerBalance(t.deps.db, "sales_cash");
    expect((await call(`/control/corrections/cash/${entry.id}`, {})).status).toBe(422);
    const ok = await call(`/control/corrections/cash/${entry.id}`, {
      justification: "Dépense saisie deux fois",
    });
    expect(ok.status).toBe(201);
    const inverse = (await ok.json()) as {
      id: string;
      direction: string;
      amount: number;
      reversalOf: string;
    };
    expect(inverse).toMatchObject({ direction: "in", amount: 1000, reversalOf: entry.id });
    expect(await registerBalance(t.deps.db, "sales_cash")).toBe(balance + 1000);
    expect(
      (await call(`/control/corrections/cash/${entry.id}`, { justification: "Encore une correction" }))
        .status,
    ).toBe(409);
    expect(
      (await call(`/control/corrections/cash/${inverse.id}`, { justification: "Inverser l'inverse" })).status,
    ).toBe(422);
    expect(
      (await call(`/control/corrections/cash/${UNKNOWN}`, { justification: "Introuvable ici" })).status,
    ).toBe(404);
  });

  it("un mouvement de vente se corrige en annulant la vente", async () => {
    const saleEntry = (await t.deps.db.query.cashEntries.findMany()).find((e) => e.saleId && !e.reversalOf);
    const res = await call(`/control/corrections/cash/${saleEntry?.id}`, {
      justification: "Mauvaise procédure",
    });
    expect(res.status).toBe(422);
  });

  it("journal d'audit filtrable (gérant et PDG) avec historique des prix ; notifications du PDG", async () => {
    await t.app.request("/api/v1/catalogue/prices", {
      ...jsonPost({ formatId: g.format.id, amount: 6600, transportContribution: 300 }, pdg),
      method: "PUT",
    });
    const audit = async (q: string, token = gerant) =>
      (await (await t.app.request(`/api/v1/control/audit${q}`, authGet(token))).json()) as {
        action: string;
      }[];
    expect((await t.app.request("/api/v1/control/audit", authGet(caissier))).status).toBe(403);
    const cancels = await audit("?action=sale.cancel");
    expect(cancels.length).toBeGreaterThanOrEqual(4);
    expect(cancels.every((a) => a.action === "sale.cancel")).toBe(true);
    expect((await audit("?action=price.change&entity=gas_price", pdg)).length).toBe(1);
    expect((await audit("?limit=2", pdg)).length).toBe(2);

    const unread = async () =>
      (await (await t.app.request("/api/v1/control/notifications?unread=1", authGet(pdg))).json()) as {
        id: string;
      }[];
    expect((await t.app.request("/api/v1/control/notifications", authGet(gerant))).status).toBe(403);
    const first = (await unread())[0];
    const total = (await unread()).length;
    expect(total).toBeGreaterThan(3);
    expect((await call(`/control/notifications/${first?.id}/read`, {}, pdg)).status).toBe(200);
    expect(await unread()).toHaveLength(total - 1);
    expect((await call(`/control/notifications/${UNKNOWN}/read`, {}, pdg)).status).toBe(404);
  });

  it("le journal reste intact : aucune écriture modifiée ou supprimée par une annulation", async () => {
    const all = await t.deps.db.select().from(schema.sales);
    const originals = all.filter((s) => !s.reversalOf);
    const reversals = all.filter((s) => s.reversalOf);
    expect(reversals.length).toBeGreaterThanOrEqual(4);
    expect(originals.length).toBeGreaterThanOrEqual(reversals.length);
    await expect(t.deps.db.update(schema.sales).set({ total: 1 })).rejects.toThrow();
  });
});
