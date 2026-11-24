import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "./db.js";
import { discard, enqueue, flush, retry, type Sender } from "./outbox.js";
import { sendOperation, startSync } from "./sync.js";

const vente = { method: "POST", path: "/ventes", body: { qte: 1 }, label: "Vente OLA" } as const;

describe("file d'envoi", () => {
  beforeEach(async () => {
    await db.outbox.clear();
  });

  it("garde l'opération avec sa clé d'idempotence tant qu'elle n'est pas envoyée", async () => {
    const op = await enqueue(vente);
    const send: Sender = async () => ({ kind: "retry" });
    await flush(send);
    const stored = await db.outbox.get(op.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.attempts).toBe(1);
    expect(stored?.idempotencyKey).toBe(op.idempotencyKey);
  });

  it("envoie dans l'ordre, puis vide la file", async () => {
    await enqueue({ ...vente, label: "A" });
    await enqueue({ ...vente, label: "B" });
    const labels: string[] = [];
    await flush(async (op) => {
      labels.push(op.label);
      return { kind: "ok" };
    });
    expect(labels).toEqual(["A", "B"]);
    expect(await db.outbox.count()).toBe(0);
  });

  it("s'arrête à la première panne réseau", async () => {
    await enqueue({ ...vente, label: "A" });
    await enqueue({ ...vente, label: "B" });
    const send = vi.fn<Sender>(async () => ({ kind: "retry" }));
    await flush(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await db.outbox.count()).toBe(2);
  });

  it("affiche un conflit de stock au lieu de l'effacer, puis permet de réessayer ou d'écarter", async () => {
    const op = await enqueue(vente);
    await flush(async () => ({ kind: "conflict", detail: "Stock insuffisant" }));
    expect(await db.outbox.get(op.id)).toMatchObject({ status: "conflict", detail: "Stock insuffisant" });
    await retry(op.id);
    expect((await db.outbox.get(op.id))?.status).toBe("pending");
    await discard(op.id);
    expect(await db.outbox.count()).toBe(0);
  });
});

describe("envoi réseau", () => {
  const op = {
    ...vente,
    id: "1",
    idempotencyKey: "k",
    createdAt: 0,
    status: "pending",
    attempts: 0,
  } as const;

  function stub(status: number | "panne") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (status === "panne") throw new TypeError("réseau");
        return new Response("détail", { status });
      }),
    );
  }

  it.each([
    [200, "ok"],
    [503, "retry"],
    [409, "conflict"],
    [422, "rejected"],
    ["panne", "retry"],
  ] as const)("réponse %s → %s", async (status, kind) => {
    stub(status);
    expect((await sendOperation(op)).kind).toBe(kind);
    vi.unstubAllGlobals();
  });

  it("reprend automatiquement à la reconnexion", async () => {
    await enqueue(vente);
    const send = vi.fn<Sender>(async () => ({ kind: "ok" }));
    const stop = startSync(send);
    window.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    stop();
  });
});
