import { DEFAULT_SAGE_ACCOUNTS, sageAccounts } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { sageCsv } from "./sage.js";

describe("export comptable (Sage)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;

  const api = (path: string, body?: unknown, token = gerant, method = "POST") =>
    t.app.request(
      `/api/v1${path}`,
      body === undefined ? authGet(token) : { ...jsonPost(body, token), method },
    );
  const rows = async (query = "?date=2026-11-24") => {
    const res = await api(`/reports/export/sage.csv${query}`);
    expect(res.status).toBe(200);
    const text = Buffer.from(await res.arrayBuffer()).toString("latin1");
    return text
      .trim()
      .split("\r\n")
      .slice(1)
      .map((line) => line.split(";"));
  };
  const totals = (list: string[][], account: string) =>
    list
      .filter((r) => r[3] === account)
      .reduce((n, r) => ({ debit: n.debit + Number(r[5]), credit: n.credit + Number(r[6]) }), {
        debit: 0,
        credit: 0,
      });

  beforeAll(async () => {
    t = await createTestApp(10_000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    const g = await seedGas(t.deps, id, 10);
    [pdg, gerant] = [await t.tokenFor("pdg1"), await t.tokenFor("gerant1")];
    const line = { kind: "gas", brandId: g.alpha.id, formatId: g.format.id, quantity: 1 };
    const sale = { customerName: "Awa", paymentMethod: "cash", lines: [line] };
    await api("/sales", { ...sale, deliveryFeePerBottle: 400 }); // 7 200 dont 400 de livraison
    const cancelled = (await (await api("/sales", sale)).json()) as { id: string };
    await api(`/sales/${cancelled.id}/cancel`, { justification: "Erreur de saisie" });
    await api("/cash/expenses", { registerId: "sales_cash", amount: 500, label: "=Sachets; gaz" });
    await api("/cash/transfers", {
      fromRegisterId: "sales_cash",
      toRegisterId: "canal_cash",
      amount: 1000,
      label: "Fond",
    });
    await api("/cash/closures", {
      registerId: "canal_cash",
      countedAmount: 900,
      justification: "Billet manquant",
    });
  });
  afterAll(() => t.close());

  it("écritures équilibrées, classées par nature", async () => {
    const list = await rows();
    const sum = (column: number) => list.reduce((n, r) => n + Number(r[column]), 0);
    expect(sum(5)).toBe(sum(6));
    // Vente annulée : produit crédité puis repris au débit.
    expect(totals(list, "701000")).toEqual({ debit: 6800, credit: 13_600 });
    expect(totals(list, "706000")).toEqual({ debit: 0, credit: 400 });
    expect(totals(list, "605000")).toEqual({ debit: 500, credit: 0 });
    expect(totals(list, "585000")).toEqual({ debit: 1000, credit: 1000 });
    expect(totals(list, "658000")).toEqual({ debit: 100, credit: 0 });
    expect(list.every((r) => r.length === 7 && r[0] === "CAI" && r[1] === "241126")).toBe(true);
    expect(list.find((r) => r[3] === "605000")?.[4]).toBe("Sachets  gaz");
  });

  it("période, jour vide et droits", async () => {
    expect(await rows("?from=2026-11-23&to=2026-11-24")).toHaveLength((await rows()).length);
    expect(await rows("?date=2026-11-20")).toEqual([]);
    expect(sageCsv([]).toString("latin1")).toContain("Débit;Crédit");
  });

  it("comptes réglables par le PDG", async () => {
    const read = async () => sageAccounts.parse(await (await api("/reports/sage-accounts")).json());
    expect(await read()).toEqual(DEFAULT_SAGE_ACCOUNTS);
    const next = { ...DEFAULT_SAGE_ACCOUNTS, expenses: "628000" };
    expect((await api("/reports/sage-accounts", next, gerant, "PUT")).status).toBe(403);
    const bad = { ...next, goods: "70 10" };
    expect((await api("/reports/sage-accounts", bad, pdg, "PUT")).status).toBe(422);
    expect((await api("/reports/sage-accounts", next, pdg, "PUT")).status).toBe(200);
    expect(totals(await rows(), "628000").debit).toBe(500);
  });
});
