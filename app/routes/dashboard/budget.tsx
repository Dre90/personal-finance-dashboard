import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { PageHeader, StatCard, Modal, ProgressBar } from "../../components/ui";
import {
  createCategory,
  deleteCategory,
  getBudgetMonth,
  updateCategory,
  upsertBudgetEntry,
} from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import {
  currentYearMonth,
  formatNOK,
  monthLabel,
  nextYearMonth,
  previousYearMonth,
  toNumber,
} from "../../lib/utils";
import type { Category, BudgetEntry } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/budget")({
  component: BudgetPage,
});

function BudgetPage() {
  const dashboardId = useDashboardId();
  const [yearMonth, setYearMonth] = React.useState<string>(() => currentYearMonth());
  const [showCategoryModal, setShowCategoryModal] = React.useState(false);
  const [editingCategory, setEditingCategory] = React.useState<Category | null>(null);

  const { data, loading, refetch } = useServerData(
    async () =>
      dashboardId
        ? getBudgetMonth({ data: { dashboardId, yearMonth } })
        : Promise.resolve(null),
    [dashboardId, yearMonth],
  );

  if (loading || !data) return <div className="text-[color:var(--color-muted)]">Laster…</div>;
  if (!dashboardId) return null;

  const entryByCategoryId = new Map(data.entries.map((e) => [e.categoryId, e]));

  const groups = groupCategories(data.categories);
  const totals = computeTotals(data.categories, data.entries);

  async function handleEntryChange(
    categoryId: number,
    field: "budgeted" | "actual",
    value: string,
  ) {
    const n = toNumber(value);
    await upsertBudgetEntry({
      data: { dashboardId, categoryId, yearMonth, [field]: n },
    });
    await refetch();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Budsjett"
        subtitle={monthLabel(yearMonth)}
        actions={
          <>
            <button onClick={() => setYearMonth(previousYearMonth(yearMonth))} className="btn btn-ghost">
              ← Forrige
            </button>
            <input
              type="month"
              value={yearMonth}
              onChange={(e) => setYearMonth(e.target.value)}
              className="input max-w-[170px]"
            />
            <button onClick={() => setYearMonth(nextYearMonth(yearMonth))} className="btn btn-ghost">
              Neste →
            </button>
            <button onClick={() => { setEditingCategory(null); setShowCategoryModal(true); }} className="btn btn-primary">
              + Kategori
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Inntekt budsjett" value={totals.incomeBudget} />
        <StatCard label="Inntekt faktisk" value={totals.incomeActual} tone="positive" />
        <StatCard label="Utgift budsjett" value={totals.expenseBudget} />
        <StatCard label="Utgift faktisk" value={totals.expenseActual} tone="warn" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card">
          <h3 className="font-semibold mb-3">Resultat</h3>
          <div className="space-y-2 text-sm">
            <Row label="Budsjett (inntekt - utgift)" value={totals.incomeBudget - totals.expenseBudget} />
            <Row label="Faktisk (inntekt - utgift)" value={totals.incomeActual - totals.expenseActual} positive />
            <Row label="Avvik (faktisk - budsjett)" value={(totals.incomeActual - totals.expenseActual) - (totals.incomeBudget - totals.expenseBudget)} />
          </div>
        </div>

        <div className="card lg:col-span-2">
          <h3 className="font-semibold mb-3">Utgiftsfordeling (faktisk)</h3>
          <ExpenseDonut categories={data.categories} entries={data.entries} />
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3">Detaljer</h3>
        {groups.map(({ groupName, items, kind }) => {
          const groupBudget = items.reduce((s, c) => s + toNumber(entryByCategoryId.get(c.id)?.budgeted), 0);
          const groupActual = items.reduce((s, c) => s + toNumber(entryByCategoryId.get(c.id)?.actual), 0);
          return (
            <div key={`${kind}-${groupName}`} className="mb-6 last:mb-0">
              <div className="flex justify-between items-baseline mb-2">
                <h4 className="font-semibold text-sm uppercase tracking-wider text-[color:var(--color-muted)]">
                  {groupName} <span className="ml-2 badge">{kind === "income" ? "Inntekt" : "Utgift"}</span>
                </h4>
                <div className="text-xs text-[color:var(--color-muted)] num">
                  {formatNOK(groupActual)} / {formatNOK(groupBudget)}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="w-[40%]">Kategori</th>
                      <th className="text-right">Budsjett</th>
                      <th className="text-right">Faktisk</th>
                      <th className="text-right">Avvik</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((cat) => {
                      const entry = entryByCategoryId.get(cat.id);
                      const budgeted = toNumber(entry?.budgeted);
                      const actual = toNumber(entry?.actual);
                      const diff = kind === "income" ? actual - budgeted : budgeted - actual;
                      return (
                        <tr key={cat.id}>
                          <td>{cat.name}</td>
                          <td className="text-right">
                            <input
                              type="number"
                              step="1"
                              defaultValue={budgeted || ""}
                              onBlur={(e) => handleEntryChange(cat.id, "budgeted", e.target.value)}
                              className="input text-right num w-32 ml-auto"
                              placeholder="0"
                            />
                          </td>
                          <td className="text-right">
                            <input
                              type="number"
                              step="1"
                              defaultValue={actual || ""}
                              onBlur={(e) => handleEntryChange(cat.id, "actual", e.target.value)}
                              className="input text-right num w-32 ml-auto"
                              placeholder="0"
                            />
                          </td>
                          <td className={`text-right num ${diff < 0 ? "neg" : diff > 0 ? "pos" : ""}`}>
                            {formatNOK(diff)}
                          </td>
                          <td className="text-right">
                            <button onClick={() => { setEditingCategory(cat); setShowCategoryModal(true); }} className="text-xs text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]">
                              Endre
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>

      <CategoryModal
        open={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        dashboardId={dashboardId}
        category={editingCategory}
        onSaved={async () => { setShowCategoryModal(false); await refetch(); }}
      />
    </div>
  );
}

function Row({ label, value, positive }: { label: string; value: number; positive?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-[color:var(--color-muted)]">{label}</span>
      <span className={`num font-semibold ${value < 0 ? "neg" : positive && value > 0 ? "pos" : ""}`}>
        {formatNOK(value)}
      </span>
    </div>
  );
}

function groupCategories(categories: Category[]) {
  const map = new Map<string, { groupName: string; kind: "income" | "expense"; items: Category[] }>();
  for (const c of categories) {
    const k = `${c.kind}::${c.groupName}`;
    if (!map.has(k)) map.set(k, { groupName: c.groupName, kind: c.kind as "income" | "expense", items: [] });
    map.get(k)!.items.push(c);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "income" ? -1 : 1;
    return a.groupName.localeCompare(b.groupName, "nb");
  });
}

function computeTotals(categories: Category[], entries: BudgetEntry[]) {
  const catKind = new Map(categories.map((c) => [c.id, c.kind]));
  let incomeBudget = 0, incomeActual = 0, expenseBudget = 0, expenseActual = 0;
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

function ExpenseDonut({ categories, entries }: { categories: Category[]; entries: BudgetEntry[] }) {
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
    color: COLORS[i % COLORS.length],
  }));
  if (data.length === 0) return <p className="text-sm text-[color:var(--color-muted)]">Ingen faktiske utgifter enda.</p>;
  return (
    <div className="grid md:grid-cols-2 gap-4 items-center">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={45}>
            {data.map((d, i) => (<Cell key={i} fill={d.color} />))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }}
            formatter={(v: any) => formatNOK(v)}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-1.5">
        {data.map((d) => {
          const total = data.reduce((s, x) => s + x.value, 0);
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <div key={d.name}>
              <div className="flex justify-between text-xs mb-1">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="num">{formatNOK(d.value)} ({pct.toFixed(0)} %)</span>
              </div>
              <ProgressBar value={d.value} max={total} color={d.color} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#a855f7"];

function CategoryModal({
  open, onClose, dashboardId, category, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  category: Category | null;
  onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"income" | "expense">("expense");
  const [groupName, setGroupName] = React.useState("Annet");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setKind((category?.kind as "income" | "expense") ?? "expense");
      setGroupName(category?.groupName ?? "Annet");
    }
  }, [open, category]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (category) {
        await updateCategory({ data: { dashboardId, id: category.id, name: name.trim(), kind, groupName } });
      } else {
        await createCategory({ data: { dashboardId, name: name.trim(), kind, groupName } });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!category) return;
    if (!confirm(`Slette "${category.name}"? Alle budsjettlinjer for kategorien forsvinner også.`)) return;
    setBusy(true);
    try {
      await deleteCategory({ data: { dashboardId, id: category.id } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={category ? "Endre kategori" : "Ny kategori"}
      footer={
        <>
          {category && <button onClick={remove} className="btn btn-danger mr-auto" disabled={busy}>Slett</button>}
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
            <label className="label">Type</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")}>
              <option value="income">Inntekt</option>
              <option value="expense">Utgift</option>
            </select>
          </div>
          <div>
            <label className="label">Gruppe</label>
            <input className="input" value={groupName} onChange={(e) => setGroupName(e.target.value)} list="grp" />
            <datalist id="grp">
              <option value="Inntekt" />
              <option value="Faste utgifter" />
              <option value="Variable utgifter" />
              <option value="Sparing" />
              <option value="Annet" />
            </datalist>
          </div>
        </div>
      </div>
    </Modal>
  );
}
