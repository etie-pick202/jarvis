import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    // Les parcours qui saisissent de nombreux champs dépassent 5 s sur une machine chargée.
    testTimeout: 15_000,
    setupFiles: ["./src/test-setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/main.tsx", "src/test-setup.ts", "src/api/fake.ts"],
      reporter: ["text-summary", "lcov"],
      thresholds: { lines: 97, statements: 96, functions: 94, branches: 89 },
    },
  },
});
