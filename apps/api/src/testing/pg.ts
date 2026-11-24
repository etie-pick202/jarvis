import { createDb, createFreshDatabase, REGISTERS, runMigrations, schema } from "@jarvis/db";
import { createApp } from "../app.js";
import type { Deps } from "../http.js";
import { fakeClock, jsonPost, TEST_PASSWORD } from "./db.js";

/** Application branchée sur le vrai PostgreSQL de `DATABASE_URL` (tests d'intégration), base remise à zéro. */
export async function createPgTestApp(idleMinutes = 30) {
  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL est obligatoire pour les tests d'intégration");
  const url = await createFreshDatabase(adminUrl, "jarvis_test_api");
  await runMigrations(url);
  const { db, close } = createDb(url);
  await db.insert(schema.cashRegisters).values(REGISTERS);
  const clock = fakeClock();
  const deps: Deps = { db, now: clock.now, sessionIdleMinutes: idleMinutes };
  const app = createApp(deps);
  async function tokenFor(username: string): Promise<string> {
    const res = await app.request("/api/v1/auth/login", jsonPost({ username, password: TEST_PASSWORD }));
    return ((await res.json()) as { token: string }).token;
  }
  return { app, deps, clock, close, tokenFor };
}
