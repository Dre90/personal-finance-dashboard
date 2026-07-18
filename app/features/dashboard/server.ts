import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import { DEFAULT_CATEGORIES, DEFAULT_SINKING_FUNDS } from "~/lib/defaults";
import { dayAfter, dayBefore, formatISODate, roundMoney, todayISO } from "~/lib/utils";
import { isoDateSchema, safeHandler, uuidSchema } from "~/server/_helpers";

export const createDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ name: z.string().min(1).max(120).optional() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      return db.transaction(async (tx) => {
        const [dash] = await tx
          .insert(schema.dashboards)
          .values({ name: data.name ?? "Mitt dashboard" })
          .returning();
        if (!dash) throw new Error("Klarte ikke opprette dashboard");

        await tx.insert(schema.budgetPaydayRules).values({
          dashboardId: dash.id,
          payday: dash.payday,
          effectiveFrom: "0001-01-01",
        });

        await tx.insert(schema.categories).values(
          DEFAULT_CATEGORIES.map((c) => ({
            dashboardId: dash.id,
            name: c.name,
            kind: c.kind,
            groupName: c.groupName,
            sortOrder: c.sortOrder,
          })),
        );

        await tx.insert(schema.sinkingFunds).values(
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
      });
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
      if (!row) return null;
      const [latestPeriod] = await db
        .select({ id: schema.budgetPeriods.id, endDate: schema.budgetPeriods.endDate })
        .from(schema.budgetPeriods)
        .where(eq(schema.budgetPeriods.dashboardId, data.dashboardId))
        .orderBy(desc(schema.budgetPeriods.endDate))
        .limit(1);
      const [latestActivePeriod] = await db
        .select({ endDate: schema.budgetPeriods.endDate })
        .from(schema.budgetPeriods)
        .where(
          and(
            eq(schema.budgetPeriods.dashboardId, data.dashboardId),
            lte(schema.budgetPeriods.startDate, todayISO()),
          ),
        )
        .orderBy(desc(schema.budgetPeriods.endDate))
        .limit(1);
      return {
        ...row,
        hasBudgetPeriods: Boolean(latestPeriod),
        lastBudgetPeriodEndDate: latestActivePeriod?.endDate ?? null,
      };
    }),
  );

export const updateDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        name: z.string().min(1).max(120).optional(),
        payday: z.number().int().min(1).max(28).optional(),
      })
      .refine((data) => data.name !== undefined || data.payday !== undefined, {
        message: "Ingen innstillinger å oppdatere",
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [dashboard] = await db
        .select()
        .from(schema.dashboards)
        .where(eq(schema.dashboards.id, data.dashboardId))
        .limit(1);
      if (!dashboard) throw new Error("Dashboardet finnes ikke");
      await db.transaction(async (tx) => {
        if (data.payday !== undefined && data.payday !== dashboard.payday) {
          const [period] = await tx
            .select({ id: schema.budgetPeriods.id })
            .from(schema.budgetPeriods)
            .where(eq(schema.budgetPeriods.dashboardId, data.dashboardId))
            .limit(1);
          if (period) {
            throw new Error("Lønningsdagen er låst etter at du har opprettet en budsjettperiode");
          }
          await tx
            .insert(schema.budgetPaydayRules)
            .values({
              dashboardId: data.dashboardId,
              payday: data.payday,
              effectiveFrom: "0001-01-01",
            })
            .onConflictDoUpdate({
              target: [
                schema.budgetPaydayRules.dashboardId,
                schema.budgetPaydayRules.effectiveFrom,
              ],
              set: { payday: data.payday },
            });
        }
        await tx
          .update(schema.dashboards)
          .set({
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.payday === undefined ? {} : { payday: data.payday }),
            updatedAt: new Date(),
          })
          .where(eq(schema.dashboards.id, data.dashboardId));
      });
      return { ok: true as const };
    }),
  );

export const changeBudgetPayday = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        payday: z.number().int().min(1).max(28),
        effectiveFrom: isoDateSchema,
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      if (Number(data.effectiveFrom.slice(8, 10)) !== data.payday) {
        throw new Error("Startdatoen må være den nye lønningsdagen");
      }
      const [dashboard] = await db
        .select()
        .from(schema.dashboards)
        .where(eq(schema.dashboards.id, data.dashboardId))
        .limit(1);
      if (!dashboard) throw new Error("Dashboardet finnes ikke");
      if (dashboard.payday === data.payday) throw new Error("Velg en ny lønningsdag");

      const [previous] = await db
        .select()
        .from(schema.budgetPeriods)
        .where(eq(schema.budgetPeriods.dashboardId, data.dashboardId))
        .orderBy(desc(schema.budgetPeriods.endDate))
        .limit(1);
      if (!previous) throw new Error("Opprett en budsjettperiode før du bytter lønningsdag");

      const transitionStart = dayAfter(previous.endDate);
      if (data.effectiveFrom < transitionStart) {
        throw new Error("Startdatoen må være etter den siste budsjettperioden");
      }
      const [futurePeriod] = await db
        .select({ id: schema.budgetPeriods.id })
        .from(schema.budgetPeriods)
        .where(
          and(
            eq(schema.budgetPeriods.dashboardId, data.dashboardId),
            gte(schema.budgetPeriods.startDate, transitionStart),
          ),
        )
        .limit(1);
      if (futurePeriod)
        throw new Error("Slett fremtidige budsjettperioder før du bytter lønningsdag");

      const transitionEnd = dayBefore(data.effectiveFrom);
      return db.transaction(async (tx) => {
        if (transitionStart <= transitionEnd) {
          const sourceGroups = await tx
            .select()
            .from(schema.budgetPeriodGroups)
            .where(eq(schema.budgetPeriodGroups.periodId, previous.id))
            .orderBy(asc(schema.budgetPeriodGroups.sortOrder), asc(schema.budgetPeriodGroups.name));
          const sourceItems =
            sourceGroups.length === 0
              ? []
              : await tx
                  .select()
                  .from(schema.budgetPeriodItems)
                  .where(
                    inArray(
                      schema.budgetPeriodItems.groupId,
                      sourceGroups.map((group) => group.id),
                    ),
                  );
          const purchases = await tx
            .select()
            .from(schema.budgetPurchases)
            .where(eq(schema.budgetPurchases.periodId, previous.id));
          const purchaseActual = new Map<number, number>();
          for (const purchase of purchases) {
            purchaseActual.set(
              purchase.itemId,
              (purchaseActual.get(purchase.itemId) ?? 0) + Number(purchase.amount),
            );
          }

          const [transition] = await tx
            .insert(schema.budgetPeriods)
            .values({
              dashboardId: data.dashboardId,
              templateId: previous.templateId,
              startDate: transitionStart,
              endDate: transitionEnd,
            })
            .returning();
          if (!transition) throw new Error("Klarte ikke opprette overgangsperiode");

          let transitionIncomeGroupId: number | null = null;
          for (const group of sourceGroups) {
            const [newGroup] = await tx
              .insert(schema.budgetPeriodGroups)
              .values({
                periodId: transition.id,
                name: group.name,
                kind: group.kind,
                isConsumption: group.isConsumption,
                color: group.color,
                sortOrder: group.sortOrder,
              })
              .returning();
            if (!newGroup) continue;
            if (newGroup.kind === "income" && transitionIncomeGroupId === null) {
              transitionIncomeGroupId = newGroup.id;
            }
            const items = sourceItems.filter((item) => item.groupId === group.id);
            if (items.length > 0) {
              await tx.insert(schema.budgetPeriodItems).values(
                items.map((item) => ({
                  groupId: newGroup.id,
                  name: item.name,
                  expected: item.expected,
                  sortOrder: item.sortOrder,
                })),
              );
            }
          }

          const actualBalance = roundMoney(
            sourceItems.reduce((total, item) => {
              const group = sourceGroups.find((entry) => entry.id === item.groupId);
              const actual = group?.isConsumption
                ? (purchaseActual.get(item.id) ?? 0)
                : Number(item.actual);
              return total + (group?.kind === "income" ? actual : -actual);
            }, 0),
          );
          if (actualBalance > 0 && transitionIncomeGroupId !== null) {
            const carryoverAmount = actualBalance.toFixed(2);
            await tx.insert(schema.budgetPeriodItems).values({
              groupId: transitionIncomeGroupId,
              name: `Overført fra ${formatISODate(previous.endDate, { month: "long", year: "numeric" })}`,
              expected: carryoverAmount,
              actual: carryoverAmount,
              sortOrder: -1,
            });
          }
        }

        await tx
          .insert(schema.budgetPaydayRules)
          .values({
            dashboardId: data.dashboardId,
            payday: data.payday,
            effectiveFrom: data.effectiveFrom,
          })
          .onConflictDoUpdate({
            target: [schema.budgetPaydayRules.dashboardId, schema.budgetPaydayRules.effectiveFrom],
            set: { payday: data.payday },
          });
        await tx
          .update(schema.dashboards)
          .set({ payday: data.payday, updatedAt: new Date() })
          .where(eq(schema.dashboards.id, data.dashboardId));
        return { ok: true as const, transitionStart, transitionEnd };
      });
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

      // Loans + latest snapshot per loan. The snapshot is the source of truth,
      // while currentBalance remains a cache for loans without snapshots.
      const loans = await db
        .select()
        .from(schema.loans)
        .where(eq(schema.loans.dashboardId, dashboardId));
      const latestBalanceByLoanId = new Map<number, number>();
      if (loans.length > 0) {
        const snaps = await db
          .select()
          .from(schema.loanSnapshots)
          .where(
            inArray(
              schema.loanSnapshots.loanId,
              loans.map((loan) => loan.id),
            ),
          )
          .orderBy(asc(schema.loanSnapshots.snapshotDate));
        for (const snapshot of snaps) {
          latestBalanceByLoanId.set(snapshot.loanId, Number(snapshot.balance));
        }
      }
      const totalDebt = loans.reduce(
        (sum, loan) => sum + (latestBalanceByLoanId.get(loan.id) ?? Number(loan.currentBalance)),
        0,
      );

      // Sinking funds
      const sinkingFunds = await db
        .select()
        .from(schema.sinkingFunds)
        .where(eq(schema.sinkingFunds.dashboardId, dashboardId));
      const totalSinking = sinkingFunds.reduce((s, f) => s + Number(f.currentAmount), 0);
      const totalSinkingTarget = sinkingFunds.reduce((s, f) => s + Number(f.target), 0);

      // Cash flow from the current and immediately preceding immutable budget periods.
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
      const recentPeriods = await db
        .select()
        .from(schema.budgetPeriods)
        .where(
          and(
            eq(schema.budgetPeriods.dashboardId, dashboardId),
            lte(schema.budgetPeriods.startDate, new Date().toISOString().slice(0, 10)),
          ),
        )
        .orderBy(desc(schema.budgetPeriods.startDate))
        .limit(2);
      const currentPeriod = recentPeriods[0];
      const previousPeriod = recentPeriods[1];
      const periodIds = recentPeriods.map((period) => period.id);
      const groups = periodIds.length
        ? await db
            .select()
            .from(schema.budgetPeriodGroups)
            .where(inArray(schema.budgetPeriodGroups.periodId, periodIds))
        : [];
      const groupIds = groups.map((group) => group.id);
      const items = groupIds.length
        ? await db
            .select()
            .from(schema.budgetPeriodItems)
            .where(inArray(schema.budgetPeriodItems.groupId, groupIds))
        : [];
      const purchases = periodIds.length
        ? await db
            .select()
            .from(schema.budgetPurchases)
            .where(inArray(schema.budgetPurchases.periodId, periodIds))
        : [];
      const purchaseActual = new Map<number, number>();
      for (const purchase of purchases) {
        purchaseActual.set(
          purchase.itemId,
          (purchaseActual.get(purchase.itemId) ?? 0) + Number(purchase.amount),
        );
      }
      const groupsById = new Map(groups.map((group) => [group.id, group]));
      const cashFlow: Record<string, CashBucket> = {};
      for (const period of [currentPeriod, previousPeriod]) {
        if (!period) continue;
        const bucket = empty();
        for (const item of items) {
          const group = groupsById.get(item.groupId);
          if (!group || group.periodId !== period.id) continue;
          const actual = group.isConsumption
            ? (purchaseActual.get(item.id) ?? 0)
            : Number(item.actual);
          if (group.kind === "income") {
            bucket.incomeBudget += Number(item.expected);
            bucket.incomeActual += actual;
          } else {
            bucket.expenseBudget += Number(item.expected);
            bucket.expenseActual += actual;
          }
        }
        cashFlow[period.endDate] = bucket;
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
        currentMonth: currentPeriod?.endDate ?? "",
        previousMonth: previousPeriod?.endDate ?? "",
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

      const [
        categories,
        budgetEntries,
        sinkingFunds,
        assets,
        loans,
        budgetPaydayRules,
        budgetTemplates,
        budgetPeriods,
      ] = await Promise.all([
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
        db
          .select()
          .from(schema.budgetPaydayRules)
          .where(eq(schema.budgetPaydayRules.dashboardId, dashboardId)),
        db
          .select()
          .from(schema.budgetTemplates)
          .where(eq(schema.budgetTemplates.dashboardId, dashboardId)),
        db
          .select()
          .from(schema.budgetPeriods)
          .where(eq(schema.budgetPeriods.dashboardId, dashboardId)),
      ]);

      const [assetSnapshots, loanSnapshots, templateGroups, periodGroups, budgetPurchases] =
        await Promise.all([
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
          budgetTemplates.length === 0
            ? Promise.resolve([] as Array<typeof schema.budgetTemplateGroups.$inferSelect>)
            : db
                .select()
                .from(schema.budgetTemplateGroups)
                .where(
                  inArray(
                    schema.budgetTemplateGroups.templateId,
                    budgetTemplates.map((template) => template.id),
                  ),
                ),
          budgetPeriods.length === 0
            ? Promise.resolve([] as Array<typeof schema.budgetPeriodGroups.$inferSelect>)
            : db
                .select()
                .from(schema.budgetPeriodGroups)
                .where(
                  inArray(
                    schema.budgetPeriodGroups.periodId,
                    budgetPeriods.map((period) => period.id),
                  ),
                ),
          budgetPeriods.length === 0
            ? Promise.resolve([] as Array<typeof schema.budgetPurchases.$inferSelect>)
            : db
                .select()
                .from(schema.budgetPurchases)
                .where(
                  inArray(
                    schema.budgetPurchases.periodId,
                    budgetPeriods.map((period) => period.id),
                  ),
                ),
        ]);

      const [templateItems, periodItems] = await Promise.all([
        templateGroups.length === 0
          ? Promise.resolve([] as Array<typeof schema.budgetTemplateItems.$inferSelect>)
          : db
              .select()
              .from(schema.budgetTemplateItems)
              .where(
                inArray(
                  schema.budgetTemplateItems.groupId,
                  templateGroups.map((group) => group.id),
                ),
              ),
        periodGroups.length === 0
          ? Promise.resolve([] as Array<typeof schema.budgetPeriodItems.$inferSelect>)
          : db
              .select()
              .from(schema.budgetPeriodItems)
              .where(
                inArray(
                  schema.budgetPeriodItems.groupId,
                  periodGroups.map((group) => group.id),
                ),
              ),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        dashboard,
        categories,
        budgetEntries,
        budgetPaydayRules,
        budgetTemplates,
        templateGroups,
        templateItems,
        budgetPeriods,
        periodGroups,
        periodItems,
        budgetPurchases,
        sinkingFunds,
        assets,
        assetSnapshots,
        loans,
        loanSnapshots,
      };
    }),
  );
