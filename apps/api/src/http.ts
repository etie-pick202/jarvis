import type { Database } from "@jarvis/db";
import type { SessionUser } from "@jarvis/shared";
import { type ApiError, type ErrorCode, errorBody } from "@jarvis/shared";
import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { z } from "zod";

/** Dépendances injectées : une vraie base en production, PGlite en mémoire dans les tests. */
export interface Deps {
  db: Database;
  now: () => Date;
  /** Durée d'inactivité avant déconnexion automatique, en minutes. */
  sessionIdleMinutes: number;
}

export type AppEnv = {
  Variables: { user: SessionUser; deps: Deps };
};

export class AppError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof AppError) return c.json<ApiError>(errorBody(err.code, err.message), err.status);
  console.error(err);
  return c.json<ApiError>(errorBody("internal_error", "Erreur interne"), 500);
}

/** Valide des données avec un schéma Zod ; une erreur devient `invalid_request` (422). */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") ?? "";
    throw new AppError(
      422,
      "invalid_request",
      `${where ? `${where} : ` : ""}${first?.message ?? "Requête invalide"}`,
    );
  }
  return result.data;
}

export async function parseJson<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const body: unknown = await c.req.json().catch(() => undefined);
  return parse(schema, body);
}

export const withDeps =
  (deps: Deps): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    c.set("deps", deps);
    await next();
  };
