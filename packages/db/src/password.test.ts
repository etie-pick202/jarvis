import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("mot de passe", () => {
  it("ne stocke jamais le mot de passe en clair et utilise un sel différent", async () => {
    const a = await hashPassword("motdepasse-essai");
    const b = await hashPassword("motdepasse-essai");
    expect(a).not.toContain("motdepasse-essai");
    expect(a).not.toBe(b);
  });
  it("vérifie le bon mot de passe et refuse les autres", async () => {
    const h = await hashPassword("bon-mot-de-passe");
    expect(await verifyPassword("bon-mot-de-passe", h)).toBe(true);
    expect(await verifyPassword("mauvais", h)).toBe(false);
  });
  it("refuse un format de hachage inconnu", async () => {
    expect(await verifyPassword("x", "texte-quelconque")).toBe(false);
  });
});
