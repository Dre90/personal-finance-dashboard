import {
  pgTable,
  serial,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  unique,
  index,
  foreignKey,
} from "drizzle-orm/pg-core";

// -- Dashboards -------------------------------------------------------------

export const dashboards = pgTable("dashboards", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().default("Mitt dashboard"),
  currency: text().notNull().default("NOK"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// -- Categories (budget) ----------------------------------------------------

export const categories = pgTable(
  "categories",
  {
    id: serial().primaryKey(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    name: text().notNull(),
    kind: text().notNull(), // 'income' | 'expense'
    groupName: text("group_name").notNull().default("Annet"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean().notNull().default(false),
  },
  (t) => [index("categories_dashboard_idx").on(t.dashboardId)],
);

// -- Budget entries (per category per month) --------------------------------

export const budgetEntries = pgTable(
  "budget_entries",
  {
    id: serial().primaryKey(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    yearMonth: text("year_month").notNull(), // 'YYYY-MM'
    budgeted: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    actual: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    note: text(),
  },
  (t) => [
    unique("budget_entries_cat_month_unique").on(t.categoryId, t.yearMonth),
    index("budget_entries_dashboard_month_idx").on(t.dashboardId, t.yearMonth),
  ],
);

// -- Sinking funds ----------------------------------------------------------

export const sinkingFunds = pgTable(
  "sinking_funds",
  {
    id: serial().primaryKey(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    name: text().notNull(),
    target: numeric({ precision: 14, scale: 2 }).notNull().default("0"),
    currentAmount: numeric("current_amount", { precision: 14, scale: 2 }).notNull().default("0"),
    monthlyContribution: numeric("monthly_contribution", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    color: text().notNull().default("#10b981"),
    sortOrder: integer("sort_order").notNull().default(0),
    notes: text(),
  },
  (t) => [
    index("sinking_funds_dashboard_idx").on(t.dashboardId),
    // Lets sinking_fund_transactions enforce (fund, dashboard) consistency via a
    // composite FK below — otherwise a transaction row could reference a fund
    // belonging to a different dashboard than the one on the transaction.
    unique("sinking_funds_id_dashboard_unique").on(t.id, t.dashboardId),
  ],
);

export const sinkingFundTransactions = pgTable(
  "sinking_fund_transactions",
  {
    id: serial().primaryKey(),
    sinkingFundId: integer("sinking_fund_id")
      .notNull()
      .references(() => sinkingFunds.id, { onDelete: "cascade" }),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    occurredAt: date("occurred_at").notNull(),
    amount: numeric({ precision: 14, scale: 2 }).notNull(),
    kind: text().notNull(), // 'deposit' | 'withdrawal' | 'adjustment' | 'opening'
    note: text(),
    allocationGroupId: uuid("allocation_group_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sinking_fund_txns_fund_idx").on(t.sinkingFundId, t.occurredAt),
    index("sinking_fund_txns_dashboard_idx").on(t.dashboardId, t.occurredAt),
    index("sinking_fund_txns_allocation_idx").on(t.allocationGroupId),
    // Composite FK to sinking_funds(id, dashboard_id) — not just sinking_fund_id
    // alone — so a transaction can't reference a fund that belongs to a
    // different dashboard than the one recorded on the transaction row.
    foreignKey({
      columns: [t.sinkingFundId, t.dashboardId],
      foreignColumns: [sinkingFunds.id, sinkingFunds.dashboardId],
      name: "sinking_fund_txns_fund_dashboard_fk",
    }).onDelete("cascade"),
  ],
);

// -- Assets (ASK, Pensjon, Other) -------------------------------------------

export const assets = pgTable(
  "assets",
  {
    id: serial().primaryKey(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    kind: text().notNull(), // 'ask' | 'pension' | 'cash' | 'other'
    name: text().notNull(),
    notes: text(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("assets_dashboard_idx").on(t.dashboardId)],
);

export const assetSnapshots = pgTable(
  "asset_snapshots",
  {
    id: serial().primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    value: numeric({ precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    unique("asset_snapshots_asset_date_unique").on(t.assetId, t.snapshotDate),
    index("asset_snapshots_asset_idx").on(t.assetId),
  ],
);

// -- Loans ------------------------------------------------------------------

export const loans = pgTable(
  "loans",
  {
    id: serial().primaryKey(),
    dashboardId: uuid("dashboard_id")
      .notNull()
      .references(() => dashboards.id, { onDelete: "cascade" }),
    name: text().notNull(),
    originalPrincipal: numeric("original_principal", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    currentBalance: numeric("current_balance", { precision: 14, scale: 2 }).notNull().default("0"),
    interestRate: numeric("interest_rate", { precision: 6, scale: 3 }).notNull().default("0"),
    monthlyPayment: numeric("monthly_payment", { precision: 14, scale: 2 }).notNull().default("0"),
    notes: text(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("loans_dashboard_idx").on(t.dashboardId)],
);

export const loanSnapshots = pgTable(
  "loan_snapshots",
  {
    id: serial().primaryKey(),
    loanId: integer("loan_id")
      .notNull()
      .references(() => loans.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    balance: numeric({ precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    unique("loan_snapshots_loan_date_unique").on(t.loanId, t.snapshotDate),
    index("loan_snapshots_loan_idx").on(t.loanId),
  ],
);

// Inferred types
export type Dashboard = typeof dashboards.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type BudgetEntry = typeof budgetEntries.$inferSelect;
export type SinkingFund = typeof sinkingFunds.$inferSelect;
export type SinkingFundTransaction = typeof sinkingFundTransactions.$inferSelect;
export type NewSinkingFundTransaction = typeof sinkingFundTransactions.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type AssetSnapshot = typeof assetSnapshots.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type LoanSnapshot = typeof loanSnapshots.$inferSelect;
