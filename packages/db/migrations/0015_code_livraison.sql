ALTER TABLE "orders" ADD COLUMN "delivery_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "started_at" timestamp with time zone;