import { describe, expect, it } from "vitest";
import { lienWhatsappPour, numeroWhatsapp } from "./telephone.js";

describe("numéro WhatsApp", () => {
  it("ajoute 237 aux numéros camerounais sans indicatif et garde les internationaux", () => {
    expect(numeroWhatsapp("6 90 00 00 01")).toBe("237690000001");
    expect(numeroWhatsapp("233 00 00 00")).toBe("237233000000");
    expect(numeroWhatsapp("+237 690 000 001")).toBe("237690000001");
    expect(numeroWhatsapp("00237690000001")).toBe("237690000001");
    expect(numeroWhatsapp("+33 6 00 00 00 00")).toBe("33600000000");
    expect(numeroWhatsapp("237690000001")).toBe("237690000001");
    expect(numeroWhatsapp("")).toBe("");
    expect(lienWhatsappPour("690000001", "a b")).toBe("https://wa.me/237690000001?text=a%20b");
  });
});
