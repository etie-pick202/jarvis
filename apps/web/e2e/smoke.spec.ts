import { expect, test } from "@playwright/test";

test("l'accueil mène au tableau de bord et la langue se change", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "CoCoPilot" })).toBeVisible();
  await expect(page).toHaveTitle(/JARVIS/);
  await page.getByText("EN", { exact: true }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Dashboard" })).toBeVisible();
});
