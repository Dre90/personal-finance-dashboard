/** Project-wide colour palettes. Centralising these keeps charts visually coherent. */

import type { AssetKind } from "./enums";

/** Generic categorical palette for unrelated series (donuts, multi-bar, etc.). */
export const CHART_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#a855f7",
] as const;

/** Palette tuned for sinking-fund cards (greens & warm hues). */
export const SINKING_COLORS = [
  "#10b981",
  "#6366f1",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#84cc16",
  "#f97316",
  "#a855f7",
] as const;

/** Picks a colour by index, wrapping around. */
export function pickColor(index: number, palette: ReadonlyArray<string> = CHART_COLORS): string {
  return palette[index % palette.length] ?? palette[0]!;
}

/** Semantic colours tied to specific asset kinds. */
export const ASSET_KIND_COLOR: Record<AssetKind, string> = {
  ask: "#6366f1",
  pension: "#10b981",
  cash: "#f59e0b",
  other: "#8b5cf6",
};

/** Single colour each for income / expense / savings series. */
export const FLOW_COLORS = {
  income: "#10b981",
  expense: "#ef4444",
  savings: "#6366f1",
  budgeted: "#475569",
  actual: "#6366f1",
  loan: "#f59e0b",
} as const;
