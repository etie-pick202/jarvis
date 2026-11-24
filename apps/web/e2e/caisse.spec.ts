import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoCaisse : le gérant enregistre une dépense et clôture, le caissier ne clôture pas", async ({
  page,
}) => {
  await seConnecter(page, "gerant");
  await page.goto("/caisse/depenses");
  await page.getByRole("option", { name: "Ventes en espèces" }).waitFor({ state: "attached" });
  await page.getByLabel("Depuis la caisse").selectOption({ label: "Ventes en espèces" });
  await page.getByLabel("Montant (FCFA)").fill("5000");
  await page.getByLabel("Libellé").fill("Transport");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Mouvement enregistré")).toBeVisible();
  await page.goto("/caisse/soldes");
  await expect(page.getByText("Ventes en espèces")).toBeVisible();
  await page.goto("/caisse/cloture");
  await expect(page.getByRole("heading", { level: 1, name: "Clôture du jour" })).toBeVisible();
});

test("le caissier n'a pas la clôture du jour", async ({ page }) => {
  await seConnecter(page, "caissier");
  await page.goto("/caisse/soldes");
  await expect(page.getByRole("heading", { level: 1, name: "Soldes des caisses" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Clôture du jour" })).toHaveCount(0);
  await page.goto("/caisse/cloture");
  await expect(page.getByRole("alert")).toContainText("Accès non autorisé");
});
