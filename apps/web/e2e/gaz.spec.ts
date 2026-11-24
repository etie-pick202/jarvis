import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoGaz : stock par marque et confirmation du soir", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/gaz/stock");
  const total = page.getByRole("row", { name: /Total général/u });
  await expect(total).toContainText("131");
  await page.getByLabel("Bouteilles comptées").fill("131");
  await page.getByRole("button", { name: "Confirmer le stock" }).click();
  await expect(page.getByText("Confirmation enregistrée.")).toBeVisible();
});
