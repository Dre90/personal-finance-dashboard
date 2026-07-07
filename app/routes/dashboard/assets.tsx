import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import {
  Empty,
  LoadingPlaceholder,
  Modal,
  PageHeader,
  StatCard,
  TabPanel,
  Tabs,
} from "../../components/ui";
import { MoneyAreaChart, MoneyLineChart } from "../../components/charts";
import { SnapshotModal } from "../../components/SnapshotModal";
import {
  createAsset,
  deleteAsset,
  deleteAssetSnapshot,
  listAssets,
  updateAsset,
  upsertAssetSnapshot,
} from "../../server/api";
import { useDashboard } from "../../lib/dashboard-context";
import { invalidateQueries, useMutation, useQuery } from "../../lib/query";
import { useToast } from "../../components/Toaster";
import { useFormState } from "../../lib/forms";
import { ASSET_KIND_COLOR, FLOW_COLORS } from "../../lib/colors";
import { ASSET_KIND_LABEL, ASSET_KINDS, type AssetKind } from "../../lib/enums";
import { buildStackedSeries } from "../../lib/assets";
import { formatNOK, toNumber } from "../../lib/utils";
import type { Asset, AssetSnapshot } from "../../../db/schema";

export const Route = createFileRoute("/dashboard/assets")({
  component: AssetsPage,
});

function AssetsPage() {
  const { id: dashboardId } = useDashboard();
  const toast = useToast();
  const [openAsset, setOpenAsset] = React.useState(false);
  const [editing, setEditing] = React.useState<Asset | null>(null);
  const [snapshotFor, setSnapshotFor] = React.useState<Asset | null>(null);
  const [tab, setTab] = React.useState<"overview" | "ask" | "pension">("overview");
  const [newKind, setNewKind] = React.useState<AssetKind>("ask");

  const { data, isInitialLoading, refetch } = useQuery({
    key: ["assets", dashboardId],
    fn: () => listAssets({ data: { dashboardId } }),
  });

  const snapshotMutation = useMutation({
    fn: (input: { assetId: number; snapshotDate: string; value: number }) =>
      upsertAssetSnapshot({ data: { dashboardId, ...input } }),
    onSuccess: () => {
      void refetch();
      invalidateQueries(["summary", dashboardId]);
      toast.push("Verdi lagret", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteSnapshotMutation = useMutation({
    fn: (snapshotId: number) => deleteAssetSnapshot({ data: { dashboardId, id: snapshotId } }),
    onSuccess: () => {
      void refetch();
      invalidateQueries(["summary", dashboardId]);
      toast.push("Datapunkt slettet", "success");
    },
    onError: (e) => toast.push(e.message, "error"),
  });

  if (isInitialLoading || !data) return <LoadingPlaceholder />;

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

  const askAssets = data.assets.filter((a) => a.kind === "ask");
  const pensionAssets = data.assets.filter((a) => a.kind === "pension");
  const otherAssets = data.assets.filter((a) => a.kind !== "ask" && a.kind !== "pension");

  const handleEdit = (asset: Asset) => {
    setEditing(asset);
    setOpenAsset(true);
  };
  const handleDeleteSnapshot = (id: number) => {
    if (confirm("Slette dette datapunktet?")) {
      void deleteSnapshotMutation.mutate(id);
    }
  };
  const openNew = (kind: AssetKind) => {
    setEditing(null);
    setNewKind(kind);
    setOpenAsset(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formue"
        subtitle="ASK, pensjon, sparekontoer og andre verdier"
        actions={
          <button
            onClick={() => openNew(tab === "pension" ? "pension" : "ask")}
            className="btn btn-primary"
          >
            + Ny eiendel
          </button>
        }
      />

      <Tabs
        value={tab}
        onChange={setTab}
        idPrefix="assets"
        tabs={[
          { value: "overview", label: "Oversikt" },
          { value: "ask", label: "ASK" },
          { value: "pension", label: "Pensjon" },
        ]}
      />

      {tab === "overview" && (
        <TabPanel value="overview" idPrefix="assets">
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total formue" value={total} tone="positive" />
              <button
                type="button"
                onClick={() => setTab("ask")}
                className="text-left w-full cursor-pointer"
              >
                <StatCard label="ASK" value={totalsByKind.ask ?? 0} hint="Vis detaljer →" />
              </button>
              <button
                type="button"
                onClick={() => setTab("pension")}
                className="text-left w-full cursor-pointer"
              >
                <StatCard label="Pensjon" value={totalsByKind.pension ?? 0} hint="Vis detaljer →" />
              </button>
              <StatCard label="Kontanter/sparing" value={totalsByKind.cash ?? 0} />
            </div>

            {data.assets.length === 0 ? (
              <Empty
                title="Ingen eiendeler enda"
                description="Legg til ASK, pensjon, sparekontoer eller andre verdier for å bygge formuesoversikten."
                action={
                  <button onClick={() => openNew("ask")} className="btn btn-primary">
                    Legg til
                  </button>
                }
              />
            ) : (
              otherAssets.length > 0 && (
                <div className="grid lg:grid-cols-2 gap-4">
                  {otherAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      snaps={data.snapshotsByAsset[asset.id] ?? []}
                      value={valuePerAsset.get(asset.id) ?? 0}
                      color={ASSET_KIND_COLOR[asset.kind as AssetKind] ?? FLOW_COLORS.savings}
                      onSnapshot={() => setSnapshotFor(asset)}
                      onEdit={() => handleEdit(asset)}
                      onDeleteSnapshot={handleDeleteSnapshot}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        </TabPanel>
      )}

      {tab === "ask" && (
        <TabPanel value="ask" idPrefix="assets">
          {askAssets.length > 0 ? (
            <AssetGroupSection
              title="ASK"
              subtitle="Samlet utvikling for aksjesparekontoen din"
              assets={askAssets}
              snapshotsByAsset={data.snapshotsByAsset}
              valuePerAsset={valuePerAsset}
              onSnapshot={setSnapshotFor}
              onEdit={handleEdit}
              onDeleteSnapshot={handleDeleteSnapshot}
            />
          ) : (
            <Empty
              title="Ingen ASK-kontoer enda"
              description="Legg til f.eks. Aksjer og Fond for å følge utviklingen hver for seg og samlet."
              action={
                <button onClick={() => openNew("ask")} className="btn btn-primary">
                  Legg til ASK-konto
                </button>
              }
            />
          )}
        </TabPanel>
      )}

      {tab === "pension" && (
        <TabPanel value="pension" idPrefix="assets">
          {pensionAssets.length > 0 ? (
            <AssetGroupSection
              title="Pensjon"
              subtitle="Samlet utvikling for pensjonskontoene dine"
              assets={pensionAssets}
              snapshotsByAsset={data.snapshotsByAsset}
              valuePerAsset={valuePerAsset}
              onSnapshot={setSnapshotFor}
              onEdit={handleEdit}
              onDeleteSnapshot={handleDeleteSnapshot}
            />
          ) : (
            <Empty
              title="Ingen pensjonskontoer enda"
              description="Legg til f.eks. Egen pensjonskonto, IPS og Pensjonssparekonto."
              action={
                <button onClick={() => openNew("pension")} className="btn btn-primary">
                  Legg til pensjonskonto
                </button>
              }
            />
          )}
        </TabPanel>
      )}

      <AssetModal
        open={openAsset}
        onClose={() => setOpenAsset(false)}
        dashboardId={dashboardId}
        asset={editing}
        defaultKind={newKind}
        onSaved={async (msg) => {
          setOpenAsset(false);
          invalidateQueries(["summary", dashboardId]);
          await refetch();
          toast.push(msg, "success");
        }}
      />

      <SnapshotModal
        open={snapshotFor !== null}
        onClose={() => setSnapshotFor(null)}
        title={snapshotFor ? `Ny verdi: ${snapshotFor.name}` : ""}
        valueLabel="Verdi (NOK)"
        helperText="Eksisterende datapunkt på samme dato blir overskrevet."
        onSubmit={async ({ snapshotDate, value }) => {
          if (!snapshotFor) return;
          await snapshotMutation.mutate({ assetId: snapshotFor.id, snapshotDate, value });
          setSnapshotFor(null);
        }}
      />
    </div>
  );
}

function AssetCard({
  asset,
  snaps,
  value,
  color,
  showKindBadge = true,
  onSnapshot,
  onEdit,
  onDeleteSnapshot,
}: {
  asset: Asset;
  snaps: AssetSnapshot[];
  value: number;
  color: string;
  showKindBadge?: boolean;
  onSnapshot: () => void;
  onEdit: () => void;
  onDeleteSnapshot: (id: number) => void;
}) {
  const first = snaps[0];
  const change = first ? value - toNumber(first.value) : 0;
  const pctChange =
    first && toNumber(first.value) !== 0 ? (change / toNumber(first.value)) * 100 : 0;
  return (
    <div className="card">
      <div className="flex items-start justify-between">
        <div>
          {showKindBadge ? (
            <span className="badge">{ASSET_KIND_LABEL[asset.kind as AssetKind] ?? asset.kind}</span>
          ) : (
            <span
              className="inline-block w-2.5 h-2.5 rounded-full align-middle"
              style={{ background: color }}
            />
          )}
          <h3 className="font-semibold text-lg mt-2">{asset.name}</h3>
          {asset.notes && <p className="text-xs text-muted mt-1">{asset.notes}</p>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold num">{formatNOK(value)}</div>
          {first && (
            <div className={`text-xs num ${change >= 0 ? "pos" : "neg"}`}>
              {change >= 0 ? "+" : ""}
              {formatNOK(change)} ({pctChange.toFixed(1)} %)
            </div>
          )}
        </div>
      </div>

      {snaps.length > 1 && (
        <MoneyLineChart
          data={snaps.map((s) => ({ date: s.snapshotDate, value: toNumber(s.value) }))}
          xKey="date"
          height={140}
          yWidth={70}
          series={[{ dataKey: "value", color, strokeWidth: 2 }]}
        />
      )}

      <div className="mt-3 flex gap-2 flex-wrap">
        <button onClick={onSnapshot} className="btn btn-primary text-xs">
          + Verdi i dag
        </button>
        <button onClick={onEdit} className="btn btn-ghost text-xs">
          Endre
        </button>
      </div>

      {snaps.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-muted cursor-pointer">
            Historikk ({snaps.length} verdier)
          </summary>
          <table className="table mt-2">
            <thead>
              <tr>
                <th>Dato</th>
                <th className="text-right">Verdi</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {[...snaps].reverse().map((s) => (
                <tr key={s.id}>
                  <td>{s.snapshotDate}</td>
                  <td className="text-right num">{formatNOK(s.value)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => onDeleteSnapshot(s.id)}
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
}

function AssetGroupSection({
  title,
  subtitle,
  assets,
  snapshotsByAsset,
  valuePerAsset,
  onSnapshot,
  onEdit,
  onDeleteSnapshot,
}: {
  title: string;
  subtitle: string;
  assets: Asset[];
  snapshotsByAsset: Record<number, AssetSnapshot[]>;
  valuePerAsset: Map<number, number>;
  onSnapshot: (asset: Asset) => void;
  onEdit: (asset: Asset) => void;
  onDeleteSnapshot: (id: number) => void;
}) {
  const { rows, series } = buildStackedSeries(assets, snapshotsByAsset);
  const colorByAsset = new Map(series.map((s) => [s.assetId, s.color]));

  const total = assets.reduce((s, a) => s + (valuePerAsset.get(a.id) ?? 0), 0);
  const sumRow = (row: Record<string, number | string> | undefined) =>
    row ? series.reduce((s, ser) => s + Number(row[ser.key] ?? 0), 0) : 0;
  const firstTotal = sumRow(rows[0]);
  const change = total - firstTotal;
  const pctChange = firstTotal !== 0 ? (change / firstTotal) * 100 : 0;

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-xl">{title}</h2>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold num">{formatNOK(total)}</div>
          {rows.length > 1 && (
            <div className={`text-xs num ${change >= 0 ? "pos" : "neg"}`}>
              {change >= 0 ? "+" : ""}
              {formatNOK(change)} ({pctChange.toFixed(1)} %)
            </div>
          )}
        </div>
      </div>

      {rows.length > 1 && (
        <div className="card">
          <MoneyAreaChart
            data={rows}
            xKey="date"
            height={240}
            yWidth={70}
            series={series.map((s) => ({ dataKey: s.key, name: s.name, color: s.color }))}
          />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {assets.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            snaps={snapshotsByAsset[asset.id] ?? []}
            value={valuePerAsset.get(asset.id) ?? 0}
            color={colorByAsset.get(asset.id) ?? FLOW_COLORS.savings}
            showKindBadge={false}
            onSnapshot={() => onSnapshot(asset)}
            onEdit={() => onEdit(asset)}
            onDeleteSnapshot={onDeleteSnapshot}
          />
        ))}
      </div>
    </section>
  );
}

function AssetModal({
  open,
  onClose,
  dashboardId,
  asset,
  defaultKind = "ask",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  asset: Asset | null;
  defaultKind?: AssetKind;
  onSaved: (message: string) => void;
}) {
  const form = useFormState<{
    name: string;
    kind: AssetKind;
    notes: string;
    initialValue: string;
  }>(
    {
      name: asset?.name ?? "",
      kind: (asset?.kind as AssetKind | undefined) ?? defaultKind,
      notes: asset?.notes ?? "",
      initialValue: "",
    },
    { resetWhen: open ? (asset ?? `new-${defaultKind}`) : null },
  );
  const toast = useToast();

  const saveMutation = useMutation({
    fn: async () => {
      const name = form.values.name.trim();
      const notes = form.values.notes.trim() || null;
      if (asset) {
        await updateAsset({
          data: { dashboardId, id: asset.id, name, kind: form.values.kind, notes },
        });
        return "Eiendel oppdatert";
      }
      await createAsset({
        data: {
          dashboardId,
          name,
          kind: form.values.kind,
          notes,
          initialValue: form.values.initialValue ? toNumber(form.values.initialValue) : undefined,
        },
      });
      return "Eiendel opprettet";
    },
    onSuccess: (msg) => onSaved(msg),
    onError: (e) => toast.push(e.message, "error"),
  });

  const deleteMutation = useMutation({
    fn: async () => {
      if (!asset) throw new Error("Ingen eiendel");
      await deleteAsset({ data: { dashboardId, id: asset.id } });
    },
    onSuccess: () => onSaved("Eiendel slettet"),
    onError: (e) => toast.push(e.message, "error"),
  });

  const busy = saveMutation.loading || deleteMutation.loading;
  const canSave = !!form.values.name.trim();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? "Endre eiendel" : "Ny eiendel"}
      footer={
        <>
          {asset && (
            <button
              onClick={() => {
                if (confirm(`Slette "${asset.name}" og all historikk?`)) {
                  void deleteMutation.mutate(undefined);
                }
              }}
              className="btn btn-danger mr-auto"
              disabled={busy}
            >
              Slett
            </button>
          )}
          <button onClick={onClose} className="btn btn-ghost" disabled={busy}>
            Avbryt
          </button>
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
            placeholder="F.eks. Nordnet ASK"
          />
        </div>
        <div>
          <label className="label">Type</label>
          <select
            className="input"
            value={form.values.kind}
            onChange={form.setField("kind", (raw) => raw as AssetKind)}
          >
            {ASSET_KINDS.map((k) => (
              <option key={k} value={k}>
                {ASSET_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        {!asset && (
          <div>
            <label className="label">Nåværende verdi (valgfritt)</label>
            <input
              className="input num"
              type="number"
              value={form.values.initialValue}
              onChange={form.setField("initialValue")}
              placeholder="0"
            />
          </div>
        )}
        <div>
          <label className="label">Notat (valgfritt)</label>
          <input className="input" value={form.values.notes} onChange={form.setField("notes")} />
        </div>
      </div>
    </Modal>
  );
}
