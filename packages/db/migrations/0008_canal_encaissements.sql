CREATE TABLE "canal_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"formula_id" uuid NOT NULL,
	"months" integer NOT NULL,
	"amount" integer NOT NULL,
	"commission" integer DEFAULT 0 NOT NULL,
	"payment_method" text NOT NULL,
	"register_id" text NOT NULL,
	"cash_entry_id" uuid NOT NULL,
	"previous_expiry" date,
	"new_expiry" date NOT NULL,
	"author_id" uuid NOT NULL,
	"reversal_of" uuid,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_subscriber_id_canal_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."canal_subscribers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_formula_id_canal_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."canal_formulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_cash_entry_id_cash_entries_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_payments" ADD CONSTRAINT "canal_payments_reversal_of_canal_payments_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."canal_payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canal_payments_subscriber" ON "canal_payments" USING btree ("subscriber_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "canal_payments_one_reversal" ON "canal_payments" USING btree ("reversal_of") WHERE "canal_payments"."reversal_of" is not null;--> statement-breakpoint
CREATE TRIGGER canal_payments_append_only BEFORE UPDATE OR DELETE ON canal_payments FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
