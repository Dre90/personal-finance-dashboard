import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import { categoryKindSchema } from "~/lib/enums";
import {
  buildPartialUpdate,
  numericInput,
  safeHandler,
  uuidSchema,
  yearMonthSchema,
} from "~/server/_helpers";
import { assertDashboardExists } from "~/server/_db";

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
