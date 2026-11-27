import { execSync } from "node:child_process";

/** Applique les migrations puis insère les données d'essai fictives (idempotent). */
export default function preparer(): void {
  const env = {
    ...process.env,
    SEED_PASSWORD: process.env.E2E_PASSWORD,
    MIGRATIONS_DIR: "../../packages/db/migrations",
  };
  execSync("pnpm --filter @jarvis/api exec tsx src/migrate.ts", { stdio: "inherit", env });
  execSync("pnpm --filter @jarvis/db exec tsx src/seed.ts", { stdio: "inherit", env });
}
