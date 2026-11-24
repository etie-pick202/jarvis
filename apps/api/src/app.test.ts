import { describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("API", () => {
  it("répond sur /health", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
  it("calcule un prix de retrait", async () => {
    const res = await app.request("/api/v1/quote?bottles=2");
    expect(await res.json()).toEqual({ bottles: 2, mode: "pickup", total: 13600 });
  });
  it("refuse un paramètre invalide avec le format d'erreur commun", async () => {
    const res = await app.request("/api/v1/quote?bottles=0");
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("invalid_request");
  });
});
