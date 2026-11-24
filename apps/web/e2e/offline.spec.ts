import { expect, test } from "@playwright/test";

test.use({ locale: "fr-FR" });

test("hors ligne : l'appli reste utilisable, l'opération attend puis part à la reconnexion", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "CoCoPilot" })).toBeVisible();
  // Le service worker doit contrôler la page avant de couper le réseau.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status")).toContainText("Hors ligne");

  // Une vente saisie hors ligne est rangée dans la file locale (écriture directe, l'écran de vente arrive à l'étape 4).
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("jarvis");
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction("outbox", "readwrite");
          tx.objectStore("outbox").put({
            id: "op-1",
            method: "POST",
            path: "/ventes",
            body: { article: "OLA", quantite: 1 },
            idempotencyKey: "cle-1",
            label: "Vente OLA",
            createdAt: Date.now(),
            status: "pending",
            attempts: 0,
          });
          tx.oncomplete = () => resolve();
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText("1 en attente");

  let received: string | null = null;
  await page.route("**/api/ventes", async (route) => {
    received = route.request().headers()["idempotency-key"] ?? null;
    await route.fulfill({ status: 201, json: { ok: true } });
  });
  await context.setOffline(false);
  await expect(page.getByRole("status")).not.toContainText("en attente", { timeout: 15_000 });
  expect(received).toBe("cle-1");
});
