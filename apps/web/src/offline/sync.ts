import type { Operation } from "./db.js";
import { flush, type SendResult } from "./outbox.js";

export async function sendOperation(op: Operation): Promise<SendResult> {
  let response: Response;
  try {
    response = await fetch(`/api${op.path}`, {
      method: op.method,
      headers: { "Content-Type": "application/json", "Idempotency-Key": op.idempotencyKey },
      body: JSON.stringify(op.body),
      credentials: "same-origin",
    });
  } catch {
    return { kind: "retry" };
  }
  if (response.ok) return { kind: "ok" };
  if (response.status === 408 || response.status === 429 || response.status >= 500) return { kind: "retry" };
  const detail = await response.text().catch(() => "");
  return {
    kind: response.status === 409 ? "conflict" : "rejected",
    detail: detail || String(response.status),
  };
}

const RETRY_MS = 30_000;

/** Reprise automatique : à la reconnexion, au retour sur l'onglet et toutes les 30 s. */
export function startSync(send = sendOperation): () => void {
  const run = () => {
    if (navigator.onLine) void flush(send);
  };
  window.addEventListener("online", run);
  document.addEventListener("visibilitychange", run);
  const timer = window.setInterval(run, RETRY_MS);
  run();
  return () => {
    window.removeEventListener("online", run);
    document.removeEventListener("visibilitychange", run);
    window.clearInterval(timer);
  };
}

/** Enregistre l'opération localement puis tente l'envoi tout de suite (hors ligne d'abord). */
export { flush };
