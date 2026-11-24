import { describe, expect, it } from "vitest";
import { deliveryTotal, pickupTotal } from "./pricing.js";

describe("prix du gaz", () => {
  it("retrait au comptoir : 6 800 par bouteille", () => {
    expect(pickupTotal(1)).toBe(6800);
    expect(pickupTotal(2)).toBe(13600);
  });
  it("livraison par défaut : 7 200 par bouteille", () => {
    expect(deliveryTotal(1)).toBe(7200);
    expect(deliveryTotal(3)).toBe(21600);
  });
  it("majoration de quartier ajoutée par bouteille", () => {
    expect(deliveryTotal(2, 200)).toBe(14800);
  });
  it("refuse un nombre de bouteilles invalide", () => {
    expect(() => pickupTotal(0)).toThrow(RangeError);
    expect(() => deliveryTotal(1.5)).toThrow(RangeError);
  });
});
