import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoMarket : ajuster un stock avec justification", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/market/mouvements");
  const fiche = page.getByRole("form", { name: "Ajuster le stock" });
  await fiche.getByLabel(/^Variation/u).fill("-1");
  await fiche.getByLabel(/^Justification/u).fill("casse au comptoir");
  await fiche.getByRole("button", { name: /Enregistrer l.ajustement/u }).click();
  await expect(fiche.getByText("Mouvement enregistré.")).toBeVisible();
});
