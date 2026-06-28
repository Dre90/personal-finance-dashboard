import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, LoadingPlaceholder, PageHeader, ProgressBar, StatCard } from "../../components/ui";
import { MoneyBarChart, MoneyDonut } from "../../components/charts";
import { getDashboardSummary } from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { ASSET_KIND_COLOR, FLOW_COLORS } from "../../lib/colors";
import { formatNOK, monthLabel } from "../../lib/utils";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardHome,
});

function DashboardHome() {
  const { id } = useDashboard();
  const { data, isInitialLoading } = useQuery({
    key: ["summary", id],
    fn: () => getDashboardSummary({ data: { dashboardId: id } }),
  });

  if (isInitialLoading) return <LoadingPlaceholder />;
  if (!data) {
    return (
      <Empty
        title="Dashboardet er tomt"
        description="Legg inn budsjett, formue og lån for å se en oversikt."
        action={<Link to="/dashboard/budget" className="btn btn-primary">Start med budsjett</Link>}
      />
    );
  }

  const cur = data.cashFlow[data.currentMonth];
  const prev = data.cashFlow[data.previousMonth];

  const allocation = data.assets
    .filter((a) => a.currentValue > 0)
    .map((a) => ({
      name: a.name,
      value: a.currentValue,
      color: ASSET_KIND_COLOR[a.kind as keyof typeof ASSET_KIND_COLOR] ?? "#8b5cf6",
    }));

  const sinkingData = data.sinkingFunds
    .filter((f) => Number(f.currentAmount) > 0 || Number(f.target) > 0)
    .map((f) => ({
      id: f.id,
      name: f.name,
      current: Number(f.currentAmount),
      target: Number(f.target),
      color: f.color,
    }));

  const cashFlowData = cur && prev
    ? [
        { label: "Inntekt (budsjett)", inneværende: cur.incomeBudget, forrige: prev.incomeBudget },
        { label: "Inntekt (faktisk)", inneværende: cur.incomeActual, forrige: prev.incomeActual },
        { label: "Utgift (budsjett)", inneværende: cur.expenseBudget, forrige: prev.expenseBudget },
        { label: "Utgift (faktisk)", inneværende: cur.expenseActual, forrige: prev.expenseActual },
      ]
    : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Oversikt" subtitle={`Stilling per i dag · ${monthLabel(data.currentMonth)}`} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Netto formue" value={data.netWorth} tone={data.netWorth >= 0 ? "positive" : "negative"} />
        <StatCard label="Totale eiendeler" value={data.totalAssets} />
        <StatCard label="Total gjeld" value={data.totalDebt} tone="warn" />
        <StatCard
          label="Sinking funds"
          value={data.totalSinking}
          hint={`av ${formatNOK(data.totalSinkingTarget)} mål`}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Kontantstrøm</h3>
            <span className="badge">{monthLabel(data.currentMonth)} vs forrige måned</span>
          </div>
          {cashFlowData ? (
            <MoneyBarChart
              data={cashFlowData}
              xKey="label"
              series={[
                { dataKey: "forrige", name: "Forrige", color: FLOW_COLORS.budgeted },
                { dataKey: "inneværende", name: "Denne måneden", color: FLOW_COLORS.actual },
              ]}
            />
          ) : (
            <p className="text-sm text-muted">Ingen budsjettdata enda.</p>
          )}
          <div className="grid grid-cols-2 gap-4 mt-4">
            <SoftStat
              label="Sparing nå"
              value={(cur?.incomeActual ?? 0) - (cur?.expenseActual ?? 0)}
            />
            <SoftStat
              label="Sparing forrige"
              value={(prev?.incomeActual ?? 0) - (prev?.expenseActual ?? 0)}
            />
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold mb-4">Formuesfordeling</h3>
          {allocation.length > 0 ? (
            <MoneyDonut data={allocation} paddingAngle={2} />
          ) : (
            <p className="text-sm text-muted">Legg til eiendeler for å se fordeling.</p>
          )}
          <div className="mt-3 space-y-1.5">
            {allocation.map((a) => (
              <div key={a.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: a.color }} />
                <span className="flex-1 truncate text-muted">{a.name}</span>
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
            <p className="text-sm text-muted">
              Ingen sinking funds.{" "}
              <Link to="/dashboard/sinking-funds" className="text-indigo-400 hover:underline">
                Legg til
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {sinkingData.map((f) => (
                <div key={f.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{f.name}</span>
                    <span className="num text-muted">
                      {formatNOK(f.current)} / {formatNOK(f.target)}
                    </span>
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
            <p className="text-sm text-muted">
              Ingen lån registrert.{" "}
              <Link to="/dashboard/loans" className="text-indigo-400 hover:underline">
                Legg til
              </Link>
            </p>
          ) : (
            <div className="space-y-3">
              {data.loans.map((l) => (
                <div key={l.id} className="flex justify-between items-center">
                  <div>
                    <div className="font-medium">{l.name}</div>
                    <div className="text-xs text-muted">
                      Rente {Number(l.interestRate).toFixed(2)} % · Mnd. {formatNOK(l.monthlyPayment)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="num font-semibold">{formatNOK(l.currentBalance)}</div>
                    <div className="text-xs text-muted">av {formatNOK(l.originalPrincipal)}</div>
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

function SoftStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-soft">
      <div className="text-xs uppercase text-muted">{label}</div>
      <div className="text-xl font-semibold num mt-1">{formatNOK(value)}</div>
    </div>
  );
}
