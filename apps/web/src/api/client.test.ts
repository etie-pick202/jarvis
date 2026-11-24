import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, request } from "./client.js";
import { api } from "./index.js";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("client d'API", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lit et valide la réponse", async () => {
    mockFetch(200, { status: "ok" });
    expect(await api.health()).toEqual({ status: "ok" });
  });

  it("rejette une réponse hors contrat", async () => {
    mockFetch(200, { status: "ko" });
    await expect(api.health()).rejects.toThrow(TypeError);
  });

  it("lève ApiError sur un statut d'erreur", async () => {
    mockFetch(500, {});
    await expect(api.health()).rejects.toBeInstanceOf(ApiError);
  });

  it("exige une clé d'idempotence pour une écriture et l'envoie en en-tête", async () => {
    await expect(request("/ventes", { method: "POST", body: {}, parse: (d) => d })).rejects.toThrow(
      /idempotence/u,
    );
    const fn = mockFetch(200, { ok: true });
    await request("/ventes", { method: "POST", body: { a: 1 }, idempotencyKey: "k1", parse: (d) => d });
    const init = fn.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1");
  });
});
