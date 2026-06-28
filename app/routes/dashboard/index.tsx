import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  AreaChart,
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard, Empty, ProgressBar } from "../../components/ui";
import { getDashboardSummary } from "../../server/api";
import { useServerData, useDashboardId } from "../../lib/hooks";
import { formatNOK, monthLabel } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const dashboardId = useDashboardId();
  const { data, loading } = useServerData(
    async () => (dashboardId ? getDashboardSummary({ data: { dashboardId } }) : Promise.resolve(null)),
    [dashboardId],
  );

  if (loading) return <div className="text-[color:var(--color-muted)]">Laster…</div>;
  if (!data) {
    return (
      <Empty
        title="Dashboardet er tomt"
        description="Legg inn budsjett, formue og lån for å se en oversikt."
        action={
          <Link to="/dashboard/budget" className="btn btn-primary">Start med budsjett</Link>
        }
      />
    );
  }

  const cur = data.cashFlow[data.currentMonth];
  const prev = data.cashFlow[data.previousMonth];

  const allocationData = [
    ...data.assets
      .filter((a) => a.currentValue > 0)
      .map((a) => ({ name: a.name, value: a.currentValue, color: kindColor(a.kind) })),
  ];

  const sinkingData = data.sinkingFunds
    .filter((f) => Number(f.currentAmount) > 0 || Number(f.target) > 0)
    .map((f) => ({ name: f.name, current: Number(f.currentAmount), target: Number(f.target), color: f.color }));

  return (
    <div className="space-y-6">
      <PageHeader title="Oversikt" subtitle={`Stilling per i dag · ${monthLabel(data.currentMonth)}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Netto formue" value={data.netWorth} tone={data.netWorth >= 0 ? "positive" : "negative"} />
        <StatCard label="Totale eiendeler" value={data.totalAssets} />
        <StatCard label="Total gjeld" value={data.totalDebt} tone="warn" />
        <StatCard label="Sinking funds" value={data.totalSinking} hint={`av ${formatNOK(data.totalSinkingTarget)} mål`} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Kontantstrøm</h3>
            <span className="badge">{monthLabel(data.currentMonth)} vs forrige måned</span>
          </div>
          {cur && prev ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={[
                  { label: "Inntekt (budsjett)", inneværende: cur.incomeBudget, forrige: prev.incomeBudget },
                  { label: "Inntekt (faktisk)", inneværende: cur.incomeActual, forrige: prev.incomeActual },
                  { label: "Utgift (budsjett)", inneværende: cur.expenseBudget, forrige: prev.expenseBudget },
                  { label: "Utgift (faktisk)", inneværende: cur.expenseActual, forrige: prev.expenseActual },
                ]}
                margin={{ top: 5, right: 10, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
                <XAxis dataKey="label" stroke="#9aa6c7" tick={{ fontSize: 11 }} />
                <YAxis stroke="#9aa6c7" tick={{ fontSize: 11 }} tickFormatter={(v) => formatNOK(v)} />
                <Tooltip
                  contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }}
                  formatter={(v: any) => formatNOK(v)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="forrige" name="Forrige" fill="#475569" radius={[4, 4, 0, 0]} />
                <Bar dataKey="inneværende" name="Denne måneden" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[color:var(--color-muted)]">Ingen budsjettdata enda.</p>
          )}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="card-soft">
              <div className="text-xs uppercase text-[color:var(--color-muted)]">Sparing nå</div>
              <div className="text-xl font-semibold num mt-1">{formatNOK((cur?.incomeActual ?? 0) - (cur?.expenseActual ?? 0))}</div>
            </div>
            <div className="card-soft">
              <div className="text-xs uppercase text-[color:var(--color-muted)]">Sparing forrige</div>
              <div className="text-xl font-semibold num mt-1">{formatNOK((prev?.incomeActual ?? 0) - (prev?.expenseActual ?? 0))}</div>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Formuesfordeling</h3>
          {allocationData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={allocationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45} paddingAngle={2}>
                  {allocationData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }}
                  formatter={(v: any) => formatNOK(v)}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-[color:var(--color-muted)]">Legg til eiendeler for å se fordeling.</p>
          )}
          <div className="mt-3 space-y-1.5">
            {allocationData.map((a) => (
              <div key={a.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                <span className="flex-1 truncate text-[color:var(--color-muted)]">{a.name}</span>
                <span className="num">{formatNOK(a.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-4">Sinking funds</h3>
          {sinkingData.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">Ingen sinking funds. <Link to="/dashboard/sinking-funds" className="text-indigo-400 hover:underline">Legg til</Link></p>
          ) : (
            <div className="space-y-3">
              {sinkingData.map((f) => (
                <div key={f.name}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{f.name}</span>
                    <span className="num text-[color:var(--color-muted)]">{formatNOK(f.current)} / {formatNOK(f.target)}</span>
                  </div>
                  <ProgressBar value={f.current} max={f.target || 1} color={f.color} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Lån</h3>
          {data.loans.length === 0 ? (
            <p className="text-sm text-[color:var(--color-muted)]">Ingen lån registrert. <Link to="/dashboard/loans" className="text-indigo-400 hover:underline">Legg til</Link></p>
          ) : (
            <div className="space-y-3">
              {data.loans.map((l) => (
                <div key={l.id} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">Rente {Number(l.interestRate).toFixed(2)} % · Mnd. {formatNOK(l.monthlyPayment)}</div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{formatNOK(l.currentBalance)}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">av {formatNOK(l.originalPrincipal)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function kindColor(kind: string) {
  switch (kind) {
    case "ask": return "#6366f1";
    case "pension": return "#10b981";
    case "cash": return "#f59e0b";
    default: return "#8b5cf6";
  }
}
