CREATE TYPE "public"."delivery_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "message_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" "delivery_channel" DEFAULT 'whatsapp' NOT NULL,
	"template" varchar(60) NOT NULL,
	"locale" varchar(5) DEFAULT 'bn' NOT NULL,
	"recipient" varchar(20) NOT NULL,
	"params" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preview" text,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" varchar(120),
	"entity_type" varchar(60),
	"entity_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "message_deliveries" ADD CONSTRAINT "message_deliveries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_deliveries_pending_idx" ON "message_deliveries" USING btree ("company_id","status","created_at");--> statement-breakpoint
CREATE INDEX "message_deliveries_entity_idx" ON "message_deliveries" USING btree ("company_id","entity_type","entity_id");