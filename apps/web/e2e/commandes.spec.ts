import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("Commandes : confirmer le paiement, valider, puis annuler une livraison avec motif", async ({
  page,
}) => {
  await seConnecter(page, "gerant");
  await page.goto("/vente/commandes");
  const premiere = page.getByRole("article", { name: /CMD0201/u });
  await premiere.getByRole("button", { name: "Confirmer le paiement" }).click();
  await expect(premiere.getByRole("button", { name: "Confirmer le paiement" })).toHaveCount(0);
  await premiere.getByRole("button", { name: "Valider la commande" }).click();
  await expect(premiere).toHaveCount(0);
  await page.getByText(/^En cours/u).click();
  const livraison = page.getByRole("article", { name: /CMD0202/u });
  await livraison.getByRole("button", { name: "Annuler" }).click();
  await livraison.getByLabel(/Motif/u).fill("client injoignable");
  await livraison.getByRole("button", { name: /Confirmer l.annulation/u }).click();
  await expect(livraison).toHaveCount(0);
});

test("Commandes : le gérant saisit une commande reçue par téléphone", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/livre/file");
  await page.getByRole("button", { name: "Commande par téléphone" }).click();
  const f = page.getByRole("form", { name: "Commande par téléphone" });
  await f.getByLabel("Quantité : Gaz OLA 12,5 kg").fill("1");
  await f.getByLabel("Client").fill("Client Essai");
  await f.getByLabel("Téléphone").fill("690000055");
  await f.getByLabel("Quartier", { exact: true }).selectOption({ label: "Quartier Essai Nord" });
  await f.getByRole("button", { name: /^Enregistrer la commande/u }).click();
  await expect(page.getByText(/Commande enregistrée/u)).toBeVisible();
});
