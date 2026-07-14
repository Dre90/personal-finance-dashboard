import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Empty, LoadingPlaceholder, PageHeader, StatCard } from "~/components/ui";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { MoneyBarChart } from "~/components/charts";
import { getBudgetYear } from "~/features/budget/server";
import { useDashboard } from "~/lib/dashboard-context";
import { useQuery } from "~/lib/query";
import { FLOW_COLORS } from "~/lib/colors";
import { formatNOK } from "~/lib/utils";

export function RecapPage() {
  const { id: dashboardId } = useDashboard();
  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const { data, isInitialLoading } = useQuery({
    key: ["budget-year", dashboardId, year],
    fn: () => getBudgetYear({ data: { dashboardId, year } }),
  });
  if (isInitialLoading || !data) return <LoadingPlaceholder />;
  const totals = data.reduce(
    (sum, period) => ({
      income: sum.income + period.incomeActual,
      expense: sum.expense + period.expenseActual,
    }),
    { income: 0, expense: 0 },
  );
  const savings = totals.income - totals.expense;
  const savingRate = totals.income > 0 ? (savings / totals.income) * 100 : 0;
  const months = data.map((period) => ({
    month: new Intl.DateTimeFormat("nb-NO", { month: "short" }).format(
      new Date(`${period.endDate}T00:00:00`),
    ),
    income: period.incomeActual,
    expense: period.expenseActual,
    savings: period.incomeActual - period.expenseActual,
  }));
  const best = [...months].sort((a, b) => b.savings - a.savings)[0];
  const worst = [...months].sort((a, b) => a.savings - b.savings)[0];
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Årsrecap"
        subtitle={`Oppsummering av perioder som slutter i ${year}`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </Button>
            <Input
              type="number"
              className="w-24 text-center"
              value={year}
              onChange={(event) => setYear(Number(event.target.value) || new Date().getFullYear())}
            />
            <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </Button>
          </>
        }
      />
      {data.length === 0 ? (
        <Empty
          title={`Ingen budsjettperioder for ${year}`}
          description="Velg et annet år, eller opprett en budsjettperiode først."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total inntekt" value={totals.income} tone="positive" />
            <StatCard label="Total utgift" value={totals.expense} tone="warn" />
            <StatCard
              label="Total balanse"
              value={savings}
              tone={savings >= 0 ? "positive" : "negative"}
            />
            <StatCard label="Sparerate" value={`${savingRate.toFixed(1)} %`} isCurrency={false} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <PeriodHighlight title="Beste periode" period={best} />
            <PeriodHighlight title="Tøffeste periode" period={worst} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Faktisk kontantstrøm per periode</CardTitle>
            </CardHeader>
            <CardContent>
              <MoneyBarChart
                data={months}
                xKey="month"
                height={320}
                series={[
                  { dataKey: "income", name: "Inntekt", color: FLOW_COLORS.income },
                  { dataKey: "expense", name: "Utgift", color: FLOW_COLORS.expense },
                  { dataKey: "savings", name: "Balanse", color: FLOW_COLORS.savings },
                ]}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PeriodHighlight({
  title,
  period,
}: {
  title: string;
  period?: { month: string; savings: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {period ? (
          <>
            <div className="text-3xl font-semibold">{period.month}</div>
            <div className="text-muted-foreground mt-1 text-sm">
              Balanse{" "}
              <span
                className={
                  period.savings < 0 ? "text-destructive tabular-nums" : "text-success tabular-nums"
                }
              >
                {formatNOK(period.savings)}
              </span>
            </div>
          </>
        ) : (
          "—"
        )}
      </CardContent>
    </Card>
  );
}
