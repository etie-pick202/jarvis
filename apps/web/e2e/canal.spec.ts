import { expect, test } from "@playwright/test";
import { seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("CanalSab : abonnés, échéances et rappel WhatsApp", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/canal/abonnes");
  await expect(page.getByRole("heading", { level: 1, name: "Abonnés Canal+" })).toBeVisible();
  await page.getByRole("searchbox").fill("essomba");
  await expect(page.getByRole("rowheader", { name: /Essomba Jean/u })).toBeVisible();
  await expect(page.getByRole("rowheader", { name: /Atangana/u })).toHaveCount(0);

  await page.goto("/canal/rappels");
  const rappel = page.getByRole("link", { name: "Envoyer par WhatsApp Atangana Rose" });
  await expect(rappel).toHaveAttribute("href", /wa\.me\/237690000001\?text=/u);
});

test("CanalSab : encaissement avec reçu puis annulation justifiée", async ({ page }) => {
  await seConnecter(page, "gerant");
  await page.goto("/canal/encaissements");
  await page.getByLabel("Abonné").selectOption({ label: "Atangana Rose (DEC-0001)" });
  await page.getByRole("button", { name: /^Encaisser \d/u }).click();
  await expect(page.getByText(/Encaissement enregistré/u)).toBeVisible();
  await page.getByRole("button", { name: "Annuler Essomba Jean" }).click();
  await page.getByLabel(/Motif de l.annulation/u).fill("saisie en double");
  await page.getByRole("button", { name: /Confirmer l.annulation/u }).click();
  await expect(page.getByText("Annulé", { exact: true })).toBeVisible();
});
