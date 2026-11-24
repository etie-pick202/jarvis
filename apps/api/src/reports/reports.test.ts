import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { gasLabel, marginPercent, signed, signedEntry, toCsv } from "./compute.js";

type G = Awaited<ReturnType<typeof seedGas>>;

describe("calculs de rapport", () => {
  it("marge en pourcentage (10,74 % pour 11 680 sur 108 800)", () => {
    expect(marginPercent(11680, 108800)).toBe(10.74);
    expect(marginPercent(630, 6800)).toBe(9.26);
    expect(marginPercent(10, 0)).toBe(0);
  });
  it("une annulation compte en négatif", () => {
    expect(signed(6800, true)).toBe(-6800);
    expect(signed(6800, false)).toBe(6800);
    expect(signedEntry("out", 300)).toBe(-300);
    expect(signedEntry("in", 300)).toBe(300);
  });
  it("libellé de gaz, avec les deux marques pour un échange", () => {
    expect(gasLabel("OLA", null, "12,5 kg")).toBe("Recharge gaz OLA 12,5 kg");
    expect(gasLabel("OLA", "OLA", "12,5 kg")).toBe("Recharge gaz OLA 12,5 kg");
    expect(gasLabel("OLA", "TOTAL", "12,5 kg")).toBe("Recharge gaz OLA/TOTAL 12,5 kg");
  });
  it("CSV : séparateur point-virgule, guillemets doublés, BOM, retour à la ligne Windows", () => {
    const out = toCsv(
      ["a", "b"],
      [
        ["x;y", 'dit "oui"'],
        [1, null],
      ],
    );
    expect(out).toBe('﻿a;b\r\n"x;y";"dit ""oui"""\r\n1;\r\n');
  });
  it("CSV : neutralise les formules (injection)", () => {
    const out = toCsv(["a"], [["=SOMME(A1)"], ["+1"], ["-2"], ["@x"], ["normal"], [-5]]);
    expect(out).toContain("'=SOMME(A1)");
    expect(out).toContain("'+1");
    expect(out).toContain("'-2");
    expect(out).toContain("'@x");
    expect(out).toContain("\r\n-5\r\n"); // un nombre négatif reste un nombre
    expect(out).toContain("normal");
  });
});

describe("rapports (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let g: G;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  let livreur: string;
  let n = 0;
  const call = (path: string, body: unknown, token = gerant) =>
    t.app.request(
      `/api/v1${path}`,
      jsonPost(body, token, { "Idempotency-Key": `cle-rapport-${++n}-${Math.random()}` }),
    );
  const get = async (path: string, token = gerant) =>
    (await t.app.request(`/api/v1/reports${path}`, authGet(token))).json();
  const sell = (brandId: string, name: string, returned?: string, method = "cash") =>
    call(
      "/sales",
      {
        customerName: name,
        paymentMethod: method,
        lines: [
          {
            kind: "gas",
            brandId,
            formatId: g.format.id,
            quantity: 1,
            ...(returned ? { returnedBrandId: returned } : {}),
          },
        ],
      },
      caissier,
    );

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    g = await seedGas(t.deps, id, 10);
    [pdg, gerant, caissier, livreur] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
      await t.tokenFor("livreur1"),
    ];
    await sell(g.alpha.id, "Awa Diop");
    await sell(g.alpha.id, "Moussa", g.boreal.id); // échange : écart d'emballage −2 500
    const cancelled = (await (await sell(g.cobalt.id, "Fatou", undefined, "momo")).json()) as { id: string };
    await call(`/sales/${cancelled.id}/cancel`, { justification: "Erreur de saisie" });
    await call("/cash/expenses", { registerId: "sales_cash", amount: 1000, label: 'Transport; "urgent"' });
  });
  afterAll(() => t.close());

  it("réservés au PDG et au gérant", async () => {
    for (const token of [caissier, livreur]) {
      expect((await t.app.request("/api/v1/reports/customers", authGet(token))).status).toBe(403);
    }
    expect((await t.app.request("/api/v1/reports/customers")).status).toBe(401);
    expect((await t.app.request("/api/v1/reports/customers?date=hier", authGet(pdg))).status).toBe(422);
  });

  it("statistiques clients : lignes, marge en FCFA et en %, annulation en négatif", async () => {
    const r = (await get("/customers?date=2026-11-24")) as {
      lines: {
        customerName: string;
        item: string;
        total: number;
        margin: number;
        marginPercent: number;
        quantity: number;
      }[];
      totals: { total: number; margin: number; quantity: number };
    };
    expect(r.lines).toHaveLength(4);
    expect(r.lines[0]).toMatchObject({
      customerName: "Awa Diop",
      total: 6800,
      margin: 630,
      marginPercent: 9.26,
    });
    expect(r.lines[1]).toMatchObject({
      item: expect.stringContaining("Alpha/Boreal"),
      total: 6800,
      margin: 630 - 2500,
    });
    expect(r.lines[3]).toMatchObject({ customerName: "Fatou", total: -6800, margin: -630, quantity: -1 });
    expect(r.totals).toMatchObject({ total: 13600, quantity: 2, margin: 630 + 630 - 2500 });
    const empty = (await get("/customers?date=2026-11-23")) as { lines: unknown[] };
    expect(empty.lines).toHaveLength(0);
  });

  it("journal de caisse : sens, solde après opération, opérateur, total dont espèces", async () => {
    const r = (await get("/cash-journal")) as {
      entries: {
        register: string;
        direction: string;
        balanceAfter: number;
        operator: string;
        customerName: string | null;
      }[];
      total: number;
      inCash: number;
    };
    expect(r.entries.length).toBe(5);
    expect(r.entries[0]).toMatchObject({
      direction: "in",
      balanceAfter: 6800,
      operator: "caissier1",
      customerName: "Awa Diop",
    });
    expect(r.entries.at(-1)).toMatchObject({ direction: "out", balanceAfter: 6800 * 2 - 1000 });
    // Espèces : 13 600 − 1 000 ; Mobile money : vente 6 800 puis annulation 6 800 = 0.
    expect(r.inCash).toBe(12600);
    expect(r.total).toBe(12600);
  });

  it("X de caisse : fond d'ouverture, mouvements numérotés par type, total par caisse et général", async () => {
    const r = (await get("/x?date=2026-11-24")) as {
      registers: {
        registerId: string;
        opening: number;
        closing: number;
        net: number;
        movements: { line: number; type: string; amount: number }[];
      }[];
      grandTotal: number;
    };
    const cash = r.registers.find((x) => x.registerId === "sales_cash");
    expect(cash?.opening).toBe(0);
    expect(cash?.movements.map((m) => `${m.line}:${m.type}`)).toEqual(["1:REG", "2:REG", "3:MSC"]);
    expect(cash?.closing).toBe(12600);
    expect(r.registers).toHaveLength(6);
    expect(r.grandTotal).toBe(12600);
    // Le lendemain, le fond de caisse d'ouverture est le solde de la veille.
    const next = (await get("/x?date=2026-11-25")) as {
      registers: { registerId: string; opening: number; movements: unknown[] }[];
    };
    expect(next.registers.find((x) => x.registerId === "sales_cash")).toMatchObject({
      opening: 12600,
      movements: [],
    });
  });

  it("situation gaz : pleines, vides et total par marque, total général", async () => {
    const r = (await get("/gas-situation")) as {
      rows: { brand: string; full: number; empty: number; total: number }[];
      totals: { full: number; empty: number; total: number };
    };
    expect(r.rows.find((x) => x.brand === "Alpha")).toMatchObject({ full: 8, empty: 1, total: 9 });
    expect(r.rows.find((x) => x.brand === "Boreal")).toMatchObject({ full: 10, empty: 1 });
    expect(r.totals).toMatchObject({ full: 28, empty: 2, total: 30 });
  });

  it("exports CSV des ventes, de la caisse et du stock", async () => {
    const sales = await t.app.request("/api/v1/reports/export/sales.csv?date=2026-11-24", authGet(pdg));
    expect(sales.headers.get("content-type")).toContain("text/csv");
    expect(sales.headers.get("content-disposition")).toContain("ventes-2026-11-24.csv");
    const bytes = new Uint8Array(await sales.clone().arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM UTF-8 pour Excel
    const text = await sales.text();
    expect(text.startsWith("Ticket;Date;Client")).toBe(true);
    expect(text.split("\r\n")).toHaveLength(6);
    const cash = await (
      await t.app.request("/api/v1/reports/export/cash.csv?date=2026-11-24", authGet(pdg))
    ).text();
    expect(cash).toContain('"Transport; ""urgent"""');
    const stock = await (await t.app.request("/api/v1/reports/export/stock.csv", authGet(pdg))).text();
    expect(stock).toContain("TOTAL;28;2;30");
    expect((await t.app.request("/api/v1/reports/export/stock.csv", authGet(caissier))).status).toBe(403);
  });
});
