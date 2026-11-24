import { defineConfig } from "vitest/config";

// Tests d'intégration : nécessitent une base PostgreSQL (variable DATABASE_URL).
export default defineConfig({
  test: {
    include: ["src/**/*.int.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
