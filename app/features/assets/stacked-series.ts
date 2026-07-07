/** Helpers for deriving views over assets and their value snapshots. */

import type { Asset, AssetSnapshot } from "../../../db/schema";
import { CHART_COLORS, pickColor } from "~/lib/colors";
import { toNumber } from "~/lib/utils";

export interface StackedSeries {
  /** Stable per-asset key used as the row dataKey in the chart. */
  key: string;
  assetId: number;
  name: string;
  color: string;
}

export interface StackedDataset {
  /** One row per date: { date, [series.key]: value, ... }. */
  rows: Array<Record<string, number | string>>;
  series: StackedSeries[];
}

/**
 * Builds a forward-filled, stacked time series across several assets.
 *
 * For each date in the union of all snapshot dates, every asset contributes
 * its most recent value on or before that date (0 before its first snapshot).
 * Asset colours are assigned by position so that the same asset keeps the
 * same colour in its own card chart and in the combined stack.
 *
 * Assumes each asset's snapshot array is sorted ascending by `snapshotDate`
 * (as returned by `listAssets`). ISO dates sort lexicographically.
 */
export function buildStackedSeries(
  assets: ReadonlyArray<Asset>,
  snapshotsByAsset: Record<number, AssetSnapshot[]>,
): StackedDataset {
  const series: StackedSeries[] = assets.map((a, i) => ({
    key: `a${a.id}`,
    assetId: a.id,
    name: a.name,
    color: pickColor(i, CHART_COLORS),
  }));

  const dateSet = new Set<string>();
  for (const a of assets) {
    for (const s of snapshotsByAsset[a.id] ?? []) dateSet.add(s.snapshotDate);
  }
  const dates = [...dateSet].sort();

  // Forward-fill each asset with a running pointer + last value instead of
  // re-scanning the full snapshot list per date (O(totalSnapshots + dates×assets)
  // instead of O(dates×assets×snapshots)). Relies on both `dates` and each
  // asset's snapshots being sorted ascending.
  const pointers = series.map(() => 0);
  const lastValues = series.map(() => 0);

  const rows = dates.map((date) => {
    const row: Record<string, number | string> = { date };
    series.forEach((s, idx) => {
      const snaps = snapshotsByAsset[s.assetId] ?? [];
      let p = pointers[idx]!;
      while (p < snaps.length && snaps[p]!.snapshotDate <= date) {
        lastValues[idx] = toNumber(snaps[p]!.value);
        p++;
      }
      pointers[idx] = p;
      row[s.key] = lastValues[idx]!;
    });
    return row;
  });

  return { rows, series };
}
