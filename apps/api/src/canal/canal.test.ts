import {
  canalFormulas,
  canalPayment,
  canalPayments,
  canalSubscriber,
  canalSubscribers,
} from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";
import { addDays, addMonths, daysBetween, nextExpiry } from "./rules.js";

const UNKNOWN = "3f1b1c1e-8a53-4c1e-9b0e-5d1a2b3c4d5e";

describe("dates d'échéance", () => {
  it("compte les jours, passés compris, et décale à travers les mois", () => {
    expect(daysBetween("2026-11-24", "2026-12-01")).toBe(7);
    expect(daysBetween("2026-11-24", "2026-11-20")).toBe(-4);
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
  });
});

describe("prolongation d'un abonnement", () => {
  it("part de l'échéance en cours, ou du jour du paiement si elle est dépassée", () => {
    expect(nextExpiry("2026-12-10", "2026-11-24", 1)).toBe("2027-01-10");
    expect(nextExpiry("2026-11-01", "2026-11-24", 1)).toBe("2026-12-24");
    expect(nextExpiry(null, "2026-11-24", 3)).toBe("2027-02-24");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
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

  it("encaissement : caisse Canal+, échéance prolongée, annulation tracée", async () => {
    const [fiche] = canalSubscribers.parse(await (await get("/subscribers?q=DEC-001")).json());
    const path = `/subscribers/${fiche?.id}/payments`;
    expect((await send(path, { paymentMethod: "momo" }, caissier)).status).toBe(422);
    const first = canalPayment.parse(await (await send(path, { paymentMethod: "cash" }, caissier)).json());
    expect(first).toMatchObject({
      registerId: "canal_cash",
      amount: 5500,
      previousExpiry: "2026-11-28",
      newExpiry: "2026-12-28",
    });
    const second = canalPayment.parse(await (await send(path, { paymentMethod: "orange_money" })).json());
    expect(second).toMatchObject({ registerId: "canal_om", newExpiry: "2027-01-28" });

    const cancel = (id: string, justification?: string, token = gerant) =>
      send(`/payments/${id}/cancel`, { justification }, token);
    expect((await cancel(first.id, "Erreur de saisie")).status).toBe(409); // pas le dernier
    expect((await cancel(second.id)).status).toBe(422);
    expect((await cancel(second.id, "Erreur de saisie", caissier)).status).toBe(403);
    const reversal = canalPayment.parse(await (await cancel(second.id, "Erreur de saisie")).json());
    expect(reversal.reversalOf).toBe(second.id);
    expect((await cancel(second.id, "Encore une fois")).status).toBe(409);
    expect((await cancel(reversal.id, "Encore une fois")).status).toBe(422);
    expect((await cancel(UNKNOWN, "Erreur de saisie")).status).toBe(404);

    const after = canalSubscriber.parse(await (await get(`/subscribers/${fiche?.id}`)).json());
    expect(after.expiresOn).toBe("2026-12-28");
    const history = canalPayments.parse(
      await (await get(`/payments?subscriberId=${fiche?.id}&date=2026-11-24`)).json(),
    );
    expect(history).toHaveLength(3);
    expect(history.filter((p) => p.cancelled).map((p) => p.id)).toEqual([second.id]);
    const registers = (await (await t.app.request("/api/v1/cash/registers", authGet(gerant))).json()) as {
      id: string;
      balance: number;
    }[];
    expect(registers.find((r) => r.id === "canal_cash")?.balance).toBe(5500);
    expect(registers.find((r) => r.id === "canal_om")?.balance).toBe(0);
  });

  it("encaissement saisi hors ligne : rejoué une seule fois", async () => {
    const [fiche] = canalSubscribers.parse(await (await get("/subscribers?q=DEC-004")).json());
    const operation = {
      clientOpId: "op-canal-0001",
      type: "canal_payment",
      occurredAt: "2026-11-23T10:00:00.000Z",
      payload: { subscriberId: fiche?.id, paymentMethod: "cash" },
    };
    const replay = async () =>
      (await (
        await t.app.request("/api/v1/sync/replay", jsonPost({ operations: [operation] }, gerant))
      ).json()) as { results: { status: string; result: { newExpiry: string } }[] };
    expect((await replay()).results[0]).toMatchObject({
      status: "applied",
      result: { newExpiry: "2026-12-23" },
    });
    expect((await replay()).results[0]?.status).toBe("duplicate");
  });
});
