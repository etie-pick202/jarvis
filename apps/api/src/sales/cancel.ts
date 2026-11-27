import { schema } from "@jarvis/db";
import { justification as justificationSchema, type Sale, type SessionUser } from "@jarvis/shared";
import { and, eq, isNull } from "drizzle-orm";
import { auditAndNotifyPdg } from "../audit/service.js";
import { formatNumber, nextSequence } from "../cash/ledger.js";
import { appendCheckedEntry } from "../cash/service.js";
import { moveArticleStock } from "../catalogue/article-stock.js";
import { AppError, type Deps } from "../http.js";
import { appendStockMove, lockStock, stockOf } from "../stock/ledger.js";
import { toSale } from "./service.js";
import { withSettlements } from "./settlements.js";

const { sales, saleLines, stockMoves, cashEntries, articles } = schema;

/** Valide le justificatif : sans lui, ni annulation ni correction (code dédié, distinct d'une requête mal formée). */
export function requireJustification(value: unknown): string {
  const parsed = justificationSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      422,
      "justification_required",
      "Un justificatif est obligatoire (5 caractères au moins)",
    );
  }
  return parsed.data;
}

/**
 * Annulation d'une vente : le journal n'est jamais modifié. On ajoute une vente inverse (reversal_of), les
 * mouvements de stock inverses et la sortie de caisse correspondante, avec le justificatif, puis le PDG est prévenu.
 * Une correction se fait de la même façon : annuler, puis ressaisir la vente exacte.
 */
export async function cancelSale(
  deps: Deps,
  actor: SessionUser,
  saleId: string,
  rawJustification: unknown,
): Promise<Sale> {
  const why = requireJustification(rawJustification);
  const now = deps.now();
  return deps.db.transaction(async (tx) => {
    const [original] = await tx.select().from(sales).where(eq(sales.id, saleId));
    if (!original) throw new AppError(404, "not_found", "Vente introuvable");
    if (original.reversalOf)
      throw new AppError(422, "invalid_request", "Une annulation ne peut pas être annulée");
    const [already] = await tx.select({ id: sales.id }).from(sales).where(eq(sales.reversalOf, saleId));
    if (already) throw new AppError(409, "conflict", `La vente ${original.number} est déjà annulée`);

    const moves = await tx
      .select()
      .from(stockMoves)
      .where(and(eq(stockMoves.saleId, saleId), isNull(stockMoves.reversalOf)));
    const pairs = [...new Set(moves.map((m) => `${m.brandId}:${m.formatId}`))].sort((a, b) =>
      a.localeCompare(b),
    );
    for (const pair of pairs) {
      const [brandId, formatId] = pair.split(":") as [string, string];
      await lockStock(tx, brandId, formatId);
    }
    for (const m of moves) {
      if (m.delta > 0 && (await stockOf(tx, m.brandId, m.formatId, m.state as "full" | "empty")) < m.delta) {
        throw new AppError(
          409,
          "stock_conflict",
          "Stock insuffisant pour reprendre les bouteilles de cette vente",
        );
      }
    }

    const number = formatNumber("AN", await nextSequence(tx, "sale_number_seq"));
    const [reversal] = await tx
      .insert(sales)
      .values({
        number,
        customerId: original.customerId,
        customerName: original.customerName,
        paymentMethod: original.paymentMethod,
        total: original.total,
        authorId: actor.id,
        reversalOf: original.id,
        justification: why,
        createdAt: now,
      })
      .returning();
    if (!reversal) throw new Error("Annulation non enregistrée");
    // L'annulation reprend aussi un écart soldé après la vente.
    const lines = await withSettlements(
      tx,
      await tx.select().from(saleLines).where(eq(saleLines.saleId, saleId)),
    );
    const copies = await tx
      .insert(saleLines)
      .values(lines.map(({ id: _id, ...l }) => ({ ...l, saleId: reversal.id })))
      .returning();

    for (const m of moves) {
      await appendStockMove(tx, {
        brandId: m.brandId,
        formatId: m.formatId,
        state: m.state as "full" | "empty",
        delta: -m.delta,
        reason: "reversal",
        authorId: actor.id,
        saleId: reversal.id,
        reversalOf: m.id,
        justification: why,
        createdAt: now,
      });
    }
    for (const l of lines) {
      if (l.kind === "article" && l.articleId) {
        const [art] = await tx.select().from(articles).where(eq(articles.id, l.articleId));
        if (art?.trackStock) {
          await moveArticleStock(tx, {
            articleId: art.id,
            kind: "sale",
            delta: l.quantity,
            label: `Annulation vente ${original.number}`,
            authorId: actor.id,
            createdAt: now,
          });
        }
      }
    }
    const [cash] = await tx
      .select()
      .from(cashEntries)
      .where(and(eq(cashEntries.saleId, saleId), isNull(cashEntries.reversalOf)));
    if (cash) {
      await appendCheckedEntry(tx, deps, {
        registerId: cash.registerId as Parameters<typeof appendCheckedEntry>[2]["registerId"],
        direction: "out",
        type: "MSC",
        paymentMethod: cash.paymentMethod as Parameters<typeof appendCheckedEntry>[2]["paymentMethod"],
        customerName: original.customerName,
        label: `Annulation vente ${original.number}`,
        amount: cash.amount,
        operatorId: actor.id,
        saleId: reversal.id,
        reversalOf: cash.id,
        justification: why,
      });
    }
    await auditAndNotifyPdg(
      tx,
      {
        action: "sale.cancel",
        entity: "sale",
        entityId: saleId,
        actorId: actor.id,
        details: { number: original.number, total: original.total, justification: why },
      },
      `${actor.displayName} a annulé la vente ${original.number} (${original.total} FCFA) le ${now.toISOString()} : ${why}`,
    );
    return toSale(reversal, copies);
  });
}
