import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard } from "../../components/ui";
import { getBudgetYear } from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { formatNOK, monthsInYear, shortMonthLabel, toNumber } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/budget/yearly")({
  component: YearlyBudgetPage,
});

function YearlyBudgetPage() {
  const dashboardId = useDashboardId();
  const [year, setYear] = React.useState<number>(() => new Date().getFullYear());

  const { data, loading } = useServerData(
    async () => dashboardId ? getBudgetYear({ data: { dashboardId, year } }) : Promise.resolve(null),
    [dashboardId, year],
  );

  if (loading || !data) return <div className="text-[color:var(--color-muted)]">Laster…</div>;

  const months = monthsInYear(year);
  const catKind = new Map(data.categories.map((c) => [c.id, c.kind]));

  // Aggregate per month
  const perMonth = months.map((ym) => {
    let incomeB = 0, incomeA = 0, expB = 0, expA = 0;
    for (const e of data.entries) {
      if (e.yearMonth !== ym) continue;
      const k = catKind.get(e.categoryId);
      if (k === "income") { incomeB += toNumber(e.budgeted); incomeA += toNumber(e.actual); }
      else if (k === "expense") { expB += toNumber(e.budgeted); expA += toNumber(e.actual); }
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
        <StatCard label="Sparing (faktisk)" value={totals.incomeA - totals.expA} tone={totals.incomeA - totals.expA >= 0 ? "positive" : "negative"} />
        <StatCard label="Sparerate" value={totals.incomeA > 0 ? `${(((totals.incomeA - totals.expA) / totals.incomeA) * 100).toFixed(1)} %` : "—"} isCurrency={false} />
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Inntekt vs utgift per måned (faktisk)</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={perMonth} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
            <XAxis dataKey="month" stroke="#9aa6c7" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9aa6c7" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNOK(v)} />
            <Tooltip
              contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }}
              formatter={(v: any) => formatNOK(v)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="incomeA" name="Inntekt" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expA" name="Utgift" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Sparing per måned</h3>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={perMonth} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
            <XAxis dataKey="month" stroke="#9aa6c7" tick={{ fontSize: 11 }} />
            <YAxis stroke="#9aa6c7" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNOK(v)} />
            <Tooltip
              contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }}
              formatter={(v: any) => formatNOK(v)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="savingsB" name="Budsjett" stroke="#475569" strokeDasharray="4 4" dot={false} />
            <Line type="monotone" dataKey="savingsA" name="Faktisk" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
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
                <td className="text-right num text-[color:var(--color-muted)]">
                  {m.incomeA > 0 ? `${((m.savingsA / m.incomeA) * 100).toFixed(0)} %` : "—"}
                </td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Sum</td>
              <td className="text-right num pos">{formatNOK(totals.incomeA)}</td>
              <td className="text-right num">{formatNOK(totals.expA)}</td>
              <td className={`text-right num ${totals.incomeA - totals.expA < 0 ? "neg" : "pos"}`}>{formatNOK(totals.incomeA - totals.expA)}</td>
              <td className="text-right num text-[color:var(--color-muted)]">
                {totals.incomeA > 0 ? `${(((totals.incomeA - totals.expA) / totals.incomeA) * 100).toFixed(0)} %` : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
