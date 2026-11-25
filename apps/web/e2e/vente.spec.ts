import { expect, test } from "@playwright/test";
import { attendreServiceWorker, seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("vente de gaz hors ligne : reçu immédiat, envoi à la reconnexion", async ({ page, context }) => {
  await seConnecter(page, "gerant");
  await page.goto("/vente/nouvelle");
  await attendreServiceWorker(page);
  await expect(page.getByRole("radio", { name: /OLA/u })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole("status").first()).toContainText("Hors ligne");

  await page.getByRole("radio", { name: /OLA/u }).check();
  // Hors ligne et sans client déjà vu : le nom saisi suffit, le serveur retrouve ou crée le client.
  await page.getByLabel(/Nom du client/u).fill("Ndongo Berthe");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: /Encaisser 6 800 FCFA/u }).click();

  await expect(page.getByRole("heading", { name: "Reçu" })).toBeVisible();
  await expect(page.locator(".voyant")).toContainText("1 en attente");

  await context.setOffline(false);
  await expect(page.locator(".voyant")).not.toContainText("en attente", { timeout: 15_000 });
});

test("une marque à stock nul n'est pas vendable", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/vente/nouvelle");
  await expect(page.getByRole("radio", { name: /TRADEX/u })).toBeDisabled();
});
