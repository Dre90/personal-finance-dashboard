CREATE TABLE "budget_period_groups" (
	"id" serial PRIMARY KEY,
	"period_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_consumption" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_period_items" (
	"id" serial PRIMARY KEY,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"expected" numeric(14,2) DEFAULT '0' NOT NULL,
	"actual" numeric(14,2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_periods" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"template_id" integer,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_periods_dashboard_start_unique" UNIQUE("dashboard_id","start_date")
);
--> statement-breakpoint
CREATE TABLE "budget_purchases" (
	"id" serial PRIMARY KEY,
	"period_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"occurred_at" date NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_template_groups" (
	"id" serial PRIMARY KEY,
	"template_id" integer NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"is_consumption" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_template_items" (
	"id" serial PRIMARY KEY,
	"group_id" integer NOT NULL,
	"name" text NOT NULL,
	"expected" numeric(14,2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_templates" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboards" ADD COLUMN "payday" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
CREATE INDEX "budget_period_groups_period_idx" ON "budget_period_groups" ("period_id");--> statement-breakpoint
CREATE INDEX "budget_period_items_group_idx" ON "budget_period_items" ("group_id");--> statement-breakpoint
CREATE INDEX "budget_periods_dashboard_start_idx" ON "budget_periods" ("dashboard_id","start_date");--> statement-breakpoint
CREATE INDEX "budget_purchases_period_date_idx" ON "budget_purchases" ("period_id","occurred_at");--> statement-breakpoint
CREATE INDEX "budget_purchases_item_idx" ON "budget_purchases" ("item_id");--> statement-breakpoint
CREATE INDEX "budget_template_groups_template_idx" ON "budget_template_groups" ("template_id");--> statement-breakpoint
CREATE INDEX "budget_template_items_group_idx" ON "budget_template_items" ("group_id");--> statement-breakpoint
CREATE INDEX "budget_templates_dashboard_idx" ON "budget_templates" ("dashboard_id");--> statement-breakpoint
ALTER TABLE "budget_period_groups" ADD CONSTRAINT "budget_period_groups_period_id_budget_periods_id_fkey" FOREIGN KEY ("period_id") REFERENCES "budget_periods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_period_items" ADD CONSTRAINT "budget_period_items_group_id_budget_period_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "budget_period_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_periods" ADD CONSTRAINT "budget_periods_template_id_budget_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "budget_templates"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "budget_purchases" ADD CONSTRAINT "budget_purchases_period_id_budget_periods_id_fkey" FOREIGN KEY ("period_id") REFERENCES "budget_periods"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_purchases" ADD CONSTRAINT "budget_purchases_item_id_budget_period_items_id_fkey" FOREIGN KEY ("item_id") REFERENCES "budget_period_items"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_template_groups" ADD CONSTRAINT "budget_template_groups_template_id_budget_templates_id_fkey" FOREIGN KEY ("template_id") REFERENCES "budget_templates"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_template_items" ADD CONSTRAINT "budget_template_items_group_id_budget_template_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "budget_template_groups"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "budget_templates" ADD CONSTRAINT "budget_templates_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;