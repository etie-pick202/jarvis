import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("connexion, navigation par volets et changement de langue", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/connexion/u);
  await expect(page).toHaveTitle(/JARVIS/u);
  await seConnecter(page, "gerant");
  await expect(page.getByRole("heading", { level: 1, name: "CoCoPilot" })).toBeVisible();

  if (isMobile) {
    // Téléphone : barre du bas à quatre volets, les autres sous « Plus ».
    const bas = page.locator(".coque__bas");
    await expect(bas.getByRole("link")).toHaveCount(4);
    await bas.getByRole("link", { name: "Plus" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plus" })).toBeVisible();
  } else {
    // Ordinateur : barre verticale des volets et barre horizontale des rubriques.
    await expect(page.locator(".coque__volets").getByRole("link", { name: /CoCoGaz/u })).toBeVisible();
    await expect(page.getByRole("link", { name: "Alertes" })).toBeVisible();
  }

  await page.getByText("EN", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("le gérant passe en mode livreur d'un geste", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.getByRole("button", { name: "Mode livreur" }).click();
  await expect(page.getByRole("button", { name: "Parti" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Livré" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Problème" }).first()).toBeVisible();
});
