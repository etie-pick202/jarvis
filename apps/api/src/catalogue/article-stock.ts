import type { Database } from "@jarvis/db";
import { schema } from "@jarvis/db";
import type { AdjustArticleInput, ArticleMove, RestockArticleInput } from "@jarvis/shared";
import { desc, eq, sql } from "drizzle-orm";
import { auditAndNotifyPdg, recordAudit } from "../audit/service.js";
import { requireRow } from "../db-errors.js";
import { AppError, type Deps } from "../http.js";

const { articles, articleMoves, receiptFiles, users } = schema;

export interface ArticleMoveInput {
  articleId: string;
  kind: ArticleMove["kind"];
  delta: number;
  label: string;
  authorId: string;
  receiptId?: string;
  createdAt: Date;
}

/**
 * Seul chemin qui change le stock d'un article suivi : la quantité et son mouvement sont écrits ensemble. La
 * variation est appliquée en base (pas de lecture puis écriture) et le stock ne devient jamais négatif.
 */
export async function moveArticleStock(tx: Database, move: ArticleMoveInput) {
  const [updated] = await tx
    .update(articles)
    .set({ stockQty: sql`${articles.stockQty} + ${move.delta}` })
    .where(eq(articles.id, move.articleId))
    .returning();
  if (!updated) throw new AppError(404, "not_found", "Article introuvable");
  if (updated.stockQty < 0) throw new AppError(409, "out_of_stock", `Rupture : ${updated.name}`);
  await tx.insert(articleMoves).values({ ...move, receiptId: move.receiptId ?? null });
  return updated;
}

async function trackedArticle(deps: Deps, articleId: string) {
  const article = requireRow(
    await deps.db.select().from(articles).where(eq(articles.id, articleId)),
    "Article introuvable",
  );
  if (!article.trackStock) {
    throw new AppError(422, "invalid_request", "Le stock de cet article n'est pas suivi");
  }
  return article;
}

export async function listArticleMoves(deps: Deps, articleId: string): Promise<ArticleMove[]> {
  requireRow(await deps.db.select().from(articles).where(eq(articles.id, articleId)), "Article introuvable");
  const rows = await deps.db
    .select({ move: articleMoves, authorName: users.displayName })
    .from(articleMoves)
    .innerJoin(users, eq(users.id, articleMoves.authorId))
    .where(eq(articleMoves.articleId, articleId))
    .orderBy(desc(articleMoves.createdAt), desc(articleMoves.id));
  return rows.map(({ move, authorName }) => ({
    id: move.id,
    at: move.createdAt.toISOString(),
    kind: move.kind as ArticleMove["kind"],
    label: move.label,
    delta: move.delta,
    authorName,
  }));
}

/** Correction justifiée du stock d'un article ; le PDG est prévenu. */
export async function adjustArticle(
  deps: Deps,
  actorId: string,
  articleId: string,
  input: AdjustArticleInput,
  justification: string,
) {
  const article = await trackedArticle(deps, articleId);
  return deps.db.transaction(async (tx) => {
    const updated = await moveArticleStock(tx, {
      articleId,
      kind: "adjustment",
      delta: input.delta,
      label: justification,
      authorId: actorId,
      createdAt: deps.now(),
    });
    await auditAndNotifyPdg(
      tx,
      {
        action: "article.adjust",
        entity: "article",
        entityId: articleId,
        actorId,
        details: { delta: input.delta, justification },
      },
      `Correction du stock de « ${article.name} » (${input.delta}) : ${justification}`,
    );
    return updated;
  });
}

/** Entrée de marchandise : la pièce du fournisseur est obligatoire, comme pour le gaz. */
export async function restockArticle(
  deps: Deps,
  actorId: string,
  articleId: string,
  input: RestockArticleInput,
) {
  await trackedArticle(deps, articleId);
  const [piece] = await deps.db
    .select({ id: receiptFiles.id })
    .from(receiptFiles)
    .where(eq(receiptFiles.id, input.receiptId));
  if (!piece) {
    throw new AppError(422, "receipt_required", "Pièce justificative obligatoire (bon de commande ou reçu)");
  }
  return deps.db.transaction(async (tx) => {
    const updated = await moveArticleStock(tx, {
      articleId,
      kind: "entry",
      delta: input.quantity,
      label: input.label ?? "Réapprovisionnement",
      receiptId: input.receiptId,
      authorId: actorId,
      createdAt: deps.now(),
    });
    if (input.unitCost !== undefined) {
      await tx.update(articles).set({ purchaseCost: input.unitCost }).where(eq(articles.id, articleId));
    }
    await recordAudit(tx, {
      action: "article.restock",
      entity: "article",
      entityId: articleId,
      actorId,
      details: input,
    });
    return { ...updated, purchaseCost: input.unitCost ?? updated.purchaseCost };
  });
}
