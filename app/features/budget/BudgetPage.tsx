import * as React from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
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
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Field, FieldLabel } from "../../components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import { MoneyDonut } from "../../components/charts";
import {
  createCategory,
  deleteCategory,
  getBudgetMonth,
  updateCategory,
  upsertBudgetEntry,
} from "~/features/budget/server";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { CATEGORY_KIND_LABEL, type CategoryKind } from "../../lib/enums";
import { pickColor } from "../../lib/colors";
import {
  currentYearMonth,
  formatNOK,
  monthLabel,
  nextYearMonth,
  previousYearMonth,
  toNumber,
} from "../../lib/utils";
import type { BudgetEntry, Category } from "../../../db/schema";

export function BudgetPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [yearMonth, setYearMonth] = React.useState<string>(() => currentYearMonth());
  const [showCategoryModal, setShowCategoryModal] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null);

  const queryKey = React.useMemo(
    () => ["budget-month", dashboardId, yearMonth],
    [dashboardId, yearMonth],
  );
  const { data, isInitialLoading, refetch } = useQuery({
    key: queryKey,
    fn: () => getBudgetMonth({ data: { dashboardId, yearMonth } }),
  });

  const upsertEntry = useMutation({
    fn: (input: { categoryId: number; field: "budgeted" | "actual"; value: number }) =>
      upsertBudgetEntry({
        data: { dashboardId, categoryId: input.categoryId, yearMonth, [input.field]: input.value },
      }),
    onSuccess: () => {
      void refetch();
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

  const entryByCategoryId = new Map(data.entries.map((e) => [e.categoryId, e]));
  const groups = groupCategories(data.categories);
  const totals = computeTotals(data.categories, data.entries);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budsjett"
        subtitle={monthLabel(yearMonth)}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setYearMonth(previousYearMonth(yearMonth))}
            >
              <ChevronLeft />
            </Button>
            <Input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="max-w-[170px]"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setYearMonth(nextYearMonth(yearMonth))}
            >
              <ChevronRight />
            </Button>
            <Button
              onClick={() => {
                setEditingCategory(null);
                setShowCategoryModal(true);
              }}
            >
              <Plus />
              Kategori
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Inntekt budsjett" value={totals.incomeBudget} />
        <StatCard label="Inntekt faktisk" value={totals.incomeActual} tone="positive" />
        <StatCard label="Utgift budsjett" value={totals.expenseBudget} />
        <StatCard label="Utgift faktisk" value={totals.expenseActual} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Resultat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Budsjett (inntekt - utgift)"
              value={totals.incomeBudget - totals.expenseBudget}
            />
            <Row
              label="Faktisk (inntekt - utgift)"
              value={totals.incomeActual - totals.expenseActual}
              positive
            />
            <Row
              label="Avvik (faktisk - budsjett)"
              value={
                totals.incomeActual -
                totals.expenseActual -
                (totals.incomeBudget - totals.expenseBudget)
              }
            />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Utgiftsfordeling (faktisk)</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseDonut categories={data.categories} entries={data.entries} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detaljer</CardTitle>
        </CardHeader>
        <CardContent>
          {groups.length === 0 && (
            <Empty
              title="Ingen kategorier"
              description="Legg til kategorier for å begynne å budsjettere."
            />
          )}
          {groups.map(({ groupName, items, kind }) => {
            const groupBudget = items.reduce(
              (s, c) => s + toNumber(entryByCategoryId.get(c.id)?.budgeted),
              0,
            );
            const groupActual = items.reduce(
              (s, c) => s + toNumber(entryByCategoryId.get(c.id)?.actual),
              0,
            );
            return (
              <div key={`${kind}-${groupName}`} className="mb-6 last:mb-0">
                <div className="mb-2 flex items-baseline justify-between">
                  <h4 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold tracking-wider uppercase">
                    {groupName}
                    <Badge variant="secondary">{CATEGORY_KIND_LABEL[kind]}</Badge>
                  </h4>
                  <div className="text-muted-foreground text-xs tabular-nums">
                    {formatNOK(groupActual)} / {formatNOK(groupBudget)}
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Kategori</TableHead>
                        <TableHead className="text-right">Budsjett</TableHead>
                        <TableHead className="text-right">Faktisk</TableHead>
                        <TableHead className="text-right">Avvik</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((cat) => {
                        const entry = entryByCategoryId.get(cat.id);
                        const budgeted = toNumber(entry?.budgeted);
                        const actual = toNumber(entry?.actual);
                        const diff = kind === "income" ? actual - budgeted : budgeted - actual;
                        return (
                          <TableRow key={cat.id}>
                            <TableCell>{cat.name}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                key={`budgeted-${cat.id}-${budgeted}`}
                                type="number"
                                step="1"
                                defaultValue={budgeted || ""}
                                onBlur={(e) =>
                                  upsertEntry.mutate({
                                    categoryId: cat.id,
                                    field: "budgeted",
                                    value: toNumber(e.target.value),
                                  })
                                }
                                className="ml-auto w-32 text-right tabular-nums"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                key={`actual-${cat.id}-${actual}`}
                                type="number"
                                step="1"
                                defaultValue={actual || ""}
                                onBlur={(e) =>
                                  upsertEntry.mutate({
                                    categoryId: cat.id,
                                    field: "actual",
                                    value: toNumber(e.target.value),
                                  })
                                }
                                className="ml-auto w-32 text-right tabular-nums"
                                placeholder="0"
                              />
                            </TableCell>
                            <TableCell
                              className={
                                diff < 0
                                  ? "text-destructive text-right tabular-nums"
                                  : diff > 0
                                    ? "text-success text-right tabular-nums"
                                    : "text-right tabular-nums"
                              }
                            >
                              {formatNOK(diff)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  setEditingCategory(cat);
                                  setShowCategoryModal(true);
                                }}
                              >
                                Endre
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <CategoryModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        dashboardId={dashboardId}
        category={editingCategory}
        onSaved={async (msg) => {
          setShowCategoryModal(false);
          invalidateQueries(["budget-month", dashboardId]);
          await refetch();
          toast.push(msg, "success");
        }}
      />
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          value < 0
            ? "text-destructive font-semibold tabular-nums"
            : positive && value > 0
              ? "text-success font-semibold tabular-nums"
              : "font-semibold tabular-nums"
        }
      >
        {formatNOK(value)}
      </span>
    </div>
  );
}

function groupCategories(categories: ReadonlyArray<Category>) {
  const map = new Map<string, { groupName: string; kind: CategoryKind; items: Category[] }>();
  for (const c of categories) {
    const k = `${c.kind}::${c.groupName}`;
    if (!map.has(k)) {
      map.set(k, { groupName: c.groupName, kind: c.kind as CategoryKind, items: [] });
    }
    map.get(k)!.items.push(c);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "income" ? -1 : 1;
    return a.groupName.localeCompare(b.groupName, "nb");
  });
}

function computeTotals(categories: ReadonlyArray<Category>, entries: ReadonlyArray<BudgetEntry>) {
  const catKind = new Map(categories.map((c) => [c.id, c.kind]));
  let incomeBudget = 0,
    incomeActual = 0,
    expenseBudget = 0,
    expenseActual = 0;
  for (const e of entries) {
    const k = catKind.get(e.categoryId);
    if (k === "income") {
      incomeBudget += toNumber(e.budgeted);
      incomeActual += toNumber(e.actual);
    } else if (k === "expense") {
      expenseBudget += toNumber(e.budgeted);
      expenseActual += toNumber(e.actual);
    }
  }
  return { incomeBudget, incomeActual, expenseBudget, expenseActual };
}

function ExpenseDonut({
  categories,
  entries,
}: {
  categories: ReadonlyArray<Category>;
  entries: ReadonlyArray<BudgetEntry>;
}) {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const byGroup = new Map<string, number>();
  for (const e of entries) {
    const c = catMap.get(e.categoryId);
    if (!c || c.kind !== "expense") continue;
    const v = toNumber(e.actual);
    if (v <= 0) continue;
    byGroup.set(c.groupName, (byGroup.get(c.groupName) ?? 0) + v);
  }
  const data = Array.from(byGroup.entries()).map(([name, value], i) => ({
    name,
    value,
    color: pickColor(i),
  }));
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">Ingen faktiske utgifter enda.</p>;
  }
  const total = data.reduce((s, x) => s + x.value, 0);
  return (
    <div className="grid items-center gap-4 md:grid-cols-2">
      <MoneyDonut data={data} height={220} />
      <div className="space-y-1.5">
        {data.map((d) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="tabular-nums">
                  {formatNOK(d.value)} ({pct.toFixed(0)} %)
                </span>
              </div>
              <ProgressBar value={d.value} max={total} color={d.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryModal({
  open,
  onClose,
  dashboardId,
  category,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  category: Category | null;
  onSaved: (message: string) => void;
}) {
  const form = useFormState(
    {
      name: category?.name ?? "",
      kind: (category?.kind as CategoryKind | undefined) ?? "expense",
      groupName: category?.groupName ?? "Annet",
    },
    { resetWhen: open ? (category ?? "new") : null },
  );
  const toast = useToast();

  const saveMutation = useMutation({
    fn: async () => {
      if (category) {
        await updateCategory({
          data: { dashboardId, id: category.id, ...form.values },
        });
        return "Kategori oppdatert";
      }
      await createCategory({ data: { dashboardId, ...form.values } });
      return "Kategori opprettet";
    },
    onSuccess: (msg) => onSaved(msg),
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: async () => {
      if (!category) throw new Error("Ingen kategori");
      await deleteCategory({ data: { dashboardId, id: category.id } });
    },
    onSuccess: () => onSaved("Kategori slettet"),
    onError: (e) => toast.push(e.message, "error"),
  });

  const busy = saveMutation.loading || deleteMutation.loading;
  const canSave = !!form.values.name.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Endre kategori" : "Ny kategori"}
      footer={
        <>
          {category && (
            <Button
              variant="destructive"
              className="mr-auto"
              disabled={busy}
              onClick={() => {
                if (confirm(`Slette "${category.name}"? Alle budsjettlinjer forsvinner også.`)) {
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
      <div className="space-y-3">
        <Field>
          <FieldLabel htmlFor="cat-name">Navn</FieldLabel>
          <Input
            id="cat-name"
            autoFocus
            value={form.values.name}
            onChange={form.setField("name")}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Type</FieldLabel>
            <ToggleGroup
              variant="outline"
              value={[form.values.kind]}
              onValueChange={(vals) => {
                const v = vals[0] as CategoryKind | undefined;
                if (v) form.set("kind", v);
              }}
            >
              <ToggleGroupItem value="income">Inntekt</ToggleGroupItem>
              <ToggleGroupItem value="expense">Utgift</ToggleGroupItem>
            </ToggleGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="cat-group">Gruppe</FieldLabel>
            <Input
              id="cat-group"
              value={form.values.groupName}
              onChange={form.setField("groupName")}
              list="grp"
            />
            <datalist id="grp">
              <option value="Inntekt" />
              <option value="Faste utgifter" />
              <option value="Variable utgifter" />
              <option value="Sparing" />
              <option value="Annet" />
            </datalist>
          </Field>
        </div>
      </div>
    </Modal>
  );
}
