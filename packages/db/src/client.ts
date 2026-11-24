import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/** Type commun à node-postgres (production) et PGlite (tests unitaires en mémoire). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db: Database = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
