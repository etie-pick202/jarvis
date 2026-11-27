import { drizzle } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema.js";

/** Type commun à node-postgres (production) et PGlite (tests unitaires en mémoire). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 10 });
  // Une connexion inactive coupée par PostgreSQL (redémarrage, maintenance) ne doit pas arrêter l'API :
  // le pool l'écarte de lui-même et en rouvre une à la requête suivante.
  pool.on("error", (err) => {
    console.error("Connexion PostgreSQL inactive perdue, elle sera rouverte :", err.message);
  });
  const db: Database = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
