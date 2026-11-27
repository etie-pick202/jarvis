import { notificationSettings } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";

describe("destinataires des notifications (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  const path = "/api/v1/control/notification-settings";
  const read = async (token = pdg) =>
    notificationSettings.parse(await (await t.app.request(path, authGet(token))).json());
  const write = (body: unknown, token = pdg) =>
    t.app.request(path, { ...jsonPost(body, token), method: "PUT" });

  beforeAll(async () => {
    t = await createTestApp(3000);
    await addUser(t.deps, "pdg1", ["pdg"]);
    await addUser(t.deps, "gerant1", ["gerant"]);
    await addUser(t.deps, "caissier1", ["caissier"]);
    [pdg, gerant, caissier] = [
      await t.tokenFor("pdg1"),
      await t.tokenFor("gerant1"),
      await t.tokenFor("caissier1"),
    ];
  });
  afterAll(() => t.close());

  it("valeurs par défaut lues par le PDG et le gérant", async () => {
    expect(await read(gerant)).toEqual({
      reminders: ["gerant"],
      stockAlerts: ["pdg", "gerant"],
      reports: ["pdg"],
      reportEmails: [],
    });
    const nothing = { reminders: [], stockAlerts: [], reports: [], reportEmails: [] };
    expect(await read(caissier)).toEqual(nothing);
  });

  it("modifiés par le PDG seul, avec des adresses valides", async () => {
    const next = {
      reminders: ["gerant", "caissier"],
      stockAlerts: ["gerant"],
      reports: ["pdg"],
      reportEmails: ["direction@example.test"],
    };
    expect((await write(next, gerant)).status).toBe(403);
    expect((await write({ ...next, reportEmails: ["pas une adresse"] })).status).toBe(422);
    expect((await write({ ...next, reports: ["livreur"] })).status).toBe(422);
    expect((await write(next)).status).toBe(200);
    expect(await read()).toEqual(next);
    expect(await read(gerant)).toEqual(next);
  });

  it("le caissier ne lit que sa part, sans les adresses, et n'écrit pas", async () => {
    expect(await read(caissier)).toEqual({
      reminders: ["caissier"],
      stockAlerts: [],
      reports: [],
      reportEmails: [],
    });
    expect(JSON.stringify(await read(caissier))).not.toContain("direction@");
    expect((await write(await read(caissier), caissier)).status).toBe(403);
  });

  it("fermé au livreur et sans session", async () => {
    await addUser(t.deps, "livreur1", ["livreur"]);
    expect((await t.app.request(path, authGet(await t.tokenFor("livreur1")))).status).toBe(403);
    expect((await t.app.request(path)).status).toBe(401);
  });
});
