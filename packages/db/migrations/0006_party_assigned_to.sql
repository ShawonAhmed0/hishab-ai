ALTER TABLE "parties" ADD COLUMN "assigned_to" uuid;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_assigned_to_profiles_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parties_assigned_idx" ON "parties" USING btree ("company_id","assigned_to");