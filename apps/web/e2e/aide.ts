import { expect, type Page } from "@playwright/test";

/** Connexion avec le faux serveur (profils d'exemple : pdg, gerant, caissier, livreur ; mot de passe demo). */
export async function seConnecter(page: Page, identifiant: string): Promise<void> {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(identifiant);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}
