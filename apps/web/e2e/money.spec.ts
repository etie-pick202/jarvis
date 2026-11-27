import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoMoney : dépôt, référence en double refusée, stand-by", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/money/operations");
  await expect(page.getByRole("rowheader", { name: /OM-0001/u })).toBeVisible();
  await page.getByLabel(/^Montant/u).fill("5000");
  await page.getByLabel("Téléphone du client").fill("690000022");
  await page.getByLabel("Référence de la transaction").fill("OM-0001");
  await expect(page.getByText(/déjà enregistrée pour cet opérateur/u)).toBeVisible();
  await page.getByLabel("Référence de la transaction").fill("OM-0002");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("Opération enregistrée.")).toBeVisible();
  await page.getByText("MoMo", { exact: true }).first().click();
  await expect(page.getByText(/en stand-by/u)).toBeVisible();
});

test("CoCoMoney : le PDG active une caisse et règle un taux", async ({ page }) => {
  await seConnecter(page, "pdg");
  await page.goto("/money/float");
  await page.getByRole("button", { name: "Activer MoMo" }).click();
  await expect(page.getByRole("button", { name: "Désactiver MoMo" })).toBeVisible();
  await page.goto("/money/commissions");
  await page.getByLabel("MoMo : Dépôt (%)").fill("1,5");
  await page.getByRole("button", { name: "Enregistrer les taux" }).click();
  await expect(page.getByText("Taux enregistrés.")).toBeVisible();
});
