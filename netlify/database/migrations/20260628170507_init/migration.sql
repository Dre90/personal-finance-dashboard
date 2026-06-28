CREATE TABLE "asset_snapshots" (
	"id" serial PRIMARY KEY,
	"asset_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"value" numeric(14,2) NOT NULL,
	CONSTRAINT "asset_snapshots_asset_date_unique" UNIQUE("asset_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_entries" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"category_id" integer NOT NULL,
	"year_month" text NOT NULL,
	"budgeted" numeric(14,2) DEFAULT '0' NOT NULL,
	"actual" numeric(14,2) DEFAULT '0' NOT NULL,
	"note" text,
	CONSTRAINT "budget_entries_cat_month_unique" UNIQUE("category_id","year_month")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"group_name" text DEFAULT 'Annet' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text DEFAULT 'Mitt dashboard' NOT NULL,
	"currency" text DEFAULT 'NOK' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loan_snapshots" (
	"id" serial PRIMARY KEY,
	"loan_id" integer NOT NULL,
	"snapshot_date" date NOT NULL,
	"balance" numeric(14,2) NOT NULL,
	CONSTRAINT "loan_snapshots_loan_date_unique" UNIQUE("loan_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "loans" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"original_principal" numeric(14,2) DEFAULT '0' NOT NULL,
	"current_balance" numeric(14,2) DEFAULT '0' NOT NULL,
	"interest_rate" numeric(6,3) DEFAULT '0' NOT NULL,
	"monthly_payment" numeric(14,2) DEFAULT '0' NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sinking_funds" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"target" numeric(14,2) DEFAULT '0' NOT NULL,
	"current_amount" numeric(14,2) DEFAULT '0' NOT NULL,
	"monthly_contribution" numeric(14,2) DEFAULT '0' NOT NULL,
	"color" text DEFAULT '#10b981' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE INDEX "asset_snapshots_asset_idx" ON "asset_snapshots" ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_dashboard_idx" ON "assets" ("dashboard_id");--> statement-breakpoint
CREATE INDEX "budget_entries_dashboard_month_idx" ON "budget_entries" ("dashboard_id","year_month");--> statement-breakpoint
CREATE INDEX "categories_dashboard_idx" ON "categories" ("dashboard_id");--> statement-breakpoint
CREATE INDEX "loan_snapshots_loan_idx" ON "loan_snapshots" ("loan_id");--> statement-breakpoint
CREATE INDEX "loans_dashboard_idx" ON "loans" ("dashboard_id");--> statement-breakpoint
CREATE INDEX "sinking_funds_dashboard_idx" ON "sinking_funds" ("dashboard_id");--> statement-breakpoint
ALTER TABLE "asset_snapshots" ADD CONSTRAINT "asset_snapshots_asset_id_assets_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_entries" ADD CONSTRAINT "budget_entries_category_id_categories_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "loan_snapshots" ADD CONSTRAINT "loan_snapshots_loan_id_loans_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "loans" ADD CONSTRAINT "loans_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sinking_funds" ADD CONSTRAINT "sinking_funds_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;