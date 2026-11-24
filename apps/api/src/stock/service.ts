import { schema } from "@jarvis/db";
import type {
  CountInput,
  CreateReceptionInput,
  CreateSupplierInput,
  SetThresholdInput,
  UpdateSupplierInput,
} from "@jarvis/shared";
import { RECEIPT_CONTENT_TYPES, RECEIPT_MAX_BYTES } from "@jarvis/shared";
import { desc, eq, inArray, isNull, like } from "drizzle-orm";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { AppError, type Deps } from "../http.js";
import { appendStockMove, lockStock, stockOf } from "./ledger.js";
import {
  countGap,
  DEFAULT_LOW_STOCK_THRESHOLD,
  isAvailable,
  isLowStock,
  parseThreshold,
  thresholdKey,
} from "./rules.js";

const {
  brands,
  formats,
  suppliers,
  supplierBrands,
  receptions,
  receptionLines,
  inventoryCounts,
  receiptFiles,
  settings,
} = schema;

// ---------- Niveaux et alertes ----------
export async function stockLevels(deps: Deps) {
  const [activeBrands, activeFormats, thresholds] = await Promise.all([
    deps.db.select().from(brands).where(eq(brands.active, true)).orderBy(brands.name),
    deps.db.select().from(formats).where(eq(formats.active, true)).orderBy(formats.weightGrams),
    deps.db.select().from(settings).where(like(settings.key, "low_stock:%")),
  ]);
  const byKey = new Map(thresholds.map((t) => [t.key, t.value]));
  const fallback = parseThreshold(byKey.get(thresholdKey()), DEFAULT_LOW_STOCK_THRESHOLD);
  const levels = [];
  for (const brand of activeBrands) {
    for (const format of activeFormats) {
      const [full, empty] = [
        await stockOf(deps.db, brand.id, format.id, "full"),
        await stockOf(deps.db, brand.id, format.id, "empty"),
      ];
      const threshold = parseThreshold(byKey.get(thresholdKey(brand.id, format.id)), fallback);
      levels.push({
        brandId: brand.id,
        brandName: brand.name,
        formatId: format.id,
        formatLabel: format.label,
        full,
        empty,
        total: full + empty,
        threshold,
        available: isAvailable(full),
        low: isLowStock(full, threshold),
      });
    }
  }
  return levels;
}

export async function stockAlerts(deps: Deps) {
  return (await stockLevels(deps)).filter((l) => l.low);
}

export async function setThreshold(deps: Deps, actorId: string, input: SetThresholdInput) {
  if (Boolean(input.brandId) !== Boolean(input.formatId)) {
    throw new AppError(422, "invalid_request", "Indiquer la marque et le format ensemble, ou aucun des deux");
  }
  const key = thresholdKey(input.brandId, input.formatId);
  const value = String(input.threshold);
  await deps.db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
  await recordAudit(deps.db, {
    action: "threshold.change",
    entity: "setting",
    entityId: key,
    actorId,
    details: input,
  });
  return { key, threshold: input.threshold };
}

// ---------- Fournisseurs ----------
async function brandsOf(deps: Deps, supplierId: string): Promise<string[]> {
  const rows = await deps.db.select().from(supplierBrands).where(eq(supplierBrands.supplierId, supplierId));
  return rows.map((r) => r.brandId);
}

async function assertBrandsExist(deps: Deps, brandIds: string[]): Promise<string[]> {
  const unique = [...new Set(brandIds)];
  if (unique.length) {
    const known = await deps.db.select({ id: brands.id }).from(brands).where(inArray(brands.id, unique));
    if (known.length !== unique.length) throw new AppError(422, "invalid_request", "Marque inconnue");
  }
  return unique;
}

async function setSupplierBrands(deps: Deps, supplierId: string, unique: string[]) {
  await deps.db.delete(supplierBrands).where(eq(supplierBrands.supplierId, supplierId));
  if (unique.length)
    await deps.db.insert(supplierBrands).values(unique.map((brandId) => ({ supplierId, brandId })));
}

export async function listSuppliers(deps: Deps) {
  const rows = await deps.db.select().from(suppliers).orderBy(suppliers.name);
  return Promise.all(rows.map(async (s) => ({ ...s, brandIds: await brandsOf(deps, s.id) })));
}

export async function createSupplier(deps: Deps, actorId: string, input: CreateSupplierInput) {
  const brandIds = await assertBrandsExist(deps, input.brandIds);
  const exists = await deps.db
    .select({ id: suppliers.id })
    .from(suppliers)
    .where(eq(suppliers.name, input.name));
  if (exists.length) throw new AppError(409, "conflict", "Ce fournisseur existe déjà");
  const [row] = await deps.db
    .insert(suppliers)
    .values({ name: input.name, phone: input.phone ?? null })
    .returning();
  if (!row) throw new Error("Fournisseur non créé");
  await setSupplierBrands(deps, row.id, brandIds);
  await recordAudit(deps.db, {
    action: "supplier.create",
    entity: "supplier",
    entityId: row.id,
    actorId,
    details: input,
  });
  return { ...row, brandIds: await brandsOf(deps, row.id) };
}

export async function updateSupplier(deps: Deps, actorId: string, id: string, input: UpdateSupplierInput) {
  const { brandIds, ...fields } = input;
  const checked = brandIds ? await assertBrandsExist(deps, brandIds) : undefined;
  const current = await deps.db.select().from(suppliers).where(eq(suppliers.id, id));
  if (!current[0]) throw new AppError(404, "not_found", "Fournisseur introuvable");
  const [row] = Object.keys(fields).length
    ? await deps.db.update(suppliers).set(fields).where(eq(suppliers.id, id)).returning()
    : current;
  if (checked) await setSupplierBrands(deps, id, checked);
  await recordAudit(deps.db, {
    action: "supplier.update",
    entity: "supplier",
    entityId: id,
    actorId,
    details: input,
  });
  return { ...row, brandIds: await brandsOf(deps, id) };
}

// ---------- Pièces justificatives et réceptions ----------
export async function saveReceipt(deps: Deps, actorId: string, contentType: string, data: Buffer) {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!(RECEIPT_CONTENT_TYPES as readonly string[]).includes(type)) {
    throw new AppError(422, "invalid_request", "Pièce acceptée : photo (JPEG, PNG, WebP) ou PDF");
  }
  if (data.length === 0) throw new AppError(422, "invalid_request", "Pièce vide");
  if (data.length > RECEIPT_MAX_BYTES)
    throw new AppError(413, "invalid_request", "Pièce trop lourde (8 Mo au plus)");
  const [row] = await deps.db
    .insert(receiptFiles)
    .values({ contentType: type, size: data.length, data, uploadedBy: actorId })
    .returning({ id: receiptFiles.id });
  if (!row) throw new Error("Pièce non enregistrée");
  return { id: row.id, contentType: type, size: data.length };
}

export async function getReceipt(deps: Deps, id: string) {
  const [row] = await deps.db.select().from(receiptFiles).where(eq(receiptFiles.id, id));
  if (!row) throw new AppError(404, "not_found", "Pièce introuvable");
  return row;
}

/**
 * Réception fournisseur à sa date réelle. Sans pièce justificative valide, elle est refusée et le stock ne bouge
 * pas. Les pleins reçus s'ajoutent, les vides rendus au fournisseur se retirent du stock de vides.
 */
export async function createReception(deps: Deps, authorId: string, input: CreateReceptionInput) {
  const now = deps.now();
  const receivedAt = input.receivedAt ? new Date(input.receivedAt) : now;
  if (receivedAt.getTime() > now.getTime()) {
    throw new AppError(422, "invalid_request", "La date de réception ne peut pas être dans le futur");
  }
  const [piece] = await deps.db
    .select({ id: receiptFiles.id })
    .from(receiptFiles)
    .where(eq(receiptFiles.id, input.receiptId));
  if (!piece)
    throw new AppError(422, "receipt_required", "Pièce justificative obligatoire (bon de commande ou reçu)");
  const [supplier] = await deps.db.select().from(suppliers).where(eq(suppliers.id, input.supplierId));
  if (!supplier?.active) throw new AppError(404, "not_found", "Fournisseur introuvable ou désactivé");

  return deps.db.transaction(async (tx) => {
    const keys = [...new Set(input.lines.map((l) => `${l.brandId}:${l.formatId}`))].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const k of keys) {
      const [brandId, formatId] = k.split(":") as [string, string];
      await lockStock(tx, brandId, formatId);
    }
    const [reception] = await tx
      .insert(receptions)
      .values({ supplierId: supplier.id, receivedAt, receiptRef: input.receiptId, authorId, createdAt: now })
      .returning();
    if (!reception) throw new Error("Réception non enregistrée");
    for (const line of input.lines) {
      const [brand] = await tx.select().from(brands).where(eq(brands.id, line.brandId));
      const [format] = await tx.select().from(formats).where(eq(formats.id, line.formatId));
      if (!brand || !format) throw new AppError(404, "not_found", "Marque ou format introuvable");
      if (line.emptyReturned > (await stockOf(tx, line.brandId, line.formatId, "empty"))) {
        throw new AppError(
          409,
          "stock_conflict",
          `Plus de vides rendus que de vides en stock pour ${brand.name}`,
        );
      }
      await tx.insert(receptionLines).values({ receptionId: reception.id, ...line });
      if (line.fullReceived > 0) {
        await appendStockMove(tx, {
          brandId: line.brandId,
          formatId: line.formatId,
          state: "full",
          delta: line.fullReceived,
          reason: "reception",
          receptionId: reception.id,
          authorId,
          createdAt: now,
        });
      }
      if (line.emptyReturned > 0) {
        await appendStockMove(tx, {
          brandId: line.brandId,
          formatId: line.formatId,
          state: "empty",
          delta: -line.emptyReturned,
          reason: "supplier_return",
          receptionId: reception.id,
          authorId,
          createdAt: now,
        });
      }
    }
    return { ...reception, lines: input.lines };
  });
}

/** Historique des livraisons, par fournisseur et/ou par marque. */
export async function listReceptions(deps: Deps, filter: { supplierId?: string; brandId?: string }) {
  const rows = await deps.db
    .select()
    .from(receptions)
    .where(filter.supplierId ? eq(receptions.supplierId, filter.supplierId) : undefined)
    .orderBy(desc(receptions.receivedAt));
  const lines = rows.length
    ? await deps.db
        .select()
        .from(receptionLines)
        .where(
          inArray(
            receptionLines.receptionId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows
    .map((r) => ({ ...r, lines: lines.filter((l) => l.receptionId === r.id) }))
    .filter((r) => !filter.brandId || r.lines.some((l) => l.brandId === filter.brandId));
}

// ---------- Inventaire hebdomadaire et confirmation du soir ----------
export async function recordCount(
  deps: Deps,
  authorId: string,
  kind: "weekly" | "evening",
  input: CountInput,
) {
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const created = [];
    let hasGap = false;
    for (const line of input.lines) {
      const theoreticalFull = await stockOf(tx, line.brandId, line.formatId, "full");
      const theoreticalEmpty = await stockOf(tx, line.brandId, line.formatId, "empty");
      const gapFull = countGap(line.countedFull, theoreticalFull);
      const gapEmpty = countGap(line.countedEmpty, theoreticalEmpty);
      const gap = gapFull !== 0 || gapEmpty !== 0;
      hasGap ||= gap;
      if (gap && !input.justification) {
        throw new AppError(422, "justification_required", "Un écart de comptage doit être justifié");
      }
      const [row] = await tx
        .insert(inventoryCounts)
        .values({
          kind,
          ...line,
          theoreticalFull,
          theoreticalEmpty,
          justification: gap ? (input.justification ?? null) : null,
          authorId,
          // Sans écart, rien à valider ; avec écart, le PDG valide (et le stock est alors ajusté).
          validatedBy: gap ? null : authorId,
          validatedAt: gap ? null : now,
          createdAt: now,
        })
        .returning();
      if (row) created.push({ ...row, gapFull, gapEmpty });
    }
    if (hasGap) {
      await auditAndNotifyPdg(
        tx,
        {
          action: `inventory.${kind}.gap`,
          entity: "inventory",
          actorId: authorId,
          details: { lines: input.lines.length, justification: input.justification },
        },
        `Écart de comptage (${kind === "weekly" ? "inventaire hebdomadaire" : "confirmation du soir"}) à valider`,
      );
    }
    return created;
  });
}

export async function listCounts(deps: Deps, pendingOnly: boolean) {
  const where = pendingOnly ? isNull(inventoryCounts.validatedAt) : undefined;
  return deps.db.select().from(inventoryCounts).where(where).orderBy(desc(inventoryCounts.createdAt));
}

/** Le PDG valide un comptage : le stock est ajusté à la quantité comptée par des mouvements justifiés. */
export async function validateCount(deps: Deps, validatorId: string, countId: string) {
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const [count] = await tx.select().from(inventoryCounts).where(eq(inventoryCounts.id, countId));
    if (!count) throw new AppError(404, "not_found", "Comptage introuvable");
    if (count.validatedAt) throw new AppError(409, "conflict", "Comptage déjà validé");
    await lockStock(tx, count.brandId, count.formatId);
    const reason = count.kind === "weekly" ? "inventory_adjustment" : "evening_adjustment";
    for (const state of ["full", "empty"] as const) {
      const counted = state === "full" ? count.countedFull : count.countedEmpty;
      const delta = counted - (await stockOf(tx, count.brandId, count.formatId, state));
      if (delta !== 0) {
        await appendStockMove(tx, {
          brandId: count.brandId,
          formatId: count.formatId,
          state,
          delta,
          reason,
          authorId: validatorId,
          justification: count.justification,
          createdAt: now,
        });
      }
    }
    await tx
      .update(inventoryCounts)
      .set({ validatedBy: validatorId, validatedAt: now })
      .where(eq(inventoryCounts.id, countId));
    await recordAudit(tx, {
      action: "inventory.validate",
      entity: "inventory",
      entityId: countId,
      actorId: validatorId,
    });
    return { id: countId, validatedAt: now.toISOString() };
  });
}
