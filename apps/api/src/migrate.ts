import { runMigrations } from "@jarvis/db";

// Appelé par le déploiement (`node dist/migrate.js`). Les migrations SQL sont copiées à côté, dans ./migrations.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL est obligatoire pour migrer la base.");
  process.exit(1);
}
await runMigrations(url, process.env.MIGRATIONS_DIR ?? "migrations");
console.log("Migrations appliquées.");
