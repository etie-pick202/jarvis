import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoPilot et CoCoRapport : le PDG voit le tableau de bord, valide et consulte un rapport", async ({
  page,
}) => {
  await seConnecter(page, "pdg");
  await expect(page.getByRole("heading", { level: 1, name: "Tableau de bord" })).toBeVisible();
  await expect(page.getByText("108 800 FCFA")).toBeVisible();

  await page.goto("/pilot/validations");
  await page.getByRole("button", { name: "Valider" }).first().click();
  await expect(page.getByText(/Inventaire hebdomadaire : BOCOM/u)).toHaveCount(0);

  await page.goto("/rapport/clients");
  await expect(page.getByRole("heading", { level: 1, name: "Statistiques clients" })).toBeVisible();
  await expect(page.getByText("Fotso Marc")).toBeVisible();
  await expect(page.getByRole("button", { name: "Exporter en CSV" })).toBeVisible();
});
