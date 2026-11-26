import { schema } from "@jarvis/db";
import type { PublicCatalogue } from "@jarvis/shared";
import { asc, eq } from "drizzle-orm";
import { currentGasPrice } from "../catalogue/service.js";
import type { Deps } from "../http.js";
import { stockOf } from "../stock/ledger.js";
import { reservedArticle, reservedFull } from "./reservations.js";
import { listNeighbourhoods, readSettings } from "./settings.js";

const { brands, formats, articles } = schema;

/** Produits proposés au client : prix en vigueur et disponibilité, sans coût ni quantité. */
export async function publicCatalogue(deps: Deps): Promise<PublicCatalogue> {
  const now = deps.now();
  const [activeBrands, activeFormats, activeArticles, quarters, shopSettings] = await Promise.all([
    deps.db.select().from(brands).where(eq(brands.active, true)).orderBy(asc(brands.name)),
    deps.db.select().from(formats).where(eq(formats.active, true)).orderBy(asc(formats.weightGrams)),
    deps.db.select().from(articles).where(eq(articles.active, true)).orderBy(asc(articles.name)),
    listNeighbourhoods(deps.db),
    readSettings(deps.db),
  ]);
  const gas: PublicCatalogue["gas"] = [];
  for (const brand of activeBrands) {
    for (const format of activeFormats) {
      const price = await currentGasPrice(deps.db, format.id, brand.id, now);
      if (!price) continue;
      gas.push({
        brandId: brand.id,
        brandName: brand.name,
        formatId: format.id,
        formatLabel: format.label,
        price: price.amount + price.transportContribution,
        available:
          (await stockOf(deps.db, brand.id, format.id, "full")) >
          (await reservedFull(deps.db, brand.id, format.id)),
      });
    }
  }
  const { deliveryFeeCeiling: _ceiling, ...shop } = shopSettings;
  return {
    gas,
    articles: await Promise.all(
      activeArticles.map(async (a) => ({
        id: a.id,
        name: a.name,
        price: a.price,
        available: !a.trackStock || a.stockQty > (await reservedArticle(deps.db, a.id)),
      })),
    ),
    neighbourhoods: quarters
      .filter((q) => q.active)
      .map((q) => ({ id: q.id, name: q.name, feePerBottle: q.feePerBottle })),
    shop,
  };
}
