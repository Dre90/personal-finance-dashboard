import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LoadingPlaceholder, PageHeader, StatCard } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { MoneyBarChart, MoneyLineChart } from "../../components/charts";
import { getBudgetYear } from "~/features/budget/server";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/budget_/yearly")({
  component: YearlyBudgetPage,
});

function YearlyBudgetPage() {
  const { id: dashboardId } = useDashboard();
  const [year, setYear] = React.useState<number>(() => new Date().getFullYear());

  const { data, isInitialLoading } = useQuery({
    key: ["budget-year", dashboardId, year],
    fn: () => getBudgetYear({ data: { dashboardId, year } }),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const months = monthsInYear(year);
  const catKind = new Map(data.categories.map((c) => [c.id, c.kind]));

  const perMonth = months.map((ym) => {
    let incomeB = 0,
      incomeA = 0,
      expB = 0,
      expA = 0;
    for (const e of data.entries) {
      if (e.yearMonth !== ym) continue;
      const k = catKind.get(e.categoryId);
      if (k === "income") {
        incomeB += toNumber(e.budgeted);
        incomeA += toNumber(e.actual);
      } else if (k === "expense") {
        expB += toNumber(e.budgeted);
        expA += toNumber(e.actual);
      }
    }
    return {
      month: shortMonthLabel(ym),
      yearMonth: ym,
      incomeB,
      incomeA,
      expB,
      expA,
      savingsB: incomeB - expB,
      savingsA: incomeA - expA,
    };
  });

  const totals = perMonth.reduce(
    (acc, m) => ({
      incomeB: acc.incomeB + m.incomeB,
      incomeA: acc.incomeA + m.incomeA,
      expB: acc.expB + m.expB,
      expA: acc.expA + m.expA,
    }),
    { incomeB: 0, incomeA: 0, expB: 0, expA: 0 },
  );

  const savings = totals.incomeA - totals.expA;
  const savingsRate = totals.incomeA > 0 ? (savings / totals.incomeA) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Årsoversikt"
        subtitle={`Budsjett ${year}`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </Button>
            <Input
              type="number"
              value={year}
              onChange={(e) =>
                setYear(parseInt(e.target.value || `${new Date().getFullYear()}`, 10))
              }
              className="w-24 text-center tabular-nums"
            />
            <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Inntekt (faktisk)" value={totals.incomeA} tone="positive" />
        <StatCard label="Utgift (faktisk)" value={totals.expA} tone="warn" />
        <StatCard
          label="Sparing (faktisk)"
          value={savings}
          tone={savings >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Sparerate" value={`${savingsRate.toFixed(1)} %`} isCurrency={false} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Inntekt vs utgift per måned (faktisk)</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyBarChart
            data={perMonth}
            xKey="month"
            height={320}
            series={[
              { dataKey: "incomeA", name: "Inntekt", color: FLOW_COLORS.income },
              { dataKey: "expA", name: "Utgift", color: FLOW_COLORS.expense },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sparing per måned</CardTitle>
        </CardHeader>
        <CardContent>
          <MoneyLineChart
            data={perMonth}
            xKey="month"
            showLegend
            series={[
              {
                dataKey: "savingsB",
                name: "Budsjett",
                color: FLOW_COLORS.budgeted,
                strokeDasharray: "4 4",
                dot: false,
              },
              {
                dataKey: "savingsA",
                name: "Faktisk",
                color: FLOW_COLORS.savings,
                strokeWidth: 2.5,
                dot: { r: 3 },
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabell</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Måned</TableHead>
                <TableHead className="text-right">Inntekt</TableHead>
                <TableHead className="text-right">Utgift</TableHead>
                <TableHead className="text-right">Sparing</TableHead>
                <TableHead className="text-right">Sparerate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perMonth.map((m) => (
                <TableRow key={m.yearMonth}>
                  <TableCell>{m.month}</TableCell>
                  <TableCell className="text-success text-right tabular-nums">
                    {formatNOK(m.incomeA)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatNOK(m.expA)}</TableCell>
                  <TableCell
                    className={
                      m.savingsA < 0
                        ? "text-destructive text-right tabular-nums"
                        : "text-success text-right tabular-nums"
                    }
                  >
                    {formatNOK(m.savingsA)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right tabular-nums">
                    {m.incomeA > 0 ? `${((m.savingsA / m.incomeA) * 100).toFixed(0)} %` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Sum</TableCell>
                <TableCell className="text-success text-right tabular-nums">
                  {formatNOK(totals.incomeA)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNOK(totals.expA)}</TableCell>
                <TableCell
                  className={
                    savings < 0
                      ? "text-destructive text-right tabular-nums"
                      : "text-success text-right tabular-nums"
                  }
                >
                  {formatNOK(savings)}
                </TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {totals.incomeA > 0 ? `${savingsRate.toFixed(0)} %` : "—"}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
