import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import type {
  CreateArticleInput,
  CreateBrandInput,
  CreateFormatInput,
  SetGasPriceInput,
  UpdateArticleInput,
  UpdateBrandInput,
  UpdateFormatInput,
} from "@jarvis/shared";
import { desc, eq } from "drizzle-orm";
import { recordAudit } from "../audit/service.js";
import { AppError, type Deps } from "../http.js";
import { exceedsCeiling, type PriceRow, resolveGasPrice } from "./pricing.js";

const { brands, formats, gasPrices, articles, articlePriceHistory } = schema;

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

async function guardUnique<T>(run: () => Promise<T>, message: string): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isUniqueViolation(err)) throw new AppError(409, "conflict", message);
    throw err;
  }
}

function first<T>(rows: T[], message = "Introuvable"): T {
  const row = rows[0];
  if (!row) throw new AppError(404, "not_found", message);
  return row;
}

export const listBrands = (deps: Deps) => deps.db.select().from(brands).orderBy(brands.name);
export const listFormats = (deps: Deps) => deps.db.select().from(formats).orderBy(formats.weightGrams);

/** Valeur inconnue : stockée à 0 et marquée comme telle ; déclarer une valeur la rend connue. */
function packagingColumns(input: {
  packagingValue?: number | undefined;
  packagingValueKnown?: boolean | undefined;
}) {
  if (input.packagingValueKnown === false) return { packagingValue: 0, packagingValueKnown: false };
  if (input.packagingValue !== undefined)
    return { packagingValue: input.packagingValue, packagingValueKnown: true };
  return {};
}

export async function createBrand(deps: Deps, actorId: string, input: CreateBrandInput) {
  return guardUnique(async () => {
    const row = first(
      await deps.db
        .insert(brands)
        .values({ name: input.name, ...packagingColumns(input) })
        .returning(),
    );
    await recordAudit(deps.db, {
      action: "brand.create",
      entity: "brand",
      entityId: row.id,
      actorId,
      details: input,
    });
    return row;
  }, "Cette marque existe déjà");
}

export async function updateBrand(deps: Deps, actorId: string, brandId: string, input: UpdateBrandInput) {
  return guardUnique(async () => {
    const row = first(
      await deps.db
        .update(brands)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...packagingColumns(input),
        })
        .where(eq(brands.id, brandId))
        .returning(),
      "Marque introuvable",
    );
    await recordAudit(deps.db, {
      action: "brand.update",
      entity: "brand",
      entityId: row.id,
      actorId,
      details: input,
    });
    return row;
  }, "Cette marque existe déjà");
}

export async function createFormat(deps: Deps, actorId: string, input: CreateFormatInput) {
  return guardUnique(async () => {
    const row = first(
      await deps.db
        .insert(formats)
        .values({ ...input, priceCeiling: input.priceCeiling ?? null })
        .returning(),
    );
    await recordAudit(deps.db, {
      action: "format.create",
      entity: "format",
      entityId: row.id,
      actorId,
      details: input,
    });
    return row;
  }, "Ce format existe déjà");
}

export async function updateFormat(deps: Deps, actorId: string, formatId: string, input: UpdateFormatInput) {
  return guardUnique(async () => {
    const row = first(
      await deps.db.update(formats).set(input).where(eq(formats.id, formatId)).returning(),
      "Format introuvable",
    );
    await recordAudit(deps.db, {
      action: "format.update",
      entity: "format",
      entityId: row.id,
      actorId,
      details: input,
    });
    return row;
  }, "Ce format existe déjà");
}

async function priceRows(db: Database, formatId: string): Promise<PriceRow[]> {
  return db.select().from(gasPrices).where(eq(gasPrices.formatId, formatId));
}

/** Prix en vigueur d'une recharge (null si aucun prix n'a été défini). */
export async function currentGasPrice(db: Database, formatId: string, brandId: string, at: Date) {
  return resolveGasPrice(await priceRows(db, formatId), formatId, brandId, at);
}

/** Ajoute un prix à l'historique (jamais de modification de l'ancien) ; refuse un prix au-dessus du plafond. */
export async function setGasPrice(deps: Deps, actorId: string, input: SetGasPriceInput) {
  const format = first(
    await deps.db.select().from(formats).where(eq(formats.id, input.formatId)),
    "Format introuvable",
  );
  const brandId = input.brandId ?? null;
  if (brandId) first(await deps.db.select().from(brands).where(eq(brands.id, brandId)), "Marque introuvable");
  if (exceedsCeiling(input.amount, format.priceCeiling)) {
    throw new AppError(
      422,
      "price_above_ceiling",
      `Le prix dépasse le plafond de ${format.priceCeiling} FCFA`,
    );
  }
  const previous = brandId ? await currentGasPrice(deps.db, input.formatId, brandId, deps.now()) : null;
  const row = first(
    await deps.db
      .insert(gasPrices)
      .values({ ...input, brandId, changedBy: actorId, effectiveFrom: deps.now() })
      .returning(),
  );
  await recordAudit(deps.db, {
    action: "price.change",
    entity: "gas_price",
    entityId: row.id,
    actorId,
    details: { ...input, previousAmount: previous?.amount ?? null },
  });
  return row;
}

/** Prix en vigueur d'un format (pour une marque donnée, sinon le prix commun) ; 404 si aucun n'est défini. */
export async function currentPrice(deps: Deps, formatId: string, brandId: string | null) {
  first(await deps.db.select().from(formats).where(eq(formats.id, formatId)), "Format introuvable");
  const rows = await priceRows(deps.db, formatId);
  const price = resolveGasPrice(rows, formatId, brandId ?? "", deps.now());
  if (!price) throw new AppError(404, "not_found", "Aucun prix défini pour ce format");
  return price;
}

export const gasPriceHistory = (deps: Deps, formatId: string) =>
  deps.db
    .select()
    .from(gasPrices)
    .where(eq(gasPrices.formatId, formatId))
    .orderBy(desc(gasPrices.effectiveFrom));

export const listArticles = (deps: Deps) => deps.db.select().from(articles).orderBy(articles.name);

export async function createArticle(deps: Deps, actorId: string, input: CreateArticleInput) {
  const row = first(
    await deps.db
      .insert(articles)
      .values({ ...input, createdBy: actorId })
      .returning(),
  );
  await deps.db
    .insert(articlePriceHistory)
    .values({ articleId: row.id, price: row.price, changedBy: actorId, changedAt: deps.now() });
  await recordAudit(deps.db, {
    action: "article.create",
    entity: "article",
    entityId: row.id,
    actorId,
    details: input,
  });
  return row;
}

export async function updateArticle(
  deps: Deps,
  actorId: string,
  articleId: string,
  input: UpdateArticleInput,
) {
  const before = first(
    await deps.db.select().from(articles).where(eq(articles.id, articleId)),
    "Article introuvable",
  );
  const row = first(await deps.db.update(articles).set(input).where(eq(articles.id, articleId)).returning());
  if (input.price !== undefined && input.price !== before.price) {
    await deps.db
      .insert(articlePriceHistory)
      .values({ articleId, price: input.price, changedBy: actorId, changedAt: deps.now() });
    await recordAudit(deps.db, {
      action: "price.change",
      entity: "article",
      entityId: articleId,
      actorId,
      details: { from: before.price, to: input.price },
    });
  }
  return row;
}

export const articlePrices = (deps: Deps, articleId: string) =>
  deps.db
    .select()
    .from(articlePriceHistory)
    .where(eq(articlePriceHistory.articleId, articleId))
    .orderBy(desc(articlePriceHistory.changedAt));
