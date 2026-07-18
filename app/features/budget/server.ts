import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import { isoDateSchema, numericInput, safeHandler, uuidSchema } from "~/server/_helpers";
import { assertDashboardExists } from "~/server/_db";
import { formatISODate, roundMoney } from "~/lib/utils";

const kindSchema = z.enum(["income", "expense"]);
const periodMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Forventet YYYY-MM");
const nameSchema = z.string().trim().min(1, "Navn kan ikke være tomt").max(120);
const descriptionSchema = z.string().trim().min(1, "Beskrivelse kan ikke være tom").max(120);
const groupNameSchema = nameSchema.max(60);
const groupColorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Ugyldig farge");

function monthStartDate(periodMonth: string, payday: number): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - (payday === 1 ? 1 : 2), payday));
  return date.toISOString().slice(0, 10);
}

function monthEndDate(periodMonth: string, payday: number): string {
  const [year, month] = periodMonth.split("-").map(Number);
  const date =
    payday === 1
      ? new Date(Date.UTC(year!, month!, 0))
      : new Date(Date.UTC(year!, month! - 1, payday - 1));
  return date.toISOString().slice(0, 10);
}

function monthAfter(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month!, 1));
  return date.toISOString().slice(0, 7);
}

function firstPeriodMonthForRule(effectiveFrom: string, payday: number): string {
  const month = effectiveFrom.slice(0, 7);
  return payday === 1 ? month : monthAfter(month);
}

async function getPaydayForPeriodMonth(dashboardId: string, periodMonth: string): Promise<number> {
  const rules = await db
    .select()
    .from(schema.budgetPaydayRules)
    .where(eq(schema.budgetPaydayRules.dashboardId, dashboardId))
    .orderBy(asc(schema.budgetPaydayRules.effectiveFrom));
  const rule = [...rules]
    .reverse()
    .find((entry) => firstPeriodMonthForRule(entry.effectiveFrom, entry.payday) <= periodMonth);
  if (!rule) throw new Error("Fant ingen lønningsdagsregel for budsjettperioden");
  return rule.payday;
}

function parseExpected(value: string | number) {
  return String(value);
}

function validateOrder(ownedIds: number[], orderedIds: number[]) {
  const ownedIdSet = new Set(ownedIds);
  const orderedIdSet = new Set(orderedIds);
  if (
    ownedIds.length !== orderedIds.length ||
    orderedIdSet.size !== orderedIds.length ||
    orderedIds.some((id) => !ownedIdSet.has(id))
  ) {
    throw new Error("Ugyldig rekkefølge");
  }
}

async function getOwnedPeriod(dashboardId: string, periodId: number) {
  const [period] = await db
    .select()
    .from(schema.budgetPeriods)
    .where(
      and(eq(schema.budgetPeriods.id, periodId), eq(schema.budgetPeriods.dashboardId, dashboardId)),
    )
    .limit(1);
  if (!period) throw new Error("Budsjettperioden finnes ikke");
  return period;
}

async function getOwnedTemplate(dashboardId: string, templateId: number) {
  const [template] = await db
    .select()
    .from(schema.budgetTemplates)
    .where(
      and(
        eq(schema.budgetTemplates.id, templateId),
        eq(schema.budgetTemplates.dashboardId, dashboardId),
      ),
    )
    .limit(1);
  if (!template) throw new Error("Malen finnes ikke");
  return template;
}

export const listBudgetTemplates = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      const templates = await db
        .select()
        .from(schema.budgetTemplates)
        .where(eq(schema.budgetTemplates.dashboardId, data.dashboardId))
        .orderBy(asc(schema.budgetTemplates.sortOrder), asc(schema.budgetTemplates.name));
      if (templates.length === 0) return [];

      const groups = await db
        .select()
        .from(schema.budgetTemplateGroups)
        .where(
          inArray(
            schema.budgetTemplateGroups.templateId,
            templates.map((template) => template.id),
          ),
        )
        .orderBy(asc(schema.budgetTemplateGroups.sortOrder), asc(schema.budgetTemplateGroups.name));
      const items =
        groups.length === 0
          ? []
          : await db
              .select()
              .from(schema.budgetTemplateItems)
              .where(
                inArray(
                  schema.budgetTemplateItems.groupId,
                  groups.map((group) => group.id),
                ),
              )
              .orderBy(
                asc(schema.budgetTemplateItems.sortOrder),
                asc(schema.budgetTemplateItems.name),
              );

      return templates.map((template) => ({
        ...template,
        groups: groups
          .filter((group) => group.templateId === template.id)
          .map((group) => ({
            ...group,
            items: items.filter((item) => item.groupId === group.id),
          })),
      }));
    }),
  );

export const createBudgetTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema, name: nameSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      await assertDashboardExists(data.dashboardId);
      const [template] = await db
        .insert(schema.budgetTemplates)
        .values({ dashboardId: data.dashboardId, name: data.name })
        .returning();
      return template!;
    }),
  );

export const updateBudgetTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ dashboardId: uuidSchema, templateId: z.number().int(), name: nameSchema })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedTemplate(data.dashboardId, data.templateId);
      await db
        .update(schema.budgetTemplates)
        .set({ name: data.name, updatedAt: new Date() })
        .where(eq(schema.budgetTemplates.id, data.templateId));
      return { ok: true as const };
    }),
  );

export const deleteBudgetTemplate = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, templateId: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedTemplate(data.dashboardId, data.templateId);
      await db.delete(schema.budgetTemplates).where(eq(schema.budgetTemplates.id, data.templateId));
      return { ok: true as const };
    }),
  );

export const createTemplateGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        templateId: z.number().int(),
        name: groupNameSchema,
        kind: kindSchema,
        isConsumption: z.boolean().default(false),
        color: groupColorSchema.default("#6366f1"),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedTemplate(data.dashboardId, data.templateId);
      if (data.isConsumption && data.kind !== "expense") {
        throw new Error("Bare utgiftsgrupper kan være Forbruk");
      }
      const [group] = await db
        .insert(schema.budgetTemplateGroups)
        .values({
          templateId: data.templateId,
          name: data.name,
          kind: data.kind,
          isConsumption: data.isConsumption,
          color: data.color,
        })
        .returning();
      return group!;
    }),
  );

export const updateTemplateGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        groupId: z.number().int(),
        name: groupNameSchema,
        isConsumption: z.boolean(),
        color: groupColorSchema,
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [group] = await db
        .select({
          group: schema.budgetTemplateGroups,
          dashboardId: schema.budgetTemplates.dashboardId,
        })
        .from(schema.budgetTemplateGroups)
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateGroups.id, data.groupId))
        .limit(1);
      if (!group || group.dashboardId !== data.dashboardId) throw new Error("Gruppen finnes ikke");
      if (data.isConsumption && group.group.kind !== "expense") {
        throw new Error("Bare utgiftsgrupper kan være Forbruk");
      }
      await db
        .update(schema.budgetTemplateGroups)
        .set({ name: data.name, isConsumption: data.isConsumption, color: data.color })
        .where(eq(schema.budgetTemplateGroups.id, data.groupId));
      return { ok: true as const };
    }),
  );

export const deleteTemplateGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, groupId: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [group] = await db
        .select({ dashboardId: schema.budgetTemplates.dashboardId })
        .from(schema.budgetTemplateGroups)
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateGroups.id, data.groupId))
        .limit(1);
      if (!group || group.dashboardId !== data.dashboardId) throw new Error("Gruppen finnes ikke");
      await db
        .delete(schema.budgetTemplateGroups)
        .where(eq(schema.budgetTemplateGroups.id, data.groupId));
      return { ok: true as const };
    }),
  );

export const reorderTemplateGroups = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        templateId: z.number().int(),
        orderedIds: z.array(z.number().int().positive()).min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedTemplate(data.dashboardId, data.templateId);
      const groups = await db
        .select({ id: schema.budgetTemplateGroups.id })
        .from(schema.budgetTemplateGroups)
        .where(eq(schema.budgetTemplateGroups.templateId, data.templateId));
      validateOrder(
        groups.map((group) => group.id),
        data.orderedIds,
      );
      // Netlify Database's prepared-statement driver does not reliably infer the
      // parameter type for a CASE expression used in an integer assignment. Keep
      // this atomic while using ordinary typed updates instead.
      await db.transaction(async (tx) => {
        for (const [index, id] of data.orderedIds.entries()) {
          await tx
            .update(schema.budgetTemplateGroups)
            .set({ sortOrder: index })
            .where(
              and(
                eq(schema.budgetTemplateGroups.id, id),
                eq(schema.budgetTemplateGroups.templateId, data.templateId),
              ),
            );
        }
      });
      return { ok: true as const };
    }),
  );

export const createTemplateItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        groupId: z.number().int(),
        name: nameSchema,
        expected: numericInput().default("0"),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [group] = await db
        .select({
          groupId: schema.budgetTemplateGroups.id,
          dashboardId: schema.budgetTemplates.dashboardId,
        })
        .from(schema.budgetTemplateGroups)
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateGroups.id, data.groupId))
        .limit(1);
      if (!group || group.dashboardId !== data.dashboardId) throw new Error("Gruppen finnes ikke");
      const [item] = await db
        .insert(schema.budgetTemplateItems)
        .values({ groupId: group.groupId, name: data.name, expected: data.expected })
        .returning();
      return item!;
    }),
  );

export const updateTemplateItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        itemId: z.number().int(),
        name: nameSchema.optional(),
        expected: numericInput().optional(),
      })
      .refine((data) => data.name !== undefined || data.expected !== undefined, {
        message: "Minst ett felt må oppdateres",
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [item] = await db
        .select({ dashboardId: schema.budgetTemplates.dashboardId })
        .from(schema.budgetTemplateItems)
        .innerJoin(
          schema.budgetTemplateGroups,
          eq(schema.budgetTemplateItems.groupId, schema.budgetTemplateGroups.id),
        )
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateItems.id, data.itemId))
        .limit(1);
      if (!item || item.dashboardId !== data.dashboardId) throw new Error("Posten finnes ikke");
      await db
        .update(schema.budgetTemplateItems)
        .set({
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.expected === undefined ? {} : { expected: parseExpected(data.expected) }),
        })
        .where(eq(schema.budgetTemplateItems.id, data.itemId));
      return { ok: true as const };
    }),
  );

export const deleteTemplateItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, itemId: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [item] = await db
        .select({ dashboardId: schema.budgetTemplates.dashboardId })
        .from(schema.budgetTemplateItems)
        .innerJoin(
          schema.budgetTemplateGroups,
          eq(schema.budgetTemplateItems.groupId, schema.budgetTemplateGroups.id),
        )
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateItems.id, data.itemId))
        .limit(1);
      if (!item || item.dashboardId !== data.dashboardId) throw new Error("Posten finnes ikke");
      await db
        .delete(schema.budgetTemplateItems)
        .where(eq(schema.budgetTemplateItems.id, data.itemId));
      return { ok: true as const };
    }),
  );

export const reorderTemplateItems = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        groupId: z.number().int(),
        orderedIds: z.array(z.number().int().positive()).min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const [group] = await db
        .select({
          id: schema.budgetTemplateGroups.id,
          dashboardId: schema.budgetTemplates.dashboardId,
        })
        .from(schema.budgetTemplateGroups)
        .innerJoin(
          schema.budgetTemplates,
          eq(schema.budgetTemplateGroups.templateId, schema.budgetTemplates.id),
        )
        .where(eq(schema.budgetTemplateGroups.id, data.groupId))
        .limit(1);
      if (!group || group.dashboardId !== data.dashboardId) throw new Error("Gruppen finnes ikke");
      const items = await db
        .select({ id: schema.budgetTemplateItems.id })
        .from(schema.budgetTemplateItems)
        .where(eq(schema.budgetTemplateItems.groupId, data.groupId));
      validateOrder(
        items.map((item) => item.id),
        data.orderedIds,
      );
      await db.transaction(async (tx) => {
        for (const [index, id] of data.orderedIds.entries()) {
          await tx
            .update(schema.budgetTemplateItems)
            .set({ sortOrder: index })
            .where(
              and(
                eq(schema.budgetTemplateItems.id, id),
                eq(schema.budgetTemplateItems.groupId, data.groupId),
              ),
            );
        }
      });
      return { ok: true as const };
    }),
  );

export const listBudgetPeriods = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ dashboardId: uuidSchema }).parse(data))
  .handler(
    safeHandler(async ({ data }) => {
      return db
        .select()
        .from(schema.budgetPeriods)
        .where(eq(schema.budgetPeriods.dashboardId, data.dashboardId))
        .orderBy(desc(schema.budgetPeriods.startDate));
    }),
  );

export const createBudgetPeriod = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodMonth: periodMonthSchema,
        templateId: z.number().int(),
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
      const template = await getOwnedTemplate(data.dashboardId, data.templateId);
      const payday = await getPaydayForPeriodMonth(data.dashboardId, data.periodMonth);
      const startDate = monthStartDate(data.periodMonth, payday);
      const endDate = monthEndDate(data.periodMonth, payday);
      const [existing] = await db
        .select({ id: schema.budgetPeriods.id })
        .from(schema.budgetPeriods)
        .where(
          and(
            eq(schema.budgetPeriods.dashboardId, data.dashboardId),
            lte(schema.budgetPeriods.startDate, endDate),
            gte(schema.budgetPeriods.endDate, startDate),
          ),
        )
        .limit(1);
      if (existing) throw new Error("Denne budsjettperioden overlapper en eksisterende periode");

      const groups = await db
        .select()
        .from(schema.budgetTemplateGroups)
        .where(eq(schema.budgetTemplateGroups.templateId, template.id))
        .orderBy(asc(schema.budgetTemplateGroups.sortOrder), asc(schema.budgetTemplateGroups.name));
      const items =
        groups.length === 0
          ? []
          : await db
              .select()
              .from(schema.budgetTemplateItems)
              .where(
                inArray(
                  schema.budgetTemplateItems.groupId,
                  groups.map((group) => group.id),
                ),
              );

      return db.transaction(async (tx) => {
        const [period] = await tx
          .insert(schema.budgetPeriods)
          .values({ dashboardId: data.dashboardId, templateId: template.id, startDate, endDate })
          .returning();
        if (!period) throw new Error("Klarte ikke opprette budsjettperioden");

        for (const group of groups) {
          const [periodGroup] = await tx
            .insert(schema.budgetPeriodGroups)
            .values({
              periodId: period.id,
              name: group.name,
              kind: group.kind,
              isConsumption: group.isConsumption,
              color: group.color,
              sortOrder: group.sortOrder,
            })
            .returning();
          if (!periodGroup) continue;
          const sourceItems = items.filter((item) => item.groupId === group.id);
          if (sourceItems.length > 0) {
            await tx.insert(schema.budgetPeriodItems).values(
              sourceItems.map((item) => ({
                groupId: periodGroup.id,
                name: item.name,
                expected: item.expected,
                sortOrder: item.sortOrder,
              })),
            );
          }
        }

        const [previous] = await tx
          .select()
          .from(schema.budgetPeriods)
          .where(
            and(
              eq(schema.budgetPeriods.dashboardId, data.dashboardId),
              lt(schema.budgetPeriods.endDate, startDate),
            ),
          )
          .orderBy(desc(schema.budgetPeriods.endDate))
          .limit(1);
        if (previous) {
          const previousGroups = await tx
            .select()
            .from(schema.budgetPeriodGroups)
            .where(eq(schema.budgetPeriodGroups.periodId, previous.id));
          const previousItems =
            previousGroups.length === 0
              ? []
              : await tx
                  .select()
                  .from(schema.budgetPeriodItems)
                  .where(
                    inArray(
                      schema.budgetPeriodItems.groupId,
                      previousGroups.map((group) => group.id),
                    ),
                  );
          const previousPurchases = await tx
            .select()
            .from(schema.budgetPurchases)
            .where(eq(schema.budgetPurchases.periodId, previous.id));
          const previousPurchaseActual = new Map<number, number>();
          for (const purchase of previousPurchases) {
            previousPurchaseActual.set(
              purchase.itemId,
              (previousPurchaseActual.get(purchase.itemId) ?? 0) + Number(purchase.amount),
            );
          }
          const actualBalance = roundMoney(
            previousItems.reduce((total, item) => {
              const group = previousGroups.find((entry) => entry.id === item.groupId);
              const actual = group?.isConsumption
                ? (previousPurchaseActual.get(item.id) ?? 0)
                : Number(item.actual);
              return total + (group?.kind === "income" ? actual : -actual);
            }, 0),
          );
          if (actualBalance > 0) {
            const carryoverAmount = actualBalance.toFixed(2);
            const [incomeGroup] = await tx
              .select()
              .from(schema.budgetPeriodGroups)
              .where(
                and(
                  eq(schema.budgetPeriodGroups.periodId, period.id),
                  eq(schema.budgetPeriodGroups.kind, "income"),
                ),
              )
              .orderBy(asc(schema.budgetPeriodGroups.sortOrder))
              .limit(1);
            if (incomeGroup) {
              await tx.insert(schema.budgetPeriodItems).values({
                groupId: incomeGroup.id,
                name: `Overført fra ${formatISODate(previous.endDate, { month: "long", year: "numeric" })}`,
                expected: carryoverAmount,
                actual: carryoverAmount,
                sortOrder: -1,
              });
            }
          }
        }
        return period;
      });
    }),
  );

export const getBudgetPeriod = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, periodId: z.number().int() }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const period = await getOwnedPeriod(data.dashboardId, data.periodId);
      const groups = await db
        .select()
        .from(schema.budgetPeriodGroups)
        .where(eq(schema.budgetPeriodGroups.periodId, period.id))
        .orderBy(asc(schema.budgetPeriodGroups.sortOrder), asc(schema.budgetPeriodGroups.name));
      const items =
        groups.length === 0
          ? []
          : await db
              .select()
              .from(schema.budgetPeriodItems)
              .where(
                inArray(
                  schema.budgetPeriodItems.groupId,
                  groups.map((group) => group.id),
                ),
              )
              .orderBy(asc(schema.budgetPeriodItems.sortOrder), asc(schema.budgetPeriodItems.name));
      const purchases = await db
        .select()
        .from(schema.budgetPurchases)
        .where(eq(schema.budgetPurchases.periodId, period.id))
        .orderBy(desc(schema.budgetPurchases.occurredAt), desc(schema.budgetPurchases.id));
      const purchaseActual = new Map<number, number>();
      for (const purchase of purchases) {
        purchaseActual.set(
          purchase.itemId,
          (purchaseActual.get(purchase.itemId) ?? 0) + Number(purchase.amount),
        );
      }
      return {
        ...period,
        purchases,
        groups: groups.map((group) => ({
          ...group,
          items: items
            .filter((item) => item.groupId === group.id)
            .map((item) => ({
              ...item,
              actual: group.isConsumption
                ? roundMoney(purchaseActual.get(item.id) ?? 0).toFixed(2)
                : item.actual,
            })),
        })),
      };
    }),
  );

export const createPeriodGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        name: groupNameSchema,
        kind: kindSchema,
        isConsumption: z.boolean().default(false),
        color: groupColorSchema.default("#6366f1"),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      if (data.isConsumption && data.kind !== "expense")
        throw new Error("Bare utgifter kan være Forbruk");
      const [group] = await db
        .insert(schema.budgetPeriodGroups)
        .values({
          periodId: data.periodId,
          name: data.name,
          kind: data.kind,
          isConsumption: data.isConsumption,
          color: data.color,
        })
        .returning();
      return group!;
    }),
  );

export const updatePeriodGroup = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        groupId: z.number().int(),
        name: groupNameSchema,
        isConsumption: z.boolean(),
        color: groupColorSchema,
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [group] = await db
        .select()
        .from(schema.budgetPeriodGroups)
        .where(
          and(
            eq(schema.budgetPeriodGroups.id, data.groupId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!group) throw new Error("Gruppen finnes ikke");
      if (data.isConsumption && group.kind !== "expense") {
        throw new Error("Bare utgifter kan være Forbruk");
      }
      await db
        .update(schema.budgetPeriodGroups)
        .set({ name: data.name, isConsumption: data.isConsumption, color: data.color })
        .where(eq(schema.budgetPeriodGroups.id, group.id));
      return { ok: true as const };
    }),
  );

export const reorderPeriodGroups = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        orderedIds: z.array(z.number().int().positive()).min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const groups = await db
        .select({ id: schema.budgetPeriodGroups.id })
        .from(schema.budgetPeriodGroups)
        .where(eq(schema.budgetPeriodGroups.periodId, data.periodId));
      validateOrder(
        groups.map((group) => group.id),
        data.orderedIds,
      );
      await db.transaction(async (tx) => {
        for (const [index, id] of data.orderedIds.entries()) {
          await tx
            .update(schema.budgetPeriodGroups)
            .set({ sortOrder: index })
            .where(
              and(
                eq(schema.budgetPeriodGroups.id, id),
                eq(schema.budgetPeriodGroups.periodId, data.periodId),
              ),
            );
        }
      });
      return { ok: true as const };
    }),
  );

export const reorderPeriodItems = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        groupId: z.number().int(),
        orderedIds: z.array(z.number().int().positive()).min(1),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [group] = await db
        .select({ id: schema.budgetPeriodGroups.id })
        .from(schema.budgetPeriodGroups)
        .where(
          and(
            eq(schema.budgetPeriodGroups.id, data.groupId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!group) throw new Error("Gruppen finnes ikke");
      const items = await db
        .select({ id: schema.budgetPeriodItems.id })
        .from(schema.budgetPeriodItems)
        .where(eq(schema.budgetPeriodItems.groupId, group.id));
      validateOrder(
        items.map((item) => item.id),
        data.orderedIds,
      );
      await db.transaction(async (tx) => {
        for (const [index, id] of data.orderedIds.entries()) {
          await tx
            .update(schema.budgetPeriodItems)
            .set({ sortOrder: index })
            .where(
              and(
                eq(schema.budgetPeriodItems.id, id),
                eq(schema.budgetPeriodItems.groupId, group.id),
              ),
            );
        }
      });
      return { ok: true as const };
    }),
  );

export const updatePeriodItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        itemId: z.number().int(),
        name: nameSchema.optional(),
        expected: numericInput().optional(),
        actual: numericInput().optional(),
      })
      .refine(
        (data) =>
          data.name !== undefined || data.expected !== undefined || data.actual !== undefined,
        { message: "Minst ett felt må oppdateres" },
      )
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [item] = await db
        .select({ item: schema.budgetPeriodItems, group: schema.budgetPeriodGroups })
        .from(schema.budgetPeriodItems)
        .innerJoin(
          schema.budgetPeriodGroups,
          eq(schema.budgetPeriodItems.groupId, schema.budgetPeriodGroups.id),
        )
        .where(
          and(
            eq(schema.budgetPeriodItems.id, data.itemId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!item) throw new Error("Posten finnes ikke");
      await db
        .update(schema.budgetPeriodItems)
        .set({
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.expected === undefined ? {} : { expected: data.expected }),
          ...(item.group.isConsumption || data.actual === undefined ? {} : { actual: data.actual }),
        })
        .where(eq(schema.budgetPeriodItems.id, item.item.id));
      return { ok: true as const };
    }),
  );

export const createPeriodItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        groupId: z.number().int(),
        name: nameSchema,
        expected: numericInput().default("0"),
        actual: numericInput().default("0"),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [group] = await db
        .select()
        .from(schema.budgetPeriodGroups)
        .where(
          and(
            eq(schema.budgetPeriodGroups.id, data.groupId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!group) throw new Error("Gruppen finnes ikke");
      const [item] = await db
        .insert(schema.budgetPeriodItems)
        .values({
          groupId: group.id,
          name: data.name,
          expected: data.expected,
          actual: group.isConsumption ? "0" : data.actual,
        })
        .returning();
      return item!;
    }),
  );

export const deletePeriodItem = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ dashboardId: uuidSchema, periodId: z.number().int(), itemId: z.number().int() })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [item] = await db
        .select({ id: schema.budgetPeriodItems.id })
        .from(schema.budgetPeriodItems)
        .innerJoin(
          schema.budgetPeriodGroups,
          eq(schema.budgetPeriodItems.groupId, schema.budgetPeriodGroups.id),
        )
        .where(
          and(
            eq(schema.budgetPeriodItems.id, data.itemId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!item) throw new Error("Posten finnes ikke");
      await db.delete(schema.budgetPeriodItems).where(eq(schema.budgetPeriodItems.id, item.id));
      return { ok: true as const };
    }),
  );

export const createBudgetPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        itemId: z.number().int(),
        occurredAt: isoDateSchema,
        description: descriptionSchema,
        amount: numericInput(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const period = await getOwnedPeriod(data.dashboardId, data.periodId);
      if (data.occurredAt < period.startDate || data.occurredAt > period.endDate) {
        throw new Error("Kjøpsdatoen må være innenfor budsjettperioden");
      }
      const [item] = await db
        .select({
          itemId: schema.budgetPeriodItems.id,
          isConsumption: schema.budgetPeriodGroups.isConsumption,
        })
        .from(schema.budgetPeriodItems)
        .innerJoin(
          schema.budgetPeriodGroups,
          eq(schema.budgetPeriodItems.groupId, schema.budgetPeriodGroups.id),
        )
        .where(
          and(
            eq(schema.budgetPeriodItems.id, data.itemId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!item || !item.isConsumption) throw new Error("Velg en post i Forbruk-gruppen");
      const [purchase] = await db
        .insert(schema.budgetPurchases)
        .values({
          periodId: data.periodId,
          itemId: item.itemId,
          occurredAt: data.occurredAt,
          description: data.description,
          amount: data.amount,
        })
        .returning();
      return purchase!;
    }),
  );

export const updateBudgetPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        dashboardId: uuidSchema,
        periodId: z.number().int(),
        purchaseId: z.number().int(),
        itemId: z.number().int(),
        occurredAt: isoDateSchema,
        description: descriptionSchema,
        amount: numericInput(),
      })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const period = await getOwnedPeriod(data.dashboardId, data.periodId);
      if (data.occurredAt < period.startDate || data.occurredAt > period.endDate) {
        throw new Error("Kjøpsdatoen må være innenfor budsjettperioden");
      }
      const [purchase] = await db
        .select({ id: schema.budgetPurchases.id })
        .from(schema.budgetPurchases)
        .where(
          and(
            eq(schema.budgetPurchases.id, data.purchaseId),
            eq(schema.budgetPurchases.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!purchase) throw new Error("Kjøpet finnes ikke");
      const [item] = await db
        .select({
          itemId: schema.budgetPeriodItems.id,
          isConsumption: schema.budgetPeriodGroups.isConsumption,
        })
        .from(schema.budgetPeriodItems)
        .innerJoin(
          schema.budgetPeriodGroups,
          eq(schema.budgetPeriodItems.groupId, schema.budgetPeriodGroups.id),
        )
        .where(
          and(
            eq(schema.budgetPeriodItems.id, data.itemId),
            eq(schema.budgetPeriodGroups.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!item || !item.isConsumption) throw new Error("Velg en post i Forbruk-gruppen");
      await db
        .update(schema.budgetPurchases)
        .set({
          itemId: item.itemId,
          occurredAt: data.occurredAt,
          description: data.description,
          amount: data.amount,
        })
        .where(eq(schema.budgetPurchases.id, purchase.id));
      return { ok: true as const };
    }),
  );

export const deleteBudgetPurchase = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ dashboardId: uuidSchema, periodId: z.number().int(), purchaseId: z.number().int() })
      .parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      await getOwnedPeriod(data.dashboardId, data.periodId);
      const [purchase] = await db
        .select({ id: schema.budgetPurchases.id })
        .from(schema.budgetPurchases)
        .where(
          and(
            eq(schema.budgetPurchases.id, data.purchaseId),
            eq(schema.budgetPurchases.periodId, data.periodId),
          ),
        )
        .limit(1);
      if (!purchase) throw new Error("Kjøpet finnes ikke");
      await db.delete(schema.budgetPurchases).where(eq(schema.budgetPurchases.id, purchase.id));
      return { ok: true as const };
    }),
  );

export const getBudgetYear = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ dashboardId: uuidSchema, year: z.number().int().min(1000).max(9998) }).parse(data),
  )
  .handler(
    safeHandler(async ({ data }) => {
      const yearStart = `${data.year}-01-01`;
      const nextYearStart = `${data.year + 1}-01-01`;
      const periods = await db
        .select()
        .from(schema.budgetPeriods)
        .where(
          and(
            eq(schema.budgetPeriods.dashboardId, data.dashboardId),
            gte(schema.budgetPeriods.endDate, yearStart),
            lt(schema.budgetPeriods.endDate, nextYearStart),
          ),
        )
        .orderBy(asc(schema.budgetPeriods.startDate));
      if (periods.length === 0) return [];
      const groups = await db
        .select()
        .from(schema.budgetPeriodGroups)
        .where(
          inArray(
            schema.budgetPeriodGroups.periodId,
            periods.map((period) => period.id),
          ),
        )
        .orderBy(
          asc(schema.budgetPeriodGroups.periodId),
          asc(schema.budgetPeriodGroups.sortOrder),
          asc(schema.budgetPeriodGroups.name),
        );
      const items =
        groups.length === 0
          ? []
          : await db
              .select()
              .from(schema.budgetPeriodItems)
              .where(
                inArray(
                  schema.budgetPeriodItems.groupId,
                  groups.map((group) => group.id),
                ),
              )
              .orderBy(
                asc(schema.budgetPeriodItems.groupId),
                asc(schema.budgetPeriodItems.sortOrder),
                asc(schema.budgetPeriodItems.name),
              );
      const purchases = await db
        .select()
        .from(schema.budgetPurchases)
        .where(
          inArray(
            schema.budgetPurchases.periodId,
            periods.map((period) => period.id),
          ),
        );
      const purchaseActual = new Map<number, number>();
      for (const purchase of purchases) {
        purchaseActual.set(
          purchase.itemId,
          (purchaseActual.get(purchase.itemId) ?? 0) + Number(purchase.amount),
        );
      }
      return periods.map((period) => {
        const periodGroups = groups.filter((group) => group.periodId === period.id);
        const periodItems = items.filter((item) =>
          periodGroups.some((group) => group.id === item.groupId),
        );
        const totals = periodItems.reduce(
          (acc, item) => {
            const group = periodGroups.find((entry) => entry.id === item.groupId)!;
            const actual = group.isConsumption
              ? (purchaseActual.get(item.id) ?? 0)
              : Number(item.actual);
            if (group.kind === "income") {
              acc.incomeBudget += Number(item.expected);
              acc.incomeActual += actual;
            } else {
              acc.expenseBudget += Number(item.expected);
              acc.expenseActual += actual;
            }
            return acc;
          },
          { incomeBudget: 0, incomeActual: 0, expenseBudget: 0, expenseActual: 0 },
        );
        const expenseGroups = periodGroups
          .filter((group) => group.kind === "expense")
          .map((group) => {
            const groupItems = periodItems.filter((item) => item.groupId === group.id);
            return {
              name: group.name,
              color: group.color,
              expected: groupItems.reduce((sum, item) => sum + Number(item.expected), 0),
              actual: groupItems.reduce(
                (sum, item) =>
                  sum +
                  (group.isConsumption ? (purchaseActual.get(item.id) ?? 0) : Number(item.actual)),
                0,
              ),
            };
          });
        return { ...period, ...totals, expenseGroups };
      });
    }),
  );
