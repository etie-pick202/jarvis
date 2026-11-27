import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CoCoConfig : le PDG crée un compte et règle un seuil", async ({ page }) => {
  await seConnecter(page, "pdg");
  await page.goto("/config/utilisateurs");
  const fiche = page.getByRole("form", { name: "Nouveau compte" });
  await fiche.getByLabel("Identifiant").fill("essai");
  await fiche.getByLabel("Nom affiché").fill("Compte Essai");
  await fiche.getByLabel("Mot de passe provisoire").fill("essai-1234");
  await fiche.getByRole("checkbox", { name: "Caissier" }).check();
  await fiche.getByRole("button", { name: "Créer le compte" }).click();
  await expect(fiche.getByText("Compte créé.")).toBeVisible();

  await page.goto("/config/caisses");
  const seuil = page.getByRole("form", { name: "Écart toléré à la clôture (FCFA)" });
  await seuil.getByRole("textbox").fill("750");
  await seuil.getByRole("button", { name: "Enregistrer" }).click();
  await expect(seuil.getByText("Réglage enregistré.")).toBeVisible();
});

test("CoCoConfig : le gérant n'accède pas aux comptes", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/config/utilisateurs");
  await expect(page.getByText("Seul le PDG peut modifier ces réglages.")).toBeVisible();
});
