import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { columnName, toXlsx } from "./xlsx.js";

/** Relit les fichiers d'une archive sans compression à partir de son répertoire central. */
function unzip(bytes: Uint8Array): Record<string, string> {
  const data = Buffer.from(bytes);
  const end = data.length - 22;
  expect(data.readUInt32LE(end)).toBe(0x06054b50);
  let at = data.readUInt32LE(end + 16);
  const files: Record<string, string> = {};
  for (let i = 0; i < data.readUInt16LE(end + 10); i++) {
    const size = data.readUInt32LE(at + 24);
    const nameLength = data.readUInt16LE(at + 28);
    const local = data.readUInt32LE(at + 42);
    const name = data.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    files[name] = data.toString("utf8", start, start + size);
    at += 46 + nameLength;
  }
  return files;
}

const sheet = (bytes: Uint8Array) => unzip(bytes)["xl/worksheets/sheet1.xml"] ?? "";

describe("classeur Excel", () => {
  it("nomme les colonnes au-delà de Z", () => {
    expect([columnName(0), columnName(25), columnName(26), columnName(27)]).toEqual(["A", "Z", "AA", "AB"]);
  });

  it("écrit les nombres en nombres et les textes sans formule ni balise", () => {
    const bytes = toXlsx(
      "Essai",
      ["Libellé", "Montant"],
      [
        ['=1+1 <b> & "x"', 6800],
        [null, -5],
      ],
    );
    expect(Object.keys(unzip(bytes))).toHaveLength(5);
    const xml = sheet(bytes);
    expect(xml).toContain('<c r="B2"><v>6800</v></c>');
    expect(xml).toContain("=1+1 &lt;b&gt; &amp; &quot;x&quot;");
    expect(xml).not.toContain("<f>");
    expect(xml).toContain('<row r="3"><c r="B3"><v>-5</v></c></row>');
  });
});

describe("exports par période (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let gerant: string;
  const get = (path: string) => t.app.request(`/api/v1/reports/export/${path}`, authGet(gerant));
  const lines = async (path: string) => (await (await get(path)).text()).trim().split("\r\n");

  beforeAll(async () => {
    t = await createTestApp(10_000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    const g = await seedGas(t.deps, id, 10);
    gerant = await t.tokenFor("gerant1");
    const sell = () =>
      t.app.request(
        "/api/v1/sales",
        jsonPost(
          {
            customerName: "Awa",
            paymentMethod: "cash",
            lines: [{ kind: "gas", brandId: g.alpha.id, formatId: g.format.id, quantity: 1 }],
          },
          gerant,
        ),
      );
    await sell(); // 24 novembre
    t.clock.advanceMinutes(24 * 60);
    await sell(); // 25 novembre
  });
  afterAll(() => t.close());

  it("CSV : un jour, ou une période de plusieurs jours", async () => {
    expect(await lines("sales.csv?date=2026-11-24")).toHaveLength(2);
    expect(await lines("sales.csv?from=2026-11-24&to=2026-11-25")).toHaveLength(3);
    expect(await lines("cash.csv?from=2026-11-24&to=2026-11-25")).toHaveLength(3);
    expect(await lines("sales.csv")).toHaveLength(2);
  });

  it("Excel : ventes, caisse et stock", async () => {
    const res = await get("sales.xlsx?from=2026-11-24&to=2026-11-25");
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toContain("ventes-2026-11-24_2026-11-25.xlsx");
    expect(sheet(new Uint8Array(await res.arrayBuffer()))).toContain('<row r="3">');
    const cash = await get("cash.xlsx?date=2026-11-25");
    expect(sheet(new Uint8Array(await cash.arrayBuffer()))).toContain("Solde après");
    const stock = await get("stock.xlsx");
    expect(sheet(new Uint8Array(await stock.arrayBuffer()))).toContain("TOTAL");
  });

  it("refuse une période inversée, incomplète ou de plus de 92 jours", async () => {
    expect((await get("sales.csv?from=2026-11-25&to=2026-11-24")).status).toBe(422);
    expect((await get("sales.csv?from=2026-11-25")).status).toBe(422);
    expect((await get("cash.xlsx?from=2026-01-01&to=2026-11-24")).status).toBe(422);
  });
});
