CREATE TABLE "sinking_fund_transactions" (
	"id" serial PRIMARY KEY,
	"sinking_fund_id" integer NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"occurred_at" date NOT NULL,
	"amount" numeric(14,2) NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"allocation_group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sinking_fund_txns_fund_idx" ON "sinking_fund_transactions" ("sinking_fund_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sinking_fund_txns_dashboard_idx" ON "sinking_fund_transactions" ("dashboard_id","occurred_at");--> statement-breakpoint
CREATE INDEX "sinking_fund_txns_allocation_idx" ON "sinking_fund_transactions" ("allocation_group_id");--> statement-breakpoint
ALTER TABLE "sinking_fund_transactions" ADD CONSTRAINT "sinking_fund_transactions_sinking_fund_id_sinking_funds_id_fkey" FOREIGN KEY ("sinking_fund_id") REFERENCES "sinking_funds"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sinking_fund_transactions" ADD CONSTRAINT "sinking_fund_transactions_dashboard_id_dashboards_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Backfill: create one opening transaction per existing fund with a non-zero balance,
-- so the transaction log is the source of truth from day one.
INSERT INTO "sinking_fund_transactions" ("sinking_fund_id", "dashboard_id", "occurred_at", "amount", "kind", "note")
SELECT "id", "dashboard_id", CURRENT_DATE, "current_amount", 'opening', 'Startbeholdning ved overgang til transaksjonslogg'
FROM "sinking_funds"
WHERE "current_amount" <> 0;