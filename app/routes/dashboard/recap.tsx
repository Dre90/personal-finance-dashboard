import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Empty, LoadingPlaceholder, PageHeader, StatCard } from "../../components/ui";
import { MoneyBarChart } from "../../components/charts";
import { getBudgetYear } from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/recap")({
  component: RecapPage,
});

function RecapPage() {
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
    let income = 0, expense = 0;
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
            <button onClick={() => setYear(year - 1)} className="btn btn-ghost">←</button>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="input w-28 text-center num"
            />
            <button onClick={() => setYear(year + 1)} className="btn btn-ghost">→</button>
          </>
        }
      />

      {!hasData ? (
        <Empty title={`Ingen budsjettdata for ${year}`} description="Velg et annet år, eller legg inn budsjett først." />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total inntekt" value={incomeTotal} tone="positive" />
            <StatCard label="Total utgift" value={expenseTotal} tone="warn" />
            <StatCard label="Total sparing" value={savings} tone={savings >= 0 ? "positive" : "negative"} />
            <StatCard label="Sparerate" value={`${savingsRate.toFixed(1)} %`} isCurrency={false} />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card">
              <h3 className="font-semibold mb-3">Beste måned</h3>
              {bestMonth ? (
                <>
                  <div className="text-3xl font-semibold">{bestMonth.month}</div>
                  <div className="text-sm text-muted mt-1">
                    Sparte <span className="pos num">{formatNOK(bestMonth.savings)}</span>
                  </div>
                </>
              ) : <p className="text-sm">—</p>}
            </div>
            <div className="card">
              <h3 className="font-semibold mb-3">Tøffeste måned</h3>
              {worstMonth ? (
                <>
                  <div className="text-3xl font-semibold">{worstMonth.month}</div>
                  <div className="text-sm text-muted mt-1">
                    {worstMonth.savings < 0 ? "Brukte" : "Sparte"}{" "}
                    <span className={`num ${worstMonth.savings < 0 ? "neg" : "pos"}`}>
                      {formatNOK(Math.abs(worstMonth.savings))}
                    </span>
                  </div>
                </>
              ) : <p className="text-sm">—</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Per måned</h3>
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
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Største utgiftsposter</h3>
            <table className="table">
              <thead>
                <tr>
                  <th>Kategori</th>
                  <th className="text-right">Totalt</th>
                  <th className="text-right">Snitt/mnd</th>
                  <th className="text-right">Andel</th>
                </tr>
              </thead>
              <tbody>
                {topExpenses.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="text-right num">{formatNOK(c.value)}</td>
                    <td className="text-right num text-muted">{formatNOK(c.value / 12)}</td>
                    <td className="text-right num text-muted">
                      {expenseTotal > 0 ? `${((c.value / expenseTotal) * 100).toFixed(1)} %` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
