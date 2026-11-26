CREATE TABLE "canal_formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"price" integer NOT NULL,
	"months" integer DEFAULT 1 NOT NULL,
	"commission" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canal_formulas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "canal_subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"search_key" text NOT NULL,
	"phone" text NOT NULL,
	"decoder_number" text NOT NULL,
	"formula_id" uuid NOT NULL,
	"expires_on" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canal_subscribers_decoder_number_unique" UNIQUE("decoder_number")
);
--> statement-breakpoint
ALTER TABLE "canal_subscribers" ADD CONSTRAINT "canal_subscribers_formula_id_canal_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."canal_formulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "canal_subscribers_expiry" ON "canal_subscribers" USING btree ("expires_on");