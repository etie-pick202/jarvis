import { expect, test } from "@playwright/test";
import { attendreServiceWorker, seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoGaz : stock par marque et confirmation du soir", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/gaz/stock");
  const total = page.getByRole("row", { name: /Total général/u });
  await expect(total).toContainText("131");
  await page.getByLabel("Bouteilles comptées").fill("131");
  await page.getByRole("button", { name: "Confirmer le stock" }).click();
  await expect(page.getByText("Confirmation enregistrée.")).toBeVisible();
});

test("réception hors ligne : la pièce reste sur l'appareil puis part à la reconnexion", async ({
  page,
  context,
}) => {
  await seConnecter(page, "gerant");
  await page.goto("/gaz/receptions");
  await attendreServiceWorker(page);
  await expect(page.getByRole("option", { name: "Dépôt Central" })).toBeAttached();

  await context.setOffline(true);
  await page.getByLabel("Fournisseur").selectOption({ label: "Dépôt Central" });
  await page.getByLabel("Pleines reçues").first().fill("12");
  await expect(page.getByRole("button", { name: "Enregistrer la réception" })).toBeDisabled();
  await page.getByLabel(/Pièce justificative/u).setInputFiles({
    name: "bon.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 bon de commande"),
  });
  await page.getByRole("button", { name: "Enregistrer la réception" }).click();
  await expect(page.locator(".voyant")).toContainText("1 en attente");
  await expect(page.getByText("En attente d'envoi de la pièce").first()).toBeVisible();

  await context.setOffline(false);
  await expect(page.locator(".voyant")).not.toContainText("en attente", { timeout: 15_000 });
});
