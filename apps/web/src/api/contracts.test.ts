import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseBadges, parseLivraisons, parseSession } from "./contracts.js";
import { fakeApi, installFakeApi, setFakeUser } from "./fake.js";

describe("contrats", () => {
  it("rejettent les réponses hors contrat", () => {
    expect(() => parseSession({ userId: "u", nom: "x", profils: ["roi"] })).toThrow(TypeError);
    expect(() => parseSession(null)).toThrow(TypeError);
    expect(() => parseBadges({ commandes: 1 })).toThrow(TypeError);
    expect(() => parseLivraisons("non")).toThrow(TypeError);
    expect(() => parseLivraisons([{ id: "1" }])).toThrow(TypeError);
  });

  it("acceptent une réponse valide", () => {
    expect(parseSession({ userId: "u", nom: "x", profils: ["gerant"] }).profils).toEqual(["gerant"]);
    expect(parseBadges({ commandes: 1, stockBas: 2, echeances: 3, validations: 4 }).stockBas).toBe(2);
    expect(
      parseLivraisons([{ id: "1", client: "c", quartier: "q", article: "a", montant: 1, etat: "livre" }]),
    ).toHaveLength(1);
  });
});

describe("faux serveur", () => {
  beforeEach(() => localStorage.clear());

  it("refuse l'accès sans connexion et connaît ses routes", async () => {
    expect((await fakeApi("/badges")).status).toBe(401);
    setFakeUser("gerant");
    expect((await fakeApi("/auth/me")).status).toBe(200);
    expect((await fakeApi("/livraisons/jour")).status).toBe(200);
    expect((await fakeApi("/ventes", { method: "POST" })).status).toBe(201);
    expect((await fakeApi("/inconnu")).status).toBe(404);
    expect((await fakeApi("/health")).status).toBe(200);
  });

  it("se branche sur fetch pour les adresses /api/ seulement", async () => {
    const reel = vi.fn(async () => new Response("autre"));
    vi.stubGlobal("fetch", reel);
    window.fetch = globalThis.fetch;
    installFakeApi();
    expect((await fetch("/api/health")).status).toBe(200);
    await fetch("/ailleurs");
    expect(reel).toHaveBeenCalledTimes(1);
    await fetch(new URL("http://localhost/ailleurs"));
    await fetch(new Request("http://localhost/autre"));
    expect(reel).toHaveBeenCalledTimes(3);
    vi.unstubAllGlobals();
  });
});
