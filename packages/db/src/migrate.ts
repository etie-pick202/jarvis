import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb } from "./client.js";

/** Dossier des migrations versionnées, en développement (source). */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applique les migrations en attente. Idempotent : rejouable sans effet. */
export async function runMigrations(databaseUrl: string, migrationsFolder: string = MIGRATIONS_DIR) {
  const { pool, close } = createDb(databaseUrl);
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await close();
  }
}
