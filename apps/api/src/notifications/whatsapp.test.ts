import { describe, expect, it } from "vitest";
import { whatsappLink, whatsappNumber } from "./whatsapp.js";

describe("liens WhatsApp", () => {
  it("normalise le numéro avec l'indicatif du pays", () => {
    expect(whatsappNumber("6 90 00 00 00")).toBe("237690000000");
    expect(whatsappNumber("+237 690-000-000")).toBe("237690000000");
    expect(whatsappNumber("00237690000000")).toBe("237690000000");
  });

  it("préremplit le message encodé", () => {
    expect(whatsappLink("690000000", "Bonjour à vous & merci")).toBe(
      "https://wa.me/237690000000?text=Bonjour%20%C3%A0%20vous%20%26%20merci",
    );
  });
});
