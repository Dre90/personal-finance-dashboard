import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { PageHeader, StatCard, Empty, Modal } from "../../components/ui";
import {
  createAsset,
  deleteAsset,
  deleteAssetSnapshot,
  listAssets,
  updateAsset,
  upsertAssetSnapshot,
} from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { formatNOK, todayISO, toNumber } from "../../lib/utils";
import type { Asset } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/assets")({
  component: AssetsPage,
});

const KIND_LABEL: Record<string, string> = {
  ask: "ASK",
  pension: "Pensjon",
  cash: "Kontanter / sparekonto",
  other: "Annet",
};

function AssetsPage() {
  const dashboardId = useDashboardId();
  const [openAsset, setOpenAsset] = React.useState(false);
  const [editing, setEditing] = React.useState<Asset | null>(null);
  const [snapshotFor, setSnapshotFor] = React.useState<Asset | null>(null);

  const { data, loading, refetch } = useServerData(
    async () => (dashboardId ? listAssets({ data: { dashboardId } }) : Promise.resolve(null)),
    [dashboardId],
  );
  if (loading || !data || !dashboardId) return <div className="text-[color:var(--color-muted)]">Laster…</div>;

  const valuePerAsset = new Map<number, number>();
  for (const a of data.assets) {
    const snaps = data.snapshotsByAsset[a.id] ?? [];
    const last = snaps[snaps.length - 1];
    valuePerAsset.set(a.id, last ? toNumber(last.value) : 0);
  }
  const total = data.assets.reduce((s, a) => s + (valuePerAsset.get(a.id) ?? 0), 0);
  const totalsByKind = data.assets.reduce<Record<string, number>>((acc, a) => {
    acc[a.kind] = (acc[a.kind] ?? 0) + (valuePerAsset.get(a.id) ?? 0);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formue"
        subtitle="ASK, pensjon, sparekontoer og andre verdier"
        actions={
          <button onClick={() => { setEditing(null); setOpenAsset(true); }} className="btn btn-primary">+ Ny eiendel</button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total formue" value={total} tone="positive" />
        <StatCard label="ASK" value={totalsByKind.ask ?? 0} />
        <StatCard label="Pensjon" value={totalsByKind.pension ?? 0} />
        <StatCard label="Kontanter/sparing" value={totalsByKind.cash ?? 0} />
      </div>

      {data.assets.length === 0 ? (
        <Empty
          title="Ingen eiendeler enda"
          description="Legg til ASK, pensjon, sparekontoer eller andre verdier for å bygge formuesoversikten."
          action={<button onClick={() => setOpenAsset(true)} className="btn btn-primary">Legg til</button>}
        />
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {data.assets.map((asset) => {
            const snaps = data.snapshotsByAsset[asset.id] ?? [];
            const cur = valuePerAsset.get(asset.id) ?? 0;
            const first = snaps[0];
            const change = first ? cur - toNumber(first.value) : 0;
            const pctChange = first && toNumber(first.value) !== 0 ? (change / toNumber(first.value)) * 100 : 0;
            return (
              <div key={asset.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="badge">{KIND_LABEL[asset.kind] ?? asset.kind}</span>
                    <h3 className="font-semibold text-lg mt-2">{asset.name}</h3>
                    {asset.notes && <p className="text-xs text-[color:var(--color-muted)] mt-1">{asset.notes}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-semibold num">{formatNOK(cur)}</div>
                    {first && (
                      <div className={`text-xs num ${change >= 0 ? "pos" : "neg"}`}>
                        {change >= 0 ? "+" : ""}{formatNOK(change)} ({pctChange.toFixed(1)} %)
                      </div>
                    )}
                  </div>
                </div>

                {snaps.length > 1 && (
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={snaps.map((s) => ({ date: s.snapshotDate, value: toNumber(s.value) }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a3760" />
                      <XAxis dataKey="date" stroke="#9aa6c7" tick={{ fontSize: 10 }} />
                      <YAxis stroke="#9aa6c7" tick={{ fontSize: 10 }} tickFormatter={(v) => formatNOK(v)} width={70} />
                      <Tooltip contentStyle={{ background: "#161f3d", border: "1px solid #2a3760", borderRadius: 8 }} formatter={(v: any) => formatNOK(v)} />
                      <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}

                <div className="mt-3 flex gap-2 flex-wrap">
                  <button onClick={() => setSnapshotFor(asset)} className="btn btn-primary text-xs">+ Verdi i dag</button>
                  <button onClick={() => { setEditing(asset); setOpenAsset(true); }} className="btn btn-ghost text-xs">Endre</button>
                </div>

                {snaps.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-[color:var(--color-muted)] cursor-pointer">Historikk ({snaps.length} verdier)</summary>
                    <table className="table mt-2">
                      <thead><tr><th>Dato</th><th className="text-right">Verdi</th><th></th></tr></thead>
                      <tbody>
                        {[...snaps].reverse().map((s) => (
                          <tr key={s.id}>
                            <td>{s.snapshotDate}</td>
                            <td className="text-right num">{formatNOK(s.value)}</td>
                            <td className="text-right">
                              <button onClick={async () => {
                                if (!confirm("Slette dette datapunktet?")) return;
                                await deleteAssetSnapshot({ data: { dashboardId, id: s.id } });
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

      <AssetModal
        open={openAsset}
        onClose={() => setOpenAsset(false)}
        dashboardId={dashboardId}
        asset={editing}
        onSaved={async () => { setOpenAsset(false); await refetch(); }}
      />

      <SnapshotModal
        open={snapshotFor !== null}
        onClose={() => setSnapshotFor(null)}
        dashboardId={dashboardId}
        asset={snapshotFor}
        onSaved={async () => { setSnapshotFor(null); await refetch(); }}
      />
    </div>
  );
}

function AssetModal({
  open, onClose, dashboardId, asset, onSaved,
}: {
  open: boolean; onClose: () => void; dashboardId: string; asset: Asset | null; onSaved: () => void;
}) {
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<"ask" | "pension" | "cash" | "other">("ask");
  const [notes, setNotes] = React.useState("");
  const [initialValue, setInitialValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(asset?.name ?? "");
      setKind((asset?.kind as "ask" | "pension" | "cash" | "other") ?? "ask");
      setNotes(asset?.notes ?? "");
      setInitialValue("");
    }
  }, [open, asset]);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (asset) {
        await updateAsset({ data: { dashboardId, id: asset.id, name: name.trim(), kind, notes: notes.trim() || null } });
      } else {
        await createAsset({
          data: {
            dashboardId,
            name: name.trim(),
            kind,
            notes: notes.trim() || null,
            initialValue: initialValue ? toNumber(initialValue) : undefined,
          },
        });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!asset) return;
    if (!confirm(`Slette "${asset.name}" og all historikk?`)) return;
    setBusy(true);
    try {
      await deleteAsset({ data: { dashboardId, id: asset.id } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? "Endre eiendel" : "Ny eiendel"}
      footer={
        <>
          {asset && <button onClick={remove} className="btn btn-danger mr-auto" disabled={busy}>Slett</button>}
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !name.trim()}>Lagre</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Navn</label>
          <input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="F.eks. Nordnet ASK" />
        </div>
        <div>
          <label className="label">Type</label>
          <select className="input" value={kind} onChange={(e) => setKind(e.target.value as never)}>
            <option value="ask">ASK</option>
            <option value="pension">Pensjon</option>
            <option value="cash">Kontanter / sparekonto</option>
            <option value="other">Annet</option>
          </select>
        </div>
        {!asset && (
          <div>
            <label className="label">Nåværende verdi (valgfritt)</label>
            <input className="input num" type="number" value={initialValue} onChange={(e) => setInitialValue(e.target.value)} placeholder="0" />
          </div>
        )}
        <div>
          <label className="label">Notat (valgfritt)</label>
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </Modal>
  );
}

function SnapshotModal({
  open, onClose, dashboardId, asset, onSaved,
}: {
  open: boolean; onClose: () => void; dashboardId: string; asset: Asset | null; onSaved: () => void;
}) {
  const [date, setDate] = React.useState(todayISO());
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setDate(todayISO());
      setValue("");
    }
  }, [open]);

  async function save() {
    if (!asset || !value) return;
    setBusy(true);
    try {
      await upsertAssetSnapshot({ data: { dashboardId, assetId: asset.id, snapshotDate: date, value: toNumber(value) } });
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? `Ny verdi: ${asset.name}` : ""}
      footer={
        <>
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>Avbryt</button>
          <button onClick={save} className="btn btn-primary" disabled={busy || !value}>Lagre</button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Dato</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Verdi (NOK)</label>
          <input autoFocus type="number" className="input num" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <p className="text-xs text-[color:var(--color-muted)]">Eksisterende datapunkt på samme dato blir overskrevet.</p>
      </div>
    </Modal>
  );
}
