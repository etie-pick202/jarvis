import { enqueue, flush, type NewOperation } from "./outbox.js";
import { sendOperation } from "./sync.js";

/** Toute écriture : rangée d'abord sur l'appareil, envoyée dès que le réseau le permet. */
export async function ecrire(op: NewOperation) {
  const enregistree = await enqueue(op);
  void flush(sendOperation);
  return enregistree;
}
