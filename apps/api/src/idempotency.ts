import { createHash } from "node:crypto";
import { schema } from "@jarvis/db";
import { IDEMPOTENCY_HEADER, idempotencyKey } from "@jarvis/shared";
import { and, eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { type AppEnv, AppError } from "./http.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function requestHash(method: string, path: string, body: string): string {
  return createHash("sha256").update(`${method} ${path}\n${body}`).digest("hex");
}

/**
 * Idempotence des écritures (en-tête `Idempotency-Key`) : rejouer la même requête avec la même clé renvoie la
 * réponse déjà produite, sans doublon (indispensable à la synchronisation hors ligne). La même clé avec un autre
 * contenu est refusée. Seules les réussites sont mémorisées : un échec peut être retenté avec la même clé.
 * À placer après `requireAuth` (la clé est propre à chaque utilisateur).
 */
export const idempotency: MiddlewareHandler<AppEnv> = async (c, next) => {
  const rawKey = c.req.header(IDEMPOTENCY_HEADER);
  if (!rawKey || !WRITE_METHODS.has(c.req.method)) return next();
  const parsed = idempotencyKey.safeParse(rawKey);
  if (!parsed.success)
    throw new AppError(422, "invalid_request", "Idempotency-Key invalide (8 à 128 caractères)");
  const key = parsed.data;
  const { db } = c.get("deps");
  const userId = c.get("user").id;
  const hash = requestHash(c.req.method, c.req.path, await c.req.raw.clone().text());
  const { idempotencyKeys: table } = schema;

  // Réservation atomique de la clé : un seul exemplaire de la requête s'exécute.
  const inserted = await db
    .insert(table)
    .values({ key, userId, requestHash: hash, status: 0, response: {} })
    .onConflictDoNothing()
    .returning({ key: table.key });
  if (inserted.length === 0) {
    const [prior] = await db
      .select()
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.key, key)))
      .limit(1);
    if (!prior || prior.requestHash !== hash) {
      throw new AppError(
        409,
        "idempotency_conflict",
        "Cette clé d'idempotence a déjà servi pour une autre requête",
      );
    }
    if (prior.status === 0)
      throw new AppError(409, "conflict", "Requête identique déjà en cours de traitement");
    c.header("Idempotent-Replay", "true");
    return c.json(prior.response as object, prior.status as 200 | 201);
  }

  const release = () => db.delete(table).where(and(eq(table.userId, userId), eq(table.key, key)));
  // Hono transforme les erreurs levées en réponse : on les reconnaît à leur statut.
  await next();
  const status = c.res.status;
  if (status >= 200 && status < 300) {
    const text = await c.res.clone().text();
    const response: unknown = text ? JSON.parse(text) : {};
    await db
      .update(table)
      .set({ status, response })
      .where(and(eq(table.userId, userId), eq(table.key, key)));
  } else {
    await release();
  }
};
