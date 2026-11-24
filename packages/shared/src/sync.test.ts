import { describe, expect, it } from "vitest";
import { MAX_SYNC_BATCH, syncBatch, syncResult } from "./sync.js";

const op = { clientOpId: "op-0000001", type: "sale", occurredAt: "2026-11-24T07:30:00Z", payload: {} };

describe("synchronisation", () => {
  it("borne la taille d'un lot", () => {
    expect(syncBatch.safeParse({ operations: [] }).success).toBe(false);
    expect(syncBatch.safeParse({ operations: [op] }).success).toBe(true);
    expect(syncBatch.safeParse({ operations: Array(MAX_SYNC_BATCH + 1).fill(op) }).success).toBe(false);
  });
  it("refuse un type d'opération inconnu", () => {
    expect(syncBatch.safeParse({ operations: [{ ...op, type: "autre" }] }).success).toBe(false);
  });
  it("décrit un résultat avec conflit", () => {
    expect(
      syncResult.safeParse({ clientOpId: "a", status: "conflict", applied: true, conflict: "Rupture" })
        .success,
    ).toBe(true);
  });
});
