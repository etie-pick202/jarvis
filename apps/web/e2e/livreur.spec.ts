import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoLivre : le livreur part, encaisse et confirme la remise", async ({ page }) => {
  await seConnecter(page, "livreur");
  const carte = page.getByRole("article", { name: /CMD0101/u });
  await carte.getByRole("button", { name: "Parti" }).click();
  await expect(carte.getByText("En route")).toBeVisible();
  await carte.getByRole("button", { name: "Livré" }).click();
  await carte.getByRole("checkbox", { name: "J'ai encaissé le montant" }).check();
  await carte.getByRole("checkbox", { name: "Bouteilles vides récupérées" }).check();
  await carte.getByRole("button", { name: "Confirmer la remise" }).click();
  await expect(carte.getByText("Livré", { exact: true })).toBeVisible();
});

test("CoCoLivre : signaler un problème avec une note", async ({ page }) => {
  await seConnecter(page, "livreur");
  const carte = page.getByRole("article", { name: /CMD0102/u });
  await carte.getByRole("button", { name: "Problème" }).click();
  await carte.getByLabel("Que s'est-il passé ?").fill("Client absent");
  await carte.getByRole("button", { name: "Signaler" }).click();
  await expect(carte.getByText("Client absent")).toBeVisible();
});
