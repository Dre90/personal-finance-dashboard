import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import { LoadingPlaceholder, PageHeader } from "../../components/ui";
import { listSinkingFunds, listSinkingFundTransactions } from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { useQuery } from "../../lib/query";
import { formatNOK } from "../../lib/utils";
import type { SinkingFund, SinkingFundTransaction } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/sinking-funds_/history")({
  component: SinkingFundsHistoryPage,
});

type KindFilter = "all" | "deposit" | "withdrawal" | "adjustment" | "opening";

function SinkingFundsHistoryPage() {
  const { id: dashboardId } = useDashboard();
  const [fundFilter, setFundFilter] = React.useState<number | "all">("all");
  const [kindFilter, setKindFilter] = React.useState<KindFilter>("all");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");

  const fundsQuery = useQuery({
    key: ["sinking-funds", dashboardId],
    fn: () => listSinkingFunds({ data: { dashboardId } }),
  });

  const txnsQuery = useQuery({
    key: ["sinking-fund-txns", dashboardId, fundFilter, kindFilter, from, to],
    fn: () =>
      listSinkingFundTransactions({
        data: {
          dashboardId,
          sinkingFundId: fundFilter === "all" ? undefined : fundFilter,
          kind: kindFilter === "all" ? undefined : kindFilter,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });

  if (fundsQuery.isInitialLoading || txnsQuery.isInitialLoading) return <LoadingPlaceholder />;
  const funds = fundsQuery.data ?? [];
  const filtered = txnsQuery.data ?? [];
  const fundById = new Map(funds.map((f) => [f.id, f]));

  // Group consecutive rows sharing an allocationGroupId into visual bands.
  const groups: Array<
    | { type: "single"; txn: SinkingFundTransaction }
    | { type: "group"; id: string; txns: SinkingFundTransaction[] }
  > = [];
  let i = 0;
  while (i < filtered.length) {
    const t = filtered[i]!;
    if (t.allocationGroupId) {
      const groupId = t.allocationGroupId;
      const bucket: SinkingFundTransaction[] = [];
      while (i < filtered.length && filtered[i]!.allocationGroupId === groupId) {
        bucket.push(filtered[i]!);
        i++;
      }
      groups.push({ type: "group", id: groupId, txns: bucket });
    } else {
      groups.push({ type: "single", txn: t });
      i++;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historikk — sinking funds"
        subtitle="Alle innskudd og uttak på tvers av fond"
        actions={
          <Link to="/dashboard/sinking-funds" className="btn btn-ghost">
            ← Tilbake
          </Link>
        }
      />

      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="label">Fond</label>
            <select
              className="input"
              value={fundFilter === "all" ? "all" : String(fundFilter)}
              onChange={(e) =>
                setFundFilter(e.target.value === "all" ? "all" : Number(e.target.value))
              }
            >
              <option value="all">Alle</option>
              {funds.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as KindFilter)}
            >
              <option value="all">Alle</option>
              <option value="deposit">Innskudd</option>
              <option value="withdrawal">Uttak</option>
              <option value="adjustment">Justering</option>
              <option value="opening">Startbeholdning</option>
            </select>
          </div>
          <div>
            <label className="label">Fra dato</label>
            <input
              type="date"
              className="input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Til dato</label>
            <input
              type="date"
              className="input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Ingen transaksjoner som matcher filteret.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            if (g.type === "single") {
              return (
                <SingleRow
                  key={`single-${g.txn.id}`}
                  txn={g.txn}
                  fund={fundById.get(g.txn.sinkingFundId)}
                />
              );
            }
            const total = g.txns.reduce((s, t) => s + Number(t.amount), 0);
            const occurredAt = g.txns[0]?.occurredAt ?? "";
            return (
              <div key={`group-${g.id}`} className="card border-l-4 border-l-primary">
                <div className="flex justify-between items-center text-sm mb-2">
                  <div>
                    <span className="font-semibold">Fordeling {occurredAt}</span>
                    {g.txns[0]?.note && <span className="text-muted ml-2">· {g.txns[0].note}</span>}
                  </div>
                  <span className="num font-semibold text-positive">+ {formatNOK(total)}</span>
                </div>
                <ul className="space-y-1">
                  {g.txns.map((t) => {
                    const fund = fundById.get(t.sinkingFundId);
                    return (
                      <li key={t.id} className="flex items-center gap-3 text-sm pl-2 text-muted">
                        <span
                          className="w-2 h-2 rounded-full flex-none"
                          style={{ background: fund?.color ?? "#888" }}
                        />
                        <span className="flex-1 truncate text-text">
                          {fund?.name ?? "(slettet)"}
                        </span>
                        <span className="num text-positive">+ {formatNOK(t.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SingleRow({ txn, fund }: { txn: SinkingFundTransaction; fund: SinkingFund | undefined }) {
  const amount = Number(txn.amount);
  const positive = amount >= 0;
  const label =
    txn.kind === "opening"
      ? "Startbeholdning"
      : txn.kind === "adjustment"
        ? "Justering"
        : positive
          ? "Innskudd"
          : "Uttak";
  return (
    <div className="card flex items-center gap-3 text-sm">
      <span className="text-muted num w-24 flex-none">{txn.occurredAt}</span>
      <span
        className="w-3 h-3 rounded-full flex-none"
        style={{ background: fund?.color ?? "#888" }}
      />
      <div className="flex-1 min-w-0">
        <div className="truncate">
          {fund?.name ?? "(slettet)"}
          <span className="text-xs text-muted ml-2">· {label}</span>
        </div>
        {txn.note && <div className="text-xs text-muted truncate">{txn.note}</div>}
      </div>
      <span
        className={`num font-semibold w-28 text-right flex-none ${positive ? "text-positive" : "text-danger"}`}
      >
        {positive ? "+" : "−"} {formatNOK(Math.abs(amount))}
      </span>
    </div>
  );
}
