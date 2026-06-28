import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { DEFAULT_CATEGORIES, DEFAULT_SINKING_FUNDS } from "../lib/defaults";

const uuidSchema = z.string().uuid();

function toAppError(err: unknown): Error {
  if (err instanceof Error) {
    const e = new Error(err.message || "Server error");
    (e as any).code = (err as any).code;
    return e;
  }
  return new Error(typeof err === "string" ? err : "Server error");
}

async function assertDashboardExists(dashboardId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.dashboards.id })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.id, dashboardId))
    .limit(1);
  if (!row) throw new Error("Ugyldig dashboard-ID");
}

// -- Dashboard --------------------------------------------------------------

export const createDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ name: z.string().min(1).max(120).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const [dash] = await db
        .insert(schema.dashboards)
        .values({ name: data.name ?? "Mitt dashboard" })
        .returning();
      if (!dash) throw new Error("Klarte ikke opprette dashboard");

      // Seed default categories
      await db.insert(schema.categories).values(
        DEFAULT_CATEGORIES.map((c) => ({
          dashboardId: dash.id,
          name: c.name,
          kind: c.kind,
          groupName: c.groupName,
          sortOrder: c.sortOrder,
        })),
      );

      // Seed default sinking funds
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
    } catch (err) {
      console.error("createDashboard failed:", err);
      throw toAppError(err);
    }
  });

export const getDashboard = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    const [row] = await db
      .select()
      .from(schema.dashboards)
      .where(eq(schema.dashboards.id, data.dashboardId))
      .limit(1);
    if (!row) return null;
    return row;
  });

export const updateDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, name: z.string().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data }) => {
    await assertDashboardExists(data.dashboardId);
    await db
      .update(schema.dashboards)
      .set({ name: data.name, updatedAt: new Date() })
      .where(eq(schema.dashboards.id, data.dashboardId));
    return { ok: true };
  });

export const deleteDashboard = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    await db.delete(schema.dashboards).where(eq(schema.dashboards.id, data.dashboardId));
    return { ok: true };
  });

// -- Categories -------------------------------------------------------------

export const listCategories = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const rows = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.dashboardId, data.dashboardId))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
    return data.includeArchived ? rows : rows.filter((c) => !c.archived);
  });

export const createCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        name: z.string().min(1).max(120),
        kind: z.enum(["income", "expense"]),
        groupName: z.string().min(1).max(60).default("Annet"),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertDashboardExists(data.dashboardId);
    const [row] = await db
      .insert(schema.categories)
      .values({
        dashboardId: data.dashboardId,
        name: data.name,
        kind: data.kind,
        groupName: data.groupName,
      })
      .returning();
    return row!;
  });

export const updateCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        kind: z.enum(["income", "expense"]).optional(),
        groupName: z.string().min(1).max(60).optional(),
        archived: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { dashboardId, id, ...rest } = data;
    await db
      .update(schema.categories)
      .set(rest)
      .where(and(eq(schema.categories.id, id), eq(schema.categories.dashboardId, dashboardId)));
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(schema.categories)
      .where(
        and(
          eq(schema.categories.id, data.id),
          eq(schema.categories.dashboardId, data.dashboardId),
        ),
      );
    return { ok: true };
  });

// -- Budget entries ---------------------------------------------------------

export const getBudgetMonth = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const categories = await db
      .select()
      .from(schema.categories)
      .where(
        and(
          eq(schema.categories.dashboardId, data.dashboardId),
          eq(schema.categories.archived, false),
        ),
      )
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));

    const entries = await db
      .select()
      .from(schema.budgetEntries)
      .where(
        and(
          eq(schema.budgetEntries.dashboardId, data.dashboardId),
          eq(schema.budgetEntries.yearMonth, data.yearMonth),
        ),
      );

    const entryMap = new Map(entries.map((e) => [e.categoryId, e]));
    return { categories, entries, entryMap: Object.fromEntries(entryMap) };
  });

export const upsertBudgetEntry = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        categoryId: z.number().int(),
        yearMonth: z.string().regex(/^\d{4}-\d{2}$/),
        budgeted: z.union([z.string(), z.number()]).optional(),
        actual: z.union([z.string(), z.number()]).optional(),
        note: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const values: Record<string, unknown> = {
      dashboardId: data.dashboardId,
      categoryId: data.categoryId,
      yearMonth: data.yearMonth,
    };
    if (data.budgeted !== undefined) values.budgeted = String(data.budgeted);
    if (data.actual !== undefined) values.actual = String(data.actual);
    if (data.note !== undefined) values.note = data.note;

    const setOnConflict: Record<string, unknown> = {};
    if (data.budgeted !== undefined) setOnConflict.budgeted = String(data.budgeted);
    if (data.actual !== undefined) setOnConflict.actual = String(data.actual);
    if (data.note !== undefined) setOnConflict.note = data.note;

    if (Object.keys(setOnConflict).length === 0) {
      return { ok: true };
    }

    await db
      .insert(schema.budgetEntries)
      .values(values as typeof schema.budgetEntries.$inferInsert)
      .onConflictDoUpdate({
        target: [schema.budgetEntries.categoryId, schema.budgetEntries.yearMonth],
        set: setOnConflict,
      });
    return { ok: true };
  });

export const getBudgetYear = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, year: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    const prefix = `${data.year}-`;
    const categories = await db
      .select()
      .from(schema.categories)
      .where(eq(schema.categories.dashboardId, data.dashboardId))
      .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));

    const entries = await db
      .select()
      .from(schema.budgetEntries)
      .where(
        and(
          eq(schema.budgetEntries.dashboardId, data.dashboardId),
          sql`${schema.budgetEntries.yearMonth} like ${prefix + "%"}`,
        ),
      );
    return { categories, entries };
  });

// -- Sinking funds ----------------------------------------------------------

export const listSinkingFunds = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    return db
      .select()
      .from(schema.sinkingFunds)
      .where(eq(schema.sinkingFunds.dashboardId, data.dashboardId))
      .orderBy(asc(schema.sinkingFunds.sortOrder), asc(schema.sinkingFunds.name));
  });

export const createSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        name: z.string().min(1).max(120),
        target: z.union([z.string(), z.number()]).optional(),
        currentAmount: z.union([z.string(), z.number()]).optional(),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        color: z.string().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertDashboardExists(data.dashboardId);
    const [row] = await db
      .insert(schema.sinkingFunds)
      .values({
        dashboardId: data.dashboardId,
        name: data.name,
        target: data.target !== undefined ? String(data.target) : "0",
        currentAmount: data.currentAmount !== undefined ? String(data.currentAmount) : "0",
        monthlyContribution:
          data.monthlyContribution !== undefined ? String(data.monthlyContribution) : "0",
        color: data.color ?? "#10b981",
        notes: data.notes ?? null,
      })
      .returning();
    return row!;
  });

export const updateSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        target: z.union([z.string(), z.number()]).optional(),
        currentAmount: z.union([z.string(), z.number()]).optional(),
        monthlyContribution: z.union([z.string(), z.number()]).optional(),
        color: z.string().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { dashboardId, id, ...rest } = data;
    const setVals: Record<string, unknown> = {};
    if (rest.name !== undefined) setVals.name = rest.name;
    if (rest.target !== undefined) setVals.target = String(rest.target);
    if (rest.currentAmount !== undefined) setVals.currentAmount = String(rest.currentAmount);
    if (rest.monthlyContribution !== undefined)
      setVals.monthlyContribution = String(rest.monthlyContribution);
    if (rest.color !== undefined) setVals.color = rest.color;
    if (rest.notes !== undefined) setVals.notes = rest.notes;

    if (Object.keys(setVals).length === 0) return { ok: true };

    await db
      .update(schema.sinkingFunds)
      .set(setVals)
      .where(
        and(
          eq(schema.sinkingFunds.id, id),
          eq(schema.sinkingFunds.dashboardId, dashboardId),
        ),
      );
    return { ok: true };
  });

export const deleteSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(schema.sinkingFunds)
      .where(
        and(
          eq(schema.sinkingFunds.id, data.id),
          eq(schema.sinkingFunds.dashboardId, data.dashboardId),
        ),
      );
    return { ok: true };
  });

// -- Assets -----------------------------------------------------------------

export const listAssets = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    const assets = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.dashboardId, data.dashboardId))
      .orderBy(asc(schema.assets.sortOrder), asc(schema.assets.name));

    if (assets.length === 0) return { assets, snapshotsByAsset: {} as Record<number, Array<typeof schema.assetSnapshots.$inferSelect>> };

    const assetIds = assets.map((a) => a.id);
    const snaps = await db
      .select()
      .from(schema.assetSnapshots)
      .where(inArray(schema.assetSnapshots.assetId, assetIds))
      .orderBy(asc(schema.assetSnapshots.snapshotDate));

    const snapshotsByAsset: Record<number, typeof snaps> = {};
    for (const s of snaps) {
      const list = snapshotsByAsset[s.assetId] ?? [];
      list.push(s);
      snapshotsByAsset[s.assetId] = list;
    }
    return { assets, snapshotsByAsset };
  });

export const createAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        kind: z.enum(["ask", "pension", "cash", "other"]),
        name: z.string().min(1).max(120),
        initialValue: z.union([z.string(), z.number()]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertDashboardExists(data.dashboardId);
    const [asset] = await db
      .insert(schema.assets)
      .values({
        dashboardId: data.dashboardId,
        kind: data.kind,
        name: data.name,
        notes: data.notes ?? null,
      })
      .returning();
    if (asset && data.initialValue !== undefined) {
      await db.insert(schema.assetSnapshots).values({
        assetId: asset.id,
        snapshotDate: new Date().toISOString().slice(0, 10),
        value: String(data.initialValue),
      });
    }
    return asset!;
  });

export const updateAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        kind: z.enum(["ask", "pension", "cash", "other"]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { dashboardId, id, ...rest } = data;
    if (Object.keys(rest).length === 0) return { ok: true };
    await db
      .update(schema.assets)
      .set(rest)
      .where(and(eq(schema.assets.id, id), eq(schema.assets.dashboardId, dashboardId)));
    return { ok: true };
  });

export const deleteAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(schema.assets)
      .where(
        and(
          eq(schema.assets.id, data.id),
          eq(schema.assets.dashboardId, data.dashboardId),
        ),
      );
    return { ok: true };
  });

export const upsertAssetSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        assetId: z.number().int(),
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        value: z.union([z.string(), z.number()]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // Verify ownership
    const [own] = await db
      .select({ id: schema.assets.id })
      .from(schema.assets)
      .where(
        and(eq(schema.assets.id, data.assetId), eq(schema.assets.dashboardId, data.dashboardId)),
      )
      .limit(1);
    if (!own) throw new Error("Ugyldig asset");
    await db
      .insert(schema.assetSnapshots)
      .values({
        assetId: data.assetId,
        snapshotDate: data.snapshotDate,
        value: String(data.value),
      })
      .onConflictDoUpdate({
        target: [schema.assetSnapshots.assetId, schema.assetSnapshots.snapshotDate],
        set: { value: String(data.value) },
      });
    return { ok: true };
  });

export const deleteAssetSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    // simplest: delete with join via subquery
    await db
      .delete(schema.assetSnapshots)
      .where(
        and(
          eq(schema.assetSnapshots.id, data.id),
          inArray(
            schema.assetSnapshots.assetId,
            db
              .select({ id: schema.assets.id })
              .from(schema.assets)
              .where(eq(schema.assets.dashboardId, data.dashboardId)),
          ),
        ),
      );
    return { ok: true };
  });

// -- Loans ------------------------------------------------------------------

export const listLoans = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    const loans = await db
      .select()
      .from(schema.loans)
      .where(eq(schema.loans.dashboardId, data.dashboardId))
      .orderBy(asc(schema.loans.sortOrder), asc(schema.loans.name));

    if (loans.length === 0) return { loans, snapshotsByLoan: {} as Record<number, Array<typeof schema.loanSnapshots.$inferSelect>> };
    const loanIds = loans.map((l) => l.id);
    const snaps = await db
      .select()
      .from(schema.loanSnapshots)
      .where(inArray(schema.loanSnapshots.loanId, loanIds))
      .orderBy(asc(schema.loanSnapshots.snapshotDate));
    const snapshotsByLoan: Record<number, typeof snaps> = {};
    for (const s of snaps) {
      const list = snapshotsByLoan[s.loanId] ?? [];
      list.push(s);
      snapshotsByLoan[s.loanId] = list;
    }
    return { loans, snapshotsByLoan };
  });

export const createLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        name: z.string().min(1).max(120),
        originalPrincipal: z.union([z.string(), z.number()]).optional(),
        currentBalance: z.union([z.string(), z.number()]).optional(),
        interestRate: z.union([z.string(), z.number()]).optional(),
        monthlyPayment: z.union([z.string(), z.number()]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await assertDashboardExists(data.dashboardId);
    const [loan] = await db
      .insert(schema.loans)
      .values({
        dashboardId: data.dashboardId,
        name: data.name,
        originalPrincipal:
          data.originalPrincipal !== undefined ? String(data.originalPrincipal) : "0",
        currentBalance:
          data.currentBalance !== undefined ? String(data.currentBalance) : "0",
        interestRate: data.interestRate !== undefined ? String(data.interestRate) : "0",
        monthlyPayment:
          data.monthlyPayment !== undefined ? String(data.monthlyPayment) : "0",
        notes: data.notes ?? null,
      })
      .returning();
    if (loan && data.currentBalance !== undefined) {
      await db.insert(schema.loanSnapshots).values({
        loanId: loan.id,
        snapshotDate: new Date().toISOString().slice(0, 10),
        balance: String(data.currentBalance),
      });
    }
    return loan!;
  });

export const updateLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        originalPrincipal: z.union([z.string(), z.number()]).optional(),
        currentBalance: z.union([z.string(), z.number()]).optional(),
        interestRate: z.union([z.string(), z.number()]).optional(),
        monthlyPayment: z.union([z.string(), z.number()]).optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { dashboardId, id, ...rest } = data;
    const setVals: Record<string, unknown> = {};
    if (rest.name !== undefined) setVals.name = rest.name;
    if (rest.originalPrincipal !== undefined)
      setVals.originalPrincipal = String(rest.originalPrincipal);
    if (rest.currentBalance !== undefined) setVals.currentBalance = String(rest.currentBalance);
    if (rest.interestRate !== undefined) setVals.interestRate = String(rest.interestRate);
    if (rest.monthlyPayment !== undefined) setVals.monthlyPayment = String(rest.monthlyPayment);
    if (rest.notes !== undefined) setVals.notes = rest.notes;
    if (Object.keys(setVals).length === 0) return { ok: true };
    await db
      .update(schema.loans)
      .set(setVals)
      .where(and(eq(schema.loans.id, id), eq(schema.loans.dashboardId, dashboardId)));
    return { ok: true };
  });

export const deleteLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(schema.loans)
      .where(
        and(eq(schema.loans.id, data.id), eq(schema.loans.dashboardId, data.dashboardId)),
      );
    return { ok: true };
  });

export const upsertLoanSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        loanId: z.number().int(),
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        balance: z.union([z.string(), z.number()]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const [own] = await db
      .select({ id: schema.loans.id })
      .from(schema.loans)
      .where(and(eq(schema.loans.id, data.loanId), eq(schema.loans.dashboardId, data.dashboardId)))
      .limit(1);
    if (!own) throw new Error("Ugyldig lån");
    await db
      .insert(schema.loanSnapshots)
      .values({
        loanId: data.loanId,
        snapshotDate: data.snapshotDate,
        balance: String(data.balance),
      })
      .onConflictDoUpdate({
        target: [schema.loanSnapshots.loanId, schema.loanSnapshots.snapshotDate],
        set: { balance: String(data.balance) },
      });
    // Update loan's currentBalance to latest snapshot
    await db
      .update(schema.loans)
      .set({ currentBalance: String(data.balance) })
      .where(eq(schema.loans.id, data.loanId));
    return { ok: true };
  });

export const deleteLoanSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(async ({ data }) => {
    await db
      .delete(schema.loanSnapshots)
      .where(
        and(
          eq(schema.loanSnapshots.id, data.id),
          inArray(
            schema.loanSnapshots.loanId,
            db
              .select({ id: schema.loans.id })
              .from(schema.loans)
              .where(eq(schema.loans.dashboardId, data.dashboardId)),
          ),
        ),
      );
    return { ok: true };
  });

// -- Dashboard summary ------------------------------------------------------

export const getDashboardSummary = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    const dashboardId = data.dashboardId;
    const [dash] = await db
      .select()
      .from(schema.dashboards)
      .where(eq(schema.dashboards.id, dashboardId))
      .limit(1);
    if (!dash) return null;

    const assetRows = await db
      .select()
      .from(schema.assets)
      .where(eq(schema.assets.dashboardId, dashboardId));
    const assetIds = assetRows.map((a) => a.id);
    const allAssetSnaps = assetIds.length
      ? await db
          .select()
          .from(schema.assetSnapshots)
          .where(inArray(schema.assetSnapshots.assetId, assetIds))
          .orderBy(asc(schema.assetSnapshots.snapshotDate))
      : [];
    const assetValueById = new Map<number, number>();
    for (const s of allAssetSnaps) {
      // ordered ascending — last wins = latest
      assetValueById.set(s.assetId, Number(s.value));
    }
    const totalAssets = assetRows.reduce((sum, a) => sum + (assetValueById.get(a.id) ?? 0), 0);

    const loanRows = await db
      .select()
      .from(schema.loans)
      .where(eq(schema.loans.dashboardId, dashboardId));
    const totalDebt = loanRows.reduce((sum, l) => sum + Number(l.currentBalance), 0);

    const sinkingRows = await db
      .select()
      .from(schema.sinkingFunds)
      .where(eq(schema.sinkingFunds.dashboardId, dashboardId));
    const totalSinking = sinkingRows.reduce((s, f) => s + Number(f.currentAmount), 0);
    const totalSinkingTarget = sinkingRows.reduce((s, f) => s + Number(f.target), 0);

    // Cash flow for current and previous month
    const now = new Date();
    const cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prev = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;

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
          inArray(schema.budgetEntries.yearMonth, [cur, prev]),
        ),
      );

    const cashFlow = {
      [cur]: { incomeBudget: 0, incomeActual: 0, expenseBudget: 0, expenseActual: 0 },
      [prev]: { incomeBudget: 0, incomeActual: 0, expenseBudget: 0, expenseActual: 0 },
    } as Record<string, { incomeBudget: number; incomeActual: number; expenseBudget: number; expenseActual: number }>;
    for (const r of ymRows) {
      const bucket = cashFlow[r.yearMonth];
      if (!bucket) continue;
      if (r.kind === "income") {
        bucket.incomeBudget += Number(r.budgeted);
        bucket.incomeActual += Number(r.actual);
      } else {
        bucket.expenseBudget += Number(r.budgeted);
        bucket.expenseActual += Number(r.actual);
      }
    }

    return {
      dashboard: dash,
      totalAssets,
      totalDebt,
      netWorth: totalAssets - totalDebt,
      totalSinking,
      totalSinkingTarget,
      assets: assetRows.map((a) => ({ ...a, currentValue: assetValueById.get(a.id) ?? 0 })),
      loans: loanRows,
      sinkingFunds: sinkingRows,
      cashFlow,
      currentMonth: cur,
      previousMonth: prev,
    };
  });

// -- Export -----------------------------------------------------------------

export const exportDashboard = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(async ({ data }) => {
    const id = data.dashboardId;
    const [dash] = await db
      .select()
      .from(schema.dashboards)
      .where(eq(schema.dashboards.id, id))
      .limit(1);
    if (!dash) return null;
    const [cats, entries, funds, assetRows, assetSnaps, loanRows, loanSnaps] = await Promise.all([
      db.select().from(schema.categories).where(eq(schema.categories.dashboardId, id)),
      db.select().from(schema.budgetEntries).where(eq(schema.budgetEntries.dashboardId, id)),
      db.select().from(schema.sinkingFunds).where(eq(schema.sinkingFunds.dashboardId, id)),
      db.select().from(schema.assets).where(eq(schema.assets.dashboardId, id)),
      db
        .select()
        .from(schema.assetSnapshots)
        .innerJoin(schema.assets, eq(schema.assets.id, schema.assetSnapshots.assetId))
        .where(eq(schema.assets.dashboardId, id)),
      db.select().from(schema.loans).where(eq(schema.loans.dashboardId, id)),
      db
        .select()
        .from(schema.loanSnapshots)
        .innerJoin(schema.loans, eq(schema.loans.id, schema.loanSnapshots.loanId))
        .where(eq(schema.loans.dashboardId, id)),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      dashboard: dash,
      categories: cats,
      budgetEntries: entries,
      sinkingFunds: funds,
      assets: assetRows,
      assetSnapshots: assetSnaps.map((r) => r.asset_snapshots),
      loans: loanRows,
      loanSnapshots: loanSnaps.map((r) => r.loan_snapshots),
    };
  });
