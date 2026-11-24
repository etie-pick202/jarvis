import { schema } from "@jarvis/db";
import type { Deps } from "../http.js";
import { appendStockMove } from "../stock/ledger.js";

/** Catalogue d'essai fictif : trois marques (valeurs d'emballage 20 000, 17 500, 15 900), un format, prix 6 500 + 300. */
export async function seedGas(deps: Deps, authorId: string, fullStock = 10) {
  const { brands, formats, gasPrices } = schema;
  const [alpha, boreal, cobalt] = await deps.db
    .insert(brands)
    .values([
      { name: "Alpha", packagingValue: 20000 },
      { name: "Boreal", packagingValue: 17500 },
      { name: "Cobalt", packagingValue: 15900 },
    ])
    .returning();
  const [format] = await deps.db.insert(formats).values({ label: "12,5 kg", weightGrams: 12500 }).returning();
  if (!alpha || !boreal || !cobalt || !format) throw new Error("fixtures");
  await deps.db.insert(gasPrices).values({
    formatId: format.id,
    amount: 6500,
    transportContribution: 300,
    purchaseCost: 6170,
    effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  });
  for (const b of [alpha, boreal, cobalt]) {
    await appendStockMove(deps.db, {
      brandId: b.id,
      formatId: format.id,
      state: "full",
      delta: fullStock,
      reason: "reception",
      authorId,
    });
  }
  return { alpha, boreal, cobalt, format };
}
