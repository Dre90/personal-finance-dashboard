import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Empty, LoadingPlaceholder, Modal, PageHeader, StatCard } from "../../components/ui";
import { MoneyLineChart } from "../../components/charts";
import { SnapshotModal } from "../../components/SnapshotModal";
import {
  createLoan,
  deleteLoan,
  deleteLoanSnapshot,
  listLoans,
  updateLoan,
  upsertLoanSnapshot,
} from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, toNumber } from "../../lib/utils";
import type { Loan } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/loans")({
  component: LoansPage,
});

function LoansPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [openLoan, setOpenLoan] = React.useState(false);
  const [editing, setEditing] = React.useState<Loan | null>(null);
  const [snapshotFor, setSnapshotFor] = React.useState<Loan | null>(null);

  const { data, isInitialLoading, refetch } = useQuery({
    key: ["loans", dashboardId],
    fn: () => listLoans({ data: { dashboardId } }),
  });

  const snapshotMutation = useMutation({
    fn: (input: { loanId: number; snapshotDate: string; value: number }) =>
      upsertLoanSnapshot({
        data: {
          dashboardId,
          loanId: input.loanId,
          snapshotDate: input.snapshotDate,
          balance: input.value,
        },
      }),
    onSuccess: () => {
      void refetch();
      invalidateQueries(["summary", dashboardId]);
      toast.push("Saldo lagret", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteSnapshotMutation = useMutation({
    fn: (snapshotId: number) =>
      deleteLoanSnapshot({ data: { dashboardId, id: snapshotId } }),
    onSuccess: () => {
      void refetch();
      toast.push("Datapunkt slettet", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const totalDebt = data.loans.reduce((s, l) => s + toNumber(l.currentBalance), 0);
  const totalOriginal = data.loans.reduce((s, l) => s + toNumber(l.originalPrincipal), 0);
  const totalMonthly = data.loans.reduce((s, l) => s + toNumber(l.monthlyPayment), 0);
  const paidDown = totalOriginal - totalDebt;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lån"
        subtitle="Oversikt over gjeld og nedbetaling"
        actions={
          <button
            onClick={() => {
              setEditing(null);
              setOpenLoan(true);
            }}
            className="btn btn-primary"
          >
            + Nytt lån
          </button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total gjeld" value={totalDebt} tone="warn" />
        <StatCard label="Opprinnelig" value={totalOriginal} />
        <StatCard label="Nedbetalt" value={paidDown} tone="positive" />
        <StatCard label="Mnd. betaling" value={totalMonthly} />
      </div>

      {data.loans.length === 0 ? (
        <Empty
          title="Ingen lån registrert"
          description="Legg til boliglån, billån eller andre lån for å følge nedbetalingen."
          action={
            <button onClick={() => setOpenLoan(true)} className="btn btn-primary">
              Legg til lån
            </button>
          }
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.loans.map((loan) => {
            const snaps = data.snapshotsByLoan[loan.id] ?? [];
            const cur = toNumber(loan.currentBalance);
            const orig = toNumber(loan.originalPrincipal);
            const pctPaid = orig > 0 ? ((orig - cur) / orig) * 100 : 0;
            return (
              <div key={loan.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">{loan.name}</h3>
                    <div className="text-xs text-muted mt-1 space-x-3">
                      <span>
                        Rente:{" "}
                        <span className="text-text">
                          {Number(loan.interestRate).toFixed(2).replace(".", ",")} %
                        </span>
                      </span>
                      <span>
                        Mnd: <span className="text-text">{formatNOK(loan.monthlyPayment)}</span>
                      </span>
                    </div>
                    {loan.notes && <p className="text-xs text-muted mt-1">{loan.notes}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold num text-amber-400">{formatNOK(cur)}</div>
                    <div className="text-xs text-muted">av {formatNOK(orig)}</div>
                    <div className="text-xs pos num">{pctPaid.toFixed(1)} % nedbetalt</div>
                  </div>
                </div>

                {snaps.length > 1 && (
                  <MoneyLineChart
                    data={snaps.map((s) => ({ date: s.snapshotDate, balance: toNumber(s.balance) }))}
                    xKey="date"
                    height={140}
                    yWidth={70}
                    series={[{ dataKey: "balance", color: FLOW_COLORS.loan, strokeWidth: 2 }]}
                  />
                )}

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button onClick={() => setSnapshotFor(loan)} className="btn btn-primary text-xs">
                    + Saldo i dag
                  </button>
                  <button
                    onClick={() => {
                      setEditing(loan);
                      setOpenLoan(true);
                    }}
                    className="btn btn-ghost text-xs"
                  >
                    Endre
                  </button>
                </div>

                {snaps.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-muted cursor-pointer">
                      Historikk ({snaps.length} datapunkt)
                    </summary>
                    <table className="table mt-2">
                      <thead>
                        <tr><th>Dato</th><th className="text-right">Saldo</th><th></th></tr>
                      </thead>
                      <tbody>
                        {[...snaps].reverse().map((s) => (
                          <tr key={s.id}>
                            <td>{s.snapshotDate}</td>
                            <td className="text-right num">{formatNOK(s.balance)}</td>
                            <td className="text-right">
                              <button
                                onClick={() => {
                                  if (confirm("Slette dette datapunktet?")) {
                                    void deleteSnapshotMutation.mutate(s.id);
                                  }
                                }}
                                className="text-xs text-red-400 hover:underline"
                              >
                                Slett
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}

      <LoanModal
        open={openLoan}
        onClose={() => setOpenLoan(false)}
        dashboardId={dashboardId}
        loan={editing}
        onSaved={async (msg) => {
          setOpenLoan(false);
          invalidateQueries(["loans", dashboardId]);
          invalidateQueries(["summary", dashboardId]);
          await refetch();
          toast.push(msg, "success");
        }}
      />

      <SnapshotModal
        open={snapshotFor !== null}
        onClose={() => setSnapshotFor(null)}
        title={snapshotFor ? `Ny saldo: ${snapshotFor.name}` : ""}
        valueLabel="Saldo (NOK)"
        initialValue={snapshotFor?.currentBalance ?? ""}
        helperText="Lånets nåværende saldo oppdateres automatisk til siste verdi."
        onSubmit={async ({ snapshotDate, value }) => {
          if (!snapshotFor) return;
          await snapshotMutation.mutate({ loanId: snapshotFor.id, snapshotDate, value });
          setSnapshotFor(null);
        }}
      />
    </div>
  );
}

function LoanModal({
  open,
  onClose,
  dashboardId,
  loan,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  loan: Loan | null;
  onSaved: (message: string) => void;
}) {
  const form = useFormState(
    {
      name: loan?.name ?? "",
      orig: loan?.originalPrincipal ?? "",
      cur: loan?.currentBalance ?? "",
      rate: loan?.interestRate ?? "",
      monthly: loan?.monthlyPayment ?? "",
      notes: loan?.notes ?? "",
    },
    { resetWhen: open ? loan ?? "new" : null },
  );
  const toast = useToast();

  const saveMutation = useMutation({
    fn: async () => {
      const payload = {
        name: form.values.name.trim(),
        originalPrincipal: toNumber(form.values.orig),
        currentBalance: toNumber(form.values.cur),
        interestRate: toNumber(form.values.rate),
        monthlyPayment: toNumber(form.values.monthly),
        notes: form.values.notes.trim() || null,
      };
      if (loan) {
        await updateLoan({ data: { dashboardId, id: loan.id, ...payload } });
        return "Lån oppdatert";
      }
      await createLoan({ data: { dashboardId, ...payload } });
      return "Lån opprettet";
    },
    onSuccess: (msg) => onSaved(msg),
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: async () => {
      if (!loan) throw new Error("Ingen lån");
      await deleteLoan({ data: { dashboardId, id: loan.id } });
    },
    onSuccess: () => onSaved("Lån slettet"),
    onError: (e) => toast.push(e.message, "error"),
  });

  const busy = saveMutation.loading || deleteMutation.loading;
  const canSave = !!form.values.name.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={loan ? "Endre lån" : "Nytt lån"}
      footer={
        <>
          {loan && (
            <button
              onClick={() => {
                if (confirm(`Slette lånet "${loan.name}"?`)) {
                  void deleteMutation.mutate(undefined);
                }
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
          <input
            autoFocus
            className="input"
            value={form.values.name}
            onChange={form.setField("name")}
            placeholder="F.eks. Boliglån DNB"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Opprinnelig sum</label>
            <input className="input num" type="number" value={form.values.orig} onChange={form.setField("orig")} />
          </div>
          <div>
            <label className="label">Nåværende saldo</label>
            <input className="input num" type="number" value={form.values.cur} onChange={form.setField("cur")} />
          </div>
          <div>
            <label className="label">Rente (%)</label>
            <input className="input num" type="number" step="0.01" value={form.values.rate} onChange={form.setField("rate")} />
          </div>
          <div>
            <label className="label">Månedlig betaling</label>
            <input className="input num" type="number" value={form.values.monthly} onChange={form.setField("monthly")} />
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
