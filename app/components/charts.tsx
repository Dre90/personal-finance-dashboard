/**
 * Centralised chart wrappers built on shadcn's <ChartContainer> (which themes
 * Recharts axes/grid/cursor via CSS and injects per-series `--color-*` vars from
 * a ChartConfig). Every chart shares the same money formatter and tooltip.
 *
 * The wrappers keep a thin, page-friendly API (`series={[{ dataKey, name, color }]}`)
 * so pages don't deal with ChartConfig directly.
 */
import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "./ui/chart";
import { formatNOK } from "../lib/utils";

interface SeriesLike {
  dataKey: string;
  name?: string;
  color: string;
}

/** Build a shadcn ChartConfig (label + colour per series) from a series list. */
function toConfig(series: ReadonlyArray<SeriesLike>): ChartConfig {
  return Object.fromEntries(
    series.map((s) => [s.dataKey, { label: s.name ?? s.dataKey, color: s.color }]),
  );
}

const yTickFormatter = (v: number | string) => formatNOK(Number(v));

/**
 * Tooltip row renderer: coloured indicator + series label + NOK-formatted value.
 * Passed to <ChartTooltipContent formatter>, replacing its default number format.
 */
function moneyItemFormatter(
  value: unknown,
  name: unknown,
  item: { color?: string; payload?: { fill?: string } },
) {
  const color = item?.color ?? item?.payload?.fill;
  return (
    <>
      <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
      <div className="flex flex-1 items-center justify-between gap-3 leading-none">
        <span className="text-muted-foreground">{name as React.ReactNode}</span>
        <span className="text-foreground font-mono font-medium tabular-nums">
          {formatNOK(Number(value))}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// High-level convenience charts
// ---------------------------------------------------------------------------

export interface MoneyBarSeries {
  dataKey: string;
  name: string;
  color: string;
  stackId?: string;
}

export function MoneyBarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 280,
  showLegend = true,
}: {
  data: ReadonlyArray<T>;
  xKey: string;
  series: ReadonlyArray<MoneyBarSeries>;
  height?: number;
  showLegend?: boolean;
}) {
  return (
    <ChartContainer config={toConfig(series)} className="aspect-auto w-full" style={{ height }}>
      <BarChart data={data as T[]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          tickFormatter={yTickFormatter}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={moneyItemFormatter} />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={`var(--color-${s.dataKey})`}
            stackId={s.stackId}
            radius={s.stackId ? 0 : [4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export interface MoneyLineSeries {
  dataKey: string;
  name?: string;
  color: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  dot?: boolean | object;
}

export function MoneyLineChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  showLegend = false,
  yWidth,
}: {
  data: ReadonlyArray<T>;
  xKey: string;
  series: ReadonlyArray<MoneyLineSeries>;
  height?: number;
  showLegend?: boolean;
  yWidth?: number;
}) {
  return (
    <ChartContainer config={toConfig(series)} className="aspect-auto w-full" style={{ height }}>
      <LineChart data={data as T[]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          width={yWidth}
          tickFormatter={yTickFormatter}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={moneyItemFormatter} />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={`var(--color-${s.dataKey})`}
            strokeWidth={s.strokeWidth ?? 2}
            strokeDasharray={s.strokeDasharray}
            dot={s.dot ?? { r: 2 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}

export interface MoneyAreaSeries {
  dataKey: string;
  name: string;
  color: string;
}

/**
 * Stacked area chart. Each series is drawn as a filled layer sharing one
 * `stackId`, so the top edge represents the summed total across all series.
 */
export function MoneyAreaChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  height = 260,
  showLegend = true,
  yWidth,
}: {
  data: ReadonlyArray<T>;
  xKey: string;
  series: ReadonlyArray<MoneyAreaSeries>;
  height?: number;
  showLegend?: boolean;
  yWidth?: number;
}) {
  return (
    <ChartContainer config={toConfig(series)} className="aspect-auto w-full" style={{ height }}>
      <AreaChart data={data as T[]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tick={{ fontSize: 11 }}
        />
        <YAxis
          width={yWidth}
          tickFormatter={yTickFormatter}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
        />
        <ChartTooltip content={<ChartTooltipContent formatter={moneyItemFormatter} />} />
        {showLegend && <ChartLegend content={<ChartLegendContent />} />}
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stackId="stack"
            stroke={`var(--color-${s.dataKey})`}
            fill={`var(--color-${s.dataKey})`}
            fillOpacity={0.25}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export function MoneyDonut({
  data,
  height = 220,
  innerRadius = 45,
  outerRadius = 80,
  paddingAngle = 0,
}: {
  data: ReadonlyArray<DonutDatum>;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  paddingAngle?: number;
}) {
  const config: ChartConfig = Object.fromEntries(
    data.map((d) => [d.name, { label: d.name, color: d.color }]),
  );
  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
      <PieChart>
        <ChartTooltip
          content={<ChartTooltipContent nameKey="name" hideLabel formatter={moneyItemFormatter} />}
        />
        <Pie
          data={data as DonutDatum[]}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={outerRadius}
          innerRadius={innerRadius}
          paddingAngle={paddingAngle}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
