import type { MiddlewareHandler } from "hono";
import { type AppEnv, AppError } from "../http.js";
import { can, type Permission } from "./permissions.js";
import { authenticate } from "./service.js";

export function bearerToken(header: string | undefined): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

/** Exige une session valide ; la place dans le contexte (`c.get("user")`). */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = bearerToken(c.req.header("Authorization"));
  const user = token ? await authenticate(c.get("deps"), token) : null;
  if (!user) throw new AppError(401, "unauthorized", "Connexion requise ou session expirée");
  c.set("user", user);
  await next();
};

/** Exige un droit précis pour le profil actif ; à placer après `requireAuth`. */
export function requirePermission(permission: Permission): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!can(c.get("user").activeRole, permission)) {
      throw new AppError(403, "forbidden", "Droit insuffisant pour cette action");
    }
    await next();
  };
}
