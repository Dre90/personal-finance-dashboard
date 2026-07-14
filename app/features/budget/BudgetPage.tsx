import * as React from "react";
import { Link } from "@tanstack/react-router";
import { DeleteConfirmationDialog } from "~/components/DeleteConfirmationDialog";
import { MoneyDonut } from "~/components/charts";
import {
  ArrowDownUp,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Plus,
  ReceiptText,
  Trash2,
} from "lucide-react";
import { Empty, LoadingPlaceholder, Modal, PageHeader, StatCard } from "~/components/ui";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Field, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useToast } from "~/components/Toaster";
import { ConsumptionGroupField } from "~/features/budget/ConsumptionGroupField";
import { DEFAULT_BUDGET_GROUP_COLOR, GroupColorField } from "~/features/budget/GroupColorField";
import { useDashboard } from "~/lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "~/lib/query";
import { cn, formatMoneyInput, formatNOK, todayISO, toNumber } from "~/lib/utils";
import {
  createBudgetPeriod,
  createBudgetPurchase,
  createPeriodGroup,
  createPeriodItem,
  deleteBudgetPurchase,
  deletePeriodItem,
  getBudgetPeriod,
  listBudgetPeriods,
  listBudgetTemplates,
  reorderPeriodGroups,
  reorderPeriodItems,
  updateBudgetPurchase,
  updatePeriodGroup,
  updatePeriodItem,
} from "~/features/budget/server";

export function BudgetPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [selectedPeriodId, setSelectedPeriodId] = React.useState<number | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [itemTarget, setItemTarget] = React.useState<{ id: number; name: string } | null>(null);
  const [groupOpen, setGroupOpen] = React.useState(false);
  const [editingGroup, setEditingGroup] = React.useState<PeriodGroup | null>(null);
  const [reorderTarget, setReorderTarget] = React.useState<{
    title: string;
    entries: Array<{ id: number; name: string }>;
    save: (orderedIds: number[]) => Promise<unknown>;
  } | null>(null);

  const periodsQuery = useQuery({
    key: ["budget-periods", dashboardId],
    fn: () => listBudgetPeriods({ data: { dashboardId } }),
  });
  const templatesQuery = useQuery({
    key: ["budget-templates", dashboardId],
    fn: () => listBudgetTemplates({ data: { dashboardId } }),
  });
  const periods = periodsQuery.data ?? [];
  const periodId =
    selectedPeriodId !== null && periods.some((entry) => entry.id === selectedPeriodId)
      ? selectedPeriodId
      : (periods[0]?.id ?? null);
  const periodQuery = useQuery({
    key: ["budget-period", dashboardId, periodId],
    enabled: periodId !== null,
    fn: () => getBudgetPeriod({ data: { dashboardId, periodId: periodId! } }),
  });

  const refresh = async () => {
    await Promise.all([periodsQuery.refetch(), periodQuery.refetch()]);
    invalidateQueries(["budget-year", dashboardId]);
  };

  if (periodsQuery.isInitialLoading || templatesQuery.isInitialLoading)
    return <LoadingPlaceholder />;
  if (periodId !== null && !periodQuery.data) return <LoadingPlaceholder />;

  const period = periodQuery.data;
  const totals = period ? calculateTotals(period.groups) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={period ? `Budsjett for ${formatBudgetMonth(period.endDate)}` : "Budsjett"}
        subtitle={
          period
            ? `${formatPeriod(period.startDate)} – ${formatPeriod(period.endDate)}`
            : "Nullbasert budsjettering"
        }
        actions={
          <>
            {periods.length > 0 && (
              <select
                aria-label="Velg budsjettperiode"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={periodId ?? ""}
                onChange={(event) => setSelectedPeriodId(Number(event.target.value))}
              >
                {periods.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {formatBudgetMonth(entry.endDate)}
                  </option>
                ))}
              </select>
            )}
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              <CalendarPlus data-icon="inline-start" />
              Opprett periode
            </Button>
          </>
        }
      />

      {!periodId && (
        <Empty
          title="Ingen budsjettperioder"
          description={
            templatesQuery.data?.length
              ? "Opprett den første perioden fra en mal."
              : "Opprett først en mal med inntekter og utgifter."
          }
          action={
            templatesQuery.data?.length ? (
              <Button size="lg" onClick={() => setCreateOpen(true)}>
                <CalendarPlus data-icon="inline-start" />
                Opprett periode
              </Button>
            ) : (
              <Button
                size="lg"
                nativeButton={false}
                render={<Link to="/dashboard/budget/templates" />}
              >
                <Plus data-icon="inline-start" />
                Opprett mal
              </Button>
            )
          }
        />
      )}

      {period && totals && (
        <>
          <div className="grid items-start gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="flex flex-col gap-4">
              <StatCard
                label="Forventet balanse"
                value={totals.expectedBalance}
                tone={totals.expectedBalance === 0 ? "positive" : "negative"}
                hint={totals.expectedBalance === 0 ? "Alt er fordelt" : "Må fordeles"}
              />
              <StatCard
                label="Faktisk balanse"
                value={totals.actualBalance}
                tone={totals.actualBalance >= 0 ? "positive" : "negative"}
                hint="Kan overføres til neste periode"
              />
            </div>
            <ExpenseGroupOverview groups={period.groups} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-2">
            {period.groups.map((group) => (
              <BudgetGroup
                key={group.id}
                group={group}
                periodId={period.id}
                dashboardId={dashboardId}
                onAddItem={() => setItemTarget({ id: group.id, name: group.name })}
                onEditGroup={() => setEditingGroup(group)}
                onReorderItems={() =>
                  setReorderTarget({
                    title: `Endre rekkefølge i ${group.name}`,
                    entries: group.items,
                    save: (orderedIds) =>
                      reorderPeriodItems({
                        data: { dashboardId, periodId: period.id, groupId: group.id, orderedIds },
                      }),
                  })
                }
                onChanged={refresh}
              />
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText />
                Forbruksliste
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PurchaseList period={period} dashboardId={dashboardId} onChanged={refresh} />
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {period.groups.length > 1 && (
              <Button
                size="lg"
                variant="outline"
                onClick={() =>
                  setReorderTarget({
                    title: "Endre rekkefølge på grupper",
                    entries: period.groups,
                    save: (orderedIds) =>
                      reorderPeriodGroups({
                        data: { dashboardId, periodId: period.id, orderedIds },
                      }),
                  })
                }
              >
                <ArrowDownUp data-icon="inline-start" />
                Sortér grupper
              </Button>
            )}
            <Button size="lg" variant="outline" onClick={() => setGroupOpen(true)}>
              <Plus data-icon="inline-start" />
              Legg til gruppe
            </Button>
          </div>
        </>
      )}

      <CreatePeriodModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        dashboardId={dashboardId}
        templates={templatesQuery.data ?? []}
        onCreated={async (newId) => {
          setSelectedPeriodId(newId);
          setCreateOpen(false);
          await periodsQuery.refetch();
          invalidateQueries(["budget-year", dashboardId]);
          toast.push("Budsjettperioden er opprettet", "success");
        }}
      />
      <PeriodItemModal
        open={itemTarget !== null}
        onClose={() => setItemTarget(null)}
        dashboardId={dashboardId}
        periodId={period?.id ?? 0}
        group={itemTarget}
        onSaved={async () => {
          setItemTarget(null);
          await refresh();
        }}
      />
      <PeriodGroupModal
        open={groupOpen || editingGroup !== null}
        onClose={() => {
          setGroupOpen(false);
          setEditingGroup(null);
        }}
        dashboardId={dashboardId}
        periodId={period?.id ?? 0}
        group={editingGroup}
        onSaved={async () => {
          setGroupOpen(false);
          setEditingGroup(null);
          await refresh();
        }}
      />
      <ReorderPeriodModal
        open={reorderTarget !== null}
        onClose={() => setReorderTarget(null)}
        target={reorderTarget}
        onSaved={async () => {
          setReorderTarget(null);
          await refresh();
        }}
      />
    </div>
  );
}

type Period = Awaited<ReturnType<typeof getBudgetPeriod>>;
type PeriodGroup = Period["groups"][number];
type PeriodItem = PeriodGroup["items"][number];
type BudgetPurchase = Period["purchases"][number];

function calculateTotals(groups: PeriodGroup[]) {
  return groups.reduce(
    (totals, group) => {
      for (const item of group.items) {
        const expected = toNumber(item.expected);
        const actual = toNumber(item.actual);
        if (group.kind === "income") {
          totals.incomeExpected += expected;
          totals.incomeActual += actual;
        } else {
          totals.expenseExpected += expected;
          totals.expenseActual += actual;
        }
      }
      totals.expectedBalance = totals.incomeExpected - totals.expenseExpected;
      totals.actualBalance = totals.incomeActual - totals.expenseActual;
      return totals;
    },
    {
      incomeExpected: 0,
      incomeActual: 0,
      expenseExpected: 0,
      expenseActual: 0,
      expectedBalance: 0,
      actualBalance: 0,
    },
  );
}

function ExpenseGroupOverview({ groups }: { groups: PeriodGroup[] }) {
  const expenseGroups = groups.filter((group) => group.kind === "expense");
  const actualDistribution = expenseGroups
    .map((group) => ({
      name: group.name,
      value: group.items.reduce((sum, item) => sum + toNumber(item.actual), 0),
      color: group.color,
    }))
    .filter((group) => group.value > 0);
  const totals = expenseGroups.reduce(
    (sum, group) => {
      const expected = group.items.reduce((value, item) => value + toNumber(item.expected), 0);
      const actual = group.items.reduce((value, item) => value + toNumber(item.actual), 0);
      return {
        expected: sum.expected + expected,
        actual: sum.actual + actual,
      };
    },
    { expected: 0, actual: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Oversikt utgifter</CardTitle>
      </CardHeader>
      <CardContent className="grid p-0 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Gruppe</TableHead>
                <TableHead className="text-right">Forventet</TableHead>
                <TableHead className="text-right">Faktisk</TableHead>
                <TableHead className="text-right">Differanse</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseGroups.map((group) => {
                const expected = group.items.reduce(
                  (sum, item) => sum + toNumber(item.expected),
                  0,
                );
                const actual = group.items.reduce((sum, item) => sum + toNumber(item.actual), 0);
                const difference = expected - actual;
                return (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNOK(expected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNOK(actual)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums",
                        difference < 0 && "text-destructive",
                        difference > 0 && "text-success",
                      )}
                    >
                      {formatNOK(difference)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Totalt</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatNOK(totals.expected)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatNOK(totals.actual)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold tabular-nums",
                    totals.expected - totals.actual < 0 && "text-destructive",
                    totals.expected - totals.actual > 0 && "text-success",
                  )}
                >
                  {formatNOK(totals.expected - totals.actual)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <ExpenseDistribution data={actualDistribution} total={totals.actual} />
      </CardContent>
    </Card>
  );
}

function ExpenseDistribution({
  data,
  total,
}: {
  data: Array<{ name: string; value: number; color: string }>;
  total: number;
}) {
  return (
    <div className="border-t px-6 py-5 lg:border-t-0 lg:border-l">
      {data.length > 0 ? (
        <>
          <MoneyDonut data={data} height={210} innerRadius={0} outerRadius={90} paddingAngle={1} />
          <ul className="flex flex-col gap-2" aria-label="Faktisk fordeling av utgifter">
            {data.map((group) => (
              <li key={group.name} className="flex min-w-0 items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <span className="min-w-0 flex-1 truncate" title={group.name}>
                  {group.name}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {formatPercent(group.value / total)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Ingen faktiske utgifter registrert ennå.</p>
      )}
    </div>
  );
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("nb-NO", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

function BudgetGroup({
  group,
  periodId,
  dashboardId,
  onAddItem,
  onEditGroup,
  onReorderItems,
  onChanged,
}: {
  group: PeriodGroup;
  periodId: number;
  dashboardId: string;
  onAddItem: () => void;
  onEditGroup: () => void;
  onReorderItems: () => void;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const [itemToDelete, setItemToDelete] = React.useState<PeriodItem | null>(null);
  const saveMutation = useMutation({
    fn: ({
      itemId,
      field,
      value,
    }: {
      itemId: number;
      field: "name" | "expected" | "actual";
      value: string;
    }) =>
      updatePeriodItem({
        data: {
          dashboardId,
          periodId,
          itemId,
          ...(field === "name" ? { name: value } : {}),
          ...(field === "expected" ? { expected: value } : {}),
          ...(field === "actual" ? { actual: value } : {}),
        },
      }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const deleteMutation = useMutation({
    fn: (itemId: number) => deletePeriodItem({ data: { dashboardId, periodId, itemId } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });
  const expected = group.items.reduce((sum, item) => sum + toNumber(item.expected), 0);
  const actual = group.items.reduce((sum, item) => sum + toNumber(item.actual), 0);
  const difference = group.kind === "income" ? actual - expected : expected - actual;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>{group.name}</span>
          <Button variant="ghost" size="lg" onClick={onEditGroup}>
            <Pencil data-icon="inline-start" />
            Endre gruppe
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead className="text-right">Forventet</TableHead>
                <TableHead className="text-right">Faktisk</TableHead>
                <TableHead className="text-right">Differanse</TableHead>
                <TableHead aria-label="Handlinger" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.items.map((item) => {
                const difference =
                  group.kind === "income"
                    ? toNumber(item.actual) - toNumber(item.expected)
                    : toNumber(item.expected) - toNumber(item.actual);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Input
                        key={`name-${item.id}-${item.name}`}
                        defaultValue={item.name}
                        aria-label={`Navn på ${item.name}`}
                        onBlur={(event) =>
                          saveMutation.mutate({
                            itemId: item.id,
                            field: "name",
                            value: event.target.value,
                          })
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="text"
                        inputMode="decimal"
                        key={`expected-${item.id}-${item.expected}`}
                        defaultValue={formatMoneyInput(item.expected)}
                        className="ml-auto w-28 text-right tabular-nums"
                        aria-label={`Forventet for ${item.name}`}
                        onBlur={(event) => {
                          saveMutation.mutate({
                            itemId: item.id,
                            field: "expected",
                            value: event.target.value,
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {group.isConsumption ? (
                        <span className="inline-flex h-9 items-center tabular-nums">
                          {formatNOK(item.actual)}
                        </span>
                      ) : (
                        <Input
                          type="text"
                          inputMode="decimal"
                          key={`actual-${item.id}-${item.actual}`}
                          defaultValue={formatMoneyInput(item.actual)}
                          className="ml-auto w-28 text-right tabular-nums"
                          aria-label={`Faktisk for ${item.name}`}
                          onBlur={(event) => {
                            saveMutation.mutate({
                              itemId: item.id,
                              field: "actual",
                              value: event.target.value,
                            });
                          }}
                        />
                      )}
                    </TableCell>
                    <TableCell
                      className={
                        difference < 0
                          ? "text-destructive text-right tabular-nums"
                          : difference > 0
                            ? "text-success text-right tabular-nums"
                            : "text-right tabular-nums"
                      }
                    >
                      {formatNOK(difference)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        aria-label={`Slett ${item.name}`}
                        onClick={() => setItemToDelete(item)}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-semibold">Totalt</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatNOK(expected)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatNOK(actual)}
                </TableCell>
                <TableCell
                  className={
                    difference < 0
                      ? "text-destructive text-right font-semibold tabular-nums"
                      : difference > 0
                        ? "text-success text-right font-semibold tabular-nums"
                        : "text-right font-semibold tabular-nums"
                  }
                >
                  {formatNOK(difference)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <div className="flex flex-wrap gap-2">
          {group.items.length > 1 && (
            <Button size="lg" variant="outline" onClick={onReorderItems}>
              <ArrowDownUp data-icon="inline-start" />
              Sortér poster
            </Button>
          )}
          <Button size="lg" variant="outline" onClick={onAddItem}>
            <Plus data-icon="inline-start" />
            {group.kind === "income" ? "Legg til inntekt" : "Legg til utgift"}
          </Button>
        </div>
        <DeleteConfirmationDialog
          open={itemToDelete !== null}
          onOpenChange={(open) => {
            if (!open) setItemToDelete(null);
          }}
          title="Slette posten?"
          description={<>Posten «{itemToDelete?.name}» blir slettet fra denne budsjettperioden.</>}
          busy={deleteMutation.loading}
          onConfirm={() => {
            if (!itemToDelete) return;
            deleteMutation.mutate(itemToDelete.id);
            setItemToDelete(null);
          }}
          confirmLabel="Slett post"
        />
      </CardContent>
    </Card>
  );
}

function ReorderPeriodModal({
  open,
  onClose,
  target,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  target: {
    title: string;
    entries: Array<{ id: number; name: string }>;
    save: (orderedIds: number[]) => Promise<unknown>;
  } | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [order, setOrder] = React.useState<Array<{ id: number; name: string }>>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [overIndex, setOverIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!open || !target) return;
    setOrder(target.entries);
    setDragIndex(null);
    setOverIndex(null);
  }, [open, target]);

  const move = (index: number, delta: -1 | 1) => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= order.length) return;
    const next = [...order];
    [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
    setOrder(next);
  };
  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [entry] = next.splice(from, 1);
    next.splice(to, 0, entry!);
    setOrder(next);
  };
  const isChanged = order.some((entry, index) => entry.id !== target?.entries[index]?.id);
  const saveMutation = useMutation({
    fn: () => {
      if (!target) throw new Error("Ingen rekkefølge å lagre");
      return target.save(order.map((entry) => entry.id));
    },
    onSuccess: () => void onSaved(),
    onError: (error) => toast.push(error.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={target?.title ?? "Endre rekkefølge"}
      footer={
        <>
          <Button
            size="lg"
            variant="ghost"
            className="mr-auto"
            disabled={!isChanged || saveMutation.loading}
            onClick={() => target && setOrder(target.entries)}
          >
            Tilbakestill
          </Button>
          <Button size="lg" variant="outline" disabled={saveMutation.loading} onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!isChanged || saveMutation.loading}
            onClick={() => saveMutation.mutate(undefined)}
          >
            Lagre
          </Button>
        </>
      }
    >
      <p className="text-muted-foreground text-xs">Dra radene for å sortere, eller bruk pilene.</p>
      <ul className="mt-3 max-h-96 overflow-auto">
        {order.map((entry, index) => {
          const isDragged = dragIndex === index;
          const isOver = overIndex === index && dragIndex !== null && dragIndex !== index;
          return (
            <li
              key={entry.id}
              draggable
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", entry.id.toString());
              }}
              onDragOver={(event) => {
                event.preventDefault();
                if (overIndex !== index) setOverIndex(index);
              }}
              onDragLeave={() => {
                if (overIndex === index) setOverIndex(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null) moveTo(dragIndex, index);
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
              <GripVertical className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="text-muted-foreground w-6 text-right text-xs tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Flytt ${entry.name} opp`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Flytt ${entry.name} ned`}
                  disabled={index === order.length - 1}
                  onClick={() => move(index, 1)}
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

function PurchaseList({
  period,
  dashboardId,
  onChanged,
}: {
  period: Period;
  dashboardId: string;
  onChanged: () => Promise<void>;
}) {
  const toast = useToast();
  const consumptionItems = period.groups
    .filter((group) => group.isConsumption)
    .flatMap((group) => group.items);
  const [occurredAt, setOccurredAt] = React.useState(todayISO());
  const [description, setDescription] = React.useState("");
  const [itemId, setItemId] = React.useState<number | null>(consumptionItems[0]?.id ?? null);
  const [amount, setAmount] = React.useState("");
  const [editingPurchase, setEditingPurchase] = React.useState<BudgetPurchase | null>(null);
  const [purchaseToDelete, setPurchaseToDelete] = React.useState<BudgetPurchase | null>(null);
  const descriptionSuggestions = getPurchaseDescriptionSuggestions(period.purchases);
  React.useEffect(() => {
    const today = todayISO();
    setOccurredAt(
      today < period.startDate ? period.startDate : today > period.endDate ? period.endDate : today,
    );
    setItemId(consumptionItems[0]?.id ?? null);
    setDescription("");
    setAmount("");
    setEditingPurchase(null);
    setPurchaseToDelete(null);
  }, [period.id, period.startDate, period.endDate]);
  React.useEffect(() => {
    if (itemId !== null && consumptionItems.some((item) => item.id === itemId)) return;
    setItemId(consumptionItems[0]?.id ?? null);
  }, [consumptionItems, itemId]);
  const addMutation = useMutation({
    fn: () => {
      if (!itemId) throw new Error("Velg en Forbruk-post");
      return createBudgetPurchase({
        data: { dashboardId, periodId: period.id, itemId, occurredAt, description, amount },
      });
    },
    onSuccess: async () => {
      setDescription("");
      setAmount("");
      await onChanged();
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  const deleteMutation = useMutation({
    fn: (purchaseId: number) =>
      deleteBudgetPurchase({ data: { dashboardId, periodId: period.id, purchaseId } }),
    onSuccess: () => void onChanged(),
    onError: (error) => toast.push(error.message, "error"),
  });

  if (consumptionItems.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Legg til en Forbruk-gruppe og poster for å registrere kjøp.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-[9rem_1fr_12rem_9rem_auto]">
        <Field>
          <FieldLabel htmlFor="purchase-date">Dato</FieldLabel>
          <Input
            id="purchase-date"
            type="date"
            className="h-8"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="purchase-description">Hva?</FieldLabel>
          <Input
            id="purchase-description"
            className="h-8"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            list={`purchase-descriptions-${period.id}`}
            autoComplete="off"
          />
          <datalist id={`purchase-descriptions-${period.id}`}>
            {descriptionSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="purchase-item">Forbruk</FieldLabel>
          <select
            id="purchase-item"
            className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm"
            value={itemId ?? ""}
            onChange={(event) => setItemId(Number(event.target.value))}
          >
            {consumptionItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="purchase-amount">Beløp</FieldLabel>
          <Input
            id="purchase-amount"
            type="text"
            inputMode="decimal"
            className="h-8"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
        <Button
          size="lg"
          className="self-end"
          disabled={!description.trim() || !amount || addMutation.loading}
          onClick={() => addMutation.mutate(undefined)}
        >
          <Plus data-icon="inline-start" />
          Legg til
        </Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dato</TableHead>
              <TableHead>Hva?</TableHead>
              <TableHead>Forbruk</TableHead>
              <TableHead className="text-right">Beløp</TableHead>
              <TableHead aria-label="Handlinger" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {period.purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>{formatPeriod(purchase.occurredAt)}</TableCell>
                <TableCell>{purchase.description}</TableCell>
                <TableCell>
                  {consumptionItems.find((item) => item.id === purchase.itemId)?.name ?? "Ukjent"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNOK(purchase.amount, true)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Endre ${purchase.description}`}
                    onClick={() => setEditingPurchase(purchase)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    aria-label={`Slett ${purchase.description}`}
                    onClick={() => setPurchaseToDelete(purchase)}
                  >
                    <Trash2 />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <PurchaseModal
        open={editingPurchase !== null}
        onClose={() => setEditingPurchase(null)}
        dashboardId={dashboardId}
        periodId={period.id}
        purchase={editingPurchase}
        purchases={period.purchases}
        consumptionItems={consumptionItems}
        onSaved={async () => {
          setEditingPurchase(null);
          await onChanged();
        }}
      />
      <DeleteConfirmationDialog
        open={purchaseToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPurchaseToDelete(null);
        }}
        title="Slette kjøpet?"
        description={<>Kjøpet «{purchaseToDelete?.description}» fjernes fra forbrukslisten.</>}
        busy={deleteMutation.loading}
        onConfirm={() => {
          if (!purchaseToDelete) return;
          deleteMutation.mutate(purchaseToDelete.id);
          setPurchaseToDelete(null);
        }}
        confirmLabel="Slett kjøp"
      />
    </div>
  );
}

function PurchaseModal({
  open,
  onClose,
  dashboardId,
  periodId,
  purchase,
  purchases,
  consumptionItems,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  periodId: number;
  purchase: BudgetPurchase | null;
  purchases: BudgetPurchase[];
  consumptionItems: PeriodItem[];
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [occurredAt, setOccurredAt] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [itemId, setItemId] = React.useState<number | null>(null);
  const [amount, setAmount] = React.useState("");
  const descriptionSuggestions = getPurchaseDescriptionSuggestions(purchases);

  React.useEffect(() => {
    if (!purchase) return;
    setOccurredAt(purchase.occurredAt);
    setDescription(purchase.description);
    setItemId(purchase.itemId);
    setAmount(formatMoneyInput(purchase.amount));
  }, [purchase]);

  const mutation = useMutation({
    fn: () => {
      if (!purchase || !itemId) throw new Error("Velg en Forbruk-post");
      return updateBudgetPurchase({
        data: {
          dashboardId,
          periodId,
          purchaseId: purchase.id,
          itemId,
          occurredAt,
          description,
          amount,
        },
      });
    },
    onSuccess: () => void onSaved(),
    onError: (error) => toast.push(error.message, "error"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Endre kjøp"
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!description.trim() || !amount || !itemId || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            Lagre endringer
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="edit-purchase-date">Dato</FieldLabel>
          <Input
            id="edit-purchase-date"
            type="date"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-purchase-description">Hva?</FieldLabel>
          <Input
            id="edit-purchase-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            list={`edit-purchase-descriptions-${periodId}`}
            autoComplete="off"
          />
          <datalist id={`edit-purchase-descriptions-${periodId}`}>
            {descriptionSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-purchase-item">Forbruk</FieldLabel>
          <select
            id="edit-purchase-item"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={itemId ?? ""}
            onChange={(event) => setItemId(Number(event.target.value))}
          >
            {consumptionItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <FieldLabel htmlFor="edit-purchase-amount">Beløp</FieldLabel>
          <Input
            id="edit-purchase-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CreatePeriodModal({
  open,
  onClose,
  dashboardId,
  templates,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  templates: Awaited<ReturnType<typeof listBudgetTemplates>>;
  onCreated: (id: number) => Promise<void>;
}) {
  const toast = useToast();
  const [month, setMonth] = React.useState(() => todayISO().slice(0, 7));
  const [templateId, setTemplateId] = React.useState<number | null>(templates[0]?.id ?? null);
  React.useEffect(() => {
    if (!templateId && templates[0]) setTemplateId(templates[0].id);
  }, [templateId, templates]);
  const mutation = useMutation({
    fn: () => {
      if (!templateId) throw new Error("Velg en mal");
      return createBudgetPeriod({ data: { dashboardId, periodMonth: month, templateId } });
    },
    onSuccess: (period) => void onCreated(period.id),
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Opprett budsjettperiode"
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!templateId || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            Opprett
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="period-month">Budsjettmåned</FieldLabel>
          <Input
            id="period-month"
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Perioden går fra lønningsdag til dagen før neste lønningsdag.
          </p>
        </Field>
        <Field>
          <FieldLabel htmlFor="period-template">Mal</FieldLabel>
          <select
            id="period-template"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={templateId ?? ""}
            onChange={(event) => setTemplateId(Number(event.target.value))}
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function PeriodItemModal({
  open,
  onClose,
  dashboardId,
  periodId,
  group,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  periodId: number;
  group: { id: number; name: string } | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [expected, setExpected] = React.useState("");
  const mutation = useMutation({
    fn: () => {
      if (!group) throw new Error("Velg gruppe");
      return createPeriodItem({
        data: {
          dashboardId,
          periodId,
          groupId: group.id,
          name: name.trim(),
          expected,
        },
      });
    },
    onSuccess: () => {
      setName("");
      setExpected("");
      void onSaved();
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Ny post i ${group?.name ?? "gruppe"}`}
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!name.trim() || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            Legg til
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="item-name">Navn</FieldLabel>
          <Input id="item-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="item-expected">Forventet beløp</FieldLabel>
          <Input
            id="item-expected"
            type="text"
            inputMode="decimal"
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

function PeriodGroupModal({
  open,
  onClose,
  dashboardId,
  periodId,
  group,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  periodId: number;
  group: PeriodGroup | null;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(group?.name ?? "");
  const [kind, setKind] = React.useState<"income" | "expense">(
    (group?.kind as "income" | "expense" | undefined) ?? "expense",
  );
  const [consumption, setConsumption] = React.useState(group?.isConsumption ?? false);
  const [color, setColor] = React.useState(group?.color ?? DEFAULT_BUDGET_GROUP_COLOR);
  React.useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setKind((group?.kind as "income" | "expense" | undefined) ?? "expense");
    setConsumption(group?.isConsumption ?? false);
    setColor(group?.color ?? DEFAULT_BUDGET_GROUP_COLOR);
  }, [group, open]);
  const mutation = useMutation({
    fn: async () => {
      if (group) {
        await updatePeriodGroup({
          data: {
            dashboardId,
            periodId,
            groupId: group.id,
            name,
            isConsumption: consumption,
            color,
          },
        });
        return;
      }
      await createPeriodGroup({
        data: { dashboardId, periodId, name, kind, isConsumption: consumption, color },
      });
    },
    onSuccess: () => {
      setName("");
      setConsumption(false);
      setColor(DEFAULT_BUDGET_GROUP_COLOR);
      void onSaved();
    },
    onError: (error) => toast.push(error.message, "error"),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={group ? "Endre gruppe" : "Ny gruppe"}
      footer={
        <>
          <Button size="lg" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button
            size="lg"
            disabled={!name.trim() || mutation.loading}
            onClick={() => mutation.mutate(undefined)}
          >
            {group ? "Lagre" : "Legg til"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="group-name">Navn</FieldLabel>
          <Input id="group-name" value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        {!group && (
          <Field>
            <FieldLabel htmlFor="group-kind">Type</FieldLabel>
            <select
              id="group-kind"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={kind}
              onChange={(event) => {
                const value = event.target.value as "income" | "expense";
                setKind(value);
                if (value === "income") setConsumption(false);
              }}
            >
              <option value="expense">Utgift</option>
              <option value="income">Inntekt</option>
            </select>
          </Field>
        )}
        {kind === "expense" && (
          <ConsumptionGroupField checked={consumption} onCheckedChange={setConsumption} />
        )}
        <GroupColorField color={color} onColorChange={setColor} />
      </div>
    </Modal>
  );
}

function formatPeriod(date: string) {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00`));
}

function formatBudgetMonth(date: string) {
  return new Intl.DateTimeFormat("nb-NO", { month: "long", year: "numeric" }).format(
    new Date(`${date}T00:00:00`),
  );
}

function getPurchaseDescriptionSuggestions(purchases: BudgetPurchase[]) {
  return [...purchases]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id - a.id)
    .reduce<string[]>((suggestions, purchase) => {
      if (!suggestions.includes(purchase.description)) suggestions.push(purchase.description);
      return suggestions;
    }, []);
}
