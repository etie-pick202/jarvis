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
