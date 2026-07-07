import { createFileRoute, Link } from "@tanstack/react-router";
import { Empty, LoadingPlaceholder, PageHeader, ProgressBar, StatCard } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { MoneyBarChart, MoneyDonut } from "../../components/charts";
import { getDashboardSummary } from "~/features/dashboard/server";
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
        action={
          <Button nativeButton={false} render={<Link to="/dashboard/budget" />}>
            Start med budsjett
          </Button>
        }
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

  const cashFlowData =
    cur && prev
      ? [
          {
            label: "Inntekt (budsjett)",
            inneværende: cur.incomeBudget,
            forrige: prev.incomeBudget,
          },
          { label: "Inntekt (faktisk)", inneværende: cur.incomeActual, forrige: prev.incomeActual },
          {
            label: "Utgift (budsjett)",
            inneværende: cur.expenseBudget,
            forrige: prev.expenseBudget,
          },
          {
            label: "Utgift (faktisk)",
            inneværende: cur.expenseActual,
            forrige: prev.expenseActual,
          },
        ]
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oversikt"
        subtitle={`Stilling per i dag · ${monthLabel(data.currentMonth)}`}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Netto formue"
          value={data.netWorth}
          tone={data.netWorth >= 0 ? "positive" : "negative"}
        />
        <StatCard label="Totale eiendeler" value={data.totalAssets} />
        <StatCard label="Total gjeld" value={data.totalDebt} tone="warn" />
        <StatCard
          label="Sinking funds"
          value={data.totalSinking}
          hint={`av ${formatNOK(data.totalSinkingTarget)} mål`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Kontantstrøm</CardTitle>
            <CardAction>
              <Badge variant="secondary">{monthLabel(data.currentMonth)} vs forrige måned</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
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
              <p className="text-muted-foreground text-sm">Ingen budsjettdata enda.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-4">
              <SoftStat
                label="Sparing nå"
                value={(cur?.incomeActual ?? 0) - (cur?.expenseActual ?? 0)}
              />
              <SoftStat
                label="Sparing forrige"
                value={(prev?.incomeActual ?? 0) - (prev?.expenseActual ?? 0)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Formuesfordeling</CardTitle>
          </CardHeader>
          <CardContent>
            {allocation.length > 0 ? (
              <MoneyDonut data={allocation} paddingAngle={2} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Legg til eiendeler for å se fordeling.
              </p>
            )}
            <div className="mt-3 space-y-1.5">
              {allocation.map((a) => (
                <div key={a.name} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 rounded-full" style={{ background: a.color }} />
                  <span className="text-muted-foreground flex-1 truncate">{a.name}</span>
                  <span className="tabular-nums">{formatNOK(a.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Sinking funds</CardTitle>
          </CardHeader>
          <CardContent>
            {sinkingData.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ingen sinking funds.{" "}
                <Link to="/dashboard/sinking-funds" className="text-primary hover:underline">
                  Legg til
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                {sinkingData.map((f) => (
                  <div key={f.id}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span>{f.name}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatNOK(f.current)} / {formatNOK(f.target)}
                      </span>
                    </div>
                    <ProgressBar value={f.current} max={f.target || 1} color={f.color} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lån</CardTitle>
          </CardHeader>
          <CardContent>
            {data.loans.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Ingen lån registrert.{" "}
                <Link to="/dashboard/loans" className="text-primary hover:underline">
                  Legg til
                </Link>
              </p>
            ) : (
              <div className="space-y-3">
                {data.loans.map((l) => (
                  <div key={l.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{l.name}</div>
                      <div className="text-muted-foreground text-xs">
                        Rente {Number(l.interestRate).toFixed(2)} % · Mnd.{" "}
                        {formatNOK(l.monthlyPayment)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">
                        {formatNOK(l.currentBalance)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        av {formatNOK(l.originalPrincipal)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SoftStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-muted/40 rounded-lg border p-3">
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{formatNOK(value)}</div>
    </div>
  );
}
