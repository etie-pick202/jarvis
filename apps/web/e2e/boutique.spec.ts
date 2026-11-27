import { expect, test } from "@playwright/test";

test.use({ locale: "fr-FR" });

test("CoCoShop : sans compte, remplir le panier et voir le total livré", async ({ page }) => {
  await page.goto("/connexion");
  await page.getByRole("link", { name: "Commander à la boutique" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Commander à la boutique" })).toBeVisible();
  await page.getByRole("button", { name: "Une de plus : Gaz OLA 12,5 kg" }).click();
  await expect(page.locator(".vente__total")).toContainText(/7.200/u);
  await page.reload();
  await expect(page.locator(".vente__total")).toContainText(/7.200/u);
});

test("CoCoShop : commander sans compte puis suivre", async ({ page }) => {
  await page.goto("/boutique");
  await page.getByRole("button", { name: "Une de plus : Gaz OLA 12,5 kg" }).click();
  await page.getByLabel("Votre nom").fill("Client Essai");
  await page.getByLabel("Votre téléphone").fill("690000033");
  await page.getByLabel("Nom de votre quartier").fill("Quartier Test");
  await page.getByRole("button", { name: /^Commander pour/u }).click();
  await expect(page.getByRole("heading", { name: "CMD0001" })).toBeVisible();
  await expect(page.getByText("En attente de validation")).toBeVisible();
  await page.getByRole("link", { name: "Boutique" }).click();
  await expect(page.getByRole("link", { name: "Suivre ma dernière commande" })).toBeVisible();
});
