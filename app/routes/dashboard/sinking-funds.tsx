import { createFileRoute, Link } from "@tanstack/react-router";
import * as React from "react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronUp,
  GripVertical,
  History,
  Minus,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import {
  Empty,
  LoadingPlaceholder,
  Modal,
  PageHeader,
  ProgressBar,
  StatCard,
} from "../../components/ui";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Field, FieldLabel } from "../../components/ui/field";
import { Card, CardContent } from "../../components/ui/card";
import {
  allocateSinkingFundDeposit,
  createSinkingFund,
  createSinkingFundTransaction,
  deleteSinkingFund,
  deleteSinkingFundTransaction,
  listSinkingFunds,
  listSinkingFundTransactions,
  reorderSinkingFunds,
  updateSinkingFund,
  updateSinkingFundTransaction,
} from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { SINKING_COLORS } from "../../lib/colors";
import { cn, formatNOK, toNumber, todayISO } from "../../lib/utils";
import type { SinkingFund, SinkingFundTransaction } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/sinking-funds")({
  component: SinkingFundsPage,
});

type ModalState =
  | { kind: "none" }
  | { kind: "edit-fund"; fund: SinkingFund | null }
  | { kind: "allocate" }
  | { kind: "reorder" }
  | { kind: "single-txn"; fund: SinkingFund; txnKind: "deposit" | "withdrawal" }
  | { kind: "edit-txn"; fund: SinkingFund; txn: SinkingFundTransaction }
  | { kind: "history"; fund: SinkingFund };

function SinkingFundsPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [modal, setModal] = React.useState<ModalState>({ kind: "none" });

  const { data, isInitialLoading, refetch } = useQuery({
    key: ["sinking-funds", dashboardId],
    fn: () => listSinkingFunds({ data: { dashboardId } }),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const total = data.reduce((s, f) => s + toNumber(f.currentAmount), 0);
  const target = data.reduce((s, f) => s + toNumber(f.target), 0);
  const monthly = data.reduce((s, f) => s + toNumber(f.monthlyContribution), 0);

  const afterMutation = async (message: string) => {
    invalidateQueries(["sinking-funds", dashboardId]);
    invalidateQueries(["sinking-fund-txns", dashboardId]);
    invalidateQueries(["summary", dashboardId]);
    await refetch();
    toast.push(message, "success");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sinking funds"
        subtitle="Fond for fremtidige planlagte utgifter"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link to="/dashboard/sinking-funds/history" />}
            >
              <History />
              Historikk
            </Button>
            <Button
              variant="outline"
              onClick={() => setModal({ kind: "allocate" })}
              disabled={data.length === 0}
            >
              <Plus />
              Fordel innskudd
            </Button>
            <Button onClick={() => setModal({ kind: "edit-fund", fund: null })}>
              <Plus />
              Nytt fond
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Totalt spart" value={total} tone="positive" />
        <StatCard label="Totalt mål" value={target} />
        <StatCard label="Månedlig bidrag" value={monthly} />
      </div>

      {data.length > 1 && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setModal({ kind: "reorder" })}
            title="Endre rekkefølge på fond"
          >
            <ArrowDownUp />
            Sortér fond
          </Button>
        </div>
      )}

      {data.length === 0 ? (
        <Empty
          title="Ingen sinking funds enda"
          description="Opprett ditt første fond for planlagte utgifter."
          action={
            <Button onClick={() => setModal({ kind: "edit-fund", fund: null })}>
              Opprett fond
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              <Card key={f.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="size-3 rounded-full" style={{ background: f.color }} />
                        <h3 className="font-semibold">{f.name}</h3>
                      </div>
                      {f.notes && <p className="text-muted-foreground mt-1 text-xs">{f.notes}</p>}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setModal({ kind: "edit-fund", fund: f })}
                    >
                      Endre
                    </Button>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-semibold tabular-nums">{formatNOK(cur)}</span>
                      <span className="text-muted-foreground tabular-nums">
                        av {formatNOK(tgt)}
                      </span>
                    </div>
                    <ProgressBar value={cur} max={tgt || 1} color={f.color} />
                    <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                      <span>{pct.toFixed(0)} % nådd</span>
                      <span>
                        {monthlyContribution > 0 && `+ ${formatNOK(monthlyContribution)} / mnd`}
                        {monthsLeft !== null && ` · ${monthsLeft} mnd igjen`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModal({ kind: "single-txn", fund: f, txnKind: "deposit" })}
                    >
                      <Plus />
                      Innskudd
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cur <= 0}
                      onClick={() =>
                        setModal({ kind: "single-txn", fund: f, txnKind: "withdrawal" })
                      }
                    >
                      <Minus />
                      Uttak
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModal({ kind: "history", fund: f })}
                    >
                      Historikk
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <FundModal
        open={modal.kind === "edit-fund"}
        onClose={() => setModal({ kind: "none" })}
        dashboardId={dashboardId}
        fund={modal.kind === "edit-fund" ? modal.fund : null}
        onSaved={async (msg) => {
          setModal({ kind: "none" });
          await afterMutation(msg);
        }}
      />

      <AllocateDepositModal
        open={modal.kind === "allocate"}
        onClose={() => setModal({ kind: "none" })}
        dashboardId={dashboardId}
        funds={data}
        onSaved={async () => {
          setModal({ kind: "none" });
          await afterMutation("Innskudd fordelt");
        }}
      />

      <ReorderFundsModal
        open={modal.kind === "reorder"}
        onClose={() => setModal({ kind: "none" })}
        dashboardId={dashboardId}
        funds={data}
        onSaved={async () => {
          setModal({ kind: "none" });
          await afterMutation("Rekkefølge lagret");
        }}
      />

      <SingleTxnModal
        open={modal.kind === "single-txn" || modal.kind === "edit-txn"}
        onClose={() => setModal({ kind: "none" })}
        dashboardId={dashboardId}
        fund={
          modal.kind === "single-txn" ? modal.fund : modal.kind === "edit-txn" ? modal.fund : null
        }
        txnKind={
          modal.kind === "single-txn"
            ? modal.txnKind
            : modal.kind === "edit-txn"
              ? Number(modal.txn.amount) < 0
                ? "withdrawal"
                : "deposit"
              : "deposit"
        }
        existing={modal.kind === "edit-txn" ? modal.txn : null}
        onSaved={async (msg) => {
          setModal({ kind: "none" });
          await afterMutation(msg);
        }}
      />

      <FundHistoryModal
        open={modal.kind === "history"}
        onClose={() => setModal({ kind: "none" })}
        dashboardId={dashboardId}
        fund={modal.kind === "history" ? modal.fund : null}
        onEdit={(txn, fund) => setModal({ kind: "edit-txn", fund, txn })}
        onDeleted={async () => {
          await afterMutation("Transaksjon slettet");
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Allocate-deposit modal: distribute one lump sum across many funds
// ---------------------------------------------------------------------------

function AllocateDepositModal({
  open,
  onClose,
  dashboardId,
  funds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  funds: SinkingFund[];
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();

  type AllocState = {
    total: string;
    occurredAt: string;
    note: string;
    allocations: Record<number, string>;
  };

  const initial: AllocState = React.useMemo(
    () => ({
      total: "",
      occurredAt: todayISO(),
      note: "",
      allocations: Object.fromEntries(funds.map((f) => [f.id, ""])) as Record<number, string>,
    }),
    [funds],
  );

  const form = useFormState<AllocState>(initial, { resetWhen: open ? "open" : null });

  const totalNum = toNumber(form.values.total);
  const allocatedNum = funds.reduce(
    (s, f) => s + Math.max(0, toNumber(form.values.allocations[f.id] ?? "")),
    0,
  );
  const remaining = totalNum - allocatedNum;
  const canSave =
    totalNum > 0 &&
    Math.abs(remaining) < 0.005 &&
    funds.some((f) => toNumber(form.values.allocations[f.id] ?? "") > 0);

  const fillFromMonthly = () => {
    const next = { ...form.values.allocations };
    let sum = 0;
    for (const f of funds) {
      const v = toNumber(f.monthlyContribution);
      next[f.id] = v > 0 ? String(v) : "";
      sum += v;
    }
    form.set("allocations", next);
    if (totalNum === 0) form.set("total", String(sum));
  };

  const setAllocation = (fundId: number, value: string) => {
    form.set("allocations", { ...form.values.allocations, [fundId]: value });
  };

  const saveMutation = useMutation({
    fn: async () => {
      const allocations = funds
        .map((f) => ({
          sinkingFundId: f.id,
          amount: toNumber(form.values.allocations[f.id] ?? ""),
        }))
        .filter((a) => a.amount > 0);
      await allocateSinkingFundDeposit({
        data: {
          dashboardId,
          occurredAt: form.values.occurredAt,
          note: form.values.note.trim() || null,
          allocations: allocations.map((a) => ({
            sinkingFundId: a.sinkingFundId,
            amount: a.amount,
          })),
        },
      });
    },
    onSuccess: () => void onSaved(),
    onError: (e) => toast.push(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Fordel innskudd"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.loading}>
            Avbryt
          </Button>
          <Button
            onClick={() => void saveMutation.mutate(undefined)}
            disabled={!canSave || saveMutation.loading}
          >
            Lagre
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="alloc-total">Totalbeløp</FieldLabel>
            <Input
              id="alloc-total"
              autoFocus
              className="tabular-nums"
              type="number"
              value={form.values.total}
              onChange={form.setField("total")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="alloc-date">Dato</FieldLabel>
            <Input
              id="alloc-date"
              type="date"
              value={form.values.occurredAt}
              onChange={form.setField("occurredAt")}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="alloc-note">Notat (f.eks. «Lønn juni»)</FieldLabel>
          <Input id="alloc-note" value={form.values.note} onChange={form.setField("note")} />
        </Field>

        <div className="flex items-center justify-between pt-2">
          <span className="text-muted-foreground text-xs">Fordeling per fond</span>
          <Button type="button" variant="ghost" size="sm" onClick={fillFromMonthly}>
            Bruk månedlig bidrag
          </Button>
        </div>

        <div className="max-h-80 space-y-2 overflow-auto">
          {funds.map((f) => {
            const cur = toNumber(f.currentAmount);
            const tgt = toNumber(f.target);
            return (
              <div key={f.id} className="flex items-center gap-3">
                <span className="size-3 flex-none rounded-full" style={{ background: f.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.name}</div>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {formatNOK(cur)}
                    {tgt > 0 && ` av ${formatNOK(tgt)}`}
                  </div>
                </div>
                <Input
                  className="w-32 tabular-nums"
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="0"
                  value={form.values.allocations[f.id] ?? ""}
                  onChange={(e) => setAllocation(f.id, e.target.value)}
                />
              </div>
            );
          })}
        </div>

        <div className="flex justify-between border-t pt-3 text-sm">
          <span className="text-muted-foreground">
            Fordelt: <span className="text-foreground tabular-nums">{formatNOK(allocatedNum)}</span>
          </span>
          <span
            className={
              Math.abs(remaining) < 0.005
                ? "text-muted-foreground"
                : remaining < 0
                  ? "text-destructive"
                  : "text-warning"
            }
          >
            Igjen å fordele:{" "}
            <span className="font-semibold tabular-nums">{formatNOK(remaining)}</span>
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reorder modal: change card order with ↑/↓ buttons
// ---------------------------------------------------------------------------

function ReorderFundsModal({
  open,
  onClose,
  dashboardId,
  funds,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  funds: SinkingFund[];
  onSaved: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [order, setOrder] = React.useState<SinkingFund[]>(funds);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (open) {
      setOrder(funds);
      setDragIndex(null);
      setOverIndex(null);
    }
  }, [open, funds]);

  const move = (index: number, delta: -1 | 1) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOrder(next);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [picked] = next.splice(from, 1);
    next.splice(to, 0, picked!);
    setOrder(next);
  };

  const isChanged = order.some((f, i) => f.id !== funds[i]?.id);

  const saveMutation = useMutation({
    fn: async () => {
      await reorderSinkingFunds({
        data: { dashboardId, orderedIds: order.map((f) => f.id) },
      });
    },
    onSuccess: () => void onSaved(),
    onError: (e) => toast.push(e.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Endre rekkefølge"
      footer={
        <>
          <Button
            type="button"
            variant="ghost"
            className="mr-auto"
            onClick={() => setOrder(funds)}
            disabled={!isChanged || saveMutation.loading}
          >
            Tilbakestill
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.loading}>
            Avbryt
          </Button>
          <Button
            onClick={() => void saveMutation.mutate(undefined)}
            disabled={!isChanged || saveMutation.loading}
          >
            Lagre
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground mb-2 text-xs">
        Dra radene for å sortere, eller bruk pilene.
      </p>
      <ul className="max-h-96 space-y-1 overflow-auto">
        {order.map((f, i) => {
          const isDragged = dragIndex === i;
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <li
              key={f.id}
              draggable
              onDragStart={(e) => {
                setDragIndex(i);
                e.dataTransfer.effectAllowed = "move";
                // Firefox requires data to be set on the drag event for the drag to
                // start reliably; the actual value isn't used, we track state instead.
                e.dataTransfer.setData("text/plain", String(f.id));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (overIndex !== i) setOverIndex(i);
              }}
              onDragLeave={() => {
                if (overIndex === i) setOverIndex(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) moveTo(dragIndex, i);
                setDragIndex(null);
                setOverIndex(null);
              }}
              onDragEnd={() => {
                setDragIndex(null);
                setOverIndex(null);
              }}
              className={cn(
                "flex cursor-grab items-center gap-3 rounded px-2 py-2 select-none active:cursor-grabbing",
                isDragged ? "opacity-40" : "hover:bg-muted",
                isOver && "ring-primary ring-2",
              )}
            >
              <GripVertical className="text-muted-foreground size-4 flex-none" aria-hidden />
              <span className="text-muted-foreground w-6 flex-none text-right text-xs tabular-nums">
                {i + 1}
              </span>
              <span className="size-3 flex-none rounded-full" style={{ background: f.color }} />
              <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
              <div className="flex flex-none gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label="Flytt opp"
                >
                  <ChevronUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  aria-label="Flytt ned"
                >
                  <ChevronDown />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Single transaction modal (deposit / withdrawal / edit)
// ---------------------------------------------------------------------------

function SingleTxnModal({
  open,
  onClose,
  dashboardId,
  fund,
  txnKind,
  existing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  fund: SinkingFund | null;
  txnKind: "deposit" | "withdrawal";
  existing: SinkingFundTransaction | null;
  onSaved: (message: string) => void | Promise<void>;
}) {
  const toast = useToast();

  const initialAmount = existing
    ? String(Math.abs(Number(existing.amount)))
    : !existing && fund && txnKind === "deposit"
      ? toNumber(fund.monthlyContribution) > 0
        ? String(toNumber(fund.monthlyContribution))
        : ""
      : "";

  const form = useFormState(
    {
      amount: initialAmount,
      occurredAt: existing?.occurredAt ?? todayISO(),
      note: existing?.note ?? "",
    },
    { resetWhen: open ? (existing?.id ?? `${fund?.id ?? ""}-${txnKind}`) : null },
  );

  const saveMutation = useMutation({
    fn: async () => {
      if (!fund) throw new Error("Mangler fond");
      const absAmount = toNumber(form.values.amount);
      if (absAmount <= 0) throw new Error("Beløp må være større enn 0");
      const signed = txnKind === "withdrawal" ? -absAmount : absAmount;
      if (existing) {
        await updateSinkingFundTransaction({
          data: {
            dashboardId,
            id: existing.id,
            amount: signed,
            occurredAt: form.values.occurredAt,
            note: form.values.note.trim() || null,
          },
        });
        return "Transaksjon oppdatert";
      }
      await createSinkingFundTransaction({
        data: {
          dashboardId,
          sinkingFundId: fund.id,
          amount: signed,
          occurredAt: form.values.occurredAt,
          kind: txnKind,
          note: form.values.note.trim() || null,
        },
      });
      return txnKind === "deposit" ? "Innskudd registrert" : "Uttak registrert";
    },
    onSuccess: (msg) => void onSaved(msg),
    onError: (e) => toast.push(e.message, "error"),
  });

  const title = existing
    ? "Endre transaksjon"
    : txnKind === "deposit"
      ? `Nytt innskudd${fund ? ` — ${fund.name}` : ""}`
      : `Nytt uttak${fund ? ` — ${fund.name}` : ""}`;
  const canSave = toNumber(form.values.amount) > 0 && !!form.values.occurredAt;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saveMutation.loading}>
            Avbryt
          </Button>
          <Button
            onClick={() => void saveMutation.mutate(undefined)}
            disabled={!canSave || saveMutation.loading}
          >
            Lagre
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="txn-amount">Beløp</FieldLabel>
            <Input
              id="txn-amount"
              autoFocus
              className="tabular-nums"
              type="number"
              value={form.values.amount}
              onChange={form.setField("amount")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="txn-date">Dato</FieldLabel>
            <Input
              id="txn-date"
              type="date"
              value={form.values.occurredAt}
              onChange={form.setField("occurredAt")}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="txn-note">Notat (valgfritt)</FieldLabel>
          <Input id="txn-note" value={form.values.note} onChange={form.setField("note")} />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Per-fund history modal
// ---------------------------------------------------------------------------

function FundHistoryModal({
  open,
  onClose,
  dashboardId,
  fund,
  onEdit,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  fund: SinkingFund | null;
  onEdit: (txn: SinkingFundTransaction, fund: SinkingFund) => void;
  onDeleted: () => void | Promise<void>;
}) {
  const toast = useToast();
  const { data, isInitialLoading } = useQuery({
    key: ["sinking-fund-txns", dashboardId, fund?.id ?? "none"],
    fn: async () => {
      if (!fund) return [];
      return listSinkingFundTransactions({ data: { dashboardId, sinkingFundId: fund.id } });
    },
    enabled: open && !!fund,
  });

  const deleteMutation = useMutation({
    fn: async (id: number) => deleteSinkingFundTransaction({ data: { dashboardId, id } }),
    onSuccess: () => void onDeleted(),
    onError: (e) => toast.push(e.message, "error"),
  });

  if (!fund) return null;
  const balance = toNumber(fund.currentAmount);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Historikk — ${fund.name}`}
      footer={
        <Button variant="outline" onClick={onClose}>
          Lukk
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="text-muted-foreground text-sm">
          Saldo nå:{" "}
          <span className="text-foreground font-semibold tabular-nums">{formatNOK(balance)}</span>
        </div>
        {isInitialLoading ? (
          <LoadingPlaceholder />
        ) : !data || data.length === 0 ? (
          <p className="text-muted-foreground text-sm">Ingen transaksjoner enda.</p>
        ) : (
          <ul className="max-h-96 divide-y divide-border overflow-auto">
            {data.map((t) => (
              <TxnRow
                key={t.id}
                txn={t}
                onEdit={() => onEdit(t, fund)}
                onDelete={() => {
                  if (confirm("Slette denne transaksjonen?")) {
                    void deleteMutation.mutate(t.id);
                  }
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function TxnRow({
  txn,
  onEdit,
  onDelete,
}: {
  txn: SinkingFundTransaction;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const amount = Number(txn.amount);
  const isPositive = amount >= 0;
  return (
    <li className="flex items-center gap-3 py-2 text-sm">
      <span className="text-muted-foreground w-24 flex-none tabular-nums">{txn.occurredAt}</span>
      <span
        className={cn(
          "w-28 flex-none text-right font-semibold tabular-nums",
          isPositive ? "text-success" : "text-destructive",
        )}
      >
        {isPositive ? "+" : "−"} {formatNOK(Math.abs(amount))}
      </span>
      <span className="min-w-0 flex-1 truncate">
        {txn.note || (txn.kind === "opening" ? "Startbeholdning" : "")}
        {txn.allocationGroupId && (
          <span className="text-muted-foreground ml-2 text-xs">· fordeling</span>
        )}
      </span>
      <div className="flex flex-none gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label="Endre"
          disabled={txn.kind === "opening"}
          title={txn.kind === "opening" ? "Startbeholdning kan ikke endres her" : "Endre"}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="hover:text-destructive"
          onClick={onDelete}
          aria-label="Slett"
          disabled={txn.kind === "opening"}
          title={txn.kind === "opening" ? "Startbeholdning kan ikke slettes" : "Slett"}
        >
          <X />
        </Button>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Fund create/edit modal (unchanged behaviour, kept for managing the fund itself)
// ---------------------------------------------------------------------------

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
    monthly: string;
    color: string;
    notes: string;
  }>(
    {
      name: fund?.name ?? "",
      target: fund?.target ?? "",
      monthly: fund?.monthlyContribution ?? "",
      color: fund?.color ?? SINKING_COLORS[0],
      notes: fund?.notes ?? "",
    },
    { resetWhen: open ? (fund ?? "new") : null },
  );
  const toast = useToast();

  const saveMutation = useMutation({
    fn: async () => {
      const payload = {
        name: form.values.name.trim(),
        target: toNumber(form.values.target),
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
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                if (confirm(`Slette "${fund.name}"?`)) void deleteMutation.mutate(undefined);
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
      <div className="space-y-3">
        <Field>
          <FieldLabel htmlFor="fund-name">Navn</FieldLabel>
          <Input
            id="fund-name"
            autoFocus
            value={form.values.name}
            onChange={form.setField("name")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fund-target">Målbeløp</FieldLabel>
          <Input
            id="fund-target"
            className="tabular-nums"
            type="number"
            value={form.values.target}
            onChange={form.setField("target")}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fund-monthly">Månedlig bidrag</FieldLabel>
          <Input
            id="fund-monthly"
            className="tabular-nums"
            type="number"
            value={form.values.monthly}
            onChange={form.setField("monthly")}
          />
        </Field>
        <Field>
          <FieldLabel>Farge</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {SINKING_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => form.set("color", c)}
                className={cn(
                  "size-7 rounded-full border-2",
                  form.values.color === c ? "border-foreground" : "border-transparent",
                )}
                style={{ background: c }}
                aria-label={`Farge ${c}`}
              />
            ))}
          </div>
        </Field>
        <Field>
          <FieldLabel htmlFor="fund-notes">Notat (valgfritt)</FieldLabel>
          <Input id="fund-notes" value={form.values.notes} onChange={form.setField("notes")} />
        </Field>
      </div>
    </Modal>
  );
}
