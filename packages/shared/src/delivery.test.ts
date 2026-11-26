import { describe, expect, it } from "vitest";
import { updateNeighbourhoodInput, updateShopSettingsInput } from "./delivery.js";

describe("réglages de la boutique et quartiers", () => {
  it("refuse une modification vide", () => {
    expect(updateShopSettingsInput.safeParse({}).success).toBe(false);
    expect(updateNeighbourhoodInput.safeParse({}).success).toBe(false);
  });

  it("accepte un seul champ et ignore le plafond, réservé au PDG", () => {
    expect(updateShopSettingsInput.parse({ phone: "690000000", deliveryFeeCeiling: 1 })).toEqual({
      phone: "690000000",
    });
    expect(updateNeighbourhoodInput.safeParse({ active: false }).success).toBe(true);
  });
});
