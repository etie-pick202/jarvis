CREATE TABLE "article_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"article_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"delta" integer NOT NULL,
	"label" text NOT NULL,
	"receipt_id" uuid,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "category" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "low_threshold" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "article_moves" ADD CONSTRAINT "article_moves_article_id_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."articles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_moves" ADD CONSTRAINT "article_moves_receipt_id_receipt_files_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "article_moves" ADD CONSTRAINT "article_moves_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "article_moves_article" ON "article_moves" USING btree ("article_id","created_at");
--> statement-breakpoint
CREATE TRIGGER article_moves_append_only BEFORE UPDATE OR DELETE ON article_moves FOR EACH ROW EXECUTE FUNCTION jarvis_forbid_change();
