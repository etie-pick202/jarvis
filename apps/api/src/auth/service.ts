import { createHash, randomBytes } from "node:crypto";
import { hashPassword, schema, verifyPassword } from "@jarvis/db";
import { type Role, role as roleSchema, type SessionUser } from "@jarvis/shared";
import { eq, lt } from "drizzle-orm";
import { AppError, type Deps } from "../http.js";

const { users, userRoles, sessions } = schema;

/** Ordre de préférence du profil actif à la connexion. */
const ROLE_PRIORITY: readonly Role[] = ["pdg", "gerant", "caissier", "livreur"];

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function defaultActiveRole(roles: readonly Role[]): Role {
  const found = ROLE_PRIORITY.find((r) => roles.includes(r));
  if (!found) throw new AppError(403, "forbidden", "Aucun profil sur ce compte");
  return found;
}

/** Une session est valide tant que l'inactivité n'a pas dépassé la durée autorisée. */
export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function nextExpiry(now: Date, idleMinutes: number): Date {
  return new Date(now.getTime() + idleMinutes * 60_000);
}

// Hachage factice : même durée de calcul que pour un vrai compte, pour ne pas révéler les noms valides.
const DUMMY_HASH_PROMISE = hashPassword("mot-de-passe-factice");

async function rolesOf(deps: Deps, userId: string): Promise<Role[]> {
  const rows = await deps.db
    .select({ role: userRoles.role })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  return rows.map((r) => roleSchema.parse(r.role));
}

export async function login(deps: Deps, username: string, password: string) {
  const [user] = await deps.db.select().from(users).where(eq(users.username, username.trim())).limit(1);
  const ok = await verifyPassword(password, user?.passwordHash ?? (await DUMMY_HASH_PROMISE));
  if (!user?.active || !ok) {
    throw new AppError(401, "unauthorized", "Identifiants invalides");
  }
  const roles = await rolesOf(deps, user.id);
  const activeRole = defaultActiveRole(roles);
  const token = randomBytes(32).toString("base64url");
  const now = deps.now();
  await deps.db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: user.id,
    activeRole,
    createdAt: now,
    lastSeenAt: now,
    expiresAt: nextExpiry(now, deps.sessionIdleMinutes),
  });
  const sessionUser: SessionUser = {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles,
    activeRole,
  };
  return { token, user: sessionUser };
}

/** Retrouve l'utilisateur d'un jeton et prolonge la session ; supprime la session si elle a expiré. */
export async function authenticate(deps: Deps, token: string): Promise<SessionUser | null> {
  const tokenHash = hashToken(token);
  const [row] = await deps.db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  const now = deps.now();
  if (isExpired(row.session.expiresAt, now) || !row.user.active) {
    await deps.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }
  await deps.db
    .update(sessions)
    .set({ lastSeenAt: now, expiresAt: nextExpiry(now, deps.sessionIdleMinutes) })
    .where(eq(sessions.tokenHash, tokenHash));
  const roles = await rolesOf(deps, row.user.id);
  return {
    id: row.user.id,
    username: row.user.username,
    displayName: row.user.displayName,
    roles,
    activeRole: roleSchema.parse(row.session.activeRole),
  };
}

export async function logout(deps: Deps, token: string): Promise<void> {
  await deps.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

/** Bascule de profil sans reconnexion (ex. mode livraison) : seulement vers un profil que l'utilisateur possède. */
export async function switchRole(
  deps: Deps,
  token: string,
  user: SessionUser,
  target: Role,
): Promise<SessionUser> {
  if (!user.roles.includes(target))
    throw new AppError(403, "forbidden", "Ce profil n'est pas sur votre compte");
  await deps.db
    .update(sessions)
    .set({ activeRole: target })
    .where(eq(sessions.tokenHash, hashToken(token)));
  return { ...user, activeRole: target };
}

export async function createUser(
  deps: Deps,
  input: { username: string; displayName: string; password: string; roles: Role[] },
): Promise<SessionUser> {
  const username = input.username.trim();
  const [existing] = await deps.db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existing) throw new AppError(409, "conflict", "Ce nom d'utilisateur existe déjà");
  const roles = [...new Set(input.roles)];
  const passwordHash = await hashPassword(input.password);
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ username, displayName: input.displayName, passwordHash })
      .returning({ id: users.id });
    if (!row) throw new AppError(500, "internal_error", "Création impossible");
    await tx.insert(userRoles).values(roles.map((r) => ({ userId: row.id, role: r })));
    return {
      id: row.id,
      username,
      displayName: input.displayName,
      roles,
      activeRole: defaultActiveRole(roles),
    };
  });
}

export async function purgeExpiredSessions(deps: Deps): Promise<void> {
  await deps.db.delete(sessions).where(lt(sessions.expiresAt, deps.now()));
}
