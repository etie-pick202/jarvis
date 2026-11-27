import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp } from "../testing/db.js";
import { seedGas } from "../testing/fixtures.js";

describe("catalogue lu par le livreur (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let formatId: string;
  let livreur: string;
  const status = async (path: string) => (await t.app.request(`/api/v1${path}`, authGet(livreur))).status;

  beforeAll(async () => {
    t = await createTestApp(3000);
    const id = await addUser(t.deps, "livreur1", ["livreur"]);
    formatId = (await seedGas(t.deps, id, 1)).format.id;
    livreur = await t.tokenFor("livreur1");
  });
  afterAll(() => t.close());

  it("lit les marques et les formats, mais ni les prix, ni le stock, ni les caisses", async () => {
    expect(await status("/catalogue/brands")).toBe(200);
    expect(await status("/catalogue/formats")).toBe(200);
    for (const path of [
      "/catalogue/prices/current",
      `/catalogue/prices/${formatId}/current`,
      `/catalogue/prices/${formatId}/history`,
      "/catalogue/articles",
      "/stock",
      "/cash/registers",
    ]) {
      expect(await status(path), path).toBe(403);
    }
  });
});
