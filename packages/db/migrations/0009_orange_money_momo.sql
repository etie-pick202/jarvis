CREATE TABLE "money_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"commission" integer DEFAULT 0 NOT NULL,
	"phone" text NOT NULL,
	"customer_name" text,
	"reference" text NOT NULL,
	"cash_entry_id" uuid NOT NULL,
	"float_entry_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"reversal_of" uuid,
	"justification" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_cash_entry_id_cash_entries_id_fk" FOREIGN KEY ("cash_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_float_entry_id_cash_entries_id_fk" FOREIGN KEY ("float_entry_id") REFERENCES "public"."cash_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_operations" ADD CONSTRAINT "money_operations_reversal_of_money_operations_id_fk" FOREIGN KEY ("reversal_of") REFERENCES "public"."money_operations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "money_operations_reference" ON "money_operations" USING btree ("operator","reference") WHERE "money_operations"."reversal_of" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "money_operations_one_reversal" ON "money_operations" USING btree ("reversal_of") WHERE "money_operations"."reversal_of" is not null;
--> statement-breakpoint
CREATE TRIGGER money_operations_append_only BEFORE UPDATE OR DELETE ON money_operations FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
