import { expect, test } from "@playwright/test";
import { attendreServiceWorker, seConnecter } from "./aide.js";

test.use({ locale: "fr-FR" });

test("hors ligne : l'appli reste utilisable, l'opération attend puis part à la reconnexion", async ({
  page,
  context,
}) => {
  await seConnecter(page, "gerant");
  // Le service worker doit contrôler la page avant de couper le réseau.
  await attendreServiceWorker(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".voyant")).toContainText("Hors ligne");

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
  await expect(page.locator(".voyant")).toContainText("1 en attente");

  await context.setOffline(false);
  await expect(page.locator(".voyant")).not.toContainText("en attente", { timeout: 15_000 });
});
