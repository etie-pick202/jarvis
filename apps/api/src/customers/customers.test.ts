import { describe, expect, it } from "vitest";
import { normalizeName } from "./service.js";

describe("clé de recherche des clients", () => {
  it("ignore la casse, les accents et les espaces multiples", () => {
    expect(normalizeName("  Aïssatou   DIOP ")).toBe("aissatou diop");
  });
});
