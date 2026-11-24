import { describe, expect, it } from "vitest";
import { fcfa, formatFcfa } from "./money.js";

describe("montants en FCFA", () => {
  it("accepte uniquement des entiers positifs ou nuls", () => {
    expect(fcfa.safeParse(6800).success).toBe(true);
    expect(fcfa.safeParse(0).success).toBe(true);
    expect(fcfa.safeParse(12.5).success).toBe(false);
    expect(fcfa.safeParse(-1).success).toBe(false);
  });
  it("formate avec la devise", () => {
    expect(formatFcfa(6800)).toMatch(/^6\s?800 FCFA$/u);
  });
});
