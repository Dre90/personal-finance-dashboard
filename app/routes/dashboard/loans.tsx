import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { PageHeader, StatCard, Empty, Modal } from "../../components/ui";
import {
  createLoan,
  deleteLoan,
  deleteLoanSnapshot,
  listLoans,
  updateLoan,
  upsertLoanSnapshot,
} from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { formatNOK, todayISO, toNumber } from "../../lib/utils";
import type { Loan } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/loans")({
  component: LoansPage,
});

function LoansPage() {
  const dashboardId = useDashboardId();
  const [openLoan, setOpenLoan] = React.useState(false);
  const [editing, setEditing] = React.useState<Loan | null>(null);
  const [snapshotFor, setSnapshotFor] = React.useState<Loan | null>(null);

  const { data, loading, refetch } = useServerData(
    async () => (dashboardId ? listLoans({ data: { dashboardId } }) : Promise.resolve(null)),
    [dashboardId],
  );
  if (loading || !data || !dashboardId) return <div className="text-[color:var(--color-muted)]">Laster…</div>;

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
          <button onClick={() => { setEditing(null); setOpenLoan(true); }} className="btn btn-primary">+ Nytt lån</button>
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
          action={<button onClick={() => setOpenLoan(true)} className="btn btn-primary">Legg til lån</button>}
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
                    <div className="text-xs text-[color:var(--color-muted)] mt-1 space-x-3">
                      <span>Rente: <span className="text-[color:var(--color-text)]">{Number(loan.interestRate).toFixed(2).replace(".", ",")} %</span></span>
                      <span>Mnd: <span className="text-[color:var(--color-text)]">{formatNOK(loan.monthlyPayment)}</span></span>
                    </div>
                    {loan.notes && <p className="text-xs text-[color:var(--color-muted)] mt-1">{loan.notes}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold num text-amber-400">{formatNOK(cur)}</div>
                    <div className="text-xs text-[color:var(--color-muted)]">av {formatNOK(orig)}</div>
                    <div className="text-xs pos num">{pctPaid.toFixed(1)} % nedbetalt</div>
                  </div>
                </div>

                {snaps.length > 1 && (
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={snaps.map((s) => ({ date: s.snapshotDate, balance: toNumber(s.balance) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
                      <XAxis dataKey="date" stroke="#9aa6c7" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9aa6c7" tick={{ fontSize: 10 }} tickFormatter={(v) => formatNOK(v)} width={70} />
                      <Tooltip contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }} formatter={(v: any) => formatNOK(v)} />
                      <Line type="monotone" dataKey="balance" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button onClick={() => setSnapshotFor(loan)} className="btn btn-primary text-xs">+ Saldo i dag</button>
                  <button onClick={() => { setEditing(loan); setOpenLoan(true); }} className="btn btn-ghost text-xs">Endre</button>
                </div>

                {snaps.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-[color:var(--color-muted)] cursor-pointer">Historikk ({snaps.length} datapunkt)</summary>
                    <table className="table mt-2">
                      <thead><tr><th>Dato</th><th className="text-right">Saldo</th><th></th></tr></thead>
                      <tbody>
                        {[...snaps].reverse().map((s) => (
                          <tr key={s.id}>
                            <td>{s.snapshotDate}</td>
                            <td className="text-right num">{formatNOK(s.balance)}</td>
                            <td className="text-right">
                              <button onClick={async () => {
                                if (!confirm("Slette dette datapunktet?")) return;
                                await deleteLoanSnapshot({ data: { dashboardId, id: s.id } });
                                await refetch();
                              }} className="text-xs text-red-400 hover:underline">Slett</button>
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
        onSaved={async () => { setOpenLoan(false); await refetch(); }}
      />

      <SnapshotModal
        open={snapshotFor !== null}
        onClose={() => setSnapshotFor(null)}
        dashboardId={dashboardId}
        loan={snapshotFor}
        onSaved={async () => { setSnapshotFor(null); await refetch(); }}
      />
    </div>
  );
}

function LoanModal({
  open, onClose, dashboardId, loan, onSaved,
}: {
  open: boolean; onClose: () => void; dashboardId: string; loan: Loan | null; onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [orig, setOrig] = React.useState("");
  const [cur, setCur] = React.useState("");
  const [rate, setRate] = React.useState("");
  const [monthly, setMonthly] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(loan?.name ?? "");
      setOrig(loan?.originalPrincipal ?? "");
      setCur(loan?.currentBalance ?? "");
      setRate(loan?.interestRate ?? "");
      setMonthly(loan?.monthlyPayment ?? "");
      setNotes(loan?.notes ?? "");
    }
  }, [open, loan]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        originalPrincipal: toNumber(orig),
        currentBalance: toNumber(cur),
        interestRate: toNumber(rate),
        monthlyPayment: toNumber(monthly),
        notes: notes.trim() || null,
      };
      if (loan) {
        await updateLoan({ data: { dashboardId, id: loan.id, ...payload } });
      } else {
        await createLoan({ data: { dashboardId, ...payload } });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!loan) return;
    if (!confirm(`Slette lånet "${loan.name}"?`)) return;
    setBusy(true);
    try {
      await deleteLoan({ data: { dashboardId, id: loan.id } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={loan ? "Endre lån" : "Nytt lån"}
      footer={
        <>
          {loan && <button onClick={remove} className="btn btn-danger mr-auto" disabled={busy}>Slett</button>}
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !name.trim()}>Lagre</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Navn</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Boliglån DNB" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Opprinnelig sum</label>
            <input className="input num" type="number" value={orig} onChange={(e) => setOrig(e.target.value)} />
          </div>
          <div>
            <label className="label">Nåværende saldo</label>
            <input className="input num" type="number" value={cur} onChange={(e) => setCur(e.target.value)} />
          </div>
          <div>
            <label className="label">Rente (%)</label>
            <input className="input num" type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </div>
          <div>
            <label className="label">Månedlig betaling</label>
            <input className="input num" type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
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

function SnapshotModal({
  open, onClose, dashboardId, loan, onSaved,
}: {
  open: boolean; onClose: () => void; dashboardId: string; loan: Loan | null; onSaved: () => void;
}) {
  const [date, setDate] = React.useState(todayISO());
  const [balance, setBalance] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDate(todayISO());
      setBalance(loan?.currentBalance ?? "");
    }
  }, [open, loan]);

  async function save() {
    if (!loan || !balance) return;
    setBusy(true);
    try {
      await upsertLoanSnapshot({ data: { dashboardId, loanId: loan.id, snapshotDate: date, balance: toNumber(balance) } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={loan ? `Ny saldo: ${loan.name}` : ""}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !balance}>Lagre</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Dato</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Saldo (NOK)</label>
          <input autoFocus type="number" className="input num" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">Lånets nåværende saldo oppdateres automatisk til siste verdi.</p>
      </div>
    </Modal>
  );
}
