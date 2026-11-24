import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.int.test.ts", "node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.int.test.ts", "src/server.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
