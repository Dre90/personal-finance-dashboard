import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader, StatCard, ProgressBar, Modal, Empty } from "../../components/ui";
import {
  createSinkingFund,
  deleteSinkingFund,
  listSinkingFunds,
  updateSinkingFund,
} from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { formatNOK, toNumber } from "../../lib/utils";
import type { SinkingFund } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/sinking-funds")({
  component: SinkingFundsPage,
});

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#ef4444", "#84cc16", "#f97316", "#a855f7"];

function SinkingFundsPage() {
  const dashboardId = useDashboardId();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SinkingFund | null>(null);

  const { data, loading, refetch } = useServerData(
    async () => (dashboardId ? listSinkingFunds({ data: { dashboardId } }) : Promise.resolve([])),
    [dashboardId],
  );
  if (loading || !data || !dashboardId) return <div className="text-[color:var(--color-muted)]">Laster…</div>;

  const total = data.reduce((s, f) => s + toNumber(f.currentAmount), 0);
  const target = data.reduce((s, f) => s + toNumber(f.target), 0);
  const monthly = data.reduce((s, f) => s + toNumber(f.monthlyContribution), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinking funds"
        subtitle="Fond for fremtidige planlagte utgifter"
        actions={
          <button onClick={() => { setEditing(null); setOpen(true); }} className="btn btn-primary">+ Nytt fond</button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Totalt spart" value={total} tone="positive" />
        <StatCard label="Totalt mål" value={target} />
        <StatCard label="Månedlig bidrag" value={monthly} />
      </div>

      {data.length === 0 ? (
        <Empty
          title="Ingen sinking funds enda"
          description="Opprett ditt første fond for planlagte utgifter."
          action={<button onClick={() => setOpen(true)} className="btn btn-primary">Opprett fond</button>}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((f) => {
            const cur = toNumber(f.currentAmount);
            const tgt = toNumber(f.target);
            const pct = tgt > 0 ? Math.min(100, (cur / tgt) * 100) : 0;
            const monthsLeft = toNumber(f.monthlyContribution) > 0 && tgt > cur
              ? Math.ceil((tgt - cur) / toNumber(f.monthlyContribution))
              : null;
            return (
              <div key={f.id} className="card relative">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: f.color }} />
                      <h3 className="font-semibold">{f.name}</h3>
                    </div>
                    {f.notes && <p className="text-xs text-[color:var(--color-muted)] mt-1">{f.notes}</p>}
                  </div>
                  <button onClick={() => { setEditing(f); setOpen(true); }} className="text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]">Endre</button>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="num font-semibold">{formatNOK(cur)}</span>
                    <span className="num text-[color:var(--color-muted)]">av {formatNOK(tgt)}</span>
                  </div>
                  <ProgressBar value={cur} max={tgt || 1} color={f.color} />
                  <div className="mt-2 text-xs text-[color:var(--color-muted)] flex justify-between">
                    <span>{pct.toFixed(0)} % nådd</span>
                    <span>
                      {toNumber(f.monthlyContribution) > 0 && `+ ${formatNOK(f.monthlyContribution)} / mnd`}
                      {monthsLeft !== null && ` · ${monthsLeft} mnd igjen`}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => quickAdjust(f, dashboardId, refetch, toNumber(f.monthlyContribution))} className="btn btn-ghost text-xs">
                    + {formatNOK(toNumber(f.monthlyContribution))}
                  </button>
                  <button onClick={async () => {
                    const v = prompt("Nytt beløp i fondet (NOK):", String(cur));
                    if (v === null) return;
                    await updateSinkingFund({ data: { dashboardId, id: f.id, currentAmount: toNumber(v) } });
                    await refetch();
                  }} className="btn btn-ghost text-xs">Sett beløp…</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FundModal
        open={open}
        onClose={() => setOpen(false)}
        dashboardId={dashboardId}
        fund={editing}
        onSaved={async () => { setOpen(false); await refetch(); }}
      />
    </div>
  );
}

async function quickAdjust(f: SinkingFund, dashboardId: string, refetch: () => Promise<void>, amount: number) {
  if (amount <= 0) return;
  const newAmount = toNumber(f.currentAmount) + amount;
  await updateSinkingFund({ data: { dashboardId, id: f.id, currentAmount: newAmount } });
  await refetch();
}

function FundModal({
  open, onClose, dashboardId, fund, onSaved,
}: {
  open: boolean; onClose: () => void; dashboardId: string; fund: SinkingFund | null; onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [current, setCurrent] = React.useState("");
  const [monthly, setMonthly] = React.useState("");
  const [color, setColor] = React.useState(COLORS[0] ?? "#10b981");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(fund?.name ?? "");
      setTarget(fund?.target ?? "");
      setCurrent(fund?.currentAmount ?? "");
      setMonthly(fund?.monthlyContribution ?? "");
      setColor(fund?.color ?? COLORS[0] ?? "#10b981");
      setNotes(fund?.notes ?? "");
    }
  }, [open, fund]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        target: toNumber(target),
        currentAmount: toNumber(current),
        monthlyContribution: toNumber(monthly),
        color,
        notes: notes.trim() || null,
      };
      if (fund) {
        await updateSinkingFund({ data: { dashboardId, id: fund.id, ...payload } });
      } else {
        await createSinkingFund({ data: { dashboardId, ...payload } });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!fund) return;
    if (!confirm(`Slette "${fund.name}"?`)) return;
    setBusy(true);
    try {
      await deleteSinkingFund({ data: { dashboardId, id: fund.id } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fund ? "Endre fond" : "Nytt sinking fund"}
      footer={
        <>
          {fund && <button onClick={remove} className="btn btn-danger mr-auto" disabled={busy}>Slett</button>}
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !name.trim()}>Lagre</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Navn</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nåværende beløp</label>
            <input className="input num" type="number" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div>
            <label className="label">Målbeløp</label>
            <input className="input num" type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Månedlig bidrag</label>
          <input className="input num" type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
        </div>
        <div>
          <label className="label">Farge</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-white" : "border-transparent"}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className="label">Notat (valgfritt)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}
