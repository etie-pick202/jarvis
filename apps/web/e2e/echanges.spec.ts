import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoGaz : le PDG solde un écart à régulariser", async ({ page }) => {
  await seConnecter(page, "pdg");
  await page.goto("/gaz/echanges");
  await page.getByRole("button", { name: "Solder Biyik Claire" }).click();
  await page.getByRole("button", { name: "Solder l'écart" }).click();
  await expect(page.getByRole("button", { name: "Solder l'écart" })).toHaveCount(0);
});
