CREATE TABLE "budget_payday_rules" (
	"id" serial PRIMARY KEY,
	"dashboard_id" uuid NOT NULL,
	"payday" integer NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_payday_rules_dashboard_effective_unique" UNIQUE("dashboard_id","effective_from")
);
--> statement-breakpoint
INSERT INTO "budget_payday_rules" ("dashboard_id", "payday", "effective_from")
SELECT "id", "payday", '0001-01-01'
FROM "dashboards";
--> statement-breakpoint
CREATE INDEX "budget_payday_rules_dashboard_effective_idx" ON "budget_payday_rules" ("dashboard_id","effective_from");--> statement-breakpoint
ALTER TABLE "budget_payday_rules" ADD CONSTRAINT "budget_payday_rules_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;