import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { LoadingPlaceholder, PageHeader, StatCard } from "../../components/ui";
import { MoneyBarChart, MoneyLineChart } from "../../components/charts";
import { getBudgetYear } from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/budget/yearly")({
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
    let incomeB = 0, incomeA = 0, expB = 0, expA = 0;
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
      incomeB, incomeA, expB, expA,
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
            <button onClick={() => setYear(year - 1)} className="btn btn-ghost">←</button>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value || `${new Date().getFullYear()}`, 10))}
              className="input w-28 text-center num"
            />
            <button onClick={() => setYear(year + 1)} className="btn btn-ghost">→</button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Inntekt (faktisk)" value={totals.incomeA} tone="positive" />
        <StatCard label="Utgift (faktisk)" value={totals.expA} tone="warn" />
        <StatCard label="Sparing (faktisk)" value={savings} tone={savings >= 0 ? "positive" : "negative"} />
        <StatCard label="Sparerate" value={`${savingsRate.toFixed(1)} %`} isCurrency={false} />
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Inntekt vs utgift per måned (faktisk)</h3>
        <MoneyBarChart
          data={perMonth}
          xKey="month"
          height={320}
          series={[
            { dataKey: "incomeA", name: "Inntekt", color: FLOW_COLORS.income },
            { dataKey: "expA", name: "Utgift", color: FLOW_COLORS.expense },
          ]}
        />
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Sparing per måned</h3>
        <MoneyLineChart
          data={perMonth}
          xKey="month"
          showLegend
          series={[
            { dataKey: "savingsB", name: "Budsjett", color: FLOW_COLORS.budgeted, strokeDasharray: "4 4", dot: false },
            { dataKey: "savingsA", name: "Faktisk", color: FLOW_COLORS.savings, strokeWidth: 2.5, dot: { r: 3 } },
          ]}
        />
      </div>

      <div className="card overflow-x-auto">
        <h3 className="font-semibold mb-3">Tabell</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Måned</th>
              <th className="text-right">Inntekt</th>
              <th className="text-right">Utgift</th>
              <th className="text-right">Sparing</th>
              <th className="text-right">Sparerate</th>
            </tr>
          </thead>
          <tbody>
            {perMonth.map((m) => (
              <tr key={m.yearMonth}>
                <td>{m.month}</td>
                <td className="text-right num pos">{formatNOK(m.incomeA)}</td>
                <td className="text-right num">{formatNOK(m.expA)}</td>
                <td className={`text-right num ${m.savingsA < 0 ? "neg" : "pos"}`}>{formatNOK(m.savingsA)}</td>
                <td className="text-right num text-muted">
                  {m.incomeA > 0 ? `${((m.savingsA / m.incomeA) * 100).toFixed(0)} %` : "—"}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Sum</td>
              <td className="text-right num pos">{formatNOK(totals.incomeA)}</td>
              <td className="text-right num">{formatNOK(totals.expA)}</td>
              <td className={`text-right num ${savings < 0 ? "neg" : "pos"}`}>{formatNOK(savings)}</td>
              <td className="text-right num text-muted">
                {totals.incomeA > 0 ? `${savingsRate.toFixed(0)} %` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
