import { defineConfig, devices } from "@playwright/test";

/**
 * Bout en bout contre la VRAIE API et une vraie base PostgreSQL (aucun faux serveur).
 * Prérequis : DATABASE_URL (base vide ou déjà préparée) et E2E_PASSWORD (mot de passe des comptes d'essai).
 * La préparation (migrations puis données fictives) est faite par e2e/real-api/preparer.ts.
 */
const WEB = 4174;
const API = 3000;

if (!process.env.DATABASE_URL || !process.env.E2E_PASSWORD) {
  throw new Error("DATABASE_URL et E2E_PASSWORD sont obligatoires pour les tests contre la vraie API.");
}

export default defineConfig({
  testDir: "./e2e/real-api",
  globalSetup: "./e2e/real-api/preparer.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-api" }]]
    : "list",
  use: {
    baseURL: `http://localhost:${WEB}`,
    trace: "on-first-retry",
    channel: process.env.PW_CHANNEL,
  },
  projects: [{ name: "desktop", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm --filter @jarvis/api exec tsx src/server.ts",
      url: `http://localhost:${API}/health`,
      env: { DATABASE_URL: process.env.DATABASE_URL, PORT: String(API) },
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      // Version de production (sans VITE_API_MOCK) ; l'aperçu relaie /api vers l'API (proxy de vite.config.ts).
      command: `pnpm exec vite build --outDir dist-e2e-api && pnpm exec vite preview --outDir dist-e2e-api --port ${WEB} --strictPort`,
      port: WEB,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
