import { schema } from "@jarvis/db";
import {
  type CreateNeighbourhoodInput,
  DEFAULT_DELIVERY_FEE_PER_BOTTLE,
  type ShopSettings,
  shopSettings,
  type UpdateNeighbourhoodInput,
  type UpdateShopSettingsInput,
} from "@jarvis/shared";
import { asc, eq, inArray } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { guardUnique, requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";

const { settings, neighbourhoods } = schema;

/** Clé de réglage de chaque champ ; le plafond reprend la clé déjà appliquée aux ventes. */
const KEYS = {
  openingHours: "shop_opening_hours",
  orderHours: "shop_order_hours",
  phone: "shop_phone",
  address: "shop_address",
  minimumOrder: "shop_minimum_order",
  deliveryFeePerBottle: "delivery_fee_default",
  deliveryFeeCeiling: "delivery_fee_ceiling",
  omNumber: "shop_om_number",
  momoNumber: "shop_momo_number",
  eveningCountTime: "evening_count_time",
} as const satisfies Record<keyof ShopSettings, string>;

const DUPLICATE = "Ce quartier existe déjà";

export async function readSettings(db: Deps["db"]): Promise<ShopSettings> {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, Object.values(KEYS)));
  const value = (field: keyof ShopSettings) => rows.find((r) => r.key === KEYS[field])?.value;
  const amount = (field: keyof ShopSettings, fallback: number) => Number(value(field) ?? fallback);
  const ceiling = value("deliveryFeeCeiling");
  return shopSettings.parse({
    openingHours: value("openingHours") ?? "",
    orderHours: value("orderHours") ?? "",
    phone: value("phone") ?? "",
    address: value("address") ?? "",
    omNumber: value("omNumber") ?? "",
    momoNumber: value("momoNumber") ?? "",
    eveningCountTime: value("eveningCountTime") ?? "",
    minimumOrder: amount("minimumOrder", 0),
    deliveryFeePerBottle: amount("deliveryFeePerBottle", DEFAULT_DELIVERY_FEE_PER_BOTTLE),
    deliveryFeeCeiling: ceiling === undefined ? null : Number(ceiling),
  });
}

/** Un montant de livraison ne dépasse jamais le plafond fixé par le PDG. */
export function assertUnderCeiling(fee: number, ceiling: number | null) {
  if (ceiling !== null && fee > ceiling) {
    throw new AppError(
      422,
      "price_above_ceiling",
      `La livraison dépasse le plafond de ${ceiling} FCFA par bouteille`,
    );
  }
}

async function writeSetting(db: Deps["db"], key: string, value: string) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export async function updateSettings(deps: Deps, actorId: string, input: UpdateShopSettingsInput) {
  if (input.deliveryFeePerBottle !== undefined) {
    assertUnderCeiling(input.deliveryFeePerBottle, (await readSettings(deps.db)).deliveryFeeCeiling);
  }
  for (const [field, value] of Object.entries(input)) {
    if (value !== undefined) await writeSetting(deps.db, KEYS[field as keyof typeof input], String(value));
  }
  await recordAudit(deps.db, {
    action: "shop.settings.change",
    entity: "setting",
    entityId: "shop",
    actorId,
    details: input,
  });
  return readSettings(deps.db);
}

export async function setFeeCeiling(deps: Deps, actorId: string, ceiling: number | null) {
  if (ceiling === null) await deps.db.delete(settings).where(eq(settings.key, KEYS.deliveryFeeCeiling));
  else await writeSetting(deps.db, KEYS.deliveryFeeCeiling, String(ceiling));
  await recordAudit(deps.db, {
    action: "delivery.ceiling.change",
    entity: "setting",
    entityId: KEYS.deliveryFeeCeiling,
    actorId,
    details: { ceiling },
  });
  return readSettings(deps.db);
}

// ---------- Quartiers ----------
export const listNeighbourhoods = (db: Deps["db"]) =>
  db.select().from(neighbourhoods).orderBy(asc(neighbourhoods.name));

export async function createNeighbourhood(deps: Deps, actorId: string, input: CreateNeighbourhoodInput) {
  const current = await readSettings(deps.db);
  const feePerBottle = input.feePerBottle ?? current.deliveryFeePerBottle;
  assertUnderCeiling(feePerBottle, current.deliveryFeeCeiling);
  const row = await guardUnique(
    async () =>
      requireRow(await deps.db.insert(neighbourhoods).values({ name: input.name, feePerBottle }).returning()),
    DUPLICATE,
  );
  await recordAudit(deps.db, {
    action: "neighbourhood.create",
    entity: "neighbourhood",
    entityId: row.id,
    actorId,
    details: { name: row.name, feePerBottle },
  });
  return row;
}

export async function updateNeighbourhood(
  deps: Deps,
  actorId: string,
  neighbourhoodId: string,
  input: UpdateNeighbourhoodInput,
) {
  if (input.feePerBottle !== undefined) {
    assertUnderCeiling(input.feePerBottle, (await readSettings(deps.db)).deliveryFeeCeiling);
  }
  const row = await guardUnique(
    async () =>
      requireRow(
        await deps.db
          .update(neighbourhoods)
          .set(input)
          .where(eq(neighbourhoods.id, neighbourhoodId))
          .returning(),
        "Quartier introuvable",
      ),
    DUPLICATE,
  );
  await recordAudit(deps.db, {
    action: "neighbourhood.update",
    entity: "neighbourhood",
    entityId: row.id,
    actorId,
    details: input,
  });
  return row;
}
