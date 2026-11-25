/**
 * Formes des réponses de l'API (/api/v1). Les schémas déjà publiés par `@jarvis/shared` sont réutilisés ;
 * ceux qui n'y figurent pas encore (lectures de stock, caisses, rapports, audit…) sont décrits ici
 * d'après les routes du backend. À promouvoir dans `@jarvis/shared` pour un contrat unique.
 */
import { article, brand, cashRegisterId, format, gasPrice, sale, sessionUser } from "@jarvis/shared";
import { z } from "zod";

export const loginResult = z.object({ token: z.string(), user: sessionUser });

export const brandList = z.array(brand);
export const formatList = z.array(format);
export const gasPriceList = z.array(gasPrice);
export const articleList = z.array(article);
export const saleList = z.array(sale);

/** GET /stock : niveaux plein/vide par marque et format, avec noms et seuil (absent de `stockLevel`). */
export const stockRow = z.object({
  brandId: z.string(),
  brandName: z.string(),
  formatId: z.string(),
  formatLabel: z.string(),
  full: z.number(),
  empty: z.number(),
  total: z.number(),
  threshold: z.number(),
  available: z.boolean(),
  low: z.boolean(),
});
export const stockRows = z.array(stockRow);

export const supplierRow = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  active: z.boolean(),
  brandIds: z.array(z.string()),
});
export const supplierRows = z.array(supplierRow);

export const receptionRow = z.object({
  id: z.string(),
  supplierId: z.string(),
  receivedAt: z.string(),
  lines: z.array(
    z.object({
      brandId: z.string(),
      formatId: z.string(),
      fullReceived: z.number(),
      emptyReturned: z.number(),
      unitCost: z.number(),
    }),
  ),
});
export const receptionRows = z.array(receptionRow);

export const countRow = z.object({
  id: z.string(),
  kind: z.string(),
  brandId: z.string(),
  formatId: z.string(),
  countedFull: z.number(),
  countedEmpty: z.number(),
  theoreticalFull: z.number(),
  theoreticalEmpty: z.number(),
  justification: z.string().nullable(),
  createdAt: z.string(),
  validatedAt: z.string().nullable(),
});
export const countRows = z.array(countRow);

export const registerRow = z.object({
  id: cashRegisterId,
  label: z.string(),
  active: z.boolean(),
  balance: z.number(),
});
export const registerRows = z.array(registerRow);

export const customerRow = z.object({ id: z.string(), name: z.string(), phone: z.string().nullable() });
export const customerRows = z.array(customerRow);

export const auditRow = z.object({
  id: z.string(),
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export const auditRows = z.array(auditRow);

export const notificationRow = z.object({
  id: z.string(),
  message: z.string(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
export const notificationRows = z.array(notificationRow);

export const customerStats = z.object({
  day: z.string(),
  lines: z.array(
    z.object({
      saleNumber: z.string(),
      at: z.string(),
      customerName: z.string(),
      item: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      paymentMethod: z.string(),
      total: z.number(),
      margin: z.number(),
      marginPercent: z.number().nullable(),
    }),
  ),
  totals: z.object({
    quantity: z.number(),
    total: z.number(),
    margin: z.number(),
    marginPercent: z.number().nullable(),
  }),
});

export const cashJournal = z.object({
  day: z.string(),
  entries: z.array(
    z.object({
      at: z.string(),
      register: z.string(),
      number: z.string(),
      type: z.string(),
      direction: z.string(),
      paymentMethod: z.string(),
      customerName: z.string().nullable(),
      label: z.string(),
      amount: z.number(),
      balanceAfter: z.number(),
      operator: z.string(),
    }),
  ),
  total: z.number(),
  inCash: z.number(),
});

export const xReport = z.object({
  day: z.string(),
  registers: z.array(
    z.object({
      label: z.string(),
      opening: z.number(),
      movements: z.array(
        z.object({ number: z.string(), type: z.string(), label: z.string(), amount: z.number() }),
      ),
      net: z.number(),
      closing: z.number(),
    }),
  ),
  grandTotal: z.number(),
});

export const gasSituation = z.object({
  rows: z.array(z.object({ brand: z.string(), full: z.number(), empty: z.number(), total: z.number() })),
  totals: z.object({ full: z.number(), empty: z.number(), total: z.number() }),
});

/** POST /sync/replay : un résultat par opération rejouée. */
export const replayResponse = z.object({
  results: z.array(
    z.object({
      clientOpId: z.string(),
      status: z.enum(["applied", "duplicate", "conflict", "rejected"]),
      conflict: z.string().optional(),
      error: z.object({ code: z.string(), message: z.string() }).optional(),
    }),
  ),
});

export const receiptSaved = z.object({ id: z.string() });
export const sessionUserSchema = sessionUser;
