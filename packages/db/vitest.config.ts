import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.int.test.ts",
        "src/index.ts",
        "src/seed.ts",
        // Testé contre PostgreSQL (initialiser.int.test.ts).
        "src/initialiser.ts",
        "src/schema.ts",
        "src/client.ts",
        "src/migrate.ts",
        "src/fresh.ts",
      ],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
