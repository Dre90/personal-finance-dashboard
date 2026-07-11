import * as React from "react";
import { Field, FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { ButtonGroup } from "./ui/button-group";
import { todayISO } from "../lib/utils";

export interface ChartDateRange {
  start: string | null;
  end: string | null;
}

export type ChartPeriod = "1m" | "3m" | "6m" | "ytd" | "1y" | "all" | "custom";

const PERIODS: ReadonlyArray<{ value: ChartPeriod; label: string }> = [
  { value: "ytd", label: "I år" },
  { value: "1m", label: "1 mnd" },
  { value: "3m", label: "3 mnd" },
  { value: "6m", label: "6 mnd" },
  { value: "1y", label: "1 år" },
  { value: "all", label: "Alt" },
  { value: "custom", label: "Velg periode" },
];

function monthsAgoISO(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

function rangeForPeriod(period: Exclude<ChartPeriod, "custom">): ChartDateRange {
  if (period === "all") return { start: null, end: null };
  if (period === "ytd") {
    return { start: `${new Date().getFullYear()}-01-01`, end: todayISO() };
  }
  return {
    start: monthsAgoISO(period === "1y" ? 12 : Number.parseInt(period, 10)),
    end: todayISO(),
  };
}

export function filterByChartDateRange<T extends { snapshotDate: string }>(
  values: ReadonlyArray<T>,
  range: ChartDateRange,
) {
  return values.filter(
    (value) =>
      (range.start === null || value.snapshotDate >= range.start) &&
      (range.end === null || value.snapshotDate <= range.end),
  );
}

export function ChartPeriodSelector({
  earliestDate,
  onRangeChange,
  value,
  onValueChange,
}: {
  earliestDate?: string;
  onRangeChange: (range: ChartDateRange) => void;
  value?: ChartPeriod;
  onValueChange?: (period: ChartPeriod) => void;
}) {
  const [uncontrolledPeriod, setUncontrolledPeriod] = React.useState<ChartPeriod>("ytd");
  const period = value ?? uncontrolledPeriod;
  const [start, setStart] = React.useState(earliestDate ?? todayISO());
  const [end, setEnd] = React.useState(todayISO());

  React.useEffect(() => {
    if (period !== "custom") onRangeChange(rangeForPeriod(period));
  }, [onRangeChange, period]);

  const setPeriod = (next: ChartPeriod) => {
    if (value === undefined) setUncontrolledPeriod(next);
    onValueChange?.(next);
  };

  const setCustomStart = (next: string) => {
    setStart(next);
    onRangeChange({ start: next || null, end: end || null });
  };
  const setCustomEnd = (next: string) => {
    setEnd(next);
    onRangeChange({ start: start || null, end: next || null });
  };

  return (
    <div className="flex flex-col gap-3">
      <ButtonGroup aria-label="Velg tidsperiode for grafer" className="flex-wrap">
        {PERIODS.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="lg"
            variant={period === option.value ? "default" : "outline"}
            aria-pressed={period === option.value}
            onClick={() => {
              setPeriod(option.value);
              onRangeChange(
                option.value === "custom" ? { start, end } : rangeForPeriod(option.value),
              );
            }}
          >
            {option.label}
          </Button>
        ))}
      </ButtonGroup>

      {period === "custom" && (
        <FieldGroup className="grid max-w-2xl grid-cols-1 gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="chart-period-start">Fra dato</FieldLabel>
            <Input
              id="chart-period-start"
              type="date"
              value={start}
              max={end || undefined}
              onChange={(event) => setCustomStart(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="chart-period-end">Til dato</FieldLabel>
            <Input
              id="chart-period-end"
              type="date"
              value={end}
              min={start || undefined}
              max={todayISO()}
              onChange={(event) => setCustomEnd(event.target.value)}
            />
          </Field>
        </FieldGroup>
      )}
    </div>
  );
}
