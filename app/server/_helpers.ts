import { z } from "zod";

/** UUID validator used by every server function that takes a dashboardId. */
export const uuidSchema = z.string().uuid();

function normalizeNumericString(value: string): string {
  if (value.includes(",")) return value.replace(/[\s.]/g, "").replace(",", ".");
  if (/^-?(?:\d{1,3}\.)+\d{3}$/.test(value)) return value.replace(/[\s.]/g, "");
  return value.replace(/\s/g, "");
}

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
  z
    .union([z.string(), z.number()])
    .transform((value) => {
      if (typeof value === "number") return String(value);
      const trimmed = value.trim();
      if (!trimmed) return "0";
      return normalizeNumericString(trimmed);
    })
    .refine((value) => Number.isFinite(Number(value)), "Forventet et gyldig beløp");

/** Date input as a real calendar date in YYYY-MM-DD format. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Forventet YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Forventet en gyldig dato");

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
