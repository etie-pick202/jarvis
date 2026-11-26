import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Convention : montants en FCFA = entiers (jamais de décimaux). Les tables du journal
// (sales, sale_lines, cash_entries, stock_moves, audit_log) sont en AJOUT SEUL : des
// déclencheurs SQL (migration 0001) interdisent UPDATE et DELETE. Une correction ajoute
// une écriture inverse (colonne reversal_of) avec justificatif.

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------- Utilisateurs, profils, sessions ----------
export const users = pgTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Un utilisateur peut cumuler plusieurs profils : pdg, gerant, livreur, caissier. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const sessions = pgTable("sessions", {
  /** Empreinte (hachage) du jeton : le jeton lui-même n'est jamais stocké. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  activeRole: text("active_role").notNull(),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// ---------- Catalogue gaz ----------
export const brands = pgTable("brands", {
  id: id(),
  name: text("name").notNull().unique(),
  /** Valeur d'emballage (bouteille vide consignée) en FCFA, pour l'écart d'échange. */
  packagingValue: integer("packaging_value").notNull().default(0),
  /** Faux tant que la valeur n'a pas été relevée (BOCOM) : l'écart d'un échange est alors à régulariser. */
  packagingValueKnown: boolean("packaging_value_known").notNull().default(true),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const formats = pgTable("formats", {
  id: id(),
  label: text("label").notNull().unique(),
  weightGrams: integer("weight_grams").notNull(),
  /** Plafond de prix optionnel (prix réglementé). */
  priceCeiling: integer("price_ceiling"),
  /** Date de requalification de la bouteille (facultatif). */
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** Historique des prix : on ajoute une ligne, on ne modifie jamais l'ancienne. brand_id nul = prix du format. */
export const gasPrices = pgTable(
  "gas_prices",
  {
    id: id(),
    formatId: uuid("format_id")
      .notNull()
      .references(() => formats.id),
    brandId: uuid("brand_id").references(() => brands.id),
    amount: integer("amount").notNull(),
    transportContribution: integer("transport_contribution").notNull().default(0),
    purchaseCost: integer("purchase_cost").notNull().default(0),
    changedBy: uuid("changed_by").references(() => users.id),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gas_prices_lookup").on(t.formatId, t.brandId, t.effectiveFrom)],
);

export const articles = pgTable("articles", {
  id: id(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  purchaseCost: integer("purchase_cost").notNull().default(0),
  trackStock: boolean("track_stock").notNull().default(false),
  stockQty: integer("stock_qty").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const articlePriceHistory = pgTable("article_price_history", {
  id: id(),
  articleId: uuid("article_id")
    .notNull()
    .references(() => articles.id),
  price: integer("price").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Clients ----------
export const customers = pgTable(
  "customers",
  {
    id: id(),
    name: text("name").notNull(),
    /** Nom normalisé (minuscules, sans accents) pour la recherche dès les premières lettres. */
    searchKey: text("search_key").notNull(),
    phone: text("phone"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("customers_search_key").on(t.searchKey)],
);

// ---------- Journal : ventes (ajout seul) ----------
export const sales = pgTable(
  "sales",
  {
    id: id(),
    number: text("number").notNull().unique(),
    customerId: uuid("customer_id").references(() => customers.id),
    customerName: text("customer_name").notNull(),
    paymentMethod: text("payment_method").notNull(),
    total: integer("total").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => sales.id),
    justification: text("justification"),
    /** Instant réel de la vente quand elle a été saisie hors ligne puis synchronisée. */
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Une vente ne peut être inversée qu'une seule fois.
    uniqueIndex("sales_one_reversal").on(t.reversalOf).where(sql`${t.reversalOf} is not null`),
  ],
);

export const saleLines = pgTable("sale_lines", {
  id: id(),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id),
  kind: text("kind").notNull(),
  brandId: uuid("brand_id").references(() => brands.id),
  formatId: uuid("format_id").references(() => formats.id),
  articleId: uuid("article_id").references(() => articles.id),
  returnedBrandId: uuid("returned_brand_id").references(() => brands.id),
  quantity: integer("quantity").notNull(),
  unitPrice: integer("unit_price").notNull(),
  transportContribution: integer("transport_contribution").notNull().default(0),
  deliveryFee: integer("delivery_fee").notNull().default(0),
  /** Écart de valeur d'emballage en FCFA : positif = gain, négatif = perte. */
  packagingGap: integer("packaging_gap").notNull().default(0),
  /** Vrai si l'écart n'a pu être calculé (valeur d'emballage inconnue) : écart enregistré à 0, à régulariser. */
  packagingGapPending: boolean("packaging_gap_pending").notNull().default(false),
  purchaseCost: integer("purchase_cost").notNull().default(0),
  total: integer("total").notNull(),
});

// ---------- Journal : stock gaz (ajout seul) ----------
export const stockMoves = pgTable(
  "stock_moves",
  {
    id: id(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
    formatId: uuid("format_id")
      .notNull()
      .references(() => formats.id),
    state: text("state").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    saleId: uuid("sale_id").references(() => sales.id),
    receptionId: uuid("reception_id"),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => stockMoves.id),
    justification: text("justification"),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("stock_moves_stock").on(t.brandId, t.formatId, t.state)],
);

// ---------- Caisses ----------
export const cashRegisters = pgTable("cash_registers", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  active: boolean("active").notNull().default(true),
});

export const cashEntries = pgTable(
  "cash_entries",
  {
    id: id(),
    number: text("number").notNull().unique(),
    registerId: text("register_id")
      .notNull()
      .references(() => cashRegisters.id),
    direction: text("direction").notNull(),
    type: text("type").notNull(),
    paymentMethod: text("payment_method").notNull(),
    customerName: text("customer_name"),
    label: text("label").notNull(),
    amount: integer("amount").notNull(),
    /** Solde calculé par l'API après chaque mouvement ; jamais saisi à la main. */
    balanceAfter: integer("balance_after").notNull(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id),
    saleId: uuid("sale_id").references(() => sales.id),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => cashEntries.id),
    justification: text("justification"),
    createdAt: createdAt(),
  },
  (t) => [index("cash_entries_register").on(t.registerId, t.createdAt)],
);

/** Clôture quotidienne : comptage physique, écart avec le théorique, justification (ajout seul). */
export const cashClosures = pgTable("cash_closures", {
  id: id(),
  registerId: text("register_id")
    .notNull()
    .references(() => cashRegisters.id),
  businessDate: text("business_date").notNull(),
  theoreticalAmount: integer("theoretical_amount").notNull(),
  countedAmount: integer("counted_amount").notNull(),
  gap: integer("gap").notNull(),
  justification: text("justification"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

// ---------- Approvisionnements ----------
export const suppliers = pgTable("suppliers", {
  id: id(),
  name: text("name").notNull().unique(),
  phone: text("phone"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const supplierBrands = pgTable(
  "supplier_brands",
  {
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id),
  },
  (t) => [primaryKey({ columns: [t.supplierId, t.brandId] })],
);

export const receptions = pgTable("receptions", {
  id: id(),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  /** Pièce justificative obligatoire (référence du fichier envoyé). */
  receiptRef: text("receipt_ref").notNull(),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

export const receptionLines = pgTable("reception_lines", {
  id: id(),
  receptionId: uuid("reception_id")
    .notNull()
    .references(() => receptions.id),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  formatId: uuid("format_id")
    .notNull()
    .references(() => formats.id),
  fullReceived: integer("full_received").notNull(),
  emptyReturned: integer("empty_returned").notNull(),
  unitCost: integer("unit_cost").notNull(),
});

/** Inventaire hebdomadaire et confirmation du soir. */
export const inventoryCounts = pgTable("inventory_counts", {
  id: id(),
  kind: text("kind").notNull(),
  brandId: uuid("brand_id")
    .notNull()
    .references(() => brands.id),
  formatId: uuid("format_id")
    .notNull()
    .references(() => formats.id),
  countedFull: integer("counted_full").notNull(),
  countedEmpty: integer("counted_empty").notNull(),
  theoreticalFull: integer("theoretical_full").notNull(),
  theoreticalEmpty: integer("theoretical_empty").notNull(),
  justification: text("justification"),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  validatedBy: uuid("validated_by").references(() => users.id),
  validatedAt: timestamp("validated_at", { withTimezone: true }),
  /** Refus du PDG : le comptage reste consigné, le stock n'est pas ajusté. */
  rejectedBy: uuid("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: createdAt(),
});

// ---------- Contrôle ----------
export const auditLog = pgTable("audit_log", {
  id: id(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  actorId: uuid("actor_id").references(() => users.id),
  details: jsonb("details").$type<Record<string, unknown>>(),
  createdAt: createdAt(),
});

export const notifications = pgTable("notifications", {
  id: id(),
  recipientRole: text("recipient_role").notNull(),
  message: text("message").notNull(),
  auditId: uuid("audit_id").references(() => auditLog.id),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Réglages (seuils d'alerte, seuil d'écart de clôture, plafond de livraison...). */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Idempotence : une même clé rejouée renvoie la réponse déjà produite. */
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    requestHash: text("request_hash").notNull(),
    status: integer("status").notNull(),
    response: jsonb("response").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

/** Pièces justificatives (photo ou PDF compressés) : stockées en base pour être sauvegardées avec elle. */
export const receiptFiles = pgTable("receipt_files", {
  id: id(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

// ---------- Canal+ ----------
export const canalFormulas = pgTable("canal_formulas", {
  id: id(),
  name: text("name").notNull().unique(),
  price: integer("price").notNull(),
  months: integer("months").notNull().default(1),
  /** Commission par paiement (agent agréé) ; 0 par défaut. */
  commission: integer("commission").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const canalSubscribers = pgTable(
  "canal_subscribers",
  {
    id: id(),
    name: text("name").notNull(),
    searchKey: text("search_key").notNull(),
    phone: text("phone").notNull(),
    decoderNumber: text("decoder_number").notNull().unique(),
    formulaId: uuid("formula_id")
      .notNull()
      .references(() => canalFormulas.id),
    /** Dernier jour couvert par l'abonnement. */
    expiresOn: date("expires_on", { mode: "string" }),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("canal_subscribers_expiry").on(t.expiresOn)],
);

/** Encaissements Canal+ (ajout seul) : une annulation ajoute une ligne inverse. */
export const canalPayments = pgTable(
  "canal_payments",
  {
    id: id(),
    subscriberId: uuid("subscriber_id")
      .notNull()
      .references(() => canalSubscribers.id),
    formulaId: uuid("formula_id")
      .notNull()
      .references(() => canalFormulas.id),
    months: integer("months").notNull(),
    amount: integer("amount").notNull(),
    commission: integer("commission").notNull().default(0),
    paymentMethod: text("payment_method").notNull(),
    registerId: text("register_id")
      .notNull()
      .references(() => cashRegisters.id),
    cashEntryId: uuid("cash_entry_id")
      .notNull()
      .references(() => cashEntries.id),
    previousExpiry: date("previous_expiry", { mode: "string" }),
    newExpiry: date("new_expiry", { mode: "string" }).notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    reversalOf: uuid("reversal_of").references((): AnyPgColumn => canalPayments.id),
    justification: text("justification"),
    createdAt: createdAt(),
  },
  (t) => [
    index("canal_payments_subscriber").on(t.subscriberId, t.createdAt),
    uniqueIndex("canal_payments_one_reversal").on(t.reversalOf).where(sql`${t.reversalOf} is not null`),
  ],
);
