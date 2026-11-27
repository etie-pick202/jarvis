import { z } from "zod";

/** Qui reçoit quoi (CoCoConfig, « Notifications »). Les corrections et annulations vont toujours au PDG. */

const recipients = z.array(z.enum(["pdg", "gerant", "caissier"])).max(3);

export const notificationSettings = z.object({
  /** Rappels de réabonnement Canal+ à envoyer. */
  reminders: recipients,
  /** Alertes de stock bas. */
  stockAlerts: recipients,
  /** Rapports journaliers dans l'application. */
  reports: recipients,
  /** Adresses qui reçoivent les rapports par e-mail ; aucune autre ne peut être visée. */
  reportEmails: z.array(z.email().max(200)).max(10),
});
export type NotificationSettings = z.infer<typeof notificationSettings>;

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  reminders: ["gerant"],
  stockAlerts: ["pdg", "gerant"],
  reports: ["pdg"],
  reportEmails: [],
};

/** Envoi des rapports d'un jour par e-mail, aux adresses réglées (jamais à une adresse libre). */
export const emailReportsInput = z.object({
  reports: z.array(z.enum(["sales", "cash", "stock", "x"])).min(1),
  format: z.enum(["pdf", "csv", "xlsx"]).default("pdf"),
  date: z.iso.date().optional(),
});
export type EmailReportsInput = z.infer<typeof emailReportsInput>;

export const emailReportsStatus = z.object({
  /** Faux tant que le serveur d'envoi n'est pas configuré. */
  configured: z.boolean(),
  recipients: z.array(z.string()),
});
export type EmailReportsStatus = z.infer<typeof emailReportsStatus>;
