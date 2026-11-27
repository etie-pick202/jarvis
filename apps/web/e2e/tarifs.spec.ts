import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoConfig : le PDG change un prix", async ({ page }) => {
  await seConnecter(page, "pdg");
  await page.goto("/config/prix");
  const fiche = page.getByRole("form", { name: "Changer un prix" });
  await fiche.getByLabel("Format").selectOption({ label: "12,5 kg" });
  await fiche.getByLabel("Prix de la recharge").fill("6600");
  await fiche.getByRole("button", { name: "Enregistrer le prix" }).click();
  await expect(fiche.getByText("Prix enregistré.")).toBeVisible();
});
