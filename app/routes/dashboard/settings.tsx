import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { PageHeader } from "../../components/ui";
import { deleteDashboard, exportDashboard, getDashboard, updateDashboard } from "../../server/api";
import { useDashboardId, useServerData } from "../../lib/hooks";
import { clearStoredDashboardId } from "../../lib/auth";

export const Route = createFileRoute("/dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const dashboardId = useDashboardId();
  const navigate = useNavigate();
  const { data, refetch, loading } = useServerData(
    async () => (dashboardId ? getDashboard({ data: { dashboardId } }) : Promise.resolve(null)),
    [dashboardId],
  );
  const [name, setName] = React.useState("");
  const [savingName, setSavingName] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (data) setName(data.name);
  }, [data]);

  if (loading || !data || !dashboardId) return <div className="text-[color:var(--color-muted)]">Laster…</div>;
  const id = dashboardId;

  async function saveName() {
    if (!name.trim() || name.trim() === data?.name) return;
    setSavingName(true);
    try {
      await updateDashboard({ data: { dashboardId: id, name: name.trim() } });
      await refetch();
    } finally {
      setSavingName(false);
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      const dump = await exportDashboard({ data: { dashboardId: id } });
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `okonomi-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function doDelete() {
    const confirm1 = prompt("Dette sletter ALT permanent. Skriv 'SLETT' for å bekrefte:");
    if (confirm1 !== "SLETT") return;
    await deleteDashboard({ data: { dashboardId: id } });
    clearStoredDashboardId();
    navigate({ to: "/" });
  }

  async function copyId() {
    await navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Innstillinger" />

      <div className="card space-y-3">
        <h3 className="font-semibold">Dashboard-ID</h3>
        <p className="text-sm text-[color:var(--color-muted)]">
          Denne ID-en er din eneste nøkkel. Lagre den et trygt sted — det finnes ingen recovery.
        </p>
        <div className="card-soft font-mono text-sm break-all">{id}</div>
        <button onClick={copyId} className="btn btn-ghost text-xs">{copied ? "✓ Kopiert" : "Kopier ID"}</button>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Navn</h3>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <button onClick={saveName} disabled={savingName || !name.trim() || name === data.name} className="btn btn-primary">
            {savingName ? "Lagrer…" : "Lagre navn"}
          </button>
        </div>
      </div>

      <div className="card space-y-3">
        <h3 className="font-semibold">Eksporter data</h3>
        <p className="text-sm text-[color:var(--color-muted)]">
          Last ned alle dataene som JSON. God idé å gjøre dette med jevne mellomrom som backup.
        </p>
        <button onClick={doExport} disabled={exporting} className="btn btn-primary">
          {exporting ? "Eksporterer…" : "Last ned JSON"}
        </button>
      </div>

      <div className="card space-y-3 border-red-900/50">
        <h3 className="font-semibold text-red-400">Faresone</h3>
        <p className="text-sm text-[color:var(--color-muted)]">
          Slett hele dashboardet og alle dataene permanent. Kan ikke angres.
        </p>
        <button onClick={doDelete} className="btn btn-danger">Slett dashboard for alltid</button>
      </div>
    </div>
  );
}
