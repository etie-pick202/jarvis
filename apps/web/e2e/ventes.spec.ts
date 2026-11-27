import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoVente : historique du jour et annulation justifiée", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/vente/historique");
  await page.getByRole("button", { name: "Annuler TK1993" }).click();
  await page.getByLabel(/Motif/u).fill("erreur de saisie");
  await page.getByRole("button", { name: /Confirmer l.annulation/u }).click();
  await expect(page.getByText("Annulée", { exact: true })).toBeVisible();
});
