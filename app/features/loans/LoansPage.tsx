import * as React from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Empty, LoadingPlaceholder, Modal, PageHeader, StatCard } from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card, CardContent } from "../../components/ui/card";
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { MoneyLineChart } from "../../components/charts";
import { HistoryModal } from "../../components/HistoryModal";
import { SnapshotModal } from "../../components/SnapshotModal";
import {
  createLoan,
  deleteLoan,
  deleteLoanSnapshot,
  listLoans,
  updateLoan,
  upsertLoanSnapshot,
} from "~/features/loans/server";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { FLOW_COLORS } from "../../lib/colors";
import { formatNOK, toNumber } from "../../lib/utils";
import type { Loan, LoanSnapshot } from "../../../db/schema";

export function LoansPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [openLoan, setOpenLoan] = React.useState(false);
  const [editing, setEditing] = React.useState<Loan | null>(null);
  const [snapshotFor, setSnapshotFor] = React.useState<Loan | null>(null);
  const [historyFor, setHistoryFor] = React.useState<Loan | null>(null);
  const [editingSnapshot, setEditingSnapshot] = React.useState<{
    loan: Loan;
    snapshot: LoanSnapshot;
  } | null>(null);

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
    fn: (snapshotId: number) => deleteLoanSnapshot({ data: { dashboardId, id: snapshotId } }),
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
          <Button
            onClick={() => {
              setEditing(null);
              setOpenLoan(true);
            }}
          >
            <Plus />
            Nytt lån
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total gjeld" value={totalDebt} tone="warn" />
        <StatCard label="Opprinnelig" value={totalOriginal} />
        <StatCard label="Nedbetalt" value={paidDown} tone="positive" />
        <StatCard label="Mnd. betaling" value={totalMonthly} />
      </div>

      {data.loans.length === 0 ? (
        <Empty
          title="Ingen lån registrert"
          description="Legg til boliglån, billån eller andre lån for å følge nedbetalingen."
          action={<Button onClick={() => setOpenLoan(true)}>Legg til lån</Button>}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.loans.map((loan) => {
            const snaps = data.snapshotsByLoan[loan.id] ?? [];
            const cur = toNumber(loan.currentBalance);
            const orig = toNumber(loan.originalPrincipal);
            const pctPaid = orig > 0 ? ((orig - cur) / orig) * 100 : 0;
            return (
              <Card key={loan.id}>
                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{loan.name}</h3>
                      <div className="text-muted-foreground mt-1 space-x-3 text-xs">
                        <span>
                          Rente:{" "}
                          <span className="text-foreground">
                            {Number(loan.interestRate).toFixed(2).replace(".", ",")} %
                          </span>
                        </span>
                        <span>
                          Mnd:{" "}
                          <span className="text-foreground">{formatNOK(loan.monthlyPayment)}</span>
                        </span>
                      </div>
                      {loan.notes && (
                        <p className="text-muted-foreground mt-1 text-xs">{loan.notes}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-warning text-2xl font-semibold tabular-nums">
                        {formatNOK(cur)}
                      </div>
                      <div className="text-muted-foreground text-xs">av {formatNOK(orig)}</div>
                      <div className="text-success text-xs tabular-nums">
                        {pctPaid.toFixed(1)} % nedbetalt
                      </div>
                    </div>
                  </div>

                  {snaps.length > 1 && (
                    <MoneyLineChart
                      data={snaps.map((s) => ({
                        date: s.snapshotDate,
                        balance: toNumber(s.balance),
                      }))}
                      xKey="date"
                      height={140}
                      yWidth={70}
                      series={[{ dataKey: "balance", color: FLOW_COLORS.loan, strokeWidth: 2 }]}
                    />
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setSnapshotFor(loan)}>
                      <Plus />
                      Registrer saldo
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditing(loan);
                        setOpenLoan(true);
                      }}
                    >
                      Endre
                    </Button>
                    {snaps.length > 0 && (
                      <Button variant="outline" onClick={() => setHistoryFor(loan)}>
                        Historikk ({snaps.length})
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
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

      <SnapshotModal
        open={editingSnapshot !== null}
        onClose={() => setEditingSnapshot(null)}
        title={editingSnapshot ? `Endre saldo: ${editingSnapshot.loan.name}` : ""}
        valueLabel="Saldo (NOK)"
        initialDate={editingSnapshot?.snapshot.snapshotDate}
        initialValue={editingSnapshot?.snapshot.balance}
        dateDisabled
        helperText="Datoen kan ikke endres her."
        onSubmit={async ({ snapshotDate, value }) => {
          if (!editingSnapshot) return;
          await snapshotMutation.mutate({
            loanId: editingSnapshot.loan.id,
            snapshotDate,
            value,
          });
          setEditingSnapshot(null);
        }}
      />

      <LoanHistoryModal
        open={historyFor !== null}
        onClose={() => setHistoryFor(null)}
        loan={historyFor}
        snapshots={historyFor ? (data.snapshotsByLoan[historyFor.id] ?? []) : []}
        onEdit={(loan, snapshot) => setEditingSnapshot({ loan, snapshot })}
        onDelete={(id) => {
          if (confirm("Slette dette datapunktet?")) {
            void deleteSnapshotMutation.mutate(id);
          }
        }}
      />
    </div>
  );
}

function LoanHistoryModal({
  open,
  onClose,
  loan,
  snapshots,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  loan: Loan | null;
  snapshots: LoanSnapshot[];
  onEdit: (loan: Loan, snapshot: LoanSnapshot) => void;
  onDelete: (id: number) => void;
}) {
  if (!loan) return null;

  return (
    <HistoryModal open={open} onClose={onClose} title={`Historikk — ${loan.name}`}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Dato</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...snapshots].reverse().map((snapshot) => (
            <TableRow key={snapshot.id}>
              <TableCell>{snapshot.snapshotDate}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatNOK(snapshot.balance)}
              </TableCell>
              <TableCell className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onEdit(loan, snapshot)}
                  aria-label="Endre saldo"
                  title="Endre saldo"
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hover:text-destructive"
                  onClick={() => onDelete(snapshot.id)}
                  aria-label="Slett datapunkt"
                  title="Slett datapunkt"
                >
                  <X />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </HistoryModal>
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
    { resetWhen: open ? (loan ?? "new") : null },
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
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                if (confirm(`Slette lånet "${loan.name}"?`)) {
                  void deleteMutation.mutate(undefined);
                }
              }}
            >
              Slett
            </Button>
          )}
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Avbryt
          </Button>
          <Button onClick={() => void saveMutation.mutate(undefined)} disabled={busy || !canSave}>
            Lagre
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="loan-name">Navn</FieldLabel>
          <Input
            id="loan-name"
            autoFocus
            value={form.values.name}
            onChange={form.setField("name")}
            placeholder="F.eks. Boliglån DNB"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="loan-orig">Opprinnelig sum</FieldLabel>
            <Input
              id="loan-orig"
              className="tabular-nums"
              type="number"
              value={form.values.orig}
              onChange={form.setField("orig")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="loan-cur">Nåværende saldo</FieldLabel>
            <Input
              id="loan-cur"
              className="tabular-nums"
              type="number"
              value={form.values.cur}
              onChange={form.setField("cur")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="loan-rate">Rente (%)</FieldLabel>
            <Input
              id="loan-rate"
              className="tabular-nums"
              type="number"
              step="0.01"
              value={form.values.rate}
              onChange={form.setField("rate")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="loan-monthly">Månedlig betaling</FieldLabel>
            <Input
              id="loan-monthly"
              className="tabular-nums"
              type="number"
              value={form.values.monthly}
              onChange={form.setField("monthly")}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="loan-notes">Notat (valgfritt)</FieldLabel>
          <Input id="loan-notes" value={form.values.notes} onChange={form.setField("notes")} />
        </Field>
      </FieldGroup>
    </Modal>
  );
}
