import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("vente de gaz hors ligne : reçu immédiat, envoi à la reconnexion", async ({ page, context }) => {
  await seConnecter(page, "gerant");
  await page.goto("/vente/nouvelle");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("radio", { name: /OLA/u })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await expect(page.getByRole("status").first()).toContainText("Hors ligne");

  await page.getByRole("radio", { name: /OLA/u }).check();
  await page.getByLabel(/Nom du client/u).fill("Ndongo");
  await page.getByRole("button", { name: "Ndongo Berthe" }).click();
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
