import { describe, expect, it } from "vitest";
import { createOrderInput } from "./orders.js";

const id = "00000000-0000-4000-8000-000000000001";
const base = {
  clientRef: id,
  customerName: "Awa",
  phone: "690000000",
  paymentMethod: "cash",
  lines: [{ kind: "article", articleId: id, quantity: 1 }],
};

describe("commande sans compte", () => {
  it("exige un quartier pour une livraison, pas pour un retrait", () => {
    expect(createOrderInput.safeParse({ ...base, mode: "delivery" }).success).toBe(false);
    expect(createOrderInput.safeParse({ ...base, mode: "pickup" }).success).toBe(true);
    expect(createOrderInput.safeParse({ ...base, mode: "delivery", neighbourhoodId: id }).success).toBe(true);
    expect(createOrderInput.safeParse({ ...base, mode: "delivery", neighbourhoodName: "Akwa" }).success).toBe(
      true,
    );
  });
});
