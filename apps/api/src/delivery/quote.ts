import { schema } from "@jarvis/db";
import type { CreateOrderInput, OrderLine } from "@jarvis/shared";
import { eq } from "drizzle-orm";
import { currentGasPrice } from "../catalogue/service.js";
import { AppError, type Deps } from "../http.js";
import { stockOf } from "../stock/ledger.js";
import { reservedArticle, reservedFull } from "./reservations.js";

const { brands, formats, articles } = schema;

const outOfStock = (name: string) => new AppError(409, "out_of_stock", `Rupture : ${name}`);

async function activeBrand(deps: Deps, brandId: string) {
  const [brand] = await deps.db.select().from(brands).where(eq(brands.id, brandId));
  if (!brand?.active) throw new AppError(422, "invalid_request", "Marque inconnue ou désactivée");
  return brand;
}

/**
 * Lignes chiffrées aux prix en vigueur. Un produit à stock nul (réservations comprises) est refusé, au comptoir
 * comme en ligne. Les frais de livraison s'appliquent par bouteille de gaz.
 */
export async function quoteLines(
  deps: Deps,
  lines: CreateOrderInput["lines"],
  feePerBottle: number,
): Promise<OrderLine[]> {
  const now = deps.now();
  const demand = new Map<string, number>();
  const wanted = (key: string, quantity: number) => {
    const total = (demand.get(key) ?? 0) + quantity;
    demand.set(key, total);
    return total;
  };
  const quoted: OrderLine[] = [];
  for (const line of lines) {
    if (line.kind === "gas") {
      const brand = await activeBrand(deps, line.brandId);
      if (line.returnedBrandId) await activeBrand(deps, line.returnedBrandId);
      const [format] = await deps.db.select().from(formats).where(eq(formats.id, line.formatId));
      if (!format?.active) throw new AppError(422, "invalid_request", "Format inconnu ou désactivé");
      const price = await currentGasPrice(deps.db, format.id, brand.id, now);
      if (!price) throw new AppError(422, "invalid_request", "Aucun prix défini pour ce format");
      const free =
        (await stockOf(deps.db, brand.id, format.id, "full")) -
        (await reservedFull(deps.db, brand.id, format.id));
      if (wanted(`${brand.id}:${format.id}`, line.quantity) > free) throw outOfStock(brand.name);
      const unitPrice = price.amount + price.transportContribution;
      quoted.push({
        kind: "gas",
        brandId: brand.id,
        formatId: format.id,
        returnedBrandId: line.returnedBrandId ?? null,
        articleId: null,
        label: `Recharge gaz ${brand.name} ${format.label}`,
        quantity: line.quantity,
        unitPrice,
        deliveryFee: feePerBottle,
        total: line.quantity * (unitPrice + feePerBottle),
      });
      continue;
    }
    const [article] = await deps.db.select().from(articles).where(eq(articles.id, line.articleId));
    if (!article?.active) throw new AppError(404, "not_found", "Article introuvable ou désactivé");
    const total = wanted(article.id, line.quantity);
    if (article.trackStock && total > article.stockQty - (await reservedArticle(deps.db, article.id))) {
      throw outOfStock(article.name);
    }
    quoted.push({
      kind: "article",
      brandId: null,
      formatId: null,
      returnedBrandId: null,
      articleId: article.id,
      label: article.name,
      quantity: line.quantity,
      unitPrice: article.price,
      deliveryFee: 0,
      total: line.quantity * article.price,
    });
  }
  return quoted;
}
