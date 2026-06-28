/**
 * Centralised Recharts wrappers. Every chart in the app shares the same
 * dark-theme axis styling, money formatter, and tooltip — having these
 * inline in every page was the biggest source of repetition.
 *
 * Components are intentionally thin: they pass-through Recharts props so
 * page-level customisation (e.g. extra <Bar>s, custom dataKeys) is still
 * possible without rewriting them.
 */
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { formatNOK } from "../lib/utils";

const AXIS_COLOR = "var(--color-muted)";
const GRID_COLOR = "var(--color-border)";
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};
const LEGEND_STYLE: React.CSSProperties = { fontSize: 12 };

interface ChartFrameProps {
  height?: number;
  children: React.ReactElement;
}

function ChartFrame({ height = 260, children }: ChartFrameProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      {children}
    </ResponsiveContainer>
  );
}

interface AxisChildrenProps {
  /** dataKey for XAxis */
  xKey: string;
  /** Tick formatter — defaults to NOK. */
  yFormatter?: (v: number) => string;
  /** Width reserved for Y axis labels. */
  yWidth?: number;
}

/** Renders the standard X + Y axis pair with our theming. */
export function MoneyAxes({
  xKey,
  yFormatter = (v) => formatNOK(v),
  yWidth,
}: AxisChildrenProps) {
  return (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
      <XAxis dataKey={xKey} stroke={AXIS_COLOR} tick={{ fontSize: 11 }} />
      <YAxis
        stroke={AXIS_COLOR}
        tick={{ fontSize: 11 }}
        tickFormatter={yFormatter}
        width={yWidth}
      />
    </>
  );
}

/** Tooltip that formats values as NOK. Pass a custom `formatter` to override. */
export function MoneyTooltip(props: Partial<TooltipProps<number, string>> = {}) {
  // Recharts' Tooltip uses internal ValueType/NameType generics that don't
  // infer from props, so we untype the wrapper to keep the call site clean.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TT = Tooltip as any;
  return (
    <TT
      contentStyle={TOOLTIP_STYLE}
      formatter={(v: unknown) => formatNOK(Number(v))}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// High-level convenience charts
// ---------------------------------------------------------------------------

export interface MoneyBarSeries {
  dataKey: string;
  name: string;
  color: string;
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
    <ChartFrame height={height}>
      <BarChart data={data as T[]} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <MoneyAxes xKey={xKey} />
        <MoneyTooltip />
        {showLegend && <Legend wrapperStyle={LEGEND_STYLE} />}
        {series.map((s) => (
          <Bar
            key={s.dataKey}
            dataKey={s.dataKey}
            name={s.name}
            fill={s.color}
            radius={[4, 4, 0, 0]}
          />
        ))}
      </BarChart>
    </ChartFrame>
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
    <ChartFrame height={height}>
      <LineChart data={data as T[]} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <MoneyAxes xKey={xKey} yWidth={yWidth} />
        <MoneyTooltip />
        {showLegend && <Legend wrapperStyle={LEGEND_STYLE} />}
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
            strokeDasharray={s.strokeDasharray}
            dot={s.dot ?? { r: 2 }}
          />
        ))}
      </LineChart>
    </ChartFrame>
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
  return (
    <ChartFrame height={height}>
      <PieChart>
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
        <MoneyTooltip />
      </PieChart>
    </ChartFrame>
  );
}
