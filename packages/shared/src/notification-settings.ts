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
