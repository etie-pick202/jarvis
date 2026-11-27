import type { EmailReportsInput, EmailReportsStatus } from "@jarvis/shared";
import { recordAudit } from "../audit/service.js";
import { businessDate } from "../cash/rules.js";
import { AppError, type Deps } from "../http.js";
import type { MailAttachment } from "../notifications/mailer.js";
import { readNotificationSettings } from "../notifications/settings.js";
import { toCsv } from "../reports/compute.js";
import { cashTable, salesTable, stockTable } from "../reports/service.js";
import { toXlsx } from "../reports/xlsx.js";
import { toPdf } from "./pdf.js";
import { reportLines } from "./service.js";

const TYPES = {
  pdf: "application/pdf",
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

export async function emailStatus(deps: Deps): Promise<EmailReportsStatus> {
  const { reportEmails } = await readNotificationSettings(deps);
  return { configured: deps.mailer !== undefined, recipients: reportEmails };
}

async function attachment(
  deps: Deps,
  name: EmailReportsInput["reports"][number],
  format: EmailReportsInput["format"],
  day: string,
): Promise<MailAttachment> {
  const filename = `${name}-${day}.${format}`;
  const contentType = TYPES[format];
  if (format === "pdf") {
    const content = Buffer.from(toPdf(await reportLines(deps, name, day), { landscape: true }));
    return { filename, contentType, content };
  }
  if (name === "x") throw new AppError(422, "invalid_request", "Le X de caisse n'existe qu'en PDF");
  const table = {
    sales: () => salesTable(deps, [day]),
    cash: () => cashTable(deps, [day]),
    stock: () => stockTable(deps),
  }[name];
  const { headers, rows } = await table();
  const content = Buffer.from(format === "csv" ? toCsv(headers, rows) : toXlsx(name, headers, rows));
  return { filename, contentType, content };
}

/** Envoie les rapports d'un jour aux seules adresses réglées par le PDG. */
export async function emailReports(deps: Deps, actorId: string, input: EmailReportsInput) {
  if (!deps.mailer) throw new AppError(409, "conflict", "L'envoi par e-mail n'est pas configuré");
  const { reportEmails } = await readNotificationSettings(deps);
  if (reportEmails.length === 0) {
    throw new AppError(409, "conflict", "Aucune adresse destinataire réglée par le PDG");
  }
  const day = input.date ?? businessDate(deps.now());
  const attachments = await Promise.all(
    [...new Set(input.reports)].map((name) => attachment(deps, name, input.format, day)),
  );
  const date = day.split("-").reverse().join("/");
  try {
    await deps.mailer.send({
      to: reportEmails,
      subject: `COCOSAB : rapports du ${date}`,
      text: `Rapports du ${date} en pièces jointes.`,
      attachments,
    });
  } catch (error) {
    // Le détail (serveur, identifiants) reste dans les journaux, jamais dans la réponse.
    console.error("Envoi des rapports impossible", error);
    throw new AppError(502, "internal_error", "Envoi impossible : réessayez plus tard");
  }
  await recordAudit(deps.db, {
    action: "report.email",
    entity: "report",
    entityId: day,
    actorId,
    details: { files: attachments.map((a) => a.filename), recipients: reportEmails.length },
  });
  return { sent: attachments.map((a) => a.filename), recipients: reportEmails };
}
