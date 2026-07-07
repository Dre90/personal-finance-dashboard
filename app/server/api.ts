import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { z } from "zod";
import { db, schema } from "../../db";
import { DEFAULT_CATEGORIES, DEFAULT_SINKING_FUNDS } from "../lib/defaults";
import { assetKindSchema, categoryKindSchema } from "../lib/enums";
import {
  buildPartialUpdate,
  isoDateSchema,
  numericInput,
  safeHandler,
  uuidSchema,
  yearMonthSchema,
} from "./_helpers";

/**
 * Throws if no dashboard exists with the given id. Kept here (not in _helpers) so the
 * db import stays inside server-function handlers and is never pulled into the client
 * bundle via the client-reachable `.validator()` imports from _helpers.
 */
async function assertDashboardExists(dashboardId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.dashboards.id })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.id, dashboardId))
    .limit(1);
  if (!row) throw new Error("Ugyldig dashboard-ID");
}

/**
 * `globalThis.crypto` (Web Crypto) isn't guaranteed to be present on every server
 * runtime/bundling target, so fall back to Node's `node:crypto` implementation.
 */
function randomUUID(): string {
  return globalThis.crypto?.randomUUID?.() ?? nodeRandomUUID();
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, includeArchived: z.boolean().optional() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const rows = await db
        .select()
        .from(schema.categories)
        .where(eq(schema.categories.dashboardId, data.dashboardId))
        .orderBy(asc(schema.categories.sortOrder), asc(schema.categories.name));
      return data.includeArchived ? rows : rows.filter((c) => !c.archived);
    }),
  );

export const createCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        name: z.string().min(1).max(120),
        kind: categoryKindSchema,
        groupName: z.string().min(1).max(60).default("Annet"),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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
    }),
  );

export const updateCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        kind: categoryKindSchema.optional(),
        groupName: z.string().min(1).max(60).optional(),
        archived: z.boolean().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const set = buildPartialUpdate(data, {
        name: (v) => v,
        kind: (v) => v,
        groupName: (v) => v,
        archived: (v) => v,
      });
      if (Object.keys(set).length === 0) return { ok: true as const };
      await db
        .update(schema.categories)
        .set(set)
        .where(
          and(
            eq(schema.categories.id, data.id),
            eq(schema.categories.dashboardId, data.dashboardId),
          ),
        );
      return { ok: true as const };
    }),
  );

export const deleteCategory = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await db
        .delete(schema.categories)
        .where(
          and(
            eq(schema.categories.id, data.id),
            eq(schema.categories.dashboardId, data.dashboardId),
          ),
        );
      return { ok: true as const };
    }),
  );

// ---------------------------------------------------------------------------
// Budget entries
// ---------------------------------------------------------------------------

export const getBudgetMonth = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, yearMonth: yearMonthSchema }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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

      return { categories, entries };
    }),
  );

export const upsertBudgetEntry = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        categoryId: z.number().int(),
        yearMonth: yearMonthSchema,
        budgeted: numericInput().optional(),
        actual: numericInput().optional(),
        note: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const changes = buildPartialUpdate(data, {
        budgeted: (v) => v,
        actual: (v) => v,
        note: (v) => v,
      });
      if (Object.keys(changes).length === 0) return { ok: true as const };

      await db
        .insert(schema.budgetEntries)
        .values({
          dashboardId: data.dashboardId,
          categoryId: data.categoryId,
          yearMonth: data.yearMonth,
          ...changes,
        } as typeof schema.budgetEntries.$inferInsert)
        .onConflictDoUpdate({
          target: [schema.budgetEntries.categoryId, schema.budgetEntries.yearMonth],
          set: changes,
        });
      return { ok: true as const };
    }),
  );

export const getBudgetYear = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, year: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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
    }),
  );

// ---------------------------------------------------------------------------
// Sinking funds
// ---------------------------------------------------------------------------

export const listSinkingFunds = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      return db
        .select()
        .from(schema.sinkingFunds)
        .where(eq(schema.sinkingFunds.dashboardId, data.dashboardId))
        .orderBy(asc(schema.sinkingFunds.sortOrder), asc(schema.sinkingFunds.name));
    }),
  );

const sinkingFundFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  target: numericInput().optional(),
  monthlyContribution: numericInput().optional(),
  color: z.string().optional(),
  notes: z.string().nullable().optional(),
});

export const createSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    sinkingFundFieldsSchema.extend({ dashboardId: uuidSchema }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await assertDashboardExists(data.dashboardId);
      const [row] = await db
        .insert(schema.sinkingFunds)
        .values({
          dashboardId: data.dashboardId,
          name: data.name,
          target: data.target ?? "0",
          monthlyContribution: data.monthlyContribution ?? "0",
          color: data.color ?? "#10b981",
          notes: data.notes ?? null,
        })
        .returning();
      return row!;
    }),
  );

export const updateSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    sinkingFundFieldsSchema
      .partial()
      .extend({ dashboardId: uuidSchema, id: z.number().int() })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const set = buildPartialUpdate(data, {
        name: (v) => v,
        target: (v) => v,
        monthlyContribution: (v) => v,
        color: (v) => v,
        notes: (v) => v,
      });
      if (Object.keys(set).length === 0) return { ok: true as const };
      await db
        .update(schema.sinkingFunds)
        .set(set)
        .where(
          and(
            eq(schema.sinkingFunds.id, data.id),
            eq(schema.sinkingFunds.dashboardId, data.dashboardId),
          ),
        );
      return { ok: true as const };
    }),
  );

export const deleteSinkingFund = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await db
        .delete(schema.sinkingFunds)
        .where(
          and(
            eq(schema.sinkingFunds.id, data.id),
            eq(schema.sinkingFunds.dashboardId, data.dashboardId),
          ),
        );
      return { ok: true as const };
    }),
  );

export const reorderSinkingFunds = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        orderedIds: z.array(z.number().int().positive()).min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const owned = await db
        .select({ id: schema.sinkingFunds.id })
        .from(schema.sinkingFunds)
        .where(eq(schema.sinkingFunds.dashboardId, data.dashboardId));

      const ownedIds = new Set(owned.map((r) => r.id));
      const incoming = new Set(data.orderedIds);
      if (
        owned.length !== data.orderedIds.length ||
        incoming.size !== data.orderedIds.length ||
        data.orderedIds.some((id) => !ownedIds.has(id))
      ) {
        throw new Error("Ugyldig rekkefølge");
      }

      // Single atomic UPDATE (CASE ... WHEN ...) instead of N sequential round-trips,
      // so a mid-way failure can't leave the ordering half-applied.
      const cases = data.orderedIds.map(
        (id, i) => sql`WHEN ${schema.sinkingFunds.id} = ${id} THEN ${i}`,
      );
      await db
        .update(schema.sinkingFunds)
        .set({ sortOrder: sql`CASE ${sql.join(cases, sql` `)} END` })
        .where(
          and(
            eq(schema.sinkingFunds.dashboardId, data.dashboardId),
            inArray(schema.sinkingFunds.id, data.orderedIds),
          ),
        );
      return { ok: true as const };
    }),
  );

// ---------------------------------------------------------------------------
// Sinking-fund transactions
// ---------------------------------------------------------------------------

const txnKindSchema = z.enum(["deposit", "withdrawal", "adjustment", "opening"]);

/**
 * Validates a signed transaction amount against its `kind`'s sign rules:
 * deposits must be positive, withdrawals must be negative, adjustments may be
 * either sign but not zero. Throws a user-facing error on any violation.
 */
function assertValidTxnAmount(amount: string, kind: string): void {
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) throw new Error("Ugyldig beløp");
  if (kind === "deposit" && n <= 0) throw new Error("Innskudd må være et positivt beløp");
  if (kind === "withdrawal" && n >= 0) throw new Error("Uttak må være et negativt beløp");
}

/** The `tx` type passed to a `db.transaction(async (tx) => ...)` callback. */
type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Recompute a fund's `currentAmount` from the sum of its transactions and persist.
 * Uses a single UPDATE with the SUM computed in a correlated subquery (rather than a
 * separate SELECT + UPDATE) so the write always reflects the latest committed rows
 * even under concurrent requests — two read-then-write round-trips could otherwise
 * race and leave a stale total.
 *
 * Accepts an optional executor (a `db.transaction` callback's `tx`) so callers can run
 * the transaction insert/update and this recompute atomically — otherwise a failure
 * between the two writes would leave the transaction row committed but the fund's
 * cached `currentAmount` stale.
 */
async function recomputeSinkingFundBalance(
  fundId: number,
  dashboardId: string,
  executor: typeof db | DbTransaction = db,
): Promise<void> {
  await executor
    .update(schema.sinkingFunds)
    .set({
      currentAmount: sql`coalesce((
        select sum(${schema.sinkingFundTransactions.amount})
        from ${schema.sinkingFundTransactions}
        where ${schema.sinkingFundTransactions.sinkingFundId} = ${schema.sinkingFunds.id}
          and ${schema.sinkingFundTransactions.dashboardId} = ${schema.sinkingFunds.dashboardId}
      ), 0)`,
    })
    .where(
      and(eq(schema.sinkingFunds.id, fundId), eq(schema.sinkingFunds.dashboardId, dashboardId)),
    );
}

async function assertFundBelongsToDashboard(fundId: number, dashboardId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.sinkingFunds.id })
    .from(schema.sinkingFunds)
    .where(
      and(eq(schema.sinkingFunds.id, fundId), eq(schema.sinkingFunds.dashboardId, dashboardId)),
    )
    .limit(1);
  if (!row) throw new Error("Ugyldig fond");
}

export const listSinkingFundTransactions = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        sinkingFundId: z.number().int().optional(),
        kind: txnKindSchema.optional(),
        from: isoDateSchema.optional(),
        to: isoDateSchema.optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const conditions = [eq(schema.sinkingFundTransactions.dashboardId, data.dashboardId)];
      if (data.sinkingFundId !== undefined) {
        conditions.push(eq(schema.sinkingFundTransactions.sinkingFundId, data.sinkingFundId));
      }
      if (data.kind !== undefined) {
        conditions.push(eq(schema.sinkingFundTransactions.kind, data.kind));
      }
      if (data.from !== undefined) {
        conditions.push(gte(schema.sinkingFundTransactions.occurredAt, data.from));
      }
      if (data.to !== undefined) {
        conditions.push(lte(schema.sinkingFundTransactions.occurredAt, data.to));
      }
      return db
        .select()
        .from(schema.sinkingFundTransactions)
        .where(and(...conditions))
        .orderBy(
          desc(schema.sinkingFundTransactions.occurredAt),
          desc(schema.sinkingFundTransactions.id),
        );
    }),
  );

export const createSinkingFundTransaction = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        sinkingFundId: z.number().int(),
        occurredAt: isoDateSchema,
        amount: numericInput(),
        kind: txnKindSchema,
        note: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      if (data.kind === "opening") {
        throw new Error("Åpningsbalanse kan ikke opprettes via API");
      }
      assertValidTxnAmount(data.amount, data.kind);
      await assertFundBelongsToDashboard(data.sinkingFundId, data.dashboardId);
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(schema.sinkingFundTransactions)
          .values({
            sinkingFundId: data.sinkingFundId,
            dashboardId: data.dashboardId,
            occurredAt: data.occurredAt,
            amount: data.amount,
            kind: data.kind,
            note: data.note ?? null,
          })
          .returning();
        await recomputeSinkingFundBalance(data.sinkingFundId, data.dashboardId, tx);
        return row!;
      });
    }),
  );

export const allocateSinkingFundDeposit = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        occurredAt: isoDateSchema,
        note: z.string().nullable().optional(),
        allocations: z
          .array(
            z.object({
              sinkingFundId: z.number().int(),
              amount: numericInput(),
            }),
          )
          .min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      // Verify every fund belongs to this dashboard up-front so we don't half-allocate.
      const fundIds = Array.from(new Set(data.allocations.map((a) => a.sinkingFundId)));
      const ownedRows = await db
        .select({ id: schema.sinkingFunds.id })
        .from(schema.sinkingFunds)
        .where(
          and(
            eq(schema.sinkingFunds.dashboardId, data.dashboardId),
            inArray(schema.sinkingFunds.id, fundIds),
          ),
        );
      if (ownedRows.length !== fundIds.length) throw new Error("Ugyldig fond i fordeling");

      const allocationGroupId = randomUUID();
      for (const a of data.allocations) {
        const n = Number(a.amount);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error("Alle beløp i fordelingen må være positive");
        }
      }

      await db.transaction(async (tx) => {
        await tx.insert(schema.sinkingFundTransactions).values(
          data.allocations.map((a) => ({
            sinkingFundId: a.sinkingFundId,
            dashboardId: data.dashboardId,
            occurredAt: data.occurredAt,
            amount: a.amount,
            kind: "deposit" as const,
            note: data.note ?? null,
            allocationGroupId,
          })),
        );

        for (const fundId of new Set(data.allocations.map((a) => a.sinkingFundId))) {
          await recomputeSinkingFundBalance(fundId, data.dashboardId, tx);
        }
      });
      return { allocationGroupId };
    }),
  );

export const updateSinkingFundTransaction = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        occurredAt: isoDateSchema.optional(),
        amount: numericInput().optional(),
        note: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const set = buildPartialUpdate(data, {
        occurredAt: (v) => v,
        amount: (v) => v,
        note: (v) => v,
      });
      if (Object.keys(set).length === 0) return { ok: true as const };

      const [existing] = await db
        .select({
          sinkingFundId: schema.sinkingFundTransactions.sinkingFundId,
          kind: schema.sinkingFundTransactions.kind,
        })
        .from(schema.sinkingFundTransactions)
        .where(
          and(
            eq(schema.sinkingFundTransactions.id, data.id),
            eq(schema.sinkingFundTransactions.dashboardId, data.dashboardId),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("Fant ikke transaksjonen");
      if (existing.kind === "opening") throw new Error("Kan ikke endre åpningsbalanse");
      if (data.amount !== undefined) assertValidTxnAmount(data.amount, existing.kind);

      await db.transaction(async (tx) => {
        await tx
          .update(schema.sinkingFundTransactions)
          .set(set)
          .where(
            and(
              eq(schema.sinkingFundTransactions.id, data.id),
              eq(schema.sinkingFundTransactions.dashboardId, data.dashboardId),
            ),
          );
        await recomputeSinkingFundBalance(existing.sinkingFundId, data.dashboardId, tx);
      });
      return { ok: true as const };
    }),
  );

export const deleteSinkingFundTransaction = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [existing] = await db
        .select({
          sinkingFundId: schema.sinkingFundTransactions.sinkingFundId,
          kind: schema.sinkingFundTransactions.kind,
        })
        .from(schema.sinkingFundTransactions)
        .where(
          and(
            eq(schema.sinkingFundTransactions.id, data.id),
            eq(schema.sinkingFundTransactions.dashboardId, data.dashboardId),
          ),
        )
        .limit(1);
      if (!existing) return { ok: true as const };
      if (existing.kind === "opening") throw new Error("Kan ikke slette åpningsbalanse");

      await db.transaction(async (tx) => {
        await tx
          .delete(schema.sinkingFundTransactions)
          .where(
            and(
              eq(schema.sinkingFundTransactions.id, data.id),
              eq(schema.sinkingFundTransactions.dashboardId, data.dashboardId),
            ),
          );
        await recomputeSinkingFundBalance(existing.sinkingFundId, data.dashboardId, tx);
      });
      return { ok: true as const };
    }),
  );

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export const listAssets = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const assets = await db
        .select()
        .from(schema.assets)
        .where(eq(schema.assets.dashboardId, data.dashboardId))
        .orderBy(asc(schema.assets.sortOrder), asc(schema.assets.name));

      const empty: Record<number, Array<typeof schema.assetSnapshots.$inferSelect>> = {};
      if (assets.length === 0) return { assets, snapshotsByAsset: empty };

      const snaps = await db
        .select()
        .from(schema.assetSnapshots)
        .where(
          inArray(
            schema.assetSnapshots.assetId,
            assets.map((a) => a.id),
          ),
        )
        .orderBy(asc(schema.assetSnapshots.snapshotDate));

      const snapshotsByAsset: Record<number, typeof snaps> = {};
      for (const s of snaps) {
        (snapshotsByAsset[s.assetId] ??= []).push(s);
      }
      return { assets, snapshotsByAsset };
    }),
  );

export const createAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        kind: assetKindSchema,
        name: z.string().min(1).max(120),
        initialValue: numericInput().optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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
          value: data.initialValue,
        });
      }
      return asset!;
    }),
  );

export const updateAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        id: z.number().int(),
        name: z.string().min(1).max(120).optional(),
        kind: assetKindSchema.optional(),
        notes: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const set = buildPartialUpdate(data, {
        name: (v) => v,
        kind: (v) => v,
        notes: (v) => v,
      });
      if (Object.keys(set).length === 0) return { ok: true as const };
      await db
        .update(schema.assets)
        .set(set)
        .where(and(eq(schema.assets.id, data.id), eq(schema.assets.dashboardId, data.dashboardId)));
      return { ok: true as const };
    }),
  );

export const deleteAsset = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await db
        .delete(schema.assets)
        .where(and(eq(schema.assets.id, data.id), eq(schema.assets.dashboardId, data.dashboardId)));
      return { ok: true as const };
    }),
  );

export const upsertAssetSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        assetId: z.number().int(),
        snapshotDate: isoDateSchema,
        value: numericInput(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [own] = await db
        .select({ id: schema.assets.id })
        .from(schema.assets)
        .where(
          and(eq(schema.assets.id, data.assetId), eq(schema.assets.dashboardId, data.dashboardId)),
        )
        .limit(1);
      if (!own) throw new Error("Ugyldig eiendel");
      await db
        .insert(schema.assetSnapshots)
        .values({
          assetId: data.assetId,
          snapshotDate: data.snapshotDate,
          value: data.value,
        })
        .onConflictDoUpdate({
          target: [schema.assetSnapshots.assetId, schema.assetSnapshots.snapshotDate],
          set: { value: data.value },
        });
      return { ok: true as const };
    }),
  );

export const deleteAssetSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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
      return { ok: true as const };
    }),
  );

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

export const listLoans = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const loans = await db
        .select()
        .from(schema.loans)
        .where(eq(schema.loans.dashboardId, data.dashboardId))
        .orderBy(asc(schema.loans.sortOrder), asc(schema.loans.name));

      const empty: Record<number, Array<typeof schema.loanSnapshots.$inferSelect>> = {};
      if (loans.length === 0) return { loans, snapshotsByLoan: empty };

      const snaps = await db
        .select()
        .from(schema.loanSnapshots)
        .where(
          inArray(
            schema.loanSnapshots.loanId,
            loans.map((l) => l.id),
          ),
        )
        .orderBy(asc(schema.loanSnapshots.snapshotDate));

      const snapshotsByLoan: Record<number, typeof snaps> = {};
      for (const s of snaps) {
        (snapshotsByLoan[s.loanId] ??= []).push(s);
      }
      return { loans, snapshotsByLoan };
    }),
  );

const loanFieldsSchema = z.object({
  name: z.string().min(1).max(120),
  originalPrincipal: numericInput().optional(),
  currentBalance: numericInput().optional(),
  interestRate: numericInput().optional(),
  monthlyPayment: numericInput().optional(),
  notes: z.string().nullable().optional(),
});

export const createLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) => loanFieldsSchema.extend({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      await assertDashboardExists(data.dashboardId);
      const [loan] = await db
        .insert(schema.loans)
        .values({
          dashboardId: data.dashboardId,
          name: data.name,
          originalPrincipal: data.originalPrincipal ?? "0",
          currentBalance: data.currentBalance ?? "0",
          interestRate: data.interestRate ?? "0",
          monthlyPayment: data.monthlyPayment ?? "0",
          notes: data.notes ?? null,
        })
        .returning();
      if (loan && data.currentBalance !== undefined) {
        await db.insert(schema.loanSnapshots).values({
          loanId: loan.id,
          snapshotDate: new Date().toISOString().slice(0, 10),
          balance: data.currentBalance,
        });
      }
      return loan!;
    }),
  );

export const updateLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    loanFieldsSchema
      .partial()
      .extend({ dashboardId: uuidSchema, id: z.number().int() })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const set = buildPartialUpdate(data, {
        name: (v) => v,
        originalPrincipal: (v) => v,
        currentBalance: (v) => v,
        interestRate: (v) => v,
        monthlyPayment: (v) => v,
        notes: (v) => v,
      });
      if (Object.keys(set).length === 0) return { ok: true as const };
      await db
        .update(schema.loans)
        .set(set)
        .where(and(eq(schema.loans.id, data.id), eq(schema.loans.dashboardId, data.dashboardId)));
      return { ok: true as const };
    }),
  );

export const deleteLoan = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await db
        .delete(schema.loans)
        .where(and(eq(schema.loans.id, data.id), eq(schema.loans.dashboardId, data.dashboardId)));
      return { ok: true as const };
    }),
  );

export const upsertLoanSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        loanId: z.number().int(),
        snapshotDate: isoDateSchema,
        balance: numericInput(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [own] = await db
        .select({ id: schema.loans.id })
        .from(schema.loans)
        .where(
          and(eq(schema.loans.id, data.loanId), eq(schema.loans.dashboardId, data.dashboardId)),
        )
        .limit(1);
      if (!own) throw new Error("Ugyldig lån");
      await db
        .insert(schema.loanSnapshots)
        .values({
          loanId: data.loanId,
          snapshotDate: data.snapshotDate,
          balance: data.balance,
        })
        .onConflictDoUpdate({
          target: [schema.loanSnapshots.loanId, schema.loanSnapshots.snapshotDate],
          set: { balance: data.balance },
        });
      // Keep the loan row's denormalised currentBalance in sync.
      await db
        .update(schema.loans)
        .set({ currentBalance: data.balance })
        .where(eq(schema.loans.id, data.loanId));
      return { ok: true as const };
    }),
  );

export const deleteLoanSnapshot = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, id: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
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
      return { ok: true as const };
    }),
  );

// ---------------------------------------------------------------------------
// Dashboard summary (used by the home page)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

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
