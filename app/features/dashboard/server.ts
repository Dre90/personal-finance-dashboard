import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import { DEFAULT_CATEGORIES, DEFAULT_SINKING_FUNDS } from "~/lib/defaults";
import { safeHandler, uuidSchema } from "~/server/_helpers";
import { assertDashboardExists } from "~/server/_db";

export const createDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ name: z.string().min(1).max(120).optional() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [dash] = await db
        .insert(schema.dashboards)
        .values({ name: data.name ?? "Mitt dashboard" })
        .returning();
      if (!dash) throw new Error("Klarte ikke opprette dashboard");

      await db.insert(schema.categories).values(
        DEFAULT_CATEGORIES.map((c) => ({
          dashboardId: dash.id,
          name: c.name,
          kind: c.kind,
          groupName: c.groupName,
          sortOrder: c.sortOrder,
        })),
      );

      await db.insert(schema.sinkingFunds).values(
        DEFAULT_SINKING_FUNDS.map((f, idx) => ({
          dashboardId: dash.id,
          name: f.name,
          target: String(f.target),
          monthlyContribution: String(f.monthlyContribution),
          color: f.color,
          sortOrder: idx * 10,
        })),
      );

      return { id: dash.id, name: dash.name };
    }),
  );

export const getDashboard = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const [row] = await db
        .select()
        .from(schema.dashboards)
        .where(eq(schema.dashboards.id, data.dashboardId))
        .limit(1);
      return row ?? null;
    }),
  );

export const updateDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, name: z.string().min(1).max(120) }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await assertDashboardExists(data.dashboardId);
      await db
        .update(schema.dashboards)
        .set({ name: data.name, updatedAt: new Date() })
        .where(eq(schema.dashboards.id, data.dashboardId));
      return { ok: true as const };
    }),
  );

export const deleteDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      await db.delete(schema.dashboards).where(eq(schema.dashboards.id, data.dashboardId));
      return { ok: true as const };
    }),
  );

export const getDashboardSummary = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const dashboardId = data.dashboardId;
      const [dash] = await db
        .select()
        .from(schema.dashboards)
        .where(eq(schema.dashboards.id, dashboardId))
        .limit(1);
      if (!dash) return null;

      // Assets + latest snapshot per asset
      const assetRows = await db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.dashboardId, dashboardId));

      const latestValueByAssetId = new Map<number, number>();
      if (assetRows.length > 0) {
        const snaps = await db
          .select()
          .from(schema.assetSnapshots)
          .where(
            inArray(
              schema.assetSnapshots.assetId,
              assetRows.map((a) => a.id),
            ),
          )
          .orderBy(asc(schema.assetSnapshots.snapshotDate));
        // ordered ascending — last write wins = latest
        for (const s of snaps) latestValueByAssetId.set(s.assetId, Number(s.value));
      }
      const assets = assetRows.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        currentValue: latestValueByAssetId.get(a.id) ?? 0,
      }));
      const totalAssets = assets.reduce((sum, a) => sum + a.currentValue, 0);

      // Loans (denormalised currentBalance is kept in sync by upsertLoanSnapshot)
      const loans = await db
        .select()
        .from(schema.loans)
        .where(eq(schema.loans.dashboardId, dashboardId));
      const totalDebt = loans.reduce((s, l) => s + Number(l.currentBalance), 0);

      // Sinking funds
      const sinkingFunds = await db
        .select()
        .from(schema.sinkingFunds)
        .where(eq(schema.sinkingFunds.dashboardId, dashboardId));
      const totalSinking = sinkingFunds.reduce((s, f) => s + Number(f.currentAmount), 0);
      const totalSinkingTarget = sinkingFunds.reduce((s, f) => s + Number(f.target), 0);

      // Cash flow for current and previous month
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const previousMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

      const ymRows = await db
        .select({
          yearMonth: schema.budgetEntries.yearMonth,
          kind: schema.categories.kind,
          budgeted: schema.budgetEntries.budgeted,
          actual: schema.budgetEntries.actual,
        })
        .from(schema.budgetEntries)
        .innerJoin(schema.categories, eq(schema.categories.id, schema.budgetEntries.categoryId))
        .where(
          and(
            eq(schema.budgetEntries.dashboardId, dashboardId),
            inArray(schema.budgetEntries.yearMonth, [currentMonth, previousMonth]),
          ),
        );

      type CashBucket = {
        incomeBudget: number;
        incomeActual: number;
        expenseBudget: number;
        expenseActual: number;
      };
      const empty = (): CashBucket => ({
        incomeBudget: 0,
        incomeActual: 0,
        expenseBudget: 0,
        expenseActual: 0,
      });
      const cashFlow: Record<string, CashBucket> = {
        [currentMonth]: empty(),
        [previousMonth]: empty(),
      };
      for (const r of ymRows) {
        const bucket = cashFlow[r.yearMonth];
        if (!bucket) continue;
        if (r.kind === "income") {
          bucket.incomeBudget += Number(r.budgeted);
          bucket.incomeActual += Number(r.actual);
        } else if (r.kind === "expense") {
          bucket.expenseBudget += Number(r.budgeted);
          bucket.expenseActual += Number(r.actual);
        }
      }

      return {
        dashboard: dash,
        netWorth: totalAssets - totalDebt,
        totalAssets,
        totalDebt,
        totalSinking,
        totalSinkingTarget,
        assets,
        loans,
        sinkingFunds,
        cashFlow,
        currentMonth,
        previousMonth,
      };
    }),
  );

export const exportDashboard = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const dashboardId = data.dashboardId;
      const [dashboard] = await db
        .select()
        .from(schema.dashboards)
        .where(eq(schema.dashboards.id, dashboardId))
        .limit(1);
      if (!dashboard) throw new Error("Dashboardet finnes ikke");

      const [categories, budgetEntries, sinkingFunds, assets, loans] = await Promise.all([
        db.select().from(schema.categories).where(eq(schema.categories.dashboardId, dashboardId)),
        db
          .select()
          .from(schema.budgetEntries)
          .where(eq(schema.budgetEntries.dashboardId, dashboardId)),
        db
          .select()
          .from(schema.sinkingFunds)
          .where(eq(schema.sinkingFunds.dashboardId, dashboardId)),
        db.select().from(schema.assets).where(eq(schema.assets.dashboardId, dashboardId)),
        db.select().from(schema.loans).where(eq(schema.loans.dashboardId, dashboardId)),
      ]);

      const [assetSnapshots, loanSnapshots] = await Promise.all([
        assets.length === 0
          ? Promise.resolve([] as Array<typeof schema.assetSnapshots.$inferSelect>)
          : db
              .select()
              .from(schema.assetSnapshots)
              .where(
                inArray(
                  schema.assetSnapshots.assetId,
                  assets.map((a) => a.id),
                ),
              ),
        loans.length === 0
          ? Promise.resolve([] as Array<typeof schema.loanSnapshots.$inferSelect>)
          : db
              .select()
              .from(schema.loanSnapshots)
              .where(
                inArray(
                  schema.loanSnapshots.loanId,
                  loans.map((l) => l.id),
                ),
              ),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        dashboard,
        categories,
        budgetEntries,
        sinkingFunds,
        assets,
        assetSnapshots,
        loans,
        loanSnapshots,
      };
    }),
  );
