import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import {
  buildPartialUpdate,
  isoDateSchema,
  numericInput,
  safeHandler,
  uuidSchema,
} from "~/server/_helpers";
import { assertDashboardExists } from "~/server/_db";

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
