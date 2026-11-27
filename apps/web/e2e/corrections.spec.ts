import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoGaz : correction d'un stock avec justification et confirmation", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/gaz/stock");
  await page.getByRole("button", { name: /^Corriger OLA/u }).click();
  const forme = page.getByRole("form", { name: /^Correction du stock/u });
  await forme.getByLabel(/^Variation/u).fill("-1");
  await forme.getByLabel(/^Justification/u).fill("Bouteille percée");
  await forme.getByRole("button", { name: "Vérifier la correction" }).click();
  await expect(forme.getByText("Le PDG sera prévenu.", { exact: false })).toBeVisible();
  await forme.getByRole("button", { name: "Confirmer la correction" }).click();
  await expect(page.getByText("Correction enregistrée.")).toBeVisible();
});

test("CoCoCaisse : correction d'une dépense depuis son détail", async ({ page }) => {
  await seConnecter(page, "pdg");
  await page.goto("/caisse/soldes");
  await page.getByRole("button", { name: "Mouvements Ventes en espèces" }).click();
  await page.getByRole("button", { name: "Détail de l'écriture RG0041" }).click();
  await page.getByRole("button", { name: "Corriger l'écriture" }).click();
  await page.getByLabel(/^Justification/u).fill("Saisie en double");
  await page.getByRole("button", { name: "Vérifier la correction" }).click();
  await page.getByRole("button", { name: "Confirmer la correction" }).click();
  await expect(page.getByText("Correction enregistrée.")).toBeVisible();
});

test("le caissier ne voit aucune correction", async ({ page }) => {
  await seConnecter(page, "caissier");
  await page.goto("/gaz/stock");
  await expect(page.getByRole("row", { name: /Total général/u })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Corriger/u })).toHaveCount(0);
});
