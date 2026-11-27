import { schema } from "@jarvis/db";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  notificationSettings,
  type Role,
} from "@jarvis/shared";
import { eq } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import type { Deps } from "../http.js";

const { settings } = schema;
const KEY = "notification_recipients";

export async function readNotificationSettings(deps: Deps): Promise<NotificationSettings> {
  const [row] = await deps.db.select().from(settings).where(eq(settings.key, KEY));
  return row ? notificationSettings.parse(JSON.parse(row.value)) : DEFAULT_NOTIFICATION_SETTINGS;
}

export async function writeNotificationSettings(deps: Deps, actorId: string, input: NotificationSettings) {
  const value = JSON.stringify(input);
  await deps.db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await recordAudit(deps.db, {
    action: "notification.recipients.change",
    entity: "setting",
    entityId: KEY,
    actorId,
    details: input,
  });
  return input;
}

/** Le caissier ne voit que ce qui le concerne : ni les autres profils, ni les adresses e-mail. */
export function visibleTo(role: Role, value: NotificationSettings): NotificationSettings {
  if (role !== "caissier") return value;
  const own = (list: NotificationSettings["reports"]) => list.filter((r) => r === "caissier");
  return {
    reminders: own(value.reminders),
    stockAlerts: own(value.stockAlerts),
    reports: own(value.reports),
    reportEmails: [],
  };
}
