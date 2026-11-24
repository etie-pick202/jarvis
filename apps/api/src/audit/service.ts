import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  actorId: string;
  details?: Record<string, unknown>;
}

/** Ajoute une ligne au journal d'audit (ajout seul) et renvoie son identifiant. `exec` peut être une transaction. */
export async function recordAudit(exec: Database, entry: AuditEntry): Promise<string> {
  const [row] = await exec
    .insert(schema.auditLog)
    .values({
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      actorId: entry.actorId,
      details: entry.details ?? null,
    })
    .returning({ id: schema.auditLog.id });
  if (!row) throw new Error("Écriture d'audit impossible");
  return row.id;
}

/** Audit + notification au PDG avec l'action et l'heure (annulation, correction, écart, changement de prix). */
export async function auditAndNotifyPdg(exec: Database, entry: AuditEntry, message: string): Promise<string> {
  const auditId = await recordAudit(exec, entry);
  await exec.insert(schema.notifications).values({ recipientRole: "pdg", message, auditId });
  return auditId;
}
