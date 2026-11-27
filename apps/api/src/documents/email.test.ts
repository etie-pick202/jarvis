import { emailReportsStatus } from "@jarvis/shared";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type MailMessage, mailerFromEnv, openSmtp, smtpMailer } from "../notifications/mailer.js";
import { addUser, authGet, createTestApp, jsonPost } from "../testing/db.js";

describe("transport SMTP", () => {
  it("reste inactif sans adresse du serveur ou expéditeur", () => {
    expect(mailerFromEnv({})).toBeUndefined();
    expect(mailerFromEnv({ SMTP_URL: "smtp://localhost:2525" })).toBeUndefined();
    expect(mailerFromEnv({ SMTP_FROM: "jarvis@example.test" })).toBeUndefined();
    const env = { SMTP_URL: "smtp://localhost:2525", SMTP_FROM: "jarvis@example.test" };
    expect(mailerFromEnv(env)).toBeDefined();
  });

  it("exige une connexion chiffrée, sans perdre les réglages de l'adresse", () => {
    const transport = openSmtp("smtp://localhost:2525") as unknown as {
      transporter: { options: { requireTLS?: boolean; host?: string; port?: number } };
    };
    expect(transport.transporter.options).toMatchObject({ requireTLS: true, host: "localhost", port: 2525 });
  });

  it("passe l'expéditeur configuré au transport", async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    const mailer = smtpMailer("smtp://localhost", "jarvis@example.test", () => ({ sendMail }));
    await mailer.send({ to: ["a@example.test"], subject: "s", text: "t", attachments: [] });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: "jarvis@example.test" }));
  });
});

describe("rapports par e-mail (API)", () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;
  let pdg: string;
  let gerant: string;
  let caissier: string;
  const sent: MailMessage[] = [];
  let failing = false;
  const path = "/api/v1/documents/reports/email";
  const send = (body: unknown, token = gerant) => t.app.request(path, jsonPost(body, token));
  const status = async () =>
    emailReportsStatus.parse(await (await t.app.request(path, authGet(gerant))).json());

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

  it("inactif sans configuration ni destinataire", async () => {
    expect(await status()).toEqual({ configured: false, recipients: [] });
    expect((await send({ reports: ["sales"] })).status).toBe(409);
    t.deps.mailer = {
      async send(message) {
        if (failing) throw new Error("serveur secret.example refusé");
        sent.push(message);
      },
    };
    expect((await send({ reports: ["sales"] })).status).toBe(409);
    expect(sent).toHaveLength(0);
  });

  it("envoie les fichiers demandés aux seules adresses réglées", async () => {
    const settings = {
      reminders: [],
      stockAlerts: [],
      reports: ["pdg"],
      reportEmails: ["direction@example.test"],
    };
    await t.app.request("/api/v1/control/notification-settings", {
      ...jsonPost(settings, pdg),
      method: "PUT",
    });
    expect(await status()).toEqual({ configured: true, recipients: ["direction@example.test"] });
    expect((await send({ reports: ["sales"] }, caissier)).status).toBe(403);
    expect((await send({ reports: [] })).status).toBe(422);
    const pdf = await send({ reports: ["sales", "cash", "stock", "x"], to: ["autre@example.test"] });
    expect(pdf.status).toBe(200);
    expect(sent[0]?.to).toEqual(["direction@example.test"]);
    expect(sent[0]?.attachments.map((a) => a.filename)).toEqual([
      "sales-2026-11-24.pdf",
      "cash-2026-11-24.pdf",
      "stock-2026-11-24.pdf",
      "x-2026-11-24.pdf",
    ]);
    for (const format of ["csv", "xlsx"]) {
      const res = await send({ reports: ["sales", "cash", "stock"], format, date: "2026-11-23" });
      expect(res.status).toBe(200);
    }
    expect(sent[2]?.attachments[0]?.filename).toBe("sales-2026-11-23.xlsx");
    expect((await send({ reports: ["x"], format: "csv" })).status).toBe(422);
  });

  it("un échec du serveur d'envoi ne révèle rien", async () => {
    failing = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await send({ reports: ["sales"] });
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain("secret.example");
    log.mockRestore();
  });
});
