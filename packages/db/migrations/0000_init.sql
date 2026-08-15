CREATE TYPE "public"."account_subtype" AS ENUM('cash', 'bank', 'mfs', 'receivable', 'payable', 'inventory', 'fixed_asset', 'accumulated_depreciation', 'sales', 'sales_return', 'other_income', 'cogs', 'wastage', 'operating_expense', 'stock_adjustment', 'capital', 'drawings', 'opening_balance_equity');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'cancel', 'delete', 'login', 'export');--> statement-breakpoint
CREATE TYPE "public"."financial_account_kind" AS ENUM('cash', 'bank', 'mfs');--> statement-breakpoint
CREATE TYPE "public"."mfs_provider" AS ENUM('bkash', 'nagad', 'rocket', 'upay', 'other');--> statement-breakpoint
CREATE TYPE "public"."notification_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."party_type" AS ENUM('customer', 'vendor', 'both');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('raw_material', 'finished_good', 'service');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'manager', 'operator');--> statement-breakpoint
CREATE TYPE "public"."stock_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('opening', 'purchase', 'sale', 'production_input', 'production_output', 'wastage', 'adjustment', 'sale_return', 'purchase_return', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'voice', 'scan', 'import');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('posted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense', 'sale', 'purchase', 'customer_payment', 'vendor_payment', 'production', 'stock_adjustment', 'sale_return', 'purchase_return', 'other');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"name_bn" varchar(160),
	"business_type" varchar(80),
	"phone" varchar(30),
	"address" text,
	"logo_url" text,
	"currency" varchar(3) DEFAULT 'BDT' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 7 NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_members" (
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "role" DEFAULT 'operator' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"invited_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_members_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"company_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "counters_company_id_key_pk" PRIMARY KEY("company_id","key")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" varchar(160) NOT NULL,
	"phone" varchar(30),
	"avatar_url" text,
	"last_company_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_balances" (
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit_total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" varchar(20) NOT NULL,
	"name_bn" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"type" "account_type" NOT NULL,
	"subtype" "account_subtype" NOT NULL,
	"parent_id" uuid,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_category" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"kind" "financial_account_kind" NOT NULL,
	"name_bn" varchar(120) NOT NULL,
	"bank_name" varchar(120),
	"account_number" varchar(60),
	"mfs_provider" "mfs_provider",
	"opening_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "party_type" DEFAULT 'customer' NOT NULL,
	"name" varchar(160) NOT NULL,
	"phone" varchar(30),
	"address" text,
	"notes" text,
	"opening_balance" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit_limit" numeric(18, 4),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "party_balances" (
	"company_id" uuid NOT NULL,
	"party_id" uuid NOT NULL,
	"receivable" numeric(18, 4) DEFAULT '0' NOT NULL,
	"payable" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_sales" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_purchases" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_received" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total_paid" numeric(18, 4) DEFAULT '0' NOT NULL,
	"last_transaction_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name_bn" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_stock" (
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(24, 6) DEFAULT '0' NOT NULL,
	"value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"avg_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_recipe_inputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_per_unit" numeric(24, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"output_product_id" uuid NOT NULL,
	"name_bn" varchar(160),
	"expected_yield_percent" numeric(18, 4),
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"sku" varchar(60),
	"name_bn" varchar(160) NOT NULL,
	"name_en" varchar(160),
	"kind" "product_kind" DEFAULT 'finished_good' NOT NULL,
	"category_id" uuid,
	"unit_id" uuid NOT NULL,
	"purchase_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"sale_price" numeric(18, 4) DEFAULT '0' NOT NULL,
	"min_stock_level" numeric(24, 6) DEFAULT '0' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"transaction_id" uuid,
	"direction" varchar(3) NOT NULL,
	"movement_type" varchar(32) NOT NULL,
	"quantity" numeric(24, 6) NOT NULL,
	"rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"value" numeric(18, 4) DEFAULT '0' NOT NULL,
	"quantity_after" numeric(24, 6) NOT NULL,
	"avg_cost_after" numeric(18, 4) DEFAULT '0' NOT NULL,
	"stock_value_after" numeric(18, 4) DEFAULT '0' NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name_bn" varchar(60) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"decimal_places" integer DEFAULT 3 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transaction_id" uuid,
	"storage_path" text NOT NULL,
	"file_name" varchar(260),
	"mime_type" varchar(120),
	"size_bytes" bigint,
	"ocr_text" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"date" date NOT NULL,
	"narration" text,
	"sequence" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"journal_entry_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"party_id" uuid,
	"debit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 4) DEFAULT '0' NOT NULL,
	"narration" text,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"product_id" uuid,
	"unit_id" uuid,
	"description" text,
	"quantity" numeric(24, 6) DEFAULT '0' NOT NULL,
	"pieces" numeric(24, 6),
	"rate" numeric(18, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"allocated_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"role" varchar(20) DEFAULT 'item' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"financial_account_id" uuid NOT NULL,
	"amount" numeric(18, 4) NOT NULL,
	"direction" varchar(3) NOT NULL,
	"handled_by_user_id" uuid,
	"handled_by_name" varchar(120),
	"reference" varchar(120),
	"paid_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"voucher_no" varchar(40) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"status" "transaction_status" DEFAULT 'posted' NOT NULL,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"date" date NOT NULL,
	"party_id" uuid,
	"category_account_id" uuid,
	"memo_no" varchar(60),
	"description" text,
	"subtotal" numeric(18, 4) DEFAULT '0' NOT NULL,
	"transport_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"labor_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"other_cost" numeric(18, 4) DEFAULT '0' NOT NULL,
	"discount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"total" numeric(18, 4) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"due_amount" numeric(18, 4) DEFAULT '0' NOT NULL,
	"previous_due" numeric(18, 4) DEFAULT '0' NOT NULL,
	"reversal_of_id" uuid,
	"reversed_by_id" uuid,
	"ai_metadata" jsonb,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"action" "audit_action" NOT NULL,
	"entity_type" varchar(60) NOT NULL,
	"entity_id" uuid,
	"summary_bn" text,
	"before" jsonb,
	"after" jsonb,
	"ip_address" varchar(60),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid,
	"type" varchar(60) NOT NULL,
	"severity" "notification_severity" DEFAULT 'info' NOT NULL,
	"title_bn" varchar(200) NOT NULL,
	"body_bn" text,
	"entity_type" varchar(60),
	"entity_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_balances" ADD CONSTRAINT "party_balances_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "party_balances" ADD CONSTRAINT "party_balances_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_stock" ADD CONSTRAINT "product_stock_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recipe_inputs" ADD CONSTRAINT "production_recipe_inputs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recipe_inputs" ADD CONSTRAINT "production_recipe_inputs_recipe_id_production_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."production_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recipe_inputs" ADD CONSTRAINT "production_recipe_inputs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_output_product_id_products_id_fk" FOREIGN KEY ("output_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_product_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."product_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_lines" ADD CONSTRAINT "transaction_lines_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_financial_account_id_financial_accounts_id_fk" FOREIGN KEY ("financial_account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_handled_by_user_id_profiles_id_fk" FOREIGN KEY ("handled_by_user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_account_id_accounts_id_fk" FOREIGN KEY ("category_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_updated_by_profiles_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cancelled_by_profiles_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_active_idx" ON "companies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "company_members_user_idx" ON "company_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_balances_pk" ON "account_balances" USING btree ("company_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_company_code_idx" ON "accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "accounts_company_subtype_idx" ON "accounts" USING btree ("company_id","subtype");--> statement-breakpoint
CREATE INDEX "accounts_category_idx" ON "accounts" USING btree ("company_id","is_category");--> statement-breakpoint
CREATE INDEX "financial_accounts_company_idx" ON "financial_accounts" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "parties_company_type_idx" ON "parties" USING btree ("company_id","type","is_active");--> statement-breakpoint
CREATE INDEX "parties_company_name_idx" ON "parties" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "parties_phone_idx" ON "parties" USING btree ("company_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "party_balances_pk" ON "party_balances" USING btree ("company_id","party_id");--> statement-breakpoint
CREATE INDEX "party_balances_receivable_idx" ON "party_balances" USING btree ("company_id","receivable");--> statement-breakpoint
CREATE INDEX "product_categories_company_idx" ON "product_categories" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_stock_pk" ON "product_stock" USING btree ("company_id","product_id");--> statement-breakpoint
CREATE INDEX "product_stock_quantity_idx" ON "product_stock" USING btree ("company_id","quantity");--> statement-breakpoint
CREATE INDEX "production_recipe_inputs_recipe_idx" ON "production_recipe_inputs" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "production_recipes_company_idx" ON "production_recipes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "products_company_kind_idx" ON "products" USING btree ("company_id","kind","is_active");--> statement-breakpoint
CREATE INDEX "products_company_name_idx" ON "products" USING btree ("company_id","name_bn");--> statement-breakpoint
CREATE UNIQUE INDEX "products_company_sku_idx" ON "products" USING btree ("company_id","sku");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("company_id","product_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_transaction_idx" ON "stock_movements" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_company_symbol_idx" ON "units" USING btree ("company_id","symbol");--> statement-breakpoint
CREATE INDEX "attachments_transaction_idx" ON "attachments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "attachments_company_idx" ON "attachments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "journal_entries_company_date_idx" ON "journal_entries" USING btree ("company_id","date");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("journal_entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_account_idx" ON "journal_lines" USING btree ("company_id","account_id","date");--> statement-breakpoint
CREATE INDEX "journal_lines_party_idx" ON "journal_lines" USING btree ("company_id","party_id","date");--> statement-breakpoint
CREATE INDEX "transaction_lines_transaction_idx" ON "transaction_lines" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_lines_product_idx" ON "transaction_lines" USING btree ("company_id","product_id");--> statement-breakpoint
CREATE INDEX "transaction_payments_transaction_idx" ON "transaction_payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_payments_account_idx" ON "transaction_payments" USING btree ("company_id","financial_account_id","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_company_voucher_idx" ON "transactions" USING btree ("company_id","voucher_no");--> statement-breakpoint
CREATE INDEX "transactions_company_date_idx" ON "transactions" USING btree ("company_id","date","status");--> statement-breakpoint
CREATE INDEX "transactions_company_type_idx" ON "transactions" USING btree ("company_id","type","date");--> statement-breakpoint
CREATE INDEX "transactions_party_idx" ON "transactions" USING btree ("company_id","party_id","date");--> statement-breakpoint
CREATE INDEX "transactions_memo_idx" ON "transactions" USING btree ("company_id","memo_no");--> statement-breakpoint
CREATE INDEX "audit_logs_company_idx" ON "audit_logs" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("company_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "notifications_company_idx" ON "notifications" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("company_id","user_id","read_at");