import { describe, expect, it } from "vitest";
import {
  countInput,
  createReceptionInput,
  createSupplierInput,
  RECEIPT_CONTENT_TYPES,
  setThresholdInput,
  updateSupplierInput,
} from "./stock-ops.js";

const a = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";
const b = "7a2c4e6f-1b3d-4f5a-8c9e-0a1b2c3d4e5f";
const line = { brandId: a, formatId: b, fullReceived: 5, emptyReturned: 0, unitCost: 6170 };

describe("réception fournisseur", () => {
  it("exige la pièce justificative", () => {
    expect(createReceptionInput.safeParse({ supplierId: a, lines: [line] }).success).toBe(false);
    expect(createReceptionInput.safeParse({ supplierId: a, receiptId: b, lines: [line] }).success).toBe(true);
  });
  it("refuse une ligne vide, un coût décimal et une réception sans ligne", () => {
    const base = { supplierId: a, receiptId: b };
    expect(createReceptionInput.safeParse({ ...base, lines: [{ ...line, fullReceived: 0 }] }).success).toBe(
      false,
    );
    expect(createReceptionInput.safeParse({ ...base, lines: [{ ...line, unitCost: 10.5 }] }).success).toBe(
      false,
    );
    expect(createReceptionInput.safeParse({ ...base, lines: [] }).success).toBe(false);
  });
  it("accepte seulement photos et PDF", () => {
    expect(RECEIPT_CONTENT_TYPES).toContain("application/pdf");
    expect(RECEIPT_CONTENT_TYPES).not.toContain("text/plain");
  });
});

describe("fournisseurs, comptages et seuils", () => {
  it("crée un fournisseur avec ou sans marques, et exige un champ pour modifier", () => {
    expect(createSupplierInput.parse({ name: "Dépôt" }).brandIds).toEqual([]);
    expect(updateSupplierInput.safeParse({}).success).toBe(false);
    expect(updateSupplierInput.safeParse({ active: false }).success).toBe(true);
  });
  it("valide un comptage et un seuil", () => {
    expect(
      countInput.safeParse({ lines: [{ brandId: a, formatId: b, countedFull: 3, countedEmpty: 1 }] }).success,
    ).toBe(true);
    expect(countInput.safeParse({ lines: [] }).success).toBe(false);
    expect(setThresholdInput.safeParse({ threshold: -1 }).success).toBe(false);
    expect(setThresholdInput.safeParse({ threshold: 4 }).success).toBe(true);
  });
});
