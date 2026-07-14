import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Empty, LoadingPlaceholder, PageHeader, StatCard } from "~/components/ui";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { MoneyBarChart, MoneyDonut } from "~/components/charts";
import { getBudgetYear } from "~/features/budget/server";
import { useDashboard } from "~/lib/dashboard-context";
import { useQuery } from "~/lib/query";
import { formatNOK } from "~/lib/utils";

export function YearlyBudgetPage() {
  const { id: dashboardId } = useDashboard();
  const [year, setYear] = React.useState(() => new Date().getFullYear());
  const [expenseView, setExpenseView] = React.useState<"expected" | "actual">("actual");
  const { data, isInitialLoading } = useQuery({
    key: ["budget-year", dashboardId, year],
    fn: () => getBudgetYear({ data: { dashboardId, year } }),
  });
  if (isInitialLoading || !data) return <LoadingPlaceholder />;
  const totals = data.reduce(
    (sum, period) => ({
      incomeBudget: sum.incomeBudget + period.incomeBudget,
      incomeActual: sum.incomeActual + period.incomeActual,
      expenseBudget: sum.expenseBudget + period.expenseBudget,
      expenseActual: sum.expenseActual + period.expenseActual,
    }),
    { incomeBudget: 0, incomeActual: 0, expenseBudget: 0, expenseActual: 0 },
  );
  const expenseColors = new Map<string, string>();
  for (const period of data) {
    for (const group of period.expenseGroups) expenseColors.set(group.name, group.color);
  }
  const expenseNames = Array.from(expenseColors.keys());
  const expenseSeries = expenseNames.map((name, index) => ({
    dataKey: `expense-${index}`,
    name,
    color: expenseColors.get(name) ?? "#6366f1",
    stackId: "expenses",
  }));
  const chartData = data.map((period) => ({
    label: new Intl.DateTimeFormat("nb-NO", { month: "short" }).format(
      new Date(`${period.endDate}T00:00:00`),
    ),
    ...Object.fromEntries(
      expenseNames.map((name, index) => [
        `expense-${index}`,
        period.expenseGroups.find((group) => group.name === name)?.[expenseView] ?? 0,
      ]),
    ),
  }));
  const annualExpenses = expenseNames
    .map((name) => ({
      name,
      value: data.reduce(
        (sum, period) =>
          sum + (period.expenseGroups.find((group) => group.name === name)?.[expenseView] ?? 0),
        0,
      ),
      color: expenseColors.get(name) ?? "#6366f1",
    }))
    .filter((group) => group.value > 0);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Årsoversikt"
        subtitle={`Budsjettperioder som slutter i ${year}`}
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
        <Empty title="Ingen budsjettperioder" description={`Ingen perioder slutter i ${year}.`} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Faktiske utgifter" value={totals.expenseActual} tone="warn" />
            <StatCard label="Forventede utgifter" value={totals.expenseBudget} />
            <StatCard
              label="Avvik mot budsjett"
              value={totals.expenseBudget - totals.expenseActual}
              tone={totals.expenseBudget - totals.expenseActual >= 0 ? "positive" : "negative"}
              hint={
                totals.expenseBudget - totals.expenseActual >= 0
                  ? "Under budsjett"
                  : "Over budsjett"
              }
            />
          </div>
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold tracking-tight">Utgifter gjennom året</h2>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-muted-foreground text-sm">Vis beløp:</span>
              <ToggleGroup
                variant="outline"
                size="lg"
                spacing={0}
                value={[expenseView]}
                onValueChange={(value) => {
                  const selected = value[0];
                  if (selected === "expected" || selected === "actual") setExpenseView(selected);
                }}
                aria-label="Velg beløpstype"
              >
                <ToggleGroupItem value="expected">Forventet</ToggleGroupItem>
                <ToggleGroupItem value="actual">Faktisk</ToggleGroupItem>
              </ToggleGroup>
            </div>
          </section>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Utgifter per måned</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyBarChart data={chartData} xKey="label" series={expenseSeries} height={280} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Utgifter per gruppe</CardTitle>
              </CardHeader>
              <CardContent>
                <MoneyDonut data={annualExpenses} height={280} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Utgifter per måned og gruppe</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Måned</TableHead>
                    {expenseNames.map((name) => (
                      <TableHead key={name} className="text-right whitespace-nowrap">
                        {name}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Totalt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((period) => {
                    const total = period.expenseGroups.reduce(
                      (sum, group) => sum + group[expenseView],
                      0,
                    );
                    return (
                      <TableRow key={period.id}>
                        <TableCell>{formatBudgetMonth(period.endDate)}</TableCell>
                        {expenseNames.map((name) => (
                          <TableCell key={name} className="text-right tabular-nums">
                            {formatNOK(
                              period.expenseGroups.find((group) => group.name === name)?.[
                                expenseView
                              ] ?? 0,
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatNOK(total)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="font-semibold">Totalt</TableCell>
                    {expenseNames.map((name) => (
                      <TableCell key={name} className="text-right font-semibold tabular-nums">
                        {formatNOK(
                          data.reduce(
                            (sum, period) =>
                              sum +
                              (period.expenseGroups.find((group) => group.name === name)?.[
                                expenseView
                              ] ?? 0),
                            0,
                          ),
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNOK(
                        data.reduce(
                          (sum, period) =>
                            sum +
                            period.expenseGroups.reduce(
                              (groupSum, group) => groupSum + group[expenseView],
                              0,
                            ),
                          0,
                        ),
                      )}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function formatBudgetMonth(endDate: string) {
  return new Intl.DateTimeFormat("nb-NO", { month: "long" }).format(
    new Date(`${endDate}T00:00:00`),
  );
}
