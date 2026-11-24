import { expect, type Page } from "@playwright/test";

/** Connexion avec le faux serveur (profils d'exemple : pdg, gerant, caissier, livreur ; mot de passe demo). */
export async function seConnecter(page: Page, identifiant: string): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

/** Attend que le service worker contrôle la page, condition pour couper le réseau sans perdre l'appli. */
export async function attendreServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 })
    .toBe(true);
}
