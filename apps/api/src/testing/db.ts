import { PGlite } from "@electric-sql/pglite";
import { hashPassword, MIGRATIONS_DIR, REGISTERS, schema } from "@jarvis/db";
import type { Role } from "@jarvis/shared";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { createApp } from "../app.js";
import type { Deps } from "../http.js";

/** Horloge pilotable pour les tests (expiration de session, horodatage). */
export function fakeClock(start = "2026-11-24T08:00:00.000Z") {
  let current = new Date(start);
  return {
    now: () => new Date(current),
    advanceMinutes: (m: number) => {
      current = new Date(current.getTime() + m * 60_000);
    },
  };
}

/** Vraie base PostgreSQL en mémoire (PGlite) avec les vraies migrations : triggers et contraintes compris. */
export async function createTestDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  await db.insert(schema.cashRegisters).values(REGISTERS);
  return { db, close: () => client.close() };
}

export const TEST_PASSWORD = "mot-de-passe-d-essai";

export async function addUser(deps: Deps, username: string, roles: Role[]) {
  const [u] = await deps.db
    .insert(schema.users)
    .values({ username, displayName: username, passwordHash: await hashPassword(TEST_PASSWORD) })
    .returning({ id: schema.users.id });
  if (!u) throw new Error("utilisateur non créé");
  await deps.db.insert(schema.userRoles).values(roles.map((role) => ({ userId: u.id, role })));
  return u.id;
}

export async function createTestApp(idleMinutes = 30) {
  const { db, close } = await createTestDb();
  const clock = fakeClock();
  const deps: Deps = { db, now: clock.now, sessionIdleMinutes: idleMinutes };
  const app = createApp(deps);
  async function tokenFor(username: string): Promise<string> {
    const res = await app.request("/api/v1/auth/login", jsonPost({ username, password: TEST_PASSWORD }));
    return ((await res.json()) as { token: string }).token;
  }
  return { app, deps, clock, close, tokenFor };
}

export function jsonPost(body: unknown, token?: string, headers: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  };
}

export function authGet(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}
