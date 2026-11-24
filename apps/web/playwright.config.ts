import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    // Local seulement : PW_CHANNEL=msedge utilise le navigateur installé (la CI utilise Chromium).
    channel: process.env.PW_CHANNEL,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // Construit une version avec le faux serveur (données fictives) : aucun backend nécessaire.
    command: `pnpm exec vite build --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    env: { VITE_API_MOCK: "1" },
    timeout: 120_000,
    port: PORT,
    reuseExistingServer: !process.env.CI,
  },
});
