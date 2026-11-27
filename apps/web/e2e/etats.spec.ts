import { expect, type Page, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

/** Le faux serveur fait échouer les lectures du chemin donné (voir `api/fake.ts`). */
const panne = (page: Page, valeur: string) =>
  page.evaluate((v) => localStorage.setItem("jarvis.fake-panne", v), valeur);
const reparer = (page: Page) => page.evaluate(() => localStorage.removeItem("jarvis.fake-panne"));

test("erreur serveur : message avec code, puis « Réessayer » affiche les données", async ({ page }) => {
  await seConnecter(page, "gerant");
  await panne(page, "500:/stock");
  await page.goto("/gaz/stock");
  await expect(page.getByRole("alert")).toContainText("essai_500");
  await reparer(page);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("row", { name: /Total général/u })).toBeVisible();
});

test("droits retirés : la copie de l'appareil reste affichée avec la raison", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/gaz/stock");
  await expect(page.getByRole("row", { name: /Total général/u })).toBeVisible();
  await panne(page, "403:/stock");
  await page.reload();
  const bandeau = page.locator(".bandeau").first();
  await expect(bandeau).toContainText("Données gardées sur l");
  await expect(bandeau).toContainText("essai_403");
  await expect(page.getByRole("row", { name: /Total général/u })).toBeVisible();
});

test("fonction absente du serveur : annoncée sans casser l'écran", async ({ page }) => {
  await seConnecter(page, "pdg");
  await panne(page, "404:/control/audit");
  await page.goto("/pilot/audit");
  await expect(page.getByText("Fonction pas encore disponible")).toBeVisible();
});

test("session refusée par le serveur : retour à la connexion avec l'explication", async ({ page }) => {
  await seConnecter(page, "gerant");
  await panne(page, "401:/stock");
  await page.goto("/gaz/stock");
  await expect(page.getByText(/Votre session a expiré/u)).toBeVisible();
  await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
});
