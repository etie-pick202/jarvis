ALTER TABLE "inventory_counts" ADD COLUMN "rejected_by" uuid;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;