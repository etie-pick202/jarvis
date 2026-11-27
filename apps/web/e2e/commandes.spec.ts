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
