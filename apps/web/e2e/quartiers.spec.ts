import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoLivre : le gérant ajoute un quartier", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/livre/quartiers");
  const fiche = page.getByRole("form", { name: "Nouveau quartier" });
  await fiche.getByLabel("Quartier", { exact: true }).fill("Quartier Essai Est");
  await fiche.getByLabel("Frais par bouteille").fill("500");
  await fiche.getByRole("button", { name: "Ajouter le quartier" }).click();
  await expect(page.getByRole("rowheader", { name: "Quartier Essai Est" })).toBeVisible();
});
