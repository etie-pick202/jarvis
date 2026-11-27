import { describe, expect, it } from "vitest";
import { adjustArticleInput } from "./catalogue.js";

describe("correction du stock d’un article", () => {
  it("refuse une variation nulle", () => {
    expect(adjustArticleInput.safeParse({ delta: 0 }).success).toBe(false);
    expect(adjustArticleInput.safeParse({ delta: -2 }).success).toBe(true);
  });
});
