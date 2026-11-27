import { describe, expect, it } from "vitest";
import { updateUserInput } from "./roles.js";

describe("mise à jour d’un compte", () => {
  it("refuse une modification vide ou sans profil", () => {
    expect(updateUserInput.safeParse({}).success).toBe(false);
    expect(updateUserInput.safeParse({ roles: [] }).success).toBe(false);
    expect(updateUserInput.safeParse({ active: false }).success).toBe(true);
  });
});
