CREATE TABLE "packaging_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"packaging_gap" integer NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "packaging_settlements_sale_line_id_unique" UNIQUE("sale_line_id")
);
--> statement-breakpoint
ALTER TABLE "packaging_settlements" ADD CONSTRAINT "packaging_settlements_sale_line_id_sale_lines_id_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "packaging_settlements" ADD CONSTRAINT "packaging_settlements_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER packaging_settlements_append_only BEFORE UPDATE OR DELETE ON packaging_settlements FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
