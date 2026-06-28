import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, StatCard, Empty } from "../../components/ui";
import { getBudgetYear } from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/recap")({
  component: RecapPage,
});

function RecapPage() {
  const dashboardId = useDashboardId();
  const [year, setYear] = React.useState<number>(() => new Date().getFullYear() - 1);

  const { data, loading } = useServerData(
    async () => (dashboardId ? getBudgetYear({ data: { dashboardId, year } }) : Promise.resolve(null)),
    [dashboardId, year],
  );

  if (loading || !data) return <div className="text-[color:var(--color-muted)]">Laster…</div>;

  const months = monthsInYear(year);
  const catMap = new Map(data.categories.map((c) => [c.id, c]));

  let incomeTotal = 0, expenseTotal = 0;
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

  // Top expense categories
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
            <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="input w-28 text-center num" />
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
                  <div className="text-sm text-[color:var(--color-muted)] mt-1">
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
                  <div className="text-sm text-[color:var(--color-muted)] mt-1">
                    {worstMonth.savings < 0 ? "Brukte" : "Sparte"} <span className={`num ${worstMonth.savings < 0 ? "neg" : "pos"}`}>{formatNOK(Math.abs(worstMonth.savings))}</span>
                  </div>
                </>
              ) : <p className="text-sm">—</p>}
            </div>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Per måned</h3>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={monthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
                <XAxis dataKey="month" stroke="#9aa6c7" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9aa6c7" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNOK(v)} />
                <Tooltip contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }} formatter={(v: any) => formatNOK(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income" name="Inntekt" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Utgift" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="savings" name="Sparing" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 className="font-semibold mb-3">Største utgiftsposter</h3>
            <table className="table">
              <thead><tr><th>Kategori</th><th className="text-right">Totalt</th><th className="text-right">Snitt/mnd</th><th className="text-right">Andel</th></tr></thead>
              <tbody>
                {topExpenses.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="text-right num">{formatNOK(c.value)}</td>
                    <td className="text-right num text-[color:var(--color-muted)]">{formatNOK(c.value / 12)}</td>
                    <td className="text-right num text-[color:var(--color-muted)]">{expenseTotal > 0 ? `${((c.value / expenseTotal) * 100).toFixed(1)} %` : "—"}</td>
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
