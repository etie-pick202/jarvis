import { liveQuery } from "dexie";
import { newIdempotencyKey } from "../api/client.js";
import { db, type Operation } from "./db.js";

export type SendResult =
  | { kind: "ok" }
  | { kind: "retry" }
  | { kind: "conflict" | "rejected"; detail: string };
export type Sender = (op: Operation) => Promise<SendResult>;

export interface NewOperation {
  method: Operation["method"];
  path: string;
  body: unknown;
  label: string;
}

export async function enqueue(input: NewOperation): Promise<Operation> {
  const op: Operation = {
    ...input,
    id: crypto.randomUUID(),
    idempotencyKey: newIdempotencyKey(),
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
  };
  await db.outbox.add(op);
  return op;
}

let flushing = false;

/** Envoie les opérations en attente dans l'ordre. S'arrête à la première panne réseau. */
export async function flush(send: Sender): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    const pending = await db.outbox.where("status").equals("pending").sortBy("createdAt");
    for (const op of pending) {
      const result = await send(op);
      if (result.kind === "ok") {
        await db.outbox.delete(op.id);
      } else if (result.kind === "retry") {
        await db.outbox.update(op.id, { attempts: op.attempts + 1 });
        return;
      } else {
        await db.outbox.update(op.id, {
          status: result.kind,
          detail: result.detail,
          attempts: op.attempts + 1,
        });
      }
    }
  } finally {
    flushing = false;
  }
}

/** Remet une opération en conflit ou refusée dans la file (choix explicite de l'utilisateur). */
export function retry(id: string): Promise<number> {
  return db.outbox.update(id, { status: "pending" });
}

/** Écarte une opération : seulement sur action de l'utilisateur, jamais automatiquement. */
export function discard(id: string): Promise<void> {
  return db.outbox.delete(id);
}

export function watchOutbox(onChange: (ops: Operation[]) => void): () => void {
  const sub = liveQuery(() => db.outbox.orderBy("createdAt").toArray()).subscribe({ next: onChange });
  return () => sub.unsubscribe();
}
