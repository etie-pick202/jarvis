import { receiptSaved, replayResponse } from "@jarvis/shared";
import { API_BASE, enTetes, erreurDe } from "../api/client.js";
import { db, type Operation } from "./db.js";
import { flush, type SendResult } from "./outbox.js";

/** Réponse HTTP d'erreur -> décision : réessayer plus tard, conflit à vérifier, ou refus définitif. */
async function classer(response: Response, repere: string): Promise<SendResult> {
  const { status, message, code } = await erreurDe(response, repere);
  // Session expirée ou profil actif sans le droit (mode livreur) : l'opération attend, elle n'est pas perdue.
  if ([401, 403, 408, 429].includes(status) || status >= 500) return { kind: "retry" };
  if (status === 409 || code === "stock_conflict") return { kind: "conflict", detail: message };
  return { kind: "rejected", detail: message };
}

/** Envoie la pièce jointe d'une réception (corps brut) et renvoie son identifiant. */
async function envoyerPiece(op: Operation): Promise<SendResult | { receiptId: string }> {
  const piece = op.pieceId ? await db.pieces.get(op.pieceId) : undefined;
  if (!piece) return { kind: "rejected", detail: "Pièce jointe introuvable sur l'appareil" };
  const response = await fetch(`${API_BASE}/receipts`, {
    method: "POST",
    headers: enTetes({ "Content-Type": piece.blob.type }, `${op.idempotencyKey}-piece`),
    body: piece.blob,
  });
  if (!response.ok) return classer(response, "pièce justificative");
  return { receiptId: receiptSaved.parse(await response.json()).id };
}

export async function sendOperation(op: Operation): Promise<SendResult> {
  try {
    let body = op.body;
    // La pièce part d'abord ; son identifiant est gardé dans l'opération : jamais deux envois du fichier.
    if (op.pieceId && !(op.body as { receiptId?: string }).receiptId) {
      const piece = await envoyerPiece(op);
      if (!("receiptId" in piece)) return piece;
      body = { ...(op.body as object), receiptId: piece.receiptId };
      await db.outbox.update(op.id, { body });
    }

    // Opérations rejouables : un seul endpoint de synchronisation, un résultat par opération.
    if (op.syncType) {
      const response = await fetch(`${API_BASE}/sync/replay`, {
        method: "POST",
        headers: enTetes({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          operations: [
            {
              clientOpId: op.idempotencyKey,
              type: op.syncType,
              occurredAt: new Date(op.createdAt).toISOString(),
              payload: body,
            },
          ],
        }),
      });
      if (!response.ok) return await classer(response, "synchronisation");
      const resultat = replayResponse.parse(await response.json()).results[0];
      if (!resultat) return { kind: "rejected", detail: "Réponse de synchronisation vide" };
      if (resultat.status === "applied" || resultat.status === "duplicate") {
        if (op.pieceId) await db.pieces.delete(op.pieceId);
        return { kind: "ok" };
      }
      return {
        kind: resultat.status,
        detail: resultat.conflict ?? resultat.error?.message ?? resultat.status,
      };
    }

    // Écritures directes (fournisseurs, clôtures, validations) : même clé d'idempotence.
    const response = await fetch(`${API_BASE}${op.path}`, {
      method: op.method,
      headers: enTetes(body === undefined ? {} : { "Content-Type": "application/json" }, op.idempotencyKey),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) return { kind: "ok" };
    return await classer(response, op.label);
  } catch {
    return { kind: "retry" };
  }
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
