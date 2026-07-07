/**
 * Server-only shared helpers. Kept separate from `_helpers.ts` (which is
 * client-reachable via `.validator()` schemas) so the `db` / `node:crypto`
 * imports never leak into the client bundle.
 */
import { eq } from "drizzle-orm";
import { randomUUID as nodeRandomUUID } from "node:crypto";
import { db, schema } from "../../db";

/** Throws if no dashboard exists with the given id. */
export async function assertDashboardExists(dashboardId: string): Promise<void> {
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
export function randomUUID(): string {
  return globalThis.crypto?.randomUUID?.() ?? nodeRandomUUID();
}
