import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("base neuve : le PDG est guidé jusqu'à la première saisie", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("jarvis.fake-vide", "1"));
  await seConnecter(page, "pdg");
  await expect(page.getByRole("heading", { name: "Mise en route" })).toBeVisible();
  await expect(page.getByText("Chiffre d'affaires")).toBeHidden();
  await page.getByRole("link", { name: "Compléter : Marques et formats" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/vente/nouvelle");
  await expect(page.getByRole("link", { name: "Saisir les prix" })).toBeVisible();
});
