ALTER TYPE "public"."audit_action" ADD VALUE 'override';--> statement-breakpoint
CREATE TABLE "override_credentials" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"pin_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "override_credentials_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "override_credentials" ADD CONSTRAINT "override_credentials_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "override_credentials" ADD CONSTRAINT "override_credentials_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;