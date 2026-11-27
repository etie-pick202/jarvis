import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoMarket : ajouter un article puis le retrouver", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/market/articles");
  const fiche = page.getByRole("form", { name: "Nouvel article" });
  await fiche.getByLabel("Article", { exact: true }).fill("Brûleur essai");
  await fiche.getByLabel("Prix (FCFA)").fill("2500");
  await page.getByRole("button", { name: "Ajouter l'article" }).click();
  await expect(page.getByText("Article enregistré.")).toBeVisible();
  await page.getByRole("searchbox").fill("brûleur");
  await expect(page.getByRole("rowheader", { name: /Brûleur essai/u })).toBeVisible();
});

test("CoCoMarket : le caissier consulte sans pouvoir modifier", async ({ page }) => {
  await seConnecter(page, "caissier");
  await page.goto("/market/articles");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ajouter l'article" })).toHaveCount(0);
});
