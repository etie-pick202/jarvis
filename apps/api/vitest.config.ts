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
        "src/server.ts",
        "src/migrate.ts",
        "src/testing/**",
      ],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 75 },
    },
  },
});
