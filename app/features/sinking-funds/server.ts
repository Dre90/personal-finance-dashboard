import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import {
  buildPartialUpdate,
  isoDateSchema,
  numericInput,
  safeHandler,
  uuidSchema,
} from "~/server/_helpers";
import { assertDashboardExists, randomUUID } from "~/server/_db";

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
