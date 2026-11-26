import { z } from "zod";
import { cashRegisterId, direction, paymentMethod } from "./cash.js";
import { id, isoDateTime, signedInt } from "./common.js";
import { fcfa } from "./money.js";
import { sessionUser } from "./roles.js";
import { syncResult } from "./sync.js";

/**
 * Formes des réponses de lecture de l'API (/api/v1). Les schémas d'entrée et les objets métier (vente, prix,
 * marque…) sont dans leurs fichiers ; ceux-ci décrivent les listes et rapports renvoyés par les routes de lecture.
 * Ils sont vérifiés contre les vraies réponses du serveur (voir `apps/api/src/contracts.test.ts`).
 */

// ---------- Session ----------
export const loginResult = z.object({ token: z.string(), user: sessionUser });

// ---------- Stock ----------
/** GET /stock : niveaux par marque et format, avec noms et seuil d'alerte. */
export const stockRow = z.object({
  brandId: id,
  brandName: z.string(),
  formatId: id,
  formatLabel: z.string(),
  full: signedInt,
  empty: signedInt,
  total: signedInt,
  threshold: z.number().int(),
  available: z.boolean(),
  low: z.boolean(),
});
export type StockRow = z.infer<typeof stockRow>;
export const stockRows = z.array(stockRow);

export const supplierRow = z.object({
  id,
  name: z.string(),
  phone: z.string().nullable(),
  active: z.boolean(),
  brandIds: z.array(id),
});
export type SupplierRow = z.infer<typeof supplierRow>;
export const supplierRows = z.array(supplierRow);

export const receptionRow = z.object({
  id,
  supplierId: id,
  receivedAt: isoDateTime,
  lines: z.array(
    z.object({
      brandId: id,
      formatId: id,
      fullReceived: z.number().int(),
      emptyReturned: z.number().int(),
      unitCost: fcfa,
    }),
  ),
});
export type ReceptionRow = z.infer<typeof receptionRow>;
export const receptionRows = z.array(receptionRow);

export const receiptSaved = z.object({ id });

/** GET /inventory : comptages, avec les noms des acteurs et l'état de validation. */
export const countRow = z.object({
  id,
  kind: z.enum(["weekly", "evening"]),
  brandId: id,
  formatId: id,
  countedFull: z.number().int(),
  countedEmpty: z.number().int(),
  theoreticalFull: signedInt,
  theoreticalEmpty: signedInt,
  justification: z.string().nullable(),
  createdAt: isoDateTime,
  validatedAt: isoDateTime.nullable(),
  status: z.enum(["pending", "validated", "rejected"]),
  authorName: z.string(),
  validatedByName: z.string().nullable(),
  rejectedByName: z.string().nullable(),
  rejectedAt: isoDateTime.nullable(),
  rejectionReason: z.string().nullable(),
});
export type CountRow = z.infer<typeof countRow>;
export const countRows = z.array(countRow);

// ---------- Caisses ----------
export const registerRow = z.object({
  id: cashRegisterId,
  label: z.string(),
  active: z.boolean(),
  /** Solde courant. */
  balance: signedInt,
  /** Fond de caisse du matin : solde à l'ouverture du jour d'activité. */
  opening: signedInt,
});
export type RegisterRow = z.infer<typeof registerRow>;
export const registerRows = z.array(registerRow);

/** GET /cash/closure-threshold */
export const closureThresholdResult = z.object({ threshold: fcfa });

// ---------- Clients ----------
export const customerRow = z.object({ id, name: z.string(), phone: z.string().nullable() });
export type CustomerRow = z.infer<typeof customerRow>;
export const customerRows = z.array(customerRow);

// ---------- Contrôle ----------
export const auditRow = z.object({
  id,
  action: z.string(),
  entity: z.string(),
  entityId: z.string().nullable(),
  details: z.record(z.string(), z.unknown()).nullable(),
  actorId: id.nullable(),
  /** Nom affiché de l'acteur ; vide pour une action système. */
  actorName: z.string().nullable(),
  createdAt: isoDateTime,
});
export type AuditRow = z.infer<typeof auditRow>;
export const auditRows = z.array(auditRow);

export const notificationRow = z.object({
  id,
  message: z.string(),
  createdAt: isoDateTime,
  readAt: isoDateTime.nullable(),
});
export type NotificationRow = z.infer<typeof notificationRow>;
export const notificationRows = z.array(notificationRow);

// ---------- Rapports ----------
export const customerStats = z.object({
  day: z.iso.date(),
  lines: z.array(
    z.object({
      saleNumber: z.string(),
      at: isoDateTime,
      customerName: z.string(),
      item: z.string(),
      quantity: signedInt,
      unitPrice: fcfa,
      paymentMethod,
      total: signedInt,
      margin: signedInt,
      marginPercent: z.number().nullable(),
    }),
  ),
  totals: z.object({
    quantity: signedInt,
    total: signedInt,
    margin: signedInt,
    marginPercent: z.number().nullable(),
  }),
});
export type CustomerStats = z.infer<typeof customerStats>;

export const cashJournal = z.object({
  day: z.iso.date(),
  entries: z.array(
    z.object({
      at: isoDateTime,
      registerId: cashRegisterId,
      register: z.string(),
      number: z.string(),
      type: z.string(),
      direction,
      paymentMethod,
      customerName: z.string().nullable(),
      label: z.string(),
      amount: fcfa,
      balanceAfter: signedInt,
      operator: z.string(),
    }),
  ),
  total: signedInt,
  inCash: signedInt,
});
export type CashJournal = z.infer<typeof cashJournal>;

export const xReport = z.object({
  day: z.iso.date(),
  registers: z.array(
    z.object({
      registerId: cashRegisterId,
      label: z.string(),
      opening: signedInt,
      movements: z.array(
        z.object({
          line: z.number().int(),
          number: z.string(),
          type: z.string(),
          at: isoDateTime,
          label: z.string(),
          amount: signedInt,
        }),
      ),
      net: signedInt,
      closing: signedInt,
    }),
  ),
  grandTotal: signedInt,
});
export type XReport = z.infer<typeof xReport>;

export const gasSituation = z.object({
  rows: z.array(z.object({ brand: z.string(), full: signedInt, empty: signedInt, total: signedInt })),
  totals: z.object({ full: signedInt, empty: signedInt, total: signedInt }),
});
export type GasSituation = z.infer<typeof gasSituation>;

/** GET /reports/dashboard : vue agrégée du PDG pour un jour d'activité. */
export const dashboard = z.object({
  day: z.iso.date(),
  sales: z.object({
    count: z.number().int(),
    quantity: signedInt,
    total: signedInt,
    margin: signedInt,
    marginPercent: z.number().nullable(),
  }),
  registers: z.array(
    z.object({
      id: cashRegisterId,
      label: z.string(),
      active: z.boolean(),
      opening: signedInt,
      balance: signedInt,
    }),
  ),
  stock: z.object({ full: signedInt, empty: signedInt, alerts: z.array(stockRow) }),
  unreadNotifications: z.number().int(),
  /** Abonnements Canal+ dépassés ou à échéance dans les 7 jours. */
  canalDue: z.number().int().optional(),
});
export type Dashboard = z.infer<typeof dashboard>;

// ---------- Synchronisation ----------
/** POST /sync/replay : un résultat par opération rejouée. */
export const replayResponse = z.object({ results: z.array(syncResult) });
export type ReplayResponse = z.infer<typeof replayResponse>;
