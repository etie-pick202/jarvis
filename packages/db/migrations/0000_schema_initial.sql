CREATE TABLE "article_price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"changed_by" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"purchase_cost" integer DEFAULT 0 NOT NULL,
	"track_stock" boolean DEFAULT false NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"actor_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"packaging_value" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brands_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "cash_closures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"register_id" text NOT NULL,
	"business_date" text NOT NULL,
	"theoretical_amount" integer NOT NULL,
	"counted_amount" integer NOT NULL,
	"gap" integer NOT NULL,
	"justification" text,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"register_id" text NOT NULL,
	"direction" text NOT NULL,
	"type" text NOT NULL,
	"payment_method" text NOT NULL,
	"customer_name" text,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"operator_id" uuid NOT NULL,
	"sale_id" uuid,
	"reversal_of" uuid,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_entries_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "cash_registers" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"search_key" text NOT NULL,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "formats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"weight_grams" integer NOT NULL,
	"price_ceiling" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "formats_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "gas_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"format_id" uuid NOT NULL,
	"brand_id" uuid,
	"amount" integer NOT NULL,
	"transport_contribution" integer DEFAULT 0 NOT NULL,
	"purchase_cost" integer DEFAULT 0 NOT NULL,
	"changed_by" uuid,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE "inventory_counts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"brand_id" uuid NOT NULL,
	"format_id" uuid NOT NULL,
	"counted_full" integer NOT NULL,
	"counted_empty" integer NOT NULL,
	"theoretical_full" integer NOT NULL,
	"theoretical_empty" integer NOT NULL,
	"justification" text,
	"author_id" uuid NOT NULL,
	"validated_by" uuid,
	"validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_role" text NOT NULL,
	"message" text NOT NULL,
	"audit_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reception_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reception_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"format_id" uuid NOT NULL,
	"full_received" integer NOT NULL,
	"empty_returned" integer NOT NULL,
	"unit_cost" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"receipt_ref" text NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"brand_id" uuid,
	"format_id" uuid,
	"article_id" uuid,
	"returned_brand_id" uuid,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"transport_contribution" integer DEFAULT 0 NOT NULL,
	"delivery_fee" integer DEFAULT 0 NOT NULL,
	"packaging_gap" integer DEFAULT 0 NOT NULL,
	"purchase_cost" integer DEFAULT 0 NOT NULL,
	"total" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid,
	"customer_name" text NOT NULL,
	"payment_method" text NOT NULL,
	"total" integer NOT NULL,
	"author_id" uuid NOT NULL,
	"reversal_of" uuid,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sales_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"active_role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"format_id" uuid NOT NULL,
	"state" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"sale_id" uuid,
	"reception_id" uuid,
	"reversal_of" uuid,
	"justification" text,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_brands" (
	"supplier_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	CONSTRAINT "supplier_brands_supplier_id_brand_id_pk" PRIMARY KEY("supplier_id","brand_id")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "article_price_history" ADD CONSTRAINT "article_price_history_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_price_history" ADD CONSTRAINT "article_price_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_closures" ADD CONSTRAINT "cash_closures_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_operator_id_users_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_entries" ADD CONSTRAINT "cash_entries_reversal_of_cash_entries_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."cash_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_prices" ADD CONSTRAINT "gas_prices_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_prices" ADD CONSTRAINT "gas_prices_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gas_prices" ADD CONSTRAINT "gas_prices_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_validated_by_users_id_fk" FOREIGN KEY ("validated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audit_id_audit_log_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_reception_id_receptions_id_fk" FOREIGN KEY ("reception_id") REFERENCES "public"."receptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reception_lines" ADD CONSTRAINT "reception_lines_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receptions" ADD CONSTRAINT "receptions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_returned_brand_id_brands_id_fk" FOREIGN KEY ("returned_brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_reversal_of_sales_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_reversal_of_stock_moves_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."stock_moves"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_brands" ADD CONSTRAINT "supplier_brands_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_brands" ADD CONSTRAINT "supplier_brands_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_entries_register" ON "cash_entries" USING btree ("register_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_search_key" ON "customers" USING btree ("search_key");--> statement-breakpoint
CREATE INDEX "gas_prices_lookup" ON "gas_prices" USING btree ("format_id","brand_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_one_reversal" ON "sales" USING btree ("reversal_of") WHERE "sales"."reversal_of" is not null;--> statement-breakpoint
CREATE INDEX "stock_moves_stock" ON "stock_moves" USING btree ("brand_id","format_id","state");