import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Empty, LoadingPlaceholder, PageHeader, StatCard } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { MoneyBarChart } from "../../components/charts";
import { getBudgetYear } from "~/features/budget/server";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export function RecapPage() {
  const { id: dashboardId } = useDashboard();
  const [year, setYear] = React.useState<number>(() => new Date().getFullYear() - 1);

  const { data, isInitialLoading } = useQuery({
    key: ["budget-year", dashboardId, year],
    fn: () => getBudgetYear({ data: { dashboardId, year } }),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const months = monthsInYear(year);
  const catMap = new Map(data.categories.map((c) => [c.id, c]));

  let incomeTotal = 0;
  let expenseTotal = 0;
  const monthData = months.map((ym) => {
    let income = 0,
      expense = 0;
    for (const e of data.entries) {
      if (e.yearMonth !== ym) continue;
      const c = catMap.get(e.categoryId);
      if (!c) continue;
      if (c.kind === "income") income += toNumber(e.actual);
      else if (c.kind === "expense") expense += toNumber(e.actual);
    }
    incomeTotal += income;
    expenseTotal += expense;
    return { month: shortMonthLabel(ym), income, expense, savings: income - expense };
  });

  const expenseByCategory = new Map<string, number>();
  for (const e of data.entries) {
    const c = catMap.get(e.categoryId);
    if (!c || c.kind !== "expense") continue;
    expenseByCategory.set(c.name, (expenseByCategory.get(c.name) ?? 0) + toNumber(e.actual));
  }
  const topExpenses = Array.from(expenseByCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const savings = incomeTotal - expenseTotal;
  const savingsRate = incomeTotal > 0 ? (savings / incomeTotal) * 100 : 0;
  const bestMonth = [...monthData].sort((a, b) => b.savings - a.savings)[0];
  const worstMonth = [...monthData].sort((a, b) => a.savings - b.savings)[0];
  const hasData = data.entries.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Årsrecap"
        subtitle={`Oppsummering ${year}`}
        actions={
          <>
            <Button variant="outline" size="icon" onClick={() => setYear(year - 1)}>
              <ChevronLeft />
            </Button>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="w-24 text-center tabular-nums"
            />
            <Button variant="outline" size="icon" onClick={() => setYear(year + 1)}>
              <ChevronRight />
            </Button>
          </>
        }
      />

      {!hasData ? (
        <Empty
          title={`Ingen budsjettdata for ${year}`}
          description="Velg et annet år, eller legg inn budsjett først."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total inntekt" value={incomeTotal} tone="positive" />
            <StatCard label="Total utgift" value={expenseTotal} tone="warn" />
            <StatCard
              label="Total sparing"
              value={savings}
              tone={savings >= 0 ? "positive" : "negative"}
            />
            <StatCard label="Sparerate" value={`${savingsRate.toFixed(1)} %`} isCurrency={false} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Beste måned</CardTitle>
              </CardHeader>
              <CardContent>
                {bestMonth ? (
                  <>
                    <div className="text-3xl font-semibold">{bestMonth.month}</div>
                    <div className="text-muted-foreground mt-1 text-sm">
                      Sparte{" "}
                      <span className="text-success tabular-nums">
                        {formatNOK(bestMonth.savings)}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm">—</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Tøffeste måned</CardTitle>
              </CardHeader>
              <CardContent>
                {worstMonth ? (
                  <>
                    <div className="text-3xl font-semibold">{worstMonth.month}</div>
                    <div className="text-muted-foreground mt-1 text-sm">
                      {worstMonth.savings < 0 ? "Brukte" : "Sparte"}{" "}
                      <span
                        className={
                          worstMonth.savings < 0
                            ? "text-destructive tabular-nums"
                            : "text-success tabular-nums"
                        }
                      >
                        {formatNOK(Math.abs(worstMonth.savings))}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Per måned</CardTitle>
            </CardHeader>
            <CardContent>
              <MoneyBarChart
                data={monthData}
                xKey="month"
                height={320}
                series={[
                  { dataKey: "income", name: "Inntekt", color: FLOW_COLORS.income },
                  { dataKey: "expense", name: "Utgift", color: FLOW_COLORS.expense },
                  { dataKey: "savings", name: "Sparing", color: FLOW_COLORS.savings },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Største utgiftsposter</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Totalt</TableHead>
                    <TableHead className="text-right">Snitt/mnd</TableHead>
                    <TableHead className="text-right">Andel</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topExpenses.map((c) => (
                    <TableRow key={c.name}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNOK(c.value)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {formatNOK(c.value / 12)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {expenseTotal > 0
                          ? `${((c.value / expenseTotal) * 100).toFixed(1)} %`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
