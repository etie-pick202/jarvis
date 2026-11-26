import { canalFormulas, canalSubscriber, canalSubscribers } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { addDays, daysBetween } from "./rules.js";

const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("dates d'échéance", () => {
  it("compte les jours, passés compris, et décale à travers les mois", () => {
    expect(daysBetween("2026-11-24", "2026-12-01")).toBe(7);
    expect(daysBetween("2026-11-24", "2026-11-20")).toBe(-4);
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("Canal+ : formules, abonnés, échéances (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let gerant: string;
  let caissier: string;
  let livreur: string;
  let formulaId: string;

  const send = (path: string, body: unknown, token = gerant, method = "POST") =>
    t.app.request(`/api/v1/canal${path}`, { ...jsonPost(body, token), method });
  const get = (path: string, token = gerant) => t.app.request(`/api/v1/canal${path}`, authGet(token));
  const names = async (path: string) =>
    canalSubscribers.parse(await (await get(path)).json()).map((s) => s.name);
  const subscriber = (name: string, decoderNumber: string, expiresOn: string | null) => ({
    name,
    phone: "690000000",
    decoderNumber,
    formulaId,
    expiresOn,
  });

  beforeAll(async () => {
    t = await createTestApp(3000);
    await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    await addUser(t.deps, "livreur1", ["livreur"]);
    [gerant, caissier, livreur] = [
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
      await t.tokenFor("livreur1"),
    ];
    const res = await send("/formulas", { name: "Formule essai", price: 5000 });
    formulaId = ((await res.json()) as { id: string }).id;
  });
  afterAll(() => t.close());

  it("formules : gérées par le gérant, lues par le caissier, nom unique", async () => {
    expect((await send("/formulas", { name: "Formule essai", price: 5000 })).status).toBe(409);
    expect((await send("/formulas", { name: "Autre", price: 5000 }, caissier)).status).toBe(403);
    const patched = await send(`/formulas/${formulaId}`, { price: 5500 }, gerant, "PATCH");
    expect(await patched.json()).toMatchObject({ price: 5500, months: 1, commission: 0 });
    expect(canalFormulas.parse(await (await get("/formulas", caissier)).json())).toHaveLength(1);
    expect((await get("/formulas", livreur)).status).toBe(403);
    expect((await send(`/formulas/${UNKNOWN}`, { price: 1 }, gerant, "PATCH")).status).toBe(404);
  });

  it("abonnés : fiche complète, décodeur unique, formule active", async () => {
    const created = await send("/subscribers", subscriber("Aïcha Ngo", "DEC-001", "2026-11-28"), caissier);
    expect(created.status).toBe(201);
    const fiche = canalSubscriber.parse(await created.json());
    expect(fiche).toMatchObject({ daysLeft: 4, formulaName: "Formule essai", formulaPrice: 5500 });
    expect((await send("/subscribers", subscriber("Autre", "DEC-001", null))).status).toBe(409);
    const badFormula = { ...subscriber("X", "DEC-009", null), formulaId: UNKNOWN };
    expect((await send("/subscribers", badFormula)).status).toBe(422);
    const renamed = await send(`/subscribers/${fiche.id}`, { name: "Aïcha Mbarga" }, gerant, "PATCH");
    expect(await renamed.json()).toMatchObject({ name: "Aïcha Mbarga" });
    expect((await get(`/subscribers/${fiche.id}`)).status).toBe(200);
    expect((await get(`/subscribers/${UNKNOWN}`)).status).toBe(404);
    expect((await send(`/subscribers/${UNKNOWN}`, { active: false }, gerant, "PATCH")).status).toBe(404);
  });

  it("recherche par nom, décodeur ou téléphone ; échéances proches et dépassées", async () => {
    await send("/subscribers", subscriber("Paul Essomba", "DEC-002", "2026-11-10"));
    await send("/subscribers", subscriber("Rose Atangana", "DEC-003", "2027-02-01"));
    await send("/subscribers", subscriber("Sans Échéance", "DEC-004", null));
    expect(await names("/subscribers?q=mbar")).toEqual(["Aïcha Mbarga"]);
    expect(await names("/subscribers?q=DEC-003")).toEqual(["Rose Atangana"]);
    expect(await names("/subscribers?q=%25")).toEqual([]);
    expect(await names("/subscribers")).toHaveLength(4);
    // Échéance dépassée d'abord ; l'abonné sans échéance et la lointaine ne sont pas relancés.
    expect(await names("/due")).toEqual(["Paul Essomba", "Aïcha Mbarga"]);
    expect(await names("/due?within=0")).toEqual(["Paul Essomba"]);
    expect((await get("/due?within=-1")).status).toBe(422);
  });
});
