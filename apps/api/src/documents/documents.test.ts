import { saleReceipt } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";
import { toPdf } from "./pdf.js";
import { fcfaText, shopDateTime, textTable } from "./text.js";

const read = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

/** Chaque entrée de la table `xref` doit pointer sur le début de son objet. */
function expectValidPdf(bytes: Uint8Array) {
  const text = read(bytes);
  expect(text.startsWith("%PDF-1.4")).toBe(true);
  const start = Number(/startxref\n(\d+)/.exec(text)?.[1]);
  expect(text.slice(start, start + 4)).toBe("xref");
  const offsets = [...text.slice(start).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
  offsets.forEach((offset, i) => {
    expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
  });
}

describe("PDF et mise en texte", () => {
  it("produit un PDF cohérent, sur plusieurs pages, avec accents et parenthèses échappées", () => {
    const bytes = toPdf(["Reçu (essai) \\ → œuf 漢", ...Array.from({ length: 120 }, (_, i) => `L${i}`)]);
    expectValidPdf(bytes);
    expect(read(bytes)).toContain("/Count 3");
    expect(read(bytes)).toContain("(Reçu \\(essai\\) \\\\ -> oeuf ?)");
    expectValidPdf(toPdf([], { landscape: true }));
  });

  it("formate les montants, les dates de la boutique et les colonnes", () => {
    expect(fcfaText(1_234_500)).toBe("1 234 500 FCFA");
    expect(fcfaText(-500)).toBe("-500 FCFA");
    expect(shopDateTime(new Date("2026-11-24T23:30:00Z"))).toBe("25/11/2026 00:30");
    const [head, rule, row] = textTable(["Nom", "Montant"], [["Très long libellé ici", 5]], 16);
    expect(head?.length).toBeLessThanOrEqual(16);
    expect(rule).toMatch(/^-+ -+$/);
    expect(row?.endsWith("5")).toBe(true);
    expect(textTable(["A"], [[null]])).toHaveLength(3);
  });
});

describe("reçus et rapports en PDF (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let gerant: string;
  let caissier: string;
  let saleId: string;
  const get = (path: string, token = gerant) => t.app.request(`/api/v1/documents${path}`, authGet(token));

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    const g = await seedGas(t.deps, id, 5);
    [gerant, caissier] = [await t.tokenFor("gerant1"), await t.tokenFor("caissier1")];
    const res = await t.app.request(
      "/api/v1/sales",
      jsonPost(
        {
          customerName: "Awa",
          paymentMethod: "cash",
          lines: [
            {
              kind: "gas",
              brandId: g.alpha.id,
              formatId: g.format.id,
              quantity: 2,
              returnedBrandId: g.boreal.id,
            },
          ],
        },
        gerant,
      ),
    );
    saleId = ((await res.json()) as { id: string }).id;
  });
  afterAll(() => t.close());

  it("reçu : texte, lien WhatsApp, français ou anglais, PDF", async () => {
    const receipt = saleReceipt.parse(await (await get(`/sales/${saleId}/receipt`, caissier)).json());
    expect(receipt.message).toContain("2 x Recharge gaz Alpha/Boreal 12,5 kg : 13 600 FCFA");
    expect(receipt.message).toContain("Réglé en espèces");
    expect(receipt.whatsappUrl.startsWith("https://wa.me/?text=COCOSAB")).toBe(true);
    const en = saleReceipt.parse(await (await get(`/sales/${saleId}/receipt?lang=en`)).json());
    expect(en.message).toContain("Paid by cash");
    const file = await get(`/sales/${saleId}/receipt.pdf`);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expectValidPdf(new Uint8Array(await file.arrayBuffer()));
    expect((await get("/sales/3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e/receipt")).status).toBe(404);
  });

  it("avec un numéro connu, le lien vise le client ; l'annulation est nommée comme telle", async () => {
    const { schema } = await import("@jarvis/db");
    await t.deps.db.update(schema.customers).set({ phone: "690000000" });
    const receipt = saleReceipt.parse(await (await get(`/sales/${saleId}/receipt`)).json());
    expect(receipt.whatsappUrl.startsWith("https://wa.me/237690000000?text=")).toBe(true);
    const cancelled = await t.app.request(
      `/api/v1/sales/${saleId}/cancel`,
      jsonPost({ justification: "Erreur de saisie" }, gerant),
    );
    const { id } = (await cancelled.json()) as { id: string };
    const reversal = saleReceipt.parse(await (await get(`/sales/${id}/receipt`)).json());
    expect(reversal.message).toContain("Annulation");
  });

  it("rapports du jour en PDF, réservés au gérant et au PDG", async () => {
    for (const name of ["sales", "cash", "stock", "x"]) {
      const res = await get(`/reports/${name}.pdf?date=2026-11-24`);
      expect(res.status, name).toBe(200);
      expectValidPdf(new Uint8Array(await res.arrayBuffer()));
    }
    expect(read(new Uint8Array(await (await get("/reports/x.pdf")).arrayBuffer()))).toContain("TOTAL G");
    expect((await get("/reports/sales.pdf", caissier)).status).toBe(403);
  });
});
