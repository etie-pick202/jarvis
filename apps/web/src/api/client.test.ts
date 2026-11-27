import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../offline/db.js";
import { sendOperation } from "../offline/sync.js";
import { ApiError, garderJeton, oublierJeton, request } from "./client.js";
import { fakeApi, setFakeUser } from "./fake.js";
import { api, rapportClients, rapportJournal, rapportX, toSession } from "./index.js";

const initDe = (fn: { mock: { calls: unknown[][] } }, i: number) =>
  fn.mock.calls[i]?.[1] as RequestInit | undefined;

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status }),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("client d'API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    oublierJeton();
  });

  it("envoie le jeton de session en Bearer sur /api/v1", async () => {
    garderJeton("abc");
    const fn = mockFetch(200, { ok: true });
    await request("/stock", { parse: (d) => d });
    expect(fn.mock.calls[0]?.[0]).toBe("/api/v1/stock");
    expect(initDe(fn, 0)?.headers).toMatchObject({ Authorization: "Bearer abc" });
  });

  it("lève ApiError avec le code du serveur", async () => {
    mockFetch(409, { error: { code: "stock_conflict", message: "Stock insuffisant" } });
    const e = await request("/sales", { parse: (d) => d }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 409, code: "stock_conflict", message: "Stock insuffisant" });
  });

  it("garde un message générique quand le corps d'erreur est illisible", async () => {
    vi.stubGlobal("fetch", async () => new Response("panne", { status: 502 }));
    await expect(request("/x", { parse: (d) => d })).rejects.toMatchObject({ status: 502, code: "unknown" });
  });

  it("exige une clé d'idempotence pour une écriture et l'envoie en en-tête", async () => {
    await expect(request("/sales", { method: "POST", body: {}, parse: (d) => d })).rejects.toThrow(
      /idempotence/u,
    );
    const fn = mockFetch(200, { ok: true });
    await request("/sales", { method: "POST", body: { a: 1 }, idempotencyKey: "cle-12345", parse: (d) => d });
    expect(initDe(fn, 0)?.headers).toMatchObject({ "Idempotency-Key": "cle-12345" });
  });

  it("rejette une réponse hors contrat", async () => {
    mockFetch(200, { id: 1 });
    await expect(api.marques()).rejects.toThrow();
  });
});

describe("adaptateurs de réponses", () => {
  beforeEach(() => {
    localStorage.clear();
    setFakeUser("pdg");
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) => fakeApi(url.replace("/api/v1", ""), init));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("compose le catalogue vendable : gaz par marque avec prix en vigueur, articles libres", async () => {
    const articles = await api.catalogue();
    const ola = articles.find((a) => a.marque === "OLA");
    expect(ola).toMatchObject({ nom: "Gaz 12,5 kg OLA", prix: 6800, stock: 30, valeurEmballage: 15900 });
    expect(articles.find((a) => a.nom === "Détendeur")).toMatchObject({
      genre: "autre",
      prix: 4500,
      stock: 6,
    });
  });

  it("lit le prix en vigueur par marque et marque inconnue la valeur d'emballage non relevée", async () => {
    const articles = await api.catalogue();
    expect(articles.find((a) => a.marque === "BOCOM")?.valeurEmballage).toBeUndefined();
    expect(articles.filter((a) => a.genre === "gaz")).toHaveLength(5);
  });

  it("n'offre pas à la vente un gaz sans prix saisi", async () => {
    vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
      url.includes("/current")
        ? Promise.resolve(
            new Response('{"error":{"code":"not_found","message":"Aucun prix"}}', { status: 404 }),
          )
        : fakeApi(url.replace("/api/v1", ""), init),
    );
    expect((await api.catalogue()).filter((a) => a.genre === "gaz")).toEqual([]);
  });

  it("convertit la session du serveur", () => {
    expect(
      toSession({
        id: "u",
        username: "g",
        displayName: "Gérant",
        roles: ["gerant", "livreur"],
        activeRole: "gerant",
      }),
    ).toEqual({ userId: "u", nom: "Gérant", profils: ["gerant", "livreur"], profilActif: "gerant" });
  });

  it("déduit les échanges des ventes et lit le stock, les caisses et les fournisseurs", async () => {
    expect((await api.pageEchanges(false)).echanges.map((e) => [e.remise, e.rapportee, e.ecart])).toEqual([
      ["STARGAS", "TOTAL", -2500],
      ["OLA", "TOTAL", 1600],
      ["OLA", "BOCOM", null],
    ]);
    expect((await api.gazStock()).reduce((n, s) => n + s.pleines, 0)).toBe(98);
    expect((await api.caisses()).filter((c) => c.especes).map((c) => c.id)).toEqual([
      "sales_cash",
      "canal_cash",
    ]);
    expect((await api.fournisseurs())[0]).toMatchObject({ nom: "Dépôt Central", marques: ["OLA", "TOTAL"] });
    expect((await api.receptions())[0]).toMatchObject({
      fournisseur: "Dépôt Central",
      pleines: 24,
      vides: 24,
    });
  });

  it("compose le tableau de bord, les alertes, les validations et le journal d'audit", async () => {
    expect(await api.tableau()).toMatchObject({
      caJour: 20400,
      nbVentes: 3,
      marge: -610,
      totalCaisses: 469512,
      especes: 257300,
      pleines: 98,
      vides: 33,
      alertesStock: 1,
      notifications: 1,
    });
    expect(await api.seuilCloture()).toBe(500);
    expect((await api.caisses())[0]).toMatchObject({ solde: 215300, fond: 180000 });
    expect((await api.validations())[0]?.auteur).toBe("Gérant");
    expect((await api.audit()).map((l) => l.auteur)).toEqual(["Gérant", ""]);
    const alertes = await api.alertes();
    expect(alertes.some((a) => a.niveau === "danger" && a.texte.includes("TRADEX"))).toBe(true);
    expect((await api.validations())[0]?.resume).toContain("écart pleines -1");
    expect((await api.audit())[0]?.detail).toContain("sale");
    expect(await api.badges()).toMatchObject({ stockBas: 1, validations: 1 });
  });

  it("met les rapports du serveur sous forme de tableaux", async () => {
    const clients = rapportClients(
      (await import("zod")).z
        .any()
        .parse({ day: "d", lines: [], totals: { quantity: 0, total: 0, margin: 0, marginPercent: null } }),
    );
    expect(clients.pied?.[0]).toBe("Total");
    expect((await api.rapport("clients")).lignes).toHaveLength(3);
    expect((await api.rapport("journal")).pied?.[9]).toBe("dont 257 300 en espèces");
    expect((await api.rapport("x")).pied).toEqual(["Total général", "", "", "", 181800]);
    expect((await api.situationGaz()).pied).toEqual(["Total général", 98, 33, 131]);
    expect(typeof rapportJournal).toBe("function");
    expect(typeof rapportX).toBe("function");
  });
});

describe("envoi des opérations", () => {
  const base = {
    id: "1",
    idempotencyKey: "cle-12345",
    createdAt: 0,
    status: "pending",
    attempts: 0,
    label: "Op",
  } as const;

  beforeEach(async () => {
    await db.outbox.clear();
    await db.pieces.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejoue les ventes par /sync/replay avec la clé comme identifiant d'opération", async () => {
    const fn = vi.fn(
      async (_u: string, _i?: RequestInit) =>
        new Response(
          JSON.stringify({ results: [{ clientOpId: "cle-12345", status: "applied", applied: true }] }),
        ),
    );
    vi.stubGlobal("fetch", fn);
    const r = await sendOperation({
      ...base,
      method: "POST",
      path: "/sales",
      syncType: "sale",
      body: { x: 1 },
    });
    expect(r.kind).toBe("ok");
    expect(fn.mock.calls[0]?.[0]).toBe("/api/v1/sync/replay");
    const corps = JSON.parse(String(initDe(fn, 0)?.body)) as {
      operations: { clientOpId: string; type: string }[];
    };
    expect(corps.operations[0]).toMatchObject({ clientOpId: "cle-12345", type: "sale" });
  });

  it.each([
    ["duplicate", "ok"],
    ["conflict", "conflict"],
    ["rejected", "rejected"],
  ] as const)("résultat de rejeu %s → %s, sans rien effacer", async (status, attendu) => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            results: [
              {
                clientOpId: "cle-12345",
                status,
                applied: status !== "rejected",
                conflict: "Écart de stock signalé",
              },
            ],
          }),
        ),
    );
    expect(
      (await sendOperation({ ...base, method: "POST", path: "/sales", syncType: "sale", body: {} })).kind,
    ).toBe(attendu);
  });

  it("attend (sans perdre l'opération) quand la session est expirée ou que le profil actif n'a pas le droit", async () => {
    for (const statut of [401, 403]) {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(JSON.stringify({ error: { code: "forbidden", message: "non" } }), { status: statut }),
      );
      expect(
        (await sendOperation({ ...base, method: "POST", path: "/sales", syncType: "sale", body: {} })).kind,
      ).toBe("retry");
    }
  });

  it("écrit directement les opérations sans rejeu (fournisseur, clôture, validation)", async () => {
    const fn = vi.fn(async (_u: string, _i?: RequestInit) => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fn);
    expect(
      (await sendOperation({ ...base, method: "POST", path: "/suppliers", body: { name: "A" } })).kind,
    ).toBe("ok");
    expect(fn.mock.calls[0]?.[0]).toBe("/api/v1/suppliers");
    expect(initDe(fn, 0)?.headers).toMatchObject({ "Idempotency-Key": "cle-12345" });
    await sendOperation({ ...base, method: "POST", path: "/inventory/x/validate", body: undefined });
    expect(initDe(fn, 1)?.body).toBeUndefined();
  });

  it("classe les erreurs de l'écriture directe : conflit, refus, nouvel essai", async () => {
    const cas: [number, string][] = [
      [409, "conflict"],
      [422, "rejected"],
      [503, "retry"],
    ];
    for (const [statut, attendu] of cas) {
      vi.stubGlobal(
        "fetch",
        async () =>
          new Response(JSON.stringify({ error: { code: "invalid_request", message: "m" } }), {
            status: statut,
          }),
      );
      expect((await sendOperation({ ...base, method: "POST", path: "/suppliers", body: {} })).kind).toBe(
        attendu,
      );
    }
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("réseau");
    });
    expect((await sendOperation({ ...base, method: "POST", path: "/suppliers", body: {} })).kind).toBe(
      "retry",
    );
  });

  it("envoie la pièce d'abord (corps brut), garde son identifiant, puis rejoue la réception", async () => {
    await db.pieces.add({ id: "p1", nom: "bon.pdf", blob: new Blob(["%PDF"], { type: "application/pdf" }) });
    const appels: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      appels.push(url);
      if (url.endsWith("/receipts"))
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000001201" }), { status: 201 });
      return new Response(
        JSON.stringify({ results: [{ clientOpId: "cle-12345", status: "applied", applied: true }] }),
      );
    });
    await db.outbox.add({
      ...base,
      method: "POST",
      path: "/receptions",
      syncType: "reception",
      pieceId: "p1",
      body: { supplierId: "s" },
    });
    const op = await db.outbox.get("1");
    if (!op) throw new Error("opération absente");
    expect((await sendOperation(op)).kind).toBe("ok");
    expect(appels).toEqual(["/api/v1/receipts", "/api/v1/sync/replay"]);
    expect(await db.pieces.get("p1")).toBeUndefined();
    expect((await db.outbox.get("1"))?.body).toMatchObject({
      receiptId: "00000000-0000-4000-8000-000000001201",
    });
  });

  it("ne renvoie pas la pièce déjà envoyée et refuse si elle a disparu", async () => {
    const fn = vi.fn(
      async (_u: string) =>
        new Response(
          JSON.stringify({ results: [{ clientOpId: "cle-12345", status: "applied", applied: true }] }),
        ),
    );
    vi.stubGlobal("fetch", fn);
    await db.pieces.add({ id: "p2", nom: "bon.pdf", blob: new Blob(["x"]) });
    await sendOperation({
      ...base,
      method: "POST",
      path: "/receptions",
      syncType: "reception",
      pieceId: "p2",
      body: { receiptId: "deja" },
    });
    expect(fn.mock.calls.map((c) => c[0])).toEqual(["/api/v1/sync/replay"]);
    const r = await sendOperation({
      ...base,
      method: "POST",
      path: "/receptions",
      syncType: "reception",
      pieceId: "absente",
      body: {},
    });
    expect(r.kind).toBe("rejected");
  });
});
