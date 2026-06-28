import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";

/** UUID validator used by every server function that takes a dashboardId. */
export const uuidSchema = z.string().uuid();

/**
 * Validator for a "money-like" input: the client can send either a string or a number,
 * but the database expects a numeric column stored as a string.
 *
 *   numericInput()           // required, accepts string|number, output: string
 *   numericInput().optional()
 *
 * The transform happens at parse time so handlers receive strings ready for drizzle.
 */
export const numericInput = () =>
  z.union([z.string(), z.number()]).transform((v) => String(v));

/** Date input as YYYY-MM-DD string. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Forventet YYYY-MM-DD");

/** YYYY-MM string. */
export const yearMonthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Forventet YYYY-MM");

/**
 * Build a partial-update object that only contains keys present in `input` and runs each
 * value through the matching coercer. Avoids the repetitive
 *   if (foo !== undefined) setVals.foo = String(foo);
 * pattern that pollutes every update handler.
 */
export function buildPartialUpdate<
  TInput extends Record<string, unknown>,
  TKey extends keyof TInput,
>(
  input: TInput,
  coercers: { [K in TKey]?: (v: NonNullable<TInput[K]>) => unknown },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(coercers) as TKey[]) {
    const value = input[key];
    if (value === undefined) continue;
    const coercer = coercers[key];
    out[key as string] = coercer ? coercer(value as NonNullable<TInput[typeof key]>) : value;
  }
  return out;
}

/**
 * Throws if no dashboard exists with the given id. Use before any seeding mutation
 * to fail fast with a friendly message instead of bubbling a foreign-key error.
 */
export async function assertDashboardExists(dashboardId: string): Promise<void> {
  const [row] = await db
    .select({ id: schema.dashboards.id })
    .from(schema.dashboards)
    .where(eq(schema.dashboards.id, dashboardId))
    .limit(1);
  if (!row) throw new Error("Ugyldig dashboard-ID");
}

/**
 * Wraps a server-function handler so any thrown error is converted to a plain
 * `Error(message)` before the framework serializes it. Avoids Seroval failing on
 * non-cloneable error chains (pg/drizzle errors carry circular refs).
 */
export function safeHandler<TArgs extends { data: unknown }, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
): (args: TArgs) => Promise<TResult> {
  return async (args) => {
    try {
      return await fn(args);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message || "Serverfeil"
          : typeof err === "string"
            ? err
            : "Ukjent serverfeil";
      // Log on the server so we can see the original error in Netlify logs.
      console.error("[server fn] error:", err);
      throw new Error(msg);
    }
  };
}
