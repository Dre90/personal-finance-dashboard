import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../../../db";
import { assetKindSchema } from "~/lib/enums";
import {
  buildPartialUpdate,
  isoDateSchema,
  numericInput,
  safeHandler,
  uuidSchema,
} from "~/server/_helpers";
import { assertDashboardExists } from "~/server/_db";

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
