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
  await expect(page.getByRole("link", { name: /Appeler le/u })).toHaveAttribute("href", "tel:+237690000000");
});
