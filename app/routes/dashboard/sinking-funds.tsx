import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  Empty,
  LoadingPlaceholder,
  Modal,
  PageHeader,
  ProgressBar,
  StatCard,
} from "../../components/ui";
import {
  createSinkingFund,
  deleteSinkingFund,
  listSinkingFunds,
  updateSinkingFund,
} from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { SINKING_COLORS } from "../../lib/colors";
import { formatNOK, toNumber } from "../../lib/utils";
import type { SinkingFund } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/sinking-funds")({
  component: SinkingFundsPage,
});

function SinkingFundsPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<SinkingFund | null>(null);

  const { data, isInitialLoading, refetch } = useQuery({
    key: ["sinking-funds", dashboardId],
    fn: () => listSinkingFunds({ data: { dashboardId } }),
  });

  const adjustMutation = useMutation({
    fn: (input: { fund: SinkingFund; amount: number }) =>
      updateSinkingFund({
        data: {
          dashboardId,
          id: input.fund.id,
          name: input.fund.name,
          currentAmount: toNumber(input.fund.currentAmount) + input.amount,
        },
      }),
    onSuccess: () => {
      void refetch();
      toast.push("Oppdatert", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const setAmountMutation = useMutation({
    fn: (input: { fund: SinkingFund; amount: number }) =>
      updateSinkingFund({
        data: {
          dashboardId,
          id: input.fund.id,
          name: input.fund.name,
          currentAmount: input.amount,
        },
      }),
    onSuccess: () => {
      void refetch();
      toast.push("Oppdatert", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const total = data.reduce((s, f) => s + toNumber(f.currentAmount), 0);
  const target = data.reduce((s, f) => s + toNumber(f.target), 0);
  const monthly = data.reduce((s, f) => s + toNumber(f.monthlyContribution), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinking funds"
        subtitle="Fond for fremtidige planlagte utgifter"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className="btn btn-primary"
          >
            + Nytt fond
          </button>
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
          action={
            <button onClick={() => setOpen(true)} className="btn btn-primary">
              Opprett fond
            </button>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((f) => {
            const cur = toNumber(f.currentAmount);
            const tgt = toNumber(f.target);
            const pct = tgt > 0 ? Math.min(100, (cur / tgt) * 100) : 0;
            const monthlyContribution = toNumber(f.monthlyContribution);
            const monthsLeft =
              monthlyContribution > 0 && tgt > cur
                ? Math.ceil((tgt - cur) / monthlyContribution)
                : null;
            return (
              <div key={f.id} className="card relative">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ background: f.color }} />
                      <h3 className="font-semibold">{f.name}</h3>
                    </div>
                    {f.notes && <p className="text-xs text-muted mt-1">{f.notes}</p>}
                  </div>
                  <button
                    onClick={() => {
                      setEditing(f);
                      setOpen(true);
                    }}
                    className="text-xs text-muted hover:text-text"
                  >
                    Endre
                  </button>
                </div>
                <div className="mt-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="num font-semibold">{formatNOK(cur)}</span>
                    <span className="num text-muted">av {formatNOK(tgt)}</span>
                  </div>
                  <ProgressBar value={cur} max={tgt || 1} color={f.color} />
                  <div className="mt-2 text-xs text-muted flex justify-between">
                    <span>{pct.toFixed(0)} % nådd</span>
                    <span>
                      {monthlyContribution > 0 && `+ ${formatNOK(monthlyContribution)} / mnd`}
                      {monthsLeft !== null && ` · ${monthsLeft} mnd igjen`}
                    </span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() =>
                      monthlyContribution > 0 &&
                      void adjustMutation.mutate({ fund: f, amount: monthlyContribution })
                    }
                    className="btn btn-ghost text-xs"
                    disabled={monthlyContribution <= 0}
                  >
                    + {formatNOK(monthlyContribution)}
                  </button>
                  <button
                    onClick={() => {
                      const v = prompt("Nytt beløp i fondet (NOK):", String(cur));
                      if (v === null) return;
                      void setAmountMutation.mutate({ fund: f, amount: toNumber(v) });
                    }}
                    className="btn btn-ghost text-xs"
                  >
                    Sett beløp…
                  </button>
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
        onSaved={async (msg) => {
          setOpen(false);
          invalidateQueries(["sinking-funds", dashboardId]);
          invalidateQueries(["summary", dashboardId]);
          await refetch();
          toast.push(msg, "success");
        }}
      />
    </div>
  );
}

function FundModal({
  open,
  onClose,
  dashboardId,
  fund,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  fund: SinkingFund | null;
  onSaved: (message: string) => void;
}) {
  const form = useFormState<{
    name: string;
    target: string;
    current: string;
    monthly: string;
    color: string;
    notes: string;
  }>(
    {
      name: fund?.name ?? "",
      target: fund?.target ?? "",
      current: fund?.currentAmount ?? "",
      monthly: fund?.monthlyContribution ?? "",
      color: fund?.color ?? SINKING_COLORS[0],
      notes: fund?.notes ?? "",
    },
    { resetWhen: open ? fund ?? "new" : null },
  );
  const toast = useToast();

  const saveMutation = useMutation({
    fn: async () => {
      const payload = {
        name: form.values.name.trim(),
        target: toNumber(form.values.target),
        currentAmount: toNumber(form.values.current),
        monthlyContribution: toNumber(form.values.monthly),
        color: form.values.color,
        notes: form.values.notes.trim() || null,
      };
      if (fund) {
        await updateSinkingFund({ data: { dashboardId, id: fund.id, ...payload } });
        return "Fond oppdatert";
      }
      await createSinkingFund({ data: { dashboardId, ...payload } });
      return "Fond opprettet";
    },
    onSuccess: (msg) => onSaved(msg),
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: async () => {
      if (!fund) throw new Error("Ingen fond");
      await deleteSinkingFund({ data: { dashboardId, id: fund.id } });
    },
    onSuccess: () => onSaved("Fond slettet"),
    onError: (e) => toast.push(e.message, "error"),
  });

  const busy = saveMutation.loading || deleteMutation.loading;
  const canSave = !!form.values.name.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={fund ? "Endre fond" : "Nytt sinking fund"}
      footer={
        <>
          {fund && (
            <button
              onClick={() => {
                if (confirm(`Slette "${fund.name}"?`)) void deleteMutation.mutate(undefined);
              }}
              className="btn btn-danger mr-auto"
              disabled={busy}
            >
              Slett
            </button>
          )}
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button
            onClick={() => void saveMutation.mutate(undefined)}
            className="btn btn-primary"
            disabled={busy || !canSave}
          >
            Lagre
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Navn</label>
          <input autoFocus className="input" value={form.values.name} onChange={form.setField("name")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Nåværende beløp</label>
            <input className="input num" type="number" value={form.values.current} onChange={form.setField("current")} />
          </div>
          <div>
            <label className="label">Målbeløp</label>
            <input className="input num" type="number" value={form.values.target} onChange={form.setField("target")} />
          </div>
        </div>
        <div>
          <label className="label">Månedlig bidrag</label>
          <input className="input num" type="number" value={form.values.monthly} onChange={form.setField("monthly")} />
        </div>
        <div>
          <label className="label">Farge</label>
          <div className="flex gap-2 flex-wrap">
            {SINKING_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => form.set("color", c)}
                className={`w-7 h-7 rounded-full border-2 ${form.values.color === c ? "border-white" : "border-transparent"}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="label">Notat (valgfritt)</label>
          <input className="input" value={form.values.notes} onChange={form.setField("notes")} />
        </div>
      </div>
    </Modal>
  );
}
