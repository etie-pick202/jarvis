import { describe, expect, it } from "vitest";
import { phoneNumber, toE164 } from "./phone.js";

describe("numéros au format E.164", () => {
  it("ajoute l'indicatif du Cameroun aux numéros nationaux", () => {
    for (const raw of ["690000000", "6 90 00 00 00", "237690000000", "+237 690-000-000", "00237690000000"]) {
      expect(toE164(raw), raw).toBe("+237690000000");
    }
  });

  it("garde un autre indicatif écrit en entier", () => {
    expect(toE164("+33 6 12 34 56 78")).toBe("+33612345678");
  });

  it("refuse ce qui n'est pas un numéro complet", () => {
    for (const raw of ["", "abc", "12345", "69000000", "6900000000", "+23769000000", "+0123456789"]) {
      expect(toE164(raw), raw).toBeNull();
    }
    expect(phoneNumber.safeParse("pas un numéro").success).toBe(false);
    expect(phoneNumber.parse(" 690000000 ")).toBe("+237690000000");
  });
});
